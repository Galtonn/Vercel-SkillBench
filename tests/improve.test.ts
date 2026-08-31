import { describe, expect, it } from "vitest";

import { buildDiffLines } from "@/lib/eval/diff";
import {
  ImprovementError,
  diagnoseProblem,
  generateImprovedSkill,
  parseImprovement,
} from "@/lib/eval/improve";
import { computeMetrics } from "@/lib/eval/metrics";
import type { ConfigId, EvalRun } from "@/lib/eval/types";

import { makeRuns, makeSkill, scriptedProvider } from "./helpers/factories";

function metricsFor(
  spec: Partial<
    Record<ConfigId, Array<{ success: boolean; skillRelevant?: boolean; skillInvoked?: boolean }>>
  >,
) {
  const configs = Object.keys(spec) as ConfigId[];
  const runs: EvalRun[] = configs.flatMap((configId) => makeRuns(configId, spec[configId]!));
  return computeMetrics({ runs, selectedConfigs: configs, wallClockMs: null });
}

describe("diagnoseProblem", () => {
  it("diagnoses a discovery problem when the skill works but is rarely loaded", () => {
    const metrics = metricsFor({
      skill: [
        { success: true, skillInvoked: true },
        { success: false, skillInvoked: false },
        { success: false, skillInvoked: false },
        { success: false, skillInvoked: false },
      ],
    });

    expect(metrics.trigger!.triggerRate).toBe(25);
    expect(metrics.successWhenInvoked).toBe(100);
    expect(diagnoseProblem(metrics)).toBe("trigger");
  });

  it("diagnoses an instruction problem when the skill loads reliably but still fails", () => {
    const metrics = metricsFor({
      skill: [
        { success: false, skillInvoked: true },
        { success: false, skillInvoked: true },
        { success: true, skillInvoked: true },
      ],
    });

    expect(metrics.trigger!.triggerRate).toBe(100);
    expect(diagnoseProblem(metrics)).toBe("instructions");
  });

  it("diagnoses both when discovery and instructions are each failing", () => {
    const metrics = metricsFor({
      skill: [
        { success: false, skillInvoked: true },
        { success: false, skillInvoked: false },
        { success: false, skillInvoked: false },
      ],
    });

    expect(diagnoseProblem(metrics)).toBe("both");
  });

  it("diagnoses no clear problem when the skill triggers and succeeds", () => {
    const metrics = metricsFor({
      skill: [
        { success: true, skillInvoked: true },
        { success: true, skillInvoked: true },
      ],
    });

    expect(diagnoseProblem(metrics)).toBe("none");
  });

  it("does not diagnose a problem from quantities that were never measured", () => {
    expect(diagnoseProblem(metricsFor({ baseline: [{ success: false }] }))).toBe("none");
  });
});

describe("parseImprovement", () => {
  it("parses a rationale and revised skill", () => {
    const parsed = parseImprovement(
      JSON.stringify({ rationale: "Widened the triggers.", skill_markdown: "---\nname: x\n---\n\nBody." }),
    );

    expect(parsed?.rationale).toBe("Widened the triggers.");
    expect(parsed?.skillMarkdown).toContain("name: x");
  });

  it("substitutes a placeholder rationale but never a placeholder skill", () => {
    expect(parseImprovement('{"skill_markdown":"content"}')?.rationale).toBe(
      "No rationale provided.",
    );
    expect(parseImprovement('{"rationale":"Only prose."}')).toBeNull();
  });

  it("returns null for malformed output", () => {
    expect(parseImprovement("Here is a better skill…")).toBeNull();
    expect(parseImprovement("")).toBeNull();
  });
});

