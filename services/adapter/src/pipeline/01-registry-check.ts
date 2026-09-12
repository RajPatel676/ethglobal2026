import type { StageFn } from './context.js'
import { RejectInvoice } from './context.js'

/**
 * Refuse to finance an invoice that is already financed.
 *
 * This is the point of the HCS registry. `invoiceHash` is a canonical fingerprint of
 * (businessLabel, number, amount, dueDate, debtorId), so any lender computing it the same way
 * lands on the same value — the topic is a shared, append-only record across lenders, not just
 * our own bookkeeping.
 *
 * Two checks, deliberately both:
 *   1. local state — cheap, catches our own restarts
 *   2. the HCS topic — the real one, catches another lender and catches us after a state wipe
 *
 * A mirror-node outage must NOT be treated as "no prior financing". Failing open here would
 * defeat the entire guarantee, so the error propagates and the invoice stays pending.
 */
export const registryCheck: StageFn = async (rec, { state, mirror, env, log }) => {
  const local = state.get(rec.invoiceHash)
  if (local?.status === 'financed' || local?.status === 'settled') {
    throw new RejectInvoice(`already financed locally as ${local.marketAddress ?? 'unknown market'}`)
  }

  const priors = await mirror.findFinancings(env.HCS_REGISTRY_TOPIC_ID, rec.invoiceHash)
  if (priors.length > 0) {
    throw new RejectInvoice(
      `invoice already in the HCS registry at sequence ${priors.join(', ')} — double financing refused`,
    )
  }

  log(`registry clean for ${rec.ensName}`)
  return {}
}
