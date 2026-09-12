'use client'

import { useAccount } from 'wagmi'
import { HEDERA_TESTNET } from '@receivable/shared'
import { Card, Empty, Stat } from '@/components/ui'

/**
 * Holdings.
 *
 * Client-rendered because it is entirely a function of the connected wallet — there is no
 * server-side notion of "your" portfolio, which is the point: positions are ERC-1410 balances on
 * Hedera, not rows in our database.
 */
export default function PortfolioPage() {
  const { address, isConnected, chainId } = useAccount()

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
        <Empty title="Connect a wallet">
          Your positions are token balances on Hedera, read from the chain — nothing is stored here.
        </Empty>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio</h1>
        <p className="font-mono text-xs text-muted">{address}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><Stat label="Positions" value="0" /></Card>
        <Card><Stat label="At cost" value="$0.00" /></Card>
        <Card><Stat label="Redeemable at par" value="$0.00" /></Card>
      </div>

      {chainId !== HEDERA_TESTNET.chainId ? (
        <Empty title="Switch to Hedera testnet">
          Positions live on chain {HEDERA_TESTNET.chainId}. You are connected to {chainId}.
        </Empty>
      ) : (
        <Empty title="No positions yet">
          Buy units from the Market. Holdings are discovered by reading each market you have bought
          into — there is no index to fall out of sync.
        </Empty>
      )}
    </div>
  )
}
