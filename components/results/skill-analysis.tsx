"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { CodeBlock } from "@/components/code-block";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EvaluationDetail, Finding } from "@/lib/types";

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
      <div className="space-y-8">
        {evaluation.findings.map((finding, index) => (
          <FindingCard key={finding.id} finding={finding} index={index} />
        ))}
      </div>
    </section>
  );
}

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  const [applied, setApplied] = useState(false);
  const current = applied && finding.suggested ? finding.suggested : finding.current;

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

      {finding.current ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <CodeBlock label={applied ? "Updated" : "Current"}>{current ?? ""}</CodeBlock>
          <CodeBlock label="Suggested">{finding.suggested ?? ""}</CodeBlock>
        </div>
      ) : finding.suggested ? (
        <div className="mt-5">
          <CodeBlock label="Suggested change">{finding.suggested}</CodeBlock>
        </div>
      ) : null}

      {finding.extra ? (
        <p className="mt-4 font-mono text-sm">{finding.extra}</p>
      ) : null}

      {finding.current && finding.suggested ? (
        <Button
          type="button"
          variant={applied ? "secondary" : "outline"}
          size="sm"
          className="mt-4"
          onClick={() => setApplied(true)}
          disabled={applied}
        >
          {applied ? "Suggestion applied" : "Apply suggestion"}
        </Button>
      ) : null}
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
