import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { ModelToolDefinition } from "./provider";

/**
 * A read-only view over a benchmark fixture directory.
 *
 * The agent gets bounded read, search, and NDJSON-query tools. There is no write
 * path and no shell: model output can never execute on the host. Every
 * path is resolved through `realpath` and rejected unless it stays inside the
 * fixture root, so symlinks cannot escape the sandbox.
 */

const MAX_FILE_BYTES = 96 * 1024;
const MAX_BATCH_FILES = 8;
const MAX_BATCH_BYTES = 96 * 1024;
const MAX_ENTRIES = 400;
const MAX_SEARCH_MATCHES = 100;
const MAX_QUERY_ROWS = 100;

type JsonPrimitive = string | number | boolean | null;
type JsonFilter = { field: string; equals: JsonPrimitive };
type JsonLinesQuery = {
  field?: string;
  equals?: JsonPrimitive;
  filters?: JsonFilter[];
  groupBy?: string;
  maxBy?: string;
  sortBy?: string;
  descending?: boolean;
  limit?: number;
  fields?: string[];
};

const IGNORED_ENTRIES = new Set(["node_modules", ".git"]);

export type WorkspaceToolResult = {
  content: string;
  ok: boolean;
  /** Short description of the call for the run timeline. */
  detail: string;
};

/** Fixture directories live here and nowhere else. */
export const FIXTURES_ROOT_SEGMENT = "fixtures";

export class ReadOnlyWorkspace {
  private readonly root: string;
  private rootRealPath: string | null = null;

  /**
   * @param fixtureName a single directory name under `fixtures/`. Anchoring the
   * root to a literal path segment keeps the sandbox inside the repository and
   * lets the bundler scope its file tracing.
   *
   * The name is rejected unless it is a plain segment: `basename` alone is not
   * enough, because it leaves "..", which `join` would then normalise back out
   * of the fixtures directory.
   */
  constructor(fixtureName: string) {
    if (!/^[a-zA-Z0-9._-]+$/.test(fixtureName) || fixtureName.startsWith(".")) {
      throw new Error(`Invalid fixture name: "${fixtureName}"`);
    }
    this.root = path.join(process.cwd(), FIXTURES_ROOT_SEGMENT, fixtureName);
  }

  private async resolveRoot() {
    if (!this.rootRealPath) {
      this.rootRealPath = await realpath(this.root);
    }
    return this.rootRealPath;
  }

  /**
   * Maps a model-supplied path into an absolute path inside the fixture, or
   * returns null when the path escapes the sandbox.
   */
  private async safeResolve(requested: string): Promise<string | null> {
    const root = await this.resolveRoot();
    const normalized = requested.trim().replace(/^\/+/, "") || ".";
    const candidate = path.resolve(root, normalized);

    if (candidate !== root && !candidate.startsWith(root + path.sep)) {
      return null;
    }

    // Resolve symlinks for anything that exists; a missing path is reported by
    // the caller as a normal "not found" tool result.
    //
    // The bundler warns that this read is too dynamic to trace and so pulls the
    // whole project into the deployment output. That is the desired outcome here:
    // the fixture files must ship for the benchmark to run.
    try {
      const real = await realpath(candidate);
      if (real !== root && !real.startsWith(root + path.sep)) return null;
      return real;
    } catch {
      return candidate;
    }
  }

  async listFiles(requested: string): Promise<WorkspaceToolResult> {
    const detail = `list_files ${requested || "."}`;
    const resolved = await this.safeResolve(requested || ".");
    if (!resolved) {
      return {
        ok: false,
        detail,
        content: "Error: path is outside the repository sandbox.",
      };
    }

    try {
      const info = await stat(resolved);
      if (!info.isDirectory()) {
        return {
          ok: false,
          detail,
          content: `Error: ${requested} is a file, not a directory. Use read_file.`,
        };
      }
    } catch {
      return { ok: false, detail, content: `Error: ${requested} does not exist.` };
    }

    const root = await this.resolveRoot();
    const lines: string[] = [];

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (lines.length >= MAX_ENTRIES || depth > 6) return;
      const entries = await readdir(dir, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of entries) {
        if (lines.length >= MAX_ENTRIES) return;
        if (IGNORED_ENTRIES.has(entry.name)) continue;
        const absolute = path.join(dir, entry.name);
        const relative = path.relative(root, absolute) || ".";
        if (entry.isDirectory()) {
          lines.push(`${relative}/`);
          await walk(absolute, depth + 1);
        } else if (entry.isFile()) {
          const info = await stat(absolute);
          lines.push(`${relative} (${info.size} bytes)`);
        }
      }
    };

