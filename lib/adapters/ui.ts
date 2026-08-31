import { CLASSIFICATION_LABELS, type EvalRun, type EvaluationRecord } from "../eval/types";
import {
  buildAnalysisIntro,
  buildComparisonNote,
  buildCompletionSummary,
  buildTriggerDetail,
  buildTriggerNote,
  buildVerdict,
  describeFailureReason,
  formatDuration,
} from "../eval/narrative";
import type {
  ConfigurationMetrics,
  EvalStatus,
  EvaluationDetail,
  EvaluationProgressView,
  EvaluationSummary,
  FailedRun,
  RevisionComparison,
  RunTimelineEntry,
  TriggerStats,
} from "../types";

/**
 * The single boundary between stored evaluation data and the results UI.
 *
 * Anything the UI displays is either copied from a run record or produced by the
 * narrative helpers, which derive their sentences from the same metrics.
 */

export function toUiStatus(record: EvaluationRecord): EvalStatus {
  switch (record.status) {
    case "queued":
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
  }
}

function scoredRunCount(record: EvaluationRecord) {
  return record.runs.filter((run) => run.status === "completed").length;
}

export function toSummary(record: EvaluationRecord): EvaluationSummary {
  const timestamp =
    record.completedAt ?? record.progress.updatedAt ?? record.createdAt;

  return {
    id: record.id,
    skillPath: record.request.skillReference,
    skillName: record.skill.name,
    repo: record.request.repo,
    model: record.request.model,
    status: toUiStatus(record),
    effectiveness: record.metrics?.effectiveness ?? null,
    triggerRate: record.metrics?.trigger?.triggerRate ?? null,
    runs: record.progress.total,
    completedRuns: record.runs.length,
    updatedAt: timestamp,
    question: record.question,
    isRevision: record.revisionOf !== null,
  };
}

function toConfigMetrics(record: EvaluationRecord): ConfigurationMetrics[] {
  return (record.metrics?.configs ?? []).map((config) => ({
    id: config.id,
    name: config.label,
    runs: config.runs,
    success: config.successRate,
    avgScore: config.avgScore,
    triggerRate: config.triggerRate,
    triggerRateByConstruction: config.triggerRateBasis === "by-construction",
    avgTokens: config.avgTotalTokens,
    avgRuntime: Math.round(config.avgRuntimeMs / 1000),
  }));
}

function toTriggerStats(record: EvaluationRecord): TriggerStats | null {
  const trigger = record.metrics?.trigger;
  if (!trigger) return null;
  return {
    expected: trigger.expected,
    invoked: trigger.invoked,
    missed: trigger.missed,
    falsePositives: trigger.falsePositives,
    irrelevant: trigger.irrelevant,
    rate: trigger.triggerRate,
  };
}

