/**
 * Rule-based risk score and discount. Deterministic integer math only — this runs inside the
 * enclave, so no floats that could diverge across DON nodes. Mirror in services/cre/.../lib/scoring.ts.
 */
export function riskScore(debtor: { onTimeRatio: number; avgDaysLate: number }): number {
  const onTime = Math.round(debtor.onTimeRatio * 80) // 0..80
  const lateness = Math.max(0, 20 - Math.round(debtor.avgDaysLate)) // 0..20
  return Math.min(100, onTime + lateness)
}

/** 2% floor + 10 bps per risk point below 100 → 2%..12% */
export function discountBps(score: number): number {
  return 200 + (100 - score) * 10
}

/** Price per $1 unit, in USDC micro-units (6 decimals). */
export function unitPriceMicro(bps: number): bigint {
  return (1_000_000n * BigInt(10_000 - bps)) / 10_000n
}

/** Investor pays this for `units`; SMB receives it immediately. */
export function purchaseCostMicro(units: bigint, bps: number): bigint {
  return units * unitPriceMicro(bps)
}
