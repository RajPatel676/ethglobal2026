# services/cre — Chainlink CRE confidential workflow

```
bun install
cp .env.example .env            # CRE_ETH_PRIVATE_KEY + ACCOUNTING_TOKEN
cre login
# fill verify-invoice/config.staging.json (consumerAddress, authorizedEVMAddress)
bun run simulate                # dry run
bun run simulate -- --broadcast # real Sepolia tx via MockKeystoneForwarder
```
Evidence logs land in `docs/evidence/`. See `handlers/verify-invoice.ts` for what stays inside the enclave.
