import { createPublicClient, http, type Address, type PublicClient, type Transport, type Chain } from 'viem'
import { invoicePrimaryMarketAbi } from '@receivable/shared'
import { hederaTestnet } from './chains'
import { publicEnv } from './env'

export const hederaClient: PublicClient<Transport, Chain> = createPublicClient({
  chain: hederaTestnet,
  transport: http(publicEnv.hederaRpc),
})

/** Read-only surface of InvoicePrimaryMarket that the UI needs beyond the shared ABI. */
export const marketReadAbi = [
  ...invoicePrimaryMarketAbi,
  { type: 'function', name: 'unitPriceMicro', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalUnits', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'unitsSold', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'unitsRemaining', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'status', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'discountBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'dueDate', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  { type: 'function', name: 'fundingDeadline', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  {
    type: 'function',
    name: 'unitsOwned',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  { type: 'function', name: 'redeem', stateMutability: 'nonpayable', inputs: [], outputs: [] },
] as const

export const MARKET_STATUS = ['Open', 'Settled', 'Cancelled'] as const
export type MarketStatus = (typeof MARKET_STATUS)[number]

export type MarketSnapshot = {
  address: Address
  totalUnits: bigint
  unitsSold: bigint
  unitsRemaining: bigint
  unitPriceMicro: bigint
  discountBps: number
  dueDate: number
  fundingDeadline: number
  status: MarketStatus
}

/**
 * One multicall for the whole market. Returns null if the address has no contract — during the
 * demo a market may be recorded in ENS moments before it is readable on Hedera, and a half-filled
 * card is worse than an honest "loading".
 */
export async function readMarket(address: Address): Promise<MarketSnapshot | null> {
  try {
    const calls = [
      'totalUnits',
      'unitsSold',
      'unitsRemaining',
      'unitPriceMicro',
      'discountBps',
      'dueDate',
      'fundingDeadline',
      'status',
    ] as const

    const res = await hederaClient.multicall({
      contracts: calls.map((functionName) => ({ address, abi: marketReadAbi, functionName })),
      allowFailure: false,
    })

    return {
      address,
      totalUnits: res[0] as bigint,
      unitsSold: res[1] as bigint,
      unitsRemaining: res[2] as bigint,
      unitPriceMicro: res[3] as bigint,
      discountBps: Number(res[4]),
      dueDate: Number(res[5]),
      fundingDeadline: Number(res[6]),
      status: MARKET_STATUS[Number(res[7])] ?? 'Open',
    }
  } catch {
    return null
  }
}
