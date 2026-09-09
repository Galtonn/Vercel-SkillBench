import { describe, expect, it } from "vitest";

import { classifyRun } from "@/lib/eval/classify";
import { computeMetrics } from "@/lib/eval/metrics";
import {
  bestConfig,
  buildComparisonNote,
  buildCompletionSummary,
  buildSampleWarnings,
  buildTriggerDetail,
  buildTriggerNote,
  buildVerdict,
  describeDeltaVsBaseline,
  describeFailureReason,
  formatDuration,
  formatPpDelta,
  formatRelativeTime,
} from "@/lib/eval/narrative";
import type { ConfigId, EvalRun, EvaluationMetrics } from "@/lib/eval/types";

import { makeRuns } from "./helpers/factories";

/**
 * Builds real metrics from a per-config pattern, so the narrative assertions are
 * made against numbers that came through the actual aggregation path.
 */
function metricsFor(
  spec: Partial<
    Record<
      ConfigId,
      Array<{
        success: boolean;
        skillRelevant?: boolean;
        skillInvoked?: boolean;
        status?: EvalRun["status"];
      }>
    >
  >,
): EvaluationMetrics {
  const configs = Object.keys(spec) as ConfigId[];
  const runs: EvalRun[] = configs.flatMap((configId) =>
    makeRuns(configId, spec[configId]!).map((run) => ({
      ...run,
      classification: classifyRun({
        configId: run.configId,
        skillRelevant: run.skillRelevant,
        skillInvoked: run.skillInvoked,
        success: run.success,
      }),
    })),
  );

  return computeMetrics({ runs, selectedConfigs: configs, wallClockMs: 252_000 });
}

const pass = (skillInvoked = false, skillRelevant = true) => ({
  success: true,
  skillInvoked,
  skillRelevant,
});
const fail = (skillInvoked = false, skillRelevant = true) => ({
  success: false,
  skillInvoked,
  skillRelevant,
});

describe("describeDeltaVsBaseline", () => {
  it("claims an improvement only when the delta is material", () => {
    expect(describeDeltaVsBaseline("Skill", 14)).toBe(
      "Skill improved success by 14 percentage points over Baseline.",
    );
  });

  it("describes a small delta as not material rather than as a win", () => {
    const text = describeDeltaVsBaseline("Skill", 2);
    expect(text).toMatch(/did not materially change/);
    expect(text).not.toMatch(/improved/);
  });

  it("reports underperformance honestly", () => {
    expect(describeDeltaVsBaseline("Skill", -6)).toBe(
      "Skill underperformed Baseline by 6 percentage points.",
    );
  });

  it("says the comparison was not possible when the delta is unknown", () => {
    expect(describeDeltaVsBaseline("Skill", null)).toMatch(/could not be compared/);
  });

  it("treats the threshold itself as material", () => {
    expect(describeDeltaVsBaseline("Skill", 5)).toMatch(/improved success by 5 percentage points/);
    expect(describeDeltaVsBaseline("Skill", -5)).toMatch(/underperformed Baseline by 5 percentage points/);
    expect(describeDeltaVsBaseline("Skill", 4.9)).toMatch(/did not materially change/);
  });
});

