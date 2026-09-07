import { z } from 'zod'

/** Shape returned by the (mock) accounting provider — Xero-like. */
export const MockInvoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  businessLabel: z.string().regex(/^[a-z0-9-]+$/, 'ENS label: lowercase, digits, dashes'),
  debtorId: z.string(),
  debtorName: z.string(),
  amountCents: z.number().int().positive(),
  currency: z.literal('USD'),
  issuedDate: z.number().int(), // unix seconds
  dueDate: z.number().int(), // unix seconds
  status: z.enum(['DRAFT', 'AUTHORISED', 'PAID', 'VOIDED']),
  debtor: z.object({
    onTimeRatio: z.number().min(0).max(1),
    avgDaysLate: z.number().min(0),
    invoicesPaid: z.number().int().min(0),
  }),
})
export type MockInvoice = z.infer<typeof MockInvoiceSchema>

/** Body the web app posts to /api/finance and the CRE HTTP trigger receives. */
export const FinanceRequestSchema = z.object({
  businessLabel: z.string().regex(/^[a-z0-9-]+$/),
  invoiceId: z.string(),
  /** unix seconds; passed in so the TEE handler stays deterministic (no Date.now inside) */
  asOf: z.number().int(),
})
export type FinanceRequest = z.infer<typeof FinanceRequestSchema>

/** Lifecycle as stored in the ENS `status` text record. */
export const InvoiceStatus = z.enum(['pending', 'verified', 'financed', 'settled', 'rejected'])
export type InvoiceStatus = z.infer<typeof InvoiceStatus>

/** Everything the frontend can resolve for one invoice purely from ENS + Mirror Node. */
export const VerifiedInvoiceSchema = z.object({
  ensName: z.string(), // inv-1042.acme.receivable.eth
  businessName: z.string(), // acme.receivable.eth
  invoiceHash: z.string().regex(/^0x[0-9a-f]{64}$/),
  faceValueCents: z.number().int(),
  dueDate: z.number().int(),
  riskScore: z.number().int().min(0).max(100),
  discountBps: z.number().int().min(0).max(10000),
  status: InvoiceStatus,
  atsToken: z.string().optional(), // Hedera EVM address of the ATS bond diamond
  hcsSeq: z.string().optional(), // HCS sequence number of the registry entry
})
export type VerifiedInvoice = z.infer<typeof VerifiedInvoiceSchema>
