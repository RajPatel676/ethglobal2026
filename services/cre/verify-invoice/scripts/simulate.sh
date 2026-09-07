#!/usr/bin/env bash
# Runs the confidential workflow in the CRE simulator and archives the log as prize evidence.
# Usage: bash simulate.sh [--broadcast]     (run from services/cre)
set -euo pipefail
cd "$(dirname "$0")/../.."
EVID="../../docs/evidence"; mkdir -p "$EVID"
STAMP=$(date +%Y%m%d-%H%M%S)
LOG="$EVID/cre-simulation-$STAMP.log"

echo "cre version: $(cre version 2>/dev/null || echo unknown)" | tee "$LOG"
cre workflow simulate verify-invoice \
  --target staging-settings \
  --non-interactive \
  --trigger-index 0 \
  --http-payload @./verify-invoice/http_trigger_payload.json \
  "${@}" 2>&1 | tee -a "$LOG"

echo
echo "saved → $LOG"
echo "look for: 'Trigger requested TEE Execution … AWS Nitro in us-west-2' and 'Write report transaction succeeded: 0x…'"
