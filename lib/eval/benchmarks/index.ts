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

export type Benchmark = {
  id: string;
  label: string;
  /** Short label for the benchmark picker. */
  shortLabel: string;
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
    skillReference: ANALYZE_BUNDLE_SKILL_REFERENCE,
    repo: ANALYZE_BUNDLE_REPO,
    question: ANALYZE_BUNDLE_QUESTION,
    tasks: ANALYZE_BUNDLE_TASKS,
    workspaceId: "bundle-bench",
  },
};

/** Benchmarks offered in the New Evaluation form, in display order. */
export const BENCHMARK_OPTIONS: Benchmark[] = [
  BENCHMARKS[ANALYZE_BUNDLE_LIVE_BENCHMARK_ID],
  BENCHMARKS[ANALYZE_BUNDLE_STANDARD_BENCHMARK_ID],
  BENCHMARKS[ANALYZE_BUNDLE_FULL_BENCHMARK_ID],
];

export const DEFAULT_BENCHMARK_ID = ANALYZE_BUNDLE_LIVE_BENCHMARK_ID;

export function getBenchmark(id: string | null | undefined): Benchmark | null {
  if (!id) return null;
  return BENCHMARKS[id] ?? null;
}

/** Maps a workspace id to its directory name under `fixtures/`. */
export const WORKSPACE_DIRECTORIES: Record<string, string> = {
  "bundle-bench": "bundle-bench",
};
