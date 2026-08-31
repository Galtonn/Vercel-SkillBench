import type { EvalTask } from "../types";

/**
 * Built-in benchmark for `vercel-labs/dev3000/analyze-bundle`.
 *
 * Ten tasks over the read-only `fixtures/bundle-bench` repository. Seven are
 * genuinely helped by the skill, three are not — the non-relevant tasks are what
 * make false-positive skill loading measurable.
 *
 * The presets below select subsets of these ten: three tasks for a live demo
 * (the default) and five for a standard run. The full set stays available too.
 * Every preset is a subset, never a rewrite, so results stay comparable.
 *
 * The judge criteria encode the ground truth, which is recoverable from the
 * analyzer artifacts in `.next/diagnostics/analyze/ndjson/` and the import graph.
 * It is deliberately NOT recoverable by ranking npm packages by reputation:
 * `@aws-sdk/client-s3` (268 KB) and `lodash` (71 KB) are the largest modules in
 * the repository and neither one reaches the browser.
 *
 * This module is pure data so the New Evaluation form can preview the same tasks
 * the server will run.
 */

/** The default preset: three of the ten tasks, sized for a live demo. */
export const ANALYZE_BUNDLE_LIVE_BENCHMARK_ID = "analyze-bundle";

/** Five of the ten tasks. */
export const ANALYZE_BUNDLE_STANDARD_BENCHMARK_ID = "analyze-bundle-standard";

/** The complete ten-task set. */
export const ANALYZE_BUNDLE_FULL_BENCHMARK_ID = "analyze-bundle-full";

export const ANALYZE_BUNDLE_SKILL_REFERENCE =
  "vercel-labs/dev3000/analyze-bundle";

export const ANALYZE_BUNDLE_REPO = "fixtures/bundle-bench";

export const ANALYZE_BUNDLE_QUESTION =
  "Does this skill improve an agent's ability to diagnose and fix JavaScript bundle problems?";

