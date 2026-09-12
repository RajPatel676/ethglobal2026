# Decisions

Why the system is shaped the way it is. Each entry records a real choice with a real alternative,
and several record mistakes found while building — those are the useful ones.

---

## 1. The whole handler runs in the TEE, not just the HTTP call

**Decision.** `cre.handlerInTee` wraps the entire verification callback, and the confidential API
fetch is made with the *regular* `HTTPClient` passing the `TeeRuntime`.

**The alternative we rejected.** The CRE SDK also ships `ConfidentialHTTPClient`, and Chainlink's
docs carry a pointed warning:

> Confidential HTTP does not automatically protect credentials you load with `runtime.getSecret()`
> and then paste into headers or body as plaintext.

That reads like a direct condemnation of what this handler does. It is not, and the signatures
settle it:

```
http-actions        sendRequest(runtime: NodeRuntime<unknown> | TeeRuntime<unknown>, …)
confidential-http   sendRequest(runtime: Runtime<unknown>, …)      ← no TeeRuntime overload
```

Passing a `TeeRuntime` to the regular client is exactly what makes the fetch an *in-enclave
capability call*. Reaching `ConfidentialHTTPClient` from inside `handlerInTee` would require
`rt.usingTheDons()` first — documented as routing the call **out** of the TEE. Confidential HTTP
is the answer for workflows that are *not* running in a TEE; inside a confidential handler it is
strictly weaker. Same for `rt.getSecret()`: on a `TeeRuntime` it is decrypted in-enclave.

**Also settled here:** an HTTP trigger composes with `handlerInTee`. `handlerInTee` is generic over
`Trigger<TRaw, TOut>` and the workflow typechecks against SDK 1.20.1, so the request-driven design
stands and the planned cron-poll fallback is unnecessary.

**Consequence.** Confidential Workflows is invite-only private beta, so deployment needs
enrollment. Simulation does not.

---

## 2. EAC role bitmaps are nybble-packed — two bugs came from assuming otherwise

**Found while building.** Both would have failed only against real ENSv2; the mock test suite
passed over both.

**`ALL_ROLES = type(uint256).max` reverts every business registration.** EnhancedAccessControl
validates `roleBitmap & ~ALL_ROLES == 0`, where the real `ALL_ROLES` is `0x1111…1111` — bit 0 of
each nybble, not all ones. That constant is passed to `UserRegistry.initialize` in
`_deployBusinessRegistry`, which runs on **the first invoice for every business**. `MockFactory`
ignores the init payload, so nothing caught it.

**`ROLE_RENEW = 1 << 4` was the wrong role.** Real value is `1 << 16`; bit 4 is
`ROLE_REGISTER_RESERVED` — "root-only". Dormant today, but anything reaching for "let them renew"
would have granted reserved-name registration.

**Consequence.** `test_roleBitmapsAreEACLegal` and `test_roleConstantsMatchNamechain` now guard
both, and the constants are documented as nybble-indexed. **Verify role constants against
`RegistryRolesLib` rather than inferring them from names.**

---

## 3. The adapter's key is not the deployer's key

**Decision.** A separate Sepolia key holding `ROLE_SET_TEXT` for exactly `ats-token`, `hcs-seq`
and `status`, granted per-name by `VerificationConsumer.authorizeTextRoles`.

**Why.** The adapter is a long-running service holding hot keys on two chains — the most likely
thing in this system to be compromised. Scoping it on-chain means a leak costs three text records:
it cannot mint names, rewrite a verification, or touch another business. `SepoliaClient.setText`
also refuses other keys locally, so a mistake reads as a clear error rather than
`EACUnauthorizedAccountRoles`.

**Cost.** `onboardBusiness` is `onlyOwner`, so the adapter cannot complete KYC onboarding. The API
returns the exact `cast send` for a human to run with the deployer key. Deliberate.

---

## 4. Every pipeline stage is persisted before the next begins

**Decision.** Six stages, each recorded in a crash-safe JSON store with its outputs; the runner
resumes at the first unfinished stage.

**Why.** Stage 3 mints a security token. Replaying it inflates supply against a fixed invoice and
silently dilutes every holder — the same class of harm as the double financing this project exists
to prevent. A pipeline restarting from stage 1 on every error would mint duplicate bonds each time
Hedera was slow.

**Corollary.** `RejectInvoice` (a business rule said no) is terminal; anything else is assumed
transient and keeps completed stages. Writes go to a temp file and are renamed, so a crash
mid-write leaves the previous good file rather than a truncated one.

---

