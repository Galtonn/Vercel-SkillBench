"use client";

import { useState } from "react";

import { Chart, Icon } from "@/components/ui";

export type RevenuePoint = { month: string; amount: number };

export function RevenuePanel({ series }: { series: RevenuePoint[] }) {
  const [mode, setMode] = useState<"bar" | "line">("bar");

  return (
    <div>
      <button type="button" onClick={() => setMode(mode === "bar" ? "line" : "bar")}>
        <Icon name="swap" />
        Toggle view
      </button>
      <Chart type={mode} data={series} />
    </div>
  );
}
