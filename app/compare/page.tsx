import Link from "next/link";

import { CompareView } from "@/components/compare-view";
import { buttonVariants } from "@/components/ui/button";
import { toDetail } from "@/lib/adapters/ui";
import type { EvaluationRecord } from "@/lib/eval/types";
import { listEvaluations } from "@/lib/storage/evaluations";
import { cn } from "@/lib/utils";
import { requireDemoSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

function scoredConfigCount(record: EvaluationRecord) {
  return (
    record.metrics?.configs.filter((config) => config.successRate !== null)
      .length ?? 0
  );
}

/** Completed evaluations that ran at least two configurations, newest first. */
function comparableEvaluations(records: EvaluationRecord[]) {
  return records.filter(
    (record) => record.status === "completed" && scoredConfigCount(record) > 1,
  );
}

/**
 * Compares delivery strategies for a stored evaluation. `/compare` shows the
 * most recent comparable run; `/compare?id=` opens a specific one. The picker
 * on the page lists every comparable evaluation so past runs stay reachable.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const session = await requireDemoSession();
  const records = await listEvaluations(session.id);
  const comparable = comparableEvaluations(records);

  const requested = id ? records.find((entry) => entry.id === id) : undefined;
  const record =
    requested?.metrics ? requested : comparable[0];

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

  const options = comparable.map((entry) => ({
    id: entry.id,
    label: `${entry.skill.name} · ${entry.tasks.length} task${entry.tasks.length === 1 ? "" : "s"} · ${entry.createdAt.slice(0, 10)}`,
  }));

  if (!options.some((option) => option.id === record.id)) {
    options.unshift({
      id: record.id,
      label: `${record.skill.name} · ${record.tasks.length} task${record.tasks.length === 1 ? "" : "s"} · ${record.createdAt.slice(0, 10)}`,
    });
  }

  return <CompareView evaluation={toDetail(record)} options={options} />;
}