describe("buildVerdict", () => {
  it("reports a useful skill with a reliable trigger", () => {
    const metrics = metricsFor({
      baseline: [fail(), fail(), fail(), fail()],
      skill: [pass(true), pass(true), pass(true), fail(true)],
    });

    const { verdict, badge } = buildVerdict(metrics);

    expect(badge).toBe("Useful, reliable trigger");
    expect(verdict).toMatch(/improves task success by 75 percentage points/);
    expect(verdict).toMatch(/100% of relevant tasks/);
  });

  it("reports a useful skill that the agent fails to trigger reliably", () => {
    const metrics = metricsFor({
      baseline: [fail(), fail(), fail(), fail()],
      skill: [pass(true), pass(true), fail(false), fail(false)],
    });

    const { verdict, badge } = buildVerdict(metrics);

    expect(badge).toBe("Useful, unreliable trigger");
    expect(verdict).toMatch(/only triggered it in 50% of relevant tasks/);
  });

  it("reports a harmful skill when the sample is large enough to support that word", () => {
    const metrics = metricsFor({
      baseline: [pass(), pass(), pass(), pass()],
      skill: [fail(true), fail(true), fail(true), pass(true)],
    });

    const { verdict, badge } = buildVerdict(metrics, {
      taskCount: 12,
      relevantTaskCount: 8,
      relevantScoredRuns: 40,
      nonRelevantTaskCount: 2,
    });

    expect(badge).toBe("Harmful");
    expect(verdict).toMatch(/reduced task success/);
    expect(verdict).toMatch(/across 8 scored runs/);
  });

  it("does not label a tiny benchmark simply Harmful", () => {
    const metrics = metricsFor({
      baseline: [pass(), pass(), pass()],
      skill: [fail(true), fail(true), fail(true)],
    });

    const { verdict, badge } = buildVerdict(metrics, {
      taskCount: 3,
      relevantTaskCount: 2,
      relevantScoredRuns: 6,
      nonRelevantTaskCount: 1,
    });

    expect(badge).toBe("Underperformed in this small benchmark");
    expect(verdict).toMatch(/too small to conclude that the skill is generally harmful/);
  });

  it("reports no measurable effect without claiming an improvement", () => {
    const metrics = metricsFor({
      baseline: [pass(), pass(), fail(), fail()],
      skill: [pass(true), pass(true), fail(true), fail(true)],
    });

    const { verdict, badge } = buildVerdict(metrics);

    expect(badge).toBe("No measurable effect");
    expect(verdict).not.toMatch(/improve[ds]/);
  });

  it("reports the invocation association without claiming causation", () => {
    // Overall success ties baseline, but every success came from a loaded run.
    const metrics = metricsFor({
      baseline: [pass(), pass(), fail(), fail()],
      skill: [pass(true), pass(true), fail(false), fail(false)],
    });

    const { verdict, badge } = buildVerdict(metrics);

    expect(badge).toBe("Invocation-associated gap");
    expect(verdict).toMatch(/100% of the time versus 0%/);
    expect(verdict).toMatch(/does not prove/);
  });

  it("does not claim effectiveness when there was no baseline", () => {
    const { verdict, badge } = buildVerdict(metricsFor({ skill: [pass(true)] }));

    expect(badge).toBe("No baseline");
    expect(verdict).toMatch(/nothing to measure skill effectiveness against/);
  });

  it("distinguishes selected-but-errored configs from an omitted baseline", () => {
    const { verdict, badge } = buildVerdict(
      metricsFor({
        baseline: [{ ...fail(), status: "error" }],
        skill: [{ ...fail(), status: "error" }],
      }),
    );

    expect(badge).toBe("No scored comparison");
    expect(verdict).toMatch(/Baseline and Skill were selected/);
  });

  it("says effectiveness was not measured when Skill did not run", () => {
    const { badge } = buildVerdict(metricsFor({ baseline: [pass()] }));
    expect(badge).toBe("Not measured");
  });

  it("reports no results before anything has run", () => {
    expect(buildVerdict(null).badge).toBe("No results");
  });
});

