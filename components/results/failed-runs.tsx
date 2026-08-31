"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";

import { RunDetailDrawer } from "@/components/results/run-detail-drawer";
import { cn } from "@/lib/utils";
import type { FailedRun } from "@/lib/types";

type Key = "task" | "configuration" | "reason";

export function FailedRuns({ runs }: { runs: FailedRun[] }) {
  const [sortKey, setSortKey] = useState<Key>("task");
  const [asc, setAsc] = useState(true);
  const [selected, setSelected] = useState<FailedRun | null>(null);

  const rows = [...runs].sort((a, b) => {
    const dir = asc ? 1 : -1;
    return a[sortKey].localeCompare(b[sortKey]) * dir;
  });

  function toggle(key: Key) {
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  }

  return (
    <section className="py-10">
      <h2 className="text-sm font-medium">Failed Runs</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        {runs.length === 0
          ? "Every scored run passed."
          : "Open a run to see the recorded execution events, the model's answer, and the evaluator's reason."}
      </p>

      {runs.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-[#fafafa] text-left text-xs text-muted-foreground">
              <tr>
                <Head label="Task" active={sortKey === "task"} onClick={() => toggle("task")} />
                <Head
                  label="Configuration"
                  active={sortKey === "configuration"}
                  onClick={() => toggle("configuration")}
                />
                <th className="px-4 py-2.5 font-medium">Result</th>
                <Head label="Reason" active={sortKey === "reason"} onClick={() => toggle("reason")} />
                <th className="px-4 py-2.5 font-medium">Skill loaded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/60"
                  onClick={() => setSelected(row)}
                >
                  <td className="px-4 py-3">{row.task}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.configuration}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                      {row.result}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.reason}</td>
                  <td className="px-4 py-3 font-mono text-[13px] text-muted-foreground">
                    {row.skillApplicable ? (row.skillInvoked ? "yes" : "no") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <RunDetailDrawer run={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

function Head({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
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
        {label}
        <ArrowUpDown className="size-3 opacity-50" />
      </button>
    </th>
  );
}
