import { afterEach, describe, expect, it } from "vitest";

import {
  createProviderForRequest,
} from "@/lib/eval/model-provider";
import { V0_API_BASE_URL } from "@/lib/eval/v0-provider";

const originalV0ApiKey = process.env.V0_API_KEY;

afterEach(() => {
  if (originalV0ApiKey === undefined) delete process.env.V0_API_KEY;
  else process.env.V0_API_KEY = originalV0ApiKey;
});

describe("model provider selection", () => {
  it("requires a dedicated v0 API key", () => {
    delete process.env.V0_API_KEY;

    expect(() =>
      createProviderForRequest({ provider: "v0", model: "v0-pro" }),
    ).toThrow(/V0_API_KEY is not set/);
  });

  it("creates the v0-compatible provider when credentials are present", () => {
    process.env.V0_API_KEY = "test-v0-key";

    const provider = createProviderForRequest({
      provider: "v0",
      model: "v0-pro",
    });

    expect(provider.model).toBe("v0-pro");
    expect(V0_API_BASE_URL).toBe("https://v0.app/api/v2");
  });
});
