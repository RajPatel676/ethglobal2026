import type { Address } from 'viem'
import { invoiceName } from '@receivable/shared'
import type { PipelineDeps } from '../pipeline/index.js'
import { runPipeline } from '../pipeline/index.js'
import type { InvoiceRecord } from '../types.js'

/** Sepolia's log range cap. Scanning wider in one call gets rejected by most providers. */
const MAX_RANGE = 9_000n
/** Blocks to stay behind head, so a reorg does not hand us an event that later vanishes. */
const CONFIRMATIONS = 3n

/**
 * Polls Sepolia for `InvoiceVerified` and drives each one through the pipeline.
 *
 * Polling rather than a websocket subscription: public Sepolia RPCs drop long-lived sockets
 * routinely, and a missed event here means an invoice silently never gets financed. A cursor plus
 * `getLogs` is dull, survives restarts, and can be replayed from any block.
 *
 * The cursor advances only after every event in a batch has been handled, so a crash mid-batch
 * re-reads those blocks. That is safe because the pipeline is idempotent per invoice hash.
 */
export class InvoiceVerifiedListener {
  private running = false

  constructor(
    private readonly deps: PipelineDeps,
    private readonly consumerAddress: Address,
  ) {}

  async start(): Promise<void> {
    const { state, sepolia, env, log } = this.deps
    this.running = true

    let cursor = state.getCursor()
    if (cursor === null) {
      cursor =
        env.ADAPTER_START_BLOCK > 0n ? env.ADAPTER_START_BLOCK : await sepolia.currentBlock()
      state.setCursor(cursor)
      log(`no cursor — starting at block ${cursor}`)
    } else {
      log(`resuming from block ${cursor}`)
    }

    while (this.running) {
      try {
        cursor = await this.tick(cursor)
      } catch (err) {
        // Never let a poll error kill the loop; the next tick re-reads the same range.
        log(`poll error (will retry): ${err instanceof Error ? err.message : String(err)}`)
      }
      await sleep(env.ADAPTER_POLL_SECONDS * 1000)
    }
  }

  stop(): void {
    this.running = false
  }

  private async tick(cursor: bigint): Promise<bigint> {
    const { sepolia, state, log } = this.deps
    const head = await sepolia.currentBlock()
    const safeHead = head > CONFIRMATIONS ? head - CONFIRMATIONS : 0n
    if (safeHead <= cursor) return cursor

    const from = cursor + 1n
    const to = safeHead - from > MAX_RANGE ? from + MAX_RANGE : safeHead

    const logs = await sepolia.getVerifiedLogs(this.consumerAddress, from, to)
    if (logs.length > 0) log(`${logs.length} InvoiceVerified event(s) in ${from}..${to}`)

    for (const entry of logs) {
      const record = toRecord(entry)
      if (!record) continue
      const stored = state.upsert(record)
      await runPipeline(stored, this.deps)
    }

    state.setCursor(to)
    return to
  }
}

/** Turn a decoded log into the record the pipeline carries. Returns null for malformed logs. */
export function toRecord(entry: {
  args: {
    businessLabel?: string
    invoiceLabel?: string
    invoiceHash?: `0x${string}`
    faceValueCents?: bigint
    dueDate?: bigint
    riskScore?: number
    discountBps?: number
  }
  blockNumber: bigint | null
  transactionHash: `0x${string}` | null
}): InvoiceRecord | null {
  const a = entry.args
  if (
    !a.businessLabel ||
    !a.invoiceLabel ||
    !a.invoiceHash ||
    a.faceValueCents === undefined ||
    a.dueDate === undefined ||
    a.riskScore === undefined ||
    a.discountBps === undefined
  ) {
    return null
  }

  return {
    invoiceHash: a.invoiceHash.toLowerCase(),
    ensName: invoiceName(a.invoiceLabel, a.businessLabel),
    businessLabel: a.businessLabel,
    invoiceLabel: a.invoiceLabel,
    faceValueCents: a.faceValueCents.toString(),
    dueDate: Number(a.dueDate),
    discountBps: a.discountBps,
    riskScore: a.riskScore,
    sourceTxHash: entry.transactionHash ?? '',
    sourceBlock: (entry.blockNumber ?? 0n).toString(),
    completedStages: [],
    status: 'pending',
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