export const ANALYZE_BUNDLE_TASKS: EvalTask[] = [
  /* ------------------------------------------------------------------ */
  /* Clearly skill-relevant                                             */
  /* ------------------------------------------------------------------ */
  {
    id: "largest-client-dependency",
    name: "Find the largest client dependency",
    skillRelevant: true,
    prompt:
      "Which single third-party dependency contributes the most JavaScript to the browser in this application? Name the package, give its client-side transfer size, and show the evidence you used.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Identifies @acme/charts as the largest client-side dependency.",
        "States a client-side compressed size of approximately 214 KB (214800 bytes) for @acme/charts.",
        "Does NOT claim @aws-sdk/client-s3, lodash, three, or recharts is the largest client-side dependency. @aws-sdk/client-s3 and lodash are larger overall but are server-only; three and recharts are unused dependencies that never enter any bundle.",
        "Cites measured evidence (for example the analyzer artifacts under .next/diagnostics/analyze/ndjson, or per-route client source sizes) rather than reasoning from package.json or from general knowledge of package sizes.",
      ],
    },
  },
  {
    id: "analytics-regression",
    name: "Diagnose the /analytics regression",
    skillRelevant: true,
    prompt:
      "Client-side JavaScript on /analytics grew by roughly 170 KB in release 2.4.0 and nobody knows why. Identify what accounts for the growth, explain how it ended up in the client graph, and propose a fix.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Identifies luxon as the cause of the growth, at approximately 168 KB (168400 bytes) compressed on /analytics.",
        "Traces the import chain into the client graph: app/analytics/page.tsx renders app/analytics/range-picker.tsx, which is a \"use client\" component that imports lib/format-date.ts, which imports luxon.",
        "Does NOT attribute the growth to @acme/charts, @acme/sparkline, recharts, or @aws-sdk/client-s3.",
        "Proposes a plausible fix, such as formatting dates on the server, replacing luxon with Intl.DateTimeFormat, or removing luxon from the client component's import path.",
      ],
    },
  },
  {
    id: "reduce-dashboard-client-js",
    name: "Reduce client JS on /dashboard",
    skillRelevant: true,
    prompt:
      "Reduce the amount of JavaScript /dashboard ships to the browser without changing what the page does. Explain which modules you would target, why, and what change you would make.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Targets @acme/charts (about 214 KB) and/or @acme/icons (about 61 KB) as the modules worth removing from the client bundle. Together they are roughly 276 KB of the route's 333 KB of client JavaScript.",
        "Identifies the delivery mechanism: app/dashboard/revenue-panel.tsx imports from the components/ui barrel (components/ui/index.ts), which re-exports chart.tsx and icon.tsx, so importing anything from the barrel pulls @acme/charts and @acme/icons into the client graph.",
        "Proposes a concrete fix such as deep-importing components/ui/card directly instead of the barrel, splitting the barrel, or lazy-loading the chart with next/dynamic.",
        "Bases the recommendation on measured per-module sizes rather than guessing which packages are large.",
      ],
    },
  },
  {
    id: "route-priority",
    name: "Rank routes by client JS",
    skillRelevant: true,
    prompt:
      "We have budget to optimise exactly one route this sprint. Rank the routes by the amount of JavaScript they send to the browser, say which one to fix first, and name the specific module to target.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Ranks routes by client-side JavaScript in the correct order: /dashboard (about 333 KB) > /analytics (about 233 KB) > /settings (about 125 KB) > / (about 48 KB).",
        "Recommends optimising /dashboard first.",
        "Names @acme/charts as the specific module to target on /dashboard.",
        "Distinguishes client-side size from total route size. Ranking by total size would put /dashboard first too, but for the wrong reason, because the server-only @aws-sdk/client-s3 dominates the total.",
      ],
    },
  },
  {
    id: "lodash-client-check",
    name: "Check whether lodash ships to the browser",
    skillRelevant: true,
    prompt:
      "Someone flagged that lodash is a large dependency and wants it removed to speed up page loads. Is lodash actually being shipped to the browser in this application? Answer with evidence before anyone starts refactoring.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Concludes that lodash is NOT shipped to the browser. It appears only in server bundles.",
        "Supports the conclusion with evidence that lodash's entries are marked as server-side and not client-side (for example client:false / server:true in the analyzer source records), or that it is only reached through lib/analytics-server.ts, which is server-only.",
        "Therefore advises that removing lodash would not reduce client-side JavaScript.",
        "Does not incorrectly claim lodash contributes to the client bundle.",
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  /* Less obviously skill-relevant                                      */
  /* ------------------------------------------------------------------ */
  {
    id: "settings-slower-after-package",
    name: "Settings page slower after a UI package",
    skillRelevant: true,
    prompt:
      "Users say the /settings page has felt slower to load since release 2.3.0, when we adopted the shared design system. Investigate whether that is plausible and report what you find.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Identifies @acme/ui-kit as the package added for the design system and the main new contributor to client-side JavaScript on /settings, at approximately 74 KB (74200 bytes) compressed.",
        "Notes that @acme/ui-kit is roughly 59% of the route's approximately 125 KB of client JavaScript, making the complaint plausible.",
        "Identifies where it enters the client graph: app/settings/page.tsx and the \"use client\" component app/settings/preferences-form.tsx both import from @acme/ui-kit.",
        "Uses measured bundle evidence rather than only reading the source or speculating.",
      ],
    },
  },
  {
    id: "unexpected-initial-js",
    name: "Investigate unexpectedly large initial JS",
    skillRelevant: true,
    prompt:
      "The dashboard renders one card with a revenue chart, but its initial JavaScript payload feels far larger than that should require. Work out why and tell me what is actually in there.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Quantifies the route's client-side JavaScript at approximately 333 KB and attributes the bulk of it to @acme/charts (about 214 KB) plus @acme/icons (about 61 KB).",
        "Explains the mechanism: the components/ui barrel (components/ui/index.ts) re-exports the chart and icon components, so a client component importing anything from the barrel pulls both vendor packages into the route.",
        "Notes that the application's own source files account for only a few KB, so the payload is dependency-driven rather than application-code-driven.",
        "Relies on measured per-module evidence rather than assumption.",
      ],
    },
  },

  /* ------------------------------------------------------------------ */
  /* Not skill-relevant — these make false positives measurable         */
  /* ------------------------------------------------------------------ */
  {
    id: "rename-component",
    name: "Rename a component",
    skillRelevant: false,
    prompt:
      "Rename the `RevenuePanel` component to `RevenueSummary`. List every file that has to change and show the edits. Keep the file naming convention consistent with the rest of the repository.",
    expected: {
      type: "contains",
      mode: "all",
      values: ["RevenueSummary", "revenue-panel"],
    },
  },
  {
    id: "fix-implicit-any",
    name: "Fix a TypeScript typing error",
    skillRelevant: false,
    prompt:
      "`lib/format-date.ts` fails type checking under `strict` because the `formatRange` parameter has an implicit `any`. Fix the typing. Do not change the runtime behaviour.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Adds an explicit type annotation to the `days` parameter of `formatRange`, typing it as `number`.",
        "Keeps the function's runtime behaviour unchanged.",
        "Shows the corrected code or a clear diff.",
        "Does not make unrelated changes such as swapping out the date library.",
      ],
    },
  },
  {
    id: "settings-metadata-copy",
    name: "Update metadata and copy",
    skillRelevant: false,
    prompt:
      "Change the /settings page title to \"Workspace settings\" and update the visible heading on that page so it matches. Show the edits.",
    expected: {
      type: "contains",
      mode: "all",
      values: ["Workspace settings", "metadata"],
    },
  },
];

