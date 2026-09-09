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

import { BenchmarkQualityCard } from "@/components/benchmark-quality";
import { TaskDraftEditor } from "@/components/task-draft-editor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useEvaluationProgress } from "@/hooks/use-evaluation-progress";
import {
  meaningfulEvaluationIssues,
  validateBenchmark,
} from "@/lib/eval/benchmark-validation";
import {
  ANALYZE_BUNDLE_REPO,
  ANALYZE_BUNDLE_SKILL_REFERENCE,
  countJudged,
  countRelevant,
} from "@/lib/eval/benchmarks/analyze-bundle";
import {
  BENCHMARK_FAMILIES,
  DEFAULT_BENCHMARK_ID,
  getBenchmark,
} from "@/lib/eval/benchmarks";
import {
  AGENT_OPTIONS,
  DEFAULT_AGENT_ID,
  DEFAULT_RUNS_PER_CONFIG,
  MAX_AGENT_RUNS_PER_EVALUATION,
  MAX_RUNS_PER_TASK,
  MAX_TASKS,
  estimateCost,
  type AgentId,
} from "@/lib/eval/config";
import {
  draftsFromTasks,
  draftsFromText,
  normalizeDrafts,
  type TaskDraft,
} from "@/lib/eval/custom-tasks";
import {
  FIXTURE_OPTIONS,
  filesForRepo,
  workspaceIdFromRepo,
} from "@/lib/eval/fixtures";
import type { BenchmarkSource, ConfigId } from "@/lib/eval/types";
import { cn } from "@/lib/utils";

const CONFIGS: { id: ConfigId; label: string; hint: string }[] = [
  { id: "baseline", label: "Baseline", hint: "No skill" },
  { id: "skill", label: "Skill", hint: "Agent decides via use_skill" },
  { id: "explicit", label: "Explicit skill trigger", hint: "Instructions forced" },
  { id: "agents-md", label: "AGENTS.md", hint: "Persistent repo context" },
];

const DEFAULT_BENCHMARK = getBenchmark(DEFAULT_BENCHMARK_ID);
const DEMO_TASK_COUNT = DEFAULT_BENCHMARK?.tasks.length ?? 0;
const DEMO_LABEL = DEFAULT_BENCHMARK?.shortLabel ?? "Demo";

type SkillPreview = {
  name: string;
  description: string;
  sourceLabel: string;
  instructionsLength: number;
  compatibility?: { compatible: boolean; unsupported: string[] };
  compatibilityMessage?: string;
};

