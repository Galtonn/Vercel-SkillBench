import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
} from "openai";
import type {
  ChatCompletionFunctionTool,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type {
  FunctionTool,
  ResponseInput,
} from "openai/resources/responses/responses";

import { DEFAULT_MODEL, PROVIDER_MAX_RETRIES } from "./config";
import {
  ProviderError,
  type ModelMessage,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type ModelToolCall,
} from "./provider";

/**
 * Reasoning-family models reject `temperature`. Rather than maintaining a model
 * table, we skip the parameter for those prefixes and additionally recover if
 * any model rejects it at request time.
 */
const NO_TEMPERATURE_PREFIXES = ["o1", "o3", "o4", "gpt-5", "gpt-6"];

function supportsTemperature(model: string) {
  return !NO_TEMPERATURE_PREFIXES.some((prefix) => model.startsWith(prefix));
}

/**
 * The current frontier models only support reasoning-aware function calling on
 * the Responses API. Older models stay on Chat Completions to avoid changing a
 * working integration unnecessarily.
 */
export function usesResponsesApi(model: string) {
  return model.startsWith("gpt-5.6") || model.startsWith("gpt-6");
}

function toOpenAIMessages(
  messages: ModelMessage[],
): ChatCompletionMessageParam[] {
  return messages.map((message): ChatCompletionMessageParam => {
    switch (message.role) {
      case "system":
        return { role: "system", content: message.content };
      case "user":
        return { role: "user", content: message.content };
      case "tool":
        return {
          role: "tool",
          tool_call_id: message.toolCallId,
          content: message.content,
        };
      case "assistant":
        return {
          role: "assistant",
          content: message.content || null,
          ...(message.toolCalls?.length
            ? {
                tool_calls: message.toolCalls.map((call) => ({
                  id: call.id,
                  type: "function" as const,
                  function: {
                    name: call.name,
                    arguments: call.argumentsJson,
                  },
                })),
              }
            : {}),
        };
    }
  });
}

function toOpenAITools(
  request: ModelRequest,
): ChatCompletionFunctionTool[] | undefined {
  if (!request.tools?.length) return undefined;
  return request.tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function toResponsesTools(request: ModelRequest): FunctionTool[] | undefined {
  if (!request.tools?.length) return undefined;
  return request.tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    // SkillBench schemas intentionally allow flexible evaluator arguments.
    strict: false,
  }));
}

/** Converts provider-neutral history into Responses API input items. */
export function toResponsesInput(
  messages: ModelMessage[],
  options: { omitAssistant?: boolean } = {},
): ResponseInput {
  return messages.flatMap((message): ResponseInput => {
    switch (message.role) {
      case "system":
      case "user":
        return [{ type: "message", role: message.role, content: message.content }];
      case "tool":
        return [
          {
            type: "function_call_output",
            call_id: message.toolCallId,
            output: message.content,
          },
        ];
      case "assistant": {
        if (options.omitAssistant) return [];
        const input: ResponseInput = [];
        if (message.content) {
          input.push({
            type: "message",
            role: "assistant",
            content: message.content,
          });
        }
        for (const call of message.toolCalls ?? []) {
          input.push({
            type: "function_call",
            call_id: call.id,
            name: call.name,
            arguments: call.argumentsJson,
          });
        }
        return input;
      }
    }
  });
}

