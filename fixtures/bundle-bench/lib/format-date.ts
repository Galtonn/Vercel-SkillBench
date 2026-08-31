import { DateTime, Duration } from "luxon";

export function formatRange(days) {
  const end = DateTime.now();
  const start = end.minus(Duration.fromObject({ days }));
  return `${start.toFormat("LLL d")} – ${end.toFormat("LLL d, yyyy")}`;
}

export function formatRelative(iso?: string) {
  if (!iso) return "no data";
  return DateTime.fromISO(iso).toRelative() ?? "no data";
}
