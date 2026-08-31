import { describe, expect, it } from "vitest";

import { runAgent } from "@/lib/eval/agent";
import { MAX_AGENT_ITERATIONS } from "@/lib/eval/config";
import { USE_SKILL_TOOL_NAME } from "@/lib/eval/conditions";
import { ReadOnlyWorkspace } from "@/lib/eval/workspace";

import {
  makeSkill,
  makeTask,
  scriptedProvider,
  systemPromptOf,
  toolCall,
} from "./helpers/factories";

const skill = makeSkill();
const task = makeTask();

function run(provider: ReturnType<typeof scriptedProvider>, configId: Parameters<typeof runAgent>[0]["configId"]) {
  return runAgent({
    provider,
    configId,
    task,
    skill,
    repoLabel: "bundle-bench",
    workspace: null,
  });
}

describe("runAgent — Baseline condition", () => {
  it("never reveals the skill name, description, or instructions", async () => {
    const provider = scriptedProvider([{ text: "An answer." }]);

    await run(provider, "baseline");

    const prompt = systemPromptOf(provider.requests[0]);
    expect(prompt).not.toContain(skill.name);
    expect(prompt).not.toContain(skill.description);
    expect(prompt).not.toContain(skill.instructions);
  });

  it("offers no use_skill tool, so invocation is impossible", async () => {
    const provider = scriptedProvider([{ text: "An answer." }]);

    const result = await run(provider, "baseline");

    const toolNames = (provider.requests[0].tools ?? []).map((tool) => tool.name);
    expect(toolNames).not.toContain(USE_SKILL_TOOL_NAME);
    expect(result.skillInvoked).toBe(false);
  });
});

describe("runAgent — Skill condition", () => {
  it("exposes the name and description but withholds the instructions", async () => {
    const provider = scriptedProvider([{ text: "Answering without the skill." }]);

    await run(provider, "skill");

    const prompt = systemPromptOf(provider.requests[0]);
    expect(prompt).toContain(skill.name);
    expect(prompt).toContain(skill.description);
    expect(prompt).not.toContain(skill.instructions);
    expect((provider.requests[0].tools ?? []).map((t) => t.name)).toContain(
      USE_SKILL_TOOL_NAME,
    );
  });

  it("records invocation only when the model actually calls the tool", async () => {
    const provider = scriptedProvider([
      { toolCalls: [toolCall(USE_SKILL_TOOL_NAME, { reason: "This is a bundle regression." })] },
      { text: "Final answer using the skill." },
    ]);

    const result = await run(provider, "skill");

    expect(result.skillInvoked).toBe(true);
    expect(result.skillInvocationReason).toBe("This is a bundle regression.");
    expect(result.response).toBe("Final answer using the skill.");
  });

  it("delivers the full instructions in the tool result after invocation", async () => {
    const provider = scriptedProvider([
      { toolCalls: [toolCall(USE_SKILL_TOOL_NAME, { reason: "Relevant." })] },
      { text: "Done." },
    ]);

    await run(provider, "skill");

    const toolMessages = provider.requests[1].messages.filter(
      (message) => message.role === "tool",
    );
    expect(toolMessages).toHaveLength(1);
    expect(
      toolMessages[0] as { content: string },
    ).toHaveProperty("content", expect.stringContaining(skill.instructions));
  });

  it("does not infer invocation from a response that merely mentions the skill", async () => {
    const provider = scriptedProvider([
      { text: `I will apply the ${skill.name} skill and analyze the bundle.` },
    ]);

    const result = await run(provider, "skill");

    expect(result.skillInvoked).toBe(false);
    expect(result.skillInvocationReason).toBeNull();
  });

  it("withdraws the tool after one load, capping skill loads per run", async () => {
    const provider = scriptedProvider([
      { toolCalls: [toolCall(USE_SKILL_TOOL_NAME, { reason: "First." })] },
      { toolCalls: [toolCall(USE_SKILL_TOOL_NAME, { reason: "Again." }, "call-2")] },
      { text: "Final." },
    ]);

    const result = await run(provider, "skill");

    const secondLoad = result.toolCalls.filter(
      (call) => call.name === USE_SKILL_TOOL_NAME,
    );
    expect(secondLoad).toHaveLength(2);
    expect(secondLoad[1].ok).toBe(false);
    // Only one load event, regardless of how many times the model asked.
    expect(
      result.events.filter((event) => event.label.startsWith("Skill instructions loaded")),
    ).toHaveLength(1);
    expect((provider.requests[1].tools ?? []).map((t) => t.name)).not.toContain(
      USE_SKILL_TOOL_NAME,
    );
  });

  it("treats a missing reason argument as no reason rather than failing", async () => {
    const provider = scriptedProvider([
      { toolCalls: [toolCall(USE_SKILL_TOOL_NAME, {})] },
      { text: "Final." },
    ]);

    const result = await run(provider, "skill");

    expect(result.skillInvoked).toBe(true);
    expect(result.skillInvocationReason).toBeNull();
  });
});

