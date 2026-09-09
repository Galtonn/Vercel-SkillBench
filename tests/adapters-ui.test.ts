import { describe, expect, it } from "vitest";

import {
  toDetail,
  toProgressView,
  toRevisionComparison,
  toSummary,
  toUiStatus,
} from "@/lib/adapters/ui";
import { classifyRun } from "@/lib/eval/classify";
import { computeMetrics } from "@/lib/eval/metrics";
import type { ConfigId, EvalRun, EvaluationRecord } from "@/lib/eval/types";

import { makeRecord, makeRun, makeRuns } from "./helpers/factories";

/** A completed record whose metrics came through the real aggregation path. */
function completedRecord(
  spec: Partial<
    Record<ConfigId, Array<{ success: boolean; skillRelevant?: boolean; skillInvoked?: boolean }>>
  >,
  overrides: Partial<EvaluationRecord> = {},
): EvaluationRecord {
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

  return makeRecord({
    runs,
    metrics: computeMetrics({ runs, selectedConfigs: configs, wallClockMs: 252_000 }),
    request: { ...makeRecord().request, selectedConfigs: configs },
    progress: { ...makeRecord().progress, total: runs.length, completed: runs.length },
    ...overrides,
  });
}

describe("toUiStatus", () => {
  it("collapses queued into running and passes the rest through", () => {
    const statuses: Array<[EvaluationRecord["status"], string]> = [
      ["queued", "running"],
      ["running", "running"],
      ["completed", "completed"],
      ["failed", "failed"],
      ["cancelled", "cancelled"],
    ];

    for (const [status, expected] of statuses) {
      expect(toUiStatus(makeRecord({ status }))).toBe(expected);
    }
  });
});

describe("toSummary", () => {
  it("carries real metrics onto the dashboard row", () => {
    const record = completedRecord({
      baseline: [{ success: false }, { success: false }],
      skill: [
        { success: true, skillInvoked: true },
        { success: false, skillInvoked: false },
      ],
    });

    const summary = toSummary(record);

    expect(summary.effectiveness).toBe(50);
    expect(summary.triggerRate).toBe(50);
    expect(summary.skillName).toBe("analyze-bundle");
    expect(summary.completedRuns).toBe(4);
  });

  it("leaves metrics null for an evaluation that has not produced any", () => {
    const summary = toSummary(makeRecord({ status: "running", metrics: null }));

    expect(summary.effectiveness).toBeNull();
    expect(summary.triggerRate).toBeNull();
    expect(summary.status).toBe("running");
  });

  it("exposes a raw ISO timestamp so the server render stays deterministic", () => {
    const summary = toSummary(makeRecord());

    expect(summary.updatedAt).toBe("2026-01-01T12:04:13.000Z");
    expect(() => new Date(summary.updatedAt).toISOString()).not.toThrow();
  });

  it("falls back through completedAt, progress, then createdAt", () => {
    expect(
      toSummary(
        makeRecord({
          completedAt: null,
          progress: { ...makeRecord().progress, updatedAt: "2026-01-01T12:02:00.000Z" },
        }),
      ).updatedAt,
    ).toBe("2026-01-01T12:02:00.000Z");
  });

  it("flags a revision so the UI can label it", () => {
    expect(toSummary(makeRecord({ revisionOf: "original-id" })).isRevision).toBe(true);
    expect(toSummary(makeRecord()).isRevision).toBe(false);
  });

  it("labels a stored evaluation by where its tasks came from", () => {
    expect(toSummary(makeRecord()).benchmarkSourceLabel).toBe("Built-in benchmark");
    expect(
      toSummary(
        makeRecord({
          request: {
            ...makeRecord().request,
            benchmarkId: null,
            benchmarkSource: "ai-generated",
          },
        }),
      ).benchmarkSourceLabel,
    ).toBe("AI-generated benchmark");
  });
});

