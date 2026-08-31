import { describe, expect, it } from "vitest";

import { classifyRun } from "@/lib/eval/classify";
import {
  computeConfigMetrics,
  computeMetrics,
  computeTriggerMetrics,
} from "@/lib/eval/metrics";
import type { EvalRun } from "@/lib/eval/types";

import { makeRun, makeRuns } from "./helpers/factories";

/** Applies the real classifier so metric tests exercise the same path as a run. */
function classified(runs: EvalRun[]): EvalRun[] {
  return runs.map((run) => ({
    ...run,
    classification: classifyRun({
      configId: run.configId,
      skillRelevant: run.skillRelevant,
      skillInvoked: run.skillInvoked,
      success: run.success,
    }),
  }));
}

describe("computeConfigMetrics", () => {
  it("computes success rate over scored runs only", () => {
    const runs = [
      ...makeRuns("baseline", [
        { success: true },
        { success: false },
        { success: false },
        { success: false },
      ]),
      makeRun({ configId: "baseline", status: "error", success: false }),
    ];

    const metrics = computeConfigMetrics("baseline", runs);

    expect(metrics.runs).toBe(5);
    expect(metrics.erroredRuns).toBe(1);
    // 1 of the 4 scored runs passed; the errored run is excluded from the rate.
    expect(metrics.successRate).toBe(25);
  });

  it("returns null rates when a configuration produced no scored run", () => {
    const metrics = computeConfigMetrics(
      "baseline",
      [makeRun({ configId: "baseline", status: "error" })],
    );

    expect(metrics.successRate).toBeNull();
    expect(metrics.avgScore).toBeNull();
    expect(metrics.triggerRate).toBeNull();
  });

  it("measures the trigger rate for Skill over relevant runs only", () => {
    const runs = makeRuns("skill", [
      { success: true, skillRelevant: true, skillInvoked: true },
      { success: false, skillRelevant: true, skillInvoked: false },
      // Not relevant, so it must not dilute the trigger rate.
      { success: true, skillRelevant: false, skillInvoked: false },
    ]);

    const metrics = computeConfigMetrics("skill", runs);

    expect(metrics.triggerRate).toBe(50);
    expect(metrics.triggerRateBasis).toBe("measured");
  });

  it("records 100% trigger by construction for Explicit Trigger and AGENTS.md", () => {
    for (const configId of ["explicit", "agents-md"] as const) {
      const metrics = computeConfigMetrics(
        configId,
        makeRuns(configId, [{ success: true }]),
      );
      expect(metrics.triggerRate).toBe(100);
      expect(metrics.triggerRateBasis).toBe("by-construction");
    }
  });

  it("reports no trigger rate for Baseline, where invocation is meaningless", () => {
    const metrics = computeConfigMetrics(
      "baseline",
      makeRuns("baseline", [{ success: true }]),
    );

    expect(metrics.triggerRate).toBeNull();
    expect(metrics.triggerRateBasis).toBe("not-applicable");
  });

  it("averages tokens and runtime over scored runs", () => {
    const runs = [
      makeRun({ configId: "baseline", inputTokens: 1000, outputTokens: 100, latencyMs: 2000 }),
      makeRun({ configId: "baseline", inputTokens: 2000, outputTokens: 300, latencyMs: 4000 }),
    ];

    const metrics = computeConfigMetrics("baseline", runs);

    expect(metrics.avgInputTokens).toBe(1500);
    expect(metrics.avgOutputTokens).toBe(200);
    expect(metrics.avgTotalTokens).toBe(1700);
    expect(metrics.avgRuntimeMs).toBe(3000);
  });
});

describe("computeTriggerMetrics", () => {
  it("separates missed invocations from false positives", () => {
    const runs = makeRuns("skill", [
      { success: true, skillRelevant: true, skillInvoked: true },
      { success: true, skillRelevant: true, skillInvoked: true },
      { success: false, skillRelevant: true, skillInvoked: false },
      { success: false, skillRelevant: true, skillInvoked: false },
      { success: true, skillRelevant: false, skillInvoked: true },
      { success: true, skillRelevant: false, skillInvoked: false },
    ]);

    const trigger = computeTriggerMetrics(runs)!;

    expect(trigger.expected).toBe(4);
    expect(trigger.invoked).toBe(2);
    expect(trigger.missed).toBe(2);
    expect(trigger.triggerRate).toBe(50);
    expect(trigger.irrelevant).toBe(2);
    expect(trigger.falsePositives).toBe(1);
    expect(trigger.falsePositiveRate).toBe(50);
  });

  it("returns null when the Skill configuration did not run", () => {
    expect(computeTriggerMetrics(makeRuns("baseline", [{ success: true }]))).toBeNull();
  });

  it("returns null rates rather than zero when there is nothing to divide by", () => {
    const trigger = computeTriggerMetrics(
      makeRuns("skill", [{ success: true, skillRelevant: false, skillInvoked: false }]),
    )!;

    expect(trigger.triggerRate).toBeNull();
    expect(trigger.falsePositiveRate).toBe(0);
  });

  it("ignores errored runs", () => {
    const runs = [
      ...makeRuns("skill", [{ success: true, skillRelevant: true, skillInvoked: true }]),
      makeRun({
        configId: "skill",
        status: "error",
        skillRelevant: true,
        skillInvoked: false,
        success: false,
      }),
    ];

    const trigger = computeTriggerMetrics(runs)!;

    expect(trigger.expected).toBe(1);
    expect(trigger.triggerRate).toBe(100);
  });
});

