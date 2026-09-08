import { PROVIDER_MAX_RETRIES } from "./config";
import {
  ProviderError,
  type ModelMessage,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type ModelToolCall,
} from "./provider";

export const V0_API_BASE_URL = "https://v0.app/api/v2";

type V0Usage = {
  tokens?: {
    input?: number;
    output?: number;
  };
};

type V0Message = {
  role?: string;
  content?: string;
  finishReason?: string | null;
  usage?: V0Usage;
  parts?: Array<{ type?: string; text?: string }>;
};

type V0Session = {
  chatId: string;
  sentMessageCount: number;
};

type V0ProviderOptions = {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function responseText(message: V0Message) {
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content;
  }

  return (message.parts ?? [])
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function jsonCandidates(text: string) {
  const candidates: string[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1]);
  const braced = text.match(/\{[\s\S]*\}/);
  if (braced?.[0]) candidates.push(braced[0]);
  candidates.push(text);
  return candidates;
}

/**
 * v0 Platform API is an agent API rather than a function-calling model API.
 * This explicit response envelope lets it request one of SkillBench's tools;
 * the normal agent loop still validates and executes the request locally.
 */
export function parseV0ToolCalls(text: string): ModelToolCall[] {
  for (const candidate of jsonCandidates(text)) {
    let value: unknown;
    try {
      value = JSON.parse(candidate.trim());
    } catch {
      continue;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    if (record.skillbench_action !== "tool_calls" || !Array.isArray(record.calls)) {
      continue;
    }

    return record.calls.flatMap((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const call = item as Record<string, unknown>;
      if (typeof call.name !== "string" || !call.name.trim()) return [];
      const args =
        call.arguments &&
        typeof call.arguments === "object" &&
        !Array.isArray(call.arguments)
          ? call.arguments
          : {};

      return [
        {
          id:
            typeof call.id === "string" && call.id.trim()
              ? call.id
              : `v0-tool-${index + 1}`,
          name: call.name,
          argumentsJson: JSON.stringify(args),
        },
      ];
    });
  }

  return [];
}

function renderMessages(messages: ModelMessage[]) {
  return messages
    .filter((message) => message.role !== "system" && message.role !== "assistant")
    .map((message) => {
      if (message.role === "tool") {
        return `[Tool result for ${message.toolCallId}]\n${message.content}`;
      }
      return message.content;
    })
    .join("\n\n")
    .trim();
}

function buildSystemPrompt(request: ModelRequest) {
  const supplied = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");

  const toolProtocol = request.tools?.length
    ? `\n\n## SkillBench tool protocol

You are running inside SkillBench. Do not use v0's native file-editing, shell,
search, integration, or deployment tools. You cannot directly inspect the
benchmark repository. The only tools available are listed below and are
executed by SkillBench outside v0.

${request.tools
  .map(
    (tool) =>
      `- ${tool.name}: ${tool.description}\n  Arguments JSON Schema: ${JSON.stringify(tool.parameters)}`,
  )
  .join("\n")}

If you need a tool, reply with only this JSON envelope and no markdown fence:
{"skillbench_action":"tool_calls","calls":[{"id":"call_1","name":"tool_name","arguments":{}}]}

Use only listed tool names and valid arguments. Do not invent tool results. After
SkillBench returns a tool result, continue from it. When you can answer, return
only the final answer, without the envelope.`
    : `\n\nYou are running inside SkillBench. Do not use v0's native file-editing,
shell, search, integration, or deployment tools. Return only the requested
answer.`;

  const jsonInstruction = request.jsonMode
    ? "\n\nThe requested answer must be one valid JSON object with no markdown fence or surrounding prose."
    : "";

  return `${supplied}${toolProtocol}${jsonInstruction}`.trim();
}

function describeHttpError(status: number, detail: string) {
  if (status === 401 || status === 403) {
    return new ProviderError("v0 rejected the API key. Check V0_API_KEY.", {
      status,
    });
  }
  if (status === 404) {
    return new ProviderError("The v0 Platform API endpoint or chat was not found.", {
      status,
    });
  }
  if (status === 429) {
    return new ProviderError("v0 rate-limited the request.", {
      retryable: true,
      status,
    });
  }
  if (status >= 500) {
    return new ProviderError(`Transient v0 failure${detail ? `: ${detail}` : "."}`, {
      retryable: true,
      status,
    });
  }
  return new ProviderError(
    `v0 request failed (${status})${detail ? `: ${detail}` : "."}`,
    { status },
  );
}

function errorDetail(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  return "";
}

function latestAssistantMessage(value: unknown): V0Message | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const messages = Array.isArray(record.messages) ? record.messages : [];
  return (
    messages.find(
      (message): message is V0Message =>
        Boolean(message) &&
        typeof message === "object" &&
        !Array.isArray(message) &&
        (message as V0Message).role === "assistant",
    ) ?? null
  );
}

