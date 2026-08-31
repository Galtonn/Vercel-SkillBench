"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";

import { MetricTip } from "@/components/metric-tip";
import { formatCount, formatPct, formatRuntime, formatTokens } from "@/lib/format";
import type { MetricTipName } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import type { ConfigurationMetrics } from "@/lib/types";

type Key = "name" | "success" | "avgScore" | "triggerRate" | "avgTokens" | "avgRuntime";

export function ComparisonTable({
  configs,
  note,
  evaluationId,
}: {
  configs: ConfigurationMetrics[];
  note: string;
  evaluationId?: string;
}) {
  const [sortKey, setSortKey] = useState<Key>("success");
  const [asc, setAsc] = useState(false);

  const best = useMemo(() => {
    const maxOf = (pick: (config: ConfigurationMetrics) => number | null) => {
      const values = configs
        .map(pick)
        .filter((value): value is number => value !== null);
      return values.length > 0 ? Math.max(...values) : null;
    };
    const minOf = (pick: (config: ConfigurationMetrics) => number | null) => {
      const values = configs
        .map(pick)
        .filter((value): value is number => value !== null && value > 0);
      return values.length > 0 ? Math.min(...values) : null;
    };

    return {
      success: maxOf((config) => config.success),
      avgScore: maxOf((config) => config.avgScore),
      // Trigger rates that are 100 by construction are not an achievement, so
      // they are excluded from "best" highlighting.
      triggerRate: maxOf((config) =>
        config.triggerRateByConstruction ? null : config.triggerRate,
      ),
      avgTokens: minOf((config) => config.avgTokens),
      avgRuntime: minOf((config) => config.avgRuntime),
    };
  }, [configs]);

  const rows = useMemo(() => {
    return [...configs].sort((a, b) => {
      const dir = asc ? 1 : -1;
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return (Number(av) - Number(bv)) * dir;
    });
  }, [configs, sortKey, asc]);

  function toggle(key: Key) {
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(key === "name" || key === "avgTokens" || key === "avgRuntime");
    }
  }

  return (
    <section className="animate-fade-up delay-1">
      <h2 className="text-sm font-medium">Configuration comparison</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Same tasks, same model, different ways of delivering the same knowledge.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-[#fafafa] text-left text-xs text-muted-foreground">
            <tr>
              <Head label="Configuration" active={sortKey === "name"} onClick={() => toggle("name")} />
              <Head label="Success" active={sortKey === "success"} onClick={() => toggle("success")} tip="Task success" />
              <Head label="Avg Score" active={sortKey === "avgScore"} onClick={() => toggle("avgScore")} tip="Avg score" />
              <Head label="Trigger Rate" active={sortKey === "triggerRate"} onClick={() => toggle("triggerRate")} tip="Trigger rate" />
              <Head label="Avg Tokens" active={sortKey === "avgTokens"} onClick={() => toggle("avgTokens")} tip="Avg tokens" />
              <Head label="Avg Runtime" active={sortKey === "avgRuntime"} onClick={() => toggle("avgRuntime")} tip="Avg runtime" />
              <th className="px-4 py-2.5 font-medium">
                <MetricTip name="Runs">Runs</MetricTip>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <Cell best={isBest(row.success, best.success)}>
                  {formatPct(row.success)}
                </Cell>
                <Cell best={isBest(row.avgScore, best.avgScore)}>
                  {row.avgScore === null ? "—" : row.avgScore.toFixed(0)}
                </Cell>
                <Cell
                  best={
                    !row.triggerRateByConstruction &&
                    isBest(row.triggerRate, best.triggerRate)
                  }
                  muted={row.triggerRateByConstruction}
                  title={
                    row.triggerRateByConstruction
                      ? "100% by construction: this configuration always delivers the instructions."
                      : undefined
                  }
                >
                  {formatPct(row.triggerRate)}
                  {row.triggerRateByConstruction ? (
                    <span className="ml-1 text-[11px] text-muted-foreground">
                      fixed
                    </span>
                  ) : null}
                </Cell>
                <Cell best={isBest(row.avgTokens, best.avgTokens, true)}>
                  {formatTokens(row.avgTokens)}
                </Cell>
                <Cell best={isBest(row.avgRuntime, best.avgRuntime, true)}>
                  {formatRuntime(row.avgRuntime)}
                </Cell>
                <Cell>{formatCount(row.runs)}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
        {note}{" "}
        <Link
          href={evaluationId ? `/compare?id=${evaluationId}` : "/compare"}
          className="text-foreground underline underline-offset-4"
        >
          Compare context strategies
        </Link>
      </p>
    </section>
  );
}

function isBest(value: number | null, best: number | null, lower = false) {
  if (value === null || best === null) return false;
  if (lower) return value === best && value > 0;
  return value === best;
}

function Head({
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
          active ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {tip ? <MetricTip name={tip}>{label}</MetricTip> : label}
        <ArrowUpDown className="size-3 opacity-50" />
      </button>
    </th>
  );
}

function Cell({
  children,
  best,
  muted,
  title,
}: {
  children: React.ReactNode;
  best?: boolean;
  muted?: boolean;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={cn(
        "px-4 py-3 font-mono text-[13px] tabular-nums",
        best && "bg-neutral-50 font-medium",
        muted && "text-muted-foreground"
      )}
    >
      {children}
    </td>
  );
}
