import Link from 'next/link'
import { Card } from '@/components/ui'

const STEPS = [
  {
    n: '01',
    title: 'Verified inside an enclave',
    body: 'A Chainlink CRE confidential workflow reads the invoice and the debtor’s payment history inside an AWS Nitro enclave. Only seven fields ever leave it: the fingerprint, face value, due date, risk score and discount.',
  },
  {
    n: '02',
    title: 'Named on ENS',
    body: 'The DON-signed report mints inv-1042.acme.receivable.eth. The verification facts live as text records that only the workflow can write — the business cannot mint a name for an invoice that was never verified.',
  },
  {
    n: '03',
    title: 'Registered against double financing',
    body: 'A canonical hash of the invoice goes on a public Hedera Consensus Service topic. Any lender computing the same hash sees it is already financed.',
  },
  {
    n: '04',
    title: 'Tokenized and sold',
    body: 'An ATS security token is issued on Hedera and sold below par in whole-dollar units. The business is paid the moment an investor buys; the discount is the investor’s return at maturity.',
  },
]

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          Get paid today for an invoice due in ninety days.
        </h1>
        <p className="mt-3 text-muted">
          Every invoice here was verified inside a trusted execution environment, named on ENS, and
          registered against double financing — so an investor can check the whole chain of custody
          without trusting us, and without ever seeing the underlying invoice.
        </p>
        <div className="mt-5 flex gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            I have invoices
          </Link>
          <Link
            href="/market"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-white/5"
          >
            I want to invest
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {STEPS.map((s) => (
          <Card key={s.n}>
            <div className="font-mono text-xs text-accent">{s.n}</div>
            <div className="mt-2 font-medium">{s.title}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
          </Card>
        ))}
      </section>

      <section className="text-sm text-muted">
        Any invoice name resolves publicly — try{' '}
        <Link href="/inv/inv-1042.acme.receivable.eth" className="text-accent hover:underline">
          /inv/inv-1042.acme.receivable.eth
        </Link>
        .
      </section>
    </div>
  )
}
