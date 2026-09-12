import { namehash as viemNamehash, labelhash as viemLabelhash, stringToBytes, toHex } from 'viem'
import { normalize } from 'viem/ens'

export const namehash = (name: string) => viemNamehash(normalize(name))
export const labelhash = (label: string) => viemLabelhash(normalize(label))

/** DNS wire-format encoding (ENSIP-10), needed by PermissionedResolver.authorizeTextRoles. */
export function dnsEncode(name: string): `0x${string}` {
  const parts = normalize(name).split('.')
  const bytes: number[] = []
  for (const p of parts) {
    const b = stringToBytes(p)
    if (b.length > 255) throw new Error(`label too long: ${p}`)
    bytes.push(b.length, ...b)
  }
  bytes.push(0)
  return toHex(new Uint8Array(bytes))
}
