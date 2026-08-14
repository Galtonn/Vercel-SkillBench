"use client";

import { useAnimatedNumber } from "@/hooks/use-animated-number";
import { cn } from "@/lib/utils";

export function AnimatedNumber({
  value,
  suffix = "",
  prefix = "",
  decimals = 0,
  className,
  duration,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  className?: string;
  duration?: number;
}) {
  const display = useAnimatedNumber(value, duration);

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