    await walk(resolved, 0);

    if (lines.length === 0) {
      return { ok: true, detail, content: "(empty directory)" };
    }

    return { ok: true, detail, content: lines.join("\n") };
  }

  async readFile(requested: string): Promise<WorkspaceToolResult> {
    const detail = `read_file ${requested}`;
    if (!requested?.trim()) {
      return { ok: false, detail, content: "Error: `path` is required." };
    }

    const resolved = await this.safeResolve(requested);
    if (!resolved) {
      return {
        ok: false,
        detail,
        content: "Error: path is outside the repository sandbox.",
      };
    }

    try {
      const info = await stat(resolved);
      if (info.isDirectory()) {
        return {
          ok: false,
          detail,
          content: `Error: ${requested} is a directory. Use list_files.`,
        };
      }
      const contents = await readFile(resolved, "utf8");
      if (Buffer.byteLength(contents, "utf8") > MAX_FILE_BYTES) {
        const truncated = contents.slice(0, MAX_FILE_BYTES);
        return {
          ok: true,
          detail,
          content: `${truncated}\n\n[truncated at ${MAX_FILE_BYTES} bytes]`,
        };
      }
      return { ok: true, detail, content: contents };
    } catch {
      return {
        ok: false,
        detail,
        content: `Error: ${requested} does not exist in this repository.`,
      };
    }
  }

  /** Reads a small, explicit set of files in one model turn. */
  async readFiles(requested: string[]): Promise<WorkspaceToolResult> {
    const paths = requested
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, MAX_BATCH_FILES);
    const detail = `read_files ${paths.length} file${paths.length === 1 ? "" : "s"}`;
    if (paths.length === 0) {
      return {
        ok: false,
        detail,
        content: `Error: \`paths\` must contain 1-${MAX_BATCH_FILES} file paths.`,
      };
    }

    const sections: string[] = [];
    let totalBytes = 0;
    let allOk = true;

    for (const filePath of paths) {
      const result = await this.readFile(filePath);
      const section = `## ${filePath}\n\n${result.content}`;
      const sectionBytes = Buffer.byteLength(section, "utf8");
      if (totalBytes + sectionBytes > MAX_BATCH_BYTES) {
        sections.push(
          `[batch truncated before ${filePath} at ${MAX_BATCH_BYTES} bytes]`,
        );
        allOk = false;
        break;
      }
      sections.push(section);
      totalBytes += sectionBytes;
      allOk &&= result.ok;
    }

    return { ok: allOk, detail, content: sections.join("\n\n") };
  }

  /** Literal, case-insensitive repository search used as a safe grep equivalent. */
  async searchFiles(
    requested: string,
    query: string,
  ): Promise<WorkspaceToolResult> {
    const detail = `search_files ${requested || "."} for ${query}`;
    const needle = query.trim().toLowerCase();
    if (!needle || needle.length > 200) {
      return {
        ok: false,
        detail,
        content: "Error: `query` must contain 1-200 characters.",
      };
    }

    const resolved = await this.safeResolve(requested || ".");
    if (!resolved) {
      return {
        ok: false,
        detail,
        content: "Error: path is outside the repository sandbox.",
      };
    }

    const root = await this.resolveRoot();
    const files: string[] = [];

    const collect = async (entryPath: string, depth: number): Promise<void> => {
      if (files.length >= MAX_ENTRIES || depth > 6) return;
      let info;
      try {
        info = await stat(entryPath);
      } catch {
        return;
      }
      if (info.isFile()) {
        files.push(entryPath);
        return;
      }
      if (!info.isDirectory()) return;

      const entries = await readdir(entryPath, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (files.length >= MAX_ENTRIES) return;
        if (IGNORED_ENTRIES.has(entry.name)) continue;
        await collect(path.join(entryPath, entry.name), depth + 1);
      }
    };

    await collect(resolved, 0);
    const matches: string[] = [];

    for (const file of files) {
      if (matches.length >= MAX_SEARCH_MATCHES) break;
      try {
        const info = await stat(file);
        if (info.size > MAX_FILE_BYTES) continue;
        const contents = await readFile(file, "utf8");
        const relative = path.relative(root, file);
        contents.split("\n").forEach((line, index) => {
          if (
            matches.length < MAX_SEARCH_MATCHES &&
            line.toLowerCase().includes(needle)
          ) {
            matches.push(`${relative}:${index + 1}:${line.trim()}`);
          }
        });
      } catch {
        continue;
      }
    }

    return {
      ok: true,
      detail,
      content:
        matches.length > 0
          ? matches.join("\n")
          : `No matches for ${JSON.stringify(query)} under ${requested || "."}.`,
    };
  }

  /**
   * Reads NDJSON and performs bounded filtering/sorting/projection without
   * executing jq or any model-supplied code.
   */
  async queryJsonLines(
    requested: string,
    options: JsonLinesQuery,
  ): Promise<WorkspaceToolResult> {
    const detail = `query_json_lines ${requested}`;
    const resolved = await this.safeResolve(requested);
    if (!resolved) {
      return {
        ok: false,
        detail,
        content: "Error: path is outside the repository sandbox.",
      };
    }

    let contents: string;
    try {
      const info = await stat(resolved);
      if (!info.isFile()) {
        return {
          ok: false,
          detail,
          content: "Error: path must be an NDJSON file.",
        };
      }
      if (info.size > MAX_FILE_BYTES) {
        return {
          ok: false,
          detail,
          content: `Error: NDJSON files may not exceed ${MAX_FILE_BYTES} bytes.`,
        };
      }
      contents = await readFile(resolved, "utf8");
    } catch {
      return {
        ok: false,
        detail,
        content: `Error: ${requested} does not exist.`,
      };
    }

    const rows: Record<string, unknown>[] = [];
    const lines = contents.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) continue;
      try {
        const value: unknown = JSON.parse(line);
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return {
            ok: false,
            detail,
            content: `Error: line ${index + 1} is not a JSON object.`,
          };
        }
        rows.push(value as Record<string, unknown>);
      } catch {
        return {
          ok: false,
          detail,
          content: `Error: line ${index + 1} is not valid JSON.`,
        };
      }
    }

    if (rows.length === 0) {
      return {
        ok: false,
        detail,
        content: "Error: file contains no JSON objects.",
      };
    }

    if (Boolean(options.groupBy) !== Boolean(options.maxBy)) {
      return {
        ok: false,
        detail,
        content: "Error: `groupBy` and `maxBy` must be provided together.",
      };
    }

    const valueAt = (row: Record<string, unknown>, field: string | undefined) =>
      field
        ?.split(".")
        .filter(Boolean)
        .reduce<unknown>((value, key) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            return undefined;
          }
          return (value as Record<string, unknown>)[key];
        }, row);

    const filters = [
      ...(options.field && Object.hasOwn(options, "equals")
        ? [{ field: options.field, equals: options.equals ?? null }]
        : []),
      ...(options.filters ?? []),
    ];
    let selected = rows.filter((row) =>
      filters.every((filter) => valueAt(row, filter.field) === filter.equals),
    );

    if (options.groupBy && options.maxBy) {
      const groups = new Map<string, Record<string, unknown>>();
      for (const row of selected) {
        const key = JSON.stringify(valueAt(row, options.groupBy));
        const current = groups.get(key);
        const candidateValue = valueAt(row, options.maxBy);
        const currentValue = current ? valueAt(current, options.maxBy) : undefined;
        const isLarger =
          !current ||
          (typeof candidateValue === "number" &&
            (typeof currentValue !== "number" || candidateValue > currentValue)) ||
          (typeof candidateValue === "string" &&
            typeof currentValue === "string" &&
            candidateValue.localeCompare(currentValue) > 0);
        if (isLarger) groups.set(key, row);
      }
      selected = [...groups.values()];
    }

    if (options.sortBy) {
      selected = [...selected].sort((a, b) => {
        const left = valueAt(a, options.sortBy);
        const right = valueAt(b, options.sortBy);
        const order =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left ?? "").localeCompare(String(right ?? ""));
        return options.descending ? -order : order;
      });
    }

    const limit = Math.min(
      MAX_QUERY_ROWS,
      Math.max(1, Math.floor(options.limit ?? 20)),
    );
    const fields = (options.fields ?? []).filter(
      (field): field is string => typeof field === "string" && Boolean(field),
    );
    const output = selected.slice(0, limit).map((row) => {
      if (fields.length === 0) return row;
      return Object.fromEntries(
        fields.map((field) => [field, valueAt(row, field)]),
      );
    });

    return {
      ok: true,
      detail,
      content:
        output.length > 0
          ? output.map((row) => JSON.stringify(row)).join("\n")
          : "No rows matched the query.",
    };
  }

  async call(name: string, args: Record<string, unknown>): Promise<WorkspaceToolResult> {
    const requested = typeof args.path === "string" ? args.path : "";
    if (name === "list_files") return this.listFiles(requested);
    if (name === "read_file") return this.readFile(requested);
    if (name === "read_files") {
      return this.readFiles(
        Array.isArray(args.paths)
          ? args.paths.filter((entry): entry is string => typeof entry === "string")
          : [],
      );
    }
    if (name === "search_files") {
      return this.searchFiles(
        requested,
        typeof args.query === "string" ? args.query : "",
      );
    }
    if (name === "query_json_lines") {
      const equals = args.equals;
      return this.queryJsonLines(requested, {
        ...(typeof args.field === "string" ? { field: args.field } : {}),
        ...(Object.hasOwn(args, "equals") &&
        (equals === null ||
          typeof equals === "string" ||
        typeof equals === "number" ||
        typeof equals === "boolean")
          ? { equals }
          : {}),
        ...(Array.isArray(args.filters)
          ? {
              filters: args.filters.flatMap((filter) => {
                if (!filter || typeof filter !== "object") return [];
                const record = filter as Record<string, unknown>;
                if (typeof record.field !== "string") return [];
                const value = record.equals;
                return value === null ||
                  typeof value === "string" ||
                  typeof value === "number" ||
                  typeof value === "boolean"
                  ? [{ field: record.field, equals: value }]
                  : [];
              }),
            }
          : {}),
        ...(typeof args.groupBy === "string" ? { groupBy: args.groupBy } : {}),
        ...(typeof args.maxBy === "string" ? { maxBy: args.maxBy } : {}),
        ...(typeof args.sortBy === "string" ? { sortBy: args.sortBy } : {}),
        ...(typeof args.descending === "boolean"
          ? { descending: args.descending }
          : {}),
        ...(typeof args.limit === "number" ? { limit: args.limit } : {}),
        ...(Array.isArray(args.fields)
          ? {
              fields: args.fields.filter(
                (item): item is string => typeof item === "string",
              ),
            }
          : {}),
      });
    }
    return {
      ok: false,
      detail: `${name}(unknown)`,
      content: `Error: unknown tool "${name}".`,
    };
  }
}

