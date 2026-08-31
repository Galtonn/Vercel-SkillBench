import { Sparkles, TriangleAlert } from "lucide-react";

import { CodeBlock } from "@/components/code-block";
import { cn } from "@/lib/utils";
import type { EvaluationDetail, Finding } from "@/lib/types";

/**
 * Findings come from a single analysis call over the evaluation's real metrics,
 * classifications, invocation reasons, and judge reasons. When that call fails or
 * returns something unusable, this shows the failure rather than filler.
 */
export function SkillAnalysis({ evaluation }: { evaluation: EvaluationDetail }) {
  return (
    <section className="py-10">
      <div className="mb-8 flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-medium">Skill Analysis</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {evaluation.analysisIntro}
          </p>
        </div>
      </div>

      <div className="mb-8 max-w-3xl">
        <CodeBlock label={`Skill description under test · ${evaluation.skill.sourceLabel}`}>
          {evaluation.skill.description}
        </CodeBlock>
      </div>

      {evaluation.findings.length === 0 ? (
        <div className="flex max-w-2xl items-start gap-2 rounded-lg border border-border px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            {evaluation.findingsError ??
              "No findings were produced for this evaluation."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {evaluation.findings.map((finding, index) => (
            <FindingCard key={finding.id} finding={finding} index={index} />
          ))}
        </div>
      )}
    </section>
  );
}

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  return (
    <article className="rounded-lg border border-border p-5">
      <div className="mb-3 flex items-center gap-2">
        <Severity severity={finding.severity} />
        <span className="text-xs text-muted-foreground">Finding {index + 1}</span>
      </div>
      <h3 className="text-base font-medium">{finding.title}</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {finding.explanation}
      </p>
    </article>
  );
}

function Severity({ severity }: { severity: Finding["severity"] }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase",
        severity === "high" && "border-neutral-900 bg-foreground text-background",
        severity === "medium" && "border-border text-foreground",
        severity === "low" && "border-border text-muted-foreground"
      )}
    >
      {severity}
    </span>
  );
}