/**
 * Selects a subset of the benchmark by id, preserving the given order.
 *
 * A typo would silently shrink a preset, so an unknown id throws at import
 * rather than producing a smaller evaluation than the UI advertises.
 */
function selectTasks(label: string, ids: readonly string[]): EvalTask[] {
  return ids.map((id) => {
    const task = ANALYZE_BUNDLE_TASKS.find((entry) => entry.id === id);
    if (!task) {
      throw new Error(`${label} references unknown task "${id}".`);
    }
    return task;
  });
}

/**
 * Three tasks, for running live in front of someone.
 *
 * The smallest set that still measures all three of discovery, invocation, and
 * effectiveness, plus false positives:
 *
 * - `largest-client-dependency` is unambiguously skill-relevant and is the
 *   benchmark's sharpest discriminator. The two biggest modules in the repo are
 *   server-only, so an agent reasoning from package reputation gets it wrong and
 *   an agent reading the analyzer artifacts gets it right.
 * - `settings-slower-after-package` is the discovery test. Its prompt is a user
 *   complaint with no bundle vocabulary, so the agent has to recognise unprompted
 *   that the skill applies.
 * - `rename-component` is deliberately not skill-relevant, which keeps
 *   false-positive loading measurable. It is scored deterministically, so it
 *   costs no judge call and cannot fail on judge variance.
 */
export const ANALYZE_BUNDLE_LIVE_TASK_IDS = [
  "largest-client-dependency",
  "settings-slower-after-package",
  "rename-component",
] as const;

/**
 * Five tasks. The live set plus two that broaden what is measured:
 * `analytics-regression` requires tracing an import chain across a client
 * boundary, and `reduce-dashboard-client-js` requires acting on the evidence
 * rather than only reporting it.
 */
export const ANALYZE_BUNDLE_STANDARD_TASK_IDS = [
  "largest-client-dependency",
  "analytics-regression",
  "reduce-dashboard-client-js",
  "settings-slower-after-package",
  "rename-component",
] as const;

export const ANALYZE_BUNDLE_LIVE_TASKS = selectTasks(
  "ANALYZE_BUNDLE_LIVE_TASK_IDS",
  ANALYZE_BUNDLE_LIVE_TASK_IDS,
);

export const ANALYZE_BUNDLE_STANDARD_TASKS = selectTasks(
  "ANALYZE_BUNDLE_STANDARD_TASK_IDS",
  ANALYZE_BUNDLE_STANDARD_TASK_IDS,
);

export function countRelevant(tasks: EvalTask[]) {
  return tasks.filter((task) => task.skillRelevant).length;
}

export function countJudged(tasks: EvalTask[]) {
  return tasks.filter((task) => task.expected.type === "llm_judge").length;
}

export const ANALYZE_BUNDLE_RELEVANT_TASK_COUNT =
  countRelevant(ANALYZE_BUNDLE_TASKS);

export const ANALYZE_BUNDLE_JUDGED_TASK_COUNT =
  countJudged(ANALYZE_BUNDLE_TASKS);
