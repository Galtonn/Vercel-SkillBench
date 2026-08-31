"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { EvaluationHeader } from "@/components/results/evaluation-header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useEvaluationProgress } from "@/hooks/use-evaluation-progress";
import type { EvaluationProgressView, EvaluationSummary } from "@/lib/types";

/**
 * Live view for an evaluation that is still executing. Every number shown comes
 * from the server's persisted progress, so the bar tracks completed agent runs.
 */
export function RunningEvaluation({
  summary,
  initialProgress,
}: {
  summary: EvaluationSummary;
  initialProgress: EvaluationProgressView;
}) {
  const router = useRouter();
  const { progress, finished, streamError } = useEvaluationProgress(
    summary.id,
    initialProgress,
  );
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const current = progress ?? initialProgress;

  useEffect(() => {
    if (finished) router.refresh();
  }, [finished, router]);

  async function cancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const response = await fetch(`/api/evaluations/${summary.id}/cancel`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setCancelError(body.error ?? "Could not cancel this evaluation.");
      }
    } catch (error) {
      setCancelError(
        error instanceof Error ? error.message : "Could not cancel.",
      );
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-10">
      <EvaluationHeader evaluation={summary} />
      <div className="mx-auto max-w-lg py-16">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Live evaluation
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          {current.label}
        </h2>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          {current.status === "running" ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : null}
          {current.detail}
        </p>

        <div className="mt-8">
          <Progress value={current.percent} className="gap-0">
            <span className="sr-only">{current.percent}%</span>
          </Progress>
          <p className="mt-3 font-mono text-[13px] tabular-nums text-muted-foreground">
            {current.percent}% · {current.completed}/{current.total} runs complete
          </p>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Each run is a real model call. Results appear on this page as soon as
          scoring and aggregation finish.
        </p>

        {streamError ? (
          <div className="mt-6 flex items-start gap-2 rounded-md border border-border bg-[#fafafa] px-4 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{streamError}</span>
          </div>
        ) : null}

        {cancelError ? (
          <p className="mt-6 text-sm text-muted-foreground">{cancelError}</p>
        ) : null}

        <div className="mt-8 flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.refresh()}
            type="button"
          >
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={cancel}
            disabled={cancelling || current.status !== "running"}
            type="button"
          >
            {cancelling ? "Cancelling…" : "Cancel evaluation"}
          </Button>
        </div>
      </div>
    </div>
  );
}
