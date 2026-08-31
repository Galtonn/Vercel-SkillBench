/**
 * Core domain types for the SkillBench evaluation engine.
 *
 * These types describe what actually happened during an evaluation. Nothing here
 * is derived from a fixture — every field is populated from a real model call,
 * a real scorer, or a real aggregation over those two.
 */

export type ConfigId = "baseline" | "skill" | "explicit" | "agents-md";

export const CONFIG_IDS: readonly ConfigId[] = [
  "baseline",
  "skill",
  "explicit",
  "agents-md",
];

export const CONFIG_LABELS: Record<ConfigId, string> = {
  baseline: "Baseline",
  skill: "Skill",
  explicit: "Explicit Trigger",
  "agents-md": "AGENTS.md",
};

/**
 * How the skill instructions reach the model in each condition. Used for the
 * docs/compare copy so the UI never has to hardcode a description.
 */
export const CONFIG_DELIVERY: Record<ConfigId, string> = {
  baseline:
    "No skill. The model gets the task and read-only repository tools only.",
  skill:
    "The model is told a skill exists (name + description) and is given a use_skill tool. It decides whether to load the instructions.",
  explicit:
    "The full skill instructions are supplied up front and the prompt states the skill is relevant to this task.",
  "agents-md":
    "The same instructions are supplied as persistent repository guidance, present for every task regardless of relevance.",
};

/* -------------------------------------------------------------------------- */
/* Skills                                                                     */
/* -------------------------------------------------------------------------- */

export type SkillSourceKind = "raw" | "local" | "github" | "revision";

export type ParsedSkill = {
  name: string;
  description: string;
  instructions: string;
};

export type ResolvedSkill = ParsedSkill & {
  /** Exactly what the user typed into the form. */
  reference: string;
  sourceKind: SkillSourceKind;
  /** Human-readable provenance, e.g. the resolved GitHub raw URL. */
  sourceLabel: string;
  /** Verbatim SKILL.md text, including frontmatter. */
  raw: string;
};

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

export type ExpectedOutcome =
  | {
      type: "contains";
      values: string[];
      /** Defaults to "all" when a task omits it. */
      mode?: "all" | "any";
    }
  | {
      type: "llm_judge";
      criteria: string[];
      /**
       * What a correct answer looks like, in prose. Given to the judge as
       * orientation, never as a string to match: a response is scored on whether
       * it contains the same facts, not the same words.
       */
      referenceAnswer?: string;
    };

export type EvalTask = {
  id: string;
  name: string;
  prompt: string;
  /**
   * Whether a correct solution genuinely benefits from the skill. Set by the
   * benchmark author, never inferred from model behaviour. This is the ground
   * truth that makes missed-trigger and false-positive measurement possible.
   */
  skillRelevant: boolean;
  expected: ExpectedOutcome;
};

/**
 * Where an evaluation's tasks came from. Recorded because a benchmark written by
 * a model is weaker evidence than one written by the skill's author, and a
 * reader of the results has no other way to tell the difference.
 */
export type BenchmarkSource = "built-in" | "ai-generated" | "user-authored";

export const BENCHMARK_SOURCE_LABELS: Record<BenchmarkSource, string> = {
  "built-in": "Built-in benchmark",
  "ai-generated": "AI-generated benchmark",
  "user-authored": "User-authored benchmark",
};

/* -------------------------------------------------------------------------- */
/* Runs                                                                       */
/* -------------------------------------------------------------------------- */

export type RunClassification =
  | "invoked_pass"
  | "invoked_fail"
  | "missed_trigger_success"
  | "missed_trigger_failure"
  | "false_positive_pass"
  | "false_positive_fail"
  | "skill_not_needed";

export const CLASSIFICATION_LABELS: Record<RunClassification, string> = {
  invoked_pass: "Skill invoked, passed",
  invoked_fail: "Skill invoked, failed",
  missed_trigger_success: "Missed trigger, passed anyway",
  missed_trigger_failure: "Missed trigger, failed",
  false_positive_pass: "Unnecessary invocation, passed",
  false_positive_fail: "Unnecessary invocation, failed",
  skill_not_needed: "Skill correctly not used",
};

/** A timeline entry for something that actually happened during a run. */
export type RunEvent = {
  /** Milliseconds since the run started. */
  atMs: number;
  label: string;
  warning?: boolean;
};

export type ToolCallRecord = {
  name: string;
  /** Short rendering of the arguments, e.g. the path that was read. */
  detail: string;
  ok: boolean;
};

export type EvalRun = {
  id: string;
  taskId: string;
  taskName: string;
  taskPrompt: string;
  configId: ConfigId;
  /** 1-based index of this repetition within the configuration. */
  attempt: number;
  status: "completed" | "error";
  response: string;
  success: boolean;
  /** 0-1. */
  score: number;
  scorer: "contains" | "llm_judge";
  /** Deterministic explanation, or the judge's reason. */
  judgeReason: string;
  judgeError: string | null;
  skillRelevant: boolean;
  skillInvoked: boolean;
  /** The `reason` argument the model passed to use_skill, when it called it. */
  skillInvocationReason: string | null;
  /** Only meaningful for the `skill` configuration. */
  classification: RunClassification | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  /** How many model calls the agent loop needed (excludes the judge call). */
  modelCalls: number;
  toolCalls: ToolCallRecord[];
  events: RunEvent[];
  error: string | null;
};

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

