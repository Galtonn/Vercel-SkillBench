import { AnimatedNumber } from "@/components/animated-number";
import { MetricTip } from "@/components/metric-tip";
import type { EvaluationDetail } from "@/lib/types";

export function OverallVerdict({ evaluation }: { evaluation: EvaluationDetail }) {
  const effectiveness = evaluation.effectiveness;

  return (
    <section className="animate-fade-up py-10">
      <p className="text-sm font-medium">
        <MetricTip name="Skill effectiveness" />
      </p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
        {effectiveness === null ? (
          <p className="text-5xl font-semibold tracking-tight text-muted-foreground">
            —
          </p>
        ) : (
          <p className="text-5xl font-semibold tracking-tight">
            <AnimatedNumber
              value={Math.abs(effectiveness)}
              prefix={effectiveness > 0 ? "+" : effectiveness < 0 ? "−" : ""}
              decimals={Number.isInteger(effectiveness) ? 0 : 1}
            />
            <span className="ml-2 text-[1.35rem] font-medium tracking-tight text-muted-foreground">
              percentage points
            </span>
          </p>
        )}
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium">
          {evaluation.verdictBadge}
        </span>
      </div>
      <p className="mt-4 max-w-2xl text-[15px] text-muted-foreground">
        {evaluation.verdict}
      </p>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        {evaluation.taskCount} task{evaluation.taskCount === 1 ? "" : "s"} ·{" "}
        {evaluation.runsPerConfig} run
        {evaluation.runsPerConfig === 1 ? "" : "s"} per configuration ·{" "}
        <span className="font-mono">{evaluation.model}</span>
        {evaluation.erroredRuns > 0
          ? ` · ${evaluation.erroredRuns} run${evaluation.erroredRuns === 1 ? "" : "s"} excluded because they could not be scored`
          : ""}
      </p>
    </section>
  );
}
