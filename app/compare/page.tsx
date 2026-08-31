import Link from "next/link";

import { CompareView } from "@/components/compare-view";
import { buttonVariants } from "@/components/ui/button";
import { toDetail } from "@/lib/adapters/ui";
import { listEvaluations } from "@/lib/storage/evaluations";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Compares delivery strategies using the most recent completed evaluation that
 * actually ran more than one configuration. There is no fixture behind this page:
 * with no such evaluation stored, it says so.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const records = await listEvaluations();

  const record = id
    ? records.find((entry) => entry.id === id)
    : records.find(
        (entry) =>
          entry.status === "completed" &&
          (entry.metrics?.configs.filter(
            (config) => config.successRate !== null,
          ).length ?? 0) > 1,
      );

  if (!record?.metrics) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Nothing to compare yet
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page compares skill-delivery strategies using a completed
          evaluation that ran at least two configurations. Run one first.
        </p>
        <Link href="/new" className={cn(buttonVariants(), "mt-6 inline-flex")}>
          New Evaluation
        </Link>
      </div>
    );
  }

  return <CompareView evaluation={toDetail(record)} />;
}
