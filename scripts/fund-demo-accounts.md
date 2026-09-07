# Funding checklist (start on day 1 — faucets are rate-limited)

| What | Where | Limit |
|---|---|---|
| Sepolia ETH (deployer, adapter, trigger signer) | any Sepolia faucet | varies |
| Sepolia MockUSDC for `receivable.eth` registration | `mint(address,uint256)` on the ENS MockUSDC — free | none |
| Hedera testnet HBAR (adapter, escrow, 2 investors) | https://portal.hedera.com/faucet | 100 HBAR / day |
| Hedera testnet USDC `0.0.429274` | https://faucet.circle.com | 20 USDC / 2 h |

Every Hedera account receiving USDC must be associated first (`scripts/setup-hedera.ts` does this).
Demo needs ≈ 150 USDC total: SMB payout for a $125 invoice + investor purchases. Collect over 3–4 days.
