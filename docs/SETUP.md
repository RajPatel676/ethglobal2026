# Credentials setup

Everything here needs a human: private keys, faucets, and one invite request. Work top to bottom
and run `pnpm preflight` after each section — it derives addresses from your keys (never printing
them), checks live balances on both chains, and tells you what is still missing.

```bash
cp .env.example .env    # already done if scripts/preflight.ts runs
pnpm preflight
```

**Start section 4 today.** Hedera USDC drips 20 per 2 hours and the demo needs ~150, so it is the
long pole — 3–4 days of collecting. Section 5 is an invite request with a human in the loop.

---

## 1. Three Sepolia keys

Generate them yourself; never paste a key into a chat or commit one. `.env` is gitignored.

```bash
cast wallet new    # run three times
```

| Variable | Role | Needs |
|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | owns `receivable.eth`, deploys all four scripts | ~0.05 ETH |
| `ADAPTER_SEPOLIA_PRIVATE_KEY` | Hedera adapter's write-back key — may only touch `ats-token` / `hcs-seq` / `status` | ~0.02 ETH |
| `TRIGGER_SIGNER_PRIVATE_KEY` | signs CRE HTTP trigger requests; its address goes in `authorizedEVMAddress` | no gas |

Keeping these three separate is the point: the adapter key is the one exposed to a long-running
service, and the on-chain role grants mean a leak of it cannot mint names or rewrite verification
records.

## 2. Sepolia ETH

Any Sepolia faucet. Fund the deployer and adapter addresses that `pnpm preflight` prints.

## 3. MockUSDC for the ENS registration

Free, unrestricted mint — no faucet queue. Registering `receivable.eth` for a year costs
**8.000021 USDC** (verified on-chain; premium is 0). Mint 20 for headroom:

```bash
source .env
cast send 0x768F42455A2D082E23ceeF7d51e5787C82d67a39 \
  "mint(address,uint256)" $(cast wallet address $DEPLOYER_PRIVATE_KEY) 20000000 \
  --rpc-url $SEPOLIA_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY
```

Confirmed available as of 2026-09-12: `isAvailable("receivable") == true`. Nobody has taken it yet.

## 4. Hedera testnet — start this first

1. Create a testnet account at <https://portal.hedera.com> → `HEDERA_ADAPTER_ACCOUNT_ID` +
   `HEDERA_ADAPTER_PRIVATE_KEY` (must be **ECDSA secp256k1**, not ED25519 — the adapter needs an
   EVM alias).
2. Same again for `HEDERA_ESCROW_ACCOUNT_ID` / `HEDERA_ESCROW_PRIVATE_KEY`.
3. HBAR faucet: 100/day per account.
4. USDC faucet <https://faucet.circle.com>: **20 USDC per 2 hours**. Target ~150 total across the
   adapter, escrow and two investor accounts.
5. Every account receiving USDC must associate token `0.0.429274` first —
   `scripts/setup-hedera.ts` does this, but that script does not exist yet (Step 4).

`pnpm preflight` reads balances straight from the mirror node and flags accounts that have not
associated USDC.

## 5. Chainlink Confidential Workflows access

`handlerInTee` is **invite-only private beta** — enrollment goes through a Chainlink account team.
Request it now; it gates deployment, not simulation.

Simulation needs only the CLI:

```bash
curl -L https://cre.chain.link/install.sh | bash   # or see docs.chain.link/cre
cre login
cd services/cre && bun install && bun run simulate
```

## 6. Remaining config

| Variable | Notes |
|---|---|
| `ENS_REGISTRATION_SECRET` | `openssl rand -hex 32`. Commit-reveal salt — anyone who learns it between your commit and reveal can take the name. Single use. |
| `MOCK_ACCOUNTING_TOKEN` | Any string. Stands in for the SMB's OAuth token; in the real product it only ever lives as a Vault DON secret. |
| `CRE_WORKFLOW_OWNER` | Set before the public demo, or `VerificationConsumer` accepts reports from **any** workflow owner. |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Step 5 only. |
| `ETHERSCAN_API_KEY` | Only for `forge script --verify`. |

---

## Then

```bash
pnpm preflight          # all green?
pnpm ens:check --step 1
```

and follow `contracts/sepolia/script/README.md`.

## Already done for you

The eight ENSv2 Sepolia beta addresses in `contracts/sepolia/deployments/sepolia.json` are filled
in and were each verified to hold live bytecode on 2026-09-12. The beta is rolling, so if calls
start reverting unexpectedly, re-check them against
<https://docs.ens.domains/learn/deployments>.

Useful constants confirmed on-chain that day:

| | |
|---|---|
| `MIN_COMMITMENT_AGE` | 60 s — the wait between `commit()` and `register()` |
| `MAX_COMMITMENT_AGE` | 86400 s — commitment expires after 24 h |
| registration cost | 8.000021 USDC / year, premium 0 |
| MockUSDC | 6 decimals, open `mint(address,uint256)` |
