import {
  cre, EVMClient, getNetwork, HTTPCapability,
  type HTTPPayload, type TeeRuntime,
} from '@chainlink/cre-sdk'
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
 * ✅ Verified against @chainlink/cre-sdk 1.20.1: `handlerInTee` is typed over a generic
 * `Trigger<TRaw, TOut>`, so an HTTP trigger composes with it — no cron fallback needed.
 *
 * Why the regular HTTPClient and not ConfidentialHTTPClient inside the enclave:
 *   • `ClientCapability.sendRequest` (http-actions) has an explicit
 *     `NodeRuntime<unknown> | TeeRuntime<unknown>` overload — passing our TeeRuntime is what makes
 *     the fetch execute *inside* the enclave ("in-enclave capability calls").
 *   • `ConfidentialHTTPClient.sendRequest` accepts only `Runtime<unknown>`. Reaching it from here
 *     would mean `rt.usingTheDons()` first, which by definition routes the call back OUT of the
 *     TEE. That client is the answer for non-TEE workflows; inside a confidential handler it is
 *     strictly weaker.
 *   • Likewise `rt.getSecret()` on a TeeRuntime is decrypted in-enclave. The docs' warning about
 *     getSecret + plaintext headers applies to ConfidentialHTTP called from a regular DON handler,
 *     not to this path.
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
      (rt: TeeRuntime<Config>, payload: HTTPPayload) => verifyInvoice(rt, payload, evm),
      [{ tee: 'nitro', regions: ['us-west-2'] }],
    ),
  ]
}
