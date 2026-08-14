"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpDown } from "lucide-react";

import { MetricTip } from "@/components/metric-tip";
import { formatPct, formatRuntime, formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ConfigurationMetrics } from "@/lib/types";

type Key = "name" | "success" | "buildPass" | "triggerRate" | "avgTokens" | "avgRuntime";

export function ComparisonTable({ configs }: { configs: ConfigurationMetrics[] }) {
  const [sortKey, setSortKey] = useState<Key>("success");
  const [asc, setAsc] = useState(false);

  const best = useMemo(() => {
    return {
      success: Math.max(...configs.map((c) => c.success)),
      buildPass: Math.max(...configs.map((c) => c.buildPass)),
      triggerRate: Math.max(...configs.map((c) => c.triggerRate ?? -1)),
      avgTokens: Math.min(...configs.map((c) => c.avgTokens)),
      avgRuntime: Math.min(...configs.map((c) => c.avgRuntime)),
    };
  }, [configs]);

  const rows = useMemo(() => {
    return [...configs].sort((a, b) => {
      const dir = asc ? 1 : -1;
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      const av = a[sortKey] ?? -1;
      const bv = b[sortKey] ?? -1;
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
        Same tasks, same model, four ways of providing the knowledge.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-[#fafafa] text-left text-xs text-muted-foreground">
            <tr>
              <Head label="Configuration" active={sortKey === "name"} onClick={() => toggle("name")} />
              <Head label="Success" active={sortKey === "success"} onClick={() => toggle("success")} tip="Task success" />
              <Head label="Build Pass" active={sortKey === "buildPass"} onClick={() => toggle("buildPass")} tip="Build pass" />
              <Head label="Trigger Rate" active={sortKey === "triggerRate"} onClick={() => toggle("triggerRate")} tip="Trigger rate" />
              <Head label="Avg Tokens" active={sortKey === "avgTokens"} onClick={() => toggle("avgTokens")} tip="Avg tokens" />
              <Head label="Avg Runtime" active={sortKey === "avgRuntime"} onClick={() => toggle("avgRuntime")} tip="Avg runtime" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <Cell best={row.success === best.success}>{formatPct(row.success)}</Cell>
                <Cell best={row.buildPass === best.buildPass}>{formatPct(row.buildPass)}</Cell>
                <Cell best={row.triggerRate !== null && row.triggerRate === best.triggerRate}>
                  {formatPct(row.triggerRate)}
                </Cell>
                <Cell best={row.avgTokens === best.avgTokens}>{formatTokens(row.avgTokens)}</Cell>
                <Cell best={row.avgRuntime === best.avgRuntime}>{formatRuntime(row.avgRuntime)}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Skill beats baseline by a wide margin. Explicitly triggering it improves
        results again. AGENTS.md currently performs best.{" "}
        <Link href="/compare" className="text-foreground underline underline-offset-4">
          Compare context strategies
        </Link>
      </p>
    </section>
  );
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
  tip?: "Task success" | "Build pass" | "Trigger rate" | "Avg tokens" | "Avg runtime";
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
}: {
  children: React.ReactNode;
  best?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 font-mono text-[13px] tabular-nums",
        best && "bg-neutral-50 font-medium"
      )}
    >
      {children}
    </td>
  );
}