function formatTimestamp(atMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(atMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Builds the run timeline from recorded events only. There is no synthesised
 * trajectory: if the agent read three files, three read events appear, and
 * nothing else does.
 */
function toTimeline(run: EvalRun): RunTimelineEntry[] {
  return run.events.map((event) => ({
    time: formatTimestamp(event.atMs),
    event: event.label,
    ...(event.warning ? { warning: true as const } : {}),
  }));
}

function toFailedRun(run: EvalRun): FailedRun {
  return {
    id: run.id,
    task: run.taskName,
    taskFull: run.taskPrompt,
    configuration: run.configId === "agents-md" ? "AGENTS.md" : labelFor(run.configId),
    configId: run.configId,
    result: run.status === "error" ? "Errored" : "Failed",
    reason: describeFailureReason({
      configId: run.configId,
      skillRelevant: run.skillRelevant,
      skillInvoked: run.skillInvoked,
      error: run.error,
      judgeError: run.judgeError,
    }),
    timeline: toTimeline(run),
    response: run.response,
    judgeReason: run.judgeReason,
    scorer: run.scorer,
    score: run.status === "error" && run.judgeError ? null : Math.round(run.score * 100),
    skillApplicable: run.configId === "skill",
    skillRelevant: run.skillRelevant,
    skillInvoked: run.skillInvoked,
    invocationReason: run.skillInvocationReason,
    classification: run.classification,
    classificationLabel: run.classification
      ? CLASSIFICATION_LABELS[run.classification]
      : null,
    latencyLabel: formatDuration(run.latencyMs),
    tokenLabel: `${run.inputTokens.toLocaleString()} in / ${run.outputTokens.toLocaleString()} out`,
    error: run.error,
  };
}

const CONFIG_NAME: Record<string, string> = {
  baseline: "Baseline",
  skill: "Skill",
  explicit: "Explicit Trigger",
  "agents-md": "AGENTS.md",
};

function labelFor(configId: string) {
  return CONFIG_NAME[configId] ?? configId;
}

export function toDetail(record: EvaluationRecord): EvaluationDetail {
  const metrics = record.metrics;
  const { verdict, badge } = buildVerdict(metrics);

  const failedRuns = record.runs
    .filter((run) => !run.success || run.status === "error")
    .map(toFailedRun);

  return {
    ...toSummary(record),
    verdict,
    verdictBadge: badge,
    configs: toConfigMetrics(record),
    comparisonNote: buildComparisonNote(metrics),
    trigger: toTriggerStats(record),
    triggerNote: buildTriggerNote(metrics),
    triggerDetail: buildTriggerDetail(metrics),
    findings: record.findings,
    findingsError: record.findingsError,
    failedRuns,
    analysisIntro: buildAnalysisIntro(metrics),
    completionSummary: buildCompletionSummary(metrics),
    error: record.error,
    skill: {
      name: record.skill.name,
      description: record.skill.description,
      sourceLabel: record.skill.sourceLabel,
      sourceKind: record.skill.sourceKind,
      raw: record.skill.raw,
    },
    improvement: record.improvement
      ? {
          problemKind: record.improvement.problemKind,
          rationale: record.improvement.rationale,
          diffLines: record.improvement.diffLines,
          revisedSkillMarkdown: record.improvement.revisedSkillMarkdown,
          reevaluationId: record.improvement.reevaluationId,
        }
      : null,
    successWhenInvoked: metrics?.successWhenInvoked ?? null,
    successWhenNotInvoked: metrics?.successWhenNotInvoked ?? null,
    missedTriggerFailureCount: metrics?.missedTriggerFailureCount ?? 0,
    erroredRuns: metrics?.erroredRuns ?? record.runs.length - scoredRunCount(record),
    taskCount: record.tasks.length,
    runsPerConfig: record.request.runsPerConfig,
  };
}

export function toProgressView(
  record: EvaluationRecord,
): EvaluationProgressView {
  const total = record.progress.total || 1;
  const completed = record.progress.completed;

  // Progress is the share of agent runs that have actually finished, with the
  // post-run analysis phases occupying the last stretch of the bar.
  const runShare = Math.min(1, completed / total);
  const phaseBonus =
    record.progress.phase === "analyzing"
      ? 0.04
      : record.progress.phase === "saving"
        ? 0.07
        : record.progress.phase === "done"
          ? 0.08
          : 0;

  const percent = Math.min(
    100,
    Math.round((runShare * 0.92 + phaseBonus) * 100),
  );

  return {
    phase: record.progress.phase,
    label: record.progress.label,
    detail: record.progress.detail,
    completed,
    total: record.progress.total,
    percent: record.progress.phase === "done" ? 100 : percent,
    status: toUiStatus(record),
    error: record.error,
  };
}

/**
 * Compares an evaluation with the re-evaluation of its revised skill. Returns
 * null until the re-evaluation has produced metrics, so the UI cannot claim an
 * improvement before one has been measured.
 */
export function toRevisionComparison(
  original: EvaluationRecord,
  revised: EvaluationRecord,
): RevisionComparison | null {
  const before = original.metrics;
  const after = revised.metrics;
  if (!before) return null;

  const beforeSkill = before.configs.find((config) => config.id === "skill");
  const afterSkill = after?.configs.find((config) => config.id === "skill");

  const rows: RevisionComparison["rows"] = [
    {
      label: "Task success",
      before: beforeSkill?.successRate ?? null,
      after: afterSkill?.successRate ?? null,
      unit: "percent",
      higherIsBetter: true,
    },
    {
      label: "Trigger rate",
      before: before.trigger?.triggerRate ?? null,
      after: after?.trigger?.triggerRate ?? null,
      unit: "percent",
      higherIsBetter: true,
    },
    {
      label: "Missed invocations",
      before: before.trigger?.missed ?? null,
      after: after?.trigger?.missed ?? null,
      unit: "count",
      higherIsBetter: false,
    },
    {
      label: "Avg tokens",
      before: beforeSkill?.avgTotalTokens ?? null,
      after: afterSkill?.avgTotalTokens ?? null,
      unit: "tokens",
      higherIsBetter: false,
    },
  ];

  return {
    originalId: original.id,
    revisedId: revised.id,
    revisedStatus: toUiStatus(revised),
    rows,
    headline: buildRevisionHeadline(
      beforeSkill?.successRate ?? null,
      afterSkill?.successRate ?? null,
      revised.status,
    ),
  };
}

function buildRevisionHeadline(
  before: number | null,
  after: number | null,
  status: EvaluationRecord["status"],
): string {
  if (status === "running" || status === "queued") {
    return "Re-evaluation in progress.";
  }
  if (status === "failed") {
    return "The re-evaluation failed, so the revised skill has not been measured.";
  }
  if (before === null || after === null) {
    return "The re-evaluation did not produce comparable metrics.";
  }
  const delta = Math.round((after - before) * 10) / 10;
  if (delta > 0) {
    return `The revised skill scored ${delta} pp higher on task success.`;
  }
  if (delta < 0) {
    return `The revised skill scored ${Math.abs(delta)} pp lower on task success.`;
  }
  return "The revised skill scored the same on task success.";
}
