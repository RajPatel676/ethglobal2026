import sepoliaDeployments from '../../../../contracts/sepolia/deployments/sepolia.json' with { type: 'json' }

const ZERO = '0x0000000000000000000000000000000000000000' as const

/**
 * ENSv2 Sepolia beta deployment.
 *
 * The ENS-owned contract addresses are NOT hard-coded here on purpose: the beta is rolling and
 * the guide only had truncated forms (0x8115…4354 etc.). Fill contracts/sepolia/deployments/sepolia.json
 * from https://docs.ens.domains/learn/deployments ("Sepolia ENSv2 beta") on day 1 — `pnpm ens:check`
 * refuses to run scripts while any value is still the zero address.
 */
export const ENS_SEPOLIA = {
  chainId: 11155111,
  rootRegistry: (sepoliaDeployments.ens.rootRegistry || ZERO) as `0x${string}`,
  ethRegistry: (sepoliaDeployments.ens.ethRegistry || ZERO) as `0x${string}`,
  ethRegistrar: (sepoliaDeployments.ens.ethRegistrar || ZERO) as `0x${string}`,
  verifiableFactory: (sepoliaDeployments.ens.verifiableFactory || ZERO) as `0x${string}`,
  permissionedResolverImpl: (sepoliaDeployments.ens.permissionedResolverImpl || ZERO) as `0x${string}`,
  userRegistryImpl: (sepoliaDeployments.ens.userRegistryImpl || ZERO) as `0x${string}`,
  universalResolver: (sepoliaDeployments.ens.universalResolver || ZERO) as `0x${string}`,
  mockUsdc: (sepoliaDeployments.ens.mockUsdc || ZERO) as `0x${string}`,
} as const

/** Our own deployments (written by the Foundry scripts). */
export const RECEIVABLE_SEPOLIA = {
  verificationConsumer: (sepoliaDeployments.receivable.verificationConsumer || ZERO) as `0x${string}`,
  rootSubregistry: (sepoliaDeployments.receivable.rootSubregistry || ZERO) as `0x${string}`,
  resolver: (sepoliaDeployments.receivable.resolver || ZERO) as `0x${string}`,
  forwarder: (sepoliaDeployments.receivable.forwarder || ZERO) as `0x${string}`,
} as const

export const isUnset = (a: string) => a === ZERO || a === ''

/** Registry role bitmap (ensdomains/namechain EnhancedAccessControl). Admin variant = role << 128. */
export const ENS_REGISTRY_ROLES = {
  ROLE_REGISTRAR: 1n << 0n,
  ROLE_RENEW: 1n << 4n,
  ROLE_SET_SUBREGISTRY: 1n << 20n,
  ROLE_SET_RESOLVER: 1n << 24n,
  ROLE_CAN_TRANSFER_ADMIN: (1n << 28n) << 128n,
  ADMIN_SHIFT: 128n,
} as const

/** Permissioned resolver role bitmap. */
export const ENS_RESOLVER_ROLES = {
  ROLE_SET_ADDR: 1n << 0n,
  ROLE_SET_TEXT: 1n << 4n,
  ROLE_SET_CONTENTHASH: 1n << 8n,
  ROLE_SET_ALIAS: 1n << 28n,
} as const

/** Text-record keys used by Receivable. Business-level keys live on `<biz>.receivable.eth`. */
export const ENS_KEYS = {
  business: {
    kycStatus: 'kyc-status',
    riskTier: 'risk-tier',
    hcsTopic: 'hcs-topic',
    description: 'description',
    url: 'url',
  },
  invoice: {
    invoiceHash: 'invoice-hash',
    faceValueCents: 'face-value-cents',
    dueDate: 'due-date',
    riskScore: 'risk-score',
    discountBps: 'discount-bps',
    status: 'status',
    atsToken: 'ats-token',
    hcsSeq: 'hcs-seq',
  },
} as const

/** Keys only the Hedera adapter may write (enforced on-chain by authorizeTextRoles). */
export const ADAPTER_WRITABLE_KEYS = [
  ENS_KEYS.invoice.atsToken,
  ENS_KEYS.invoice.hcsSeq,
  ENS_KEYS.invoice.status,
] as const

export const ROOT_NAME = 'receivable.eth' as const
export const businessName = (label: string) => `${label}.${ROOT_NAME}`
export const invoiceName = (invoiceLabel: string, businessLabel: string) =>
  `${invoiceLabel}.${businessLabel}.${ROOT_NAME}`
