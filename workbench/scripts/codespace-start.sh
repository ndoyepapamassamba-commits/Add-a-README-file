#!/usr/bin/env bash
# Starts the agent inside GitHub Codespaces and prints the ready-to-open link.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data
# A fixed access token is required when listening on 0.0.0.0; keep it across restarts.
if [ -z "${WORKBENCH_AUTH_TOKEN:-}" ]; then
  [ -s data/.workbench-token ] || node -e "process.stdout.write(require('crypto').randomBytes(24).toString('hex'))" > data/.workbench-token
  WORKBENCH_AUTH_TOKEN="$(cat data/.workbench-token)"
  export WORKBENCH_AUTH_TOKEN
fi
chmod 600 data/.workbench-token 2>/dev/null || true
[ -f dist/server/index.js ] || npm run build
if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "⚠  OPENROUTER_API_KEY n'est pas défini : ajoutez-le dans les secrets Codespaces (ou dans l'interface : Réglages › Fournisseurs IA)."
fi
# The server prints the ready-to-open link ("Interface") once it is listening.
exec node --disable-warning=ExperimentalWarning dist/server/index.js
