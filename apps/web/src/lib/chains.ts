import { defineChain } from 'viem'
import { sepolia } from 'viem/chains'
import { HEDERA_TESTNET } from '@receivable/shared'
import { publicEnv } from './env'

export const hederaTestnet = defineChain({
  id: HEDERA_TESTNET.chainId,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: [publicEnv.hederaRpc] } },
  blockExplorers: { default: { name: 'HashScan', url: HEDERA_TESTNET.hashscan } },
  testnet: true,
})

export { sepolia }

export const etherscanTx = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`
export const etherscanAddress = (a: string) => `https://sepolia.etherscan.io/address/${a}`
export const ensAppName = (name: string) => `https://sepolia.app.ens.domains/${name}`
