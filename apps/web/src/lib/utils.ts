export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** 1_250_000 cents -> "$12,500.00" */
export function formatCents(cents: bigint | number | string): string {
  const n = typeof cents === 'bigint' ? cents : BigInt(cents)
  const dollars = n / 100n
  const rest = (n % 100n).toString().padStart(2, '0')
  return `$${dollars.toLocaleString('en-US')}.${rest}`
}

/** USDC micro-units (6dp) -> "$12,100.00" */
export function formatMicro(micro: bigint | number | string): string {
  const n = typeof micro === 'bigint' ? micro : BigInt(micro)
  const whole = n / 1_000_000n
  const frac = (n % 1_000_000n).toString().padStart(6, '0').slice(0, 2)
  return `$${whole.toLocaleString('en-US')}.${frac}`
}

export const formatBps = (bps: number) => `${(bps / 100).toFixed(2)}%`

export function formatDate(unixSeconds: number | bigint): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function daysUntil(unixSeconds: number | bigint): number {
  const ms = Number(unixSeconds) * 1000 - Date.now()
  return Math.ceil(ms / 86_400_000)
}

export const shortHash = (h: string, chars = 6) =>
  h.length <= chars * 2 + 2 ? h : `${h.slice(0, chars + 2)}…${h.slice(-chars)}`

/**
 * Annualised yield from the discount, so investors can compare invoices with different tenors.
 * A 3% discount over 30 days is a very different instrument from 3% over a year.
 */
export function annualisedYieldPct(discountBps: number, daysToMaturity: number): number | null {
  if (daysToMaturity <= 0) return null
  const price = (10_000 - discountBps) / 10_000
  if (price <= 0) return null
  return ((1 / price - 1) * (365 / daysToMaturity)) * 100
}

export function riskLabel(score: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (score >= 80) return { label: 'Low risk', tone: 'good' }
  if (score >= 60) return { label: 'Moderate', tone: 'warn' }
  return { label: 'Elevated', tone: 'bad' }
}
