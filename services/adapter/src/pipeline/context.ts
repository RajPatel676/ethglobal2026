import type { Address } from 'viem'
import type { Env } from '../env.js'
import type { StateStore } from '../store/state.js'
import type { SepoliaClient } from '../clients/sepolia-client.js'
import type { HederaClient } from '../clients/hedera-client.js'
import type { AtsClient } from '../clients/ats-client.js'
import type { MirrorNodeClient } from '../clients/mirror-node.js'
import type { InvoiceRecord } from '../types.js'

export type PipelineDeps = {
  env: Env
  state: StateStore
  sepolia: SepoliaClient
  hedera: HederaClient
  ats: AtsClient
  mirror: MirrorNodeClient
  usdcEvmAddress: Address
  log: (msg: string) => void
}

/** A stage returns the fields it produced; the runner persists them with the stage marker. */
export type StageResult = Partial<InvoiceRecord>

export type StageFn = (rec: InvoiceRecord, deps: PipelineDeps) => Promise<StageResult>

/** Thrown when an invoice must not proceed — a business rule said no, not a transient fault. */
export class RejectInvoice extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'RejectInvoice'
  }
}
