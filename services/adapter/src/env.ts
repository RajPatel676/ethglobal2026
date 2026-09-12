import { z } from 'zod'

/**
 * Fail fast and loudly. The adapter holds keys on two chains and moves other people's money;
 * a missing variable must stop the process at boot, not surface as a confusing revert three
 * stages into a pipeline run that has already minted a bond.
 */
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'expected a 0x-prefixed 32-byte hex key')
const hederaId = z.string().regex(/^\d+\.\d+\.\d+$/, 'expected a Hedera entity id like 0.0.12345')

export const EnvSchema = z.object({
  // Sepolia
  SEPOLIA_RPC_URL: z.string().url().default('https://ethereum-sepolia-rpc.publicnode.com'),
  ADAPTER_SEPOLIA_PRIVATE_KEY: hex32,

  // Hedera
  HEDERA_JSON_RPC: z.string().url().default('https://testnet.hashio.io/api'),
  HEDERA_MIRROR: z.string().url().default('https://testnet.mirrornode.hedera.com/api/v1'),
  HEDERA_ADAPTER_ACCOUNT_ID: hederaId,
  HEDERA_ADAPTER_PRIVATE_KEY: hex32,
  HEDERA_ESCROW_ACCOUNT_ID: hederaId.optional(),
  HCS_REGISTRY_TOPIC_ID: hederaId,

  // Service
  ADAPTER_PORT: z.coerce.number().int().positive().default(4200),
  ADAPTER_API_KEY: z.string().min(8, 'ADAPTER_API_KEY must be at least 8 characters'),
  ADAPTER_STATE_DIR: z.string().default('services/adapter/state'),
  /** Block to start scanning from when there is no saved cursor. 0 = latest at boot. */
  ADAPTER_START_BLOCK: z.coerce.bigint().default(0n),
  /** Seconds between Sepolia log polls. */
  ADAPTER_POLL_SECONDS: z.coerce.number().int().positive().default(12),
  /** Days investors have to fill a market before it can be cancelled. */
  FUNDING_WINDOW_DAYS: z.coerce.number().int().positive().default(14),
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid adapter environment:\n${lines.join('\n')}\n\nSee docs/SETUP.md.`)
  }
  return parsed.data
}
