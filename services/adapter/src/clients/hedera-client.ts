import {
  Client,
  PrivateKey,
  AccountId,
  TopicMessageSubmitTransaction,
  TokenAssociateTransaction,
  TopicId,
  TokenId,
  Status,
} from '@hashgraph/sdk'
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type Account,
  type Address,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { HEDERA_TESTNET } from '@receivable/shared'
import type { Env } from '../env.js'
import type { RegistryEntry } from '../types.js'

/** Hedera testnet as a viem chain. The JSON-RPC relay is EVM-compatible; native services are not. */
export const hederaTestnet = defineChain({
  id: HEDERA_TESTNET.chainId,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: [HEDERA_TESTNET.jsonRpc] } },
  blockExplorers: { default: { name: 'HashScan', url: HEDERA_TESTNET.hashscan } },
  testnet: true,
})

/**
 * Hedera has two distinct APIs and this class owns both:
 *
 *   - the **native SDK** (gRPC to consensus nodes) for HCS topics and HTS association —
 *     things the EVM cannot express;
 *   - the **JSON-RPC relay** via viem for EVM contract calls (ATS diamond, InvoicePrimaryMarket).
 *
 * They use the same key but different identity formats: `0.0.x` for native, a 20-byte EVM
 * address for the relay. Mixing them up is the most common Hedera integration bug.
 */
export class HederaClient {
  readonly native: Client
  readonly accountId: AccountId
  // Explicit annotations: see SepoliaClient — viem inference is not portable under pnpm.
  readonly publicClient: PublicClient<Transport, Chain>
  readonly walletClient: WalletClient<Transport, Chain, Account>
  readonly evmAccount: Account

  constructor(private readonly env: Env) {
    this.accountId = AccountId.fromString(env.HEDERA_ADAPTER_ACCOUNT_ID)
    // ECDSA secp256k1, not ED25519 — an ED25519 account has no EVM alias and cannot sign
    // JSON-RPC transactions, so half of this class would silently be unusable.
    const key = PrivateKey.fromStringECDSA(env.HEDERA_ADAPTER_PRIVATE_KEY)
    this.native = Client.forTestnet().setOperator(this.accountId, key)

    this.evmAccount = privateKeyToAccount(env.HEDERA_ADAPTER_PRIVATE_KEY as `0x${string}`)
    const transport = http(env.HEDERA_JSON_RPC)
    this.publicClient = createPublicClient({ chain: hederaTestnet, transport })
    this.walletClient = createWalletClient({
      account: this.evmAccount,
      chain: hederaTestnet,
      transport,
    })
  }

  get evmAddress(): Address {
    return this.evmAccount.address
  }

  close(): void {
    this.native.close()
  }

  /**
   * Append a registry entry to the HCS topic.
   * @returns the consensus sequence number, which becomes the ENS `hcs-seq` record.
   */
  async submitRegistryEntry(entry: RegistryEntry): Promise<string> {
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(this.env.HCS_REGISTRY_TOPIC_ID))
      .setMessage(JSON.stringify(entry))
      .execute(this.native)

    const receipt = await tx.getReceipt(this.native)
    if (receipt.status !== Status.Success) {
      throw new Error(`HCS submit failed: ${receipt.status.toString()}`)
    }
    if (receipt.topicSequenceNumber === null) {
      throw new Error('HCS submit returned no sequence number')
    }
    return receipt.topicSequenceNumber.toString()
  }

  /**
   * Associate an HTS token with an account. Idempotent: an already-associated account is not
   * an error worth propagating.
   */
  async associateToken(tokenId: string, accountId?: string): Promise<'associated' | 'already'> {
    const target = accountId ? AccountId.fromString(accountId) : this.accountId
    try {
      const tx = await new TokenAssociateTransaction()
        .setAccountId(target)
        .setTokenIds([TokenId.fromString(tokenId)])
        .execute(this.native)
      const receipt = await tx.getReceipt(this.native)
      if (receipt.status !== Status.Success) {
        throw new Error(`association failed: ${receipt.status.toString()}`)
      }
      return 'associated'
    } catch (e) {
      if (String(e).includes('TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT')) return 'already'
      throw e
    }
  }

  /** Hedera maps entity 0.0.N to the EVM address with N in its low bytes. */
  static entityToEvmAddress(entityId: string): Address {
    const num = BigInt(entityId.split('.').at(-1) ?? '0')
    return `0x${num.toString(16).padStart(40, '0')}` as Address
  }
}
