import Link from "next/link";

import { EvaluationsList } from "@/components/evaluations-list";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
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
        <EvaluationsList />
      </div>
    </div>
  );
}
