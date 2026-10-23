#!/bin/sh
# Pont local MASSAMBA (macOS : double-clic ; Linux : sh lancer-le-pont.command [dossier]).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js n'est pas installé : installez la version LTS (22 ou plus) depuis https://nodejs.org/fr/download"
  (open https://nodejs.org/fr/download 2>/dev/null || xdg-open https://nodejs.org/fr/download 2>/dev/null) &
  exit 1
fi
exec node massamba-pont.mjs "$@"
