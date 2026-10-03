<# Installe le garde-fou Git (pre-commit) qui refuse tout commit contenant un secret (Git pour Windows). #>
param([string]$Root = ".")
$here = (Split-Path -Parent $PSCommandPath) -replace '\\', '/'
$top = (git -C $Root rev-parse --show-toplevel).Trim()
$hook = Join-Path $top ".git/hooks/pre-commit"
@"
#!/bin/sh
# coffre-fort : bloque les commits contenant des secrets
PY=`$(command -v python || command -v py || command -v python3)
"`$PY" "$here/scan_secrets.py" "$top" --staged || { echo "Commit refusé par coffre-fort : retirez le secret."; exit 1; }
"@ | Set-Content -Path $hook -Encoding ascii -NoNewline
Write-Host "Garde-fou installé : $hook"
