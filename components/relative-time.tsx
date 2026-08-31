"use client";

import { useSyncExternalStore } from "react";

import { formatRelativeTime } from "@/lib/eval/narrative";

/**
 * Renders a timestamp as "3 min ago", kept current by a shared clock.
 *
 * The clock is an external store rather than component state: the server never
 * reads it during render (so server output stays deterministic), and the value is
 * stable between ticks (so reading it cannot cascade renders). Before hydration
 * the absolute timestamp is shown instead.
 */

let currentTime = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    timer = setInterval(() => {
      currentTime = Date.now();
      for (const notify of listeners) notify();
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => currentTime;
const getServerSnapshot = () => null;

export function RelativeTime({ iso }: { iso: string }) {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return <span>unknown</span>;

  return (
    <time dateTime={iso} title={parsed.toISOString()}>
      {now === null
        ? parsed.toISOString().slice(0, 16).replace("T", " ")
        : formatRelativeTime(iso, now)}
    </time>
  );
}
