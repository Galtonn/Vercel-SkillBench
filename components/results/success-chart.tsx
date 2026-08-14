import { MetricTip } from "@/components/metric-tip";
import type { ConfigurationMetrics } from "@/lib/types";

export function SuccessChart({ configs }: { configs: ConfigurationMetrics[] }) {
  return (
    <section className="animate-fade-up delay-2 py-10">
      <h2 className="text-sm font-medium">
        <MetricTip name="Task success">Task success</MetricTip>
      </h2>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Percentage of evaluation tasks completed correctly.
      </p>
      <div className="space-y-3">
        {configs.map((row) => (
          <div key={row.id} className="grid grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[160px_1fr_48px] sm:gap-4">
            <span className="text-sm">{row.name}</span>
            <div className="order-last col-span-2 h-6 overflow-hidden bg-neutral-100 sm:order-none sm:col-span-1">
              <div
                className="animate-bar-in h-full bg-foreground"
                style={{ width: `${row.success}%` }}
              />
            </div>
            <span className="text-right font-mono text-[13px] tabular-nums">
              {row.success}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
