/**
 * View models for the results UI.
 *
 * These are produced exclusively by `lib/adapters/ui.ts` from a stored
 * `EvaluationRecord`. Components never compute a metric themselves, so there is
 * one place where a number can enter the UI, and it is fed by real run data.
 */

import type {
  ConfigId,
  EvalFinding,
  FindingSeverity,
  RunClassification,
  SkillProblemKind,
  BenchmarkSource,
} from "./eval/types";

export type { ConfigId, FindingSeverity, RunClassification, BenchmarkSource };

export type EvalStatus = "completed" | "running" | "failed" | "cancelled";

export type ConfigurationMetrics = {
  id: ConfigId;
  name: string;
  /** How many runs this configuration contributed. */
  runs: number;
  /** 0-100, or null when nothing was scored. */
  success: number | null;
  /** Mean scorer/judge score as 0-100. */
  avgScore: number | null;
  triggerRate: number | null;
  /** True when the trigger rate is 100 because the condition always delivers. */
  triggerRateByConstruction: boolean;
  /** Mean input + output tokens per run, as a raw token count. */
  avgTokens: number;
  /** Mean wall-clock seconds per run. */
  avgRuntime: number;
};

export type TriggerStats = {
  expected: number;
  invoked: number;
  missed: number;
  falsePositives: number;
  /** Non-relevant runs, the denominator for the false-positive rate. */
  irrelevant: number;
  rate: number | null;
  falsePositiveRate: number | null;
};

export type Finding = EvalFinding;

/** One timeline entry that actually occurred during a run. */
export type RunTimelineEntry = {
  time: string;
  event: string;
  warning?: boolean;
};

export type FailedRun = {
  id: string;
  task: string;
  taskFull: string;
  configuration: string;
  configId: ConfigId;
  result: "Failed" | "Errored";
  reason: string;
  timeline: RunTimelineEntry[];
  /** The model's final output for this run. */
  response: string;
  /** The scorer's or judge's stated reason. */
  judgeReason: string;
  scorer: "contains" | "llm_judge";
  score: number | null;
  skillApplicable: boolean;
  skillRelevant: boolean;
  skillInvoked: boolean;
  invocationReason: string | null;
  classification: RunClassification | null;
  classificationLabel: string | null;
  latencyLabel: string;
  tokenLabel: string;
  error: string | null;
};

export type EvaluationSummary = {
  id: string;
  skillPath: string;
  skillName: string;
  repo: string;
  model: string;
  status: EvalStatus;
  /** Percentage points, skill minus baseline. Null when not measurable. */
  effectiveness: number | null;
  triggerRate: number | null;
  runs: number;
  completedRuns: number;
  /** ISO timestamp. Rendered relative on the client to keep server output pure. */
  updatedAt: string;
  question: string;
  isRevision: boolean;
  benchmarkSource: BenchmarkSource;
  benchmarkSourceLabel: string;
};

export type SkillMeta = {
  name: string;
  description: string;
  sourceLabel: string;
  sourceKind: string;
  raw: string;
};

export type ImprovementView = {
  problemKind: SkillProblemKind;
  rationale: string;
  diffLines: string[];
  revisedSkillMarkdown: string;
  reevaluationId: string | null;
};

export type EvaluationDetail = EvaluationSummary & {
  verdict: string;
  verdictBadge: string;
  configs: ConfigurationMetrics[];
  comparisonNote: string;
  trigger: TriggerStats | null;
  triggerNote: string | null;
  triggerDetail: string | null;
  findings: Finding[];
  findingsError: string | null;
  failedRuns: FailedRun[];
  analysisIntro: string;
  completionSummary: string | null;
  error: string | null;
  skill: SkillMeta;
  improvement: ImprovementView | null;
  successWhenInvoked: number | null;
  successWhenNotInvoked: number | null;
  missedTriggerFailureCount: number;
  erroredRuns: number;
  taskCount: number;
  runsPerConfig: number;
  sampleWarnings: string[];
};

/** Live progress for an evaluation that has not finished. */
export type EvaluationProgressView = {
  phase: string;
  label: string;
  detail: string;
  completed: number;
  total: number;
  percent: number;
  status: EvalStatus;
  error: string | null;
};

/** Side-by-side comparison of an original skill and its revised re-evaluation. */
export type RevisionComparison = {
  originalId: string;
  revisedId: string;
  revisedStatus: EvalStatus;
  rows: {
    label: string;
    before: number | null;
    after: number | null;
    unit: "percent" | "tokens" | "count";
    /** True when a higher number is better. */
    higherIsBetter: boolean;
  }[];
  headline: string;
};
