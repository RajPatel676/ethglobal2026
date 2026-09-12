import { getCreateAddress, type Address } from 'viem'
import { invoicePrimaryMarketAbi } from '@receivable/shared'
import type { StageFn } from './context.js'
import { unitsFromCents } from '../types.js'

/**
 * Deploy the invoice's primary market and move the bond units into it.
 *
 * The market is deployed with the adapter as `operator` and the business wallet as `smbPayout`,
 * so investor cash goes straight to the SMB and never touches this service's keys.
 *
 * Bytecode is read from the Foundry build output rather than embedded, so the deployed contract
 * is always the one in contracts/hedera/src — run `forge build` there first.
 */
export const deployMarket: StageFn = async (rec, deps) => {
  const { hedera, ats, env, usdcEvmAddress, log } = deps
  const bond = rec.atsTokenAddress as Address | undefined
  if (!bond) throw new Error('create-bond must run before deploy-market')

  const units = unitsFromCents(BigInt(rec.faceValueCents))
  const smbPayout = await resolveSmbPayout(rec.businessLabel)
  const fundingDeadline = BigInt(
    Math.floor(Date.now() / 1000) + env.FUNDING_WINDOW_DAYS * 24 * 3600,
  )

  if (fundingDeadline >= BigInt(rec.dueDate)) {
    throw new Error(
      `funding window (${env.FUNDING_WINDOW_DAYS}d) ends after the invoice is due — ` +
        `shorten FUNDING_WINDOW_DAYS or skip this invoice`,
    )
  }

  const { abi, bytecode } = await loadMarketArtifact()

  const hash = await hedera.walletClient.deployContract({
    abi,
    bytecode,
    args: [
      usdcEvmAddress,
      bond,
      `0x${'0'.repeat(63)}1`, // ATS DEFAULT_PARTITION
      smbPayout,
      hedera.evmAddress, // operator
      rec.invoiceHash as `0x${string}`,
      units,
      rec.discountBps,
      BigInt(rec.dueDate),
      fundingDeadline,
    ],
  })
  const receipt = await hedera.publicClient.waitForTransactionReceipt({ hash })
  const market = receipt.contractAddress ?? getCreateAddress({ from: hedera.evmAddress, nonce: 0n })
  log(`deployed InvoicePrimaryMarket ${market} for ${rec.ensName}`)

  // Hand the units over so investors can actually be paid out of the market.
  await ats.transferUnits(bond, market, units)
  log(`transferred ${units} units to the market`)

  return { marketAddress: market }
}

/** Where the invoice's cash goes. Set per business; the demo uses one wallet. */
async function resolveSmbPayout(businessLabel: string): Promise<Address> {
  const specific = process.env[`SMB_PAYOUT_${businessLabel.toUpperCase().replace(/-/g, '_')}`]
  const fallback = process.env.SMB_PAYOUT_ADDRESS
  const addr = specific ?? fallback
  if (!addr) {
    throw new Error(
      `no payout address for "${businessLabel}" — set SMB_PAYOUT_ADDRESS or ` +
        `SMB_PAYOUT_${businessLabel.toUpperCase().replace(/-/g, '_')}`,
    )
  }
  return addr as Address
}

/**
 * Read the compiled market from contracts/hedera/out.
 * Deliberately not a checked-in bytecode blob: a stale blob would deploy a contract that no
 * longer matches the source anyone reviews.
 */
async function loadMarketArtifact() {
  const { readFile } = await import('node:fs/promises')
  const path = 'contracts/hedera/out/InvoicePrimaryMarket.sol/InvoicePrimaryMarket.json'
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    throw new Error(`${path} not found — run \`forge build\` in contracts/hedera first`)
  }
  const artifact = JSON.parse(raw) as { abi: unknown; bytecode: { object: `0x${string}` } }
  void invoicePrimaryMarketAbi // the shared ABI is the read-only view; deployment needs the full one
  return { abi: artifact.abi as never, bytecode: artifact.bytecode.object }
}
