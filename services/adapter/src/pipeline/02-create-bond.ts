import type { StageFn } from './context.js'
import { unitsFromCents } from '../types.js'

/**
 * Create (or adopt) the ATS security token representing this invoice.
 *
 * ATS_BOND_OVERRIDE short-circuits factory deployment with a pre-made bond address. That exists
 * because the hosted ATS factory's config ids rotate (see shared/constants/hedera.ts) and a demo
 * should not be one rotation away from being undemoable. When it is set, the stage validates the
 * bond rather than creating one.
 */
export const createBond: StageFn = async (rec, { ats, log }) => {
  const units = unitsFromCents(BigInt(rec.faceValueCents))
  if (units <= 0n) {
    throw new Error(`invoice ${rec.ensName} is under $1 (${rec.faceValueCents} cents) — nothing to tokenize`)
  }

  const override = process.env.ATS_BOND_OVERRIDE as `0x${string}` | undefined
  if (override) {
    log(`using pre-deployed ATS bond ${override} for ${rec.ensName}`)
    const supply = await ats.totalSupply(override)
    log(`  existing partition supply: ${supply}`)
    return { atsTokenAddress: override, unitsIssued: '0' }
  }

  throw new Error(
    `ATS bond creation via the hosted factory is not wired up yet.\n` +
      `Deploy a bond for ${rec.ensName} with the ATS UI or SDK, then set ATS_BOND_OVERRIDE.\n` +
      `Factory ${ats.factoryAddress}, resolver ${ats.resolverAddress} ` +
      `(config id/version in packages/shared/src/constants/hedera.ts — these rotate).`,
  )
}
