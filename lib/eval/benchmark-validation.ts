import { GENERIC_JUDGE_CRITERIA } from "./custom-tasks";
import type { EvalTask } from "./types";

/**
 * Pre-flight check on a custom benchmark.
 *
 * Every problem here produces numbers that look valid but mean nothing — a
 * trigger rate of 100% is meaningless if every task was marked relevant, and a
 * success rate is meaningless if the judge was given no ground truth to score
 * against. None of these block a run: a developer iterating on a skill has good
 * reasons to run an incomplete benchmark. They exist so the results page is read
 * with the right amount of trust.
 */

export type BenchmarkWarningLevel = "warning" | "info";

export type BenchmarkWarning = {
  id: string;
  level: BenchmarkWarningLevel;
  message: string;
};

export type BenchmarkQuality = {
  taskCount: number;
  relevantCount: number;
  nonRelevantCount: number;
  /** Tasks with author-supplied criteria or expected values. */
  explicitCriteriaCount: number;
  referenceAnswerCount: number;
  /** Tasks that need a reference answer to be scored well: judged ones. */
  judgedCount: number;
  warnings: BenchmarkWarning[];
  /** Overall read, derived from the warnings rather than scored separately. */
  verdict: "good" | "usable" | "weak";
  verdictLabel: string;
};

/**
 * Below this, a success or trigger rate moves too much per task to compare
 * configurations. Four tasks across four configurations is 16 runs, which is
 * enough to see a pattern but not enough to trust a small difference.
 */
const MIN_INTERPRETABLE_TASKS = 4;

export function hasExplicitGroundTruth(task: EvalTask): boolean {
  if (task.expected.type === "contains") {
    return task.expected.values.length > 0;
  }
  const { criteria } = task.expected;
  if (criteria.length === 0) return false;
  // The generic fallback is not ground truth: it scores whether an answer is
  // well-formed, not whether it is right.
  return !isGenericCriteria(criteria);
}

export function isGenericCriteria(criteria: string[]): boolean {
  if (criteria.length !== GENERIC_JUDGE_CRITERIA.length) return false;
  return criteria.every((entry, index) => entry === GENERIC_JUDGE_CRITERIA[index]);
}

export type ValidateBenchmarkOptions = {
  /** Known files in the mounted fixture, if any. */
  filePaths?: string[];
  /** True when the evaluation will not mount a repository. */
  noWorkspace?: boolean;
};

/**
 * File-like tokens in a prompt: `app/settings/form.tsx` or `form.tsx`.
 * Used only to warn that a task names a file the fixture does not contain.
 */
