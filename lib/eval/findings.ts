import type { ModelProvider } from "./provider";
import type {
  EvalFinding,
  EvalRun,
  EvaluationMetrics,
  FindingSeverity,
  ResolvedSkill,
} from "./types";

/**
 * One aggregate analysis call after an evaluation completes.
 *
 * The analyzer is given only the measured data. It is instructed not to invent
 * statistics, and its output is validated before being stored, so a bad response
 * yields no findings rather than fabricated ones.
 */

const SYSTEM_PROMPT = `You analyse the results of an agent-skill evaluation.

You will receive measured data from a completed evaluation: aggregate metrics,
skill-invocation statistics, run classifications, the reasons the agent gave when
it chose to load the skill, and the evaluator's reasons for failing specific runs.

Write 2 to 4 findings that a skill author could act on. Rules:

- Use only the numbers you are given. Never invent a statistic. If you want to
  cite a number, it must appear in the data above.
- Distinguish a discovery problem (the skill helps but the agent does not load it)
  from an instruction problem (the agent loads it and still fails).
- Be specific about what in the skill's name, description, or instructions is
  responsible.
- Do not recommend changes the data does not support.
- If the data shows the skill is working well, say so instead of manufacturing
  criticism.

Severity: "high" for something that clearly costs task success, "medium" for a
real but smaller effect, "low" for a cost or polish issue.

Respond with a single JSON object and nothing else:
{"findings":[{"severity":"high","title":"...","explanation":"..."}]}`;

function summarizeRuns(runs: EvalRun[]) {
  const skillRuns = runs.filter((run) => run.configId === "skill");

  const invocationReasons = skillRuns
    .filter((run) => run.skillInvoked && run.skillInvocationReason)
    .slice(0, 10)
    .map((run) => `- [${run.taskName}] ${run.skillInvocationReason}`);

  const missed = skillRuns
    .filter((run) => run.skillRelevant && !run.skillInvoked)
    .slice(0, 10)
    .map(
      (run) =>
        `- [${run.taskName}] ${run.success ? "passed anyway" : "FAILED"}: ${run.judgeReason}`,
    );

  const failedAfterInvoking = skillRuns
    .filter((run) => run.skillInvoked && !run.success)
    .slice(0, 10)
    .map((run) => `- [${run.taskName}] ${run.judgeReason}`);

  const falsePositives = skillRuns
    .filter((run) => !run.skillRelevant && run.skillInvoked)
    .slice(0, 6)
    .map(
      (run) =>
        `- [${run.taskName}] loaded because: ${run.skillInvocationReason ?? "no reason given"}`,
    );

  const baselineFailures = runs
    .filter((run) => run.configId === "baseline" && !run.success && run.status === "completed")
    .slice(0, 8)
    .map((run) => `- [${run.taskName}] ${run.judgeReason}`);

  return {
    invocationReasons,
    missed,
    failedAfterInvoking,
    falsePositives,
    baselineFailures,
  };
}

function buildDataBlock(input: {
  skill: ResolvedSkill;
  metrics: EvaluationMetrics;
  runs: EvalRun[];
}) {
  const { skill, metrics } = input;
  const summary = summarizeRuns(input.runs);

  const configLines = metrics.configs
    .map(
      (config) =>
        `- ${config.label}: success ${fmt(config.successRate)}%, avg score ${fmt(config.avgScore)}, trigger rate ${fmt(config.triggerRate)}% (${config.triggerRateBasis}), avg tokens ${config.avgTotalTokens}, runs ${config.runs}`,
    )
    .join("\n");

  const trigger = metrics.trigger
    ? `- Skill-relevant runs: ${metrics.trigger.expected}
- Skill loaded in those runs: ${metrics.trigger.invoked}
- Missed (relevant, not loaded): ${metrics.trigger.missed}
- Missed AND failed: ${metrics.missedTriggerFailureCount}
- Non-relevant runs: ${metrics.trigger.irrelevant}
- Loaded when not needed (false positives): ${metrics.trigger.falsePositives}
- Measured trigger rate: ${fmt(metrics.trigger.triggerRate)}%
- False-positive rate: ${fmt(metrics.trigger.falsePositiveRate)}%`
    : "- The Skill configuration did not run, so invocation was not measured.";

  const classifications = Object.entries(metrics.classificationCounts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `- ${key}: ${count}`)
    .join("\n");

  return `## Skill under test

name: ${skill.name}
description: ${skill.description}

Instructions length: ${skill.instructions.length} characters.

## Configuration results

${configLines}

## Effectiveness

- Skill vs Baseline: ${fmtPp(metrics.effectiveness)}
- Explicit Trigger vs Baseline: ${fmtPp(metrics.explicitImprovement)}
- AGENTS.md vs Baseline: ${fmtPp(metrics.agentsImprovement)}
- Success when the skill was loaded: ${fmt(metrics.successWhenInvoked)}%
- Success when the skill was not loaded: ${fmt(metrics.successWhenNotInvoked)}%

## Skill invocation

${trigger}

## Run classifications

${classifications || "- none"}

## Reasons the agent gave for loading the skill

${summary.invocationReasons.join("\n") || "- none"}

## Relevant tasks where the skill was never loaded

${summary.missed.join("\n") || "- none"}

## Runs that failed after loading the skill

${summary.failedAfterInvoking.join("\n") || "- none"}

## Skill loaded on tasks that did not need it

${summary.falsePositives.join("\n") || "- none"}

## Baseline failures, for comparison

${summary.baselineFailures.join("\n") || "- none"}`;
}

function fmt(value: number | null) {
  return value === null ? "not measured" : String(value);
}

function fmtPp(value: number | null) {
  return value === null ? "not measured" : `${value > 0 ? "+" : ""}${value} pp`;
}

function isSeverity(value: unknown): value is FindingSeverity {
  return value === "high" || value === "medium" || value === "low";
}

export function parseFindings(text: string): EvalFinding[] | null {
  if (!text?.trim()) return null;

  const candidates: string[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.push(fenced[1]);
  const braced = text.match(/\{[\s\S]*\}/);
  if (braced?.[0]) candidates.push(braced[0]);
  candidates.push(text);

  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate.trim());
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const raw = (parsed as Record<string, unknown>).findings;
    if (!Array.isArray(raw)) continue;

    const findings: EvalFinding[] = [];
    raw.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") return;
      const item = entry as Record<string, unknown>;
      const title = typeof item.title === "string" ? item.title.trim() : "";
      const explanation =
        typeof item.explanation === "string" ? item.explanation.trim() : "";
      if (!title || !explanation) return;
      findings.push({
        id: `finding-${index + 1}`,
        severity: isSeverity(item.severity) ? item.severity : "medium",
        title,
        explanation,
      });
    });

    if (findings.length > 0) return findings.slice(0, 4);
  }

  return null;
}

export async function generateFindings(input: {
  provider: ModelProvider;
  skill: ResolvedSkill;
  metrics: EvaluationMetrics;
  runs: EvalRun[];
}): Promise<{ findings: EvalFinding[]; error: string | null }> {
  const data = buildDataBlock(input);

  try {
    const result = await input.provider.generate({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: data },
      ],
      temperature: 0.2,
      maxOutputTokens: 1200,
      jsonMode: true,
    });

    const findings = parseFindings(result.text);
    if (!findings) {
      return {
        findings: [],
        error: "The analysis model did not return findings in the expected format.",
      };
    }
    return { findings, error: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { findings: [], error: detail };
  }
}
