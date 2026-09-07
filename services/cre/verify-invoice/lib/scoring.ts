/**
 * MIRROR of packages/shared/src/utils/pricing.ts.
 * The CRE CLI bundles this workflow on its own; it cannot safely resolve pnpm workspace packages,
 * so the formula is duplicated here. Integer-only math — this runs inside the enclave and must be
 * bit-identical across DON nodes.
 */
export function riskScore(debtor: { onTimeRatio: number; avgDaysLate: number }): number {
  const onTime = Math.round(debtor.onTimeRatio * 80)
  const lateness = Math.max(0, 20 - Math.round(debtor.avgDaysLate))
  return Math.min(100, onTime + lateness)
}
export function discountBps(score: number): number {
  return 200 + (100 - score) * 10
}
