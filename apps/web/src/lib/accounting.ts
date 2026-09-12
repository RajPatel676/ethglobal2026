import { MockInvoiceSchema, type MockInvoice } from '@receivable/shared'
import { serverEnv } from './env'

/**
 * Server-side reads from the accounting provider (the Xero-shaped mock in development).
 *
 * The SMB dashboard needs a list of invoices to offer for financing, and that list is not on
 * chain — it lives in the accounting system. Only the *list* comes through here. The invoice
 * detail the risk score is computed from never touches this app: the CRE workflow fetches it
 * inside the enclave. That split is the whole privacy story, so keep this endpoint boring.
 */
export async function listInvoices(businessLabel?: string): Promise<MockInvoice[]> {
  const { mockAccountingUrl, mockAccountingToken } = serverEnv()
  const url = new URL('/invoices', mockAccountingUrl)
  if (businessLabel) url.searchParams.set('business', businessLabel)

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${mockAccountingToken}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`accounting api ${res.status}`)

  const body = (await res.json()) as { invoices: unknown[] }
  return body.invoices.flatMap((row) => {
    const parsed = MockInvoiceSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}

/** Financeable = authorised and not yet due. Mirrors the CRE handler's rules. */
export function isFinanceable(inv: MockInvoice, asOf = Math.floor(Date.now() / 1000)): boolean {
  return inv.status === 'AUTHORISED' && inv.dueDate > asOf && inv.amountCents > 0
}

export function whyNotFinanceable(inv: MockInvoice, asOf = Math.floor(Date.now() / 1000)): string | null {
  if (inv.status !== 'AUTHORISED') return `Status is ${inv.status}`
  if (inv.dueDate <= asOf) return 'Past due'
  if (inv.amountCents <= 0) return 'No value'
  return null
}
