import { describe, expect, it } from "vitest";

import {
  createOpenAIProvider,
  toResponsesInput,
  usesResponsesApi,
} from "@/lib/eval/openai-provider";
import type { ModelMessage } from "@/lib/eval/provider";

function responseBody(
  model: string,
  output: Array<Record<string, unknown>>,
  outputText = "",
) {
  const responseOutput = outputText
    ? [
        ...output,
        {
          type: "message",
          id: "msg_1",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: outputText,
              annotations: [],
              logprobs: [],
            },
          ],
        },
      ]
    : output;
  return {
    id: `resp_${Math.random().toString(36).slice(2)}`,
    object: "response",
    created_at: 0,
    status: "completed",
    error: null,
    incomplete_details: null,
    instructions: null,
    model,
    output: responseOutput,
    usage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens: 5,
      output_tokens_details: { reasoning_tokens: 1 },
      total_tokens: 15,
    },
  };
}

describe("OpenAI provider", () => {
  it("routes every current reasoning agent model through Responses", () => {
    for (const model of [
      "gpt-6-astra",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
    ]) {
      expect(usesResponsesApi(model)).toBe(true);
    }
    expect(usesResponsesApi("gpt-5-mini")).toBe(false);
    expect(usesResponsesApi("gpt-4o-mini")).toBe(false);
  });

  it("converts tool history to Responses function-call items", () => {
    const input = toResponsesInput([
      { role: "system", content: "Inspect the repository." },
      { role: "user", content: "Read package.json" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call_1", name: "read_file", argumentsJson: '{"path":"package.json"}' },
        ],
      },
      { role: "tool", toolCallId: "call_1", content: '{"name":"demo"}' },
    ]);

    expect(input.map((item) => item.type)).toEqual([
      "message",
      "message",
      "function_call",
      "function_call_output",
    ]);
  });

  it("continues a Terra tool loop with previous_response_id", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    let call = 0;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ url, body });
      call += 1;
      const payload =
        call === 1
          ? {
              ...responseBody("gpt-5.6-terra", [
                {
                  type: "function_call",
                  id: "fc_1",
                  call_id: "call_1",
                  name: "read_file",
                  arguments: '{"path":"package.json"}',
                  status: "completed",
                },
              ]),
              id: "resp_first",
            }
          : responseBody("gpt-5.6-terra", [], "The package is named demo.");
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const provider = createOpenAIProvider({
      apiKey: "test-key",
      model: "gpt-5.6-terra",
      fetchImpl,
    });
    const messages: ModelMessage[] = [
      { role: "system", content: "Inspect the repository." },
      { role: "user", content: "Read package.json" },
    ];
    const tools = [
      {
        name: "read_file",
        description: "Read a file",
        parameters: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    ];

    const first = await provider.generate({ messages, tools, maxOutputTokens: 200 });
    messages.push({ role: "assistant", content: first.text, toolCalls: first.toolCalls });
    messages.push({ role: "tool", toolCallId: "call_1", content: '{"name":"demo"}' });
    const second = await provider.generate({ messages, tools, maxOutputTokens: 200 });

    expect(requests.map((request) => request.url)).toEqual([
      "https://api.openai.com/v1/responses",
      "https://api.openai.com/v1/responses",
    ]);
    expect(requests[0].body.reasoning).toEqual({ effort: "low" });
    expect(requests[1].body.previous_response_id).toBe("resp_first");
    expect(requests[1].body.input).toEqual([
      { type: "function_call_output", call_id: "call_1", output: '{"name":"demo"}' },
    ]);
    expect(second.text).toBe("The package is named demo.");
  });
});
