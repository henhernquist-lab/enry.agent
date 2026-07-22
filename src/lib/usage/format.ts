// Client-safe formatting helpers for the usage dashboard. No runtime deps on
// server modules — safe to import from any client component.

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString()
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

export function formatCost(n: number): string {
  if (n <= 0) return '$0.00'
  if (n < 0.01) return `<$0.01`
  return `$${n.toFixed(2)}`
}

export function formatLatency(ms: number): string {
  if (ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatPercent(n: number): string {
  return `${Math.round(n)}%`
}
