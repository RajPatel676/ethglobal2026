import { describe, expect, it, afterEach } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { StateStore } from '../src/store/state.js'
import { invoiceRecord, tempStateDir } from './helpers.js'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((c) => c())
})

function store() {
  const { dir, cleanup } = tempStateDir()
  cleanups.push(cleanup)
  return { store: new StateStore(dir), dir }
}

describe('StateStore', () => {
  it('upsert is idempotent — a re-seen invoice never overwrites progress', () => {
    const { store: s } = store()
    s.upsert(invoiceRecord())
    s.completeStage(invoiceRecord().invoiceHash, 'registry-check')

    // the listener re-reads the same block after a crash and emits the event again
    const again = s.upsert(invoiceRecord())

    expect(again.completedStages).toEqual(['registry-check'])
    expect(s.all()).toHaveLength(1)
  })

  it('survives a restart with completed stages intact', () => {
    const { store: s, dir } = store()
    const rec = invoiceRecord()
    s.upsert(rec)
    s.completeStage(rec.invoiceHash, 'registry-check')
    s.completeStage(rec.invoiceHash, 'create-bond', { atsTokenAddress: '0xbond' })

    const reopened = new StateStore(dir)
    const loaded = reopened.get(rec.invoiceHash)!
    expect(loaded.completedStages).toEqual(['registry-check', 'create-bond'])
    expect(loaded.atsTokenAddress).toBe('0xbond')
    expect(reopened.hasCompleted(rec.invoiceHash, 'create-bond')).toBe(true)
    expect(reopened.hasCompleted(rec.invoiceHash, 'issue-units')).toBe(false)
  })

  it('completeStage does not duplicate a stage replayed twice', () => {
    const { store: s } = store()
    const rec = invoiceRecord()
    s.upsert(rec)
    s.completeStage(rec.invoiceHash, 'hcs-record', { hcsSequence: '7' })
    s.completeStage(rec.invoiceHash, 'hcs-record', { hcsSequence: '7' })
    expect(s.get(rec.invoiceHash)!.completedStages).toEqual(['hcs-record'])
  })

  it('is case-insensitive on the invoice hash', () => {
    const { store: s } = store()
    const rec = invoiceRecord({ invoiceHash: `0x${'AB'.repeat(32)}` })
    s.upsert(rec)
    expect(s.get(`0x${'ab'.repeat(32)}`)).toBeDefined()
  })

  it('writes atomically — no .tmp file is left behind', () => {
    const { store: s, dir } = store()
    s.upsert(invoiceRecord())
    const written = readFileSync(join(dir, 'invoices.json'), 'utf8')
    expect(JSON.parse(written)).toHaveLength(1)
    expect(() => readFileSync(join(dir, 'invoices.json.tmp'), 'utf8')).toThrow()
  })

  it('refuses to start on a corrupt state file rather than losing history', () => {
    const { dir } = store()
    writeFileSync(join(dir, 'invoices.json'), '{"not":"an array"}')
    expect(() => new StateStore(dir)).toThrow(/corrupt/)
  })

  it('keeps the block cursor separate from invoice progress', () => {
    const { store: s, dir } = store()
    expect(s.getCursor()).toBeNull()
    s.setCursor(8_675_309n)
    expect(new StateStore(dir).getCursor()).toBe(8_675_309n)
  })
})
