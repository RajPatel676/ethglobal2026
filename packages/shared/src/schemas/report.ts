import { parseAbiParameters } from 'viem'
import { z } from 'zod'

/**
 * The ONLY data that leaves the TEE. Encoded with `REPORT_ABI_PARAMS`, DON-signed,
 * delivered to VerificationConsumer.onReport on Sepolia.
 * Keep this in sync with contracts/sepolia/src/libraries/ReportCodec.sol
 * and services/cre/verify-invoice/lib/encode.ts.
 */
export const REPORT_ABI_PARAMS = parseAbiParameters(
  'string businessLabel, string invoiceLabel, bytes32 invoiceHash, uint256 faceValueCents, uint64 dueDate, uint16 riskScore, uint16 discountBps',
)

export const VerificationReportSchema = z.object({
  businessLabel: z.string(),
  invoiceLabel: z.string(), // "inv-1042"
  invoiceHash: z.string().regex(/^0x[0-9a-f]{64}$/),
  faceValueCents: z.bigint(),
  dueDate: z.bigint(),
  riskScore: z.number().int().min(0).max(100),
  discountBps: z.number().int().min(0).max(10000),
})
export type VerificationReport = z.infer<typeof VerificationReportSchema>
