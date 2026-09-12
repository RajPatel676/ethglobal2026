import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Address } from 'viem'
import { resolveInvoice, resolveBusiness, ensConfigured } from '@/lib/ens'
import { readMarket } from '@/lib/hedera'
import { BuyPanel } from '@/components/investor/buy-panel'
import { Badge, Card, Mono, NotConfigured, Progress, Row, StatusBadge } from '@/components/ui'
import { hashscanContract } from '@receivable/shared'
import { ensAppName } from '@/lib/chains'
import {
  formatCents, formatBps, formatDate, formatMicro, daysUntil, riskLabel, annualisedYieldPct,
} from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function MarketDetail({ params }: { params: Promise<{ label: string }> }) {
  const { label } = await params
  const ensName = decodeURIComponent(label)

  if (!ensConfigured()) {
    return <NotConfigured what="ENS resolution" step="contracts/sepolia/script (Step 3b)" />
  }

  const invoice = await resolveInvoice(ensName).catch(() => null)
  if (!invoice) notFound()

  const [business, market] = await Promise.all([
    resolveBusiness(invoice.businessName).catch(() => null),
    invoice.atsToken ? readMarket(invoice.atsToken as Address) : Promise.resolve(null),
  ])

  const risk = riskLabel(invoice.riskScore)
  const days = daysUntil(invoice.dueDate)
  const apy = annualisedYieldPct(invoice.discountBps, days)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/market" className="text-sm text-muted hover:text-fg">← Market</Link>
          <h1 className="mt-1 font-mono text-xl font-semibold tracking-tight">{ensName}</h1>
          <p className="text-sm text-muted">
            {business?.description || invoice.businessName}
            {business?.kycStatus === 'verified' ? (
              <span className="ml-2"><Badge tone="good">KYC verified</Badge></span>
            ) : null}
          </p>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">Verified terms</span>
              <Badge tone={risk.tone}>{risk.label} · {invoice.riskScore}/100</Badge>
            </div>
            <Row label="Face value">{formatCents(invoice.faceValueCents)}</Row>
            <Row label="Discount">{formatBps(invoice.discountBps)}</Row>
            <Row label="Due">{formatDate(invoice.dueDate)} <span className="text-muted">({days}d)</span></Row>
            <Row label="Annualised">{apy ? `${apy.toFixed(1)}%` : '—'}</Row>
            <Row label="Invoice hash"><Mono>{invoice.invoiceHash}</Mono></Row>
          </Card>

          {market ? (
            <Card>
              <div className="mb-3 text-sm font-medium">Funding</div>
              <Progress value={market.unitsSold} max={market.totalUnits} />
              <div className="mt-2 flex justify-between text-sm">
                <span className="tabular-nums">
                  {market.unitsSold.toString()} / {market.totalUnits.toString()} units
                </span>
                <span className="text-muted">{market.status}</span>
              </div>
              <div className="mt-3">
                <Row label="Unit price">{formatMicro(market.unitPriceMicro)}</Row>
                <Row label="Remaining">{market.unitsRemaining.toString()} units</Row>
                <Row label="Funding closes">{formatDate(market.fundingDeadline)}</Row>
              </div>
            </Card>
          ) : invoice.atsToken ? (
            <Card className="border-dashed">
              <div className="text-sm font-medium">Market not readable yet</div>
              <div className="mt-1 text-sm text-muted">
                ENS records <Mono>{invoice.atsToken}</Mono>, but Hedera has not returned it. It may
                still be propagating.
              </div>
            </Card>
          ) : (
            <Card className="border-dashed">
              <div className="text-sm font-medium">Awaiting tokenization</div>
              <div className="mt-1 text-sm text-muted">
                Verified on Sepolia. The adapter mints the bond and deploys the market next.
              </div>
            </Card>
          )}

          <Card>
            <div className="mb-3 text-sm font-medium">Provenance</div>
            <Row label="ENS">
              <a href={ensAppName(ensName)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                view name
              </a>
            </Row>
            {invoice.hcsSeq ? <Row label="HCS registry">#{invoice.hcsSeq}</Row> : null}
            {invoice.atsToken ? (
              <Row label="ATS token">
                <a href={hashscanContract(invoice.atsToken)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  <Mono>{invoice.atsToken}</Mono>
                </a>
              </Row>
            ) : null}
            <Row label="Public page">
              <Link href={`/inv/${ensName}`} className="text-accent hover:underline">/inv/{ensName}</Link>
            </Row>
          </Card>
        </div>

        <div>
          {market ? (
            <BuyPanel
              marketAddress={market.address}
              unitPriceMicro={market.unitPriceMicro}
              unitsRemaining={market.unitsRemaining}
              status={market.status}
            />
          ) : (
            <Card><div className="text-sm text-muted">Not open for investment yet.</div></Card>
          )}
        </div>
      </div>
    </div>
  )
}
