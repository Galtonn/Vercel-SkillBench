import { describe, expect, it } from "vitest";

import {
  extractMentionedPaths,
  hasExplicitGroundTruth,
  meaningfulEvaluationIssues,
  validateBenchmark,
} from "@/lib/eval/benchmark-validation";
import { GENERIC_JUDGE_CRITERIA } from "@/lib/eval/custom-tasks";
import { makeTask } from "./helpers/factories";

describe("validateBenchmark", () => {
  it("warns when every task is marked skill-relevant", () => {
    const quality = validateBenchmark([
      makeTask({ id: "a", name: "A", skillRelevant: true }),
      makeTask({ id: "b", name: "B", skillRelevant: true }),
      makeTask({ id: "c", name: "C", skillRelevant: true }),
      makeTask({ id: "d", name: "D", skillRelevant: true }),
    ]);

    expect(quality.nonRelevantCount).toBe(0);
    expect(quality.warnings.some((warning) => warning.id === "all-relevant")).toBe(true);
    expect(quality.verdict).toBe("weak");
  });

  it("warns when a judged task has only generic criteria", () => {
    const generic = makeTask({
      expected: { type: "llm_judge", criteria: GENERIC_JUDGE_CRITERIA },
    });
    expect(hasExplicitGroundTruth(generic)).toBe(false);

    const quality = validateBenchmark([
      generic,
      makeTask({
        id: "task-2",
        skillRelevant: false,
        expected: { type: "contains", values: ["x"] },
      }),
    ]);

    expect(quality.explicitCriteriaCount).toBe(1);
    expect(quality.warnings.some((warning) => warning.id === "missing-criteria")).toBe(
      true,
    );
  });

  it("notes a missing reference answer without blocking", () => {
    const quality = validateBenchmark([
      makeTask({
        skillRelevant: true,
        expected: { type: "llm_judge", criteria: ["Names the defect."] },
      }),
      makeTask({
        id: "task-2",
        skillRelevant: false,
        expected: { type: "contains", values: ["rename"] },
      }),
      makeTask({
        id: "task-3",
        expected: { type: "llm_judge", criteria: ["Names another defect."] },
      }),
      makeTask({
        id: "task-4",
        skillRelevant: false,
        expected: { type: "llm_judge", criteria: ["Names a third defect."] },
      }),
      makeTask({
        id: "task-5",
        skillRelevant: false,
        expected: { type: "contains", values: ["done"] },
      }),
    ]);

    expect(quality.warnings.some((warning) => warning.id === "missing-reference")).toBe(
      true,
    );
    expect(quality.verdict).not.toBe("weak");
  });

  it("warns when mentioned files are not in the fixture", () => {
    const quality = validateBenchmark(
      [
        makeTask({
          prompt: "Fix app/missing/form.tsx for accessibility.",
          expected: { type: "llm_judge", criteria: ["Mentions the missing label."] },
        }),
        makeTask({
          id: "task-2",
          skillRelevant: false,
          expected: { type: "contains", values: ["x"] },
        }),
        makeTask({ id: "task-3" }),
        makeTask({ id: "task-4" }),
      ],
      { filePaths: ["app/settings/account-form.tsx"] },
    );

    expect(quality.warnings.some((warning) => warning.id === "missing-files")).toBe(true);
  });

  it("warns when no workspace will be mounted", () => {
    const quality = validateBenchmark(
      [
        makeTask(),
        makeTask({ id: "task-2", skillRelevant: false }),
        makeTask({ id: "task-3" }),
        makeTask({ id: "task-4" }),
      ],
      { noWorkspace: true },
    );

    expect(quality.warnings.some((warning) => warning.id === "no-workspace")).toBe(true);
  });

  it("warns that a tiny task set is not interpretable", () => {
    const quality = validateBenchmark([
      makeTask(),
      makeTask({ id: "task-2", skillRelevant: false }),
    ]);

    expect(quality.warnings.some((warning) => warning.id === "too-few-tasks")).toBe(true);
  });
});

describe("extractMentionedPaths", () => {
  it("picks file-like tokens out of a prompt", () => {
    expect(extractMentionedPaths("See app/settings/account-form.tsx and layout.ts")).toEqual([
      "app/settings/account-form.tsx",
      "layout.ts",
    ]);
  });
});

describe("meaningfulEvaluationIssues", () => {
  const tasks = [
    makeTask({ id: "a" }),
    makeTask({ id: "b" }),
    makeTask({ id: "c" }),
    makeTask({
      id: "d",
      skillRelevant: false,
      expected: { type: "contains", values: ["expected"] },
    }),
    makeTask({
      id: "e",
      skillRelevant: false,
      expected: { type: "contains", values: ["expected"] },
    }),
  ];

  it("accepts a grounded controlled comparison", () => {
    expect(
      meaningfulEvaluationIssues({
        tasks,
        selectedConfigs: ["baseline", "skill"],
        hasWorkspace: true,
      }),
    ).toEqual([]);
  });

  it("rejects designs that cannot support a meaningful comparison", () => {
    const issues = meaningfulEvaluationIssues({
      tasks: tasks.slice(0, 2),
      selectedConfigs: ["skill"],
      hasWorkspace: false,
    });

    expect(issues.join(" ")).toMatch(/at least 5 tasks/);
    expect(issues.join(" ")).toMatch(/Include Baseline/);
    expect(issues.join(" ")).toMatch(/non-relevant tasks/);
    expect(issues.join(" ")).toMatch(/repository fixture/);
  });
});
