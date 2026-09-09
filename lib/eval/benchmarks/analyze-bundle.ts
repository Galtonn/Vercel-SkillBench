import type { EvalTask } from "../types";

/**
 * Built-in benchmark for `vercel-labs/dev3000/analyze-bundle`.
 *
 * Ten tasks over the read-only `fixtures/bundle-bench` repository. Seven are
 * genuinely helped by the skill, three are not — the non-relevant tasks are what
 * make false-positive skill loading measurable.
 *
 * The presets below select subsets of these ten: three tasks for a legacy quick
 * check and six for the default standard run. The full set stays available too.
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

/** Six of the ten tasks. */
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
      "Find the single third-party dependency that contributes the most client-side JavaScript. Start with `.next/diagnostics/analyze/ndjson/sources.ndjson` and compare the client JavaScript records for `/dashboard`, `/analytics`, and `/settings`; do not rank dependencies from `package.json`. Report the package, the route where it appears, its compressed transfer size, and the analyzer evidence that distinguishes it from larger server-only dependencies.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Identifies @acme/charts on /dashboard as the largest third-party client-side dependency.",
        "Reports its compressed client size as approximately 214.8 KB (214800 bytes).",
        "Cites the measured /dashboard source record and correctly establishes that it is client-side (for example client:true, or client:true together with server:false/js:true).",
        "Distinguishes the answer from larger-looking server-only dependencies such as @aws-sdk/client-s3 or lodash rather than ranking package.json entries.",
      ],
      referenceAnswer:
        "@acme/charts is the largest browser dependency. In sources.ndjson, its /dashboard record is marked client:true and js:true and has compressed_size 214800 (about 214.8 KB). @aws-sdk/client-s3 and lodash have large records too, but those records are server-only, so they do not answer the client-JavaScript question.",
    },
  },
  {
    id: "analytics-regression",
    name: "Diagnose the /analytics regression",
    skillRelevant: true,
    prompt:
      "The `/analytics` route gained roughly 170 KB of client JavaScript in release 2.4.0. Use the `/analytics` records in `.next/diagnostics/analyze/ndjson/sources.ndjson`, then inspect `app/analytics/page.tsx`, `app/analytics/range-picker.tsx`, and `lib/format-date.ts`. Identify the dependency responsible, report its compressed size, trace how it enters the client graph, and recommend the smallest practical change that removes that cost from the browser.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Identifies luxon as the cause of the growth, at approximately 168 KB (168400 bytes) compressed on /analytics.",
        "Traces the import chain into the client graph: app/analytics/page.tsx renders app/analytics/range-picker.tsx, which is a \"use client\" component that imports lib/format-date.ts, which imports luxon.",
        "Uses the client:true /analytics analyzer record as evidence rather than attributing the regression to an unrelated or server-only dependency.",
        "Proposes a plausible fix, such as formatting dates on the server, replacing luxon with Intl.DateTimeFormat, or removing luxon from the client component's import path.",
      ],
      referenceAnswer:
        "Luxon accounts for the regression: its /analytics source record is client-side and 168400 compressed bytes. AnalyticsPage renders the client RangePicker; RangePicker imports lib/format-date.ts, and that module imports luxon, which pulls it into the browser graph. The smallest fix is to keep date formatting out of that client import path—for example, use Intl.DateTimeFormat there or pre-format the labels on the server.",
    },
  },
  {
    id: "reduce-dashboard-client-js",
    name: "Reduce client JS on /dashboard",
    skillRelevant: true,
    prompt:
      "The `/dashboard` route has unusually high client JavaScript. Use its records in `.next/diagnostics/analyze/ndjson/routes.ndjson` and `sources.ndjson`, then inspect `app/dashboard/revenue-panel.tsx`, `components/ui/chart.tsx`, and `components/ui/icon.tsx`. Identify the vendor modules responsible for most of the payload and recommend the smallest source change that produces a meaningful reduction without removing the chart or toggle behavior. Support the recommendation with measured sizes and the relevant import path.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Reports that /dashboard ships approximately 333.3 KB of client JavaScript and that @acme/charts (about 214.8 KB) plus @acme/icons (about 61.3 KB) dominate it.",
        "Traces those packages through RevenuePanel's Chart and Icon imports to components/ui/chart.tsx and components/ui/icon.tsx.",
        "Recommends a small behavior-preserving reduction, preferably replacing the whole @acme/icons registry import with a direct glyph import or a local swap icon; deferring the chart is also acceptable if the loading behavior is explained.",
        "Supports the recommendation with the analyzer's measured client-side sizes rather than package reputation.",
      ],
      referenceAnswer:
        "The route ships about 333300 compressed bytes of client JS. @acme/charts contributes 214800 bytes and @acme/icons contributes 61300; RevenuePanel reaches them through Chart and Icon, whose modules import those packages. The smallest low-risk reduction is to replace the full icons registry with a direct swap glyph or tiny local SVG, preserving the toggle while avoiding most of the 61.3 KB icon package. The chart is the larger follow-up target and could be deferred if that loading tradeoff is acceptable.",
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
      "Users report that `/settings` became slower after the shared design system was adopted in release 2.3.0. Check the `/settings` records in `.next/diagnostics/analyze/ndjson/routes.ndjson` and `sources.ndjson`, then inspect `app/settings/page.tsx` and `app/settings/preferences-form.tsx`. Determine whether the bundle evidence supports the report: identify the relevant package, quantify its share of the route's client JavaScript, and explain how it enters the client graph.",
    expected: {
      type: "llm_judge",
      criteria: [
        "Identifies @acme/ui-kit as the package added for the design system and the main new contributor to client-side JavaScript on /settings, at approximately 74 KB (74200 bytes) compressed.",
        "Notes that @acme/ui-kit is roughly 59% of the route's approximately 125 KB of client JavaScript, making the complaint plausible.",
        "Identifies where it enters the client graph: app/settings/page.tsx and the \"use client\" component app/settings/preferences-form.tsx both import from @acme/ui-kit.",
        "Bases the conclusion on measured /settings route and source records rather than only the release comment or package name.",
      ],
      referenceAnswer:
        "The report is plausible. /settings ships 125500 compressed bytes of client JavaScript, and @acme/ui-kit accounts for 74200 bytes—about 59% of that total. The package is imported by app/settings/page.tsx and by the use-client preferences-form.tsx, which brings its Field and Toggle code into the client graph. The route and source analyzer records provide the measured evidence.",
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
 * - `settings-slower-after-package` asks for a scoped regression diagnosis. It
 *   names the relevant route, source files, and analyzer inputs without revealing
 *   the responsible package or the measured result.
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
 * Six tasks. The live set plus three that broaden what is measured:
 * `analytics-regression` requires tracing an import chain across a client
 * boundary, and `reduce-dashboard-client-js` requires acting on the evidence
 * rather than only reporting it.
 * All four relevant prompts identify the route, analyzer inputs, and small source
 * surface to inspect. `fix-implicit-any` is a second non-relevant control, so a
 * false-positive rate is not determined by a single task.
 */
export const ANALYZE_BUNDLE_STANDARD_TASK_IDS = [
  "largest-client-dependency",
  "analytics-regression",
  "reduce-dashboard-client-js",
  "settings-slower-after-package",
  "rename-component",
  "fix-implicit-any",
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
