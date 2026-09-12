import { namehash, ENS_KEYS } from '@receivable/shared'
import type { Address } from 'viem'
import type { PipelineDeps } from '../pipeline/context.js'

const marketAbi = [
  { type: 'function', name: 'settle', stateMutability: 'nonpayable', inputs: [{ name: 'amountMicro', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'outstandingParMicro', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'status', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'unitsSold', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

const erc20Abi = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

export type SettleOutcome =
  | { kind: 'settled'; ensName: string; amountMicro: bigint; txHash: string }
  | { kind: 'skipped'; ensName: string; reason: string }

/**
 * Maturity: the debtor has paid, so fund the market at par and flip ENS to `settled`.
 *
 * The adapter pays from its own USDC balance here, standing in for the escrow account that would
 * hold the debtor's payment in a real deployment. It is the one place this service moves its own
 * money, which is why it refuses rather than partially settles when short: `settle` requires full
 * par coverage on-chain, and a half-funded call would revert after the approve.
 */
export async function settleMatured(deps: PipelineDeps, invoiceHash: string): Promise<SettleOutcome> {
  const { state, hedera, sepolia, usdcEvmAddress, log } = deps

  const rec = state.get(invoiceHash)
  if (!rec) throw new Error(`unknown invoice ${invoiceHash}`)
  if (rec.status === 'settled') return { kind: 'skipped', ensName: rec.ensName, reason: 'already settled' }
  if (rec.status !== 'financed') return { kind: 'skipped', ensName: rec.ensName, reason: `status is ${rec.status}` }
  if (!rec.marketAddress) return { kind: 'skipped', ensName: rec.ensName, reason: 'no market deployed' }

  const market = rec.marketAddress as Address
  const owed = await hedera.publicClient.readContract({
    address: market, abi: marketAbi, functionName: 'outstandingParMicro',
  })

  if (owed === 0n) return { kind: 'skipped', ensName: rec.ensName, reason: 'nobody bought — nothing to settle' }

  const balance = await hedera.publicClient.readContract({
    address: usdcEvmAddress, abi: erc20Abi, functionName: 'balanceOf', args: [hedera.evmAddress],
  })
  if (balance < owed) {
    return {
      kind: 'skipped',
      ensName: rec.ensName,
      reason: `need ${owed} micro-USDC to settle at par, have ${balance} — fund ${hedera.evmAddress}`,
    }
  }

  const approveHash = await hedera.walletClient.writeContract({
    address: usdcEvmAddress, abi: erc20Abi, functionName: 'approve', args: [market, owed],
  })
  await hedera.publicClient.waitForTransactionReceipt({ hash: approveHash })

  const settleHash = await hedera.walletClient.writeContract({
    address: market, abi: marketAbi, functionName: 'settle', args: [owed],
  })
  await hedera.publicClient.waitForTransactionReceipt({ hash: settleHash })
  log(`settled ${rec.ensName} with ${owed} micro-USDC (${settleHash})`)

  // Only now is it true on the public record.
  await sepolia.setText(namehash(rec.ensName) as `0x${string}`, ENS_KEYS.invoice.status, 'settled')
  state.patch(invoiceHash, { status: 'settled', settledAt: Math.floor(Date.now() / 1000) })

  return { kind: 'settled', ensName: rec.ensName, amountMicro: owed, txHash: settleHash }
}

/** Every financed invoice whose due date has passed. */
export function findMatured(deps: PipelineDeps, now = Math.floor(Date.now() / 1000)): string[] {
  return deps.state
    .all()
    .filter((r) => r.status === 'financed' && r.dueDate <= now)
    .map((r) => r.invoiceHash)
}
