import { cn } from "@/lib/utils";
import type { EvalStatus } from "@/lib/types";

const LABELS: Record<EvalStatus, string> = {
  completed: "Completed",
  running: "Running",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function StatusBadge({
  status,
  className,
}: {
  status: EvalStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground",
        className
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "completed" && "bg-emerald-600",
          status === "running" && "animate-pulse-dot bg-foreground",
          status === "failed" && "bg-red-600",
          status === "cancelled" && "bg-neutral-400"
        )}
      />
      {LABELS[status]}
    </span>
  );
}
