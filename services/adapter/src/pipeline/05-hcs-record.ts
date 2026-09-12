import type { StageFn } from './context.js'
import type { RegistryEntry } from '../types.js'

/**
 * Append this financing to the public HCS registry.
 *
 * Ordering is deliberate: the record goes in AFTER the bond and market exist, so anyone reading
 * the topic sees only financings that actually happened. Recording first would mean a failed
 * deployment leaves a permanent entry claiming an invoice is financed when it is not — and HCS
 * messages cannot be deleted.
 *
 * The returned sequence number is what lands in the ENS `hcs-seq` record, making the ENS name a
 * pointer into the shared registry.
 */
export const hcsRecord: StageFn = async (rec, { hedera, log }) => {
  const entry: RegistryEntry = {
    v: 1,
    invoiceHash: rec.invoiceHash,
    ensName: rec.ensName,
    faceValueCents: rec.faceValueCents,
    dueDate: rec.dueDate,
    discountBps: rec.discountBps,
    financedAt: Math.floor(Date.now() / 1000),
    atsToken: rec.atsTokenAddress,
  }

  const sequence = await hedera.submitRegistryEntry(entry)
  log(`HCS registry entry #${sequence} for ${rec.ensName}`)
  return { hcsSequence: sequence }
}
