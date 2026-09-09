import type { ConfigMetricsRecord, EvaluationMetrics } from "./types";

/**
 * Every sentence the results UI shows about an outcome is generated here from
 * real metrics. Nothing in this module may assert an improvement that the numbers
 * do not show.
 */

/**
 * Below this many percentage points we describe a difference as not material.
 * With small task counts a single task can move success by 10 pp, so a delta
 * under this threshold is not worth a claim either way.
 */
const MATERIAL_PP = 5;

/** Above this trigger rate we call discovery reliable. */
const RELIABLE_TRIGGER_PCT = 80;

/** Below this many scored runs on skill-relevant tasks, results are directional. */
export const SMALL_RELEVANT_SCORED_RUNS = 10;

export type SampleContext = {
  taskCount: number;
  relevantTaskCount: number;
  relevantScoredRuns: number;
  nonRelevantTaskCount: number;
};

export function isSmallSample(context: SampleContext): boolean {
  return (
    context.relevantScoredRuns < SMALL_RELEVANT_SCORED_RUNS ||
    context.relevantTaskCount < 5 ||
    context.taskCount < 8
  );
}

export function buildSampleWarnings(context: SampleContext): string[] {
  const warnings: string[] = [];
  if (context.relevantScoredRuns < SMALL_RELEVANT_SCORED_RUNS) {
    warnings.push(
      "Small sample size. Treat these results as directional rather than conclusive.",
    );
  } else if (context.relevantTaskCount < 5 || context.taskCount < 8) {
    warnings.push(
      "Limited task coverage. Treat these results as directional rather than conclusive.",
    );
  }
  if (context.nonRelevantTaskCount === 1) {
    warnings.push(
      "False-positive rate is based on only one non-relevant task and is highly unstable.",
    );
  } else if (context.nonRelevantTaskCount === 0 && context.taskCount > 0) {
    warnings.push(
      "This benchmark has no non-relevant tasks, so false-positive triggering cannot be measured.",
    );
  }
  return warnings;
}

