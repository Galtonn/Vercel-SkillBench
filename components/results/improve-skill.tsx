"use client";

import { useState } from "react";
import { Check, LoaderCircle, Sparkles } from "lucide-react";

import { AnimatedNumber } from "@/components/animated-number";
import { DiffBlock } from "@/components/code-block";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { IMPROVED_SKILL } from "@/lib/mock-data";
import { formatPct, formatTokens } from "@/lib/format";
import type { EvaluationDetail } from "@/lib/types";

const DIFF_LINES = [
  "- description: Use when analyzing application performance.",
  "+ description: Use when investigating JavaScript bundle size,",
  "+ route regressions, client-side dependencies, or bundle optimization.",
  "+",
  "+ Before proposing changes:",
  "+ 1. Inspect the relevant route.",
  "+ 2. Generate bundle analysis artifacts.",
  "+ 3. Trace heavy modules through the dependency graph.",
  "+ 4. Base recommendations on measured evidence.",
];

const REEVAL_STEPS = [
  "Loading revised SKILL.md...",
  "Re-running skill configuration...",
  "Comparing trajectories...",
];

export function ImproveSkill({ evaluation }: { evaluation: EvaluationDetail }) {
  const [phase, setPhase] = useState<"idle" | "thinking" | "diff" | "running" | "done">(
    "idle"
  );
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(0);

  const original = evaluation.configs.find((c) => c.id === "skill");

  function generate() {
    setPhase("thinking");
    window.setTimeout(() => setPhase("diff"), 2000);
  }

  function reevaluate() {
    setPhase("running");
    setProgress(6);
    setStep(0);
    const total = 2800;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - started;
      const pct = Math.min(100, (elapsed / total) * 100);
      setProgress(pct);
      setStep(Math.min(REEVAL_STEPS.length - 1, Math.floor((pct / 100) * REEVAL_STEPS.length)));
      if (elapsed >= total) {
        window.clearInterval(timer);
        setPhase("done");
      }
    }, 70);
  }

  return (
    <section className="mt-4 mb-16 rounded-lg border border-border p-6 sm:p-8">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-1 size-4" />
        <div className="flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            Improve this skill
          </h2>
          <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">
            SkillBench can generate a revised SKILL.md based on failed
            evaluation trajectories.
          </p>
        </div>
      </div>

      {phase === "idle" ? (
        <Button className="mt-6" onClick={generate}>
          Generate improved skill
        </Button>
      ) : null}

      {phase === "thinking" ? (
        <div className="mt-8 flex items-center gap-3 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          <span>Analyzing failed trajectories and rewriting trigger conditions…</span>
        </div>
      ) : null}

      {phase === "diff" || phase === "running" || phase === "done" ? (
        <div className="mt-8 space-y-6">
          <DiffBlock lines={DIFF_LINES} />
          {phase === "diff" ? (
            <Button onClick={reevaluate}>Evaluate improved version</Button>
          ) : null}
        </div>
      ) : null}

      {phase === "running" ? (
        <div className="mt-8">
          <Progress value={progress} className="gap-0" />
          <ol className="mt-5 space-y-2">
            {REEVAL_STEPS.map((label, index) => {
              const done = index < step;
              const current = index === step;
              return (
                <li key={label} className="flex items-center gap-2 text-sm">
                  {done ? (
                    <Check className="size-3.5" />
                  ) : current ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-border" />
                  )}
                  <span className={current ? "text-foreground" : "text-muted-foreground"}>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {phase === "done" && original ? (
        <div className="mt-10 animate-fade-up">
          <h3 className="text-2xl font-semibold tracking-tight">
            Before vs After
          </h3>
          <p className="mt-4 text-3xl font-semibold tracking-tight">
            +10 pp task success
          </p>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Missed skill invocations reduced from 5 → 1
          </p>

          <div className="mt-8 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-[#fafafa] text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium" />
                  <th className="px-4 py-2.5 font-medium">Original</th>
                  <th className="px-4 py-2.5 font-medium">Improved</th>
                </tr>
              </thead>
              <tbody>
                <CmpRow
                  label="Task success"
                  before={formatPct(original.success)}
                  after={<AnimatedNumber value={IMPROVED_SKILL.success} suffix="%" />}
                />
                <CmpRow
                  label="Trigger rate"
                  before={formatPct(original.triggerRate)}
                  after={<AnimatedNumber value={IMPROVED_SKILL.triggerRate} suffix="%" />}
                />
                <CmpRow
                  label="Build pass"
                  before={formatPct(original.buildPass)}
                  after={<AnimatedNumber value={IMPROVED_SKILL.buildPass} suffix="%" />}
                />
                <CmpRow
                  label="Avg tokens"
                  before={formatTokens(original.avgTokens)}
                  after={
                    <AnimatedNumber
                      value={IMPROVED_SKILL.avgTokens}
                      suffix="k"
                      decimals={1}
                    />
                  }
                />
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CmpRow({
  label,
  before,
  after,
}: {
  label: string;
  before: React.ReactNode;
  after: React.ReactNode;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 text-muted-foreground">{label}</td>
      <td className="px-4 py-3 font-mono text-[13px] tabular-nums text-muted-foreground">
        {before}
      </td>
      <td className="px-4 py-3 font-mono text-[13px] font-medium tabular-nums">
        {after}
      </td>
    </tr>
  );
}
