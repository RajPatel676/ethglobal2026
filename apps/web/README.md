# apps/web

Next.js 15 (App Router) + Tailwind. Three audiences, one app.

```
/                       what the system does
/dashboard              SMB — invoices from accounting, request financing
/invoices/[id]          SMB — one invoice, estimated terms, on-chain record
/market                 investor — listings resolved from ENS
/market/[label]         investor — verified terms, funding progress, buy
/portfolio              investor — holdings, read from Hedera by wallet
/inv/[name]             public — no wallet, no login, no API of ours
/api/finance            signs and forwards the CRE HTTP trigger
/api/kyc                proxies onboarding to the adapter
```

```bash
pnpm dev:mock    # accounting stand-in on :4100 — the dashboard needs it
pnpm dev:web     # :3000
```

## The two ideas the UI is built around

**Listings come from ENS, not from us.** `/market` and `/inv/[name]` read text records off the
resolver and nothing else — no database, no backend of ours in the path. That is the project's
central claim, so the code makes it literally true: `lib/ens.ts` talks to the resolver and returns
`null` when a name has no records.

**The invoice stays private.** Only its keccak fingerprint is ever public. The dashboard shows an
estimated risk score computed locally from the same formula the enclave uses, clearly labelled an
estimate — the binding number comes from the DON-signed report. This app never sends invoice
detail anywhere; the CRE workflow fetches it inside the enclave.

## Degrading before deployment

Every chain-dependent view has an explicit unconfigured state naming the step that produces the
missing address, rather than rendering an empty list that looks like a bug. `/market` goes further
and shows what *would* be listed, marked as a preview. The app builds and runs with no contracts
deployed and no `.env` — which is how it has been developed and reviewed.

## Two deliberate deviations

**No Privy, despite the plan naming it.** Privy needs an app id issued per project, so depending
on it means the app cannot start without a third-party signup. wagmi v2 discovers injected wallets
over EIP-6963 with no connector declared at all. Adding Privy later touches `lib/wagmi.ts` and
`components/layout/providers.tsx` and nothing else.

**No `wagmi/connectors` import.** That barrel pulls in the Coinbase/Base SDK, whose optional
`@x402/*` dependencies are unresolvable and fail `next build` outright. EIP-6963 discovery covers
the same wallets without it.

## Not wired yet

`BuyPanel` quotes correctly from the market's own `unitPriceMicro` but its buy button is disabled:
a real purchase needs a USDC approval plus both tokens associated on the investor's Hedera
account, and that sequence is worth building against a live market rather than guessing. Portfolio
positions likewise show zero until there is a market to read.
