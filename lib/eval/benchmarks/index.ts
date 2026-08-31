import type { EvalTask } from "../types";
import {
  ANALYZE_BUNDLE_FULL_BENCHMARK_ID,
  ANALYZE_BUNDLE_LIVE_BENCHMARK_ID,
  ANALYZE_BUNDLE_LIVE_TASKS,
  ANALYZE_BUNDLE_QUESTION,
  ANALYZE_BUNDLE_REPO,
  ANALYZE_BUNDLE_SKILL_REFERENCE,
  ANALYZE_BUNDLE_STANDARD_BENCHMARK_ID,
  ANALYZE_BUNDLE_STANDARD_TASKS,
  ANALYZE_BUNDLE_TASKS,
} from "./analyze-bundle";
import {
  WEB_DESIGN_BENCHMARK_ID,
  WEB_DESIGN_QUESTION,
  WEB_DESIGN_REPO,
  WEB_DESIGN_SKILL_REFERENCE,
  WEB_DESIGN_TASKS,
} from "./web-design-guidelines";

export type Benchmark = {
  id: string;
  label: string;
  /** Short label for the benchmark picker. */
  shortLabel: string;
  /**
   * Groups presets that share a skill and fixture (e.g. analyze-bundle live /
   * standard / full). The New Evaluation form picks a family first, then a size.
   */
  familyId: string;
  familyLabel: string;
  skillReference: string;
  repo: string;
  question: string;
  tasks: EvalTask[];
  /** Fixture directory, relative to the project root, mounted read-only. */
  workspaceId: string;
};

export const BENCHMARKS: Record<string, Benchmark> = {
  // The three-task set is the default: it is the smallest preset that still
  // measures discovery, invocation, effectiveness, and false positives, which
  // makes it the one that can be run in front of an audience.
  [ANALYZE_BUNDLE_LIVE_BENCHMARK_ID]: {
    id: ANALYZE_BUNDLE_LIVE_BENCHMARK_ID,
    label: "Live demo: analyze-bundle",
    shortLabel: "Live demo",
    familyId: "analyze-bundle",
    familyLabel: "analyze-bundle",
    skillReference: ANALYZE_BUNDLE_SKILL_REFERENCE,
    repo: ANALYZE_BUNDLE_REPO,
    question: ANALYZE_BUNDLE_QUESTION,
    tasks: ANALYZE_BUNDLE_LIVE_TASKS,
    workspaceId: "bundle-bench",
  },
  [ANALYZE_BUNDLE_STANDARD_BENCHMARK_ID]: {
    id: ANALYZE_BUNDLE_STANDARD_BENCHMARK_ID,
    label: "Standard: analyze-bundle",
    shortLabel: "Standard",
    familyId: "analyze-bundle",
    familyLabel: "analyze-bundle",
    skillReference: ANALYZE_BUNDLE_SKILL_REFERENCE,
    repo: ANALYZE_BUNDLE_REPO,
    question: ANALYZE_BUNDLE_QUESTION,
    tasks: ANALYZE_BUNDLE_STANDARD_TASKS,
    workspaceId: "bundle-bench",
  },
  [ANALYZE_BUNDLE_FULL_BENCHMARK_ID]: {
    id: ANALYZE_BUNDLE_FULL_BENCHMARK_ID,
    label: "Full benchmark: analyze-bundle",
    shortLabel: "Full benchmark",
    familyId: "analyze-bundle",
    familyLabel: "analyze-bundle",
    skillReference: ANALYZE_BUNDLE_SKILL_REFERENCE,
    repo: ANALYZE_BUNDLE_REPO,
    question: ANALYZE_BUNDLE_QUESTION,
    tasks: ANALYZE_BUNDLE_TASKS,
    workspaceId: "bundle-bench",
  },
  [WEB_DESIGN_BENCHMARK_ID]: {
    id: WEB_DESIGN_BENCHMARK_ID,
    label: "web-design-guidelines",
    shortLabel: "Full benchmark",
    familyId: "web-design-guidelines",
    familyLabel: "web-design-guidelines",
    skillReference: WEB_DESIGN_SKILL_REFERENCE,
    repo: WEB_DESIGN_REPO,
    question: WEB_DESIGN_QUESTION,
    tasks: WEB_DESIGN_TASKS,
    workspaceId: "ui-bench",
  },
};

/** Benchmarks offered in the New Evaluation form, in display order. */
export const BENCHMARK_OPTIONS: Benchmark[] = [
  BENCHMARKS[ANALYZE_BUNDLE_LIVE_BENCHMARK_ID],
  BENCHMARKS[ANALYZE_BUNDLE_STANDARD_BENCHMARK_ID],
  BENCHMARKS[ANALYZE_BUNDLE_FULL_BENCHMARK_ID],
  BENCHMARKS[WEB_DESIGN_BENCHMARK_ID],
];

export type BenchmarkFamily = {
  id: string;
  label: string;
  skillReference: string;
  repo: string;
  presets: Benchmark[];
};

/** Unique families, in display order, each with its size presets. */
export const BENCHMARK_FAMILIES: BenchmarkFamily[] = (() => {
  const families: BenchmarkFamily[] = [];
  const seen = new Set<string>();
  for (const option of BENCHMARK_OPTIONS) {
    if (seen.has(option.familyId)) continue;
    seen.add(option.familyId);
    families.push({
      id: option.familyId,
      label: option.familyLabel,
      skillReference: option.skillReference,
      repo: option.repo,
      presets: BENCHMARK_OPTIONS.filter((entry) => entry.familyId === option.familyId),
    });
  }
  return families;
})();

export const DEFAULT_BENCHMARK_ID = ANALYZE_BUNDLE_LIVE_BENCHMARK_ID;

export function getBenchmark(id: string | null | undefined): Benchmark | null {
  if (!id) return null;
  return BENCHMARKS[id] ?? null;
}

export { WORKSPACE_DIRECTORIES } from "../fixtures";