describe("computeMetrics", () => {
  it("derives effectiveness as skill minus baseline in percentage points", () => {
    const runs = classified([
      ...makeRuns("baseline", [
        { success: true },
        { success: false },
        { success: false },
        { success: false },
      ]),
      ...makeRuns("skill", [
        { success: true, skillInvoked: true },
        { success: true, skillInvoked: true },
        { success: false, skillInvoked: false },
        { success: false, skillInvoked: false },
      ]),
    ]);

    const metrics = computeMetrics({
      runs,
      selectedConfigs: ["baseline", "skill"],
      wallClockMs: 60_000,
    });

    expect(metrics.configs.find((c) => c.id === "baseline")!.successRate).toBe(25);
    expect(metrics.configs.find((c) => c.id === "skill")!.successRate).toBe(50);
    expect(metrics.effectiveness).toBe(25);
  });

  it("splits success by whether the skill was actually loaded", () => {
    const runs = classified(
      makeRuns("skill", [
        { success: true, skillInvoked: true },
        { success: true, skillInvoked: true },
        { success: false, skillInvoked: false },
        { success: true, skillInvoked: false },
      ]),
    );

    const metrics = computeMetrics({
      runs,
      selectedConfigs: ["skill"],
      wallClockMs: null,
    });

    expect(metrics.successWhenInvoked).toBe(100);
    expect(metrics.successWhenNotInvoked).toBe(50);
  });

  it("counts missed triggers and, separately, missed triggers that failed", () => {
    const runs = classified(
      makeRuns("skill", [
        { success: false, skillRelevant: true, skillInvoked: false },
        { success: false, skillRelevant: true, skillInvoked: false },
        { success: true, skillRelevant: true, skillInvoked: false },
      ]),
    );

    const metrics = computeMetrics({
      runs,
      selectedConfigs: ["skill"],
      wallClockMs: null,
    });

    expect(metrics.missedTriggerCount).toBe(3);
    expect(metrics.missedTriggerFailureCount).toBe(2);
    expect(metrics.classificationCounts.missed_trigger_success).toBe(1);
  });

  it("leaves comparisons null when there is no baseline to compare against", () => {
    const metrics = computeMetrics({
      runs: classified(makeRuns("skill", [{ success: true, skillInvoked: true }])),
      selectedConfigs: ["skill"],
      wallClockMs: null,
    });

    expect(metrics.effectiveness).toBeNull();
    expect(metrics.explicitImprovement).toBeNull();
    expect(metrics.agentsImprovement).toBeNull();
  });

  it("compares Explicit Trigger and AGENTS.md against baseline independently", () => {
    const runs = classified([
      ...makeRuns("baseline", [{ success: false }, { success: false }]),
      ...makeRuns("explicit", [{ success: true }, { success: true }]),
      ...makeRuns("agents-md", [{ success: true }, { success: false }]),
    ]);

    const metrics = computeMetrics({
      runs,
      selectedConfigs: ["baseline", "explicit", "agents-md"],
      wallClockMs: null,
    });

    expect(metrics.explicitImprovement).toBe(100);
    expect(metrics.agentsImprovement).toBe(50);
  });

  it("reports only the configurations that were selected", () => {
    const metrics = computeMetrics({
      runs: makeRuns("baseline", [{ success: true }]),
      selectedConfigs: ["baseline"],
      wallClockMs: null,
    });

    expect(metrics.configs.map((c) => c.id)).toEqual(["baseline"]);
  });

  it("counts errored runs and excludes them from the averages", () => {
    const runs = [
      makeRun({ configId: "baseline", inputTokens: 1000, outputTokens: 100 }),
      makeRun({
        configId: "baseline",
        status: "error",
        inputTokens: 0,
        outputTokens: 0,
      }),
    ];

    const metrics = computeMetrics({
      runs,
      selectedConfigs: ["baseline"],
      wallClockMs: null,
    });

    expect(metrics.totalRuns).toBe(2);
    expect(metrics.erroredRuns).toBe(1);
    expect(metrics.avgInputTokens).toBe(1000);
  });

  it("produces no metrics rather than zeroes when nothing ran", () => {
    const metrics = computeMetrics({
      runs: [],
      selectedConfigs: ["baseline", "skill"],
      wallClockMs: null,
    });

    expect(metrics.totalRuns).toBe(0);
    expect(metrics.trigger).toBeNull();
    expect(metrics.effectiveness).toBeNull();
    expect(metrics.configs.every((config) => config.successRate === null)).toBe(true);
  });
});
