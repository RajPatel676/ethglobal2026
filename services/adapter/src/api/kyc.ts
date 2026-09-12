import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import type { PipelineDeps } from '../pipeline/context.js'
import { findMatured, settleMatured } from '../maturity/settle.js'

/**
 * Small operator API. Not public — everything except /health sits behind ADAPTER_API_KEY.
 *
 * KYC onboarding is intentionally NOT automated here: `onboardBusiness` is `onlyOwner` on
 * VerificationConsumer and the adapter key deliberately has no owner rights. This endpoint
 * records the intent and hands back the exact call for a human to make with the deployer key.
 */
export function createApi(deps: PipelineDeps) {
  const app = new Hono()

  app.get('/health', (c) =>
    c.json({
      ok: true,
      sepoliaSigner: deps.sepolia.address,
      hederaAccount: deps.env.HEDERA_ADAPTER_ACCOUNT_ID,
      hederaEvm: deps.hedera.evmAddress,
      tracked: deps.state.all().length,
    }),
  )

  app.use('/invoices/*', bearerAuth({ token: deps.env.ADAPTER_API_KEY }))
  app.use('/kyc/*', bearerAuth({ token: deps.env.ADAPTER_API_KEY }))
  app.use('/maturity/*', bearerAuth({ token: deps.env.ADAPTER_API_KEY }))

  app.get('/invoices', (c) => c.json({ invoices: deps.state.all() }))

  app.get('/invoices/:hash', (c) => {
    const rec = deps.state.get(c.req.param('hash'))
    return rec ? c.json(rec) : c.json({ error: 'not found' }, 404)
  })

  app.post('/kyc/onboard', async (c) => {
    const body = (await c.req.json()) as { label?: string; owner?: string; hederaEvmAlias?: string }
    if (!body.label || !body.owner || !body.hederaEvmAlias) {
      return c.json({ error: 'label, owner and hederaEvmAlias are required' }, 400)
    }
    if (!/^[a-z0-9-]+$/.test(body.label)) {
      return c.json({ error: 'label must be a valid ENS label: lowercase, digits, dashes' }, 400)
    }
    return c.json({
      status: 'manual-step-required',
      why: 'onboardBusiness is onlyOwner; the adapter key has no owner rights by design.',
      run: `cast send $VERIFICATION_CONSUMER "onboardBusiness(string,address,bytes)" ${body.label} ${body.owner} ${body.hederaEvmAlias} --rpc-url sepolia --private-key $DEPLOYER_PRIVATE_KEY`,
    })
  })

  app.get('/maturity/due', (c) => c.json({ due: findMatured(deps) }))

  app.post('/maturity/settle/:hash', async (c) => {
    try {
      return c.json(await settleMatured(deps, c.req.param('hash')))
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 500)
    }
  })

  return app
}
