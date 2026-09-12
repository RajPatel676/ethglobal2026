import { serve } from '@hono/node-server'
import type { Address } from 'viem'
import { RECEIVABLE_SEPOLIA, HEDERA_TESTNET, isUnset } from '@receivable/shared'
import { loadEnv } from './env.js'
import { StateStore } from './store/state.js'
import { SepoliaClient } from './clients/sepolia-client.js'
import { HederaClient } from './clients/hedera-client.js'
import { AtsClient } from './clients/ats-client.js'
import { MirrorNodeClient } from './clients/mirror-node.js'
import { InvoiceVerifiedListener } from './listeners/sepolia-invoice-verified.js'
import { createApi } from './api/kyc.js'
import type { PipelineDeps } from './pipeline/context.js'

const log = (msg: string) => console.log(`[adapter ${new Date().toISOString()}] ${msg}`)

async function main() {
  const env = loadEnv()

  // Fail at boot, not three stages in.
  if (isUnset(RECEIVABLE_SEPOLIA.verificationConsumer)) {
    throw new Error(
      'verificationConsumer is unset in contracts/sepolia/deployments/sepolia.json — ' +
        'run the Step 3b deploy scripts first (pnpm ens:check).',
    )
  }
  if (isUnset(RECEIVABLE_SEPOLIA.resolver)) {
    throw new Error('resolver is unset in contracts/sepolia/deployments/sepolia.json')
  }

  const state = new StateStore(env.ADAPTER_STATE_DIR)
  const sepolia = new SepoliaClient(env, RECEIVABLE_SEPOLIA.resolver as Address)
  const hedera = new HederaClient(env)
  const ats = new AtsClient(hedera)
  const mirror = new MirrorNodeClient(env.HEDERA_MIRROR)

  const deps: PipelineDeps = {
    env,
    state,
    sepolia,
    hedera,
    ats,
    mirror,
    usdcEvmAddress: HederaClient.entityToEvmAddress(HEDERA_TESTNET.usdcTokenId),
    log,
  }

  log(`sepolia signer   ${sepolia.address}`)
  log(`hedera account   ${env.HEDERA_ADAPTER_ACCOUNT_ID} (evm ${hedera.evmAddress})`)
  log(`hcs topic        ${env.HCS_REGISTRY_TOPIC_ID}`)
  log(`usdc (evm)       ${deps.usdcEvmAddress}`)
  log(`tracking         ${state.all().length} invoice(s)`)

  const listener = new InvoiceVerifiedListener(deps, RECEIVABLE_SEPOLIA.verificationConsumer as Address)

  const server = serve({ fetch: createApi(deps).fetch, port: env.ADAPTER_PORT }, () =>
    log(`api on :${env.ADAPTER_PORT}`),
  )

  const shutdown = () => {
    log('shutting down')
    listener.stop()
    server.close()
    hedera.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  await listener.start()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
