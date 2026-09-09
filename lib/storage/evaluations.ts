import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { neon } from "@neondatabase/serverless";

import type { EvaluationRecord } from "../eval/types";

/**
 * Evaluation persistence for both hosted and local use.
 *
 * Hosted deployments use Neon Postgres whenever DATABASE_URL is present. Local
 * development and tests retain the deliberately boring one-JSON-file-per-run
 * backend, keeping the engine easy to exercise without cloud dependencies.
 *
 * Local reads carry `turbopackIgnore` because these files are produced at
 * runtime. There is nothing for the bundler to include, and without the hint it
 * traces the entire project into the deployment output.
 */

/**
 * Where evaluations are written. SKILLBENCH_DATA_DIR lets the tests redirect
 * writes instead of touching the operator's real evaluations; it is read per
 * call so a test can set it after this module has been imported.
 */
function dataDir() {
  if (process.env.NODE_ENV === "production" && !process.env.SKILLBENCH_DATA_DIR) {
    throw new Error(
      "DATABASE_URL is required in production. Connect the Neon integration to this Vercel project.",
    );
  }
  const override = process.env.SKILLBENCH_DATA_DIR;
  return override
    ? path.resolve(override)
    : path.join(process.cwd(), "data", "evaluations");
}

function databaseUrl(): string | null {
  // Tests deliberately force filesystem storage even when the host environment
  // happens to expose a DATABASE_URL.
  if (process.env.SKILLBENCH_DATA_DIR) return null;
  return process.env.DATABASE_URL || null;
}

let initializedFor: string | null = null;
let initialization: Promise<void> | null = null;

function database() {
  const url = databaseUrl();
  if (!url) return null;
  return neon(url);
}

async function ensureDatabase() {
  const url = databaseUrl();
  if (!url) return;
  if (initializedFor !== url || !initialization) {
    initializedFor = url;
    const sql = neon(url);
    initialization = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS skillbench_evaluations (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          payload JSONB NOT NULL,
          cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        ALTER TABLE skillbench_evaluations
        ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT FALSE
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS skillbench_evaluations_owner_created_idx
        ON skillbench_evaluations (owner_id, created_at DESC)
      `;
    })();
  }
  await initialization;
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
 * Atomic local write, so a reader never observes a half-written evaluation.
 *
 * The temp name includes a per-call counter: the runner persists progress from
 * several runs at once, and a shared temp path would let one write rename the
 * file out from under another.
 */
export async function saveEvaluation(record: EvaluationRecord): Promise<void> {
  const sql = database();
  if (sql) {
    if (!record.ownerId) {
      throw new Error("An owner id is required for production evaluations.");
    }
    await ensureDatabase();
    const payload = serializeEvaluation(record);
    await sql`
      INSERT INTO skillbench_evaluations (id, owner_id, payload, created_at, updated_at)
      VALUES (${record.id}, ${record.ownerId}, ${payload}::jsonb, ${record.createdAt}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        owner_id = EXCLUDED.owner_id,
        payload = EXCLUDED.payload,
        updated_at = NOW()
    `;
    return;
  }

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
  ownerId?: string,
): Promise<EvaluationRecord | null> {
  sanitizeId(id);
  const sql = database();
  if (sql) {
    await ensureDatabase();
    const rows = ownerId
      ? await sql`
          SELECT payload FROM skillbench_evaluations
          WHERE id = ${id} AND owner_id = ${ownerId}
          LIMIT 1
        `
      : await sql`
          SELECT payload FROM skillbench_evaluations
          WHERE id = ${id}
          LIMIT 1
        `;
    const payload = (rows[0] as { payload?: unknown } | undefined)?.payload;
    if (!payload) return null;
    return deserializeEvaluation(
      typeof payload === "string" ? payload : JSON.stringify(payload),
    );
  }

  try {
    const raw = await readFile(/*turbopackIgnore: true*/ filePath(id), "utf8");
    const record = deserializeEvaluation(raw);
    return ownerId && record.ownerId !== ownerId ? null : record;
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
export async function deleteEvaluation(id: string, ownerId?: string): Promise<boolean> {
  sanitizeId(id);
  const sql = database();
  if (sql) {
    await ensureDatabase();
    const rows = ownerId
      ? await sql`
          DELETE FROM skillbench_evaluations
          WHERE id = ${id} AND owner_id = ${ownerId}
          RETURNING id
        `
      : await sql`
          DELETE FROM skillbench_evaluations
          WHERE id = ${id}
          RETURNING id
        `;
    return rows.length > 0;
  }

  try {
    if (ownerId && !(await loadEvaluation(id, ownerId))) return false;
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

export async function listEvaluations(ownerId?: string): Promise<EvaluationRecord[]> {
  const sql = database();
  if (sql) {
    await ensureDatabase();
    const rows = ownerId
      ? await sql`
          SELECT payload FROM skillbench_evaluations
          WHERE owner_id = ${ownerId}
          ORDER BY created_at DESC
        `
      : await sql`
          SELECT payload FROM skillbench_evaluations
          ORDER BY created_at DESC
        `;
    return rows.flatMap((row) => {
      try {
        const payload = (row as { payload?: unknown }).payload;
        if (!payload) return [];
        return [
          deserializeEvaluation(
            typeof payload === "string" ? payload : JSON.stringify(payload),
          ),
        ];
      } catch {
        return [];
      }
    });
  }

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
      const record = deserializeEvaluation(raw);
      if (!ownerId || record.ownerId === ownerId) records.push(record);
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
  return `${slug}-${crypto.randomUUID()}`;
}

export async function markEvaluationCancellationRequested(
  id: string,
  ownerId: string,
): Promise<boolean> {
  sanitizeId(id);
  const sql = database();
  if (sql) {
    await ensureDatabase();
    const rows = await sql`
      UPDATE skillbench_evaluations
      SET cancel_requested = TRUE, updated_at = NOW()
      WHERE id = ${id} AND owner_id = ${ownerId}
      RETURNING id
    `;
    return rows.length > 0;
  }

  const record = await loadEvaluation(id, ownerId);
  if (!record) return false;
  record.cancellationRequestedAt = new Date().toISOString();
  await saveEvaluation(record);
  return true;
}

export async function isEvaluationCancellationRequested(
  id: string,
): Promise<boolean> {
  sanitizeId(id);
  const sql = database();
  if (sql) {
    await ensureDatabase();
    const rows = await sql`
      SELECT cancel_requested FROM skillbench_evaluations
      WHERE id = ${id}
      LIMIT 1
    `;
    return Boolean(
      (rows[0] as { cancel_requested?: boolean } | undefined)?.cancel_requested,
    );
  }

  return Boolean((await loadEvaluation(id))?.cancellationRequestedAt);
}

export function evaluationsDirectory() {
  return dataDir();
}