describe("generateImprovedSkill", () => {
  const skill = makeSkill();
  const metrics = metricsFor({
    skill: [
      { success: true, skillInvoked: true },
      { success: false, skillInvoked: false },
      { success: false, skillInvoked: false },
      { success: false, skillInvoked: false },
    ],
  });

  const revised = `---
name: analyze-bundle
description: Analyze JavaScript bundles, including route bundle regressions and unexplained increases in initial JS.
---

# Analyze Bundle

1. Read the bundle analysis artifacts.
2. Attribute size to specific modules.
3. Propose a change and state the expected saving.`;

  it("returns a validated revision with a diff and the diagnosed problem", async () => {
    const provider = scriptedProvider([
      { text: JSON.stringify({ rationale: "Widened trigger wording.", skill_markdown: revised }) },
    ]);

    const improvement = await generateImprovedSkill({
      provider,
      skill,
      metrics,
      runs: [],
    });

    expect(improvement.problemKind).toBe("trigger");
    expect(improvement.revisedSkillMarkdown).toBe(revised);
    expect(improvement.reevaluationId).toBeNull();
    expect(improvement.diffLines.some((line) => line.startsWith("+"))).toBe(true);
  });

  it("aims the prompt at discovery when the data shows a trigger problem", async () => {
    const provider = scriptedProvider([
      { text: JSON.stringify({ rationale: "r", skill_markdown: revised }) },
    ]);

    await generateImprovedSkill({ provider, skill, metrics, runs: [] });

    const prompt = JSON.stringify(provider.requests[0].messages);
    expect(prompt).toContain("DISCOVERY problem");
    expect(prompt).toContain("Measured trigger rate: 25%");
  });

  it("aims the prompt at the instruction body when the skill loads and still fails", async () => {
    const provider = scriptedProvider([
      { text: JSON.stringify({ rationale: "r", skill_markdown: revised }) },
    ]);

    await generateImprovedSkill({
      provider,
      skill,
      metrics: metricsFor({
        skill: [
          { success: false, skillInvoked: true },
          { success: false, skillInvoked: true },
        ],
      }),
      runs: [],
    });

    expect(JSON.stringify(provider.requests[0].messages)).toContain("INSTRUCTION problem");
  });

  it("retries once when the revision is not a valid SKILL.md", async () => {
    const provider = scriptedProvider([
      { text: JSON.stringify({ rationale: "r", skill_markdown: "# No frontmatter here" }) },
      { text: JSON.stringify({ rationale: "r", skill_markdown: revised }) },
    ]);

    const improvement = await generateImprovedSkill({ provider, skill, metrics, runs: [] });

    expect(improvement.revisedSkillMarkdown).toBe(revised);
    expect(provider.requests).toHaveLength(2);
  });

  it("throws rather than storing an unusable revision", async () => {
    const provider = scriptedProvider([
      { text: JSON.stringify({ rationale: "r", skill_markdown: "# Still no frontmatter" }) },
    ]);

    await expect(
      generateImprovedSkill({ provider, skill, metrics, runs: [] }),
    ).rejects.toThrow(ImprovementError);
  });
});

describe("buildDiffLines", () => {
  it("marks removals and additions", () => {
    const lines = buildDiffLines("a\nb\nc", "a\nB\nc");

    expect(lines).toContain("- b");
    expect(lines).toContain("+ B");
    expect(lines).toContain("  a");
  });

  it("reports an unchanged document explicitly", () => {
    expect(buildDiffLines("same\ntext", "same\ntext")).toEqual(["  (no changes)"]);
  });

  it("elides unchanged regions between distant edits", () => {
    const before = ["head", ...Array.from({ length: 30 }, (_, i) => `line ${i}`), "tail"].join("\n");
    const after = before.replace("head", "HEAD").replace("tail", "TAIL");

    const lines = buildDiffLines(after, before);

    expect(lines).toContain("  …");
    expect(lines.length).toBeLessThan(20);
  });

  it("truncates a very large diff", () => {
    const before = Array.from({ length: 300 }, (_, i) => `old ${i}`).join("\n");
    const after = Array.from({ length: 300 }, (_, i) => `new ${i}`).join("\n");

    const lines = buildDiffLines(before, after);

    expect(lines.at(-1)).toBe("  … diff truncated");
    expect(lines.length).toBeLessThanOrEqual(81);
  });
});
