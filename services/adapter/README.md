# services/adapter

Watches Sepolia for DON-verified invoices, mirrors each one to Hedera, and writes the results
back to ENS. This is the bridge between the two halves of the system.

```
InvoiceVerified (Sepolia)
   │
   ├─ 01 registry-check   HCS topic says nobody has financed this invoice
   ├─ 02 create-bond      ATS security token for the invoice
   ├─ 03 issue-units      one unit per whole dollar of face value
   ├─ 04 deploy-market    InvoicePrimaryMarket + hand it the units
   ├─ 05 hcs-record       append to the public registry -> sequence number
   └─ 06 ens-writeback    ats-token, hcs-seq, status=financed
```

```bash
pnpm --filter adapter test    # 31 tests, no accounts needed
pnpm --filter adapter dev     # needs a full .env — see docs/SETUP.md
curl localhost:4200/health
```

## Why it is built this way

**Every stage is persisted before the next begins.** Stage 3 mints a security token; replaying it
would inflate supply against a fixed invoice and silently dilute every holder. On a crash the
runner resumes at the first unfinished stage instead of the beginning. `StateStore` writes to a
temp file and renames it, so a crash mid-write leaves the previous good file rather than a
truncated one.

**Rejection and failure are different.** `RejectInvoice` is terminal — a business rule said no,
and retrying cannot change that. Anything else is assumed transient (RPC hiccup, gas spike) and
keeps its completed stages for the next attempt. Without that distinction a slow Hedera would mint
duplicate bonds on every retry.

**The registry check fails closed.** If the mirror node is unreachable, the invoice does not
proceed. Treating an outage as "no prior financing" would defeat the one guarantee this project
makes, so the error propagates and the invoice stays pending. There is a test for exactly this.

**The HCS record is written after the bond and market exist, not before.** HCS messages are
immutable — recording first would leave a permanent public claim that an invoice is financed when
the deployment actually failed.

**`status` is written last in the ENS writeback.** The frontend treats `status=financed` as
"everything else is readable"; writing it first would expose a window where the UI shows a
financed invoice with no token to buy.

**This key is not the deployer key.** On-chain it holds `ROLE_SET_TEXT` for exactly `ats-token`,
`hcs-seq` and `status`, granted per-name by `VerificationConsumer.authorizeTextRoles`. If it
leaks, the blast radius is three text records. `SepoliaClient.setText` refuses anything else
locally so a mistake reads as a clear error instead of `EACUnauthorizedAccountRoles`.

**Polling, not websockets.** Public Sepolia RPCs drop long-lived sockets, and a missed event means
an invoice is silently never financed. The cursor advances only after a whole batch is handled and
lives in its own file, so a pipeline failure never rewinds it.

## Hedera has two APIs and this service uses both

`HederaClient` owns the native SDK (gRPC — HCS topics, HTS association: things the EVM cannot
express) *and* the JSON-RPC relay via viem (the ATS diamond, InvoicePrimaryMarket). Same key, two
identity formats: `0.0.x` natively, a 20-byte EVM address over the relay. Confusing them is the
most common Hedera integration bug. The account must be **ECDSA secp256k1** — an ED25519 account
has no EVM alias and half this class silently cannot work.

## Known gap

`02-create-bond` does not deploy through the hosted ATS factory. That factory's calldata depends
on resolver config ids that rotate (see `packages/shared/src/constants/hedera.ts`), so rather than
ship an encoding that breaks on the next rotation, the stage takes `ATS_BOND_OVERRIDE` — deploy
the bond with the ATS UI or SDK and pass the address. Everything downstream is unaffected.

## Operator API

All but `/health` require `Authorization: Bearer $ADAPTER_API_KEY`.

| | |
|---|---|
| `GET /health` | signer addresses, tracked invoice count |
| `GET /invoices`, `GET /invoices/:hash` | pipeline state |
| `POST /kyc/onboard` | returns the exact `cast send` to run — `onboardBusiness` is `onlyOwner` and this key deliberately has no owner rights |
| `GET /maturity/due` | financed invoices past their due date |
| `POST /maturity/settle/:hash` | fund the market at par, flip ENS to `settled` |