describe("toDetail", () => {
  it("maps configuration metrics into the table's view model", () => {
    const record = completedRecord({
      baseline: [{ success: false }, { success: false }],
      skill: [
        { success: true, skillInvoked: true },
        { success: false, skillInvoked: false },
      ],
    });

    const detail = toDetail(record);
    const skill = detail.configs.find((config) => config.id === "skill")!;

    expect(skill.name).toBe("Skill");
    expect(skill.success).toBe(50);
    expect(skill.triggerRate).toBe(50);
    expect(skill.triggerRateByConstruction).toBe(false);
    // 1000 in + 200 out per run from the factory.
    expect(skill.avgTokens).toBe(1200);
    expect(skill.avgRuntime).toBe(4);
  });

  it("marks Explicit Trigger and AGENTS.md trigger rates as by construction", () => {
    const detail = toDetail(
      completedRecord({ explicit: [{ success: true }], "agents-md": [{ success: true }] }),
    );

    for (const id of ["explicit", "agents-md"] as const) {
      const config = detail.configs.find((entry) => entry.id === id)!;
      expect(config.triggerRate).toBe(100);
      expect(config.triggerRateByConstruction).toBe(true);
    }
  });

  it("derives the verdict and notes from the same metrics as the table", () => {
    const detail = toDetail(
      completedRecord({
        baseline: [{ success: false }, { success: false }, { success: false }, { success: false }],
        skill: [
          { success: true, skillInvoked: true },
          { success: true, skillInvoked: true },
          { success: false, skillInvoked: false },
          { success: false, skillInvoked: false },
        ],
      }),
    );

    expect(detail.verdictBadge).toBe("Useful in this small benchmark");
    expect(detail.comparisonNote).toMatch(/Skill improved success by 50 percentage points/);
    expect(detail.triggerNote).toMatch(/2 runs both missed the skill and failed/);
    expect(detail.missedTriggerFailureCount).toBe(2);
  });

  it("reports trigger counts that match the underlying runs", () => {
    const detail = toDetail(
      completedRecord({
        skill: [
          { success: true, skillInvoked: true },
          { success: false, skillInvoked: false },
          { success: true, skillRelevant: false, skillInvoked: true },
        ],
      }),
    );

    expect(detail.trigger).toEqual({
      expected: 2,
      invoked: 1,
      missed: 1,
      falsePositives: 1,
      irrelevant: 1,
      rate: 50,
      falsePositiveRate: 100,
    });
  });

  it("lists both failed and errored runs, distinguishing the two", () => {
    const record = makeRecord({
      runs: [
        makeRun({ id: "pass", success: true }),
        makeRun({ id: "fail", success: false, score: 0.25 }),
        makeRun({
          id: "errored",
          status: "error",
          success: false,
          judgeError: "Malformed judge output.",
          error: "Judge failure: Malformed judge output.",
        }),
      ],
    });

    const detail = toDetail(record);

    expect(detail.failedRuns.map((run) => run.id)).toEqual(["fail", "errored"]);
    expect(detail.failedRuns[0].result).toBe("Failed");
    expect(detail.failedRuns[0].score).toBe(25);
    expect(detail.failedRuns[1].result).toBe("Errored");
    // An unscored run has no score to show.
    expect(detail.failedRuns[1].score).toBeNull();
    expect(detail.failedRuns[1].reason).toBe("Not scored");
  });

  it("builds the timeline from recorded events only, with no synthesised steps", () => {
    const record = makeRecord({
      runs: [
        makeRun({
          success: false,
          events: [
            { atMs: 0, label: "Run started" },
            { atMs: 3200, label: "Skill invoked: analyze-bundle" },
            { atMs: 65_000, label: "Final response received" },
          ],
        }),
      ],
    });

    const timeline = toDetail(record).failedRuns[0].timeline;

    expect(timeline).toEqual([
      { time: "00:00", event: "Run started" },
      { time: "00:03", event: "Skill invoked: analyze-bundle" },
      { time: "01:05", event: "Final response received" },
    ]);
  });

  it("carries invocation detail onto the failed run so a missed trigger is visible", () => {
    const record = makeRecord({
      runs: [
        makeRun({
          configId: "skill",
          success: false,
          skillRelevant: true,
          skillInvoked: false,
          classification: "missed_trigger_failure",
        }),
      ],
    });

    const failed = toDetail(record).failedRuns[0];

    expect(failed.reason).toBe("Missed skill trigger");
    expect(failed.classificationLabel).toBe("Missed trigger, failed");
    expect(failed.skillApplicable).toBe(true);
    expect(failed.tokenLabel).toBe("1,000 in / 200 out");
    expect(failed.latencyLabel).toBe("4s");
  });

  it("passes through a findings error instead of showing empty analysis", () => {
    const detail = toDetail(
      completedRecord({ baseline: [{ success: true }] }, {
        findings: [],
        findingsError: "The analysis model did not return findings in the expected format.",
      }),
    );

    expect(detail.findings).toEqual([]);
    expect(detail.findingsError).toMatch(/did not return findings/);
  });

  it("surfaces the failure message for a failed evaluation", () => {
    const detail = toDetail(
      makeRecord({ status: "failed", error: "OPENAI_API_KEY is not set.", metrics: null }),
    );

    expect(detail.status).toBe("failed");
    expect(detail.error).toBe("OPENAI_API_KEY is not set.");
    expect(detail.verdictBadge).toBe("No results");
  });
});

