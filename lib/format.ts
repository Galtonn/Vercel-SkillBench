export function formatPp(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} pp`;
}

export function formatPct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value}%`;
}

export function formatTokens(value: number) {
  return `${value.toFixed(1)}k`;
}

export function formatRuntime(value: number) {
  return `${value}s`;
}
