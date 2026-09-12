import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { bearerAuth } from 'hono/bearer-auth'
import { logger } from 'hono/logger'
import { invoicesRoute, invoices } from './routes/invoices.js'

/**
 * Xero-shaped mock. Bearer token = the "OAuth access token" the SMB granted us; in the product it
 * is stored ONLY as a CRE Vault DON secret and read with runtime.getSecret() inside the enclave.
 */
const token = process.env.MOCK_ACCOUNTING_TOKEN ?? 'demo-xero-token-change-me'
const port = Number(process.env.MOCK_ACCOUNTING_PORT ?? 4100)

/**
 * The seed invoices carry absolute unix dates, so they go stale: once every dueDate is in the
 * past, nothing is financeable and the whole demo silently shows an empty market. That is a
 * confusing failure to debug at 3am before a submission, so say it loudly at boot.
 */
function warnIfStale() {
  const now = Math.floor(Date.now() / 1000)
  const financeable = invoices.filter((i) => i.status === 'AUTHORISED' && i.dueDate > now)
  if (financeable.length > 0) {
    console.log(`mock-accounting: ${financeable.length}/${invoices.length} invoices financeable`)
    return
  }
  console.warn(
    '\n  ⚠  NO FINANCEABLE INVOICES — every seeded dueDate is in the past.\n' +
      '     The dashboard will show $0.00 and the market will be empty.\n' +
      '     Shift the dates forward in src/data/invoices.json.\n',
  )
}
warnIfStale()

const app = new Hono()
app.use('*', logger())
app.get('/health', (c) => c.json({ ok: true, provider: 'mock-xero' }))
app.use('/invoices/*', bearerAuth({ token }))
app.use('/invoices', bearerAuth({ token }))
app.route('/invoices', invoicesRoute)

serve({ fetch: app.fetch, port }, () => console.log(`mock-accounting listening on :${port}`))
