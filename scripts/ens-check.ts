/**
 * Preflight for the Sepolia deploy scripts.
 *
 * contracts/sepolia/deployments/sepolia.json ships with every ENS address blank on purpose: the
 * ENSv2 beta is still rolling and the published addresses change. This refuses to let you run a
 * forge script (or the CRE simulator) against a half-filled file, which otherwise fails deep
 * inside a revert with no useful message.
 *
 *   pnpm ens:check            # what is still missing
 *   pnpm ens:check --step 3   # only what step 3 needs
 */
import { readFileSync } from 'node:fs'

const PATH = 'contracts/sepolia/deployments/sepolia.json'
const ZERO = '0x0000000000000000000000000000000000000000'

type Group = { key: string; label: string; neededBy: number; source: string }

/** Where each address comes from and the earliest script that dereferences it. */
const REQUIRED: Group[] = [
  { key: 'ens.ethRegistrar', label: 'ETHRegistrar', neededBy: 1, source: 'ENS docs' },
  { key: 'ens.mockUsdc', label: 'MockUSDC', neededBy: 1, source: 'ENS docs' },
  { key: 'ens.verifiableFactory', label: 'VerifiableFactory', neededBy: 2, source: 'ENS docs' },
  { key: 'ens.userRegistryImpl', label: 'UserRegistry impl', neededBy: 2, source: 'ENS docs' },
  { key: 'ens.permissionedResolverImpl', label: 'PermissionedResolver impl', neededBy: 2, source: 'ENS docs' },
  { key: 'receivable.rootSubregistry', label: 'rootSubregistry', neededBy: 3, source: 'written by script 02' },
  { key: 'receivable.resolver', label: 'resolver', neededBy: 3, source: 'written by script 02' },
  { key: 'receivable.forwarder', label: 'KeystoneForwarder', neededBy: 3, source: 'chainlink.ts' },
  { key: 'ens.ethRegistry', label: 'ETHRegistry', neededBy: 4, source: 'ENS docs' },
  { key: 'receivable.verificationConsumer', label: 'VerificationConsumer', neededBy: 4, source: 'written by script 03' },
  { key: 'ens.universalResolver', label: 'UniversalResolverV2', neededBy: 5, source: 'ENS docs' },
]

const stepArg = process.argv.indexOf('--step')
const maxStep = stepArg !== -1 ? Number(process.argv[stepArg + 1]) : Infinity

const json = JSON.parse(readFileSync(PATH, 'utf8')) as Record<string, Record<string, string>>
const read = (key: string) => {
  const [a, b] = key.split('.') as [string, string]
  return json[a]?.[b] ?? ''
}
const unset = (v: string) => v === '' || v === ZERO

const inScope = REQUIRED.filter((g) => g.neededBy <= maxStep)
const missing = inScope.filter((g) => unset(read(g.key)))

for (const g of inScope) {
  const v = read(g.key)
  console.log(`${unset(v) ? '✗' : '✓'} step ${g.neededBy}  ${g.label.padEnd(28)} ${unset(v) ? `— ${g.source}` : v}`)
}

if (missing.length === 0) {
  console.log(`\nAll ${inScope.length} addresses set. Safe to run the deploy scripts.`)
  process.exit(0)
}

const fromDocs = missing.filter((g) => g.source === 'ENS docs')
console.error(`\n${missing.length} address(es) still unset in ${PATH}.`)
if (fromDocs.length > 0) {
  console.error(
    `\nFill these from https://docs.ens.domains/learn/deployments (Sepolia ENSv2 beta):\n` +
      fromDocs.map((g) => `  ${g.key}  (${g.label})`).join('\n'),
  )
}
const fromScripts = missing.filter((g) => g.source !== 'ENS docs')
if (fromScripts.length > 0) {
  console.error(
    `\nThese are produced by earlier steps — run them in order:\n` +
      fromScripts.map((g) => `  ${g.key}  (${g.source})`).join('\n'),
  )
}
process.exit(1)
