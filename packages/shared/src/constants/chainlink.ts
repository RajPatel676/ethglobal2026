/** Chainlink CRE — Sepolia forwarders (docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts). */
export const CRE_SEPOLIA = {
  chainSelectorName: 'ethereum-testnet-sepolia',
  /** used by `cre workflow simulate --broadcast` */
  mockKeystoneForwarder: '0x15fC6ae953E024d975e77382eEeC56A9101f9F88',
  /** used by a real deployment */
  keystoneForwarder: '0xF8344CFd5c43616a4366C34E3EEE75af79a74482',
} as const

/** Offsets inside the `metadata` bytes passed to IReceiver.onReport. */
export const CRE_METADATA = {
  workflowId: [0, 32],
  workflowName: [32, 42],
  workflowOwner: [42, 62],
} as const
