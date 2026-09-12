#!/usr/bin/env bash
# Verify a deployed contract on Hedera testnet via Sourcify.
# Hedera has no Etherscan; HashScan reads verification from Sourcify.
#
#   bash verify.sh 0xYourContractAddress [ContractName]
set -euo pipefail
cd "$(dirname "$0")"

ADDR="${1:?usage: bash verify.sh <address> [ContractName]}"
NAME="${2:-InvoicePrimaryMarket}"
CHAIN=296

echo "verifying $NAME at $ADDR on Hedera testnet ($CHAIN) via Sourcify"
forge verify-contract "$ADDR" "src/${NAME}.sol:${NAME}" \
  --chain-id "$CHAIN" \
  --verifier sourcify \
  --verifier-url https://server-verify.hashscan.io \
  --watch

echo
echo "https://hashscan.io/testnet/contract/${ADDR}"
