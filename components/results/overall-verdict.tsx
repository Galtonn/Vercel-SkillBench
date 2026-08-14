import { AnimatedNumber } from "@/components/animated-number";
import { MetricTip } from "@/components/metric-tip";
import type { EvaluationDetail } from "@/lib/types";

export function OverallVerdict({ evaluation }: { evaluation: EvaluationDetail }) {
  const value = evaluation.effectiveness ?? 0;

  return (
    <section className="animate-fade-up py-10">
      <p className="text-sm font-medium">
        <MetricTip name="Skill effectiveness" />
      </p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <p className="text-5xl font-semibold tracking-tight">
          <AnimatedNumber value={value} prefix="+" />
          <span className="ml-2 text-[1.35rem] font-medium tracking-tight text-muted-foreground">
            percentage points
          </span>
        </p>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
          {evaluation.verdictBadge}
        </span>
      </div>
      <p className="mt-4 max-w-2xl text-[15px] text-muted-foreground">
        {evaluation.verdict}
      </p>
    </section>
  );
}
