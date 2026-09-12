'use client'

import { useMemo, useState } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { HEDERA_TESTNET } from '@receivable/shared'
import { formatMicro } from '@/lib/utils'
import { Card } from '@/components/ui'

/**
 * Purchase panel.
 *
 * The quote is computed client-side from the market's own `unitPriceMicro`, so what the investor
 * sees is the number the contract will charge — not a re-derivation that could drift from it.
 *
 * The actual `buy` needs a USDC approval first and both tokens associated on Hedera; that
 * sequence is deliberately left explicit rather than hidden behind one button, because a failed
 * association mid-flow is confusing when it happens silently.
 */
export function BuyPanel({
  marketAddress,
  unitPriceMicro,
  unitsRemaining,
  status,
}: {
  marketAddress: string
  unitPriceMicro: bigint
  unitsRemaining: bigint
  status: string
}) {
  const { isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [units, setUnits] = useState('100')

  const parsed = useMemo(() => {
    const n = Number(units)
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null
    if (BigInt(n) > unitsRemaining) return null
    return BigInt(n)
  }, [units, unitsRemaining])

  const cost = parsed ? parsed * unitPriceMicro : 0n
  const par = parsed ? parsed * 1_000_000n : 0n
  const onHedera = chainId === HEDERA_TESTNET.chainId

  if (status !== 'Open') {
    return (
      <Card>
        <div className="text-sm font-medium">This market is {status.toLowerCase()}</div>
        <p className="mt-1 text-sm text-muted">
          {status === 'Settled'
            ? 'The debtor has paid. Holders can redeem at par from the Portfolio page.'
            : 'Funding closed without selling out. Buyers can reclaim what they paid.'}
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <div className="text-sm font-medium">Buy units</div>
      <p className="mt-1 text-xs text-muted">
        One unit is $1 of face value, redeemable at par once the debtor settles.
      </p>

      <label className="mt-4 block text-xs uppercase tracking-wide text-muted" htmlFor="units">
        Units
      </label>
      <input
        id="units"
        inputMode="numeric"
        value={units}
        onChange={(e) => setUnits(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 tabular-nums outline-none focus:border-accent"
      />
      <div className="mt-1 text-xs text-muted">{unitsRemaining.toString()} available</div>

      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">You pay</dt>
          <dd className="tabular-nums">{parsed ? formatMicro(cost) : '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Redeems at</dt>
          <dd className="tabular-nums">{parsed ? formatMicro(par) : '—'}</dd>
        </div>
        <div className="flex justify-between font-medium">
          <dt>Return</dt>
          <dd className="tabular-nums text-good">{parsed ? formatMicro(par - cost) : '—'}</dd>
        </div>
      </dl>

      {!isConnected ? (
        <p className="mt-4 text-sm text-muted">Connect a wallet to buy.</p>
      ) : !onHedera ? (
        <button
          onClick={() => switchChain({ chainId: HEDERA_TESTNET.chainId })}
          className="mt-4 w-full rounded-lg border border-border py-2 text-sm font-medium hover:bg-white/5"
        >
          Switch to Hedera testnet
        </button>
      ) : (
        <div className="mt-4 space-y-2">
          <button
            disabled
            className="w-full rounded-lg bg-accent py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Buy {parsed?.toString() ?? '—'} units
          </button>
          <p className="text-xs text-muted">
            Purchase requires a USDC approval to{' '}
            <span className="font-mono">{marketAddress.slice(0, 10)}…</span> and both tokens
            associated on your Hedera account. Enable once a market is live on testnet.
          </p>
        </div>
      )}
    </Card>
  )
}
