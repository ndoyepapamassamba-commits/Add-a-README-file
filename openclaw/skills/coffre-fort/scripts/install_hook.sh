#!/usr/bin/env bash
# Installe un garde-fou Git (pre-commit) qui refuse tout commit contenant un secret.
set -e
ROOT="$(cd "${1:-.}" && git rev-parse --show-toplevel)"; HERE="$(cd "$(dirname "$0")" && pwd)"
H="$ROOT/.git/hooks/pre-commit"
cat > "$H" <<HOOK
#!/usr/bin/env bash
# coffre-fort : bloque les commits contenant des secrets
python3 "$HERE/scan_secrets.py" "$ROOT" --staged >/tmp/coffre-fort-scan.txt 2>&1 || {
  cat /tmp/coffre-fort-scan.txt; echo "Commit refusé par coffre-fort : retirez le secret (ou ajoutez « coffre-fort: ignore » sur la ligne si c'est un faux positif)."; exit 1; }
HOOK
chmod +x "$H"; echo "Garde-fou installé : $H"
