# scripts/
- `export-abis.ts` — forge `out/` → `packages/shared/src/abi`. Run after every `forge build`.
- `setup-hedera.ts` — creates adapter/escrow/investor accounts, associates USDC, creates the HCS registry topic, writes `contracts/hedera/deployments/hedera-testnet.json`. (added in Step 4)
- `demo-reset.ts` — clears the adapter's local index.
- `fund-demo-accounts.md` — faucet checklist.
