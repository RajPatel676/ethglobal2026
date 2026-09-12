import Link from 'next/link'
import { listInvoices, isFinanceable } from '@/lib/accounting'
import { resolveInvoice, ensConfigured } from '@/lib/ens'
import { invoiceName, riskScore, discountBps } from '@receivable/shared'
import { Badge, Card, Empty, NotConfigured, Stat, StatusBadge } from '@/components/ui'
import { formatCents, formatBps, formatDate, daysUntil, riskLabel, annualisedYieldPct } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * The investor's view.
 *
 * Listings come from ENS, not from a database of ours — that is the point. Until the contracts
 * are deployed there is nothing to resolve, so the page falls back to showing what *would* be
 * offered, clearly labelled as a preview rather than live inventory.
 */
export default async function MarketPage() {
  const configured = ensConfigured()
  const candidates = await listInvoices().catch(() => [])
  const financeable = candidates.filter((i) => isFinanceable(i))

  const listings = configured
    ? (
        await Promise.all(
          financeable.map(async (inv) => {
            const name = invoiceName(`inv-${inv.id}`, inv.businessLabel)
            const rec = await resolveInvoice(name).catch(() => null)
            return rec && (rec.status === 'financed' || rec.status === 'verified') ? rec : null
          }),
        )
      ).flatMap((r) => (r ? [r] : []))
    : []

  const totalOffered = listings.reduce((s, l) => s + BigInt(l.faceValueCents), 0n)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Market</h1>
        <p className="text-sm text-muted">
          Verified invoices, resolved live from ENS. No listing exists that a DON did not sign.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><Stat label="Live listings" value={listings.length} /></Card>
        <Card><Stat label="Face value offered" value={formatCents(totalOffered)} /></Card>
        <Card>
          <Stat
            label="Verification"
            value={configured ? 'ENS' : 'Pending'}
            hint={configured ? 'read from the resolver' : 'contracts not deployed'}
          />
        </Card>
      </div>

      {!configured ? (
        <>
          <NotConfigured what="ENS resolution" step="contracts/sepolia/script (Step 3b)" />
          <div>
            <div className="mb-2 text-sm font-medium text-muted">
              Preview — what would be listed once verified ({financeable.length})
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {financeable.map((inv) => {
                const score = riskScore(inv.debtor)
                const bps = discountBps(score)
                const risk = riskLabel(score)
                const days = daysUntil(inv.dueDate)
                const apy = annualisedYieldPct(bps, days)
                return (
                  <Card key={inv.id} className="border-dashed opacity-70">
                    <div className="flex items-start justify-between">
                      <div className="font-mono text-xs text-muted">
                        inv-{inv.id}.{inv.businessLabel}.receivable.eth
                      </div>
                      <Badge tone={risk.tone}>{risk.label}</Badge>
                    </div>
                    <div className="mt-3 text-xl font-semibold">{formatCents(inv.amountCents)}</div>
                    <div className="mt-1 text-sm text-muted">
                      {formatBps(bps)} discount · {days}d · {apy ? `${apy.toFixed(1)}% annualised` : '—'}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        </>
      ) : listings.length === 0 ? (
        <Empty title="Nothing listed yet">
          An invoice appears here once the CRE workflow verifies it and mints its ENS name.
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {listings.map((l) => {
            const risk = riskLabel(l.riskScore)
            const days = daysUntil(l.dueDate)
            const apy = annualisedYieldPct(l.discountBps, days)
            return (
              <Link key={l.ensName} href={`/market/${l.ensName}`}>
                <Card className="transition-colors hover:border-accent/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-mono text-xs text-muted">{l.ensName}</div>
                    <StatusBadge status={l.status} />
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-xl font-semibold">{formatCents(l.faceValueCents)}</span>
                    <Badge tone={risk.tone}>{risk.label}</Badge>
                  </div>
                  <div className="mt-2 text-sm text-muted">
                    {formatBps(l.discountBps)} discount · due {formatDate(l.dueDate)} ({days}d)
                  </div>
                  <div className="mt-1 text-sm text-accent">
                    {apy ? `${apy.toFixed(1)}% annualised` : '—'}
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
