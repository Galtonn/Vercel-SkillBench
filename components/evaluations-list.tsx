"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowUpDown, Search, Trash2 } from "lucide-react";

import { RelativeTime } from "@/components/relative-time";
import { StatusBadge } from "@/components/status-badge";
import { MetricTip } from "@/components/metric-tip";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { formatPct, formatPp } from "@/lib/format";
import type { MetricTipName } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import type { EvaluationSummary } from "@/lib/types";

type SortKey =
  | "skill"
  | "status"
  | "effectiveness"
  | "triggerRate"
  | "runs"
  | "updated";

export function EvaluationsList({
  evaluations,
}: {
  evaluations: EvaluationSummary[];
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [asc, setAsc] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const router = useRouter();

  const visible = useMemo(
    () => evaluations.filter((row) => !hiddenIds.has(row.id)),
    [evaluations, hiddenIds],
  );

  const rows = useMemo(() => {
    const filtered = visible.filter((row) =>
      `${row.skillPath} ${row.skillName}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );

    if (sortKey === "updated") {
      // `evaluations` arrives newest-first from storage.
      return asc ? [...filtered].reverse() : filtered;
    }

    return [...filtered].sort((a, b) => {
      const dir = asc ? 1 : -1;
      switch (sortKey) {
        case "skill":
          return a.skillPath.localeCompare(b.skillPath) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "effectiveness":
          return ((a.effectiveness ?? -Infinity) - (b.effectiveness ?? -Infinity)) * dir;
        case "triggerRate":
          return ((a.triggerRate ?? -Infinity) - (b.triggerRate ?? -Infinity)) * dir;
        case "runs":
          return (a.runs - b.runs) * dir;
        default:
          return 0;
      }
    });
  }, [visible, query, sortKey, asc]);

  async function deleteEvaluation(id: string, running: boolean) {
    if (deletingIds.has(id)) return;
    const confirmed = window.confirm(
      running
        ? "Delete this evaluation and stop the run? This cannot be undone."
        : "Delete this evaluation? This cannot be undone.",
    );
    if (!confirmed) return;

    setDeletingIds((current) => new Set(current).add(id));
    try {
      const response = await fetch(`/api/evaluations/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        window.alert(body.error ?? "Could not delete this evaluation.");
        return;
      }
      setHiddenIds((current) => new Set(current).add(id));
      router.refresh();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not delete this evaluation.",
      );
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  function toggle(key: SortKey) {
    if (sortKey === key) setAsc((value) => !value);
    else {
      setSortKey(key);
      setAsc(key === "skill");
    }
  }

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-border px-6 py-16 text-center">
        <h2 className="text-base font-medium">No evaluations yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Every evaluation on this dashboard is a real run stored on disk. Start
          with the built-in <span className="font-mono">analyze-bundle</span>{" "}
          benchmark to produce one.
        </p>
        <Link href="/new" className={cn(buttonVariants(), "mt-6 inline-flex")}>
          New Evaluation
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter evaluations…"
            className="pl-8"
          />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {rows.length} of {visible.length}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-[#fafafa] text-left text-xs text-muted-foreground">
            <tr>
              <SortHead label="Skill" active={sortKey === "skill"} onClick={() => toggle("skill")} />
              <SortHead label="Status" active={sortKey === "status"} onClick={() => toggle("status")} />
              <SortHead
                label="Skill effectiveness"
                active={sortKey === "effectiveness"}
                onClick={() => toggle("effectiveness")}
                tip="Skill effectiveness"
              />
              <SortHead
                label="Trigger rate"
                active={sortKey === "triggerRate"}
                onClick={() => toggle("triggerRate")}
                tip="Trigger rate"
              />
              <SortHead label="Runs" active={sortKey === "runs"} onClick={() => toggle("runs")} />
              <SortHead label="Updated" active={sortKey === "updated"} onClick={() => toggle("updated")} />
              <th className="w-10 px-2 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  No evaluations match “{query}”.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <EvalRow
                  key={row.id}
                  row={row}
                  onDelete={() =>
                    void deleteEvaluation(row.id, row.status === "running")
                  }
                  deleting={deletingIds.has(row.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHead({
  label,
  active,
  onClick,
  tip,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tip?: MetricTipName;
}) {
  return (
    <th className="px-4 py-2.5 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {tip ? <MetricTip name={tip}>{label}</MetricTip> : label}
        <ArrowUpDown className="size-3 opacity-50" />
      </button>
    </th>
  );
}

function EvalRow({
  row,
  onDelete,
  deleting,
}: {
  row: EvaluationSummary;
  onDelete: () => void;
  deleting: boolean;
}) {
  const href = `/evaluations/${row.id}`;

  return (
    <tr className="border-b border-border last:border-0 hover:bg-[#fafafa]">
      <td className="px-4 py-3">
        <Link href={href} className="group block">
          <span className="font-mono text-[13px] group-hover:underline">
            {row.skillPath}
          </span>
          {row.isRevision ? (
            <span className="ml-2 rounded-full border border-border px-1.5 py-0.5 text-[10px] tracking-wide text-muted-foreground uppercase">
              revision
            </span>
          ) : null}
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {row.benchmarkSourceLabel}
          </span>
        </Link>
      </td>
      <td className="px-4 py-3">
        <Link href={href} className="block">
          <StatusBadge status={row.status} />
        </Link>
      </td>
      <td className="px-4 py-3">
        <Link href={href} className="block">
          {row.effectiveness === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="font-medium tabular-nums">
              {formatPp(row.effectiveness)}
            </span>
          )}
        </Link>
      </td>
      <td className="px-4 py-3 font-mono text-[13px] tabular-nums">
        <Link href={href} className="block">
          {formatPct(row.triggerRate)}
        </Link>
      </td>
      <td className="px-4 py-3 font-mono text-[13px] tabular-nums text-muted-foreground">
        <Link href={href} className="block">
          {row.status === "running"
            ? `${row.completedRuns}/${row.runs}`
            : row.completedRuns}
        </Link>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        <Link href={href} className="block">
          <RelativeTime iso={row.updatedAt} />
        </Link>
      </td>
      <td className="px-2 py-3">
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label={`Delete ${row.skillName}`}
        >
          <Trash2 className="size-3.5" />
        </button>
      </td>
    </tr>
  );
}
