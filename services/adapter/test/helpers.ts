import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Env } from '../src/env.js'
import type { PipelineDeps } from '../src/pipeline/context.js'
import { StateStore } from '../src/store/state.js'
import type { InvoiceRecord } from '../src/types.js'

export function tempStateDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'adapter-test-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

export const fakeEnv = (over: Partial<Env> = {}): Env =>
  ({
    SEPOLIA_RPC_URL: 'https://example.invalid',
    ADAPTER_SEPOLIA_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
    HEDERA_JSON_RPC: 'https://example.invalid',
    HEDERA_MIRROR: 'https://example.invalid',
    HEDERA_ADAPTER_ACCOUNT_ID: '0.0.1001',
    HEDERA_ADAPTER_PRIVATE_KEY: `0x${'22'.repeat(32)}`,
    HCS_REGISTRY_TOPIC_ID: '0.0.5555',
    ADAPTER_PORT: 4200,
    ADAPTER_API_KEY: 'test-api-key',
    ADAPTER_STATE_DIR: '/tmp/unused',
    ADAPTER_START_BLOCK: 0n,
    ADAPTER_POLL_SECONDS: 12,
    FUNDING_WINDOW_DAYS: 14,
    ...over,
  }) as Env

export const invoiceRecord = (over: Partial<InvoiceRecord> = {}): InvoiceRecord => ({
  invoiceHash: `0x${'ab'.repeat(32)}`,
  ensName: 'inv-1042.acme.receivable.eth',
  businessLabel: 'acme',
  invoiceLabel: 'inv-1042',
  faceValueCents: '1250000',
  dueDate: 1_762_387_200,
  discountBps: 320,
  riskScore: 88,
  sourceTxHash: '0xdeadbeef',
  sourceBlock: '100',
  completedStages: [],
  status: 'pending',
  ...over,
})

/** PipelineDeps with everything stubbed; override only what a test exercises. */
export function fakeDeps(state: StateStore, over: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    env: fakeEnv(),
    state,
    sepolia: {} as PipelineDeps['sepolia'],
    hedera: {} as PipelineDeps['hedera'],
    ats: {} as PipelineDeps['ats'],
    mirror: { findFinancings: async () => [] } as unknown as PipelineDeps['mirror'],
    usdcEvmAddress: '0x0000000000000000000000000000000000068cda',
    log: () => {},
    ...over,
  }
}
