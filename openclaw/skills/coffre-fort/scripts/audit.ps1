<# Audit de sécurité d'un projet sous Windows : secrets, .gitignore, coffre, garde-fou Git.
   .\audit.ps1 C:\chemin\du\projet #>
param([string]$Root = ".")
$here = Split-Path -Parent $PSCommandPath; $ok = $true
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }   # compatible Windows PowerShell 5.1
if (-not $py) { $py = Get-Command python3 -ErrorAction SilentlyContinue }
Write-Host "== Secrets (fichiers + historique Git)"
if ($py) { & $py.Source "$here\scan_secrets.py" $Root --git-history; if ($LASTEXITCODE -ne 0) { $ok = $false } }
else { Write-Host "⚠  Python absent : installez-le (winget install Python.Python.3.12) pour le scanner de secrets"; $ok = $false }
Write-Host "`n== .gitignore"
if (Test-Path (Join-Path $Root ".git")) {
  foreach ($p in ".env", "secret.pem", "cle.key", "output/x", "state/tiktok_tokens.json") {
    git -C $Root check-ignore -q --no-index $p 2>$null; if ($LASTEXITCODE -ne 0) { Write-Host "⚠  « $p » n'est pas ignoré par Git"; $ok = $false } }
  $hook = Join-Path $Root ".git\hooks\pre-commit"
  if ((Test-Path $hook) -and (Select-String -Quiet -Path $hook -Pattern "coffre-fort")) { Write-Host "Garde-fou de commit : actif" }
  else { Write-Host "⚠  Garde-fou de commit absent : powershell -File $here\install_hook.ps1 $Root"; $ok = $false }
}
Write-Host "`n== Coffre"
$d = if ($env:COFFRE_FORT_DIR) { $env:COFFRE_FORT_DIR } else { Join-Path $HOME ".coffre-fort" }
if (Test-Path "$d\secrets") { Write-Host "Coffre présent ($((Get-ChildItem "$d\secrets" -Filter *.sec).Count) secret(s))" }
else { Write-Host "Pas de coffre : powershell -File $here\vault.ps1 init" }
Write-Host ""; if ($ok) { Write-Host "Audit : rien de bloquant." } else { Write-Host "Audit : à corriger (voir ⚠)."; exit 1 }
