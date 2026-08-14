import { Suspense } from "react";
import Link from "next/link";

import { EvaluationResults } from "@/components/results/evaluation-results";
import { RunningEvaluation } from "@/components/results/running-evaluation";
import { buttonVariants } from "@/components/ui/button";
import { getEvaluation, getSummary } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export default async function EvaluationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = getEvaluation(id);
  const summary = getSummary(id);

  if (summary?.status === "running") {
    return <RunningEvaluation evaluation={summary} />;
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Evaluation not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          There is no evaluation named “{id}” in this prototype.
        </p>
        <Link href="/" className={cn(buttonVariants(), "mt-6 inline-flex")}>
          Back to evaluations
        </Link>
      </div>
    );
  }

  return (
    <Suspense>
      <EvaluationResults evaluation={detail} />
    </Suspense>
  );
}
