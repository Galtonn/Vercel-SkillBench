import { describe, expect, it, vi } from "vitest";

import { createV0Provider, parseV0ToolCalls } from "@/lib/eval/v0-provider";
import type { ModelMessage } from "@/lib/eval/provider";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("v0 Platform API provider", () => {
  it("parses only the explicit SkillBench tool envelope", () => {
    expect(
      parseV0ToolCalls(
        '```json\n{"skillbench_action":"tool_calls","calls":[{"name":"read_file","arguments":{"path":"app/page.tsx"}}]}\n```',
      ),
    ).toEqual([
      {
        id: "v0-tool-1",
        name: "read_file",
        argumentsJson: '{"path":"app/page.tsx"}',
      },
    ]);
    expect(parseV0ToolCalls('{"answer":"read_file"}')).toEqual([]);
  });

  it("creates a private v0 chat and returns its measured response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ chat: { id: "chat_1" }, usage: {} }))
      .mockResolvedValueOnce(
        jsonResponse({
          messages: [
            {
              role: "assistant",
              content: "The answer is 42.",
              finishReason: "stop",
              usage: { tokens: { input: 12, output: 5 } },
            },
          ],
        }),
      );
    const provider = createV0Provider({
      apiKey: "test-key",
      model: "v0-pro",
      baseURL: "https://example.test/api/v2",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await provider.generate({
      messages: [
        { role: "system", content: "Be exact." },
        { role: "user", content: "What is six times seven?" },
      ],
    });

    expect(result).toMatchObject({
      text: "The answer is 42.",
      inputTokens: 12,
      outputTokens: 5,
      model: "v0-pro",
      finishReason: "stop",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/api/v2/chats");
    expect(JSON.parse(String(init.body))).toMatchObject({
      message: "What is six times seven?",
      privacy: "private",
      modelConfiguration: { modelId: "v0-pro", imageGenerations: false },
    });
  });

  it("keeps tool turns in the same v0 chat", async () => {
    const envelope =
      '{"skillbench_action":"tool_calls","calls":[{"id":"call_1","name":"use_skill","arguments":{"reason":"Relevant"}}]}';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ chat: { id: "chat_tools" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          messages: [
            { role: "assistant", content: envelope, finishReason: "stop" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          role: "assistant",
          content: "Final answer from the loaded skill.",
          finishReason: "stop",
          usage: { tokens: { input: 20, output: 7 } },
        }),
      );
    const provider = createV0Provider({
      apiKey: "test-key",
      baseURL: "https://example.test/api/v2",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const messages: ModelMessage[] = [
      { role: "system", content: "Investigate." },
      { role: "user", content: "Diagnose the issue." },
    ];
    const tools = [
      {
        name: "use_skill",
        description: "Load the skill.",
        parameters: { type: "object" },
      },
    ];

    const first = await provider.generate({ messages, tools });
    expect(first.toolCalls).toEqual([
      {
        id: "call_1",
        name: "use_skill",
        argumentsJson: '{"reason":"Relevant"}',
      },
    ]);

    messages.push({ role: "assistant", content: "", toolCalls: first.toolCalls });
    messages.push({
      role: "tool",
      toolCallId: "call_1",
      content: "Skill instructions loaded.",
    });
    const second = await provider.generate({ messages, tools: undefined });

    expect(second.text).toBe("Final answer from the loaded skill.");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe(
      "https://example.test/api/v2/chats/chat_tools/messages",
    );
    const followUp = JSON.parse(
      String((fetchMock.mock.calls[2][1] as RequestInit).body),
    );
    expect(followUp.message).toContain("Skill instructions loaded.");
  });

  it("surfaces v0 authentication failures without exposing credentials", async () => {
    const provider = createV0Provider({
      apiKey: "secret-key",
      fetchImpl: vi
        .fn()
        .mockResolvedValue(jsonResponse({ message: "Unauthorized" }, 401)) as unknown as typeof fetch,
    });

    await expect(
      provider.generate({ messages: [{ role: "user", content: "hello" }] }),
    ).rejects.toThrow("Check V0_API_KEY");
  });
});
