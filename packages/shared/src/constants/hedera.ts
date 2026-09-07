export const HEDERA_TESTNET = {
  chainId: 296,
  jsonRpc: 'https://testnet.hashio.io/api',
  mirrorNode: 'https://testnet.mirrornode.hedera.com/api/v1',
  hashscan: 'https://hashscan.io/testnet',
  /** ENSIP-11 coin type for an EVM chain: 0x80000000 | chainId */
  ensCoinType: 0x80000000 | 296, // 2147483944
  /** Circle testnet USDC (HTS token, 6 decimals) */
  usdcTokenId: '0.0.429274',
  usdcDecimals: 6,
  /** ATS hosted testnet deployment (June 2026). ⚠️ rotates — keep in sync with adapter .env */
  atsFactory: '0.0.9213391',
  atsResolver: '0.0.9212226', // Business Logic Resolver
  atsBondConfigId: '0x0000000000000000000000000000000000000000000000000000000000000002',
  atsBondConfigVersion: 1,
} as const

/** HIP-423: long-term scheduled transactions can expire up to 62 days out. */
export const MAX_SCHEDULE_SECONDS = 62 * 24 * 3600

/** Currency code "USD" as bytes3 for ATS. */
export const ATS_CURRENCY_USD = '0x555344' as const

export const hashscanTx = (id: string) => `${HEDERA_TESTNET.hashscan}/transaction/${id}`
export const hashscanContract = (addr: string) => `${HEDERA_TESTNET.hashscan}/contract/${addr}`
export const hashscanTopic = (id: string) => `${HEDERA_TESTNET.hashscan}/topic/${id}`
export const hashscanSchedule = (id: string) => `${HEDERA_TESTNET.hashscan}/schedule/${id}`
