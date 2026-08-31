import { MAX_TASKS } from "./config";
import type { EvalTask } from "./types";

/**
 * Structured authoring format for custom benchmarks.
 *
 * A `TaskDraft` is what the New Evaluation form edits and what the generator
 * produces. It is deliberately looser than `EvalTask`: fields arrive as strings
 * from textareas, criteria may be blank while the user is still typing, and the
 * whole thing has to survive a JSON round trip through the API.
 *
 * `normalizeDrafts` is the only way a draft becomes an `EvalTask`. Everything
 * downstream — scoring, classification, trigger metrics — reads the normalized
 * form, so the authoring surface can change without touching the pipeline.
 */

export type DraftScoring = "llm_judge" | "contains";

export type TaskDraft = {
  /** Stable across edits so React keys and validation messages do not jump. */
  key: string;
  name: string;
  prompt: string;
  /**
   * Whether the skill under test should help with this task. Authored, never
   * inferred: this is the ground truth for missed-trigger and false-positive
   * measurement, so guessing it from prompt wording would make those metrics
   * circular.
   */
  skillRelevant: boolean;
  scoring: DraftScoring;
  /** One criterion per line, for `llm_judge`. */
  criteria: string[];
  /** Expected substrings, for `contains`. */
  values: string[];
  containsMode: "all" | "any";
  referenceAnswer: string;
};

export function createTaskDraft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    key: newDraftKey(),
    name: "",
    prompt: "",
    skillRelevant: true,
    scoring: "llm_judge",
    criteria: [],
    values: [],
    containsMode: "all",
    referenceAnswer: "",
    ...overrides,
  };
}

let draftCounter = 0;

export function newDraftKey() {
  draftCounter += 1;
  return `draft-${Date.now().toString(36)}-${draftCounter}`;
}

/**
 * Derives a short display name from a prompt, for drafts the user has not named.
 */
export function deriveTaskName(prompt: string): string {
  const firstLine = prompt.split("\n")[0].trim();
  const withoutTrailing = firstLine.replace(/[.:;]+$/, "");
  if (withoutTrailing.length <= 52) return withoutTrailing;
  return `${withoutTrailing.slice(0, 49).trimEnd()}…`;
}

/**
 * The generic criteria applied to a judged task with no author-supplied ground
 * truth. These can only measure whether an answer is well-formed and grounded,
 * not whether it is *correct*, so anything using them is flagged by
 * `validateBenchmark` as a weak task.
 */
export const GENERIC_JUDGE_CRITERIA = [
  "The answer addresses the task that was asked, specifically and completely.",
  "The answer is grounded in the repository or context that was provided, citing concrete files, values, or code rather than generalities.",
  "The answer contains no claims that contradict the provided material.",
  "If the task asks for a change, the answer shows the change concretely.",
];

/**
 * Converts drafts into runnable tasks, dropping ones with no prompt.
 *
 * Blank criteria and values are stripped rather than rejected, because a half
 * filled row is a normal intermediate state in the editor. A judged task left
 * with no criteria falls back to the generic set so it still runs; the
 * validator is what tells the user that this is a weak benchmark.
 */
export function normalizeDrafts(drafts: TaskDraft[]): EvalTask[] {
  return drafts
    .filter((draft) => draft.prompt.trim().length > 0)
    .slice(0, MAX_TASKS)
    .map((draft, index) => {
      const prompt = draft.prompt.trim();
      const name = draft.name.trim() || deriveTaskName(prompt);

      if (draft.scoring === "contains") {
        return {
          id: `task-${index + 1}`,
          name,
          prompt,
          skillRelevant: draft.skillRelevant,
          expected: {
            type: "contains" as const,
            values: cleanLines(draft.values),
            mode: draft.containsMode,
          },
        };
      }

      const criteria = cleanLines(draft.criteria);
      const referenceAnswer = draft.referenceAnswer.trim();

      return {
        id: `task-${index + 1}`,
        name,
        prompt,
        skillRelevant: draft.skillRelevant,
        expected: {
          type: "llm_judge" as const,
          criteria: criteria.length > 0 ? criteria : GENERIC_JUDGE_CRITERIA,
          ...(referenceAnswer ? { referenceAnswer } : {}),
        },
      };
    });
}

function cleanLines(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

/** Splits a textarea's contents into one entry per non-empty line. */
export function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Seeds the structured editor from the simple one-paragraph-per-task textarea.
 *
 * Everything comes across as judged with generic criteria and marked
 * skill-relevant, which is exactly what the old freeform path did implicitly.
 * The difference is that it is now visible and editable: the relevance toggle
 * and empty criteria are shown in the editor, and the validator reports both.
 */
export function draftsFromText(text: string): TaskDraft[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, MAX_TASKS)
    .map((prompt) =>
      createTaskDraft({
        name: deriveTaskName(prompt),
        prompt,
        skillRelevant: true,
        scoring: "llm_judge",
      }),
    );
}

/** Round-trips a runnable task back into the editor, for review before a run. */
export function draftsFromTasks(tasks: EvalTask[]): TaskDraft[] {
  return tasks.map((task) =>
    createTaskDraft({
      name: task.name,
      prompt: task.prompt,
      skillRelevant: task.skillRelevant,
      scoring: task.expected.type === "contains" ? "contains" : "llm_judge",
      criteria: task.expected.type === "llm_judge" ? task.expected.criteria : [],
      values: task.expected.type === "contains" ? task.expected.values : [],
      containsMode:
        task.expected.type === "contains" ? (task.expected.mode ?? "all") : "all",
      referenceAnswer:
        task.expected.type === "llm_judge" ? (task.expected.referenceAnswer ?? "") : "",
    }),
  );
}

/**
 * Validates task objects arriving over the API. The client sends drafts, but a
 * request can be hand-made, so nothing is trusted: an entry that is not a usable
 * task is dropped rather than coerced into one with invented ground truth.
 */
export function parseTaskDrafts(value: unknown): TaskDraft[] {
  if (!Array.isArray(value)) return [];

  const drafts: TaskDraft[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;

    const prompt = asString(item.prompt).trim();
    if (!prompt) continue;

    const scoring: DraftScoring = item.scoring === "contains" ? "contains" : "llm_judge";

    drafts.push(
      createTaskDraft({
        name: asString(item.name),
        prompt,
        // Absent means relevant, matching the editor default, but an explicit
        // false must survive: it is the whole point of the structured format.
        skillRelevant: item.skillRelevant !== false,
        scoring,
        criteria: asStringList(item.criteria),
        values: asStringList(item.values),
        containsMode: item.containsMode === "any" ? "any" : "all",
        referenceAnswer: asString(item.referenceAnswer),
      }),
    );
  }
  return drafts;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}
