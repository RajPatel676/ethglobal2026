'use client'

import { createConfig, http } from 'wagmi'
import { hederaTestnet, sepolia } from './chains'
import { publicEnv } from './env'

/**
 * Wallet config.
 *
 * Both chains are registered because the flow genuinely spans them: an SMB signs the financing
 * request context on Sepolia, while investors buy and redeem on Hedera. Components call
 * `useSwitchChain` rather than assuming.
 *
 * Connectors: none are declared. wagmi v2 discovers injected wallets over EIP-6963 by default
 * (`multiInjectedProviderDiscovery`), which covers MetaMask, Rabby and the rest — and avoids
 * importing the `wagmi/connectors` barrel, which pulls in the Coinbase/Base SDK and its broken
 * optional `@x402/*` deps that fail the Next build outright.
 *
 * This is also why Privy is not used, despite the original plan naming it: Privy needs an app id
 * issued per project, so gating the build on a third-party signup means the app cannot start at
 * all without one. Adding it later touches this file and the provider — nothing else.
 */
export const wagmiConfig = createConfig({
  chains: [sepolia, hederaTestnet],
  transports: {
    [sepolia.id]: http(publicEnv.sepoliaRpc),
    [hederaTestnet.id]: http(publicEnv.hederaRpc),
  },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
