import { Hono } from 'hono'
import { MockInvoiceSchema, type MockInvoice } from '@receivable/shared/schemas'
import raw from '../data/invoices.json' with { type: 'json' }

const invoices: MockInvoice[] = raw.map((r) => MockInvoiceSchema.parse(r))

export const invoicesRoute = new Hono()

/** GET /invoices?business=acme — list (used by the web app; never by the TEE) */
invoicesRoute.get('/', (c) => {
  const business = c.req.query('business')
  const rows = business ? invoices.filter((i) => i.businessLabel === business) : invoices
  return c.json({ invoices: rows })
})

/** GET /invoices/:id — single invoice incl. debtor payment history (fetched INSIDE the TEE) */
invoicesRoute.get('/:id', (c) => {
  const inv = invoices.find((i) => i.id === c.req.param('id'))
  if (!inv) return c.json({ error: 'not found' }, 404)
  return c.json(inv)
})
