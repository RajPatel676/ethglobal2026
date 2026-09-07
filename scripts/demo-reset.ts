/** Wipes the adapter's local processed-invoice index so the demo can be re-recorded from scratch.
 *  On-chain state (ENS names, HCS messages, bonds) is immutable — use a fresh invoice id instead. */
import { rmSync, existsSync } from 'node:fs'
const p = 'services/adapter/state'
if (existsSync(p)) { rmSync(p, { recursive: true }); console.log('adapter state cleared') } else console.log('nothing to clear')
