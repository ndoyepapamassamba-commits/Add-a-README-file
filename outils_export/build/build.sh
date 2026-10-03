#!/bin/sh
# Reconstruit l'application APEX à partir de la base APEX 35 (historique git) et des sources de ce dossier.
# Usage : sh outils_export/build/build.sh [dossier_de_travail] [fichier_de_sortie.html]
# Reproductible : même empreinte SHA-1 que l'APEX livré quand les sources ne changent pas.
set -e
ICI=$(cd "$(dirname "$0")" && pwd)
RACINE=$(cd "$ICI/../.." && pwd)
W=${1:-/tmp/apex_build}
SORTIE=${2:-$W/apex.html}
mkdir -p "$W"
cp "$ICI"/*.py "$ICI"/*.js "$ICI"/*.css "$W"/
cd "$W"
cp ri_writer_v1.js ri_writer.js
cp ri_docs_base.js ri_docs.js
cp pm_blue_base.js pm_blue.js
[ -f apex35.html ] || git -C "$RACINE" show 3c018ee:ECOBANK_Credit_Risk_OS_APEX_35.html > apex35.html
python3 ri_master.py
python3 ri_3d.py
python3 ri_img.py
python3 ri_ts.py
ART="$RACINE/typesafe-reporting/sortie" python3 inject_ri.py
cp apex36.html "$SORTIE"
echo "→ $SORTIE ($(sha1sum "$SORTIE" | cut -c1-12))"
