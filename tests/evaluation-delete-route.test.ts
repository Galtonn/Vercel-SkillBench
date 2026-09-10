import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DELETE } from "@/app/api/evaluations/[id]/route";
import {
  createDemoSession,
  DEMO_SESSION_COOKIE,
} from "@/lib/auth/demo-session";
import { createEvaluationRecord } from "@/lib/eval/runner";
import { loadEvaluation, saveEvaluation } from "@/lib/storage/evaluations";

import { makeSkill, makeTask } from "./helpers/factories";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "skillbench-delete-route-"));
  process.env.SKILLBENCH_DATA_DIR = dir;
  process.env.DEMO_SESSION_SECRET = "delete-route-test-secret";
});

afterEach(async () => {
  delete process.env.SKILLBENCH_DATA_DIR;
  delete process.env.DEMO_SESSION_SECRET;
  await rm(dir, { recursive: true, force: true });
});

describe("DELETE /api/evaluations/[id]", () => {
  it("deletes a running evaluation and reports that its work was stopped", async () => {
    const { session, value } = await createDemoSession();
    const record = createEvaluationRecord({
      id: "running-delete",
      ownerId: session.id,
      skill: makeSkill(),
      tasks: [makeTask()],
      request: {
        skillReference: "vercel-labs/dev3000/analyze-bundle",
        repo: "bundle-bench",
        model: "gpt-4o-mini",
        selectedConfigs: ["baseline"],
        runsPerConfig: 1,
        benchmarkId: "analyze-bundle",
        workspaceId: "bundle-bench",
      },
      question: "Does the skill help?",
    });
    record.status = "running";
    await saveEvaluation(record);

    const request = new Request(
      "http://localhost/api/evaluations/running-delete",
      {
        method: "DELETE",
        headers: {
          cookie: `${DEMO_SESSION_COOKIE}=${encodeURIComponent(value)}`,
          origin: "http://localhost",
        },
      },
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ id: record.id }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, stopped: true });
    expect(await loadEvaluation(record.id, session.id)).toBeNull();
  });
});
