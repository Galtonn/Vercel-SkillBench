/**
 * Model provider abstraction.
 *
 * The runner only ever talks to `ModelProvider`, so adding a second vendor means
 * adding one file. Tests supply a scripted provider; production code never does.
 */

export type ModelRole = "system" | "user" | "assistant" | "tool";

export type ModelToolCall = {
  id: string;
  name: string;
  /** Raw JSON string as emitted by the model. */
  argumentsJson: string;
};

export type ModelMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls?: ModelToolCall[];
    }
  | { role: "tool"; toolCallId: string; content: string };

export type ModelToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema for the tool arguments. */
  parameters: Record<string, unknown>;
};

export type ModelRequest = {
  messages: ModelMessage[];
  tools?: ModelToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Ask the provider for a JSON object response. Used by the judge. */
  jsonMode?: boolean;
};

export type ModelResponse = {
  text: string;
  toolCalls: ModelToolCall[];
  /** Null when the provider does not report usage. */
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  model: string;
  finishReason: string | null;
};

export interface ModelProvider {
  readonly model: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
}

/** Thrown for provider problems we can describe usefully in the UI. */
export class ProviderError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(
    message: string,
    options: { retryable?: boolean; status?: number | null; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ProviderError";
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? null;
  }
}

export function parseToolArguments(
  call: ModelToolCall,
): Record<string, unknown> {
  if (!call.argumentsJson.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(call.argumentsJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
