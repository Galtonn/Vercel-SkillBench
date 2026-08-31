"use client";

import { BarChart, LineChart, ResponsiveContainer } from "@acme/charts";

export type ChartProps = {
  type: "bar" | "line";
  data: { month: string; amount: number }[];
};

export function Chart({ type, data }: ChartProps) {
  return (
    <ResponsiveContainer height={240}>
      {type === "bar" ? (
        <BarChart data={data} xKey="month" yKey="amount" />
      ) : (
        <LineChart data={data} xKey="month" yKey="amount" />
      )}
    </ResponsiveContainer>
  );
}
