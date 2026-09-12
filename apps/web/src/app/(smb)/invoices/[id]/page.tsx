import Link from 'next/link'
import { notFound } from 'next/navigation'
import { riskScore, discountBps, unitPriceMicro, invoiceName } from '@receivable/shared'
import { listInvoices, whyNotFinanceable } from '@/lib/accounting'
import { resolveInvoice, ensConfigured } from '@/lib/ens'
import { FinanceButton } from '@/components/invoice/finance-button'
import { Badge, Card, Row, Mono, StatusBadge, NotConfigured } from '@/components/ui'
import { formatCents, formatDate, formatBps, daysUntil, riskLabel, annualisedYieldPct } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const invoices = await listInvoices().catch(() => [])
  const inv = invoices.find((i) => i.id === id)
  if (!inv) notFound()

  const score = riskScore(inv.debtor)
  const bps = discountBps(score)
  const risk = riskLabel(score)
  const days = daysUntil(inv.dueDate)
  const blocked = whyNotFinanceable(inv)
  const ensName = invoiceName(`inv-${inv.id}`, inv.businessLabel)
  const onChain = ensConfigured() ? await resolveInvoice(ensName).catch(() => null) : null
  const apy = annualisedYieldPct(bps, days)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm text-muted hover:text-fg">
            ← My invoices
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{inv.number}</h1>
          <p className="text-sm text-muted">{inv.debtorName}</p>
        </div>
        {onChain ? (
          <StatusBadge status={onChain.status} />
        ) : (
          <Badge tone="neutral">not yet verified</Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 text-sm font-medium">From your accounting system</div>
          <Row label="Face value">{formatCents(inv.amountCents)}</Row>
          <Row label="Issued">{formatDate(inv.issuedDate)}</Row>
          <Row label="Due">
            {formatDate(inv.dueDate)} <span className="text-muted">({days}d)</span>
          </Row>
          <Row label="Status">{inv.status}</Row>
          <Row label="Debtor on-time rate">{(inv.debtor.onTimeRatio * 100).toFixed(0)}%</Row>
          <Row label="Debtor avg days late">{inv.debtor.avgDaysLate}</Row>
          <Row label="Debtor invoices paid">{inv.debtor.invoicesPaid}</Row>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Estimated terms</span>
            <Badge tone={risk.tone}>{risk.label}</Badge>
          </div>
          <Row label="Risk score">{score} / 100</Row>
          <Row label="Discount">{formatBps(bps)}</Row>
          <Row label="Unit price">
            ${(Number(unitPriceMicro(bps)) / 1e6).toFixed(4)} per $1
          </Row>
          <Row label="You receive">
            {formatCents((BigInt(inv.amountCents) * BigInt(10_000 - bps)) / 10_000n)}
          </Row>
          <Row label="Investor annualised">{apy ? `${apy.toFixed(1)}%` : '—'}</Row>
          <div className="mt-4 flex justify-end">
            <FinanceButton
              businessLabel={inv.businessLabel}
              invoiceId={inv.id}
              disabled={Boolean(blocked) || Boolean(onChain)}
              disabledReason={blocked ?? (onChain ? 'Already verified' : null)}
            />
          </div>
        </Card>
      </div>

      {onChain ? (
        <Card>
          <div className="mb-3 text-sm font-medium">On-chain record</div>
          <Row label="ENS name">
            <Link href={`/inv/${ensName}`} className="text-accent hover:underline">
              <Mono>{ensName}</Mono>
            </Link>
          </Row>
          <Row label="Invoice hash"><Mono>{onChain.invoiceHash}</Mono></Row>
          <Row label="Verified face value">{formatCents(onChain.faceValueCents)}</Row>
          <Row label="Verified discount">{formatBps(onChain.discountBps)}</Row>
          {onChain.atsToken ? <Row label="ATS token"><Mono>{onChain.atsToken}</Mono></Row> : null}
          {onChain.hcsSeq ? <Row label="HCS sequence">#{onChain.hcsSeq}</Row> : null}
        </Card>
      ) : ensConfigured() ? (
        <Card className="border-dashed">
          <div className="text-sm font-medium">Not on chain yet</div>
          <div className="mt-1 text-sm text-muted">
            Nothing resolves at <Mono>{ensName}</Mono>. Request financing to have the CRE workflow
            verify it and mint the name.
          </div>
        </Card>
      ) : (
        <NotConfigured what="ENS resolution" step="contracts/sepolia/script (Step 3b)" />
      )}

      <p className="text-xs text-muted">
        The invoice detail above never leaves this browser session. The risk score that matters is
        computed inside the enclave from data fetched there — this app never sends it anywhere.
      </p>
    </div>
  )
}
