import type { ModelProvider } from "./provider";
import type { ScoreResult } from "./scorer";

/**
 * LLM judge.
 *
 * The judge receives the task, the criteria, and the candidate answer — and
 * nothing else. It is never told which configuration produced the answer, or
 * whether a skill was involved, so it cannot favour a condition.
 */

const JUDGE_SYSTEM_PROMPT = `You are a strict evaluator for a software engineering benchmark.

You will be given a task, a list of evaluation criteria, and one candidate answer.
You do not know how the answer was produced. Do not speculate about it.

Judge only whether the candidate answer satisfies the criteria. The criteria are
the ground truth: if the answer contradicts them, it fails, however plausible it
sounds. Reward answers that cite specific evidence; do not reward confident
prose that is not backed by the criteria.

Respond with a single JSON object and nothing else:
{"success": boolean, "score": number between 0 and 1, "reason": "one or two sentences"}

Set "success" to true only if the answer satisfies the substantive criteria.
"score" is the fraction of criteria satisfied.`;

function buildJudgePrompt(input: {
  taskPrompt: string;
  criteria: string[];
  response: string;
}) {
  const criteria = input.criteria
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  return `## Task given to the candidate

${input.taskPrompt}

## Evaluation criteria

${criteria}

## Candidate answer

${input.response || "(the candidate produced no answer)"}`;
}

type JudgeVerdict = { success: boolean; score: number; reason: string };

/**
 * Extracts the verdict from a model response. Tolerates a fenced code block or
 * surrounding prose, but validates every field — a malformed verdict is rejected
 * rather than coerced into a passing score.
 */
export function parseJudgeVerdict(text: string): JudgeVerdict | null {
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
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;

    const record = parsed as Record<string, unknown>;
    if (typeof record.success !== "boolean") continue;
    if (typeof record.score !== "number" || !Number.isFinite(record.score)) continue;

    const reason =
      typeof record.reason === "string" && record.reason.trim()
        ? record.reason.trim()
        : "No reason provided by the judge.";

    return {
      success: record.success,
      score: Math.min(1, Math.max(0, record.score)),
      reason,
    };
  }

  return null;
}

export type JudgeOutcome = ScoreResult & { judgeError: string | null };

/**
 * Scores one response. Retries once with stricter formatting instructions if the
 * first verdict does not parse. A judge failure marks the run as unscored rather
 * than crashing the evaluation.
 */
export async function judgeResponse(input: {
  provider: ModelProvider;
  taskPrompt: string;
  criteria: string[];
  response: string;
}): Promise<JudgeOutcome> {
  const prompt = buildJudgePrompt(input);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const stricter =
      attempt === 0
        ? ""
        : "\n\nYour previous reply was not valid JSON. Reply with ONLY the JSON object, no prose, no code fence.";

    let text: string;
    try {
      const result = await input.provider.generate({
        messages: [
          { role: "system", content: `${JUDGE_SYSTEM_PROMPT}${stricter}` },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        maxOutputTokens: 400,
        jsonMode: true,
      });
      text = result.text;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        score: 0,
        reason: "The judge call failed, so this run could not be scored.",
        judgeError: detail,
      };
    }

    const verdict = parseJudgeVerdict(text);
    if (verdict) {
      return { ...verdict, judgeError: null };
    }
  }

  return {
    success: false,
    score: 0,
    reason: "The judge did not return valid JSON after two attempts.",
    judgeError: "Malformed judge output.",
  };
}
