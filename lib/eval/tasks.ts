import { draftsFromText, normalizeDrafts } from "./custom-tasks";
import type { EvalTask } from "./types";

/**
 * Converts a one-paragraph-per-task paste into task objects.
 *
 * This is the fallback for a freeform list. It cannot know which tasks the skill
 * should help with, and it cannot know the right scoring criteria, so it marks
 * every task skill-relevant and scores them against generic "well-formed answer"
 * criteria. That is the old custom-task behaviour; it is preserved so a pasted
 * list still runs, but `validateBenchmark` flags it as weak. The structured
 * editor is the path that produces real ground truth.
 */
export function parseTasksFromText(text: string): EvalTask[] {
  return normalizeDrafts(draftsFromText(text));
}

export function countJudgedTasks(tasks: EvalTask[]) {
  return tasks.filter((task) => task.expected.type === "llm_judge").length;
}
