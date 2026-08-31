import { MAX_TASKS } from "./config";
import type { EvalTask } from "./types";

/**
 * Converts the free-text task list from the New Evaluation form into task
 * objects: one paragraph per task.
 *
 * Ad-hoc tasks have no author-supplied ground truth, so two things follow:
 * they are all judged by the LLM judge against generic criteria, and they are
 * all marked `skillRelevant: true`. Marking them relevant is the conservative
 * choice — it means a missed invocation is counted as a missed trigger rather
 * than silently ignored. Genuine false-positive measurement needs a benchmark
 * with labelled non-relevant tasks, which is what the built-in benchmark
 * provides.
 */
export function parseTasksFromText(text: string): EvalTask[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return paragraphs.slice(0, MAX_TASKS).map((prompt, index) => ({
    id: `task-${index + 1}`,
    name: deriveName(prompt),
    prompt,
    skillRelevant: true,
    expected: {
      type: "llm_judge" as const,
      criteria: [
        "The answer addresses the task that was asked, specifically and completely.",
        "The answer is grounded in the repository or context that was provided, citing concrete files, values, or code rather than generalities.",
        "The answer contains no claims that contradict the provided material.",
        "If the task asks for a change, the answer shows the change concretely.",
      ],
    },
  }));
}

function deriveName(prompt: string): string {
  const firstLine = prompt.split("\n")[0].trim();
  const withoutTrailing = firstLine.replace(/[.:;]+$/, "");
  if (withoutTrailing.length <= 52) return withoutTrailing;
  return `${withoutTrailing.slice(0, 49).trimEnd()}…`;
}

export function countJudgedTasks(tasks: EvalTask[]) {
  return tasks.filter((task) => task.expected.type === "llm_judge").length;
}
