import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hashscanTopic, hashscanContract } from '@receivable/shared'
import { resolveInvoice, resolveBusiness, ensConfigured } from '@/lib/ens'
import { Badge, Card, Mono, NotConfigured, Row, StatusBadge } from '@/components/ui'
import { ensAppName } from '@/lib/chains'
import { formatCents, formatBps, formatDate, daysUntil, riskLabel } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>
}): Promise<Metadata> {
  const { name } = await params
  return { title: `${decodeURIComponent(name)} — receivable.eth` }
}

/**
 * The public record for one invoice. No wallet, no login, no API of ours.
 *
 * This page is the argument the whole project makes: everything shown below is read from ENS text
 * records that only a DON-signed report could have written. A sceptical investor can verify each
 * line independently — the resolver on Sepolia, the topic on Hedera — and never has to trust this
 * server. The underlying invoice stays private; only the fingerprint is public.
 */
export default async function PublicInvoicePage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const ensName = decodeURIComponent(name)

  if (!ensConfigured()) {
    return (
      <div className="space-y-4">
        <h1 className="font-mono text-xl font-semibold">{ensName}</h1>
        <NotConfigured what="ENS resolution" step="contracts/sepolia/script (Step 3b)" />
      </div>
    )
  }

  const invoice = await resolveInvoice(ensName).catch(() => null)
  if (!invoice) notFound()

  const business = await resolveBusiness(invoice.businessName).catch(() => null)
  const risk = riskLabel(invoice.riskScore)
  const days = daysUntil(invoice.dueDate)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <StatusBadge status={invoice.status} />
          <Badge tone={risk.tone}>{risk.label}</Badge>
        </div>
        <h1 className="mt-2 font-mono text-xl font-semibold tracking-tight">{ensName}</h1>
        <p className="text-sm text-muted">
          Issued by {invoice.businessName}
          {business?.kycStatus === 'verified' ? ' · KYC verified' : ''}
        </p>
      </div>

      <Card>
        <div className="mb-3 text-sm font-medium">Verified by a Chainlink DON</div>
        <Row label="Face value">{formatCents(invoice.faceValueCents)}</Row>
        <Row label="Due">{formatDate(invoice.dueDate)} <span className="text-muted">({days}d)</span></Row>
        <Row label="Risk score">{invoice.riskScore} / 100</Row>
        <Row label="Discount">{formatBps(invoice.discountBps)}</Row>
        <Row label="Invoice fingerprint"><Mono>{invoice.invoiceHash}</Mono></Row>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-medium">Verify this yourself</div>
        <Row label="ENS name">
          <a href={ensAppName(ensName)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            resolver records
          </a>
        </Row>
        {invoice.hcsSeq ? (
          <Row label="Double-financing registry">
            <a
              href={hashscanTopic(process.env.NEXT_PUBLIC_HCS_TOPIC_ID ?? '')}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              HCS entry #{invoice.hcsSeq}
            </a>
          </Row>
        ) : null}
        {invoice.atsToken ? (
          <Row label="Security token">
            <a href={hashscanContract(invoice.atsToken)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              <Mono>{invoice.atsToken}</Mono>
            </a>
          </Row>
        ) : null}
      </Card>

      <p className="text-xs leading-relaxed text-muted">
        The invoice itself is never published. What you see is a keccak fingerprint of it, plus the
        figures a Chainlink DON signed after reading the invoice and the debtor’s payment history
        inside an AWS Nitro enclave. Any lender who computes the same fingerprint can check the
        Hedera topic and see this invoice is already financed.
      </p>
    </div>
  )
}
