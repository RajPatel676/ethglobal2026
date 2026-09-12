import { describe, expect, it, afterEach, vi } from 'vitest'
import { StateStore } from '../src/store/state.js'
import { runPipeline } from '../src/pipeline/index.js'
import { RejectInvoice, type PipelineDeps, type StageFn } from '../src/pipeline/context.js'
import { registryCheck } from '../src/pipeline/01-registry-check.js'
import { STAGES } from '../src/types.js'
import { fakeDeps, invoiceRecord, tempStateDir } from './helpers.js'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((c) => c()))

function freshStore() {
  const { dir, cleanup } = tempStateDir()
  cleanups.push(cleanup)
  return new StateStore(dir)
}

describe('registry-check — the double-financing guard', () => {
  it('passes when the HCS topic has no entry for this invoice', async () => {
    const state = freshStore()
    const rec = state.upsert(invoiceRecord())
    const deps = fakeDeps(state)
    await expect(registryCheck(rec, deps)).resolves.toEqual({})
  })

  it('rejects when the HCS topic already carries this invoice hash', async () => {
    const state = freshStore()
    const rec = state.upsert(invoiceRecord())
    const deps = fakeDeps(state, {
      mirror: { findFinancings: async () => ['42'] } as unknown as PipelineDeps['mirror'],
    })
    await expect(registryCheck(rec, deps)).rejects.toThrow(RejectInvoice)
    await expect(registryCheck(rec, deps)).rejects.toThrow(/sequence 42/)
  })

  it('rejects an invoice this adapter already financed locally', async () => {
    const state = freshStore()
    const rec = state.upsert(invoiceRecord({ status: 'financed', marketAddress: '0xmarket' }))
    await expect(registryCheck(rec, fakeDeps(state))).rejects.toThrow(/already financed locally/)
  })

  /**
   * The important one. A mirror-node outage must not read as "no prior financing" — failing open
   * would let the same invoice be financed twice, which is the exact thing this project claims
   * to prevent.
   */
  it('fails closed when the mirror node is unreachable', async () => {
    const state = freshStore()
    const rec = state.upsert(invoiceRecord())
    const deps = fakeDeps(state, {
      mirror: {
        findFinancings: async () => {
          throw new Error('mirror node 503')
        },
      } as unknown as PipelineDeps['mirror'],
    })
    await expect(registryCheck(rec, deps)).rejects.toThrow(/503/)
    // and specifically NOT a pass
    await expect(registryCheck(rec, deps)).rejects.not.toBeInstanceOf(RejectInvoice)
  })
})

describe('runPipeline', () => {
  const stubStages = (calls: string[]): Record<string, StageFn> =>
    Object.fromEntries(
      STAGES.map((s) => [
        s,
        (async () => {
          calls.push(s)
          return {}
        }) as StageFn,
      ]),
    )

  it('runs every stage in order and marks the invoice financed', async () => {
    const state = freshStore()
    const rec = state.upsert(invoiceRecord())
    const calls: string[] = []
    const mod = await import('../src/pipeline/index.js')
    const spies = STAGES.map((s) =>
      vi.spyOn(mod.PIPELINE, s).mockImplementation(stubStages(calls)[s]!),
    )

    const out = await runPipeline(rec, fakeDeps(state))
    expect(out.kind).toBe('completed')
    expect(calls).toEqual([...STAGES])
    spies.forEach((s) => s.mockRestore())
  })

  /**
   * Resume is the reason stages are persisted individually: re-running create-bond would mint a
   * second bond against one invoice and silently dilute every holder.
   */
  it('resumes after a failure without re-running completed stages', async () => {
    const state = freshStore()
    const rec = state.upsert(invoiceRecord())
    const mod = await import('../src/pipeline/index.js')

    const calls: string[] = []
    let deployAttempts = 0 // NOT reset between runs — the first attempt must be the only failure
    const spies = STAGES.map((s) =>
      vi.spyOn(mod.PIPELINE, s).mockImplementation(async () => {
        calls.push(s)
        if (s === 'deploy-market' && ++deployAttempts === 1) {
          throw new Error('hedera rpc timeout')
        }
        return {}
      }),
    )

    const first = await runPipeline(rec, fakeDeps(state))
    expect(first.kind).toBe('failed')
    if (first.kind === 'failed') expect(first.stage).toBe('deploy-market')
    expect(calls).toEqual(['registry-check', 'create-bond', 'issue-units', 'deploy-market'])

    calls.length = 0
    const second = await runPipeline(state.get(rec.invoiceHash)!, fakeDeps(state))
    expect(second.kind).toBe('completed')
    // the three already-done stages are NOT repeated
    expect(calls).toEqual(['deploy-market', 'hcs-record', 'ens-writeback'])
    spies.forEach((s) => s.mockRestore())
  })

  it('a rejection is terminal and records why', async () => {
    const state = freshStore()
    const rec = state.upsert(invoiceRecord())
    const mod = await import('../src/pipeline/index.js')
    const spy = vi
      .spyOn(mod.PIPELINE, 'registry-check')
      .mockRejectedValue(new RejectInvoice('already in the registry at sequence 9'))

    const out = await runPipeline(rec, fakeDeps(state))
    expect(out.kind).toBe('rejected')
    const stored = state.get(rec.invoiceHash)!
    expect(stored.status).toBe('rejected')
    expect(stored.failure).toMatch(/sequence 9/)
    expect(stored.completedStages).toEqual([])
    spy.mockRestore()
  })

  it('persists what a stage produced, not just that it ran', async () => {
    const state = freshStore()
    const rec = state.upsert(invoiceRecord())
    const mod = await import('../src/pipeline/index.js')
    const spies = [
      vi.spyOn(mod.PIPELINE, 'registry-check').mockResolvedValue({}),
      vi.spyOn(mod.PIPELINE, 'create-bond').mockResolvedValue({ atsTokenAddress: '0xB0nd' }),
      vi.spyOn(mod.PIPELINE, 'issue-units').mockResolvedValue({ unitsIssued: '12500' }),
      vi.spyOn(mod.PIPELINE, 'deploy-market').mockRejectedValue(new Error('stop here')),
    ]

    await runPipeline(rec, fakeDeps(state))
    const stored = state.get(rec.invoiceHash)!
    expect(stored.atsTokenAddress).toBe('0xB0nd')
    expect(stored.unitsIssued).toBe('12500')
    spies.forEach((s) => s.mockRestore())
  })
})
