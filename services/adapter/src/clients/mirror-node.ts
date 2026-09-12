import { RegistryEntrySchema, type RegistryEntry } from '../types.js'

/**
 * Read-only Hedera mirror node. No key, no cost.
 *
 * Used for the double-financing check: the HCS registry topic is the cross-lender record, and
 * the mirror node is how anyone reads it back. Consensus-node queries would cost HBAR per read;
 * mirror queries are free and lag by a second or two, which is fine for a guard that only needs
 * to catch an invoice financed minutes or days ago.
 */
export class MirrorNodeClient {
  constructor(private readonly baseUrl: string) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`)
    if (!res.ok) throw new Error(`mirror node ${path} -> ${res.status} ${res.statusText}`)
    return (await res.json()) as T
  }

  async accountBalance(accountId: string): Promise<{ hbar: number; tokens: Record<string, number> }> {
    const j = await this.get<{
      balance?: { balance?: number; tokens?: { token_id: string; balance: number }[] }
    }>(`/accounts/${accountId}`)
    const tokens: Record<string, number> = {}
    for (const t of j.balance?.tokens ?? []) tokens[t.token_id] = t.balance
    return { hbar: (j.balance?.balance ?? 0) / 1e8, tokens }
  }

  async isAssociated(accountId: string, tokenId: string): Promise<boolean> {
    const { tokens } = await this.accountBalance(accountId)
    return tokenId in tokens
  }

  /**
   * Every registry entry on the topic, oldest first.
   *
   * Pages through the mirror API — a topic that has been running a while will exceed one page,
   * and stopping at page 1 would silently miss older entries, which is the exact failure mode
   * that lets a double-financed invoice through.
   */
  async readRegistry(topicId: string, limit = 100): Promise<{ sequence: string; entry: RegistryEntry }[]> {
    const out: { sequence: string; entry: RegistryEntry }[] = []
    let path: string | null = `/topics/${topicId}/messages?limit=${limit}&order=asc`

    while (path) {
      const page: {
        messages?: { sequence_number: number; message: string }[]
        links?: { next?: string | null }
      } = await this.get(path)

      for (const m of page.messages ?? []) {
        let parsed: unknown
        try {
          parsed = JSON.parse(Buffer.from(m.message, 'base64').toString('utf8'))
        } catch {
          continue // not ours, or malformed — the topic is public and anyone can post
        }
        const result = RegistryEntrySchema.safeParse(parsed)
        if (result.success) out.push({ sequence: String(m.sequence_number), entry: result.data })
      }

      // `links.next` is a path relative to the API root, already including the query string.
      const next = page.links?.next
      path = next ? next.replace(/^\/api\/v1/, '') : null
    }
    return out
  }

  /** Sequence numbers of every prior financing of this invoice. Empty means it is safe. */
  async findFinancings(topicId: string, invoiceHash: string): Promise<string[]> {
    const target = invoiceHash.toLowerCase()
    const rows = await this.readRegistry(topicId)
    return rows.filter((r) => r.entry.invoiceHash.toLowerCase() === target).map((r) => r.sequence)
  }
}
