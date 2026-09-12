import { encodeFunctionData, type Address, type Hex } from 'viem'
import { HEDERA_TESTNET } from '@receivable/shared'
import type { HederaClient } from './hedera-client.js'

/** ATS `_DEFAULT_PARTITION` — bytes32(uint256(1)), not zero. */
export const DEFAULT_PARTITION: Hex = `0x${'0'.repeat(63)}1`

/**
 * Minimal ABI for the ATS bond diamond. ATS bonds are ERC-1400/1410 partitioned securities;
 * balances and transfers go through the *ByPartition calls, never plain ERC-20.
 * Mirrors contracts/hedera/src/interfaces/IATSBond.sol.
 */
export const atsBondAbi = [
  {
    type: 'function',
    name: 'issueByPartition',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'issueData',
        type: 'tuple',
        components: [
          { name: 'partition', type: 'bytes32' },
          { name: 'tokenHolder', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transferByPartition',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'partition', type: 'bytes32' },
      {
        name: 'basicTransferInfo',
        type: 'tuple',
        components: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
        ],
      },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'balanceOfByPartition',
    stateMutability: 'view',
    inputs: [
      { name: 'partition', type: 'bytes32' },
      { name: 'tokenHolder', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalSupplyByPartition',
    stateMutability: 'view',
    inputs: [{ name: 'partition', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export type BondTerms = {
  isin: string
  name: string
  symbol: string
  /** Whole-dollar units of face value. */
  totalUnits: bigint
  /** Unix seconds. */
  maturityDate: bigint
}

/**
 * Creates and drives ATS security tokens on Hedera.
 *
 * ⚠️ `createBond` is the one place in this service that is NOT exercised by tests, because the
 * ATS factory's `deployBond` calldata shape depends on the hosted deployment's resolver config
 * (`atsBondConfigId` / `atsBondConfigVersion` in shared/constants/hedera.ts) and those rotate.
 * Verify the encoding against the live factory on testnet before the demo, and treat a revert
 * here as "the config rotated", not "the code is wrong".
 */
export class AtsClient {
  constructor(private readonly hedera: HederaClient) {}

  get factoryAddress(): Address {
    return `0x${BigInt(HEDERA_TESTNET.atsFactory.split('.').at(-1)!).toString(16).padStart(40, '0')}`
  }

  get resolverAddress(): Address {
    return `0x${BigInt(HEDERA_TESTNET.atsResolver.split('.').at(-1)!).toString(16).padStart(40, '0')}`
  }

  /** Mint `units` of the bond into `holder`'s default partition. Requires the issuer role. */
  async issueUnits(bond: Address, holder: Address, units: bigint): Promise<Hex> {
    const hash = await this.hedera.walletClient.writeContract({
      address: bond,
      abi: atsBondAbi,
      functionName: 'issueByPartition',
      args: [{ partition: DEFAULT_PARTITION, tokenHolder: holder, value: units, data: '0x' }],
    })
    await this.hedera.publicClient.waitForTransactionReceipt({ hash })
    return hash
  }

  async transferUnits(bond: Address, to: Address, units: bigint): Promise<Hex> {
    const hash = await this.hedera.walletClient.writeContract({
      address: bond,
      abi: atsBondAbi,
      functionName: 'transferByPartition',
      args: [DEFAULT_PARTITION, { to, value: units }, '0x'],
    })
    await this.hedera.publicClient.waitForTransactionReceipt({ hash })
    return hash
  }

  async balanceOf(bond: Address, holder: Address): Promise<bigint> {
    return this.hedera.publicClient.readContract({
      address: bond,
      abi: atsBondAbi,
      functionName: 'balanceOfByPartition',
      args: [DEFAULT_PARTITION, holder],
    })
  }

  async totalSupply(bond: Address): Promise<bigint> {
    return this.hedera.publicClient.readContract({
      address: bond,
      abi: atsBondAbi,
      functionName: 'totalSupplyByPartition',
      args: [DEFAULT_PARTITION],
    })
  }

  /** Calldata for a bond deployment, exposed so it can be asserted on without a network. */
  static encodeIssue(holder: Address, units: bigint): Hex {
    return encodeFunctionData({
      abi: atsBondAbi,
      functionName: 'issueByPartition',
      args: [{ partition: DEFAULT_PARTITION, tokenHolder: holder, value: units, data: '0x' }],
    })
  }
}
