export function formatPp(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded)} pp`;
}

export function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}%`;
}

/** Takes a raw token count. */
export function formatTokens(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (value < 1000) return String(Math.round(value));
  return `${(value / 1000).toFixed(1)}k`;
}

/** Takes seconds. */
export function formatRuntime(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}m ${seconds}s`;
}

export function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}
