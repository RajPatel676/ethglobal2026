/**
 * Client-visible configuration.
 *
 * Deliberately tolerant: the app must render before any chain is deployed, because the demo is
 * built and reviewed long before addresses exist. Missing config degrades a feature to a clear
 * "not configured yet" state instead of a white screen.
 */
export const publicEnv = {
  sepoliaRpc: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com',
  hederaRpc: process.env.NEXT_PUBLIC_HEDERA_JSON_RPC ?? 'https://testnet.hashio.io/api',
  hederaMirror:
    process.env.NEXT_PUBLIC_HEDERA_MIRROR ?? 'https://testnet.mirrornode.hedera.com/api/v1',
} as const

/** Server-only. Never import this from a client component. */
export function serverEnv() {
  return {
    mockAccountingUrl: process.env.MOCK_ACCOUNTING_URL ?? 'http://localhost:4100',
    mockAccountingToken: process.env.MOCK_ACCOUNTING_TOKEN ?? 'demo-xero-token-change-me',
    adapterUrl: process.env.ADAPTER_URL ?? 'http://localhost:4200',
    adapterApiKey: process.env.ADAPTER_API_KEY ?? '',
    triggerSignerKey: process.env.TRIGGER_SIGNER_PRIVATE_KEY ?? '',
    creTriggerUrl: process.env.CRE_TRIGGER_URL ?? '',
  }
}
