import { z } from 'zod'

/** What the Sepolia `InvoiceVerified` event carries, normalised. */
export const VerifiedInvoiceEventSchema = z.object({
  businessLabel: z.string(),
  invoiceLabel: z.string(),
  invoiceHash: z.string().regex(/^0x[0-9a-f]{64}$/),
  faceValueCents: z.bigint(),
  dueDate: z.bigint(),
  riskScore: z.number().int(),
  discountBps: z.number().int(),
  blockNumber: z.bigint(),
  txHash: z.string(),
})
export type VerifiedInvoiceEvent = z.infer<typeof VerifiedInvoiceEventSchema>

/**
 * One entry in the HCS double-financing registry.
 *
 * This is the cross-lender part of the design: any lender who computes the same canonical
 * invoiceHash can read this topic and see the invoice is already financed. Keep it small and
 * stable — it is a public wire format, and HCS messages are immutable.
 */
export const RegistryEntrySchema = z.object({
  v: z.literal(1),
  invoiceHash: z.string().regex(/^0x[0-9a-f]{64}$/),
  ensName: z.string(),
  faceValueCents: z.string(), // string: JSON has no bigint
  dueDate: z.number().int(),
  discountBps: z.number().int(),
  financedAt: z.number().int(),
  atsToken: z.string().optional(),
})
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>

/** Pipeline stages, in order. Persisted, so the names are a stored format — do not rename. */
export const STAGES = [
  'registry-check',
  'create-bond',
  'issue-units',
  'deploy-market',
  'hcs-record',
  'ens-writeback',
] as const
export type Stage = (typeof STAGES)[number]

/**
 * Everything one invoice accumulates as it moves through the pipeline.
 * Written to disk after every stage so a crash resumes instead of re-minting.
 */
export const InvoiceRecordSchema = z.object({
  invoiceHash: z.string(),
  ensName: z.string(),
  businessLabel: z.string(),
  invoiceLabel: z.string(),
  faceValueCents: z.string(),
  dueDate: z.number().int(),
  discountBps: z.number().int(),
  riskScore: z.number().int(),
  sourceTxHash: z.string(),
  sourceBlock: z.string(),

  completedStages: z.array(z.string()),
  status: z.enum(['pending', 'financed', 'settled', 'rejected', 'failed']),
  failure: z.string().optional(),

  // filled in as stages complete
  atsTokenAddress: z.string().optional(),
  marketAddress: z.string().optional(),
  hcsSequence: z.string().optional(),
  unitsIssued: z.string().optional(),
  ensWrittenAt: z.number().int().optional(),
  settledAt: z.number().int().optional(),
})
export type InvoiceRecord = z.infer<typeof InvoiceRecordSchema>

/** Whole-dollar units of face value. Cents below a dollar are not financeable. */
export function unitsFromCents(faceValueCents: bigint): bigint {
  return faceValueCents / 100n
}