/**
 * Adapter for v0's current Platform API v2. A WeakMap keeps each agent run in
 * its own private v0 chat even when several benchmark runs execute concurrently.
 */
export function createV0Provider(options: V0ProviderOptions = {}): ModelProvider {
  const apiKey = options.apiKey ?? process.env.V0_API_KEY;
  if (!apiKey) {
    throw new ProviderError(
      "V0_API_KEY is not set. Add it to .env.local before running this evaluation.",
    );
  }

  const model = options.model ?? "v0-pro";
  const baseURL = (options.baseURL ?? process.env.V0_BASE_URL ?? V0_API_BASE_URL).replace(
    /\/$/,
    "",
  );
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 180_000;
  const sessions = new WeakMap<ModelMessage[], V0Session>();

  async function request(path: string, init: RequestInit): Promise<unknown> {
    let lastError: ProviderError | null = null;

    for (let attempt = 0; attempt < PROVIDER_MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetchImpl(`${baseURL}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...init.headers,
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const raw = await response.text();
        let body: unknown = {};
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            body = { message: raw.slice(0, 500) };
          }
        }

        if (!response.ok) throw describeHttpError(response.status, errorDetail(body));
        return body;
      } catch (error) {
        const described =
          error instanceof ProviderError
            ? error
            : new ProviderError(
                `Could not reach v0: ${error instanceof Error ? error.message : String(error)}`,
                { retryable: true, cause: error },
              );
        lastError = described;
        if (!described.retryable || attempt === PROVIDER_MAX_RETRIES - 1) {
          throw described;
        }
        await sleep(500 * 2 ** attempt + Math.random() * 250);
      }
    }

    throw lastError ?? new ProviderError("v0 request failed.");
  }

  async function generate(requestInput: ModelRequest): Promise<ModelResponse> {
    const startedAt = Date.now();
    const existing = sessions.get(requestInput.messages);
    const systemPrompt = buildSystemPrompt(requestInput);
    let message: V0Message | null = null;

    if (!existing) {
      const body = (await request("/chats", {
        method: "POST",
        body: JSON.stringify({
          message: renderMessages(requestInput.messages) || "Complete the requested task.",
          systemPrompt,
          modelConfiguration: { modelId: model, imageGenerations: false },
          privacy: "private",
          title: "SkillBench evaluation",
          metadata: { source: "skillbench" },
        }),
      })) as Record<string, unknown>;
      const chatValue = body.chat;
      const chatId =
        chatValue && typeof chatValue === "object" && !Array.isArray(chatValue)
          ? (chatValue as Record<string, unknown>).id
          : undefined;
      if (typeof chatId !== "string" || !chatId) {
        throw new ProviderError("v0 created a chat without returning its ID.");
      }

      sessions.set(requestInput.messages, {
        chatId,
        sentMessageCount: requestInput.messages.length,
      });
      const messages = await request(`/chats/${encodeURIComponent(chatId)}/messages`, {
        method: "GET",
      });
      message = latestAssistantMessage(messages);
    } else {
      const pending = requestInput.messages.slice(existing.sentMessageCount);
      const body = await request(
        `/chats/${encodeURIComponent(existing.chatId)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            message: renderMessages(pending) || "Continue and give the final answer.",
            systemPrompt,
            modelConfiguration: { modelId: model, imageGenerations: false },
          }),
        },
      );
      existing.sentMessageCount = requestInput.messages.length;
      message = body as V0Message;
    }

    if (!message) {
      throw new ProviderError("v0 completed the request without an assistant message.");
    }
    if (message.finishReason === "error") {
      throw new ProviderError("v0 reported an error while generating the response.");
    }

    const text = responseText(message);
    const toolCalls = requestInput.tools?.length ? parseV0ToolCalls(text) : [];

    return {
      text: toolCalls.length ? "" : text,
      toolCalls,
      inputTokens: message.usage?.tokens?.input ?? null,
      outputTokens: message.usage?.tokens?.output ?? null,
      latencyMs: Date.now() - startedAt,
      model,
      finishReason: toolCalls.length ? "tool_calls" : (message.finishReason ?? null),
    };
  }

  return { model, generate };
}
