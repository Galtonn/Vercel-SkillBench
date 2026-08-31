"use client";

import { useMemo, useState } from "react";
import { Sparkline } from "@acme/sparkline";

// Added in release 2.4.0 to show "last 7 days" labels in the picker.
import { formatRange, formatRelative } from "@/lib/format-date";

export type Session = { at: string; count: number };

export function RangePicker({ sessions }: { sessions: Session[] }) {
  const [days, setDays] = useState(7);

  const label = useMemo(() => formatRange(days), [days]);
  const visible = sessions.slice(-days);

  return (
    <div>
      <header>
        <span>{label}</span>
        <span>{formatRelative(sessions.at(-1)?.at)}</span>
      </header>
      <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
        <option value={7}>7 days</option>
        <option value={30}>30 days</option>
        <option value={90}>90 days</option>
      </select>
      <Sparkline points={visible.map((session) => session.count)} />
    </div>
  );
}
