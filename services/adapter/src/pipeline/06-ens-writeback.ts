import { namehash } from '@receivable/shared'
import { ENS_KEYS } from '@receivable/shared'
import type { StageFn } from './context.js'

/**
 * Close the loop: write the Hedera results back to the invoice's ENS name on Sepolia.
 *
 * These are the only three keys this adapter's key is authorised for, granted per-name by
 * `VerificationConsumer.authorizeTextRoles`. The chain enforces it; `SepoliaClient.setText`
 * refuses anything else early so a mistake here reads as a clear error rather than
 * `EACUnauthorizedAccountRoles`.
 *
 * `status` is written LAST. The frontend treats status=financed as "everything else is readable",
 * so writing it before ats-token would expose a window where the UI shows a financed invoice with
 * no token to buy.
 */
export const ensWriteback: StageFn = async (rec, { sepolia, log }) => {
  const node = namehash(rec.ensName) as `0x${string}`

  if (!rec.atsTokenAddress) throw new Error('no atsTokenAddress to write')
  if (!rec.hcsSequence) throw new Error('no hcsSequence to write')

  await sepolia.setText(node, ENS_KEYS.invoice.atsToken, rec.atsTokenAddress)
  await sepolia.setText(node, ENS_KEYS.invoice.hcsSeq, rec.hcsSequence)
  await sepolia.setText(node, ENS_KEYS.invoice.status, 'financed')

  log(`ENS updated: ${rec.ensName} -> financed, ats=${rec.atsTokenAddress}, seq=${rec.hcsSequence}`)
  return { status: 'financed', ensWrittenAt: Math.floor(Date.now() / 1000) }
}
