"use client";

import { useSearchParams } from "next/navigation";

import { ComparisonTable } from "@/components/results/comparison-table";
import { EvaluationHeader } from "@/components/results/evaluation-header";
import { FailedRuns } from "@/components/results/failed-runs";
import { ImproveSkill } from "@/components/results/improve-skill";
import { OverallVerdict } from "@/components/results/overall-verdict";
import { SkillAnalysis } from "@/components/results/skill-analysis";
import { SuccessChart } from "@/components/results/success-chart";
import { TriggerReliability } from "@/components/results/trigger-reliability";
import type { EvaluationDetail } from "@/lib/types";

export function EvaluationResults({
  evaluation,
}: {
  evaluation: EvaluationDetail;
}) {
  const searchParams = useSearchParams();
  const fresh = searchParams.get("fresh") === "1";

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-10">
      {fresh ? (
        <div className="animate-fade-up mb-6 rounded-md border border-border bg-[#fafafa] px-4 py-3 text-sm">
          Evaluation completed in 4m 12s · 48 runs across 4 configurations
        </div>
      ) : null}
      <EvaluationHeader evaluation={evaluation} />
      <OverallVerdict evaluation={evaluation} />
      <ComparisonTable configs={evaluation.configs} />
      <SuccessChart configs={evaluation.configs} />
      <TriggerReliability evaluation={evaluation} />
      <SkillAnalysis evaluation={evaluation} />
      <FailedRuns runs={evaluation.failedRuns} />
      {evaluation.id === "analyze-bundle" ? (
        <ImproveSkill evaluation={evaluation} />
      ) : null}
    </div>
  );
}
