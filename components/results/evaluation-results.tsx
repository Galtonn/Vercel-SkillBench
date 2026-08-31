import { TriangleAlert } from "lucide-react";

import { ComparisonTable } from "@/components/results/comparison-table";
import { EvaluationHeader } from "@/components/results/evaluation-header";
import { FailedRuns } from "@/components/results/failed-runs";
import { ImproveSkill } from "@/components/results/improve-skill";
import { OverallVerdict } from "@/components/results/overall-verdict";
import { SkillAnalysis } from "@/components/results/skill-analysis";
import { SuccessChart } from "@/components/results/success-chart";
import { TriggerReliability } from "@/components/results/trigger-reliability";
import type { EvaluationDetail, RevisionComparison } from "@/lib/types";

export function EvaluationResults({
  evaluation,
  revisionComparison,
}: {
  evaluation: EvaluationDetail;
  revisionComparison: RevisionComparison | null;
}) {
  const hasResults = evaluation.configs.length > 0;

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-10">
      {evaluation.error ? (
        <div className="animate-fade-up mb-6 flex items-start gap-2 rounded-md border border-border bg-[#fafafa] px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">
              {evaluation.status === "cancelled"
                ? "This evaluation was cancelled."
                : "This evaluation did not finish."}
            </p>
            <p className="mt-1 text-muted-foreground">{evaluation.error}</p>
            {evaluation.completedRuns > 0 ? (
              <p className="mt-1 text-muted-foreground">
                The {evaluation.completedRuns} run
                {evaluation.completedRuns === 1 ? "" : "s"} that did complete are
                shown below.
              </p>
            ) : null}
          </div>
        </div>
      ) : evaluation.completionSummary ? (
        <div className="animate-fade-up mb-6 rounded-md border border-border bg-[#fafafa] px-4 py-3 text-sm">
          {evaluation.completionSummary}
        </div>
      ) : null}

      <EvaluationHeader evaluation={evaluation} />

      {hasResults ? (
        <>
          <OverallVerdict evaluation={evaluation} />
          <ComparisonTable
            configs={evaluation.configs}
            note={evaluation.comparisonNote}
            evaluationId={evaluation.id}
          />
          <SuccessChart configs={evaluation.configs} />
          <TriggerReliability evaluation={evaluation} />
          <SkillAnalysis evaluation={evaluation} />
          <FailedRuns runs={evaluation.failedRuns} />
          <ImproveSkill
            evaluation={evaluation}
            revisionComparison={revisionComparison}
          />
        </>
      ) : (
        <section className="py-16">
          <h2 className="text-base font-medium">No results to show</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            This evaluation produced no scored runs, so there are no metrics to
            display. SkillBench does not substitute example data when a run fails.
          </p>
        </section>
      )}
    </div>
  );
}