export function NewEvaluationForm({
  initialAgentId = DEFAULT_AGENT_ID,
}: {
  initialAgentId?: AgentId;
}) {
  const router = useRouter();

  const [agentId, setAgentId] = useState<AgentId>(initialAgentId);
  const [useBenchmark, setUseBenchmark] = useState(true);
  const [benchmarkId, setBenchmarkId] = useState(DEFAULT_BENCHMARK_ID);
  const [skill, setSkill] = useState(ANALYZE_BUNDLE_SKILL_REFERENCE);
  const [repo, setRepo] = useState(ANALYZE_BUNDLE_REPO);
  const [drafts, setDrafts] = useState<TaskDraft[]>([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [benchmarkSource, setBenchmarkSource] =
    useState<BenchmarkSource>("user-authored");
  const [runs, setRuns] = useState(DEFAULT_RUNS_PER_CONFIG);
  const [configs, setConfigs] = useState<Record<ConfigId, boolean>>({
    baseline: true,
    skill: true,
    explicit: true,
    "agents-md": true,
  });

  const [checking, setChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
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
  const family = BENCHMARK_FAMILIES.find((entry) =>
    entry.presets.some((preset) => preset.id === benchmarkId),
  );
  const benchmarkTasks = benchmark?.tasks ?? [];
  const benchmarkDrafts = useMemo(() => {
    const source = getBenchmark(benchmarkId);
    return source ? draftsFromTasks(source.tasks) : [];
  }, [benchmarkId]);
  const customTasks = normalizeDrafts(drafts);
  const activeTasks = useBenchmark ? benchmarkTasks : customTasks;

  const taskCount = activeTasks.length;
  const judgedTasks = useBenchmark
    ? countJudged(benchmarkTasks)
    : customTasks.filter((task) => task.expected.type === "llm_judge").length;

  const workspaceId = useBenchmark
    ? (benchmark?.workspaceId ?? null)
    : workspaceIdFromRepo(repo);

  const quality = validateBenchmark(activeTasks, {
    filePaths: filesForRepo(useBenchmark ? benchmark?.repo : repo),
    noWorkspace: !workspaceId,
  });

  const cost = estimateCost({
    tasks: Math.min(taskCount, MAX_TASKS),
    configurations: selectedConfigs.length,
    runsPerConfig: runs,
    judgedTasks: Math.min(judgedTasks, MAX_TASKS),
  });
  const exceedsDemoBudget = cost.agentRuns > MAX_AGENT_RUNS_PER_EVALUATION;
  const methodologyIssues = meaningfulEvaluationIssues({
    tasks: activeTasks,
    selectedConfigs,
    hasWorkspace: Boolean(workspaceId),
  });
  const methodologyReady = methodologyIssues.length === 0;

  function toggle(id: ConfigId) {
    setConfigs((current) => ({ ...current, [id]: !current[id] }));
  }

  function selectBenchmark(id: string) {
    const next = getBenchmark(id);
    setBenchmarkId(id);
    if (next) {
      setSkill(next.skillReference);
      setRepo(next.repo);
    }
    setError(null);
  }

  function selectFamily(familyId: string) {
    const next = BENCHMARK_FAMILIES.find((entry) => entry.id === familyId);
    if (!next) return;
    selectBenchmark(next.presets[0].id);
  }

  function enterCustomFromBenchmark() {
    const source = getBenchmark(benchmarkId);
    setUseBenchmark(false);
    setDrafts(source ? draftsFromTasks(source.tasks) : []);
    setBenchmarkSource("user-authored");
    setError(null);
  }

  function toggleBenchmark() {
    if (useBenchmark) {
      enterCustomFromBenchmark();
      return;
    }
    setUseBenchmark(true);
    const next = getBenchmark(benchmarkId);
    if (next) {
      setSkill(next.skillReference);
      setRepo(next.repo);
    }
    setError(null);
  }

  function applyDemoPreset() {
    setUseBenchmark(true);
    setBenchmarkId(DEFAULT_BENCHMARK_ID);
    setSkill(ANALYZE_BUNDLE_SKILL_REFERENCE);
    setRepo(ANALYZE_BUNDLE_REPO);
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

  async function generateFromSkill() {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/benchmarks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill, repo, workspaceId }),
      });
      const body = (await response.json()) as {
        drafts?: TaskDraft[];
        error?: string;
      };
      if (!response.ok || !body.drafts?.length) {
        setError(body.error ?? "Could not generate a benchmark.");
        return;
      }
      setUseBenchmark(false);
      setDrafts(body.drafts);
      setBenchmarkSource("ai-generated");
      setPasteOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not reach the server.",
      );
    } finally {
      setGenerating(false);
    }
  }

  function applyPaste() {
    const next = draftsFromText(pasteText);
    if (next.length === 0) return;
    setDrafts(next);
    setBenchmarkSource("user-authored");
    setPasteOpen(false);
    setPasteText("");
  }

  function editDrafts(next: TaskDraft[]) {
    setDrafts(next);
    if (benchmarkSource === "ai-generated") {
      // Editing generated tasks is still generated provenance until they
      // rewrite the set from scratch; keep the label.
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
          agent: agentId,
          skill,
          repo,
          tasks: useBenchmark ? [] : drafts,
          tasksText: "",
          benchmarkId: useBenchmark ? benchmarkId : null,
          benchmarkSource: useBenchmark ? "built-in" : benchmarkSource,
          workspaceId,
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
        <p className="mt-1 text-sm text-muted-foreground">
          {AGENT_OPTIONS.find((agent) => agent.id === agentId)?.label}
        </p>

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
        <fieldset>
          <legend className="text-sm font-medium">AI agent</legend>
          <p className="mt-2 text-xs text-muted-foreground">
            Choose the model that will perform every task in this evaluation.
            Model access depends on your provider account.
          </p>
          {exceedsDemoBudget ? (
            <p className="mt-2 text-xs font-medium text-destructive">
              The hosted demo permits at most {MAX_AGENT_RUNS_PER_EVALUATION}{" "}
              agent executions per evaluation. Reduce the tasks,
              configurations, or repetitions.
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {AGENT_OPTIONS.map((agent) => (
              <button
                key={agent.id}
                type="button"
                aria-pressed={agentId === agent.id}
                onClick={() => setAgentId(agent.id)}
                className={cn(
                  "rounded-lg border px-3 py-3 text-left transition-colors",
                  agentId === agent.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-muted/60",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {agent.label}
                  {agent.group !== "current" ? (
                    <span
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 text-[9px] font-medium tracking-wide uppercase",
                        agentId === agent.id
                          ? "border-background/30 text-background/70"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {agent.group === "legacy" ? "Earlier" : "v0"}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block font-mono text-[11px]",
                    agentId === agent.id
                      ? "text-background/70"
                      : "text-muted-foreground",
                  )}
                >
                  {agent.model}
                </span>
                <span
                  className={cn(
                    "mt-2 block text-xs",
                    agentId === agent.id
                      ? "text-background/80"
                      : "text-muted-foreground",
                  )}
                >
                  {agent.hint}
                </span>
                <span
                  className={cn(
                    "mt-1.5 block font-mono text-[10px]",
                    agentId === agent.id
                      ? "text-background/60"
                      : "text-muted-foreground",
                  )}
                >
                  {agent.credential}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <Field
          label="Skill"
          hint="Public GitHub reference (owner/repo/skill-name or URL), or paste the SKILL.md itself"
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
          <span className="mt-2 flex flex-wrap items-center gap-3">
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
              {skillPreview.compatibilityMessage ? (
                <span className="mt-1 block font-medium">
                  {skillPreview.compatibilityMessage}
                </span>
              ) : null}
            </span>
          ) : null}
        </Field>

        <Field
          label="Repository fixture"
          hint={
            workspaceId
              ? `Mounted read-only as ${workspaceId}, with list_files and read_file.`
              : "Pick a fixture so the agent can read files. A label that is not a known fixture is not mounted."
          }
        >
          {useBenchmark ? (
            <Input value={repo} readOnly className="font-mono" />
          ) : (
            <div className="space-y-2">
              <div className="inline-flex flex-wrap items-center rounded-md border border-border p-0.5">
                {FIXTURE_OPTIONS.map((fixture) => (
                  <button
                    key={fixture.id}
                    type="button"
                    aria-pressed={repo === fixture.repo}
                    onClick={() => setRepo(fixture.repo)}
                    className={cn(
                      "rounded-[5px] px-2.5 py-1 text-xs font-medium",
                      repo === fixture.repo
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {fixture.label}
                  </button>
                ))}
              </div>
              <Input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="fixtures/ui-bench"
                className="font-mono"
              />
            </div>
          )}
        </Field>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">Evaluation tasks</span>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={useBenchmark} onCheckedChange={toggleBenchmark} />
              Use built-in benchmark
            </label>
          </div>

          {useBenchmark ? (
            <>
              <div className="mb-2 flex flex-wrap gap-2">
                <div className="inline-flex items-center rounded-md border border-border p-0.5">
                  {BENCHMARK_FAMILIES.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={family?.id === entry.id}
                      onClick={() => selectFamily(entry.id)}
                      className={cn(
                        "rounded-[5px] px-2.5 py-1 text-xs font-medium",
                        family?.id === entry.id
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
                {family && family.presets.length > 1 ? (
                  <div className="inline-flex items-center rounded-md border border-border p-0.5">
                    {family.presets.map((option) => (
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
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                {benchmark
                  ? `${benchmark.familyLabel}: ${benchmarkTasks.length} curated tasks with author-supplied ground truth, ${countRelevant(benchmarkTasks)} skill-relevant and ${benchmarkTasks.length - countRelevant(benchmarkTasks)} deliberately not. Each task has its own prompt, relevance, and scoring. Customize to edit them.`
                  : null}
              </p>
              <TaskDraftEditor drafts={benchmarkDrafts} readOnly />
              <button
                type="button"
                className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={enterCustomFromBenchmark}
              >
                Customize these tasks
              </button>
            </>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                {benchmarkSource === "ai-generated"
                  ? "AI-generated benchmark. Review relevance and criteria before running — generated ground truth is a draft, not a fact."
                  : "User-authored benchmark. Mark which tasks the skill should help with, and give each one scoring criteria. Do not assume every task is skill-relevant."}
              </p>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generateFromSkill}
                  disabled={generating || !skill.trim() || !workspaceId}
                >
                  {generating ? (
                    <>
                      <LoaderCircle className="size-3.5 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    "Generate benchmark from skill"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPasteOpen((value) => !value)}
                >
                  Paste prompts
                </Button>
              </div>
              {pasteOpen ? (
                <div className="mb-3 space-y-2">
                  <Textarea
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    placeholder="One task per paragraph"
                    className="min-h-[100px] font-mono text-[13px] leading-relaxed"
                  />
                  <p className="text-xs text-muted-foreground">
                    Pasted prompts start as judged and skill-relevant, with no
                    task-specific criteria. Set relevance and criteria before you
                    run.
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={applyPaste}>
                    Replace tasks from paste
                  </Button>
                </div>
              ) : null}
              <TaskDraftEditor drafts={drafts} onChange={editDrafts} />
              <div className="mt-4">
                <BenchmarkQualityCard quality={quality} />
              </div>
            </>
          )}
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
              Agent: {AGENT_OPTIONS.find((agent) => agent.id === agentId)?.label}
            </li>
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

        {useBenchmark ? <BenchmarkQualityCard quality={quality} /> : null}

        {!methodologyReady ? (
          <div className="flex items-start gap-2 rounded-md border border-border bg-[#fafafa] px-4 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="block font-medium">Not ready to run</span>
              <span className="mt-1 block text-muted-foreground">
                {methodologyIssues.join(" ")}
              </span>
            </span>
          </div>
        ) : null}

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
            submitting ||
            selectedConfigs.length === 0 ||
            cost.tasks === 0 ||
            exceedsDemoBudget ||
            !methodologyReady
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
