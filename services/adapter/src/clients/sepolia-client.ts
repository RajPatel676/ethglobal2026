import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbiItem,
  type Account,
  type Address,
  type Chain,
  type Log,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { permissionedResolverAbi, ENS_KEYS } from '@receivable/shared'
import type { Env } from '../env.js'

/** The one event the adapter reacts to. Must match VerificationConsumer.sol. */
export const invoiceVerifiedEvent = parseAbiItem(
  'event InvoiceVerified(string businessLabel, string invoiceLabel, bytes32 indexed invoiceHash, uint256 faceValueCents, uint64 dueDate, uint16 riskScore, uint16 discountBps)',
)

export type InvoiceVerifiedLog = Log<bigint, number, false, typeof invoiceVerifiedEvent>

/**
 * Sepolia side of the adapter: read InvoiceVerified logs, write the three ENS text records the
 * consumer delegated to us.
 *
 * The key here is deliberately NOT the deployer key. On-chain it holds only
 * `ROLE_SET_TEXT` for `ats-token`, `hcs-seq` and `status`, granted per-name by
 * `VerificationConsumer.authorizeTextRoles`. If this key leaks, the blast radius is three text
 * records — it cannot mint names or rewrite a verification.
 */
export class SepoliaClient {
  readonly account: Account
  // Explicit annotations: viem's inferred client types are not portable under pnpm's isolated
  // node_modules and trip TS2742.
  readonly publicClient: PublicClient<Transport, Chain>
  readonly walletClient: WalletClient<Transport, Chain, Account>

  constructor(
    private readonly env: Env,
    private readonly resolverAddress: Address,
  ) {
    this.account = privateKeyToAccount(env.ADAPTER_SEPOLIA_PRIVATE_KEY as `0x${string}`)
    const transport = http(env.SEPOLIA_RPC_URL)
    this.publicClient = createPublicClient({ chain: sepolia, transport })
    this.walletClient = createWalletClient({ account: this.account, chain: sepolia, transport })
  }

  get address(): Address {
    return this.account.address
  }

  async currentBlock(): Promise<bigint> {
    return this.publicClient.getBlockNumber()
  }

  /** InvoiceVerified logs in [fromBlock, toBlock]. */
  async getVerifiedLogs(consumer: Address, fromBlock: bigint, toBlock: bigint) {
    return this.publicClient.getLogs({
      address: consumer,
      event: invoiceVerifiedEvent,
      fromBlock,
      toBlock,
    })
  }

  /**
   * Write one text record on an invoice name.
   * @param node namehash of `inv-<id>.<biz>.receivable.eth`
   */
  async setText(node: `0x${string}`, key: string, value: string): Promise<`0x${string}`> {
    const allowed: string[] = [ENS_KEYS.invoice.atsToken, ENS_KEYS.invoice.hcsSeq, ENS_KEYS.invoice.status]
    if (!allowed.includes(key)) {
      // The chain would reject this anyway; failing here makes the reason obvious.
      throw new Error(
        `adapter may only write ${allowed.join(', ')} — refusing to attempt "${key}". ` +
          `Widening this means changing authorizeTextRoles in VerificationConsumer.`,
      )
    }
    const hash = await this.walletClient.writeContract({
      address: this.resolverAddress,
      abi: permissionedResolverAbi,
      functionName: 'setText',
      args: [node, key, value],
    })
    await this.publicClient.waitForTransactionReceipt({ hash })
    return hash
  }

  async readText(node: `0x${string}`, key: string): Promise<string> {
    return this.publicClient.readContract({
      address: this.resolverAddress,
      abi: permissionedResolverAbi,
      functionName: 'text',
      args: [node, key],
    })
  }
}
