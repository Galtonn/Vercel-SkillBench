import type { BenchmarkQuality } from "@/lib/eval/benchmark-validation";
import { cn } from "@/lib/utils";

export function BenchmarkQualityCard({ quality }: { quality: BenchmarkQuality }) {
  if (quality.taskCount === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-[#fafafa] px-4 py-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">Benchmark quality</p>
        <p
          className={cn(
            "text-xs font-medium",
            quality.verdict === "good" && "text-foreground",
            quality.verdict === "usable" && "text-muted-foreground",
            quality.verdict === "weak" && "text-foreground",
          )}
        >
          {quality.verdictLabel}
        </p>
      </div>
      <ul className="mt-2 space-y-1 font-mono text-[13px] tabular-nums text-muted-foreground">
        <li>{quality.taskCount} tasks</li>
        <li>{quality.relevantCount} skill-relevant</li>
        <li>{quality.nonRelevantCount} non-relevant</li>
        <li>
          {quality.explicitCriteriaCount}/{quality.taskCount} have explicit scoring
          criteria
        </li>
        <li>
          {quality.referenceAnswerCount}/{quality.judgedCount || quality.taskCount}{" "}
          have reference answers
        </li>
      </ul>
      {quality.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          {quality.warnings.map((warning) => (
            <li key={warning.id}>
              {warning.level === "warning" ? "Warning: " : ""}
              {warning.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
