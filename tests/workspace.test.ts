import { describe, expect, it } from "vitest";

import { WORKSPACE_TOOLS, ReadOnlyWorkspace } from "@/lib/eval/workspace";

const workspace = new ReadOnlyWorkspace("bundle-bench");
const uiBench = new ReadOnlyWorkspace("ui-bench");

describe("ReadOnlyWorkspace — reading", () => {
  it("lists the fixture tree from the root", async () => {
    const result = await workspace.listFiles(".");

    expect(result.ok).toBe(true);
    expect(result.content).toContain("package.json");
    expect(result.content).toMatch(/app\//);
  });

  it("reports file sizes so the agent can prioritise", async () => {
    const result = await workspace.listFiles(".");

    expect(result.content).toMatch(/package\.json \(\d+ bytes\)/);
  });

  it("reads a file as text", async () => {
    const result = await workspace.readFile("package.json");

    expect(result.ok).toBe(true);
    expect(JSON.parse(result.content)).toHaveProperty("dependencies");
  });

  it("batch-reads explicitly named files for import tracing", async () => {
    const result = await workspace.readFiles([
      "app/analytics/page.tsx",
      "app/analytics/range-picker.tsx",
      "lib/format-date.ts",
    ]);

    expect(result.ok).toBe(true);
    expect(result.detail).toBe("read_files 3 files");
    expect(result.content).toContain("## app/analytics/page.tsx");
    expect(result.content).toContain("## app/analytics/range-picker.tsx");
    expect(result.content).toContain("## lib/format-date.ts");
    expect(result.content).toContain('from "luxon"');
  });

  it("exposes the bundle analysis artifacts the benchmark depends on", async () => {
    const result = await workspace.listFiles(".next/diagnostics/analyze/ndjson");

    expect(result.ok).toBe(true);
    expect(result.content).toMatch(/\.ndjson/);
  });

  it("omits node_modules and .git from listings", async () => {
    const result = await workspace.listFiles(".");

    expect(result.content).not.toContain("node_modules");
    expect(result.content).not.toContain(".git/");
  });
});

describe("ReadOnlyWorkspace — sandbox boundaries", () => {
  it("refuses to read outside the fixture root via traversal", async () => {
    for (const attempt of ["../../package.json", "../../../etc/passwd", "app/../../../.env"]) {
      const result = await workspace.readFile(attempt);
      expect(result.ok).toBe(false);
      expect(result.content).toMatch(/outside the repository sandbox/);
    }
  });

  it("refuses to list outside the fixture root", async () => {
    const result = await workspace.listFiles("../..");

    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/outside the repository sandbox/);
  });

  it("treats an absolute path as relative to the fixture root", async () => {
    const result = await workspace.readFile("/package.json");

    expect(result.ok).toBe(true);
    expect(result.content).toContain("dependencies");
  });

  it("cannot be pointed outside fixtures/ by its constructor argument", () => {
    // "../../.." would otherwise normalise the root back out of fixtures/.
    for (const name of ["../../..", "..", "bundle-bench/../..", "/etc", ".hidden", ""]) {
      expect(() => new ReadOnlyWorkspace(name)).toThrow(/Invalid fixture name/);
    }
  });

  it("exposes no tool that could write or execute", () => {
    expect(WORKSPACE_TOOLS.map((tool) => tool.name).sort()).toEqual([
      "list_files",
      "query_json_lines",
      "read_file",
      "read_files",
      "search_files",
    ]);
  });
});

describe("ReadOnlyWorkspace — error reporting", () => {
  it("reports a missing file truthfully instead of returning empty content", async () => {
    const result = await workspace.readFile("app/does-not-exist.tsx");

    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/does not exist/);
  });

  it("redirects a directory read to list_files", async () => {
    const result = await workspace.readFile("app");

    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/is a directory\. Use list_files/);
  });

  it("redirects a file listing to read_file", async () => {
    const result = await workspace.listFiles("package.json");

    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/is a file, not a directory\. Use read_file/);
  });

  it("requires a path for read_file", async () => {
    const result = await workspace.readFile("  ");

    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/`path` is required/);
  });
});

describe("ReadOnlyWorkspace — tool dispatch", () => {
  it("routes the supported evidence tools", async () => {
    expect((await workspace.call("read_file", { path: "package.json" })).ok).toBe(true);
    expect(
      (
        await workspace.call("read_files", {
          paths: ["app/dashboard/page.tsx", "app/dashboard/revenue-panel.tsx"],
        })
      ).ok,
    ).toBe(true);
    expect((await workspace.call("list_files", { path: "." })).ok).toBe(true);
    expect(
      (await workspace.call("search_files", { path: ".", query: "dependencies" })).ok,
    ).toBe(true);
    expect(
      (
        await workspace.call("query_json_lines", {
          path: ".next/diagnostics/analyze/ndjson/routes.ndjson",
          sortBy: "total_compressed_size",
          descending: true,
          limit: 1,
        })
      ).ok,
    ).toBe(true);
  });

  it("supports the analyze-bundle skill's grouped maximum query", async () => {
    const result = await workspace.call("query_json_lines", {
      path: ".next/diagnostics/analyze/ndjson/sources.ndjson",
      filters: [
        { field: "client", equals: true },
        { field: "js", equals: true },
      ],
      groupBy: "full_path",
      maxBy: "compressed_size",
      sortBy: "compressed_size",
      descending: true,
      fields: ["full_path", "compressed_size", "route"],
      limit: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.content).toContain("@acme/charts");
    expect(result.content).toContain("214800");
  });

  it("rejects an unknown tool by name", async () => {
    const result = await workspace.call("write_file", { path: "x", content: "y" });

    expect(result.ok).toBe(false);
    expect(result.content).toMatch(/unknown tool "write_file"/);
  });

  it("treats a missing path argument as empty rather than throwing", async () => {
    const result = await workspace.call("list_files", {});

    expect(result.ok).toBe(true);
  });
});

describe("ui-bench fixture", () => {
  it("exposes the planted accessibility files", async () => {
    const listing = await uiBench.listFiles(".");

    expect(listing.ok).toBe(true);
    expect(listing.content).toContain("app/settings/account-form.tsx");
    expect(listing.content).toContain("components/hero.tsx");
    expect(listing.content).toContain("lib/format-name.ts");
  });

  it("contains the unlabeled email input the benchmark scores against", async () => {
    const result = await uiBench.readFile("app/settings/account-form.tsx");

    expect(result.ok).toBe(true);
    expect(result.content).toMatch(/type="email"/);
    expect(result.content).toMatch(/placeholder="you@example.com"/);
    expect(result.content).not.toMatch(/htmlFor=/);
    expect(result.content).not.toMatch(/aria-label=/);
  });
});