describe("buildComparisonNote", () => {
  it("names the best configuration and every measured delta", () => {
    const note = buildComparisonNote(
      metricsFor({
        baseline: [fail(), fail()],
        skill: [pass(true), fail(false)],
        explicit: [pass(), pass()],
        "agents-md": [pass(), fail()],
      }),
    );

    expect(note).toMatch(/Explicit Trigger produced the highest success at 100%/);
    expect(note).toMatch(/Skill improved success by 50 percentage points/);
    expect(note).toMatch(/AGENTS\.md improved success by 50 percentage points/);
  });

  it("reports a tie as a tie", () => {
    const note = buildComparisonNote(
      metricsFor({ baseline: [pass()], explicit: [pass()] }),
    );

    expect(note).toMatch(/Baseline and Explicit Trigger tied/);
  });

  it("asks for a second configuration when only one ran", () => {
    const note = buildComparisonNote(metricsFor({ baseline: [pass(), fail()] }));

    expect(note).toMatch(/Only Baseline ran, at 50% success/);
    expect(note).toMatch(/Add a second configuration/);
  });

  it("does not invent a comparison when nothing was scored", () => {
    expect(buildComparisonNote(null)).toBe("No runs have completed yet.");
  });
});

describe("buildTriggerNote", () => {
  it("reports missed-trigger failures without claiming causation", () => {
    const note = buildTriggerNote(
      metricsFor({ skill: [pass(true), fail(false), fail(false), fail(false)] }),
    );

    expect(note).toMatch(/3 runs both missed the skill and failed/);
    expect(note).toMatch(/does not prove/);
  });

  it("uses the singular for a single run", () => {
    const note = buildTriggerNote(metricsFor({ skill: [pass(true), fail(false)] }));
    expect(note).toMatch(/1 run both missed the skill and failed/);
  });

  it("does not imply harm when missed runs still passed", () => {
    const note = buildTriggerNote(metricsFor({ skill: [pass(true), pass(false)] }));

    expect(note).toMatch(/missed in 1 run, but those runs still passed/);
  });

  it("reports a perfect trigger record", () => {
    const note = buildTriggerNote(metricsFor({ skill: [pass(true), pass(true)] }));

    expect(note).toBe("The agent loaded the skill in every one of the 2 relevant runs.");
  });

  it("says trigger reliability was unmeasurable with no relevant tasks", () => {
    const note = buildTriggerNote(
      metricsFor({ skill: [{ success: true, skillRelevant: false, skillInvoked: false }] }),
    );

    expect(note).toMatch(/could not be measured/);
  });

  it("returns null when the Skill configuration did not run", () => {
    expect(buildTriggerNote(metricsFor({ baseline: [pass()] }))).toBeNull();
  });
});

describe("buildTriggerDetail", () => {
  it("contrasts success with and without the skill loaded", () => {
    const detail = buildTriggerDetail(
      metricsFor({ skill: [pass(true), pass(true), fail(false), fail(false)] }),
    );

    expect(detail).toMatch(/loaded the skill succeeded 100% of the time/);
    expect(detail).toMatch(/did not succeeded 0% of the time/);
  });

  it("treats an explicit-trigger gain as evidence consistent with discovery", () => {
    const detail = buildTriggerDetail(
      metricsFor({
        skill: [pass(true), fail(false), fail(false), fail(false)],
        explicit: [pass(), pass(), pass(), pass()],
      }),
    );

    expect(detail).toMatch(/Explicit Trigger scored 75 percentage points above/);
    expect(detail).toMatch(/consistent with a discovery problem, but does not prove one/);
  });

  it("reports false positives against the number of irrelevant tasks", () => {
    const detail = buildTriggerDetail(
      metricsFor({
        skill: [
          pass(true),
          { success: true, skillRelevant: false, skillInvoked: true },
          { success: true, skillRelevant: false, skillInvoked: false },
        ],
      }),
    );

    expect(detail).toMatch(/loaded the skill in 1 of 2 tasks where it was not needed/);
  });
});

describe("buildCompletionSummary", () => {
  it("summarises duration, run count, and configuration count", () => {
    const summary = buildCompletionSummary(
      metricsFor({ baseline: [pass(), pass()], skill: [pass(true), pass(true)] }),
    );

    expect(summary).toBe("Evaluation completed in 4m 12s · 4 runs across 2 configurations");
  });

  it("mentions errored runs when there were any", () => {
    const metrics = metricsFor({ baseline: [pass()] });
    const summary = buildCompletionSummary({ ...metrics, erroredRuns: 2 });

    expect(summary).toMatch(/· 2 errored$/);
  });

  it("labels an all-error evaluation as failed", () => {
    const metrics = metricsFor({
      baseline: [{ ...fail(), status: "error" }],
    });

    expect(buildCompletionSummary(metrics, "failed")).toBe(
      "Evaluation failed after 4m 12s · 1 run across 1 configuration · 1 errored",
    );
  });
});

