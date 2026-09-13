'use client'

import { useState } from 'react'

type Result = { ok: boolean; message: string; detail?: string }

/**
 * Kicks off verification for one invoice.
 *
 * The button reports precisely what happened, including the not-yet-configured cases, because
 * during the build the interesting failure is almost always "the workflow is not deployed" rather
 * than a real error — and a generic "something went wrong" hides that.
 */
export function FinanceButton({
  businessLabel,
  invoiceId,
  disabled,
  disabledReason,
}: {
  businessLabel: string
  invoiceId: string
  disabled?: boolean
  disabledReason?: string | null
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  async function submit() {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessLabel, invoiceId }),
      })
      const body = (await res.json()) as Record<string, unknown>
      if (res.ok) {
        setResult({ ok: true, message: 'Verification requested. Watch for the ENS name to appear.' })
      } else if (res.status === 503) {
        setResult({
          ok: false,
          message: 'Not wired up yet',
          detail: String(body.detail ?? 'Missing configuration.'),
        })
      } else {
        setResult({ ok: false, message: String(body.error ?? 'Request failed'), detail: String(body.detail ?? '') })
      }
    } catch (e) {
      setResult({ ok: false, message: 'Network error', detail: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  if (disabled) {
    return <span className="text-xs text-faint">{disabledReason ?? 'Not financeable'}</span>
  }

  return (
    <div className="text-right">
      <button
        onClick={submit}
        disabled={busy}
        className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-card transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? 'Requesting…' : 'Finance'}
      </button>
      {result ? (
        <div className={`mt-1.5 max-w-xs text-xs ${result.ok ? 'text-good' : 'text-warn'}`}>
          {result.message}
          {result.detail ? <div className="mt-0.5 text-muted">{result.detail}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
