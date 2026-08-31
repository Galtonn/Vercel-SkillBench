import Link from "next/link";

import { EvaluationsList } from "@/components/evaluations-list";
import { buttonVariants } from "@/components/ui/button";
import { toSummary } from "@/lib/adapters/ui";
import { listEvaluations } from "@/lib/storage/evaluations";
import { cn } from "@/lib/utils";

// Evaluations are read from disk on every request so a run that finishes in the
// background shows up on refresh.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const records = await listEvaluations();
  const evaluations = records.map(toSummary);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-12">
      <div className="animate-fade-up mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <h1 className="text-3xl font-semibold tracking-tight">
            Skill Evaluations
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Measure whether your Agent Skills actually improve agent
            performance.
          </p>
        </div>
        <Link href="/new" className={cn(buttonVariants({ size: "lg" }))}>
          New Evaluation
        </Link>
      </div>
      <div className="animate-fade-up delay-2">
        <EvaluationsList evaluations={evaluations} />
      </div>
    </div>
  );
}