export function extractMentionedPaths(text: string): string[] {
  const matches = text.match(/\b[\w./-]+\.(tsx|ts|jsx|js|css|json|md|html)\b/gi);
  if (!matches) return [];
  const unique: string[] = [];
  for (const match of matches) {
    const normalized = match.replace(/^\.\//, "");
    if (!unique.includes(normalized)) unique.push(normalized);
  }
  return unique;
}

function pathExists(mentioned: string, files: string[]): boolean {
  const needle = mentioned.replace(/\\/g, "/").toLowerCase();
  return files.some((file) => {
    const hay = file.replace(/\\/g, "/").toLowerCase();
    return hay === needle || hay.endsWith(`/${needle}`) || hay.endsWith(needle);
  });
}

export function validateBenchmark(
  tasks: EvalTask[],
  options: ValidateBenchmarkOptions = {},
): BenchmarkQuality {
  const warnings: BenchmarkWarning[] = [];

  const relevant = tasks.filter((task) => task.skillRelevant);
  const nonRelevant = tasks.filter((task) => !task.skillRelevant);
  const judged = tasks.filter((task) => task.expected.type === "llm_judge");

  const withCriteria = tasks.filter(hasExplicitGroundTruth);
  const withReference = judged.filter(
    (task) =>
      task.expected.type === "llm_judge" &&
      (task.expected.referenceAnswer ?? "").trim().length > 0,
  );

  if (tasks.length === 0) {
    warnings.push({
      id: "no-tasks",
      level: "warning",
      message: "This benchmark has no tasks.",
    });
  }

  if (tasks.length > 0 && tasks.length < MIN_INTERPRETABLE_TASKS) {
    warnings.push({
      id: "too-few-tasks",
      level: "warning",
      message: `Only ${countWord(tasks.length, "task")}. One task moves every rate by a large amount, so treat the results as directional rather than conclusive.`,
    });
  }

  if (tasks.length > 0 && nonRelevant.length === 0) {
    warnings.push({
      id: "all-relevant",
      level: "warning",
      message:
        "Every task is marked skill-relevant. False-positive triggering cannot be measured at all — add at least one task the skill should not be used for.",
    });
  } else if (nonRelevant.length === 1) {
    warnings.push({
      id: "one-non-relevant",
      level: "info",
      message:
        "Only one non-relevant task, so the false-positive rate can read only 0% or 100%. Add another to make it meaningful.",
    });
  }

  if (tasks.length > 0 && relevant.length === 0) {
    warnings.push({
      id: "none-relevant",
      level: "warning",
      message:
        "No task is marked skill-relevant, so the trigger rate cannot be measured. Mark the tasks the skill is supposed to help with.",
    });
  }

  const missingCriteria = tasks.filter((task) => !hasExplicitGroundTruth(task));
  if (missingCriteria.length > 0) {
    warnings.push({
      id: "missing-criteria",
      level: "warning",
      message: `${countWord(missingCriteria.length, "task")} ${missingCriteria.length === 1 ? "has" : "have"} no task-specific scoring criteria (${listNames(missingCriteria)}). Those runs are scored on whether the answer is well-formed, not on whether it is correct.`,
    });
  }

  const judgedWithoutReference = judged.filter(
    (task) =>
      task.expected.type === "llm_judge" &&
      !(task.expected.referenceAnswer ?? "").trim() &&
      hasExplicitGroundTruth(task),
  );
  if (judgedWithoutReference.length > 0) {
    warnings.push({
      id: "missing-reference",
      level: "info",
      message: `${countWord(judgedWithoutReference.length, "judged task")} ${judgedWithoutReference.length === 1 ? "has" : "have"} no reference answer. Criteria alone usually score fine, but a reference answer makes borderline responses more consistent.`,
    });
  }

  const emptyContains = tasks.filter(
    (task) => task.expected.type === "contains" && task.expected.values.length === 0,
  );
  if (emptyContains.length > 0) {
    warnings.push({
      id: "empty-contains",
      level: "warning",
      message: `${countWord(emptyContains.length, "task")} using keyword scoring ${emptyContains.length === 1 ? "has" : "have"} no expected keywords, so ${emptyContains.length === 1 ? "it" : "they"} can never pass.`,
    });
  }

  if (options.noWorkspace && tasks.length > 0) {
    warnings.push({
      id: "no-workspace",
      level: "warning",
      message:
        "No repository fixture is mounted, so the agent cannot read files. Point the evaluation at fixtures/bundle-bench or fixtures/ui-bench, or keep tasks self-contained.",
    });
  }

  const filePaths = options.filePaths ?? [];
  if (filePaths.length > 0) {
    const missing: { task: EvalTask; paths: string[] }[] = [];
    for (const task of tasks) {
      const mentioned = extractMentionedPaths(`${task.prompt} ${task.name}`);
      const absent = mentioned.filter((path) => !pathExists(path, filePaths));
      if (absent.length > 0) missing.push({ task, paths: absent });
    }
    if (missing.length > 0) {
      const preview = missing
        .slice(0, 2)
        .map((entry) => `${entry.task.name || entry.task.id} (${entry.paths.join(", ")})`)
        .join("; ");
      warnings.push({
        id: "missing-files",
        level: "warning",
        message: `${countWord(missing.length, "task")} name${missing.length === 1 ? "s" : ""} files that are not in the selected fixture: ${preview}.`,
      });
    }
  }

  const blocking = warnings.filter((warning) => warning.level === "warning");
  const verdict: BenchmarkQuality["verdict"] =
    blocking.length === 0 ? (warnings.length === 0 ? "good" : "usable") : "weak";

  return {
    taskCount: tasks.length,
    relevantCount: relevant.length,
    nonRelevantCount: nonRelevant.length,
    explicitCriteriaCount: withCriteria.length,
    referenceAnswerCount: withReference.length,
    judgedCount: judged.length,
    warnings,
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
  };
}

const VERDICT_LABELS: Record<BenchmarkQuality["verdict"], string> = {
  good: "Good coverage",
  usable: "Usable, with caveats",
  weak: "Weak benchmark",
};

function countWord(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function listNames(tasks: EvalTask[]): string {
  const names = tasks.slice(0, 3).map((task) => task.name || task.id);
  const rest = tasks.length - names.length;
  return rest > 0 ? `${names.join(", ")}, +${rest} more` : names.join(", ");
}
