import {
  cre, ok, text, decodeJson, hexToBase64, bytesToHex, TxStatus,
  type EVMClient, type HTTPPayload, type TeeRuntime,
} from '@chainlink/cre-sdk'
import { encodeReport, invoiceHash } from '../lib/encode'
import { discountBps, riskScore } from '../lib/scoring'
import type { Config } from '../workflow'

type TriggerBody = { businessLabel: string; invoiceId: string; asOf: number }

type AccountingInvoice = {
  id: string; number: string; businessLabel: string; debtorId: string
  amountCents: number; dueDate: number; status: string
  debtor: { onTimeRatio: number; avgDaysLate: number }
}

/**
 * CONFIDENTIAL TEE HANDLER — everything up to `usingTheDons()` executes inside an AWS Nitro enclave.
 *
 * Sensitive material that never leaves the enclave:
 *   1. the SMB's accounting OAuth token   (runtime.getSecret)
 *   2. the full invoice + debtor payment history (confidential HTTP response)
 *   3. the risk-scoring inputs
 * Only { businessLabel, invoiceLabel, invoiceHash, faceValueCents, dueDate, riskScore, discountBps }
 * is handed to the DON, signed, and written to VerificationConsumer on Sepolia.
 *
 * Rules: deterministic (asOf comes from the trigger, no Date.now), ≤5 HTTP calls, ≤5 secret fetches,
 * no runtime.log of secret material.
 */
export function verifyInvoice(rt: TeeRuntime<Config>, payload: HTTPPayload, evm: EVMClient) {
  const body = decodeJson(payload.input) as TriggerBody
  if (!/^[a-z0-9-]+$/.test(body.businessLabel) || !/^[0-9a-z-]+$/i.test(body.invoiceId)) {
    throw new Error('invalid trigger payload')
  }

  // ---- 1. secret, inside the enclave ----
  const token = rt.getSecret({ id: rt.config.secretId }).result().value

  // ---- 2. confidential API fetch ----
  const res = new cre.capabilities.HTTPClient()
    .sendRequest(rt, {
      url: `${rt.config.accountingApiUrl}/${body.invoiceId}`,
      method: 'GET',
      multiHeaders: { Authorization: { values: [`Bearer ${token}`] } },
    })
    .result()
  if (!ok(res)) throw new Error(`accounting api returned ${res.statusCode}`)
  const inv = JSON.parse(text(res)) as AccountingInvoice

  // ---- 3. verification rules ----
  if (inv.businessLabel !== body.businessLabel) throw new Error('invoice does not belong to business')
  if (inv.status !== 'AUTHORISED') throw new Error(`invoice not financeable: status=${inv.status}`)
  if (inv.dueDate <= body.asOf) throw new Error('invoice is overdue')
  if (inv.amountCents <= 0) throw new Error('invoice has no value')

  const score = riskScore(inv.debtor)
  const bps = discountBps(score)
  if (score < 40) throw new Error(`debtor risk too high: score=${score}`)

  const report = {
    businessLabel: inv.businessLabel,
    invoiceLabel: `inv-${inv.id}`,
    invoiceHash: invoiceHash(inv),
    faceValueCents: BigInt(inv.amountCents),
    dueDate: BigInt(inv.dueDate),
    riskScore: score,
    discountBps: bps,
  }

  // ---- 4. leave the enclave: only the report crosses this line ----
  const don = rt.usingTheDons()
  const signed = don
    .report({
      encodedPayload: hexToBase64(encodeReport(report)),
      encoderName: 'evm',
      signingAlgo: 'ecdsa',
      hashingAlgo: 'keccak256',
    })
    .result()

  const target = rt.config.evms[0]
  const w = evm
    .writeReport(don, {
      receiver: target.consumerAddress,
      report: signed,
      gasConfig: { gasLimit: target.gasLimit },
    })
    .result()
  if (w.txStatus !== TxStatus.SUCCESS) throw new Error(w.errorMessage ?? `tx status ${w.txStatus}`)

  don.log(`verified ${report.invoiceLabel}.${report.businessLabel} score=${score} bps=${bps} tx=${bytesToHex(w.txHash!)}`)
  return {
    invoiceLabel: report.invoiceLabel,
    invoiceHash: report.invoiceHash,
    riskScore: score,
    discountBps: bps,
    txHash: bytesToHex(w.txHash!),
  }
}
