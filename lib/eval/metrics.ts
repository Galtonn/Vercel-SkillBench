import { countClassifications } from "./classify";
import {
  CONFIG_LABELS,
  type ConfigId,
  type ConfigMetricsRecord,
  type EvalRun,
  type EvaluationMetrics,
  type TriggerMetrics,
} from "./types";

/**
 * Aggregation over real run data. Every number here is derived from `EvalRun`
 * records; there are no defaults that stand in for missing measurements. When a
 * quantity cannot be computed (no runs, no baseline to compare against) the
 * result is `null` and the UI renders a dash.
 */

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentage(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return round1((part / whole) * 100);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

/** Runs that produced a scored response. Errored runs are excluded from rates. */
function scoredRuns(runs: EvalRun[]) {
  return runs.filter((run) => run.status === "completed");
}

export function computeConfigMetrics(
  configId: ConfigId,
  runs: EvalRun[],
): ConfigMetricsRecord {
  const configRuns = runs.filter((run) => run.configId === configId);
  const scored = scoredRuns(configRuns);
  const errored = configRuns.length - scored.length;

  const successes = scored.filter((run) => run.success).length;

  let triggerRate: number | null = null;
  let triggerRateBasis: ConfigMetricsRecord["triggerRateBasis"] = "not-applicable";

  if (configId === "skill") {
    const relevant = scored.filter((run) => run.skillRelevant);
    triggerRate = percentage(
      relevant.filter((run) => run.skillInvoked).length,
      relevant.length,
    );
    triggerRateBasis = "measured";
  } else if (configId === "explicit" || configId === "agents-md") {
    // The instructions are delivered unconditionally in these conditions, so the
    // trigger rate is 100 by construction. It is recorded, not measured.
    triggerRate = scored.length > 0 ? 100 : null;
    triggerRateBasis = "by-construction";
  }

  return {
    id: configId,
    label: CONFIG_LABELS[configId],
    runs: configRuns.length,
    erroredRuns: errored,
    successRate: percentage(successes, scored.length),
    avgScore:
      scored.length === 0 ? null : round1(mean(scored.map((run) => run.score)) * 100),
    triggerRate,
    triggerRateBasis,
    avgInputTokens: Math.round(mean(scored.map((run) => run.inputTokens))),
    avgOutputTokens: Math.round(mean(scored.map((run) => run.outputTokens))),
    avgTotalTokens: Math.round(
      mean(scored.map((run) => run.inputTokens + run.outputTokens)),
    ),
    avgRuntimeMs: Math.round(mean(scored.map((run) => run.latencyMs))),
  };
}

export function computeTriggerMetrics(runs: EvalRun[]): TriggerMetrics | null {
  const skillRuns = scoredRuns(runs.filter((run) => run.configId === "skill"));
  if (skillRuns.length === 0) return null;

  const relevant = skillRuns.filter((run) => run.skillRelevant);
  const irrelevant = skillRuns.filter((run) => !run.skillRelevant);

  const invoked = relevant.filter((run) => run.skillInvoked).length;
  const falsePositives = irrelevant.filter((run) => run.skillInvoked).length;

  return {
    expected: relevant.length,
    invoked,
    missed: relevant.length - invoked,
    irrelevant: irrelevant.length,
    falsePositives,
    triggerRate: percentage(invoked, relevant.length),
    falsePositiveRate: percentage(falsePositives, irrelevant.length),
  };
}

function difference(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return round1(a - b);
}

export function computeMetrics(input: {
  runs: EvalRun[];
  selectedConfigs: ConfigId[];
  wallClockMs: number | null;
}): EvaluationMetrics {
  const { runs, selectedConfigs } = input;

  const configs = selectedConfigs.map((configId) =>
    computeConfigMetrics(configId, runs),
  );
  const byId = new Map(configs.map((config) => [config.id, config]));

  const baseline = byId.get("baseline")?.successRate ?? null;
  const skill = byId.get("skill")?.successRate ?? null;
  const explicit = byId.get("explicit")?.successRate ?? null;
  const agents = byId.get("agents-md")?.successRate ?? null;

  const skillRuns = scoredRuns(runs.filter((run) => run.configId === "skill"));
  const invokedRuns = skillRuns.filter((run) => run.skillInvoked);
  const notInvokedRuns = skillRuns.filter((run) => !run.skillInvoked);

  const classificationCounts = countClassifications(
    skillRuns.map((run) => run.classification),
  );

  const allScored = scoredRuns(runs);

  return {
    configs,
    trigger: computeTriggerMetrics(runs),
    effectiveness: difference(skill, baseline),
    explicitImprovement: difference(explicit, baseline),
    agentsImprovement: difference(agents, baseline),
    successWhenInvoked: percentage(
      invokedRuns.filter((run) => run.success).length,
      invokedRuns.length,
    ),
    successWhenNotInvoked: percentage(
      notInvokedRuns.filter((run) => run.success).length,
      notInvokedRuns.length,
    ),
    missedTriggerCount:
      classificationCounts.missed_trigger_failure +
      classificationCounts.missed_trigger_success,
    missedTriggerFailureCount: classificationCounts.missed_trigger_failure,
    totalRuns: runs.length,
    erroredRuns: runs.length - allScored.length,
    classificationCounts,
    avgInputTokens: Math.round(mean(allScored.map((run) => run.inputTokens))),
    avgOutputTokens: Math.round(mean(allScored.map((run) => run.outputTokens))),
    avgTotalTokens: Math.round(
      mean(allScored.map((run) => run.inputTokens + run.outputTokens)),
    ),
    avgRuntimeMs: Math.round(mean(allScored.map((run) => run.latencyMs))),
    wallClockMs: input.wallClockMs,
  };
}
