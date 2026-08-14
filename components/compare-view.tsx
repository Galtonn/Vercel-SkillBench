"use client";

import Link from "next/link";

import { MetricTip } from "@/components/metric-tip";
import { ANALYZE_BUNDLE } from "@/lib/mock-data";
import { formatPct, formatRuntime, formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";

const STRATEGIES = [
  {
    id: "baseline",
    name: "No Skill",
    summary: "The agent completes tasks with only its default tools and repository access.",
  },
  {
    id: "skill",
    name: "SKILL.md",
    summary: "Specialized instructions are available, but the agent must decide to load them.",
  },
  {
    id: "explicit",
    name: "Explicit Skill",
    summary: "The prompt tells the agent to use the skill. Upper bound for skill quality.",
  },
  {
    id: "agents-md",
    name: "AGENTS.md",
    summary: "The same knowledge is always in repository context. Highest success, more tokens on unrelated work.",
  },
] as const;

export function CompareView() {
  const configs = ANALYZE_BUNDLE.configs;
  const byId = Object.fromEntries(configs.map((c) => [c.id, c]));

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-12">
      <div className="animate-fade-up max-w-2xl">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          analyze-bundle
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Context Strategy
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Determine the most effective way to give an agent specialized
          knowledge.
        </p>
      </div>

      <section className="animate-fade-up delay-2 mt-12 rounded-lg border border-border p-6 sm:p-8">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Recommended
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
          AGENTS.md + Skill
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          Persistent repository guidance produced the highest task success,
          while the skill reduced unnecessary context on unrelated tasks.
          SkillBench is not trying to prove skills are always better — it
          answers:{" "}
          <span className="text-foreground">
            what&apos;s the best way to provide this knowledge to an agent?
          </span>
        </p>
      </section>

      <div className="animate-fade-up delay-3 mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STRATEGIES.map((strategy) => {
          const metrics = byId[strategy.id];
          const recommended = strategy.id === "agents-md";
          return (
            <article
              key={strategy.id}
              className={cn(
                "rounded-lg border p-5",
                recommended ? "border-foreground" : "border-border"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{strategy.name}</h3>
                {recommended ? (
                  <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    Best success
                  </span>
                ) : null}
              </div>
              <p className="mt-2 min-h-16 text-sm leading-relaxed text-muted-foreground">
                {strategy.summary}
              </p>
              <dl className="mt-6 space-y-2 text-sm">
                <Row
                  label={<MetricTip name="Task success">Success</MetricTip>}
                  value={formatPct(metrics.success)}
                  bar={metrics.success}
                />
                <Row label="Build" value={formatPct(metrics.buildPass)} bar={metrics.buildPass} />
                <Row
                  label={<MetricTip name="Trigger rate">Trigger</MetricTip>}
                  value={formatPct(metrics.triggerRate)}
                  bar={metrics.triggerRate ?? 0}
                  muted={metrics.triggerRate === null}
                />
                <Row label="Tokens" value={formatTokens(metrics.avgTokens)} />
                <Row label="Runtime" value={formatRuntime(metrics.avgRuntime)} />
              </dl>
            </article>
          );
        })}
      </div>

      <section className="mt-14">
        <h2 className="text-sm font-medium">How to read this</h2>
        <div className="mt-4 grid gap-6 text-sm leading-relaxed text-muted-foreground md:grid-cols-3">
          <p>
            <span className="block font-medium text-foreground">Baseline vs Skill</span>
            If the skill is loaded, task success jumps 24 pp and tokens fall.
            The knowledge is valuable.
          </p>
          <p>
            <span className="block font-medium text-foreground">Skill vs Explicit</span>
            Forcing the skill recovers another 9 pp. Most remaining failures are
            trigger misses, not bad instructions.
          </p>
          <p>
            <span className="block font-medium text-foreground">Explicit vs AGENTS.md</span>
            Always-on context wins on success, but costs tokens on tasks that
            don&apos;t need bundle analysis. Pair both when the repo is specialized.
          </p>
        </div>
      </section>

      <p className="mt-12 text-sm text-muted-foreground">
        Source evaluation:{" "}
        <Link
          href="/evaluations/analyze-bundle"
          className="underline underline-offset-4 hover:text-foreground"
        >
          vercel-labs/dev3000/analyze-bundle
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
  bar?: number;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={cn("font-mono text-[13px] tabular-nums", muted && "text-muted-foreground")}>
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
