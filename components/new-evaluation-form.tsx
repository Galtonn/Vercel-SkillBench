"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  LoaderCircle,
  Minus,
  Plus,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useEvaluationProgress } from "@/hooks/use-evaluation-progress";
import {
  ANALYZE_BUNDLE_REPO,
  ANALYZE_BUNDLE_SKILL_REFERENCE,
  countJudged,
  countRelevant,
} from "@/lib/eval/benchmarks/analyze-bundle";
import {
  BENCHMARK_OPTIONS,
  DEFAULT_BENCHMARK_ID,
  getBenchmark,
} from "@/lib/eval/benchmarks";
import {
  DEFAULT_RUNS_PER_CONFIG,
  MAX_RUNS_PER_TASK,
  MAX_TASKS,
  estimateCost,
} from "@/lib/eval/config";
import type { ConfigId } from "@/lib/types";
import { cn } from "@/lib/utils";

const CONFIGS: { id: ConfigId; label: string; hint: string }[] = [
  { id: "baseline", label: "Baseline", hint: "No skill" },
  { id: "skill", label: "Skill", hint: "Agent decides via use_skill" },
  { id: "explicit", label: "Explicit skill trigger", hint: "Instructions forced" },
  { id: "agents-md", label: "AGENTS.md", hint: "Persistent repo context" },
];

function benchmarkPreview(benchmarkId: string) {
  const benchmark = getBenchmark(benchmarkId);
  return (benchmark?.tasks ?? []).map((task) => task.prompt).join("\n\n");
}

const DEFAULT_BENCHMARK = getBenchmark(DEFAULT_BENCHMARK_ID);
const DEMO_TASK_COUNT = DEFAULT_BENCHMARK?.tasks.length ?? 0;
const DEMO_LABEL = DEFAULT_BENCHMARK?.shortLabel ?? "Demo";

type SkillPreview = {
  name: string;
  description: string;
  sourceLabel: string;
  instructionsLength: number;
};

