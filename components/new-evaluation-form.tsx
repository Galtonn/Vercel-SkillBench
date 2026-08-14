"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, LoaderCircle, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { DEFAULT_TASKS, PROGRESS_STEPS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const CONFIGS = [
  { id: "baseline", label: "Baseline" },
  { id: "skill", label: "Skill" },
  { id: "explicit", label: "Explicit skill trigger" },
  { id: "agents", label: "AGENTS.md" },
] as const;

export function NewEvaluationForm() {
  const router = useRouter();
  const [skill, setSkill] = useState("vercel-labs/dev3000/analyze-bundle");
  const [repo, setRepo] = useState("vercel/next.js");
  const [tasks, setTasks] = useState(DEFAULT_TASKS);
  const [runs, setRuns] = useState(12);
  const [configs, setConfigs] = useState<Record<string, boolean>>({
    baseline: true,
    skill: true,
    explicit: true,
    agents: true,
  });
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  function toggle(id: string) {
    setConfigs((current) => ({ ...current, [id]: !current[id] }));
  }

  function run() {
    setRunning(true);
    setStep(0);
    setProgress(4);

    const total = 4200;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - started;
      const pct = Math.min(100, (elapsed / total) * 100);
      setProgress(pct);
      setStep(Math.min(PROGRESS_STEPS.length - 1, Math.floor((pct / 100) * PROGRESS_STEPS.length)));
      if (elapsed >= total) {
        window.clearInterval(timer);
        router.push("/evaluations/analyze-bundle?fresh=1");
      }
    }, 80);
  }

  if (running) {
    return (
      <div className="mx-auto max-w-lg py-24">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Evaluation in progress
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Running {skill.split("/").pop()}
        </h1>
        <p className="mt-2 font-mono text-sm text-muted-foreground">{repo}</p>

        <div className="mt-10">
          <Progress value={progress} className="gap-0">
            <span className="sr-only">{Math.round(progress)}%</span>
          </Progress>
          <p className="mt-3 font-mono text-[13px] tabular-nums text-muted-foreground">
            {Math.round(progress)}%
          </p>
        </div>

        <ol className="mt-8 space-y-3">
          {PROGRESS_STEPS.map((label, index) => {
            const done = index < step;
            const current = index === step;
            return (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span className="flex size-5 items-center justify-center">
                  {done ? (
                    <Check className="size-3.5" />
                  ) : current ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-border" />
                  )}
                </span>
                <span
                  className={cn(
                    current ? "text-foreground" : done ? "text-muted-foreground" : "text-neutral-300"
                  )}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
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
          Compare agent behavior with and without a skill using the same set of
          tasks.
        </p>
      </div>

      <form
        className="animate-fade-up delay-2 mt-10 space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <Field
          label="Skill"
          hint="Skill URL, repository path, or local SKILL.md"
        >
          <Input
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="vercel-labs/dev3000/analyze-bundle"
            className="font-mono"
          />
        </Field>

        <Field label="Repository">
          <Input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="vercel/next.js"
            className="font-mono"
          />
        </Field>

        <Field label="Evaluation tasks">
          <Textarea
            value={tasks}
            onChange={(e) => setTasks(e.target.value)}
            className="min-h-[148px] font-mono text-[13px] leading-relaxed"
          />
        </Field>

        <div>
          <p className="mb-3 text-sm font-medium">Configurations</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONFIGS.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-sm hover:bg-muted/60"
              >
                <Checkbox
                  checked={configs[item.id]}
                  onCheckedChange={() => toggle(item.id)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-medium">Runs per configuration</p>
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
              onClick={() => setRuns((n) => Math.min(48, n + 1))}
              className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Increase runs"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>

        <Button type="submit" size="lg" className="w-full sm:w-auto">
          Run Evaluation
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
