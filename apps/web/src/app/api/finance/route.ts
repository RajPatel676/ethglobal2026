import { NextResponse } from 'next/server'
import { privateKeyToAccount } from 'viem/accounts'
import { FinanceRequestSchema } from '@receivable/shared'
import { serverEnv } from '@/lib/env'

/**
 * POST /api/finance — ask the CRE workflow to verify and finance one invoice.
 *
 * The workflow's HTTP trigger is gated by `authorizedKeys` in config.staging.json: the request
 * must be signed by a known EVM key. That key lives here, server-side, and never reaches the
 * browser — otherwise anyone could trigger verifications against the SMB's accounting data.
 *
 * `asOf` is set here rather than inside the enclave on purpose. The TEE handler must be
 * deterministic across DON nodes, so it cannot call Date.now(); the trigger supplies the clock.
 */
export async function POST(req: Request) {
  const { triggerSignerKey, creTriggerUrl } = serverEnv()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const parsed = FinanceRequestSchema.omit({ asOf: true }).safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid request', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    )
  }

  const payload = { ...parsed.data, asOf: Math.floor(Date.now() / 1000) }

  if (!triggerSignerKey || !triggerSignerKey.startsWith('0x')) {
    return NextResponse.json(
      {
        error: 'not configured',
        detail:
          'TRIGGER_SIGNER_PRIVATE_KEY is unset. Its address must match authorizedEVMAddress in ' +
          'services/cre/verify-invoice/config.staging.json. See docs/SETUP.md.',
        wouldSend: payload,
      },
      { status: 503 },
    )
  }

  const account = privateKeyToAccount(triggerSignerKey as `0x${string}`)
  const message = JSON.stringify(payload)
  const signature = await account.signMessage({ message })

  if (!creTriggerUrl) {
    // Everything above is real; only the destination is missing. Returning the signed payload
    // makes the request reproducible with curl while the workflow is not yet deployed.
    return NextResponse.json(
      {
        status: 'unsent',
        detail: 'CRE_TRIGGER_URL is unset — deploy the workflow and set it.',
        signer: account.address,
        payload,
        signature,
      },
      { status: 503 },
    )
  }

  try {
    const res = await fetch(creTriggerUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': signature },
      body: message,
    })
    const text = await res.text()
    if (!res.ok) {
      return NextResponse.json({ error: 'cre trigger rejected', status: res.status, body: text }, { status: 502 })
    }
    return NextResponse.json({ status: 'triggered', signer: account.address, payload, response: text })
  } catch (e) {
    return NextResponse.json(
      { error: 'cre trigger unreachable', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }
}
