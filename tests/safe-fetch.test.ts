import { afterEach, describe, expect, it, vi } from "vitest";

import { safeFetchUrl } from "@/lib/eval/safe-fetch";

afterEach(() => vi.unstubAllGlobals());

describe("safeFetchUrl", () => {
  it("blocks arbitrary hosts before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await safeFetchUrl("https://example.com/private");

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns bounded public text from the allowlisted host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("guidelines", {
          status: 200,
          headers: { "content-length": "10" },
        }),
      ),
    );

    const result = await safeFetchUrl(
      "https://raw.githubusercontent.com/org/repo/main/rules.md",
    );

    expect(result).toMatchObject({ ok: true, content: "guidelines" });
  });
});
