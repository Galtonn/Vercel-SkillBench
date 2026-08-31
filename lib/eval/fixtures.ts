/**
 * Read-only repository fixtures the agent can be pointed at.
 *
 * Built-in benchmarks pick one of these automatically. Custom evaluations can
 * pick one too — without a fixture the agent has no files to read, so tasks that
 * depend on the repository cannot be scored honestly.
 *
 * This module is importable from the client: it is a catalog, not a filesystem
 * walk. The runner maps `id` onto `fixtures/<id>` via ReadOnlyWorkspace.
 */

export type FixtureOption = {
  id: string;
  repo: string;
  label: string;
  description: string;
  /** Source files an author is likely to mention. Used for pre-flight warnings. */
  files: string[];
};

export const FIXTURE_OPTIONS: FixtureOption[] = [
  {
    id: "bundle-bench",
    repo: "fixtures/bundle-bench",
    label: "bundle-bench",
    description: "Next.js app with bundle-analyzer artifacts",
    files: [
      "package.json",
      "app/layout.tsx",
      "app/page.tsx",
      "app/dashboard/page.tsx",
      "app/dashboard/revenue-panel.tsx",
      "app/analytics/page.tsx",
      "app/analytics/range-picker.tsx",
      "app/settings/page.tsx",
      "app/settings/preferences-form.tsx",
      "lib/analytics-server.ts",
      "lib/format-date.ts",
      "components/ui/chart.tsx",
    ],
  },
  {
    id: "ui-bench",
    repo: "fixtures/ui-bench",
    label: "ui-bench",
    description: "UI with planted accessibility and layout issues",
    files: [
      "package.json",
      "app/layout.tsx",
      "app/page.tsx",
      "app/globals.css",
      "app/settings/page.tsx",
      "app/settings/account-form.tsx",
      "app/dashboard/page.tsx",
      "app/about/page.tsx",
      "components/hero.tsx",
      "components/icon-button.tsx",
      "lib/users.ts",
      "lib/format-name.ts",
    ],
  },
];

/** Maps a workspace id to its directory name under `fixtures/`. */
export const WORKSPACE_DIRECTORIES: Record<string, string> = Object.fromEntries(
  FIXTURE_OPTIONS.map((fixture) => [fixture.id, fixture.id]),
);

export function getFixture(id: string | null | undefined): FixtureOption | null {
  if (!id) return null;
  return FIXTURE_OPTIONS.find((fixture) => fixture.id === id) ?? null;
}

/**
 * Resolves a repo field (what the user typed) onto a known fixture id.
 *
 * Accepts `ui-bench`, `fixtures/ui-bench`, and trailing slashes. Anything else
 * is treated as a label only: the agent will not get a mounted workspace.
 */
export function workspaceIdFromRepo(repo: string | null | undefined): string | null {
  if (!repo) return null;
  const trimmed = repo.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!trimmed) return null;

  for (const fixture of FIXTURE_OPTIONS) {
    if (
      trimmed === fixture.id ||
      trimmed === fixture.repo ||
      trimmed.endsWith(`/${fixture.repo}`)
    ) {
      return fixture.id;
    }
  }

  const match = trimmed.match(/(?:^|\/)fixtures\/([A-Za-z0-9._-]+)$/);
  if (match && WORKSPACE_DIRECTORIES[match[1]]) return match[1];
  if (WORKSPACE_DIRECTORIES[trimmed]) return trimmed;
  return null;
}

export function filesForRepo(repo: string | null | undefined): string[] {
  const id = workspaceIdFromRepo(repo);
  return getFixture(id)?.files ?? [];
}
