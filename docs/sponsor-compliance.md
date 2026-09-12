# Sponsor compliance

What each sponsor's technology is actually used for, and where to look. Every path below is real
code in this repo. Anything not yet run on a live network is marked ⏳ rather than claimed.

---

## Chainlink — CRE Confidential Workflow

**Used for the thing that makes the product possible, not as a price feed.** An invoice cannot be
financed without a DON-signed report, and the invoice itself is never exposed to do it.

| | |
|---|---|
| Workflow | `services/cre/verify-invoice/workflow.ts` |
| Confidential handler | `services/cre/verify-invoice/handlers/verify-invoice.ts` |
| Report encoding | `services/cre/verify-invoice/lib/encode.ts` |
| On-chain consumer | `contracts/sepolia/src/VerificationConsumer.sol` |
| Report decoder | `contracts/sepolia/src/libraries/ReportCodec.sol` |

**Confidential execution.** `cre.handlerInTee(..., [{ tee: 'nitro', regions: ['us-west-2'] }])`
runs the whole callback inside an AWS Nitro enclave. Inside it: the SMB's accounting OAuth token
(`rt.getSecret`), the full invoice, and the debtor's payment history. Crossing out: seven fields
and nothing else —

```
businessLabel · invoiceLabel · invoiceHash · faceValueCents · dueDate · riskScore · discountBps
```

`rt.usingTheDons()` is the explicit boundary; everything before it is enclave-side.

**Why the regular HTTP client and not `ConfidentialHTTPClient`** — a question a judge may well
ask — is answered in `docs/decisions.md` §1. Short version: `http-actions.sendRequest` has a
`TeeRuntime` overload and `confidential-http` does not, so the regular client *is* the in-enclave
path; reaching the confidential one would require leaving the TEE first.

**Determinism.** `asOf` comes from the trigger, never `Date.now()`. Scoring is integer-only
(`lib/scoring.ts`) so it cannot diverge across DON nodes.

**Consumer hardening.** `onReport` rejects any caller but the KeystoneForwarder, checks
`expectedWorkflowOwner`, and rejects a repeated `invoiceHash`.

- ✅ Workflow typechecks against `@chainlink/cre-sdk` 1.20.1
- ✅ Consumer: 10 Foundry tests
- ⏳ `cre workflow simulate` run — needs `cre login`
- ⏳ Live DON delivery — Confidential Workflows is invite-only private beta

---

## ENS — ENSv2 on Sepolia

**Used as the permission system, not as a vanity name.** The resolver decides who may write each
record, so the name *is* the access-control model.

| | |
|---|---|
| Name minting + record writes | `contracts/sepolia/src/VerificationConsumer.sol` |
| Role constants | `contracts/sepolia/src/libraries/ENSRoles.sol` |
| Deploy scripts | `contracts/sepolia/script/01…04` |
| Frontend resolution | `apps/web/src/lib/ens.ts` |

**Name tree.**

```
receivable.eth                       ETHRegistry, deployer-owned
└─ acme.receivable.eth               registered on first verification; SET_RESOLVER only
   └─ inv-1042.acme.receivable.eth   in the business's own UserRegistry proxy
```

**Per-record permissions, enforced on-chain** via `PermissionedResolver.authorizeTextRoles`:

| Writer | Keys |
|---|---|
| VerificationConsumer | `invoice-hash`, `face-value-cents`, `due-date`, `risk-score`, `discount-bps`, `status=verified` |
| Hedera adapter | `ats-token`, `hcs-seq`, `status` — exactly three |
| Business | `description`, `url` on its own name — nothing else |

Neither the business nor the adapter can mint an invoice name or forge a verification. Invoice and
business names are non-transferable: `businessOwnerRoles()` withholds `ROLE_CAN_TRANSFER_ADMIN`.

**Resolution is the product surface.** `/inv/<name>` reads text records off the resolver with no
wallet, no login and no backend of ours in the path — `lib/ens.ts` returns `null` when a name has
no records rather than falling back to a database, because there isn't one.

- ✅ All eight ENSv2 beta addresses filled and verified to hold live bytecode (2026-09-12)
- ✅ `receivable` confirmed available; 8.000021 MockUSDC/year, premium 0
- ✅ Deploy scripts compile; script 03 exercised end-to-end on a local EVM
- ⏳ `receivable.eth` registration — needs funded keys

---

## Hedera — HCS, HTS and Asset Tokenization Studio

**Three distinct Hedera services, each doing something the others cannot.**

| | |
|---|---|
| Primary market | `contracts/hedera/src/InvoicePrimaryMarket.sol` |
| ATS interface | `contracts/hedera/src/interfaces/IATSBond.sol` |
| HTS interface + helper | `contracts/hedera/src/interfaces/IHTSToken.sol` |
| HCS + native SDK | `services/adapter/src/clients/hedera-client.ts` |
| Registry reads | `services/adapter/src/clients/mirror-node.ts` |

**HCS — the cross-lender double-financing registry.** A canonical keccak fingerprint of
(businessLabel, number, amount, dueDate, debtorId) is appended to a public topic. Any lender
computing the same hash sees the invoice is taken. This is the part that is genuinely
better on a shared ledger than in a private database, and it is why the check
**fails closed** when the mirror node is unreachable.

**ATS — a real security token, handled as one.** ERC-1400/1410 partitioned bonds behind a diamond,
driven through `transferByPartition` / `issueByPartition` / `balanceOfByPartition` on
`_DEFAULT_PARTITION = bytes32(uint256(1))`. Interfaces were verified against
`hashgraph/asset-tokenization-studio`, not guessed.

**HTS — USDC settlement, with association handled.** The market associates itself in its
constructor. HTS signals failure with a *response code* rather than reverting, so `HTS.associate`
checks it — an unchecked call deploys a market that can never be settled.

- ✅ Market: 22 Foundry tests including a 256-run fuzz
- ✅ Adapter: 31 vitest tests
- ✅ Entity→EVM address mapping tested (`0.0.429274` → `0x…68cda`)
- ⏳ HCS topic creation — `pnpm hedera:setup`, needs a funded account
- ⏳ ATS bond deployment — hosted factory config ids rotate; see `decisions.md` §8

---

## Cross-cutting

**The privacy claim, stated precisely.** The invoice is never published — only its fingerprint.
The figures shown publicly are those a DON signed after reading the invoice inside an enclave. The
web app never transmits invoice detail anywhere: the dashboard's risk estimate is computed locally
from the same formula and labelled an estimate.

**One formula, three places, pinned by tests.** `riskScore`/`discountBps`/`unitPriceMicro` appear
in `packages/shared/src/utils/pricing.ts`, `services/cre/.../lib/scoring.ts` (duplicated because
the CRE CLI cannot resolve pnpm workspaces), and `InvoicePrimaryMarket.sol`. Solidity and
TypeScript tests both assert the same values, so a drift breaks a build rather than mispricing an
invoice.

## Verification you can run now

```bash
pnpm install && pnpm typecheck && pnpm lint    # 4/4 each
pnpm test                                       # adapter, 31 passing
pnpm forge:test                                 # 10 sepolia + 22 hedera
pnpm ens:check                                  # ENSv2 addresses
pnpm preflight                                  # what credentials are still missing
```