describe("toProgressView", () => {
  it("reports percent from completed runs, reserving the tail for analysis", () => {
    const record = makeRecord({
      status: "running",
      progress: {
        phase: "running",
        label: "Task 2/4",
        detail: "Running Skill",
        completed: 2,
        total: 8,
        updatedAt: "2026-01-01T12:01:00.000Z",
      },
    });

    const view = toProgressView(record);

    expect(view.completed).toBe(2);
    expect(view.total).toBe(8);
    expect(view.percent).toBe(23);
    expect(view.status).toBe("running");
  });

  it("never reports 100% until the run is actually done", () => {
    const base = makeRecord().progress;
    const allRunsDone = toProgressView(
      makeRecord({ progress: { ...base, phase: "analyzing", completed: 8, total: 8 } }),
    );

    expect(allRunsDone.percent).toBeLessThan(100);

    const done = toProgressView(
      makeRecord({ progress: { ...base, phase: "done", completed: 8, total: 8 } }),
    );
    expect(done.percent).toBe(100);
  });

  it("does not divide by zero before the total is known", () => {
    const view = toProgressView(
      makeRecord({
        progress: { ...makeRecord().progress, phase: "preparing", completed: 0, total: 0 },
      }),
    );

    expect(Number.isFinite(view.percent)).toBe(true);
    expect(view.percent).toBe(0);
  });
});

describe("toRevisionComparison", () => {
  const original = completedRecord({
    skill: [
      { success: true, skillInvoked: true },
      { success: false, skillInvoked: false },
      { success: false, skillInvoked: false },
      { success: false, skillInvoked: false },
    ],
  });

  it("claims an improvement only when the rerun measured one", () => {
    const revised = completedRecord(
      {
        skill: [
          { success: true, skillInvoked: true },
          { success: true, skillInvoked: true },
          { success: true, skillInvoked: true },
          { success: false, skillInvoked: true },
        ],
      },
      { id: "revised", revisionOf: original.id },
    );

    const comparison = toRevisionComparison(original, revised)!;

    expect(comparison.headline).toBe("The revised skill scored 50 pp higher on task success.");
    const success = comparison.rows.find((row) => row.label === "Task success")!;
    expect(success.before).toBe(25);
    expect(success.after).toBe(75);
    const missed = comparison.rows.find((row) => row.label === "Missed invocations")!;
    expect(missed.before).toBe(3);
    expect(missed.after).toBe(0);
    expect(missed.higherIsBetter).toBe(false);
  });

  it("reports a regression rather than hiding it", () => {
    const revised = completedRecord(
      { skill: [{ success: false, skillInvoked: true }, { success: false, skillInvoked: true }] },
      { id: "revised", revisionOf: original.id },
    );

    expect(toRevisionComparison(original, revised)!.headline).toMatch(/25 pp lower/);
  });

  it("does not compare while the re-evaluation is still running", () => {
    const running = makeRecord({ id: "revised", status: "running", metrics: null });

    const comparison = toRevisionComparison(original, running)!;

    expect(comparison.headline).toBe("Re-evaluation in progress.");
    expect(comparison.rows.every((row) => row.after === null)).toBe(true);
  });

  it("says so when the re-evaluation failed", () => {
    const failed = makeRecord({ id: "revised", status: "failed", metrics: null });

    expect(toRevisionComparison(original, failed)!.headline).toMatch(/re-evaluation failed/);
  });

  it("returns null when the original has no metrics to compare", () => {
    expect(
      toRevisionComparison(makeRecord({ metrics: null }), makeRecord({ id: "revised" })),
    ).toBeNull();
  });
});
