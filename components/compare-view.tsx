import Link from "next/link";

import { CompareEvalPicker, type CompareOption } from "@/components/compare-eval-picker";
import { MetricTip } from "@/components/metric-tip";
import { formatCount, formatPct, formatRuntime, formatTokens } from "@/lib/format";
import { CONFIG_EXPLAINERS } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";
import type { ConfigurationMetrics, EvaluationDetail } from "@/lib/types";

export function CompareView({
  evaluation,
  options,
}: {
  evaluation: EvaluationDetail;
  options: CompareOption[];
}) {
  const byId = new Map<string, ConfigurationMetrics>(
    evaluation.configs.map((config) => [config.id, config]),
  );

  const scored = evaluation.configs.filter((config) => config.success !== null);
  const best =
    scored.length > 0
      ? scored.reduce((leader, config) =>
          config.success! > leader.success! ? config : leader,
        )
      : null;

  const strategies = CONFIG_EXPLAINERS.filter((strategy) =>
    byId.has(strategy.id),
  );

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-12">
      <div className="animate-fade-up max-w-2xl">
        <p className="font-mono text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {evaluation.skillName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Context Strategy
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          The same knowledge, delivered four ways, measured on the same{" "}
          {evaluation.taskCount} tasks with the same model.
        </p>
        <CompareEvalPicker currentId={evaluation.id} options={options} />
      </div>

      <section className="animate-fade-up delay-2 mt-12 rounded-lg border border-border p-6 sm:p-8">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {best ? "Highest measured success" : "No result"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          {best ? best.name : "Not measured"}
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          {evaluation.comparisonNote}
        </p>
      </section>

      <div className="animate-fade-up delay-3 mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {strategies.map((strategy) => {
          const metrics = byId.get(strategy.id)!;
          const isBest = best?.id === strategy.id;
          return (
            <article
              key={strategy.id}
              className={cn(
                "rounded-lg border p-5",
                isBest ? "border-foreground" : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{metrics.name}</h3>
                {isBest ? (
                  <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    Best success
                  </span>
                ) : null}
              </div>
              <p className="mt-2 min-h-20 text-sm leading-relaxed text-muted-foreground">
                {strategy.summary}
              </p>
              <dl className="mt-6 space-y-2 text-sm">
                <Row
                  label={<MetricTip name="Task success">Success</MetricTip>}
                  value={formatPct(metrics.success)}
                  bar={metrics.success}
                />
                <Row
                  label={<MetricTip name="Avg score">Avg score</MetricTip>}
                  value={metrics.avgScore === null ? "—" : metrics.avgScore.toFixed(0)}
                  bar={metrics.avgScore}
                />
                <Row
                  label={<MetricTip name="Trigger rate">Trigger</MetricTip>}
                  value={
                    metrics.triggerRate === null
                      ? "—"
                      : `${formatPct(metrics.triggerRate)}${metrics.triggerRateByConstruction ? " fixed" : ""}`
                  }
                  bar={metrics.triggerRate}
                  muted={metrics.triggerRate === null || metrics.triggerRateByConstruction}
                />
                <Row label="Tokens" value={formatTokens(metrics.avgTokens)} />
                <Row label="Runtime" value={formatRuntime(metrics.avgRuntime)} />
                <Row label="Runs" value={formatCount(metrics.runs)} />
              </dl>
            </article>
          );
        })}
      </div>

      <section className="mt-14 max-w-3xl">
        <h2 className="text-sm font-medium">How to read this</h2>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            <span className="block font-medium text-foreground">
              Baseline vs Skill
            </span>
            Whether making the skill available changes anything at all. This is
            the number that includes the agent&apos;s own decision about whether
            to load it, so it is the number that reflects real usage.
          </p>
          <p>
            <span className="block font-medium text-foreground">
              Skill vs Explicit Trigger
            </span>
            Forcing the instructions removes discovery from the equation. A gap
            here means the instructions are fine and the agent is not finding
            them; no gap means the instructions themselves are the limit.
          </p>
          <p>
            <span className="block font-medium text-foreground">
              Explicit Trigger vs AGENTS.md
            </span>
            Always-on repository context versus task-scoped delivery. Compare the
            token columns too: persistent context costs tokens on tasks that do
            not need it.
          </p>
        </div>
      </section>

      <p className="mt-12 text-sm text-muted-foreground">
        Source evaluation:{" "}
        <Link
          href={`/evaluations/${evaluation.id}`}
          className="font-mono underline underline-offset-4 hover:text-foreground"
        >
          {evaluation.skillPath}
        </Link>
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  bar,
  muted,
}: {
  label: React.ReactNode;
  value: string;
  bar?: number | null;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd
          className={cn(
            "font-mono text-[13px] tabular-nums",
            muted && "text-muted-foreground",
          )}
        >
          {value}
        </dd>
      </div>
      {typeof bar === "number" && !muted ? (
        <div className="mt-1 h-1 overflow-hidden bg-neutral-100">
          <div className="h-full bg-foreground" style={{ width: `${bar}%` }} />
        </div>
      ) : null}
    </div>
  );
}
