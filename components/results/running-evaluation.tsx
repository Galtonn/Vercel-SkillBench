"use client";

import Link from "next/link";
import { Check, LoaderCircle } from "lucide-react";

import { EvaluationHeader } from "@/components/results/evaluation-header";
import { Progress } from "@/components/ui/progress";
import { PROGRESS_STEPS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { EvaluationSummary } from "@/lib/types";

export function RunningEvaluation({
  evaluation,
}: {
  evaluation: EvaluationSummary;
}) {
  const completed = evaluation.completedRuns ?? 16;
  const total = evaluation.runs;
  const pct = Math.round((completed / total) * 100);
  const currentStep = 3;

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-10">
      <EvaluationHeader evaluation={evaluation} />
      <div className="mx-auto max-w-lg py-16">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Live run
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          Evaluation in progress
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {completed} of {total} runs complete. This is a simulated live
          evaluation — results will appear on this page when it finishes.
        </p>
        <div className="mt-8">
          <Progress value={pct} className="gap-0" />
          <p className="mt-3 font-mono text-[13px] tabular-nums text-muted-foreground">
            {pct}% · {completed}/{total} runs
          </p>
        </div>
        <ol className="mt-8 space-y-3">
          {PROGRESS_STEPS.map((label, index) => {
            const done = index < currentStep;
            const current = index === currentStep;
            return (
              <li key={label} className="flex items-center gap-3 text-sm">
                {done ? (
                  <Check className="size-3.5" />
                ) : current ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <span className="size-1.5 rounded-full bg-border" />
                )}
                <span
                  className={cn(
                    current ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-10 text-sm text-muted-foreground">
          While this runs, inspect a completed evaluation like{" "}
          <Link href="/evaluations/analyze-bundle" className="underline underline-offset-4">
            analyze-bundle
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
