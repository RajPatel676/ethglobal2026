# contracts/sepolia/script — Step 3b

Deploy order. Every script reads and writes `deployments/sepolia.json`; run `pnpm ens:check`
first, and again between steps.

| # | Script | Produces |
|---|---|---|
| 0 | `pnpm ens:check` | tells you which addresses are still blank |
| 1 | `01_RegisterName.s.sol` | `receivable.eth`, owned by the deployer |
| 2 | `02_DeployRegistryAndResolver.s.sol` | `receivable.rootSubregistry`, `receivable.resolver` |
| 3 | `03_DeployConsumer.s.sol` | `receivable.verificationConsumer` |
| 4 | `04_GrantRoles.s.sol` | roles + `receivable.eth` → our registry/resolver |

```bash
export $(grep -v '^#' ../../.env | xargs)   # from repo root .env

pnpm ens:check --step 1

# 1. commit/reveal — TWO txs, separated by MIN_COMMITMENT_AGE (the script prints it).
#    Same ENS_REGISTRATION_SECRET for both, or the reveal reverts.
forge script script/01_RegisterName.s.sol --sig "commit()"   --rpc-url sepolia --broadcast
sleep 60
forge script script/01_RegisterName.s.sol --sig "register()" --rpc-url sepolia --broadcast

# 2. two VerifiableFactory proxies. Deterministic per (deployer, salt) — re-running reverts.
forge script script/02_DeployRegistryAndResolver.s.sol --rpc-url sepolia --broadcast

# 3. the CRE consumer
forge script script/03_DeployConsumer.s.sol --rpc-url sepolia --broadcast --verify

# 4. grants + hang the subregistry off receivable.eth
forge script script/04_GrantRoles.s.sol --rpc-url sepolia --broadcast

pnpm abis   # regenerate packages/shared/src/abi from out/
```

## Notes

- **MockUSDC.** `01_RegisterName` pays the registration fee in MockUSDC and approves the registrar
  first (the registrar pulls with `safeTransferFrom`). Mint yourself some — it's free:
  `cast send <mockUsdc> "mint(address,uint256)" <you> <amount> --rpc-url sepolia`
- **The name is registered bare.** `subregistry` and `resolver` are set to `address(0)` in step 1,
  because the contracts they point at don't exist until step 2. Step 4 points them.
- **Roles granted in step 4** — and only these:
  | Contract | Role | Why |
  |---|---|---|
  | rootSubregistry | `ROLE_REGISTRAR` | mint `<biz>.receivable.eth` |
  | resolver | `ROLE_SET_TEXT` (+`_ADMIN`) | write invoice records; `_ADMIN` is required to call `authorizeTextRoles` and delegate keys to the Hedera adapter |
  | resolver | `ROLE_SET_ADDR` (+`_ADMIN`) | write the business's Hedera EVM alias (ENSIP-11) |

  Not granted: `ROLE_UNREGISTER`, `ROLE_RENEW`, `ROLE_SET_SUBREGISTRY`, `ROLE_SET_ALIAS`,
  `ROLE_UPGRADE`. The consumer creates and annotates names; it cannot delete, re-point or upgrade.
- **EAC role bitmaps are nybble-packed.** Role N sits at bit `4*N`, and any bit outside
  `0x1111…1111` makes `EnhancedAccessControl` revert `EACInvalidRoleBitmap`. `ENSRoles.ALL_ROLES`
  is that mask, *not* `type(uint256).max`. `test_roleBitmapsAreEACLegal` guards this.
- **After step 4**, still manual:
  - `onboardBusiness(label, wallet, hederaEvmAlias)` per demo SMB (owner-only)
  - `setHederaAdapter(...)` once Step 4 produces an adapter address
  - `consumerAddress` in `services/cre/verify-invoice/config.staging.json`
  - `setForwarder(...)` to the real KeystoneForwarder for a live DON run