export function formatPpDelta(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded)} pp`;
}

function ppWord(value: number) {
  const abs = Math.abs(Math.round(value * 10) / 10);
  return `${abs} percentage point${abs === 1 ? "" : "s"}`;
}

/**
 * "Skill improved success by 14 percentage points." and its honest variants.
 */
export function describeDeltaVsBaseline(
  label: string,
  delta: number | null,
): string {
  if (delta === null) {
    return `${label} could not be compared to Baseline in this run.`;
  }
  if (delta >= MATERIAL_PP) {
    return `${label} improved success by ${ppWord(delta)} over Baseline.`;
  }
  if (delta <= -MATERIAL_PP) {
    return `${label} underperformed Baseline by ${ppWord(delta)}.`;
  }
  return `${label} did not materially change success in this run (${formatPpDelta(delta)}).`;
}

export type Verdict = { verdict: string; badge: string };

export function buildVerdict(
  metrics: EvaluationMetrics | null,
  sample?: SampleContext,
): Verdict {
  if (!metrics) {
    return {
      verdict: "This evaluation has not produced results yet.",
      badge: "No results",
    };
  }

  const effectiveness = metrics.effectiveness;
  const triggerRate = metrics.trigger?.triggerRate ?? null;
  const small = sample ? isSmallSample(sample) : false;
  const scored = metrics.totalRuns - metrics.erroredRuns;
  const samplePhrase = small
    ? sample && sample.taskCount > 0
      ? ` in this ${sample.taskCount}-task benchmark`
      : " in this small benchmark"
    : scored > 0
      ? ` across ${scored} scored runs`
      : "";

  if (effectiveness === null) {
    const skill = metrics.configs.find((config) => config.id === "skill");
    if (!skill) {
      return {
        verdict:
          "This run did not include the Skill configuration, so skill effectiveness was not measured.",
        badge: "Not measured",
      };
    }
    const baseline = metrics.configs.find((config) => config.id === "baseline");
    if (baseline && (baseline.successRate === null || skill.successRate === null)) {
      return {
        verdict:
          "Baseline and Skill were selected, but no scored comparison was produced.",
        badge: "No scored comparison",
      };
    }
    return {
      verdict:
        "This run did not include a Baseline configuration, so there is nothing to measure skill effectiveness against.",
      badge: "No baseline",
    };
  }

  const reliable = triggerRate !== null && triggerRate >= RELIABLE_TRIGGER_PCT;

  if (effectiveness >= MATERIAL_PP) {
    const caveat = small
      ? " Treat this as directional; the sample is too small to conclude the skill is generally useful."
      : "";
    if (triggerRate === null) {
      return {
        verdict: `The skill improves task success by ${ppWord(effectiveness)}${samplePhrase}.${caveat}`,
        badge: small ? "Useful in this small benchmark" : "Useful",
      };
    }
    if (reliable) {
      return {
        verdict: `The skill improves task success by ${ppWord(effectiveness)}${samplePhrase} and the agent triggered it in ${formatPct(triggerRate)} of relevant tasks.${caveat}`,
        badge: small
          ? "Useful in this small benchmark"
          : "Useful, reliable trigger",
      };
    }
    return {
      verdict: `The skill improves task success when invoked, but the agent only triggered it in ${formatPct(triggerRate)} of relevant tasks.${caveat}`,
      badge: small
        ? "Useful in this small benchmark"
        : "Useful, unreliable trigger",
    };
  }

  if (effectiveness <= -MATERIAL_PP) {
    if (small) {
      return {
        verdict: `Skill underperformed Baseline by ${ppWord(effectiveness)}${samplePhrase}. The sample is too small to conclude that the skill is generally harmful.`,
        badge: "Underperformed in this small benchmark",
      };
    }
    return {
      verdict: `The skill reduced task success relative to Baseline by ${ppWord(effectiveness)}${samplePhrase}.`,
      badge: "Harmful",
    };
  }

  // No material difference overall. Invocation splits are observational: tasks
  // that trigger can differ systematically from tasks that do not.
  const invoked = metrics.successWhenInvoked;
  const notInvoked = metrics.successWhenNotInvoked;
  if (
    invoked !== null &&
    notInvoked !== null &&
    invoked - notInvoked >= MATERIAL_PP &&
    triggerRate !== null &&
    !reliable
  ) {
    return {
      verdict: `Overall success matched Baseline. Runs that loaded the skill succeeded ${formatPct(invoked)} of the time versus ${formatPct(notInvoked)} when it was not loaded, but that observational split does not prove loading caused the difference.`,
      badge: "Invocation-associated gap",
    };
  }

  return {
    verdict:
      "The skill did not meaningfully improve task success in this benchmark.",
    badge: "No measurable effect",
  };
}

function formatPct(value: number) {
  return `${Math.round(value)}%`;
}

/**
 * Replaces the old "Skill beats baseline by a wide margin" copy under the
 * comparison table with a description of what actually happened.
 */
export function buildComparisonNote(metrics: EvaluationMetrics | null): string {
  if (!metrics) return "No runs have completed yet.";

  const scored = metrics.configs.filter((config) => config.successRate !== null);
  if (scored.length === 0) return "No configuration produced a scored run.";
  if (scored.length === 1) {
    const only = scored[0];
    return `Only ${only.label} ran, at ${formatPct(only.successRate!)} success. Add a second configuration to compare delivery strategies.`;
  }

  const best = scored.reduce((leader, config) =>
    config.successRate! > leader.successRate! ? config : leader,
  );
  const tied = scored.filter(
    (config) => Math.abs(config.successRate! - best.successRate!) < 0.05,
  );

  const parts: string[] = [];

  if (tied.length > 1) {
    parts.push(
      `${tied.map((config) => config.label).join(" and ")} tied for the highest success at ${formatPct(best.successRate!)}.`,
    );
  } else {
    parts.push(
      `${best.label} produced the highest success at ${formatPct(best.successRate!)}.`,
    );
  }

  if (metrics.effectiveness !== null) {
    parts.push(describeDeltaVsBaseline("Skill", metrics.effectiveness));
  }
  if (metrics.explicitImprovement !== null) {
    parts.push(describeDeltaVsBaseline("Explicit Trigger", metrics.explicitImprovement));
  }
  if (metrics.agentsImprovement !== null) {
    parts.push(describeDeltaVsBaseline("AGENTS.md", metrics.agentsImprovement));
  }

  return parts.join(" ");
}

/** The headline note in the trigger reliability panel. */
export function buildTriggerNote(metrics: EvaluationMetrics | null): string | null {
  const trigger = metrics?.trigger;
  if (!metrics || !trigger) return null;

  if (trigger.expected === 0) {
    return "No skill-relevant tasks ran under the Skill configuration, so trigger reliability could not be measured.";
  }

  const missedFailures = metrics.missedTriggerFailureCount;

  if (trigger.missed === 0) {
    return `The agent loaded the skill in every one of the ${trigger.expected} relevant runs.`;
  }

  if (missedFailures === 0) {
    return `The skill was missed in ${runWord(trigger.missed)}, but those runs still passed.`;
  }

  return `${runWord(missedFailures)} both missed the skill and failed. That association does not prove the missed load caused the failure.`;
}

/** Secondary explanation under the trigger note. */
export function buildTriggerDetail(
  metrics: EvaluationMetrics | null,
): string | null {
  if (!metrics?.trigger) return null;

  const parts: string[] = [];
  const { successWhenInvoked, successWhenNotInvoked } = metrics;

  if (successWhenInvoked !== null && successWhenNotInvoked !== null) {
    parts.push(
      `Runs that loaded the skill succeeded ${formatPct(successWhenInvoked)} of the time; runs that did not succeeded ${formatPct(successWhenNotInvoked)} of the time.`,
    );
  } else if (successWhenInvoked !== null) {
    parts.push(
      `Every Skill run loaded the skill, succeeding ${formatPct(successWhenInvoked)} of the time.`,
    );
  } else if (successWhenNotInvoked !== null) {
    parts.push(
      `No Skill run loaded the skill. Those runs succeeded ${formatPct(successWhenNotInvoked)} of the time.`,
    );
  }

  const explicit = metrics.configs.find((config) => config.id === "explicit");
  const skill = metrics.configs.find((config) => config.id === "skill");
  if (
    explicit?.successRate !== null &&
    explicit?.successRate !== undefined &&
    skill?.successRate !== null &&
    skill?.successRate !== undefined
  ) {
    const recovered = Math.round((explicit.successRate - skill.successRate) * 10) / 10;
    if (recovered >= MATERIAL_PP) {
      parts.push(
        `Explicit Trigger scored ${ppWord(recovered)} above the Skill condition. This is consistent with a discovery problem, but does not prove one.`,
      );
    } else if (recovered <= -MATERIAL_PP) {
      parts.push(
        `Forcing the skill did not help: Explicit Trigger scored ${ppWord(recovered)} below the Skill condition.`,
      );
    }
  }

  const trigger = metrics.trigger;
  if (trigger.falsePositives > 0 && trigger.irrelevant > 0) {
    parts.push(
      `The agent also loaded the skill in ${trigger.falsePositives} of ${trigger.irrelevant} tasks where it was not needed.`,
    );
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

function runWord(count: number) {
  return `${count} run${count === 1 ? "" : "s"}`;
}

export function buildAnalysisIntro(metrics: EvaluationMetrics | null): string {
  if (!metrics || metrics.totalRuns === 0) {
    return "No runs completed, so there is nothing to analyse.";
  }
  const scored = metrics.totalRuns - metrics.erroredRuns;
  const configCount = metrics.configs.length;
  return `SkillBench analysed ${scored} scored run${scored === 1 ? "" : "s"} across ${configCount} configuration${configCount === 1 ? "" : "s"}.`;
}

/** "Evaluation completed in 4m 12s · 36 runs across 4 configurations" */
export function buildCompletionSummary(
  metrics: EvaluationMetrics | null,
  outcome: "completed" | "failed" = "completed",
): string | null {
  if (!metrics) return null;
  const duration =
    metrics.wallClockMs === null ? null : formatDuration(metrics.wallClockMs);
  const runs = `${metrics.totalRuns} run${metrics.totalRuns === 1 ? "" : "s"}`;
  const configs = `${metrics.configs.length} configuration${metrics.configs.length === 1 ? "" : "s"}`;
  const errored =
    metrics.erroredRuns > 0 ? ` · ${metrics.erroredRuns} errored` : "";
  const prefix = outcome === "failed" ? "Evaluation failed" : "Evaluation completed";
  return duration
    ? `${prefix} ${outcome === "failed" ? "after" : "in"} ${duration} · ${runs} across ${configs}${errored}`
    : `${prefix} · ${runs} across ${configs}${errored}`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/** Short reason string for the failed-runs table. */
export function describeFailureReason(input: {
  configId: string;
  skillRelevant: boolean;
  skillInvoked: boolean;
  error: string | null;
  judgeError: string | null;
}): string {
  // A judge failure is checked first: the run itself produced a response and
  // only scoring failed, which "Run errored" would misrepresent.
  if (input.judgeError) return "Not scored";
  if (input.error) return "Run errored";
  if (input.configId === "skill" && input.skillRelevant && !input.skillInvoked) {
    return "Missed skill trigger";
  }
  if (input.configId === "skill" && !input.skillRelevant && input.skillInvoked) {
    return "Unnecessary skill load";
  }
  return "Incorrect answer";
}

/** Relative timestamp for the dashboard's Updated column. */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function bestConfig(
  configs: ConfigMetricsRecord[],
): ConfigMetricsRecord | null {
  const scored = configs.filter((config) => config.successRate !== null);
  if (scored.length === 0) return null;
  return scored.reduce((leader, config) =>
    config.successRate! > leader.successRate! ? config : leader,
  );
}
