import { describe, expect, it } from "vitest";

import { generateFindings, parseFindings, FINDINGS_SYSTEM_PROMPT } from "@/lib/eval/findings";
import { computeMetrics } from "@/lib/eval/metrics";

import { makeRuns, makeSkill, scriptedProvider } from "./helpers/factories";

describe("parseFindings", () => {
  it("parses findings and assigns stable ids", () => {
    const findings = parseFindings(
      JSON.stringify({
        findings: [
          { severity: "high", title: "Trigger wording is too narrow", explanation: "Because…" },
          { severity: "low", title: "Token cost", explanation: "Minor." },
        ],
      }),
    );

    expect(findings).toHaveLength(2);
    expect(findings![0]).toEqual({
      id: "finding-1",
      severity: "high",
      title: "Trigger wording is too narrow",
      explanation: "Because…",
    });
  });

  it("parses findings from a fenced code block", () => {
    const findings = parseFindings(
      '```json\n{"findings":[{"severity":"medium","title":"T","explanation":"E"}]}\n```',
    );

    expect(findings).toHaveLength(1);
  });

  it("defaults an unrecognised severity to medium instead of dropping the finding", () => {
    const findings = parseFindings(
      '{"findings":[{"severity":"catastrophic","title":"T","explanation":"E"}]}',
    );

    expect(findings![0].severity).toBe("medium");
  });

  it("drops entries missing a title or explanation", () => {
    const findings = parseFindings(
      '{"findings":[{"severity":"high","title":"","explanation":"E"},{"severity":"high","title":"T","explanation":"E"}]}',
    );

    expect(findings).toHaveLength(1);
    expect(findings![0].title).toBe("T");
  });

  it("caps the list at four findings", () => {
    const findings = parseFindings(
      JSON.stringify({
        findings: Array.from({ length: 9 }, (_, index) => ({
          severity: "low",
          title: `T${index}`,
          explanation: "E",
        })),
      }),
    );

    expect(findings).toHaveLength(4);
  });

  it("returns null for malformed output rather than fabricating findings", () => {
    expect(parseFindings("Here are some thoughts…")).toBeNull();
    expect(parseFindings('{"findings":"none"}')).toBeNull();
    expect(parseFindings('{"findings":[]}')).toBeNull();
    expect(parseFindings("")).toBeNull();
  });
});

describe("generateFindings", () => {
  const metrics = computeMetrics({
    runs: [
      ...makeRuns("baseline", [{ success: false }, { success: false }]),
      ...makeRuns("skill", [
        { success: true, skillInvoked: true },
        { success: false, skillInvoked: false },
      ]),
    ],
    selectedConfigs: ["baseline", "skill"],
    wallClockMs: 60_000,
  });

  const input = { skill: makeSkill(), metrics, runs: [] };

  it("returns findings from a well-formed analysis", async () => {
    const provider = scriptedProvider([
      { text: '{"findings":[{"severity":"high","title":"T","explanation":"E"}]}' },
    ]);

    const result = await generateFindings({ provider, ...input });

    expect(result.error).toBeNull();
    expect(result.findings).toHaveLength(1);
  });

  it("reports an error instead of inventing findings when the output is malformed", async () => {
    const provider = scriptedProvider([{ text: "I think the skill is fine." }]);

    const result = await generateFindings({ provider, ...input });

    expect(result.findings).toEqual([]);
    expect(result.error).toMatch(/did not return findings/);
  });

  it("does not throw when the provider fails", async () => {
    const provider = {
      model: "failing",
      async generate(): Promise<never> {
        throw new Error("connection reset");
      },
    };

    const result = await generateFindings({ provider, ...input });

    expect(result.findings).toEqual([]);
    expect(result.error).toBe("connection reset");
  });

  it("forbids blaming instruction length or a broad description without evidence", () => {
    expect(FINDINGS_SYSTEM_PROMPT).toContain("Never invent a statistic");
    expect(FINDINGS_SYSTEM_PROMPT).toContain("Length alone is never a finding");
    expect(FINDINGS_SYSTEM_PROMPT).toMatch(/description is too broad/);
    expect(FINDINGS_SYSTEM_PROMPT).toContain("Do not overclaim");
  });

  it("passes sample size and tells the model not to treat character count as a finding", async () => {
    const provider = scriptedProvider([
      { text: '{"findings":[{"severity":"low","title":"T","explanation":"E"}]}' },
    ]);

    await generateFindings({
      provider,
      ...input,
      runs: makeRuns("skill", [
        { success: true, skillInvoked: true },
        { success: false, skillInvoked: false },
      ]),
    });

    const prompt = JSON.stringify(provider.requests[0].messages);
    expect(prompt).toContain("Never invent a statistic");
    expect(prompt).toContain("Length alone is never a finding");
    expect(prompt).toContain("metadata, not a finding");
    expect(prompt).toContain("Sample is small");
  });

  it("passes only measured numbers to the analyzer", async () => {
    const provider = scriptedProvider([
      { text: '{"findings":[{"severity":"low","title":"T","explanation":"E"}]}' },
    ]);

    await generateFindings({ provider, ...input });

    const prompt = JSON.stringify(provider.requests[0].messages);
    expect(prompt).toContain("Skill vs Baseline: +50 pp");
    expect(prompt).toContain("Measured trigger rate: 50%");
    expect(prompt).toContain("Never invent a statistic");
  });

  it("labels quantities that were not measured rather than defaulting them to zero", async () => {
    const provider = scriptedProvider([
      { text: '{"findings":[{"severity":"low","title":"T","explanation":"E"}]}' },
    ]);

    const baselineOnly = computeMetrics({
      runs: makeRuns("baseline", [{ success: true }]),
      selectedConfigs: ["baseline"],
      wallClockMs: null,
    });

    await generateFindings({ provider, ...input, metrics: baselineOnly });

    const prompt = JSON.stringify(provider.requests[0].messages);
    expect(prompt).toContain("Skill vs Baseline: not measured");
    expect(prompt).toContain(
      "The Skill configuration did not run, so invocation was not measured.",
    );
  });
});
