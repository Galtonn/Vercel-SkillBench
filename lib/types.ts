export type EvalStatus = "completed" | "running" | "failed";

export type ConfigId = "baseline" | "skill" | "explicit" | "agents-md";

export type ConfigurationMetrics = {
  id: ConfigId;
  name: string;
  success: number;
  buildPass: number;
  triggerRate: number | null;
  avgTokens: number;
  avgRuntime: number;
};

export type TriggerStats = {
  expected: number;
  invoked: number;
  missed: number;
  falsePositives: number;
};

export type FindingSeverity = "high" | "medium" | "low";

export type Finding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  explanation: string;
  current?: string;
  suggested?: string;
  extra?: string;
};

export type FailedRun = {
  id: string;
  runNumber: number;
  task: string;
  taskFull: string;
  configuration: string;
  configId: ConfigId;
  result: "Failed";
  reason: string;
  timeline: { time: string; event: string; warning?: boolean }[];
  why: string;
};

export type EvaluationSummary = {
  id: string;
  skillPath: string;
  skillName: string;
  repo: string;
  status: EvalStatus;
  effectiveness: number | null;
  triggerRate: number | null;
  runs: number;
  completedRuns?: number;
  updatedLabel: string;
  question: string;
};

export type EvaluationDetail = EvaluationSummary & {
  verdict: string;
  verdictBadge: string;
  configs: ConfigurationMetrics[];
  trigger: TriggerStats | null;
  triggerNote: string | null;
  findings: Finding[];
  failedRuns: FailedRun[];
  analysisIntro: string;
};

export type ImprovedMetrics = {
  success: number;
  triggerRate: number;
  buildPass: number;
  avgTokens: number;
  missed: number;
};
