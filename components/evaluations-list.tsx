"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown, Search } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { MetricTip } from "@/components/metric-tip";
import { Input } from "@/components/ui/input";
import { EVALUATIONS } from "@/lib/mock-data";
import { formatPct, formatPp } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EvaluationSummary } from "@/lib/types";

type SortKey = "skill" | "status" | "effectiveness" | "triggerRate" | "runs" | "updated";

export function EvaluationsList() {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => {
    const filtered = EVALUATIONS.filter((row) =>
      row.skillPath.toLowerCase().includes(query.toLowerCase())
    );

    const order = [...filtered].sort((a, b) => {
      const dir = asc ? 1 : -1;
      switch (sortKey) {
        case "skill":
          return a.skillPath.localeCompare(b.skillPath) * dir;
        case "status":
          return a.status.localeCompare(b.status) * dir;
        case "effectiveness":
          return ((a.effectiveness ?? -1) - (b.effectiveness ?? -1)) * dir;
        case "triggerRate":
          return ((a.triggerRate ?? -1) - (b.triggerRate ?? -1)) * dir;
        case "runs":
          return (a.runs - b.runs) * dir;
        default:
          return 0;
      }
    });

    if (sortKey === "updated") {
      return asc ? [...filtered].reverse() : filtered;
    }
    return order;
  }, [query, sortKey, asc]);

  function toggle(key: SortKey) {
    if (sortKey === key) setAsc((value) => !value);
    else {
      setSortKey(key);
      setAsc(key === "skill");
    }
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
          {rows.length} of {EVALUATIONS.length}
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  No evaluations match “{query}”.
                </td>
              </tr>
            ) : (
              rows.map((row) => <EvalRow key={row.id} row={row} />)
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
  tip?: keyof typeof import("@/lib/mock-data").METRIC_TIPS;
}) {
  return (
    <th className="px-4 py-2.5 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {tip ? <MetricTip name={tip}>{label}</MetricTip> : label}
        <ArrowUpDown className="size-3 opacity-50" />
      </button>
    </th>
  );
}

function EvalRow({ row }: { row: EvaluationSummary }) {
  const href = `/evaluations/${row.id}`;

  return (
    <tr className="border-b border-border last:border-0 hover:bg-[#fafafa]">
      <td className="px-4 py-3">
        <Link href={href} className="group block">
          <span className="font-mono text-[13px] group-hover:underline">
            {row.skillPath}
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
          {row.status === "running" && row.completedRuns
            ? `${row.completedRuns}/${row.runs}`
            : row.runs}
        </Link>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        <Link href={href} className="block">
          {row.updatedLabel}
        </Link>
      </td>
    </tr>
  );
}
