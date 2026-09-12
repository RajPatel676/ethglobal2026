import { STAGES, type InvoiceRecord, type Stage } from '../types.js'
import { RejectInvoice, type PipelineDeps, type StageFn } from './context.js'
import { registryCheck } from './01-registry-check.js'
import { createBond } from './02-create-bond.js'
import { issueUnits } from './03-issue-units.js'
import { deployMarket } from './04-deploy-market.js'
import { hcsRecord } from './05-hcs-record.js'
import { ensWriteback } from './06-ens-writeback.js'

export const PIPELINE: Record<Stage, StageFn> = {
  'registry-check': registryCheck,
  'create-bond': createBond,
  'issue-units': issueUnits,
  'deploy-market': deployMarket,
  'hcs-record': hcsRecord,
  'ens-writeback': ensWriteback,
}

export type RunOutcome =
  | { kind: 'completed'; record: InvoiceRecord }
  | { kind: 'rejected'; record: InvoiceRecord; reason: string }
  | { kind: 'failed'; record: InvoiceRecord; stage: Stage; error: Error }

/**
 * Run one invoice through the six stages, resuming wherever it left off.
 *
 * Failure policy, and the reason for it:
 *
 *   - **Rejection** (`RejectInvoice`) is terminal. A business rule said no — the invoice is
 *     already financed elsewhere, say — and retrying cannot change that. Status becomes
 *     `rejected` and the invoice is never picked up again.
 *   - **Failure** (anything else) is transient by assumption: an RPC hiccup, a gas spike, a
 *     mirror-node outage. Completed stages stay completed, so the next attempt picks up at the
 *     first unfinished one rather than re-minting a bond that already exists.
 *
 * That distinction is the whole reason stages are persisted individually. A pipeline that
 * restarted from stage 1 on every error would mint duplicate bonds every time Hedera was slow.
 */
export async function runPipeline(
  record: InvoiceRecord,
  deps: PipelineDeps,
  stages: readonly Stage[] = STAGES,
): Promise<RunOutcome> {
  let current = record

  for (const stage of stages) {
    if (deps.state.hasCompleted(current.invoiceHash, stage)) {
      deps.log(`skip ${stage} (done) — ${current.ensName}`)
      continue
    }

    deps.log(`-> ${stage} — ${current.ensName}`)
    try {
      const produced = await PIPELINE[stage](current, deps)
      current = deps.state.completeStage(current.invoiceHash, stage, produced)
    } catch (err) {
      if (err instanceof RejectInvoice) {
        const rejected = deps.state.patch(current.invoiceHash, {
          status: 'rejected',
          failure: err.message,
        })
        deps.log(`REJECTED ${current.ensName}: ${err.message}`)
        return { kind: 'rejected', record: rejected, reason: err.message }
      }
      const error = err instanceof Error ? err : new Error(String(err))
      const failed = deps.state.patch(current.invoiceHash, {
        status: 'failed',
        failure: `${stage}: ${error.message}`,
      })
      deps.log(`FAILED ${current.ensName} at ${stage}: ${error.message}`)
      return { kind: 'failed', record: failed, stage, error }
    }
  }

  deps.log(`COMPLETE ${current.ensName} -> market ${current.marketAddress}`)
  return { kind: 'completed', record: current }
}

export { RejectInvoice }
export type { PipelineDeps, StageFn }
