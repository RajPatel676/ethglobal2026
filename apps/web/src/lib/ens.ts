import { createPublicClient, http, type Address, type PublicClient, type Transport, type Chain } from 'viem'
import {
  ENS_KEYS,
  RECEIVABLE_SEPOLIA,
  isUnset,
  namehash,
  permissionedResolverAbi,
  VerifiedInvoiceSchema,
  type VerifiedInvoice,
} from '@receivable/shared'
import { sepolia } from './chains'
import { publicEnv } from './env'

export const sepoliaClient: PublicClient<Transport, Chain> = createPublicClient({
  chain: sepolia,
  transport: http(publicEnv.sepoliaRpc),
})

export const ensConfigured = () => !isUnset(RECEIVABLE_SEPOLIA.resolver)

/**
 * Read one invoice entirely from ENS.
 *
 * This is the claim the project makes: an invoice's verification, price, risk and Hedera token
 * are all readable from its name by anyone, with no backend of ours in the path. So this
 * function talks to the resolver and nothing else — no database, no API.
 *
 * Returns null when the name has no records, which is how a nonexistent invoice looks on-chain.
 */
export async function resolveInvoice(ensName: string): Promise<VerifiedInvoice | null> {
  if (!ensConfigured()) return null

  const node = namehash(ensName) as `0x${string}`
  const resolver = RECEIVABLE_SEPOLIA.resolver as Address

  const keys = [
    ENS_KEYS.invoice.invoiceHash,
    ENS_KEYS.invoice.faceValueCents,
    ENS_KEYS.invoice.dueDate,
    ENS_KEYS.invoice.riskScore,
    ENS_KEYS.invoice.discountBps,
    ENS_KEYS.invoice.status,
    ENS_KEYS.invoice.atsToken,
    ENS_KEYS.invoice.hcsSeq,
  ] as const

  const results = await sepoliaClient.multicall({
    contracts: keys.map((key) => ({
      address: resolver,
      abi: permissionedResolverAbi,
      functionName: 'text' as const,
      args: [node, key] as const,
    })),
    allowFailure: true,
  })

  const value = (i: number): string => {
    const r = results[i]
    return r && r.status === 'success' ? (r.result as string) : ''
  }

  const invoiceHash = value(0)
  if (!invoiceHash) return null // no records -> the name does not exist for us

  const parsed = VerifiedInvoiceSchema.safeParse({
    ensName,
    businessName: ensName.split('.').slice(1).join('.'),
    invoiceHash,
    faceValueCents: Number(value(1) || 0),
    dueDate: Number(value(2) || 0),
    riskScore: Number(value(3) || 0),
    discountBps: Number(value(4) || 0),
    status: value(5) || 'pending',
    atsToken: value(6) || undefined,
    hcsSeq: value(7) || undefined,
  })

  return parsed.success ? parsed.data : null
}

/** Business-level records on `<label>.receivable.eth`. */
export async function resolveBusiness(businessName: string) {
  if (!ensConfigured()) return null
  const node = namehash(businessName) as `0x${string}`
  const resolver = RECEIVABLE_SEPOLIA.resolver as Address

  const [kyc, description, url] = await sepoliaClient.multicall({
    contracts: (
      [ENS_KEYS.business.kycStatus, ENS_KEYS.business.description, ENS_KEYS.business.url] as const
    ).map((key) => ({
      address: resolver,
      abi: permissionedResolverAbi,
      functionName: 'text' as const,
      args: [node, key] as const,
    })),
    allowFailure: true,
  })

  const read = (r: (typeof kyc) | undefined) =>
    r && r.status === 'success' ? (r.result as string) : ''

  return {
    name: businessName,
    kycStatus: read(kyc),
    description: read(description),
    url: read(url),
  }
}
