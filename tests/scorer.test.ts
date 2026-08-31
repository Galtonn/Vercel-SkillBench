import { describe, expect, it } from "vitest";

import { isDeterministic, scoreContains } from "@/lib/eval/scorer";

import { makeTask } from "./helpers/factories";

describe("scoreContains", () => {
  it("passes in `all` mode only when every term is present", () => {
    const result = scoreContains(
      "The chart-vendor bundle should use a dynamic import.",
      ["chart-vendor", "dynamic import"],
      "all",
    );

    expect(result.success).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails in `all` mode when a term is missing and names the missing term", () => {
    const result = scoreContains("The bundle is large.", ["bundle", "dynamic import"], "all");

    expect(result.success).toBe(false);
    expect(result.score).toBe(0.5);
    expect(result.reason).toContain("dynamic import");
  });

  it("passes in `any` mode on a single match", () => {
    const result = scoreContains("Use a dynamic import.", ["lazy load", "dynamic import"], "any");

    expect(result.success).toBe(true);
    expect(result.score).toBe(0.5);
  });

  it("fails in `any` mode when nothing matches", () => {
    const result = scoreContains("Unrelated answer.", ["bundle", "chunk"], "any");

    expect(result.success).toBe(false);
    expect(result.score).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(scoreContains("REVENUE-PANEL.TSX", ["revenue-panel.tsx"], "all").success).toBe(true);
  });

  it("normalises whitespace so a wrapped phrase still matches", () => {
    const response = "You should use a dynamic\n   import here.";
    expect(scoreContains(response, ["dynamic import"], "all").success).toBe(true);
  });

  it("does not fuzzy match, so a near miss fails", () => {
    expect(scoreContains("dynamicimport", ["dynamic import"], "all").success).toBe(false);
  });

  it("fails when no expected values are configured rather than passing vacuously", () => {
    const result = scoreContains("anything at all", [], "all");

    expect(result.success).toBe(false);
    expect(result.score).toBe(0);
  });

  it("fails an empty response", () => {
    expect(scoreContains("", ["bundle"], "any").success).toBe(false);
  });
});

describe("isDeterministic", () => {
  it("is true for contains tasks and false for judged tasks", () => {
    expect(
      isDeterministic(
        makeTask({ expected: { type: "contains", values: ["a"], mode: "all" } }),
      ),
    ).toBe(true);
    expect(
      isDeterministic(makeTask({ expected: { type: "llm_judge", criteria: ["a"] } })),
    ).toBe(false);
  });
});
