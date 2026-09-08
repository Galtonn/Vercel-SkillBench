import type { EvaluationRequest } from "./types";
import { createOpenAIProvider } from "./openai-provider";
import { createV0Provider } from "./v0-provider";

/**
 * Builds the API client for the agent selected on an evaluation.
 */
export function createProviderForRequest(
  request: Pick<EvaluationRequest, "model" | "provider">,
) {
  const provider =
    request.provider ?? (request.model.startsWith("v0-") ? "v0" : "openai");

  if (provider === "v0") {
    return createV0Provider({
      model: request.model,
    });
  }

  return createOpenAIProvider({ model: request.model });
}