export const WORKSPACE_TOOL_NAMES = [
  "list_files",
  "read_file",
  "read_files",
  "search_files",
  "query_json_lines",
] as const;

export const WORKSPACE_TOOLS: ModelToolDefinition[] = [
  {
    name: "list_files",
    description:
      "List files and directories in the repository, recursively, starting at `path`. Use \".\" for the repository root. Hidden directories such as .next are included.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'Directory path relative to the repository root, e.g. "." or "app".',
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "read_file",
    description:
      "Read a file from the repository as UTF-8 text. The repository is read-only.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            'File path relative to the repository root, e.g. "app/dashboard/page.tsx".',
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "read_files",
    description:
      "Read 1-8 explicitly named repository files in one call. Prefer this when a task names several source files that must be compared or traced together.",
    parameters: {
      type: "object",
      properties: {
        paths: {
          type: "array",
          minItems: 1,
          maxItems: MAX_BATCH_FILES,
          items: { type: "string" },
          description: "File paths relative to the repository root.",
        },
      },
      required: ["paths"],
      additionalProperties: false,
    },
  },
  {
    name: "search_files",
    description:
      "Search repository files for a literal string, case-insensitively. Returns file paths, line numbers, and matching lines. This is the safe equivalent of grep.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: 'File or directory relative to the repository root. Use "." for all files.',
        },
        query: {
          type: "string",
          description: "Literal text to find.",
        },
      },
      required: ["path", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "query_json_lines",
    description:
      "Safely filter, sort, limit, and project an NDJSON file without running jq. Fields may use dot notation.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "NDJSON file path." },
        field: { type: "string", description: "Optional field to filter." },
        equals: {
          description: "Optional primitive value the filter field must equal.",
          anyOf: [
            { type: "string" },
            { type: "number" },
            { type: "boolean" },
            { type: "null" },
          ],
        },
        filters: {
          type: "array",
          maxItems: 10,
          description: "Optional filters; every field/value condition must match.",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              equals: {
                anyOf: [
                  { type: "string" },
                  { type: "number" },
                  { type: "boolean" },
                  { type: "null" },
                ],
              },
            },
            required: ["field", "equals"],
            additionalProperties: false,
          },
        },
        groupBy: {
          type: "string",
          description: "Group rows by this field. Requires maxBy.",
        },
        maxBy: {
          type: "string",
          description: "When grouping, keep the row with the largest value in this field.",
        },
        sortBy: { type: "string", description: "Optional field to sort by." },
        descending: { type: "boolean", description: "Sort largest values first." },
        limit: { type: "integer", minimum: 1, maximum: MAX_QUERY_ROWS },
        fields: {
          type: "array",
          items: { type: "string" },
          maxItems: 20,
          description: "Optional fields to include in each returned row.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
];
