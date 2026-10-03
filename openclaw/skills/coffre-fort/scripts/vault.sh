#!/usr/bin/env bash
# Coffre chiffré (age) pour les secrets : jamais en clair sur le disque, jamais dans le chat.
#   vault.sh init | put NOM | get NOM | list | rm NOM | run -- commande… | lock-file F | unlock-file F.age
set -euo pipefail
umask 077
DIR="${COFFRE_FORT_DIR:-$HOME/.coffre-fort}"
KEY="$DIR/cle.age.txt"
need() { command -v "$1" >/dev/null || { echo "Installez $1" >&2; exit 2; }; }
need age
recip() { age-keygen -y "$KEY"; }
case "${1:-}" in
  init)
    mkdir -p "$DIR/secrets"; chmod 700 "$DIR" "$DIR/secrets"
    [ -f "$KEY" ] || age-keygen -o "$KEY" 2>/dev/null
    chmod 600 "$KEY"
    echo "Coffre prêt : $DIR (sauvegardez $KEY hors de cette machine, par ex. sur une clé USB)." ;;
  put)
    n="${2:?nom du secret}"; [[ "$n" =~ ^[A-Z0-9_]+$ ]] || { echo "Nom invalide" >&2; exit 2; }
    read -r -s -p "Valeur de $n (masquée) : " v; echo
    printf '%s' "$v" | age -r "$(recip)" -o "$DIR/secrets/$n.age"; unset v
    echo "$n enregistré (chiffré)." ;;
  get)   age -d -i "$KEY" "$DIR/secrets/${2:?nom}.age" ;;
  list)  ls "$DIR/secrets" 2>/dev/null | sed 's/\.age$//' ;;
  rm)    shred -u "$DIR/secrets/${2:?nom}.age" 2>/dev/null || rm -f "$DIR/secrets/$2.age"; echo "supprimé" ;;
  run)
    shift; [ "${1:-}" = "--" ] && shift
    for f in "$DIR"/secrets/*.age; do
      [ -e "$f" ] || continue
      n=$(basename "$f" .age); export "$n"="$(age -d -i "$KEY" "$f")"
    done
    exec "$@" ;;
  lock-file)
    f="${2:?fichier}"; age -r "$(recip)" -o "$f.age" "$f"
    shred -u "$f" 2>/dev/null || rm -f "$f"; echo "$f → $f.age (original effacé)" ;;
  unlock-file)
    f="${2:?fichier.age}"; age -d -i "$KEY" -o "${f%.age}" "$f"; chmod 600 "${f%.age}"; echo "${f%.age} déchiffré" ;;
  *) sed -n '2,3p' "$0"; exit 2 ;;
esac
