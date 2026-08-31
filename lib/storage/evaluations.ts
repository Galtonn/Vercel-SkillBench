import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EvaluationRecord } from "../eval/types";

/**
 * JSON-file persistence for evaluations.
 *
 * Deliberately boring: one file per evaluation under `data/evaluations/`. A saved
 * evaluation stays readable forever, with no dependency on the model provider,
 * which is what makes a previously completed run safe to demo even if the API is
 * unreachable.
 *
 * The reads here carry `turbopackIgnore` because these files are produced at
 * runtime. There is nothing for the bundler to include, and without the hint it
 * traces the entire project into the deployment output.
 */

/**
 * Where evaluations are written. SKILLBENCH_DATA_DIR lets the tests redirect
 * writes instead of touching the operator's real evaluations; it is read per
 * call so a test can set it after this module has been imported.
 */
function dataDir() {
  const override = process.env.SKILLBENCH_DATA_DIR;
  return override
    ? path.resolve(override)
    : path.join(process.cwd(), "data", "evaluations");
}

async function ensureDir() {
  await mkdir(dataDir(), { recursive: true });
}

function filePath(id: string) {
  return path.join(dataDir(), `${sanitizeId(id)}.json`);
}

/** Ids appear in file paths, so restrict them to a safe character set. */
export function sanitizeId(id: string) {
  const cleaned = id.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!cleaned || cleaned.startsWith(".")) {
    throw new Error(`Invalid evaluation id: "${id}"`);
  }
  return cleaned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validates the shape enough to be confident we are reading a SkillBench
 * evaluation and not arbitrary JSON.
 */
export function deserializeEvaluation(raw: string): EvaluationRecord {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error("Evaluation file does not contain an object.");
  }
  for (const key of ["id", "status", "createdAt", "request", "skill", "tasks", "runs"]) {
    if (!(key in parsed)) {
      throw new Error(`Evaluation file is missing "${key}".`);
    }
  }
  if (!Array.isArray(parsed.runs) || !Array.isArray(parsed.tasks)) {
    throw new Error("Evaluation file has malformed tasks or runs.");
  }
  return parsed as EvaluationRecord;
}

export function serializeEvaluation(record: EvaluationRecord): string {
  return JSON.stringify(record, null, 2);
}

/** Distinguishes concurrent writes to the same evaluation. */
let writeCounter = 0;

/**
 * Atomic write, so a reader never observes a half-written evaluation.
 *
 * The temp name includes a per-call counter: the runner persists progress from
 * several runs at once, and a shared temp path would let one write rename the
 * file out from under another.
 */
export async function saveEvaluation(record: EvaluationRecord): Promise<void> {
  await ensureDir();
  const target = filePath(record.id);
  writeCounter += 1;
  const temp = `${target}.${process.pid}.${writeCounter}.tmp`;
  try {
    await writeFile(temp, serializeEvaluation(record), "utf8");
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

export async function loadEvaluation(
  id: string,
): Promise<EvaluationRecord | null> {
  try {
    const raw = await readFile(/*turbopackIgnore: true*/ filePath(id), "utf8");
    return deserializeEvaluation(raw);
  } catch (error) {
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Removes the evaluation file. Returns false when there was nothing to delete.
 * The id is sanitised the same way as load/save, so this cannot reach outside
 * the data directory.
 */
export async function deleteEvaluation(id: string): Promise<boolean> {
  try {
    await rm(/*turbopackIgnore: true*/ filePath(id));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

export async function listEvaluations(): Promise<EvaluationRecord[]> {
  await ensureDir();
  const directory = dataDir();
  const entries = await readdir(/*turbopackIgnore: true*/ directory);
  const records: EvaluationRecord[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = await readFile(
        /*turbopackIgnore: true*/ path.join(directory, entry),
        "utf8",
      );
      records.push(deserializeEvaluation(raw));
    } catch {
      // A corrupt or partially written file must not take down the dashboard.
      continue;
    }
  }

  return records.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function generateEvaluationId(skillName: string): string {
  const slug =
    skillName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "eval";
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(2, 14);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug}-${stamp}-${suffix}`;
}

export function evaluationsDirectory() {
  return dataDir();
}