function describeError(
  error: unknown,
  context: { apiKeyEnv: string; providerLabel: string; model: string },
): ProviderError {
  if (error instanceof ProviderError) return error;

  if (error instanceof AuthenticationError) {
    return new ProviderError(
      `${context.providerLabel} rejected the API key. Check ${context.apiKeyEnv}.`,
      { status: error.status, cause: error },
    );
  }
  if (error instanceof NotFoundError) {
    return new ProviderError(
      `${context.providerLabel} does not recognise the requested model "${context.model}".`,
      { status: error.status, cause: error },
    );
  }
  if (error instanceof RateLimitError) {
    return new ProviderError("The model provider rate-limited the request.", {
      retryable: true,
      status: error.status,
      cause: error,
    });
  }
  if (
    error instanceof InternalServerError ||
    error instanceof APIConnectionTimeoutError ||
    error instanceof APIConnectionError
  ) {
    return new ProviderError(
      `Transient ${context.providerLabel} failure: ${error.message}`,
      { retryable: true, status: error.status ?? null, cause: error },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new ProviderError(`Model call failed: ${message}`, { cause: error });
}

function isTemperatureRejection(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /temperature/i.test(message) && /unsupported|not supported/i.test(message);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export type OpenAIProviderOptions = {
  apiKey?: string;
  apiKeyEnv?: "OPENAI_API_KEY" | "V0_API_KEY";
  model?: string;
  baseURL?: string;
  providerLabel?: string;
  supportsJsonMode?: boolean;
  supportsMaxCompletionTokens?: boolean;
  supportsTemperature?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type ResponsesSession = {
  responseId: string;
  sentMessageCount: number;
};

/**
 * Reads credentials from the environment only. The key never leaves the server:
 * every module that constructs a provider is imported exclusively from route
 * handlers and server-only helpers.
 */
export function createOpenAIProvider(
  options: OpenAIProviderOptions = {},
): ModelProvider {
  const apiKeyEnv = options.apiKeyEnv ?? "OPENAI_API_KEY";
  const providerLabel = options.providerLabel ?? "OpenAI";
  const apiKey = options.apiKey ?? process.env[apiKeyEnv];
  if (!apiKey) {
    throw new ProviderError(
      `${apiKeyEnv} is not set. Add it to .env.local before running this evaluation.`,
    );
  }

  const model = options.model ?? resolveModel();
  const baseURL = options.baseURL ?? process.env.OPENAI_BASE_URL ?? undefined;

  const client = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    ...(options.fetchImpl ? { fetch: options.fetchImpl } : {}),
    // Our own retry loop handles backoff so failures surface as ProviderError.
    maxRetries: 0,
    timeout: options.timeoutMs ?? 120_000,
  });

  let temperatureAllowed =
    options.supportsTemperature ?? supportsTemperature(model);
  const responsesSessions = new WeakMap<ModelMessage[], ResponsesSession>();

  async function callResponses(request: ModelRequest): Promise<ModelResponse> {
    const startedAt = Date.now();
    const session = responsesSessions.get(request.messages);
    const pendingMessages = session
      ? request.messages.slice(session.sentMessageCount)
      : request.messages;
    // A prior Responses result already contains its assistant function calls.
    // On continuation we only submit the corresponding outputs and new user input.
    const input = toResponsesInput(pendingMessages, {
      omitAssistant: Boolean(session),
    });
    const tools = toResponsesTools(request);
    const response = await client.responses.create({
      model,
      input: input.length
        ? input
        : [{ role: "user", content: "Continue and give the final answer." }],
      ...(session ? { previous_response_id: session.responseId } : {}),
      ...(tools ? { tools } : {}),
      ...(request.maxOutputTokens
        ? { max_output_tokens: request.maxOutputTokens }
        : {}),
      ...(options.supportsJsonMode !== false && request.jsonMode
        ? { text: { format: { type: "json_object" as const } } }
        : {}),
      reasoning: { effort: "low" },
      store: true,
    });

    if (response.error) {
      throw new ProviderError(`Model call failed: ${response.error.message}`);
    }
    if (response.status === "failed" || response.status === "cancelled") {
      throw new ProviderError(`Model call ended with status ${response.status}.`);
    }

    responsesSessions.set(request.messages, {
      responseId: response.id,
      sentMessageCount: request.messages.length,
    });

    const toolCalls: ModelToolCall[] = response.output
      .filter((item) => item.type === "function_call")
      .map((call) => ({
        id: call.call_id,
        name: call.name,
        argumentsJson: call.arguments,
      }));

    return {
      text: response.output_text ?? "",
      toolCalls,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      latencyMs: Date.now() - startedAt,
      model: response.model || model,
      finishReason:
        toolCalls.length > 0
          ? "tool_calls"
          : response.incomplete_details?.reason ?? response.status ?? null,
    };
  }

  async function callChatCompletions(
    request: ModelRequest,
  ): Promise<ModelResponse> {
    const startedAt = Date.now();
    const completion = await client.chat.completions.create({
      model,
      messages: toOpenAIMessages(request.messages),
      ...(toOpenAITools(request) ? { tools: toOpenAITools(request) } : {}),
      ...(temperatureAllowed && request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(options.supportsMaxCompletionTokens !== false && request.maxOutputTokens
        ? { max_completion_tokens: request.maxOutputTokens }
        : {}),
      ...(options.supportsJsonMode !== false && request.jsonMode
        ? { response_format: { type: "json_object" as const } }
        : {}),
    });

    const choice = completion.choices[0];
    const message = choice?.message;
    const toolCalls: ModelToolCall[] = (message?.tool_calls ?? [])
      .filter((call) => call.type === "function")
      .map((call) => ({
        id: call.id,
        name: call.function.name,
        argumentsJson: call.function.arguments,
      }));

    return {
      text: message?.content ?? "",
      toolCalls,
      inputTokens: completion.usage?.prompt_tokens ?? null,
      outputTokens: completion.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - startedAt,
      model: completion.model || model,
      finishReason: choice?.finish_reason ?? null,
    };
  }

  const callOnce = usesResponsesApi(model)
    ? callResponses
    : callChatCompletions;

  return {
    model,
    async generate(request: ModelRequest): Promise<ModelResponse> {
      let lastError: ProviderError | null = null;

      for (let attempt = 0; attempt < PROVIDER_MAX_RETRIES; attempt += 1) {
        try {
          return await callOnce(request);
        } catch (error) {
          if (temperatureAllowed && isTemperatureRejection(error)) {
            temperatureAllowed = false;
            continue;
          }
          const described = describeError(error, {
            apiKeyEnv,
            providerLabel,
            model,
          });
          lastError = described;
          if (!described.retryable || attempt === PROVIDER_MAX_RETRIES - 1) {
            throw described;
          }
          await sleep(500 * 2 ** attempt + Math.random() * 250);
        }
      }

      throw lastError ?? new ProviderError("Model call failed.");
    },
  };
}

export function resolveModel() {
  const configured = process.env.SKILLBENCH_MODEL?.trim();
  return configured || DEFAULT_MODEL;
}

export function hasProviderCredentials() {
  return Boolean(process.env.OPENAI_API_KEY);
}