export type ConfigMetricsRecord = {
  id: ConfigId;
  label: string;
  runs: number;
  erroredRuns: number;
  /** 0-100, or null when the configuration produced no scored runs. */
  successRate: number | null;
  /** Mean judge/scorer score as 0-100. */
  avgScore: number | null;
  /**
   * 0-100 for configurations where invocation is measurable, null for baseline.
   * `explicit` and `agents-md` are 100 by construction — the instructions are
   * always delivered — and that is recorded, not measured.
   */
  triggerRate: number | null;
  triggerRateBasis: "measured" | "by-construction" | "not-applicable";
  avgInputTokens: number;
  avgOutputTokens: number;
  avgTotalTokens: number;
  avgRuntimeMs: number;
};

export type TriggerMetrics = {
  /** Skill-relevant runs under the `skill` configuration. */
  expected: number;
  invoked: number;
  missed: number;
  /** Non-skill-relevant runs under the `skill` configuration. */
  irrelevant: number;
  falsePositives: number;
  /** 0-100 or null when there were no relevant runs. */
  triggerRate: number | null;
  /** 0-100 or null when there were no irrelevant runs. */
  falsePositiveRate: number | null;
};

export type EvaluationMetrics = {
  configs: ConfigMetricsRecord[];
  trigger: TriggerMetrics | null;
  /** Percentage points, skill minus baseline. Null when either is missing. */
  effectiveness: number | null;
  explicitImprovement: number | null;
  agentsImprovement: number | null;
  /** 0-100 success within the `skill` configuration, split by invocation. */
  successWhenInvoked: number | null;
  successWhenNotInvoked: number | null;
  missedTriggerCount: number;
  missedTriggerFailureCount: number;
  totalRuns: number;
  erroredRuns: number;
  classificationCounts: Record<RunClassification, number>;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgTotalTokens: number;
  avgRuntimeMs: number;
  /** Wall-clock duration of the whole evaluation. */
  wallClockMs: number | null;
};

/* -------------------------------------------------------------------------- */
/* Findings and improvement                                                   */
/* -------------------------------------------------------------------------- */

export type FindingSeverity = "high" | "medium" | "low";

export type EvalFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  explanation: string;
};

export type SkillProblemKind = "trigger" | "instructions" | "both" | "none";

export type SkillImprovement = {
  createdAt: string;
  problemKind: SkillProblemKind;
  rationale: string;
  /** Full revised SKILL.md, including frontmatter. */
  revisedSkillMarkdown: string;
  diffLines: string[];
  /** Set when a re-evaluation of the revised skill has been started. */
  reevaluationId: string | null;
};

/* -------------------------------------------------------------------------- */
/* Stored evaluation                                                          */
/* -------------------------------------------------------------------------- */

export type EvaluationStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type ProgressPhase =
  | "preparing"
  | "running"
  | "analyzing"
  | "saving"
  | "done"
  | "error";

export type EvaluationProgress = {
  phase: ProgressPhase;
  /** Primary status line, e.g. "Task 3/9". */
  label: string;
  /** Secondary status line, e.g. "Running Skill...". */
  detail: string;
  /** Units of work finished. One unit is one agent run plus its scoring. */
  completed: number;
  total: number;
  updatedAt: string;
};

export type EvaluationRequest = {
  skillReference: string;
  repo: string;
  model: string;
  selectedConfigs: ConfigId[];
  runsPerConfig: number;
  /** Set when the run used a built-in benchmark instead of pasted tasks. */
  benchmarkId: string | null;
  /**
   * Provenance of the task set. Optional because evaluations saved before this
   * field existed do not carry it; read it through `benchmarkSourceOf`.
   */
  benchmarkSource?: BenchmarkSource;
  /** Read-only fixture workspace exposed to the agent, if any. */
  workspaceId: string | null;
};

/**
 * Provenance of a stored evaluation's tasks, inferring it for records written
 * before the field existed. Those predate both the generator and the structured
 * editor, so a benchmark id means built-in and anything else was pasted in.
 */
export function benchmarkSourceOf(request: EvaluationRequest): BenchmarkSource {
  if (request.benchmarkSource) return request.benchmarkSource;
  return request.benchmarkId ? "built-in" : "user-authored";
}

export type EvaluationRecord = {
  id: string;
  schemaVersion: 1;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  status: EvaluationStatus;
  error: string | null;
  progress: EvaluationProgress;
  request: EvaluationRequest;
  skill: ResolvedSkill;
  tasks: EvalTask[];
  runs: EvalRun[];
  metrics: EvaluationMetrics | null;
  findings: EvalFinding[];
  findingsError: string | null;
  improvement: SkillImprovement | null;
  /** Set when this evaluation re-runs a revised skill from another evaluation. */
  revisionOf: string | null;
  question: string;
};
