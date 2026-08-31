import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { computeMetrics } from "@/lib/eval/metrics";
import {
  deleteEvaluation,
  deserializeEvaluation,
  evaluationsDirectory,
  generateEvaluationId,
  listEvaluations,
  loadEvaluation,
  sanitizeId,
  saveEvaluation,
  serializeEvaluation,
} from "@/lib/storage/evaluations";

import { makeRecord, makeRuns } from "./helpers/factories";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "skillbench-storage-"));
  process.env.SKILLBENCH_DATA_DIR = dir;
});

afterEach(async () => {
  delete process.env.SKILLBENCH_DATA_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("serialization", () => {
  it("round-trips a completed evaluation without losing data", () => {
    const runs = makeRuns("skill", [{ success: true, skillInvoked: true }]);
    const record = makeRecord({
      runs,
      metrics: computeMetrics({
        runs,
        selectedConfigs: ["skill"],
        wallClockMs: 252_000,
      }),
      findings: [{ id: "finding-1", severity: "high", title: "T", explanation: "E" }],
    });

    const restored = deserializeEvaluation(serializeEvaluation(record));

    expect(restored).toEqual(record);
  });

  it("preserves nulls rather than coercing them to zero", () => {
    const record = makeRecord({
      metrics: computeMetrics({ runs: [], selectedConfigs: ["baseline"], wallClockMs: null }),
    });

    const restored = deserializeEvaluation(serializeEvaluation(record));

    expect(restored.metrics!.configs[0].successRate).toBeNull();
    expect(restored.metrics!.wallClockMs).toBeNull();
    expect(restored.metrics!.trigger).toBeNull();
  });

  it("rejects JSON that is not a SkillBench evaluation", () => {
    expect(() => deserializeEvaluation("[]")).toThrow(/does not contain an object/);
    expect(() => deserializeEvaluation('{"id":"x"}')).toThrow(/missing "status"/);
    expect(() => deserializeEvaluation("not json")).toThrow();
  });

  it("rejects an evaluation with malformed runs", () => {
    const broken = JSON.stringify({ ...makeRecord(), runs: "nope" });
    expect(() => deserializeEvaluation(broken)).toThrow(/malformed tasks or runs/);
  });
});

describe("sanitizeId", () => {
  it("accepts a normal id unchanged", () => {
    expect(sanitizeId("valid-id_1.2")).toBe("valid-id_1.2");
  });

  it("strips path separators so an id cannot escape the data directory", () => {
    expect(sanitizeId("etc/passwd")).toBe("etcpasswd");
    expect(sanitizeId("a\\b")).toBe("ab");
  });

  it("rejects traversal, empty, and hidden-file ids outright", () => {
    for (const id of ["../../etc/passwd", "///", ".hidden", ""]) {
      expect(() => sanitizeId(id)).toThrow(/Invalid evaluation id/);
    }
  });

  it("refuses to load or save under a rejected id", async () => {
    await expect(loadEvaluation("../escape")).rejects.toThrow(/Invalid evaluation id/);
  });
});

describe("save and load", () => {
  it("persists an evaluation and reads it back", async () => {
    const record = makeRecord();

    await saveEvaluation(record);

    expect(await loadEvaluation(record.id)).toEqual(record);
    expect(evaluationsDirectory()).toBe(dir);
  });

  it("returns null for an evaluation that does not exist", async () => {
    expect(await loadEvaluation("no-such-evaluation")).toBeNull();
  });

  it("overwrites in place, so progress updates do not accumulate files", async () => {
    const record = makeRecord({ status: "running" });
    await saveEvaluation(record);
    await saveEvaluation({ ...record, status: "completed" });

    expect((await loadEvaluation(record.id))!.status).toBe("completed");
    expect(await listEvaluations()).toHaveLength(1);
  });

  it("leaves no temporary files behind after an atomic write", async () => {
    await saveEvaluation(makeRecord());

    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dir);
    expect(entries.filter((entry) => entry.includes(".tmp"))).toEqual([]);
  });
});

describe("deleteEvaluation", () => {
  it("removes a stored evaluation", async () => {
    const record = makeRecord();
    await saveEvaluation(record);

    expect(await deleteEvaluation(record.id)).toBe(true);
    expect(await loadEvaluation(record.id)).toBeNull();
    expect(await listEvaluations()).toEqual([]);
  });

  it("returns false when the evaluation does not exist", async () => {
    expect(await deleteEvaluation("no-such-evaluation")).toBe(false);
  });

  it("refuses to delete under a rejected id", async () => {
    await expect(deleteEvaluation("../escape")).rejects.toThrow(
      /Invalid evaluation id/,
    );
  });
});

describe("listEvaluations", () => {
  it("returns an empty list when nothing has been saved", async () => {
    expect(await listEvaluations()).toEqual([]);
  });

  it("sorts newest first", async () => {
    await saveEvaluation(makeRecord({ id: "older", createdAt: "2026-01-01T00:00:00.000Z" }));
    await saveEvaluation(makeRecord({ id: "newer", createdAt: "2026-02-01T00:00:00.000Z" }));

    expect((await listEvaluations()).map((record) => record.id)).toEqual(["newer", "older"]);
  });

  it("skips a corrupt file rather than failing the whole dashboard", async () => {
    await saveEvaluation(makeRecord({ id: "good" }));
    await writeFile(path.join(dir, "corrupt.json"), "{ not json", "utf8");

    const records = await listEvaluations();

    expect(records.map((record) => record.id)).toEqual(["good"]);
  });

  it("ignores non-JSON files in the data directory", async () => {
    await saveEvaluation(makeRecord({ id: "good" }));
    await writeFile(path.join(dir, "README.txt"), "notes", "utf8");

    expect(await listEvaluations()).toHaveLength(1);
  });
});

describe("generateEvaluationId", () => {
  it("builds a filesystem-safe slug from the skill name", () => {
    const id = generateEvaluationId("Analyze Bundle!");

    expect(id).toMatch(/^analyze-bundle-\d{12}-[a-z0-9]{4}$/);
    expect(sanitizeId(id)).toBe(id);
  });

  it("falls back to a default slug for a name with no usable characters", () => {
    expect(generateEvaluationId("!!!")).toMatch(/^eval-/);
  });

  it("does not collide across rapid successive calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateEvaluationId("skill")));
    expect(ids.size).toBe(50);
  });
});
