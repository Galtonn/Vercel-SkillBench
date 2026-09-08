import { describe, expect, it } from "vitest";

import {
  AGENT_OPTIONS,
  DEFAULT_AGENT_ID,
  getAgentOption,
} from "@/lib/eval/config";

describe("agent options", () => {
  it("maps every selectable profile to a unique model", () => {
    expect(new Set(AGENT_OPTIONS.map((agent) => agent.id)).size).toBe(
      AGENT_OPTIONS.length,
    );
    expect(new Set(AGENT_OPTIONS.map((agent) => agent.model)).size).toBe(
      AGENT_OPTIONS.length,
    );
  });

  it("has a valid default profile", () => {
    expect(getAgentOption(DEFAULT_AGENT_ID)?.model).toBe("gpt-5.6-terra");
  });

  it("includes older mini models for cross-generation comparisons", () => {
    expect(
      AGENT_OPTIONS.filter((agent) => agent.group === "legacy").map(
        (agent) => agent.model,
      ),
    ).toEqual(["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"]);
  });

  it("includes every v0 Platform API model with separate credentials", () => {
    expect(
      AGENT_OPTIONS.filter((agent) => agent.provider === "v0").map(
        (agent) => agent.model,
      ),
    ).toEqual(["v0-mini", "v0-pro", "v0-max", "v0-max-fast"]);

    expect(getAgentOption("v0")).toMatchObject({
      model: "v0-pro",
      provider: "v0",
      credential: "V0_API_KEY",
    });
    expect(getAgentOption("v0-auto")).toBeUndefined();
  });

  it("does not accept arbitrary model ids as agent profiles", () => {
    expect(getAgentOption("gpt-unknown-mini")).toBeUndefined();
    expect(getAgentOption(null)).toBeUndefined();
  });
});
