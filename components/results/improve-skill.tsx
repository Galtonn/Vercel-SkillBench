"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoaderCircle, Sparkles, TriangleAlert } from "lucide-react";

import { DiffBlock } from "@/components/code-block";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useEvaluationProgress } from "@/hooks/use-evaluation-progress";
import { formatCount, formatPct } from "@/lib/format";
import type {
  EvaluationDetail,
  ImprovementView,
  RevisionComparison,
} from "@/lib/types";

const PROBLEM_COPY: Record<ImprovementView["problemKind"], string> = {
  trigger:
    "The measured data points at discovery: the skill helps when it is loaded, but the agent often does not load it. The rewrite focuses on the name, description, and trigger wording.",
  instructions:
    "The measured data points at the instructions: the agent loads the skill and still fails. The rewrite focuses on the body — order of operations, missing steps, and validation.",
  both:
    "The measured data shows both problems: the agent often fails to load the skill, and loading it does not reliably produce a correct answer. The rewrite addresses discovery and instructions.",
  none:
    "The measured data does not isolate a clear discovery or instruction problem, so the rewrite is deliberately conservative.",
};

export function ImproveSkill({
  evaluation,
  revisionComparison,
}: {
  evaluation: EvaluationDetail;
  revisionComparison: RevisionComparison | null;
}) {
  const router = useRouter();
  const [improvement, setImprovement] = useState<ImprovementView | null>(
    evaluation.improvement,
  );
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reevaluationId, setReevaluationId] = useState<string | null>(
    evaluation.improvement?.reevaluationId ?? null,
  );

  const watchId =
    revisionComparison && revisionComparison.revisedStatus !== "running"
      ? null
      : reevaluationId;
  const { progress, finished } = useEvaluationProgress(watchId);

  // Pull the measured before/after table in as soon as the re-run lands.
  useEffect(() => {
    if (finished) router.refresh();
  }, [finished, router]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/evaluations/${evaluation.id}/improve`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        detail?: EvaluationDetail;
        error?: string;
      };
      if (!response.ok || !body.detail?.improvement) {
        setError(body.error ?? "Could not generate a revised skill.");
        return;
      }
      setImprovement(body.detail.improvement);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not reach the server.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function reevaluate() {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/evaluations/${evaluation.id}/reevaluate`,
        { method: "POST" },
      );
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "Could not start the re-evaluation.");
        return;
      }
      setReevaluationId(body.id);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not reach the server.",
      );
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="mt-4 mb-16 rounded-lg border border-border p-6 sm:p-8">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-1 size-4" />
        <div className="flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">
            Improve this skill
          </h2>
          <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">
            SkillBench can propose a revised SKILL.md from this evaluation&apos;s
            missed invocations, stated invocation reasons, and post-invocation
            failures.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-6 flex max-w-xl items-start gap-2 rounded-md border border-border bg-[#fafafa] px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {!improvement ? (
        <Button className="mt-6" onClick={generate} disabled={generating}>
          {generating ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Analysing failures…
            </>
          ) : (
            "Generate improved skill"
          )}
        </Button>
      ) : (
        <div className="mt-8 space-y-6">
          <div className="max-w-2xl space-y-2 text-sm">
            <p className="text-muted-foreground">
              {PROBLEM_COPY[improvement.problemKind]}
            </p>
            <p>{improvement.rationale}</p>
          </div>

          <DiffBlock lines={improvement.diffLines} />

          <p className="max-w-2xl text-sm text-muted-foreground">
            This is a proposal. Nothing here has been measured yet — re-run the
            benchmark against the revised skill to find out whether it is
            actually better.
          </p>

          {!reevaluationId ? (
            <Button onClick={reevaluate} disabled={starting}>
              {starting ? "Starting…" : "Evaluate revised version"}
            </Button>
          ) : null}
        </div>
      )}

      {reevaluationId && !revisionComparison && progress ? (
        <div className="mt-8 max-w-xl">
          <p className="text-sm font-medium">{progress.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{progress.detail}</p>
          <Progress value={progress.percent} className="mt-4 gap-0" />
          <p className="mt-3 font-mono text-[13px] tabular-nums text-muted-foreground">
            {progress.percent}% · {progress.completed}/{progress.total} runs
          </p>
        </div>
      ) : null}

      {revisionComparison ? (
        <ComparisonPanel comparison={revisionComparison} />
      ) : null}
    </section>
  );
}

function ComparisonPanel({ comparison }: { comparison: RevisionComparison }) {
  return (
    <div className="animate-fade-up mt-10">
      <h3 className="text-2xl font-semibold tracking-tight">Original vs revised</h3>
      <p className="mt-3 text-[15px] text-muted-foreground">
        {comparison.headline}
      </p>

      <div className="mt-8 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-[#fafafa] text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium" />
              <th className="px-4 py-2.5 font-medium">Original</th>
              <th className="px-4 py-2.5 font-medium">Revised</th>
              <th className="px-4 py-2.5 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.label} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-muted-foreground">{row.label}</td>
                <td className="px-4 py-3 font-mono text-[13px] tabular-nums text-muted-foreground">
                  {renderValue(row.before, row.unit)}
                </td>
                <td className="px-4 py-3 font-mono text-[13px] font-medium tabular-nums">
                  {renderValue(row.after, row.unit)}
                </td>
                <td className="px-4 py-3 font-mono text-[13px] tabular-nums text-muted-foreground">
                  {renderChange(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderValue(value: number | null, unit: RevisionComparison["rows"][number]["unit"]) {
  if (value === null) return "—";
  if (unit === "percent") return formatPct(value);
  if (unit === "tokens") return formatCount(Math.round(value));
  return formatCount(value);
}

function renderChange(row: RevisionComparison["rows"][number]) {
  if (row.before === null || row.after === null) return "—";
  const delta = Math.round((row.after - row.before) * 10) / 10;
  if (delta === 0) return "no change";
  const sign = delta > 0 ? "+" : "−";
  const magnitude = Math.abs(delta);
  const suffix = row.unit === "percent" ? " pp" : "";
  return `${sign}${row.unit === "tokens" ? magnitude.toLocaleString() : magnitude}${suffix}`;
}