## 5. The double-financing check fails closed

**Decision.** If the Hedera mirror node is unreachable, `registry-check` throws and the invoice
stays pending. It is never treated as "no prior financing".

**Why.** Failing open would defeat the single guarantee the project makes, and it would fail open
exactly when the network is degraded — when a duplicate is most likely to slip through. There is a
test asserting the error propagates rather than passing.

**Also:** the HCS record is written *after* the bond and market exist. HCS messages are immutable,
so recording first would leave a permanent public claim that a failed deployment succeeded.

---

## 6. Primary-sale cash is never custodied

**Decision.** `buy` moves USDC investor → SMB in one hop. `InvoicePrimaryMarket` holds nothing
during the sale.

**Why.** Same-day liquidity *is* the product. Escrowing until sold out would reintroduce the delay
the SMB came here to avoid, and make the contract a custodian.

**Cost, and it is real.** A cancelled market has nothing to refund from, so
`cancel(refundPoolMicro)` makes the operator fund refunds explicitly rather than silently clawing
back from the SMB. **This is a policy gap worth revisiting** — in a real product the SMB owes that
money back, and nothing here enforces it.

`settle` also requires full par coverage for every unit sold; partial funding would let
redemptions race and starve whoever claims last.

---

## 7. Hedera specifics that are not optional

**HTS returns a response code instead of reverting.** A failed `associateToken` looks exactly like
success to an unchecked call — you would deploy a market that can never receive settlement and
find out at maturity. `HTS.associate` checks the code and tolerates
`TOKEN_ALREADY_ASSOCIATED` (194) for idempotency. Every HTS call needs this treatment.

**ATS bonds are ERC-1400/1410, not ERC-20.** Units move via
`transferByPartition(bytes32, BasicTransferInfo, bytes)` on `_DEFAULT_PARTITION =
bytes32(uint256(1))` — **not zero**, which is the obvious wrong guess. A bare `transfer` reverts in
multi-partition mode.

**`evm_version = "shanghai"`, not `cancun`.** Hedera has the Cancun opcodes minus blobs, but
shanghai avoids TSTORE/MCOPY codegen surprises around HTS. Revisit once verified on testnet.

**Accounts must be ECDSA secp256k1.** An ED25519 account has no EVM alias, so half of
`HederaClient` — everything over the JSON-RPC relay — silently cannot work.

---

## 8. ATS bond creation is not wired to the hosted factory

**Decision.** `02-create-bond` takes `ATS_BOND_OVERRIDE`, a pre-deployed bond address, instead of
encoding a factory deployment.

**Why.** The hosted factory's calldata depends on resolver config ids that rotate — the repo's own
`hedera.ts` flags this. Shipping an encoding that breaks on the next rotation means discovering it
at demo time. Deploying the bond through the ATS UI and passing the address leaves everything
downstream unaffected.

**Honest status:** this is the one stage not exercised by tests. Treat a revert here as "the config
rotated", not "the code is wrong".

---

## 9. No Privy in the web app

**Decision.** wagmi v2 with no connector declared; injected wallets are discovered over EIP-6963.

**Why.** Privy needs an app id issued per project, so depending on it means the app cannot start
without a third-party signup. Separately, importing the `wagmi/connectors` barrel **breaks
`next build` outright** — it pulls in the Coinbase/Base SDK whose optional `@x402/*` dependencies
are unresolvable. EIP-6963 discovery covers the same wallets with neither problem.

**Reversible.** Adding Privy touches `lib/wagmi.ts` and `components/layout/providers.tsx`.

---

## 10. The UI degrades honestly before deployment

**Decision.** Every chain-dependent view has an explicit unconfigured state naming the step that
produces the missing address. `/market` also shows what *would* be listed, labelled a preview.

**Why.** The app was built and reviewed for days before any contract existed. An empty list reads
as a bug; a named missing step reads as a state. It also keeps the demo recoverable — if a
deployment fails on the day, the app still explains itself.

---

## 11. Deploy scripts read one JSON file and refuse to guess

**Decision.** `deployments/sepolia.json` is the single source of truth. `Base.s.sol::_need` aborts
with the missing key and where to find it; `pnpm ens:check` reports the same per step.

**Why.** The ENSv2 Sepolia beta is rolling and its addresses were only ever published in truncated
form in our notes. Half-filled config otherwise surfaces as a revert deep inside a forge script
with no indication which address was wrong.

**Status:** all eight addresses are filled and were each verified to hold live bytecode on
2026-09-12. `receivable` was available; registration costs 8.000021 MockUSDC per year.
