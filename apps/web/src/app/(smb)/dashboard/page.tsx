import Link from 'next/link'
import { listInvoices, isFinanceable, whyNotFinanceable } from '@/lib/accounting'
import { FinanceButton } from '@/components/invoice/finance-button'
import { Badge, Card, Empty, Stat } from '@/components/ui'
import { formatCents, formatDate, daysUntil, riskLabel } from '@/lib/utils'
import { riskScore, discountBps } from '@receivable/shared'

export const dynamic = 'force-dynamic'

/**
 * The SMB's view: which invoices can be turned into cash today.
 *
 * The risk score shown here is computed locally from the same formula the enclave uses, and is
 * labelled an estimate — the binding number comes from the DON-signed report. Showing an estimate
 * beats showing nothing, but pretending it is authoritative would be a lie.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string }>
}) {
  const { business = 'acme' } = await searchParams

  let invoices
  try {
    invoices = await listInvoices(business)
  } catch (e) {
    return (
      <Empty title="Cannot reach the accounting service">
        Start it with <code className="font-mono text-xs">pnpm dev:mock</code> (port 4100).
        <div className="mt-2 font-mono text-xs">{e instanceof Error ? e.message : String(e)}</div>
      </Empty>
    )
  }

  const financeable = invoices.filter((i) => isFinanceable(i))
  const totalOutstanding = invoices
    .filter((i) => i.status === 'AUTHORISED')
    .reduce((sum, i) => sum + BigInt(i.amountCents), 0n)
  const available = financeable.reduce((sum, i) => sum + BigInt(i.amountCents), 0n)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.75rem] font-semibold tracking-tight">{business}</h1>
        <p className="mt-1 text-sm text-muted">Invoices from your accounting system</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Stat label="Outstanding" value={formatCents(totalOutstanding)} />
        </Card>
        <Card>
          <Stat
            label="Financeable now"
            value={formatCents(available)}
            hint={`${financeable.length} of ${invoices.length} invoices`}
          />
        </Card>
        <Card>
          <Stat label="Financed" value="—" hint="Appears once verification completes" />
        </Card>
      </div>

      {invoices.length === 0 ? (
        <Empty title="No invoices for this business">
          Try <Link href="/dashboard?business=acme" className="text-accent">?business=acme</Link>.
        </Empty>
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-sand/60 text-left text-2xs font-medium uppercase tracking-wider text-faint">
                <th className="px-5 py-3 font-medium">Invoice</th>
                <th className="px-5 py-3 font-medium">Debtor</th>
                <th className="px-5 py-3 text-right font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Due</th>
                <th className="px-5 py-3 font-medium">Est. terms</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const blocked = whyNotFinanceable(inv)
                const score = riskScore(inv.debtor)
                const bps = discountBps(score)
                const risk = riskLabel(score)
                const days = daysUntil(inv.dueDate)
                return (
                  <tr key={inv.id} className="border-b border-border/70 transition-colors last:border-0 hover:bg-sand/40">
                    <td className="px-5 py-3">
                      <Link href={`/invoices/${inv.id}`} className="font-medium transition-colors hover:text-accent">
                        {inv.number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-muted">{inv.debtorName}</td>
                    <td className="tnum px-5 py-3 text-right font-medium">{formatCents(inv.amountCents)}</td>
                    <td className="px-5 py-3 text-muted">
                      {formatDate(inv.dueDate)}
                      <div className="text-xs">{days > 0 ? `in ${days}d` : `${-days}d ago`}</div>
                    </td>
                    <td className="px-5 py-3">
                      {blocked ? (
                        <span className="text-xs text-muted">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge tone={risk.tone}>{risk.label}</Badge>
                          <span className="text-xs text-muted">~{(bps / 100).toFixed(2)}% fee</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <FinanceButton
                        businessLabel={inv.businessLabel}
                        invoiceId={inv.id}
                        disabled={Boolean(blocked)}
                        disabledReason={blocked}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-muted">
        Estimated terms are computed locally with the same formula the enclave uses. The binding
        risk score and discount come from the DON-signed report.
      </p>
    </div>
  )
}