describe("runAgent — Explicit Trigger and AGENTS.md conditions", () => {
  it("supplies the instructions up front and states the skill applies to this task", async () => {
    const provider = scriptedProvider([{ text: "Answer." }]);

    await run(provider, "explicit");

    const prompt = systemPromptOf(provider.requests[0]);
    expect(prompt).toContain(skill.instructions);
    expect(prompt).toContain("relevant to this specific task");
    expect((provider.requests[0].tools ?? []).map((t) => t.name)).not.toContain(
      USE_SKILL_TOOL_NAME,
    );
  });

  it("frames AGENTS.md as persistent guidance with no claim of relevance", async () => {
    const provider = scriptedProvider([{ text: "Answer." }]);

    await run(provider, "agents-md");

    const prompt = systemPromptOf(provider.requests[0]);
    expect(prompt).toContain(skill.instructions);
    expect(prompt).toContain("persistent repository instructions");
    expect(prompt).not.toContain("relevant to this specific task");
  });
});

describe("runAgent — loop safety", () => {
  it("forces a final answer when the model exhausts its tool budget", async () => {
    const workspace = new ReadOnlyWorkspace("bundle-bench");
    // Always asks for another file, never answers.
    const provider = scriptedProvider([
      { toolCalls: [toolCall("list_files", { path: "." })] },
    ]);

    const result = await runAgent({
      provider,
      configId: "baseline",
      task,
      skill,
      repoLabel: "bundle-bench",
      workspace,
    });

    expect(result.truncated).toBe(true);
    expect(result.modelCalls).toBe(MAX_AGENT_ITERATIONS + 1);
    expect(
      result.events.some((event) => event.label.includes("Tool budget exhausted")),
    ).toBe(true);
    // The forced call must not offer tools, or the loop would never terminate.
    expect(provider.requests.at(-1)!.tools).toBeUndefined();
  });

  it("reports a truthful tool failure when no workspace is mounted", async () => {
    const provider = scriptedProvider([
      { toolCalls: [toolCall("read_file", { path: "package.json" })] },
      { text: "Answering without the file." },
    ]);

    const result = await run(provider, "baseline");

    expect(result.toolCalls[0]).toEqual({
      name: "read_file",
      detail: "unavailable",
      ok: false,
    });
    expect(result.response).toBe("Answering without the file.");
  });

  it("accumulates token usage and model calls across turns", async () => {
    const provider = scriptedProvider([
      {
        toolCalls: [toolCall(USE_SKILL_TOOL_NAME, { reason: "Relevant." })],
        inputTokens: 500,
        outputTokens: 30,
      },
      { text: "Final.", inputTokens: 1200, outputTokens: 250 },
    ]);

    const result = await run(provider, "skill");

    expect(result.modelCalls).toBe(2);
    expect(result.inputTokens).toBe(1700);
    expect(result.outputTokens).toBe(280);
  });

  it("records a timeline of events that actually happened, in order", async () => {
    const provider = scriptedProvider([
      { toolCalls: [toolCall(USE_SKILL_TOOL_NAME, { reason: "Bundle regression." })] },
      { text: "Final." },
    ]);

    const result = await run(provider, "skill");

    const labels = result.events.map((event) => event.label);
    expect(labels[0]).toBe("Run started");
    expect(labels[1]).toMatch(/^Skill invoked: analyze-bundle — Bundle regression\.$/);
    expect(labels[2]).toMatch(/^Skill instructions loaded/);
    expect(labels[3]).toBe("Final response received");
    expect(result.events.every((event) => event.atMs >= 0)).toBe(true);
  });
});
