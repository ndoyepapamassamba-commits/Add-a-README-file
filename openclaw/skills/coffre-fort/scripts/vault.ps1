<#
Coffre chiffré pour Windows (DPAPI : chiffrement lié à votre compte Windows, rien à installer).
  .\vault.ps1 init
  .\vault.ps1 put HF_TOKEN            # saisie masquée
  .\vault.ps1 list                    # noms seulement
  .\vault.ps1 check HF_TOKEN          # longueur + 3 premiers caractères, jamais la valeur
  .\vault.ps1 rm HF_TOKEN
  .\vault.ps1 run -- python run.py …  # lance la commande avec les secrets en variables d'environnement
  .\vault.ps1 lock-file .env          # chiffre .env -> .env.dpapi et efface l'original
  .\vault.ps1 unlock-file .env.dpapi
#>
param([Parameter(Position = 0)][string]$Action, [Parameter(Position = 1, ValueFromRemainingArguments = $true)][string[]]$Rest)
$ErrorActionPreference = "Stop"
$Dir = if ($env:COFFRE_FORT_DIR) { $env:COFFRE_FORT_DIR } else { Join-Path $HOME ".coffre-fort" }
$Sec = Join-Path $Dir "secrets"
Add-Type -AssemblyName System.Security

function Get-Plain([string]$Name) {
    $f = Join-Path $Sec "$Name.sec"
    if (-not (Test-Path $f)) { throw "Secret inconnu : $Name" }
    $ss = Get-Content $f | ConvertTo-SecureString
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss))
}

switch ($Action) {
    "init" {
        New-Item -ItemType Directory -Force -Path $Sec | Out-Null
        icacls $Dir /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" | Out-Null   # vous seul
        Write-Host "Coffre prêt : $Dir (chiffré avec votre compte Windows ; illisible par un autre compte ou une autre machine)."
    }
    "put" {
        $n = $Rest[0]; if ($n -notmatch '^[A-Z0-9_]+$') { throw "Nom invalide (MAJUSCULES_ET_CHIFFRES)" }
        $ss = Read-Host -AsSecureString "Valeur de $n (masquée)"
        $ss | ConvertFrom-SecureString | Set-Content -Path (Join-Path $Sec "$n.sec")
        Write-Host "$n enregistré (chiffré)."
    }
    "list" { Get-ChildItem $Sec -Filter *.sec -ErrorAction SilentlyContinue | ForEach-Object { $_.BaseName } }
    "check" { $v = Get-Plain $Rest[0]; Write-Host "$($Rest[0]) : $($v.Substring(0, [Math]::Min(3, $v.Length)))… ($($v.Length) car.)"; $v = $null }
    "rm" { Remove-Item (Join-Path $Sec "$($Rest[0]).sec"); Write-Host "supprimé" }
    "run" {
        $cmd = @($Rest | Where-Object { $_ -ne "--" })
        Get-ChildItem $Sec -Filter *.sec | ForEach-Object { Set-Item -Path "env:$($_.BaseName)" -Value (Get-Plain $_.BaseName) }
        if ($cmd.Count -gt 1) { & $cmd[0] $cmd[1..($cmd.Count - 1)] } else { & $cmd[0] }
        Get-ChildItem $Sec -Filter *.sec | ForEach-Object { Remove-Item -Path "env:$($_.BaseName)" -ErrorAction SilentlyContinue }
    }
    "lock-file" {
        $f = (Resolve-Path $Rest[0]).Path
        $enc = [Security.Cryptography.ProtectedData]::Protect([IO.File]::ReadAllBytes($f), $null, "CurrentUser")
        [IO.File]::WriteAllBytes("$f.dpapi", $enc); Remove-Item $f
        Write-Host "$f -> $f.dpapi (original effacé)"
    }
    "unlock-file" {
        $f = (Resolve-Path $Rest[0]).Path; $out = $f -replace '\.dpapi$', ''
        [IO.File]::WriteAllBytes($out, [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($f), $null, "CurrentUser"))
        Write-Host "$out déchiffré"
    }
    default { Get-Help $PSCommandPath; exit 2 }
}
