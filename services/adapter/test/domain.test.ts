import { describe, expect, it } from 'vitest'
import { invoiceHash, unitPriceMicro, purchaseCostMicro, invoiceName } from '@receivable/shared'
import { unitsFromCents, RegistryEntrySchema } from '../src/types.js'
import { HederaClient } from '../src/clients/hedera-client.js'
import { toRecord } from '../src/listeners/sepolia-invoice-verified.js'
import { loadEnv } from '../src/env.js'
import { fakeEnv } from './helpers.js'

describe('invoiceHash — the cross-lender fingerprint', () => {
  const base = {
    businessLabel: 'acme',
    number: 'INV-1042',
    amountCents: 1_250_000,
    dueDate: 1_762_387_200,
    debtorId: 'deb-globex',
  }

  it('is stable for identical input', () => {
    expect(invoiceHash(base)).toBe(invoiceHash({ ...base }))
  })

  /** If a field could change without changing the hash, double-financing slips through. */
  it.each(['businessLabel', 'number', 'debtorId'] as const)('changes when %s changes', (field) => {
    expect(invoiceHash({ ...base, [field]: 'different' })).not.toBe(invoiceHash(base))
  })

  it('changes when the amount or due date changes', () => {
    expect(invoiceHash({ ...base, amountCents: 1_250_001 })).not.toBe(invoiceHash(base))
    expect(invoiceHash({ ...base, dueDate: base.dueDate + 1 })).not.toBe(invoiceHash(base))
  })

  it('treats a bigint and a number amount as the same invoice', () => {
    expect(invoiceHash({ ...base, amountCents: 1_250_000n })).toBe(invoiceHash(base))
  })
})

describe('units and pricing', () => {
  it('converts cents to whole-dollar units, discarding sub-dollar remainder', () => {
    expect(unitsFromCents(1_250_000n)).toBe(12_500n)
    expect(unitsFromCents(199n)).toBe(1n)
    expect(unitsFromCents(99n)).toBe(0n)
  })

  /** Must equal InvoicePrimaryMarket.unitPriceMicro() or the UI quotes a price the chain rejects. */
  it('matches the Solidity pricing formula', () => {
    expect(unitPriceMicro(320)).toBe(968_000n)
    expect(unitPriceMicro(200)).toBe(980_000n)
    expect(unitPriceMicro(1_200)).toBe(880_000n)
    expect(purchaseCostMicro(12_500n, 320)).toBe(12_100_000_000n)
  })
})

describe('HederaClient.entityToEvmAddress', () => {
  it('maps 0.0.N to the EVM address holding N', () => {
    expect(HederaClient.entityToEvmAddress('0.0.429274')).toBe(
      '0x0000000000000000000000000000000000068cda',
    )
    expect(HederaClient.entityToEvmAddress('0.0.9213391')).toBe(
      '0x00000000000000000000000000000000008c95cf',
    )
  })
})

describe('RegistryEntry — a public, immutable wire format', () => {
  const good = {
    v: 1 as const,
    invoiceHash: `0x${'ab'.repeat(32)}`,
    ensName: 'inv-1042.acme.receivable.eth',
    faceValueCents: '1250000',
    dueDate: 1_762_387_200,
    discountBps: 320,
    financedAt: 1_760_000_000,
  }

  it('accepts a well-formed entry', () => {
    expect(RegistryEntrySchema.parse(good)).toMatchObject({ v: 1 })
  })

  it('rejects a non-hex invoice hash and a numeric faceValueCents', () => {
    expect(RegistryEntrySchema.safeParse({ ...good, invoiceHash: 'nope' }).success).toBe(false)
    // bigints do not survive JSON, so this field is a string on purpose
    expect(RegistryEntrySchema.safeParse({ ...good, faceValueCents: 1 }).success).toBe(false)
  })
})

describe('toRecord', () => {
  const args = {
    businessLabel: 'acme',
    invoiceLabel: 'inv-1042',
    invoiceHash: `0x${'AB'.repeat(32)}` as `0x${string}`,
    faceValueCents: 1_250_000n,
    dueDate: 1_762_387_200n,
    riskScore: 88,
    discountBps: 320,
  }

  it('builds the ENS name and lowercases the hash', () => {
    const rec = toRecord({ args, blockNumber: 100n, transactionHash: '0xtx' })!
    expect(rec.ensName).toBe(invoiceName('inv-1042', 'acme'))
    expect(rec.invoiceHash).toBe(`0x${'ab'.repeat(32)}`)
    expect(rec.status).toBe('pending')
    expect(rec.completedStages).toEqual([])
    expect(rec.faceValueCents).toBe('1250000')
  })

  it('returns null on a malformed log rather than a half-built record', () => {
    expect(
      toRecord({
        args: { ...args, invoiceHash: undefined },
        blockNumber: 1n,
        transactionHash: '0x',
      }),
    ).toBeNull()
  })
})

describe('loadEnv', () => {
  it('accepts a complete environment', () => {
    expect(() => loadEnv(fakeEnv() as unknown as NodeJS.ProcessEnv)).not.toThrow()
  })

  it('names every missing or malformed variable at once', () => {
    let msg = ''
    try {
      loadEnv({ HEDERA_ADAPTER_ACCOUNT_ID: 'not-an-id' } as NodeJS.ProcessEnv)
    } catch (e) {
      msg = (e as Error).message
    }
    expect(msg).toMatch(/ADAPTER_SEPOLIA_PRIVATE_KEY/)
    expect(msg).toMatch(/HEDERA_ADAPTER_ACCOUNT_ID/)
    expect(msg).toMatch(/HCS_REGISTRY_TOPIC_ID/)
    expect(msg).toMatch(/docs\/SETUP\.md/)
  })

  it('rejects a truncated private key', () => {
    const env = { ...fakeEnv(), ADAPTER_SEPOLIA_PRIVATE_KEY: '0xdead' }
    expect(() => loadEnv(env as unknown as NodeJS.ProcessEnv)).toThrow(/32-byte hex/)
  })
})
