import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { InvoiceRecordSchema, type InvoiceRecord, type Stage } from '../types.js'

/**
 * Crash-safe, file-backed index of every invoice the adapter has touched.
 *
 * Why this exists at all: the pipeline mints a security token and moves money. Replaying a stage
 * after a crash would mint a second bond for the same invoice — exactly the double-financing this
 * project claims to prevent. Every stage records completion here BEFORE the next one starts, and
 * `hasCompleted` gates re-entry.
 *
 * Durability: writes go to a temp file and are renamed over the target. `rename` is atomic within
 * a filesystem, so a crash mid-write leaves the previous good file rather than a truncated one.
 *
 * Single-process only. Two adapters against one state dir will race; run one.
 */
export class StateStore {
  private readonly file: string
  private readonly cursorFile: string
  private invoices = new Map<string, InvoiceRecord>()

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'invoices.json')
    this.cursorFile = join(dir, 'cursor.json')
    this.load()
  }

  private load(): void {
    if (!existsSync(this.file)) return
    const raw = JSON.parse(readFileSync(this.file, 'utf8')) as unknown
    if (!Array.isArray(raw)) throw new Error(`${this.file} is corrupt: expected an array`)
    for (const row of raw) {
      const rec = InvoiceRecordSchema.parse(row)
      this.invoices.set(rec.invoiceHash.toLowerCase(), rec)
    }
  }

  private persist(): void {
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify([...this.invoices.values()], null, 2))
    renameSync(tmp, this.file)
  }

  // ───────── invoices ─────────

  get(invoiceHash: string): InvoiceRecord | undefined {
    return this.invoices.get(invoiceHash.toLowerCase())
  }

  all(): InvoiceRecord[] {
    return [...this.invoices.values()]
  }

  /** Insert if new; returns the existing record untouched if we have seen this hash before. */
  upsert(rec: InvoiceRecord): InvoiceRecord {
    const key = rec.invoiceHash.toLowerCase()
    const existing = this.invoices.get(key)
    if (existing) return existing
    this.invoices.set(key, rec)
    this.persist()
    return rec
  }

  patch(invoiceHash: string, changes: Partial<InvoiceRecord>): InvoiceRecord {
    const key = invoiceHash.toLowerCase()
    const cur = this.invoices.get(key)
    if (!cur) throw new Error(`unknown invoice ${invoiceHash}`)
    const next = InvoiceRecordSchema.parse({ ...cur, ...changes })
    this.invoices.set(key, next)
    this.persist()
    return next
  }

  hasCompleted(invoiceHash: string, stage: Stage): boolean {
    return this.get(invoiceHash)?.completedStages.includes(stage) ?? false
  }

  /** Mark a stage done and merge in whatever it produced, in one atomic write. */
  completeStage(invoiceHash: string, stage: Stage, changes: Partial<InvoiceRecord> = {}): InvoiceRecord {
    const cur = this.get(invoiceHash)
    if (!cur) throw new Error(`unknown invoice ${invoiceHash}`)
    const completedStages = cur.completedStages.includes(stage)
      ? cur.completedStages
      : [...cur.completedStages, stage]
    return this.patch(invoiceHash, { ...changes, completedStages })
  }

  // ───────── log cursor ─────────

  /**
   * Last Sepolia block fully scanned. Stored separately so a pipeline failure never rolls the
   * cursor back and re-emits events for invoices already in flight.
   */
  getCursor(): bigint | null {
    if (!existsSync(this.cursorFile)) return null
    const { lastBlock } = JSON.parse(readFileSync(this.cursorFile, 'utf8')) as { lastBlock: string }
    return BigInt(lastBlock)
  }

  setCursor(lastBlock: bigint): void {
    const tmp = `${this.cursorFile}.tmp`
    writeFileSync(tmp, JSON.stringify({ lastBlock: lastBlock.toString() }, null, 2))
    renameSync(tmp, this.cursorFile)
  }
}
