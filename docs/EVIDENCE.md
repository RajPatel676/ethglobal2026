# Evidence

What has actually been verified, and what has not. Captures live in `docs/evidence/`.

Two states only:

- **✅ captured** — a log in this directory, reproducible by the command shown
- **⏳ not captured** — needs funded testnet credentials or beta access; **not** claimed anywhere
  else in these docs

Nothing below is asserted without a log behind it. If a reviewer finds a claim in
`sponsor-compliance.md` or the README that is not backed here, the claim is wrong, not the log.

---

## ✅ Captured

### Local verification — [`verification-20260912-104322Z.log`](evidence/verification-20260912-104322Z.log)

Whole workspace: typecheck, lint, all test suites, CRE workflow typecheck against the real SDK,
and the Next.js production build.

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm forge:test
(cd services/cre && bunx tsc --noEmit)
(cd apps/web && pnpm build)
```

| | |
|---|---|
| typecheck / lint | 4 packages each |
| `contracts/sepolia` | 10 Foundry tests |
| `contracts/hedera` | 22 Foundry tests, incl. a 256-run fuzz |
| `services/adapter` | 31 vitest tests |
| `services/cre` | typechecks against `@chainlink/cre-sdk` 1.20.1 |
| `apps/web` | production build, 10 routes |

Tests worth reading rather than counting:

- `test_roleBitmapsAreEACLegal` — fails against the pre-fix `ALL_ROLES`, which would have
  reverted every business registration on real ENSv2
- `test_constructor_revertsWhenHtsAssociationFails` — HTS reports failure with a response code,
  not a revert; an unchecked call yields a market that can never be settled
- `test_buy_revertsAtomicallyIfInvestorNotAssociated` — cash must not reach the SMB when units
  cannot reach the investor
- `fails closed when the mirror node is unreachable` — an outage must never read as "no prior
  financing"
- `resumes after a failure without re-running completed stages` — re-running `create-bond`
  would mint a second bond against one invoice

### ENSv2 Sepolia addresses — [`ens-sepolia-20260912-104418Z.log`](evidence/ens-sepolia-20260912-104418Z.log)

Every address in `contracts/sepolia/deployments/sepolia.json` read live from Sepolia: all eight
hold bytecode, and the registrar answers.

```bash
pnpm ens:check
cast call 0xa88553F454b77203B0D036A05c894d555EAAa2Cc 'isAvailable(string)(bool)' receivable \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com
```

| | |
|---|---|
| `isAvailable("receivable")` | `true` |
| Registration | 8.000021 MockUSDC / year, premium 0 |
| `MIN_COMMITMENT_AGE` | 60 s |
| `MAX_COMMITMENT_AGE` | 86 400 s |
| MockUSDC | 6 decimals, open `mint(address,uint256)` |

### Deploy script dry run

`03_DeployConsumer.s.sol` executed against a local EVM: derived
`rootNode = 0x936bc3e93d2f10ac24ce2b71f3bc37a94783ddbd953ca8ad5dc5a6ad7bf90e48` for
`receivable.eth`, matching an independent `cast keccak` computation, then deployed, called
`setEns`, and wrote the address back to the deployments file.

### Web app rendering

Booted against the mock accounting service; all seven pages return 200 and render live data.
`/dashboard` shows $44,500 outstanding across both AUTHORISED invoices and $12,500 financeable,
correctly excluding the past-due one. `/api/finance` returns a precise 503 with no signer key and
400 on a malformed label.

---

## ⏳ Not captured

Each needs credentials or access that does not exist yet. **No claim anywhere in this repo depends
on these.**

| What | Blocked on | Command |
|---|---|---|
| `cre workflow simulate` — enclave execution, DON report, Sepolia write | `cre login` | `pnpm cre:simulate` |
| Live DON delivery | Confidential Workflows is **invite-only private beta** | — |
| `receivable.eth` registration | funded Sepolia key + MockUSDC | `script/01_RegisterName.s.sol` |
| Registry, resolver, consumer deployed | above | `script/02`–`04` |
| HCS registry topic created | funded Hedera account | `pnpm hedera:setup` |
| ATS bond deployed | hosted factory config ids rotate — see `decisions.md` §8 | ATS UI, then `ATS_BOND_OVERRIDE` |
| A market deployed and an investor purchase | above + ~150 testnet USDC | `contracts/hedera/script/Deploy.s.sol` |
| End-to-end pipeline run | all of the above | `pnpm dev:adapter` |

Setup order and the faucet timings are in [`SETUP.md`](SETUP.md). `pnpm preflight` reports what
is still missing.

---

## Capturing the rest

Each log is timestamped, appended to this file under **✅ captured**, and moved out of the ⏳ table.

```bash
# CRE simulation — archives to docs/evidence/cre-simulation-<stamp>.log automatically
pnpm cre:simulate

# Sepolia deployment
forge script script/01_RegisterName.s.sol --sig "commit()" --rpc-url sepolia --broadcast \
  2>&1 | tee docs/evidence/sepolia-deploy-$(date -u +%Y%m%d-%H%M%SZ).log

# Hedera setup
pnpm hedera:setup 2>&1 | tee docs/evidence/hedera-setup-$(date -u +%Y%m%d-%H%M%SZ).log

# Pipeline run
pnpm dev:adapter 2>&1 | tee docs/evidence/pipeline-$(date -u +%Y%m%d-%H%M%SZ).log
```

For the CRE log, the lines a judge will look for are
`Trigger requested TEE Execution … AWS Nitro in us-west-2` and
`Write report transaction succeeded: 0x…`.

Record transaction hashes and entity ids here as they appear:

| | |
|---|---|
| `receivable.eth` registration tx | — |
| VerificationConsumer | — |
| First `InvoiceVerified` tx | — |
| HCS registry topic | — |
| First registry entry sequence | — |
| ATS bond | — |
| InvoicePrimaryMarket | — |
| First purchase tx | — |
