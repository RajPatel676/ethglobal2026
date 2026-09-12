import type { StageFn } from './context.js'
import { unitsFromCents } from '../types.js'

/**
 * Mint one bond unit per whole dollar of face value, held by the adapter until a market exists.
 *
 * Idempotency matters more here than anywhere else: minting twice inflates supply against a fixed
 * invoice, so every holder's claim silently dilutes. The runner will not re-enter a completed
 * stage, and this also checks on-chain supply before minting so a crash between the mint and the
 * state write cannot double-issue.
 */
export const issueUnits: StageFn = async (rec, { ats, hedera, log }) => {
  const bond = rec.atsTokenAddress as `0x${string}` | undefined
  if (!bond) throw new Error('create-bond must run before issue-units')

  const units = unitsFromCents(BigInt(rec.faceValueCents))
  const existing = await ats.totalSupply(bond)

  if (existing >= units) {
    log(`bond ${bond} already carries ${existing} units (>= ${units}) — skipping mint`)
    return { unitsIssued: existing.toString() }
  }

  const toMint = units - existing
  const tx = await ats.issueUnits(bond, hedera.evmAddress, toMint)
  log(`minted ${toMint} units of ${bond} to ${hedera.evmAddress} (${tx})`)

  return { unitsIssued: units.toString() }
}
