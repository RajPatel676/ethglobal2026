import { keccak256, toHex } from 'viem'

/**
 * Canonical invoice fingerprint used by BOTH the TEE handler and the HCS registry check.
 * Any lender computing the same hash from the same invoice will detect double financing.
 * Mirror in services/cre/verify-invoice/lib/encode.ts — keep byte-identical.
 */
export function invoiceHash(input: {
  businessLabel: string
  number: string
  amountCents: number | bigint
  dueDate: number | bigint
  debtorId: string
}): `0x${string}` {
  const canonical = [
    input.businessLabel,
    input.number,
    String(input.amountCents),
    String(input.dueDate),
    input.debtorId,
  ].join('|')
  return keccak256(toHex(canonical))
}
