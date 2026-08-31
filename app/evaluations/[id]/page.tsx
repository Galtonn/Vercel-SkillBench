import Link from "next/link";

import { EvaluationResults } from "@/components/results/evaluation-results";
import { RunningEvaluation } from "@/components/results/running-evaluation";
import { buttonVariants } from "@/components/ui/button";
import {
  toDetail,
  toProgressView,
  toRevisionComparison,
  toSummary,
} from "@/lib/adapters/ui";
import { loadEvaluation } from "@/lib/storage/evaluations";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EvaluationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let record = null;
  try {
    record = await loadEvaluation(id);
  } catch {
    record = null;
  }

  if (!record) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Evaluation not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          There is no stored evaluation with the id{" "}
          <span className="font-mono">{id}</span>.
        </p>
        <Link href="/" className={cn(buttonVariants(), "mt-6 inline-flex")}>
          Back to evaluations
        </Link>
      </div>
    );
  }

  if (record.status === "queued" || record.status === "running") {
    return (
      <RunningEvaluation
        summary={toSummary(record)}
        initialProgress={toProgressView(record)}
      />
    );
  }

  const detail = toDetail(record);

  // A revised re-run links back to its parent; a parent links forward to its
  // re-run so the before/after table can show measured numbers.
  let revisionComparison = null;
  if (record.improvement?.reevaluationId) {
    const revised = await loadEvaluation(record.improvement.reevaluationId).catch(
      () => null,
    );
    if (revised) revisionComparison = toRevisionComparison(record, revised);
  }

  return (
    <EvaluationResults
      evaluation={detail}
      revisionComparison={revisionComparison}
    />
  );
}