describe("formatting helpers", () => {
  it("signs percentage-point deltas", () => {
    expect(formatPpDelta(12.34)).toBe("+12.3 pp");
    expect(formatPpDelta(-6)).toBe("−6 pp");
    expect(formatPpDelta(0)).toBe("0 pp");
  });

  it("formats durations under and over a minute", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(252_000)).toBe("4m 12s");
    expect(formatDuration(-5)).toBe("0s");
  });

  it("formats relative times against a fixed clock", () => {
    const now = Date.parse("2026-01-01T12:00:00.000Z");
    expect(formatRelativeTime("2026-01-01T11:59:30.000Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-01-01T11:40:00.000Z", now)).toBe("20 min ago");
    expect(formatRelativeTime("2026-01-01T09:00:00.000Z", now)).toBe("3 hours ago");
    expect(formatRelativeTime("2025-12-30T12:00:00.000Z", now)).toBe("2 days ago");
    expect(formatRelativeTime("not a date", now)).toBe("unknown");
  });
});

describe("describeFailureReason", () => {
  const base = {
    configId: "skill",
    skillRelevant: true,
    skillInvoked: false,
    error: null,
    judgeError: null,
  };

  it("distinguishes a missed trigger from a wrong answer", () => {
    expect(describeFailureReason(base)).toBe("Missed skill trigger");
    expect(describeFailureReason({ ...base, skillInvoked: true })).toBe("Incorrect answer");
  });

  it("names an unnecessary skill load", () => {
    expect(
      describeFailureReason({ ...base, skillRelevant: false, skillInvoked: true }),
    ).toBe("Unnecessary skill load");
  });

  it("prioritises run and judge errors over outcome reasons", () => {
    expect(describeFailureReason({ ...base, error: "boom" })).toBe("Run errored");
    expect(describeFailureReason({ ...base, judgeError: "bad json" })).toBe("Not scored");
  });

  it("calls a scoring failure unscored even though the run also carries an error", () => {
    // The runner sets both fields for a judge failure; the response did arrive.
    expect(
      describeFailureReason({
        ...base,
        judgeError: "Malformed judge output.",
        error: "Judge failure: Malformed judge output.",
      }),
    ).toBe("Not scored");
  });
});

describe("bestConfig", () => {
  it("picks the highest success rate and ignores unscored configurations", () => {
    const metrics = metricsFor({
      baseline: [fail()],
      skill: [pass(true)],
    });

    expect(bestConfig(metrics.configs)!.id).toBe("skill");
  });

  it("returns null when nothing was scored", () => {
    const metrics = metricsFor({ baseline: [] });
    expect(bestConfig(metrics.configs)).toBeNull();
  });
});

describe("buildSampleWarnings", () => {
  it("warns when relevant scored runs are below 10", () => {
    const warnings = buildSampleWarnings({
      taskCount: 4,
      relevantTaskCount: 2,
      relevantScoredRuns: 8,
      nonRelevantTaskCount: 2,
    });

    expect(warnings.some((warning) => warning.startsWith("Small sample size"))).toBe(
      true,
    );
  });

  it("warns that a single non-relevant task makes the false-positive rate unstable", () => {
    const warnings = buildSampleWarnings({
      taskCount: 12,
      relevantTaskCount: 8,
      relevantScoredRuns: 40,
      nonRelevantTaskCount: 1,
    });

    expect(warnings.some((warning) => warning.includes("only one non-relevant task"))).toBe(
      true,
    );
  });
});
