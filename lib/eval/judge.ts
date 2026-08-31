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

You will be given a task, a list of evaluation criteria, sometimes a reference
answer, and one candidate answer. You do not know how the answer was produced.
Do not speculate about it.

Judge only whether the candidate answer satisfies the criteria. The criteria are
the ground truth: if the answer contradicts them, it fails, however plausible it
sounds. Reward answers that cite specific evidence; do not reward confident
prose that is not backed by the criteria.

When a reference answer is provided, it is one example of a correct response, not
a required form of words. Score on whether the candidate states the same
substantive facts and reaches the same conclusions. Different wording, ordering,
structure, or extra correct detail must not be penalised. A candidate that omits
or contradicts a fact from the reference answer has not satisfied it.

Respond with a single JSON object and nothing else:
{"success": boolean, "score": number between 0 and 1, "reason": "one or two sentences"}

Set "success" to true only if the answer satisfies the substantive criteria.
"score" is the fraction of criteria satisfied.`;

function buildJudgePrompt(input: {
  taskPrompt: string;
  criteria: string[];
  referenceAnswer?: string;
  response: string;
}) {
  const criteria = input.criteria
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  const reference = input.referenceAnswer?.trim()
    ? `\n\n## Reference answer (one correct response, not a template to match)\n\n${input.referenceAnswer.trim()}`
    : "";

  return `## Task given to the candidate

${input.taskPrompt}

## Evaluation criteria

${criteria}${reference}

## Candidate answer

${input.response || "(the candidate produced no answer)"}`;
}

type JudgeVerdict = { success: boolean; score: number; reason: string };

/**
 * Schema for a judge verdict.
 *
 * Every field is checked and nothing is coerced. In particular a score outside
 * 0-1 is rejected rather than clamped: a model that replies `85` meaning 85%
 * would otherwise be silently read as a perfect score, turning a formatting
 * mistake into a fabricated result. Rejecting it triggers the retry, and a
 * second failure marks the run unscored, which is the honest outcome.
 */
function validateVerdict(value: unknown): JudgeVerdict | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;

  if (typeof record.success !== "boolean") return null;
  if (typeof record.score !== "number" || !Number.isFinite(record.score)) return null;
  if (record.score < 0 || record.score > 1) return null;
  if (record.reason !== undefined && typeof record.reason !== "string") return null;

  const reason =
    typeof record.reason === "string" && record.reason.trim()
      ? record.reason.trim()
      : "No reason provided by the judge.";

  return { success: record.success, score: record.score, reason };
}

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
    const verdict = validateVerdict(parsed);
    if (verdict) return verdict;
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
  referenceAnswer?: string;
  response: string;
}): Promise<JudgeOutcome> {
  const prompt = buildJudgePrompt(input);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const stricter =
      attempt === 0
        ? ""
        : '\n\nYour previous reply did not match the required schema. Reply with ONLY the JSON object, no prose and no code fence. "success" must be a boolean, "score" must be a number between 0 and 1 inclusive (not a percentage), and "reason" must be a string.';

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
    reason: "The judge did not return a valid verdict after two attempts.",
    judgeError: "Malformed judge output.",
  };
}
