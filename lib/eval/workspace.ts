import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { ModelToolDefinition } from "./provider";

/**
 * A read-only view over a benchmark fixture directory.
 *
 * The agent gets `list_files` and `read_file` and nothing else. There is no
 * write path and no shell: model output can never execute on the host. Every
 * path is resolved through `realpath` and rejected unless it stays inside the
 * fixture root, so symlinks cannot escape the sandbox.
 */

const MAX_FILE_BYTES = 96 * 1024;
const MAX_ENTRIES = 400;

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

  async call(name: string, args: Record<string, unknown>): Promise<WorkspaceToolResult> {
    const requested = typeof args.path === "string" ? args.path : "";
    if (name === "list_files") return this.listFiles(requested);
    if (name === "read_file") return this.readFile(requested);
    return {
      ok: false,
      detail: `${name}(unknown)`,
      content: `Error: unknown tool "${name}".`,
    };
  }
}

export const WORKSPACE_TOOL_NAMES = ["list_files", "read_file"] as const;

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
];
