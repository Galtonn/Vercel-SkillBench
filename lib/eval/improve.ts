import { buildDiffLines } from "./diff";
import type { ModelProvider } from "./provider";
import { parseSkill } from "./skill-parser";
import type {
  EvalRun,
  EvaluationMetrics,
  ResolvedSkill,
  SkillImprovement,
  SkillProblemKind,
} from "./types";

/**
 * Proposes a revised SKILL.md from the evaluation's actual failures.
 *
 * The prompt is chosen by what the data says is broken: a discovery problem gets
 * a rewrite focused on the name, description, and trigger wording; an instruction
 * problem gets a rewrite focused on the body. The result is validated as a
 * parseable SKILL.md before being stored, and is never described as an
 * improvement — only a re-evaluation can establish that.
 */

const TRIGGER_RELIABLE_PCT = 80;
const INSTRUCTION_OK_PCT = 70;

export function diagnoseProblem(metrics: EvaluationMetrics): SkillProblemKind {
  const triggerRate = metrics.trigger?.triggerRate ?? null;
  const successWhenInvoked = metrics.successWhenInvoked;

  const triggerProblem =
    triggerRate !== null && triggerRate < TRIGGER_RELIABLE_PCT;
  const instructionProblem =
    successWhenInvoked !== null && successWhenInvoked < INSTRUCTION_OK_PCT;

  if (triggerProblem && instructionProblem) return "both";
  if (triggerProblem) return "trigger";
  if (instructionProblem) return "instructions";
  return "none";
}

function focusInstruction(kind: SkillProblemKind): string {
  switch (kind) {
    case "trigger":
      return `The data shows a DISCOVERY problem: when the agent loads this skill it does well, but it often fails to load it on relevant tasks.

Focus your revision on making the skill discoverable:
- the \`name\`, if it is misleading
- the \`description\`, which is the only thing an agent sees before deciding
- explicit trigger conditions: the vocabulary and symptoms that should cause an agent to reach for this skill
- concrete examples of when to use it, and when not to

Keep the instruction body substantially intact unless a specific failure justifies changing it.`;
    case "instructions":
      return `The data shows an INSTRUCTION problem: the agent loads this skill and still fails.

Focus your revision on the instruction body:
- the order of operations, so evidence is gathered before conclusions are drawn
- steps that are missing, ambiguous, or easy to skip
- validation the agent should perform before answering
- removing guidance that led the agent to a wrong answer

Keep the description accurate but do not pad it.`;
    case "both":
      return `The data shows BOTH problems: the agent often fails to load the skill, and when it does load it, it still fails a substantial share of tasks.

Revise both the discovery surface (name, description, explicit trigger conditions) and the instruction body (order of operations, missing steps, validation).`;
    case "none":
      return `The data does not show a clear discovery or instruction problem. Make only conservative, well-supported edits — tightening trigger wording or clarifying steps that the failure data actually implicates. If there is little to fix, produce a minimally changed skill and say so in the rationale.`;
  }
}

const SYSTEM_PROMPT = `You revise Agent Skill definitions (SKILL.md files) based on measured evaluation results.

A SKILL.md is a markdown file with YAML frontmatter:

---
name: skill-name
description: One or two sentences describing when to use this skill.
---

# Title

Instructions...

Rules:
- Base every change on the failure data you are given. Do not invent problems.
- Preserve any frontmatter keys the original had, including tool restrictions.
- Preserve the parts of the instructions the data does not implicate.
- Output a complete, valid SKILL.md, not a diff and not a fragment.

Respond with a single JSON object and nothing else:
{"rationale":"2-4 sentences on what you changed and why, citing the data","skill_markdown":"the complete revised SKILL.md"}`;

