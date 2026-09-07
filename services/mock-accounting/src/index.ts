import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { bearerAuth } from 'hono/bearer-auth'
import { logger } from 'hono/logger'
import { invoicesRoute } from './routes/invoices.js'

/**
 * Xero-shaped mock. Bearer token = the "OAuth access token" the SMB granted us; in the product it
 * is stored ONLY as a CRE Vault DON secret and read with runtime.getSecret() inside the enclave.
 */
const token = process.env.MOCK_ACCOUNTING_TOKEN ?? 'demo-xero-token-change-me'
const port = Number(process.env.MOCK_ACCOUNTING_PORT ?? 4100)

const app = new Hono()
app.use('*', logger())
app.get('/health', (c) => c.json({ ok: true, provider: 'mock-xero' }))
app.use('/invoices/*', bearerAuth({ token }))
app.use('/invoices', bearerAuth({ token }))
app.route('/invoices', invoicesRoute)

serve({ fetch: app.fetch, port }, () => console.log(`mock-accounting listening on :${port}`))
