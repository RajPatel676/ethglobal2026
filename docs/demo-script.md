# Demo script

Four minutes. One invoice, start to finish, with the privacy claim demonstrated rather than
asserted.

**Rehearse the whole thing at least twice against testnet.** Most of what can go wrong here is
slow rather than broken, and knowing the real wall-clock timings is the difference between a calm
demo and a stalled one.

---

## Before you start

```bash
pnpm preflight          # all green?
pnpm ens:check          # all addresses set?
pnpm dev:mock           # :4100  accounting stand-in
pnpm dev:adapter        # :4200  watch this log during the demo
pnpm dev:web            # :3000
```

Windows to have open, in this order:

1. `/dashboard` — the SMB
2. A terminal running the adapter, log visible
3. `/inv/inv-1042.acme.receivable.eth` — the public record
4. HashScan on the HCS topic
5. `/market` in a second browser profile — the investor

**Use a fresh invoice id.** On-chain state is immutable and `invoiceHash` is enforced unique, so a
re-run of an already-financed invoice will be *correctly* rejected. Add a new row to
`services/mock-accounting/src/data/invoices.json` before each rehearsal.
`pnpm demo:reset` clears only the adapter's local index — it cannot undo the chain.

---

## 0:00 — The problem (20s)

> "Acme is owed $12,500, due in 60 days. They need the cash now. A factoring company would take a
> cut for one reason: they can't cheaply verify the invoice is real, or that Acme hasn't already
> sold it to someone else."

Have `/dashboard` on screen. Real invoices, real amounts, from the accounting system.

## 0:20 — Request financing (25s)

Click **Finance** on INV-1042.

> "That's it for Acme. What happens next, they don't do — and neither do we."

Point out the estimated terms already on screen and say plainly that they're an estimate; the
binding number comes from the enclave.

## 0:45 — The part that matters (60s)

Switch to the adapter log / CRE simulation output.

> "Inside an AWS Nitro enclave, the workflow pulls Acme's accounting token from the Vault DON,
> fetches the invoice **and the debtor's full payment history**, and scores it.
>
> None of that leaves the enclave. Seven fields do: a hash of the invoice, the face value, the due
> date, the risk score, and the discount. The DON signs those and writes them to Sepolia."

Show the line in `handlers/verify-invoice.ts` where `rt.usingTheDons()` is called.

> "That call is the boundary. Everything above it is enclave-side. Debtor payment history is
> commercially sensitive — this is how you price on it without publishing it."

**If asked why not `ConfidentialHTTPClient`:** it takes a `Runtime`, not a `TeeRuntime`. Reaching
it from inside the enclave would mean leaving the enclave first. `decisions.md` §1.

## 1:45 — The name (35s)

Open `/inv/inv-1042.acme.receivable.eth`.

> "The verification is an ENS name. No wallet, no login, no API of ours — these are text records
> on the resolver."

Then the point most people miss:

> "The resolver enforces *who may write each record*. The CRE consumer writes the verification.
> The Hedera adapter can write exactly three keys. Acme can write its own description and nothing
> else. Acme cannot mint a name for an invoice that was never verified — not because we check, but
> because the chain won't let them."

## 2:20 — Double financing (35s)

Open HashScan on the HCS topic and show the new entry.

> "A canonical fingerprint of the invoice, on a public topic. Any lender who computes the same
> hash sees this invoice is already financed. That's the fraud this industry actually loses money
> to, and it's the one problem a shared ledger genuinely solves better than a private database."

Then, if you have a rehearsed second run:

> "Watch what happens if I try to finance it again."

The adapter logs `REJECTED … double financing refused`.

## 2:55 — Investor side (50s)

Switch to the investor profile, `/market` → the listing.

> "Twelve thousand five hundred one-dollar units, ninety-six point eight cents each. Buy a
> thousand, pay $968, redeem $1,000 when the debtor pays. The discount is the return, and it's
> the same number the enclave signed — the market can't reprice itself."

Buy. Then show the SMB's balance.

> "Acme was paid in that same transaction. Not at maturity — now. The market never holds the
> money; that's the whole product."

## 3:45 — Close (15s)

> "Verified in a TEE without exposing the invoice. Named and permissioned on ENS. Registered
> against double financing on Hedera. Sold as a real security token. An investor can check every
> link without trusting us."

---

## If something breaks

| Symptom | Do this |
|---|---|
| CRE simulation slow or stalled | Keep talking over it; have a **recorded terminal capture** ready and cut to it. Do not wait in silence. |
| Invoice already financed | Correct behaviour — pivot and demo it as the double-financing guard. Have a spare unused invoice id ready. |
| ATS factory reverts | Config ids rotate. Use `ATS_BOND_OVERRIDE` with a bond deployed beforehand. |
| Hedera RPC flaky | Show HashScan instead; the adapter resumes on its own. |
| Buy fails | Almost always token association. Pre-associate every demo account and check `pnpm preflight`. |
| ENS records not showing | Sepolia lag. Refresh; the adapter's writeback is the last stage and takes three transactions. |
| Everything is down | Fall back to `/inv/<name>` for an invoice financed during rehearsal — it reads from chain and needs none of your services running. |

**The single best insurance:** record a clean full run the day before. If live fails, you show the
recording and keep the narrative intact.

---

## Questions worth pre-loading

**"What stops a business inventing an invoice?"** Nothing in this system — the accounting provider
is the source of truth, and in production that's an OAuth connection to real Xero or QuickBooks.
What the system does guarantee is that the figures were read from that provider inside an enclave
and signed by a DON, and that the same invoice can't be sold twice.

**"Why is the adapter trusted?"** It isn't, much. Its Sepolia key holds `ROLE_SET_TEXT` for three
keys on names that already exist. It cannot mint a name or alter a verification.

**"What if the enclave is compromised?"** Then the risk score is untrustworthy. The face value and
due date are still checkable against the invoice by anyone holding it, and the DON attestation is
what a consumer verifies before accepting a report.

**"Is the discount fair?"** It's a rule, not a market: 2% floor plus 10bps per risk point below
100. A real deployment would want price discovery. Say so — it's a design choice, not an oversight.
