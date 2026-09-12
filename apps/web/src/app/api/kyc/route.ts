import { NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'

/**
 * POST /api/kyc — hand a business onboarding request to the adapter.
 *
 * A thin proxy on purpose: the adapter holds the API key and knows the deployment, and the
 * browser should never see either. The adapter itself cannot complete onboarding — `onboardBusiness`
 * is `onlyOwner` on VerificationConsumer and the adapter key deliberately has no owner rights — so
 * this returns the exact command for a human to run with the deployer key.
 */
export async function POST(req: Request) {
  const { adapterUrl, adapterApiKey } = serverEnv()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (!adapterApiKey) {
    return NextResponse.json(
      { error: 'not configured', detail: 'ADAPTER_API_KEY is unset.' },
      { status: 503 },
    )
  }

  try {
    const res = await fetch(new URL('/kyc/onboard', adapterUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adapterApiKey}` },
      body: JSON.stringify(body),
    })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch (e) {
    return NextResponse.json(
      { error: 'adapter unreachable', detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }
}
