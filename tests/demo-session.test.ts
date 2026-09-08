import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createDemoSession,
  demoSessionFromRequest,
  isDemoAccessConfigured,
  verifyAccessCode,
  verifyDemoSession,
} from "@/lib/auth/demo-session";

beforeEach(() => {
  process.env.DEMO_ACCESS_CODE = "recruiter-demo-2026";
  process.env.DEMO_SESSION_SECRET = "a-long-independent-test-session-secret";
});

afterEach(() => {
  delete process.env.DEMO_ACCESS_CODE;
  delete process.env.DEMO_SESSION_SECRET;
});

describe("recruiter demo sessions", () => {
  it("accepts only the configured access code", async () => {
    expect(isDemoAccessConfigured()).toBe(true);
    await expect(verifyAccessCode("recruiter-demo-2026")).resolves.toBe(true);
    await expect(verifyAccessCode("wrong-code")).resolves.toBe(false);
  });

  it("signs and verifies an isolated guest session", async () => {
    const created = await createDemoSession();
    const restored = await verifyDemoSession(created.value);

    expect(restored?.id).toBe(created.session.id);
    expect(restored?.expiresAt).toBeGreaterThan(restored?.issuedAt ?? 0);
  });

  it("rejects a modified cookie", async () => {
    const created = await createDemoSession();
    await expect(verifyDemoSession(`${created.value}x`)).resolves.toBeNull();
  });

  it("rejects cross-origin mutations even with a valid cookie", async () => {
    const created = await createDemoSession();
    const request = new Request("https://skillbench.example/api/evaluations", {
      method: "POST",
      headers: {
        cookie: `skillbench_demo_session=${created.value}`,
        origin: "https://attacker.example",
      },
    });

    await expect(
      demoSessionFromRequest(request, { mutation: true }),
    ).resolves.toBeNull();
  });
});