function buildDataBlock(input: {
  skill: ResolvedSkill;
  metrics: EvaluationMetrics;
  runs: EvalRun[];
  problemKind: SkillProblemKind;
}) {
  const { skill, metrics, runs } = input;
  const skillRuns = runs.filter((run) => run.configId === "skill");

  const missedExamples = skillRuns
    .filter((run) => run.skillRelevant && !run.skillInvoked)
    .slice(0, 8)
    .map(
      (run) =>
        `- Task: ${run.taskName}\n  Prompt: ${truncate(run.taskPrompt, 240)}\n  Outcome: ${run.success ? "passed anyway" : "FAILED"} — ${truncate(run.judgeReason, 240)}`,
    );

  const invocationReasons = skillRuns
    .filter((run) => run.skillInvoked && run.skillInvocationReason)
    .slice(0, 8)
    .map((run) => `- [${run.taskName}] "${run.skillInvocationReason}"`);

  const failedAfterLoading = skillRuns
    .filter((run) => run.skillInvoked && !run.success)
    .slice(0, 8)
    .map(
      (run) =>
        `- Task: ${run.taskName}\n  Why it failed: ${truncate(run.judgeReason, 300)}`,
    );

  const falsePositives = skillRuns
    .filter((run) => !run.skillRelevant && run.skillInvoked)
    .slice(0, 6)
    .map(
      (run) =>
        `- Task: ${run.taskName} (skill was not needed)\n  Agent's stated reason: "${run.skillInvocationReason ?? "none"}"`,
    );

  return `${focusInstruction(input.problemKind)}

## Current SKILL.md

${skill.raw}

## Measured results

- Baseline success: ${fmt(metrics.configs.find((c) => c.id === "baseline")?.successRate ?? null)}%
- Skill success: ${fmt(metrics.configs.find((c) => c.id === "skill")?.successRate ?? null)}%
- Explicit Trigger success: ${fmt(metrics.configs.find((c) => c.id === "explicit")?.successRate ?? null)}%
- AGENTS.md success: ${fmt(metrics.configs.find((c) => c.id === "agents-md")?.successRate ?? null)}%
- Measured trigger rate: ${fmt(metrics.trigger?.triggerRate ?? null)}%
- Missed invocations on relevant tasks: ${metrics.trigger?.missed ?? 0}
- Of those, runs that failed: ${metrics.missedTriggerFailureCount}
- False-positive invocations: ${metrics.trigger?.falsePositives ?? 0} of ${metrics.trigger?.irrelevant ?? 0} non-relevant runs
- Success when loaded: ${fmt(metrics.successWhenInvoked)}%
- Success when not loaded: ${fmt(metrics.successWhenNotInvoked)}%

## Relevant tasks where the agent never loaded the skill

${missedExamples.join("\n") || "- none"}

## Reasons the agent gave when it did load the skill

${invocationReasons.join("\n") || "- none"}

## Runs that failed even after loading the skill

${failedAfterLoading.join("\n") || "- none"}

## Tasks where the skill was loaded unnecessarily

${falsePositives.join("\n") || "- none"}`;
}

function fmt(value: number | null) {
  return value === null ? "not measured" : String(value);
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

type ImprovementResponse = { rationale: string; skillMarkdown: string };

export function parseImprovement(text: string): ImprovementResponse | null {
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
    const record = parsed as Record<string, unknown>;
    const markdown =
      typeof record.skill_markdown === "string" ? record.skill_markdown : "";
    const rationale =
      typeof record.rationale === "string" ? record.rationale.trim() : "";
    if (!markdown.trim()) continue;

    return {
      rationale: rationale || "No rationale provided.",
      skillMarkdown: markdown,
    };
  }

  return null;
}

export class ImprovementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImprovementError";
  }
}

export async function generateImprovedSkill(input: {
  provider: ModelProvider;
  skill: ResolvedSkill;
  metrics: EvaluationMetrics;
  runs: EvalRun[];
}): Promise<SkillImprovement> {
  const problemKind = diagnoseProblem(input.metrics);
  const data = buildDataBlock({ ...input, problemKind });

  let lastError = "The model did not return a usable SKILL.md.";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const stricter =
      attempt === 0
        ? ""
        : "\n\nYour previous reply could not be used. Reply with ONLY the JSON object. `skill_markdown` must be a complete SKILL.md starting with a `---` frontmatter block containing `name` and `description`.";

    const result = await input.provider.generate({
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT}${stricter}` },
        { role: "user", content: data },
      ],
      temperature: 0.3,
      maxOutputTokens: 2400,
      jsonMode: true,
    });

    const parsed = parseImprovement(result.text);
    if (!parsed) {
      lastError = "The model did not return valid JSON.";
      continue;
    }

    // A revision that does not parse as a SKILL.md is not usable.
    try {
      parseSkill(parsed.skillMarkdown);
    } catch (error) {
      lastError =
        error instanceof Error
          ? `The revised skill was not a valid SKILL.md: ${error.message}`
          : "The revised skill was not a valid SKILL.md.";
      continue;
    }

    return {
      createdAt: new Date().toISOString(),
      problemKind,
      rationale: parsed.rationale,
      revisedSkillMarkdown: parsed.skillMarkdown,
      diffLines: buildDiffLines(input.skill.raw, parsed.skillMarkdown),
      reevaluationId: null,
    };
  }

  throw new ImprovementError(lastError);
}
