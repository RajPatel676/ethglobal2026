import { cre, EVMClient, getNetwork, HTTPCapability } from '@chainlink/cre-sdk'
import { z } from 'zod'
import { verifyInvoice } from './handlers/verify-invoice'

export const configSchema = z.object({
  accountingApiUrl: z.string().url(),
  secretId: z.string(),
  /** EVM address whose signature authorises HTTP-trigger calls (web app's server-side signer) */
  authorizedEVMAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  evms: z
    .array(z.object({ chainSelectorName: z.string(), consumerAddress: z.string(), gasLimit: z.string() }))
    .min(1),
})
export type Config = z.infer<typeof configSchema>

/**
 * HTTP trigger → confidential TEE handler → DON-signed report → EVM write (Sepolia).
 * The official confidential templates are cron-driven; this is request-driven so an SMB action
 * kicks off exactly one verification.
 *
 * ⚠️ Day-1 check: if the simulator rejects http.trigger + handlerInTee, switch to a cron trigger
 * that polls `${accountingApiUrl}/pending` — every prize requirement is still satisfied.
 */
export function initWorkflow(config: Config) {
  const target = config.evms[0]!
  const network = getNetwork({
    chainFamily: 'evm',
    chainSelectorName: target.chainSelectorName,
    isTestnet: true,
  })
  if (!network) throw new Error(`unknown network ${target.chainSelectorName}`)

  const evm = new EVMClient(network.chainSelector.selector)
  const http = new HTTPCapability()

  return [
    cre.handlerInTee(
      http.trigger({
        authorizedKeys: [{ type: 'KEY_TYPE_ECDSA_EVM', publicKey: config.authorizedEVMAddress }],
      }),
      (rt, payload) => verifyInvoice(rt, payload, evm),
      [{ tee: 'nitro', regions: ['us-west-2'] }],
    ),
  ]
}
