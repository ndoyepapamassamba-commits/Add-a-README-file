#!/usr/bin/env bash
# Vérification « comme dans Microsoft 365 » de livrables Office (xlsx, docx, pptx) :
#  1. validation par le SDK Open XML officiel de Microsoft (les mêmes règles de schéma qu'Office 2016+/365) ;
#  2. contrôle sémantique Excel (styles, formules, plages, liens internes) ;
#  3. rendu visuel page par page (LibreOffice → PDF → PNG) pour l'inspection humaine ou par vision.
# Usage : verify.sh fichier1.xlsx [fichier2.docx …]   (sorties dans $M365_OUT, par défaut /tmp/m365-verif)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${M365_OUT:-/tmp/m365-verif}"
DOTNET_DIR="${M365_DOTNET:-/tmp/m365-dotnet}"
mkdir -p "$OUT"
if ! command -v dotnet >/dev/null 2>&1 && [ ! -x "$DOTNET_DIR/dotnet" ]; then
  echo "· installation du SDK .NET 8 (une fois, ≈ 200 Mo) dans $DOTNET_DIR"
  curl -sSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
  bash /tmp/dotnet-install.sh --channel 8.0 --install-dir "$DOTNET_DIR" >/dev/null
fi
DOTNET="$(command -v dotnet || echo "$DOTNET_DIR/dotnet")"
export DOTNET_ROOT="$(dirname "$DOTNET")" DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
VAL="$OUT/validator/out/oxv.dll"
if [ ! -f "$VAL" ]; then
  echo "· compilation du validateur Open XML"
  mkdir -p "$OUT/validator" && cp "$HERE/validator/"* "$OUT/validator/"
  (cd "$OUT/validator" && "$DOTNET" publish -c Release -o out >/dev/null)
fi
echo "== 1. Validation Open XML (Microsoft) =="
"$DOTNET" "$VAL" "$@"
for f in "$@"; do
  case "$f" in
    *.xlsx)
      echo "== 2. Contrôle sémantique Excel : $(basename "$f") =="
      python3 "$HERE/xlsx_semantic_check.py" "$f"
      echo "== 3. Rendu par feuille =="
      python3 "$HERE/xlsx_preview.py" "$f" "$OUT/previews" "$(basename "${f%.*}")" 70 ;;
    *.docx|*.pptx)
      echo "== 3. Rendu par page / diapositive : $(basename "$f") =="
      soffice --headless --norestore "-env:UserInstallation=file://${M365_LO_PROFILE:-/tmp/m365-lo-profile}" --convert-to pdf --outdir "$OUT/previews" "$f" >/dev/null 2>&1
      pdftoppm -r 60 -png "$OUT/previews/$(basename "${f%.*}").pdf" "$OUT/previews/$(basename "${f%.*}")-p" ;;
  esac
done
echo "Aperçus : $OUT/previews"
