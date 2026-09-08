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
    // Our own retry loop handles backoff so failures surface as ProviderError.
    maxRetries: 0,
    timeout: options.timeoutMs ?? 120_000,
  });

  let temperatureAllowed =
    options.supportsTemperature ?? supportsTemperature(model);

  async function callOnce(request: ModelRequest): Promise<ModelResponse> {
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
