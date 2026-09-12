/**
 * One-time Hedera testnet setup.
 *
 *   pnpm hedera:setup            # do it
 *   pnpm hedera:setup --dry-run  # show what would happen, touch nothing
 *
 * Creates the HCS registry topic, associates USDC with the adapter and escrow accounts, and
 * writes the results into contracts/hedera/deployments/hedera-testnet.json.
 *
 * Idempotent: an existing topic id in the deployments file is reused rather than replaced, and
 * an already-associated account is left alone. Re-running is safe and is the intended way to
 * finish setup after topping up a faucet.
 *
 * Accounts themselves are NOT created here — portal.hedera.com issues them with a starting HBAR
 * balance, and they must be ECDSA secp256k1 so they have an EVM alias.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import {
  AccountId,
  Client,
  PrivateKey,
  Status,
  TokenAssociateTransaction,
  TokenId,
  TopicCreateTransaction,
} from '@hashgraph/sdk'

const DEPLOYMENTS = 'contracts/hedera/deployments/hedera-testnet.json'
const USDC_TOKEN_ID = '0.0.429274'
const MIRROR = process.env.HEDERA_MIRROR ?? 'https://testnet.mirrornode.hedera.com/api/v1'
const DRY = process.argv.includes('--dry-run')

type Deployments = Record<string, unknown> & {
  adapterAccountId?: string
  adapterEvmAddress?: string
  escrowAccountId?: string
  hcsRegistryTopicId?: string
  usdcTokenId?: string
  usdcEvmAddress?: string
}

const need = (k: string): string => {
  const v = process.env[k]
  if (!v || v === '0x' || v === '0.0.') {
    throw new Error(`${k} is not set. See docs/SETUP.md section 4.`)
  }
  return v
}

/** Hedera maps entity 0.0.N to the EVM address whose low bytes hold N. */
const entityToEvm = (id: string) =>
  `0x${BigInt(id.split('.').at(-1)!).toString(16).padStart(40, '0')}`

async function isAssociated(accountId: string, tokenId: string): Promise<boolean> {
  const res = await fetch(`${MIRROR}/accounts/${accountId}`)
  if (!res.ok) throw new Error(`mirror node ${accountId} -> ${res.status}`)
  const j = (await res.json()) as { balance?: { tokens?: { token_id: string }[] } }
  return (j.balance?.tokens ?? []).some((t) => t.token_id === tokenId)
}

async function associate(client: Client, accountId: string, key: PrivateKey): Promise<string> {
  if (await isAssociated(accountId, USDC_TOKEN_ID)) return 'already associated'
  if (DRY) return 'would associate'
  const tx = await new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(accountId))
    .setTokenIds([TokenId.fromString(USDC_TOKEN_ID)])
    .freezeWith(client)
    .sign(key)
  const receipt = await (await tx.execute(client)).getReceipt(client)
  if (receipt.status !== Status.Success) throw new Error(`association failed: ${receipt.status}`)
  return 'associated'
}

async function main() {
  const adapterId = need('HEDERA_ADAPTER_ACCOUNT_ID')
  const adapterKey = PrivateKey.fromStringECDSA(need('HEDERA_ADAPTER_PRIVATE_KEY'))
  const escrowId = process.env.HEDERA_ESCROW_ACCOUNT_ID
  const escrowKeyRaw = process.env.HEDERA_ESCROW_PRIVATE_KEY

  const client = Client.forTestnet().setOperator(AccountId.fromString(adapterId), adapterKey)
  const deployments = JSON.parse(readFileSync(DEPLOYMENTS, 'utf8')) as Deployments

  console.log(DRY ? '── DRY RUN — nothing will be sent ──\n' : '── Hedera testnet setup ──\n')

  // 1. HBAR check. Every step below costs HBAR; failing here is clearer than a cryptic
  //    INSUFFICIENT_PAYER_BALANCE three transactions in.
  const bal = await fetch(`${MIRROR}/accounts/${adapterId}`).then(
    (r) => r.json() as Promise<{ balance?: { balance?: number } }>,
  )
  const hbar = (bal.balance?.balance ?? 0) / 1e8
  console.log(`adapter ${adapterId}  ${hbar.toFixed(2)} HBAR`)
  if (hbar < 5) {
    throw new Error(`adapter has ${hbar} HBAR — top up at https://portal.hedera.com/faucet`)
  }

  // 2. HCS registry topic — the cross-lender double-financing record.
  let topicId = deployments.hcsRegistryTopicId || process.env.HCS_REGISTRY_TOPIC_ID || ''
  if (topicId && topicId !== '0.0.') {
    console.log(`hcs topic     ${topicId} (existing — not recreating)`)
  } else if (DRY) {
    console.log('hcs topic     would create')
    topicId = '0.0.PENDING'
  } else {
    const receipt = await (
      await new TopicCreateTransaction()
        .setTopicMemo('receivable.eth invoice financing registry v1')
        .setAdminKey(adapterKey.publicKey)
        .setSubmitKey(adapterKey.publicKey)
        .execute(client)
    ).getReceipt(client)
    topicId = receipt.topicId!.toString()
    console.log(`hcs topic     ${topicId} (created)`)
  }

  // 3. USDC association — an unassociated account cannot receive HTS tokens at all.
  console.log(`usdc adapter  ${await associate(client, adapterId, adapterKey)}`)
  if (escrowId && escrowKeyRaw) {
    console.log(
      `usdc escrow   ${await associate(client, escrowId, PrivateKey.fromStringECDSA(escrowKeyRaw))}`,
    )
  } else {
    console.log('usdc escrow   skipped (HEDERA_ESCROW_* not set)')
  }

  // 4. Persist.
  const next: Deployments = {
    ...deployments,
    adapterAccountId: adapterId,
    adapterEvmAddress: entityToEvm(adapterId),
    escrowAccountId: escrowId ?? deployments.escrowAccountId ?? '',
    hcsRegistryTopicId: topicId,
    usdcTokenId: USDC_TOKEN_ID,
    usdcEvmAddress: entityToEvm(USDC_TOKEN_ID),
  }

  if (DRY) {
    console.log(`\nwould write ${DEPLOYMENTS}:\n${JSON.stringify(next, null, 2)}`)
  } else {
    writeFileSync(DEPLOYMENTS, `${JSON.stringify(next, null, 2)}\n`)
    console.log(`\nwrote ${DEPLOYMENTS}`)
    console.log(`\nAdd to .env:\n  HCS_REGISTRY_TOPIC_ID=${topicId}`)
  }

  client.close()
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
