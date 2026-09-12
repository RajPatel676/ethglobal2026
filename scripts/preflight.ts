/**
 * Credentials preflight. Reads .env, derives addresses (never prints keys), and checks live
 * balances on Sepolia + Hedera testnet so you know what is actually ready before running anything.
 *
 *   pnpm preflight
 *
 * Read-only. Makes no transactions and needs no funds to run.
 */
import { readFileSync, existsSync } from 'node:fs'
import { privateKeyToAccount } from 'viem/accounts'

const ENV = '.env'
const RED = '\x1b[31m', GRN = '\x1b[32m', YEL = '\x1b[33m', DIM = '\x1b[2m', OFF = '\x1b[0m'

if (!existsSync(ENV)) {
  console.error(`${RED}No .env found.${OFF} Start with:  cp .env.example .env`)
  process.exit(1)
}

const env: Record<string, string> = {}
for (const line of readFileSync(ENV, 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
  if (m) env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '')
}

const SEPOLIA = env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'
const MIRROR = env.HEDERA_MIRROR || 'https://testnet.mirrornode.hedera.com/api/v1'
const MOCK_USDC = '0x768F42455A2D082E23ceeF7d51e5787C82d67a39'
const REGISTER_COST = 8_000_021n // getRegisterPrice("receivable", 365d) at 6 decimals

let blocking = 0
const ok = (m: string) => console.log(`${GRN}✓${OFF} ${m}`)
const warn = (m: string) => console.log(`${YEL}!${OFF} ${m}`)
const bad = (m: string) => { console.log(`${RED}✗${OFF} ${m}`); blocking++ }

const isSet = (v?: string) => !!v && v !== '0x' && !v.startsWith('change-me') && v !== '0.0.'

async function rpc(method: string, params: unknown[]): Promise<string> {
  const r = await fetch(SEPOLIA, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const j = (await r.json()) as { result?: string; error?: { message: string } }
  if (j.error) throw new Error(j.error.message)
  return j.result ?? '0x0'
}

const eth = (wei: bigint) => `${(Number(wei) / 1e18).toFixed(4)} ETH`
const usdc = (u: bigint) => `${(Number(u) / 1e6).toFixed(2)} USDC`

function addressOf(key: string): `0x${string}` | null {
  try {
    return privateKeyToAccount(key as `0x${string}`).address
  } catch {
    return null
  }
}

async function checkSepoliaKey(name: string, minEth: number, note: string) {
  const raw = env[name]
  if (!isSet(raw)) { bad(`${name} unset — ${note}`); return null }
  const addr = addressOf(raw!)
  if (!addr) { bad(`${name} is not a valid 32-byte hex private key`); return null }
  const bal = BigInt(await rpc('eth_getBalance', [addr, 'latest']))
  const line = `${name}  ${addr}  ${eth(bal)}`
  if (bal === 0n) bad(`${line}  — needs ~${minEth} ETH, use a Sepolia faucet`)
  else if (Number(bal) / 1e18 < minEth) warn(`${line}  — thin, want ~${minEth} ETH`)
  else ok(line)
  return addr
}

async function erc20Balance(token: string, owner: string): Promise<bigint> {
  const data = `0x70a08231${owner.slice(2).padStart(64, '0')}`
  return BigInt(await rpc('eth_call', [{ to: token, data }, 'latest']))
}

async function hedera(name: string, idKey: string, minHbar: number) {
  const id = env[idKey]
  if (!isSet(id)) { bad(`${idKey} unset — create it at https://portal.hedera.com`); return }
  try {
    const r = await fetch(`${MIRROR}/accounts/${id}`)
    if (!r.ok) { bad(`${name} ${id} not found on Hedera testnet mirror node`); return }
    const j = (await r.json()) as {
      balance?: { balance?: number; tokens?: { token_id: string; balance: number }[] }
    }
    const hbar = (j.balance?.balance ?? 0) / 1e8
    const usdcTok = j.balance?.tokens?.find((t) => t.token_id === '0.0.429274')
    const usdcBal = (usdcTok?.balance ?? 0) / 1e6
    const assoc = usdcTok ? `${usdcBal.toFixed(2)} USDC` : `${YEL}USDC not associated${OFF}`
    const line = `${name}  ${id}  ${hbar.toFixed(2)} HBAR  ${assoc}`
    if (hbar < minHbar) warn(`${line}  — want ~${minHbar} HBAR`)
    else ok(line)
  } catch (e) {
    warn(`${name} ${id} — mirror node unreachable (${(e as Error).message})`)
  }
}

async function main() {
  console.log(`\n${DIM}── Sepolia ──${OFF}`)
  const deployer = await checkSepoliaKey('DEPLOYER_PRIVATE_KEY', 0.05, 'owns receivable.eth, deploys everything')
  await checkSepoliaKey('ADAPTER_SEPOLIA_PRIVATE_KEY', 0.02, 'Hedera adapter writes ats-token / hcs-seq / status')
  await checkSepoliaKey('TRIGGER_SIGNER_PRIVATE_KEY', 0.0, 'signs CRE HTTP trigger requests (no gas needed)')

  if (deployer) {
    const bal = await erc20Balance(MOCK_USDC, deployer)
    const line = `MockUSDC balance  ${usdc(bal)}  (registration costs ${usdc(REGISTER_COST)})`
    if (bal < REGISTER_COST) {
      bad(`${line}\n    mint it free:  cast send ${MOCK_USDC} "mint(address,uint256)" ${deployer} 20000000 \\\n                     --rpc-url ${SEPOLIA} --private-key $DEPLOYER_PRIVATE_KEY`)
    } else ok(line)
  }

  console.log(`\n${DIM}── Hedera testnet ──${OFF}`)
  await hedera('adapter', 'HEDERA_ADAPTER_ACCOUNT_ID', 20)
  await hedera('escrow ', 'HEDERA_ESCROW_ACCOUNT_ID', 20)

  console.log(`\n${DIM}── Secrets & config ──${OFF}`)
  for (const [k, why] of [
    ['MOCK_ACCOUNTING_TOKEN', 'stands in for the SMB OAuth token'],
    ['NEXT_PUBLIC_PRIVY_APP_ID', 'web login (Step 5)'],
  ] as const) {
    isSet(env[k]) ? ok(k) : warn(`${k} unset — ${why}`)
  }
  isSet(env.ENS_REGISTRATION_SECRET)
    ? ok('ENS_REGISTRATION_SECRET')
    : bad('ENS_REGISTRATION_SECRET unset/placeholder — commit-reveal salt, front-runnable if guessable.\n    Generate one:  openssl rand -hex 32')

  console.log(
    blocking === 0
      ? `\n${GRN}Ready.${OFF} Next:  pnpm ens:check --step 1  &&  see contracts/sepolia/script/README.md\n`
      : `\n${RED}${blocking} blocking item(s).${OFF} See docs/SETUP.md.\n`,
  )
  process.exit(blocking === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