export function NewEvaluationForm() {
  const router = useRouter();

  const [useBenchmark, setUseBenchmark] = useState(true);
  const [benchmarkId, setBenchmarkId] = useState(DEFAULT_BENCHMARK_ID);
  const [skill, setSkill] = useState(ANALYZE_BUNDLE_SKILL_REFERENCE);
  const [repo, setRepo] = useState(ANALYZE_BUNDLE_REPO);
  const [tasksText, setTasksText] = useState(() =>
    benchmarkPreview(DEFAULT_BENCHMARK_ID),
  );
  const [runs, setRuns] = useState(DEFAULT_RUNS_PER_CONFIG);
  const [configs, setConfigs] = useState<Record<ConfigId, boolean>>({
    baseline: true,
    skill: true,
    explicit: true,
    "agents-md": true,
  });

  const [checking, setChecking] = useState(false);
  const [skillPreview, setSkillPreview] = useState<SkillPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evaluationId, setEvaluationId] = useState<string | null>(null);

  const { progress, finished, streamError } = useEvaluationProgress(evaluationId);

  useEffect(() => {
    if (finished && evaluationId) {
      router.push(`/evaluations/${evaluationId}`);
    }
  }, [finished, evaluationId, router]);

  const selectedConfigs = useMemo(
    () => CONFIGS.filter((item) => configs[item.id]).map((item) => item.id),
    [configs],
  );

  const benchmark = getBenchmark(benchmarkId);
  const benchmarkTasks = benchmark?.tasks ?? [];

  const taskCount = useBenchmark
    ? benchmarkTasks.length
    : tasksText.split(/\n\s*\n/).filter((block) => block.trim()).length;

  // Ad-hoc tasks are all judged; a benchmark may score some deterministically.
  const judgedTasks = useBenchmark ? countJudged(benchmarkTasks) : taskCount;

  const cost = estimateCost({
    tasks: Math.min(taskCount, MAX_TASKS),
    configurations: selectedConfigs.length,
    runsPerConfig: runs,
    judgedTasks: Math.min(judgedTasks, MAX_TASKS),
  });

  function toggle(id: ConfigId) {
    setConfigs((current) => ({ ...current, [id]: !current[id] }));
  }

  function selectBenchmark(id: string) {
    setBenchmarkId(id);
    setTasksText(benchmarkPreview(id));
    setError(null);
  }

  function toggleBenchmark() {
    setUseBenchmark((value) => {
      // Re-checking restores the preset the user last had selected, so the
      // textarea never shows prompts that would not actually be run.
      if (!value) setTasksText(benchmarkPreview(benchmarkId));
      return !value;
    });
    setError(null);
  }

  /**
   * Editing the prompts means they are no longer the built-in benchmark, so the
   * form leaves preset mode and keeps the edited text as the ad-hoc starting
   * point. Without this the textarea and the submitted tasks would disagree.
   */
  function editTasks(value: string) {
    setTasksText(value);
    if (useBenchmark) {
      setUseBenchmark(false);
      setError(null);
    }
  }

  function applyDemoPreset() {
    setUseBenchmark(true);
    setBenchmarkId(DEFAULT_BENCHMARK_ID);
    setSkill(ANALYZE_BUNDLE_SKILL_REFERENCE);
    setRepo(ANALYZE_BUNDLE_REPO);
    setTasksText(benchmarkPreview(DEFAULT_BENCHMARK_ID));
    setRuns(1);
    setConfigs({
      baseline: true,
      skill: true,
      explicit: true,
      "agents-md": true,
    });
    setError(null);
  }

  async function checkSkill() {
    setChecking(true);
    setError(null);
    setSkillPreview(null);
    try {
      const response = await fetch("/api/skill/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill }),
      });
      const body = (await response.json()) as SkillPreview & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not resolve that skill.");
        return;
      }
      setSkillPreview(body);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not reach the server.",
      );
    } finally {
      setChecking(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill,
          repo,
          tasksText: useBenchmark ? "" : tasksText,
          benchmarkId: useBenchmark ? benchmarkId : null,
          configs: selectedConfigs,
          runsPerConfig: runs,
        }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "Could not start the evaluation.");
        return;
      }
      setEvaluationId(body.id);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not reach the server.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (evaluationId) {
    const percent = progress?.percent ?? 0;
    return (
      <div className="mx-auto max-w-lg py-24">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Evaluation in progress
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {progress?.label ?? "Preparing evaluation"}
        </h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          {progress?.detail ?? "Queued"}
        </p>
        <p className="mt-1 font-mono text-sm text-muted-foreground">{repo}</p>

        <div className="mt-10">
          <Progress value={percent} className="gap-0">
            <span className="sr-only">{percent}%</span>
          </Progress>
          <p className="mt-3 font-mono text-[13px] tabular-nums text-muted-foreground">
            {percent}% · {progress?.completed ?? 0}/
            {progress?.total ?? cost.agentRuns} runs complete
          </p>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Every run is a real model call. This page will open the results when the
          evaluation finishes.
        </p>

        {streamError ? (
          <div className="mt-6 flex items-start gap-2 rounded-md border border-border bg-[#fafafa] px-4 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{streamError}</span>
          </div>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          className="mt-8"
          onClick={() => router.push(`/evaluations/${evaluationId}`)}
        >
          Open evaluation
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[640px] py-12">
      <div className="animate-fade-up">
        <h1 className="text-3xl font-semibold tracking-tight">
          Evaluate an Agent Skill
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Run the same tasks under different skill-delivery strategies and compare
          what the agent actually does.
        </p>
      </div>

      <button
        type="button"
        onClick={applyDemoPreset}
        className="animate-fade-up delay-1 mt-6 flex w-full items-start gap-2 rounded-lg border border-border px-4 py-3 text-left text-sm hover:bg-muted/60"
      >
        <Sparkles className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="block font-medium">{DEMO_LABEL}: analyze-bundle</span>
          <span className="block text-muted-foreground">
            The real{" "}
            <span className="font-mono">{ANALYZE_BUNDLE_SKILL_REFERENCE}</span>{" "}
            skill against {DEMO_TASK_COUNT} curated bundle-analysis tasks over a
            controlled Next.js fixture, all four configurations, 1 run each.
          </span>
        </span>
      </button>

      <form
        className="animate-fade-up delay-2 mt-8 space-y-8"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field
          label="Skill"
          hint="GitHub reference (owner/repo/skill-name), a github.com URL, a local path to a SKILL.md, or paste the SKILL.md itself"
        >
          <Input
            value={skill}
            onChange={(e) => {
              setSkill(e.target.value);
              setSkillPreview(null);
            }}
            placeholder={ANALYZE_BUNDLE_SKILL_REFERENCE}
            className="font-mono"
          />
          <span className="mt-2 flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={checkSkill}
              disabled={checking || !skill.trim()}
            >
              {checking ? "Resolving…" : "Check skill"}
            </Button>
            {skillPreview ? (
              <span className="text-xs text-muted-foreground">
                Loaded <span className="font-mono">{skillPreview.name}</span> ·{" "}
                {skillPreview.instructionsLength.toLocaleString()} chars
              </span>
            ) : null}
          </span>
          {skillPreview ? (
            <span className="mt-2 block rounded-md border border-border bg-[#fafafa] px-3 py-2 text-xs leading-relaxed">
              <span className="block text-muted-foreground">
                {skillPreview.sourceLabel}
              </span>
              <span className="mt-1 block">{skillPreview.description}</span>
            </span>
          ) : null}
        </Field>

        <Field
          label="Repository"
          hint={
            useBenchmark
              ? "The built-in benchmark mounts fixtures/bundle-bench read-only, with list_files and read_file."
              : "Label only. Ad-hoc evaluations do not mount a repository, so tasks must be self-contained."
          }
        >
          <Input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder={ANALYZE_BUNDLE_REPO}
            className="font-mono"
            readOnly={useBenchmark}
          />
        </Field>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">Evaluation tasks</span>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={useBenchmark} onCheckedChange={toggleBenchmark} />
              Use built-in analyze-bundle benchmark
            </label>
          </div>
          {useBenchmark ? (
            <div className="mb-2 inline-flex items-center rounded-md border border-border p-0.5">
              {BENCHMARK_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={option.id === benchmarkId}
                  onClick={() => selectBenchmark(option.id)}
                  className={cn(
                    "rounded-[5px] px-2.5 py-1 text-xs font-medium",
                    option.id === benchmarkId
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.shortLabel} · {option.tasks.length}
                </button>
              ))}
            </div>
          ) : null}
          <p className="mb-2 text-xs text-muted-foreground">
            {useBenchmark && benchmark
              ? `${benchmark.shortLabel}: ${benchmarkTasks.length} curated tasks with author-supplied ground truth, ${countRelevant(benchmarkTasks)} skill-relevant and ${benchmarkTasks.length - countRelevant(benchmarkTasks)} deliberately not, so false-positive skill loading is measurable. Editing them switches to ad-hoc tasks.`
              : `One task per paragraph, up to ${MAX_TASKS}. Ad-hoc tasks are all treated as skill-relevant and scored by the LLM judge against generic criteria.`}
          </p>
          <Textarea
            value={tasksText}
            onChange={(e) => editTasks(e.target.value)}
            className={cn(
              "min-h-[148px] font-mono text-[13px] leading-relaxed",
              useBenchmark && "text-muted-foreground",
            )}
          />
        </div>

        <div>
          <p className="mb-3 text-sm font-medium">Configurations</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONFIGS.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-muted/60"
              >
                <Checkbox
                  checked={configs[item.id]}
                  onCheckedChange={() => toggle(item.id)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {item.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium">Runs per configuration</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Each run is an independent model call on the same task. Maximum{" "}
            {MAX_RUNS_PER_TASK}.
          </p>
          <div className="inline-flex items-center rounded-md border border-border">
            <button
              type="button"
              onClick={() => setRuns((n) => Math.max(1, n - 1))}
              className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Decrease runs"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-10 text-center font-mono text-sm tabular-nums">
              {runs}
            </span>
            <button
              type="button"
              onClick={() =>
                setRuns((n) => Math.min(MAX_RUNS_PER_TASK, n + 1))
              }
              className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Increase runs"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-[#fafafa] px-4 py-3 text-sm">
          <p className="font-medium">Before you run</p>
          <ul className="mt-2 space-y-1 font-mono text-[13px] tabular-nums text-muted-foreground">
            <li>
              {cost.tasks} tasks × {cost.configurations} configurations ×{" "}
              {cost.runsPerConfig} run{cost.runsPerConfig === 1 ? "" : "s"}
            </li>
            <li>{cost.agentRuns} agent executions</li>
            <li>+ up to {cost.judgeCalls} judge calls</li>
            <li>
              + {cost.analysisCalls} aggregate analysis call
              {cost.analysisCalls === 1 ? "" : "s"}
            </li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Agent executions are multi-turn, so expect roughly{" "}
            {cost.estimatedModelCalls} model requests in total.
          </p>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-border px-4 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto"
          disabled={
            submitting || selectedConfigs.length === 0 || cost.tasks === 0
          }
        >
          {submitting ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Starting…
            </>
          ) : (
            "Run Evaluation"
          )}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium">{label}</span>
      {hint ? (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      ) : null}
      {children}
    </label>
  );
}
