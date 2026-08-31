"use client";

import { Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { METRIC_TIPS } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

export function MetricTip({
  name,
  className,
  children,
}: {
  name: keyof typeof METRIC_TIPS | string;
  className?: string;
  children?: React.ReactNode;
}) {
  const tip = METRIC_TIPS[name as keyof typeof METRIC_TIPS];
  if (!tip) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "inline-flex cursor-help items-center gap-1 text-left decoration-dotted underline-offset-4 hover:underline",
              className
            )}
          />
        }
      >
        {children ?? name}
        <Info className="size-3 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-pretty leading-relaxed">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}
