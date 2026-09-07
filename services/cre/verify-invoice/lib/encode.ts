import { encodeAbiParameters, keccak256, parseAbiParameters, toHex } from 'viem'

/** MIRROR of packages/shared/src/schemas/report.ts — must stay byte-identical with ReportCodec.sol */
export const REPORT_ABI_PARAMS = parseAbiParameters(
  'string businessLabel, string invoiceLabel, bytes32 invoiceHash, uint256 faceValueCents, uint64 dueDate, uint16 riskScore, uint16 discountBps',
)

export type Report = {
  businessLabel: string
  invoiceLabel: string
  invoiceHash: `0x${string}`
  faceValueCents: bigint
  dueDate: bigint
  riskScore: number
  discountBps: number
}

export const encodeReport = (r: Report) =>
  encodeAbiParameters(REPORT_ABI_PARAMS, [
    r.businessLabel, r.invoiceLabel, r.invoiceHash, r.faceValueCents, r.dueDate, r.riskScore, r.discountBps,
  ])

/** MIRROR of packages/shared/src/utils/invoice-hash.ts */
export function invoiceHash(i: {
  businessLabel: string; number: string; amountCents: number; dueDate: number; debtorId: string
}): `0x${string}` {
  return keccak256(toHex([i.businessLabel, i.number, String(i.amountCents), String(i.dueDate), i.debtorId].join('|')))
}
