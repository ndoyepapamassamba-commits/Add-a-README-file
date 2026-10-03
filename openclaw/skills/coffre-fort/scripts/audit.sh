#!/usr/bin/env bash
# Audit de sécurité d'un projet : secrets, fichiers sensibles, droits, .gitignore, coffre.
ROOT="${1:-.}"; HERE="$(cd "$(dirname "$0")" && pwd)"; ok=0
echo "== Secrets dans les fichiers et l'historique Git"
python3 "$HERE/scan_secrets.py" "$ROOT" --git-history || ok=1
echo; echo "== .gitignore"
for p in .env "*.pem" "*.key" "output/" "state/tiktok_tokens.json"; do
  if [ -d "$ROOT/.git" ] && ! git -C "$ROOT" check-ignore -q --no-index "$p" 2>/dev/null; then
    echo "⚠  « $p » n'est pas ignoré par Git"; ok=1; fi
done
echo; echo "== Droits des fichiers sensibles"
find "$ROOT" -path "$ROOT/.git" -prune -o \( \( -name ".env*" ! -name "*.example" \) -o -name "*.pem" -o -name "*.key" -o -name "*tokens*.json" \) \
  -type f -print 2>/dev/null | while read -r f; do
  m=$(stat -c %a "$f" 2>/dev/null || stat -f %Lp "$f"); [ "$m" != "600" ] && echo "⚠  $f en $m (conseillé : chmod 600)"
done
echo; echo "== Coffre"
D="${COFFRE_FORT_DIR:-$HOME/.coffre-fort}"
[ -f "$D/cle.age.txt" ] && echo "Coffre présent ($(ls "$D/secrets" 2>/dev/null | wc -l) secret(s))" || echo "Pas de coffre : bash $HERE/vault.sh init"
[ -d "$ROOT/.git" ] && { [ -x "$ROOT/.git/hooks/pre-commit" ] && grep -q coffre-fort "$ROOT/.git/hooks/pre-commit" \
  && echo "Garde-fou de commit : actif" || echo "⚠  Garde-fou de commit absent : bash $HERE/install_hook.sh $ROOT"; }
echo; [ $ok = 0 ] && echo "Audit : rien de bloquant." || echo "Audit : à corriger (voir ⚠)."
exit $ok
