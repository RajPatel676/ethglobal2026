import Link from 'next/link'
import { Card } from '@/components/ui'

const STEPS = [
  {
    n: '01',
    title: 'Priced inside an enclave',
    body: 'A Chainlink CRE confidential workflow reads the invoice and the debtor’s payment history inside an AWS Nitro TEE. Seven fields leave it — a fingerprint, face value, due date, risk score, discount. Nothing else.',
  },
  {
    n: '02',
    title: 'Named on ENS',
    body: 'The DON-signed report mints inv-1042.acme.receivable.eth. A permissioned resolver decides who may write each record, so a business cannot name an invoice that was never verified.',
  },
  {
    n: '03',
    title: 'Registered against double financing',
    body: 'A canonical hash goes on a public Hedera Consensus Service topic. Any lender computing the same hash sees the invoice is already financed — the fraud this industry actually loses money to.',
  },
  {
    n: '04',
    title: 'Tokenized and sold',
    body: 'An ATS security token is issued on Hedera and sold below par in whole-dollar units. The business is paid the moment an investor buys; the discount is the investor’s return at maturity.',
  },
]

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="pt-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent ring-1 ring-inset ring-accent/15">
          Chainlink CRE · ENSv2 · Hedera
        </span>
        <h1 className="mt-5 max-w-2xl text-[2.6rem] font-semibold leading-[1.1] tracking-tight">
          Get paid today for an invoice due in ninety days.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
          Every invoice here was priced inside a trusted execution environment, named on ENS, and
          registered against double financing — so an investor can verify the whole chain of custody
          without trusting us, and without ever seeing the invoice.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-card transition-colors hover:bg-accent-hover"
          >
            I have invoices
          </Link>
          <Link
            href="/market"
            className="rounded-lg bg-surface px-4 py-2.5 text-sm font-medium ring-1 ring-inset ring-border-strong transition-colors hover:bg-sand"
          >
            I want to invest
          </Link>
        </div>
      </section>

      <section>
        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card sm:grid-cols-2">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-surface p-6">
              <div className="font-mono text-xs font-semibold text-accent">{s.n}</div>
              <h3 className="mt-2.5 text-[15px] font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {[
          ['Seven fields', 'leave the enclave. The invoice and the debtor’s payment history never do.'],
          ['Three keys', 'is all the Hedera adapter may write on a name. Enforced on-chain, not by us.'],
          ['One fingerprint', 'shared publicly, so any lender can detect the same invoice sold twice.'],
        ].map(([h, b]) => (
          <div key={h}>
            <div className="text-sm font-semibold text-accent">{h}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{b}</p>
          </div>
        ))}
      </section>

      <Card className="flex flex-wrap items-center justify-between gap-4 bg-sand/60">
        <div>
          <div className="text-sm font-semibold">Every invoice has a public record</div>
          <p className="mt-1 text-sm text-muted">
            No wallet, no login, no API of ours — just ENS text records.
          </p>
        </div>
        <Link
          href="/inv/inv-1042.acme.receivable.eth"
          className="rounded-lg bg-surface px-3.5 py-2 font-mono text-xs ring-1 ring-inset ring-border-strong transition-colors hover:bg-surface/60"
        >
          /inv/inv-1042.acme.receivable.eth →
        </Link>
      </Card>
    </div>
  )
}
