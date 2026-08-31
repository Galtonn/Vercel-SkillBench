import type { EvalTask } from "./types";

export type ScoreResult = {
  success: boolean;
  /** 0-1. */
  score: number;
  reason: string;
};

/**
 * Deterministic substring scoring. Case-insensitive and whitespace-normalised so
 * that "revenue-panel.tsx" matches a mention of `revenue-panel`, but otherwise
 * literal — no fuzzy matching that could quietly inflate success.
 */
export function scoreContains(
  response: string,
  values: string[],
  mode: "all" | "any",
): ScoreResult {
  const haystack = response.toLowerCase().replace(/\s+/g, " ");
  const matched: string[] = [];
  const missing: string[] = [];

  for (const value of values) {
    const needle = value.toLowerCase().replace(/\s+/g, " ");
    if (needle && haystack.includes(needle)) matched.push(value);
    else missing.push(value);
  }

  if (values.length === 0) {
    return { success: false, score: 0, reason: "No expected values configured." };
  }

  const score = matched.length / values.length;
  const success = mode === "all" ? missing.length === 0 : matched.length > 0;

  const reason = success
    ? `Response contained ${mode === "all" ? "all" : "at least one"} expected term: ${matched.join(", ")}.`
    : `Response was missing required term(s): ${missing.join(", ")}.`;

  return { success, score, reason };
}

export function isDeterministic(task: EvalTask) {
  return task.expected.type === "contains";
}
