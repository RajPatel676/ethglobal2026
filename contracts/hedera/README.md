# contracts/hedera — Hedera EVM (chain 296)

`InvoicePrimaryMarket` — one market per verified invoice. Investors buy discounted units of the
invoice's ATS bond with HTS USDC; the SMB is paid immediately.

```
src/InvoicePrimaryMarket.sol
src/interfaces/IATSBond.sol      ERC-1410 partitioned security (ATS diamond)
src/interfaces/IHTSToken.sol     HTS system contract at 0x167 + HTS.associate helper
script/Deploy.s.sol              one market, from env + deployments/hedera-testnet.json
verify.sh                        Sourcify (HashScan reads verification from there)
```

```bash
forge test                       # 22 tests, no accounts needed
forge script script/Deploy.s.sol --rpc-url hedera_testnet --broadcast --legacy \
  --private-key $HEDERA_ADAPTER_PRIVATE_KEY
bash verify.sh 0xDeployedAddress
```

## Economics

`units` are whole dollars of **face** value. An investor pays below par and redeems at par once
the debtor settles; the discount is the return.

```
unitPriceMicro = 1e6 * (10_000 - discountBps) / 10_000
```

Identical to `packages/shared/src/utils/pricing.ts`, and `test_unitPriceMatchesSharedFormula`
pins it. `discountBps` is **not** chosen here — it is fixed by the DON-signed CRE report that
minted the invoice's ENS name, and the adapter passes it through. The market cannot reprice
itself.

At 3.2% on a $12,500 invoice: units cost 968,000 micro-USDC each, redeem at 1,000,000, and the
investor's return is exactly `units × discountBps × 100`.

## Lifecycle

| Status | |
|---|---|
| `Open` | investors `buy` until sold out or `fundingDeadline` |
| `Settled` | payer deposits face value via `settle`; investors `redeem` at par |
| `Cancelled` | deadline passed unsold; operator funds a pool, investors `refund` at cost |

## Two Hedera details that bite

**HTS association.** An account or contract that has not associated an HTS token cannot receive
it — the transfer reverts. The market associates itself with USDC in its constructor. HTS reports
failure with a *response code* rather than reverting, so `HTS.associate` checks the code;
an unchecked call looks like success and leaves a market that can never be settled.
`test_constructor_revertsWhenHtsAssociationFails` covers this. `TOKEN_ALREADY_ASSOCIATED` (194)
is treated as success so redeploys stay idempotent.

**ATS bonds are not ERC-20s.** They are ERC-1400/1410 partitioned securities behind a diamond
proxy. Units move with `transferByPartition` and balances read with `balanceOfByPartition`, both
on `_DEFAULT_PARTITION = bytes32(uint256(1))` — *not* zero. A bare ERC-20 `transfer` reverts in
multi-partition mode.

Investors must also associate the bond token. If they haven't, the ATS transfer reverts and the
whole `buy` rolls back — cash never reaches the SMB without units reaching the investor
(`test_buy_revertsAtomicallyIfInvestorNotAssociated`).

## Design notes

- **Primary-sale cash is never custodied.** `buy` moves USDC investor → SMB in one hop, because
  same-day liquidity is the product. The consequence: a cancelled market cannot refund from its
  own balance, so `cancel(refundPoolMicro)` makes the operator fund refunds explicitly rather
  than silently clawing back from the SMB.
- **`settle` requires full par coverage** for every unit sold. Allowing partial funding would let
  redemptions race, and the last investors out would get nothing.
- `evm_version = "shanghai"`, not `cancun`. Hedera has the Cancun opcodes minus blobs, but
  shanghai avoids TSTORE/MCOPY codegen surprises around HTS. Revisit once verified on testnet.

## Not built yet

`services/adapter` — the listener + pipeline that actually creates the ATS bond, writes the HCS
registry entry, deploys a market per invoice, and writes `ats-token` / `hcs-seq` / `status` back
to ENS. `scripts/setup-hedera.ts` (accounts, USDC association, HCS topic) is also still missing.
