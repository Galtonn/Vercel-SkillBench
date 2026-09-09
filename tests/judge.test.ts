import { describe, expect, it } from "vitest";

import { judgeResponse, parseJudgeVerdict } from "@/lib/eval/judge";

import { scriptedProvider } from "./helpers/factories";

describe("parseJudgeVerdict", () => {
  it("parses a bare JSON verdict", () => {
    const verdict = parseJudgeVerdict(
      '{"success": true, "score": 0.87, "reason": "Correctly identified the regression."}',
    );

    expect(verdict).toEqual({
      success: true,
      score: 0.87,
      reason: "Correctly identified the regression.",
    });
  });

  it("parses a verdict inside a fenced code block", () => {
    const verdict = parseJudgeVerdict(
      'Here is my verdict:\n```json\n{"success": false, "score": 0.2, "reason": "Missed the cause."}\n```',
    );

    expect(verdict?.success).toBe(false);
    expect(verdict?.score).toBe(0.2);
  });

  it("parses a verdict wrapped in prose", () => {
    const verdict = parseJudgeVerdict(
      'I judge this as follows. {"success": true, "score": 1, "reason": "Complete."} Done.',
    );

    expect(verdict?.success).toBe(true);
  });

  it("rejects a score outside 0-1 rather than clamping it into a fake verdict", () => {
    expect(parseJudgeVerdict('{"success":true,"score":4,"reason":"x"}')).toBeNull();
    expect(parseJudgeVerdict('{"success":false,"score":-2,"reason":"x"}')).toBeNull();
  });

  it("substitutes a placeholder for a missing reason", () => {
    expect(parseJudgeVerdict('{"success":true,"score":1}')?.reason).toBe(
      "No reason provided by the judge.",
    );
  });

  it("rejects a verdict without a boolean success, rather than coercing it", () => {
    expect(parseJudgeVerdict('{"success":"yes","score":1,"reason":"x"}')).toBeNull();
  });

  it("rejects a non-numeric or non-finite score", () => {
    expect(parseJudgeVerdict('{"success":true,"score":"high","reason":"x"}')).toBeNull();
    expect(parseJudgeVerdict('{"success":true,"score":null,"reason":"x"}')).toBeNull();
  });

  it("rejects prose, empty input, and arrays", () => {
    expect(parseJudgeVerdict("The answer looks good to me.")).toBeNull();
    expect(parseJudgeVerdict("")).toBeNull();
    expect(parseJudgeVerdict("[1,2,3]")).toBeNull();
  });
});

describe("judgeResponse", () => {
  const input = {
    taskPrompt: "Which dependency is largest?",
    criteria: ["Names the largest dependency."],
    response: "chart-vendor is the largest.",
  };

  it("returns the parsed verdict on the first attempt", async () => {
    const provider = scriptedProvider([
      { text: '{"success":true,"score":0.9,"reason":"Correct."}' },
    ]);

    const outcome = await judgeResponse({ provider, ...input });

    expect(outcome).toEqual({
      success: true,
      score: 0.9,
      reason: "Correct.",
      judgeError: null,
    });
    expect(provider.requests).toHaveLength(1);
  });

  it("retries once with stricter formatting after unparseable output", async () => {
    const provider = scriptedProvider([
      { text: "Looks good to me!" },
      { text: '{"success":true,"score":1,"reason":"Correct."}' },
    ]);

    const outcome = await judgeResponse({ provider, ...input });

    expect(outcome.success).toBe(true);
    expect(outcome.judgeError).toBeNull();
    expect(provider.requests).toHaveLength(2);
    const retryPrompt = provider.requests[1].messages[0];
    expect(retryPrompt).toHaveProperty(
      "content",
      expect.stringContaining("did not match the required schema"),
    );
  });

  it("gives up after two attempts without marking the run as passed", async () => {
    const provider = scriptedProvider([{ text: "Still not JSON." }]);

    const outcome = await judgeResponse({ provider, ...input });

    expect(outcome.success).toBe(false);
    expect(outcome.score).toBe(0);
    expect(outcome.judgeError).toBe("Malformed judge output.");
    expect(provider.requests).toHaveLength(2);
  });

  it("surfaces a provider failure as a judge error instead of throwing", async () => {
    const provider = {
      model: "failing",
      async generate(): Promise<never> {
        throw new Error("429 rate limit exceeded");
      },
    };

    const outcome = await judgeResponse({ provider, ...input });

    expect(outcome.success).toBe(false);
    expect(outcome.judgeError).toContain("429");
  });

  it("gives the judge a reference answer as orientation, not a string to match", async () => {
    const provider = scriptedProvider([
      { text: '{"success":true,"score":1,"reason":"Same facts."}' },
    ]);

    await judgeResponse({
      provider,
      ...input,
      referenceAnswer:
        "The email input lacks a label, the icon-only submit has no accessible name.",
    });

    const text = JSON.stringify(provider.requests[0].messages);
    expect(text).toContain("not a template to match");
    expect(text).toContain("The email input lacks a label");
    expect(text).toContain("chart-vendor is the largest.");
  });

  it("instructs the judge to accept equivalent numeric units", async () => {
    const provider = scriptedProvider([
      { text: '{"success":true,"score":1,"reason":"Equivalent value."}' },
    ]);

    await judgeResponse({ provider, ...input });

    const text = JSON.stringify(provider.requests[0].messages);
    expect(text).toContain("125500 bytes");
    expect(text).toContain("Never claim the candidate");
    expect(text).toContain("each numbered criterion independently");
  });

  it("never tells the judge which configuration produced the answer", async () => {
    const provider = scriptedProvider([
      { text: '{"success":true,"score":1,"reason":"Correct."}' },
    ]);

    await judgeResponse({ provider, ...input });

    const text = JSON.stringify(provider.requests[0].messages).toLowerCase();
    for (const leak of ["baseline", "agents.md", "explicit trigger", "use_skill"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("tells the judge the candidate produced nothing rather than sending an empty answer", async () => {
    const provider = scriptedProvider([
      { text: '{"success":false,"score":0,"reason":"No answer."}' },
    ]);

    await judgeResponse({ provider, ...input, response: "" });

    expect(JSON.stringify(provider.requests[0].messages)).toContain(
      "the candidate produced no answer",
    );
  });
});
