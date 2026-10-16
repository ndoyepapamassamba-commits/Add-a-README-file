#!/usr/bin/env bash
# recuperer.sh : récupère le code des moteurs « à dupliquer » listés dans moteurs.json,
# chacun à son commit épinglé, par clone superficiel dans vendor/src/<nom>.
#
# Usage :
#   bash recuperer.sh               récupère tous les dépôts « à dupliquer »
#   bash recuperer.sh --liste       affiche la liste (aucun téléchargement)
#   bash recuperer.sh --seul NOM    récupère un seul dépôt (NOM = champ "nom" de moteurs.json)
#   bash recuperer.sh --aide        affiche cette aide
#
# Variable facultative : MOTEURS_SRC=/autre/dossier pour cloner ailleurs que vendor/src
# (par exemple /kaggle/working/src sur Kaggle).
#
# Garanties :
#   - aucun poids hors des dépôts git : aucun appel à Hugging Face ou ModelScope,
#     GIT_LFS_SKIP_SMUDGE=1. Attention, quelques dépôts commitent des fichiers de modèle :
#     VBench (best.onnx de NudeNet, 12 Mo, AGPL), SeedVR2 (pos_emb.pt, neg_emb.pt),
#     ComfyUI-WanVideoWrapper (deux ONNX de visage, encoded_silence.safetensors) ;
#   - aucune exécution du code récupéré (ni build, ni pip, ni hook git) ;
#   - sous-modules non récupérés (la commande est affichée quand un dépôt en a) ;
#   - variables GIT_DIR, GIT_WORK_TREE, etc. héritées ignorées : le script n'agit que sur vendor/src ;
#   - idempotent : un dossier déjà au bon commit est laissé tel quel ; un dossier avec des
#     modifications locales ou des fichiers non suivis n'est pas mis à jour ; un fichier ignoré
#     par git (poids posés dans models/, ckpts/…) n'est jamais écrasé : l'extraction s'arrête
#     s'il gêne ;
#   - reprise : un dossier vide, ou un clone interrompu avant l'extraction, est repris ;
#     sinon le script refuse et indique quoi faire.
#
# Codes de sortie : 0 succès ; 1 au moins une récupération a échoué ; 2 usage ou moteurs.json
# invalide ; 3 nom inconnu ; 4 dépôt « à référencer seulement » (non récupéré).
set -euo pipefail

ICI=$(cd "$(dirname "$0")" && pwd -P)
JSON="$ICI/moteurs.json"
DEST="${MOTEURS_SRC:-$ICI/src}"

export GIT_LFS_SKIP_SMUDGE=1   # ne jamais tirer de gros fichiers LFS (poids)
export GIT_TERMINAL_PROMPT=0   # pas de demande d'identifiants si un dépôt a disparu
# Lancé depuis un hook git, une tâche d'IDE ou une CI, le shell peut porter GIT_DIR ou GIT_WORK_TREE :
# chaque « git -C <cible> » agirait alors sur ce dépôt extérieur (origin réécrit, HEAD détaché).
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES \
  GIT_COMMON_DIR GIT_NAMESPACE GIT_CEILING_DIRECTORIES

aide() {
  # en-tête : lignes de commentaire qui suivent le shebang
  awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"
}

mode=tout
seul=""
while [ $# -gt 0 ]; do
  case "$1" in
    --liste) mode=liste; shift ;;
    --seul)
      if [ $# -lt 2 ] || [ -z "$2" ]; then
        echo "Erreur : --seul attend un nom (voir --liste)." >&2
        exit 2
      fi
      mode=seul; seul="$2"; shift 2 ;;
    -h|--aide|--help) aide; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; aide >&2; exit 2 ;;
  esac
done

for outil in git python3; do
  if ! command -v "$outil" >/dev/null 2>&1; then
    echo "Erreur : $outil est requis." >&2
    exit 2
  fi
done
if [ ! -f "$JSON" ]; then
  echo "Erreur : $JSON introuvable." >&2
  exit 2
fi

# Lecture et validation de moteurs.json en Python isolé (-I), sans dépendance à jq.
# argv : chemin du JSON, mode (liste|tsv), nom demandé (vide = tous).
# Sortie en mode tsv : une ligne « nom<TAB>url<TAB>commit » par dépôt à récupérer.
PY_LIRE='
import json, re, sys

chemin, mode, seul = sys.argv[1], sys.argv[2], sys.argv[3]
VERDICTS = ("à dupliquer", "à référencer seulement")

def erreur(message, code=2):
    sys.stderr.write("Erreur : " + message + "\n")
    sys.exit(code)

try:
    with open(chemin, encoding="utf-8") as f:
        moteurs = json.load(f)
except (OSError, ValueError) as e:
    erreur("moteurs.json illisible (%s)" % e)
if not isinstance(moteurs, list):
    erreur("moteurs.json doit contenir une liste")

vus = set()
for i, m in enumerate(moteurs):
    if not isinstance(m, dict):
        erreur("entrée %d : objet attendu" % i)
    nom = m.get("nom")
    url = m.get("url")
    commit = m.get("commit")
    verdict = m.get("verdict")
    if not isinstance(nom, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", nom) or ".." in nom:
        erreur("entrée %d : nom invalide %r" % (i, nom))
    if nom in vus:
        erreur("nom en double : %s" % nom)
    vus.add(nom)
    if not isinstance(url, str) or not re.fullmatch(r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", url):
        erreur("%s : url invalide %r (https://github.com/<proprio>/<dépôt> attendu)" % (nom, url))
    if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        erreur("%s : commit invalide %r (SHA-1 complet de 40 caractères attendu)" % (nom, commit))
    if verdict not in VERDICTS:
        erreur("%s : verdict inconnu %r" % (nom, verdict))

if mode == "liste":
    dupliquer = [m for m in moteurs if m["verdict"] == VERDICTS[0]]
    referencer = [m for m in moteurs if m["verdict"] == VERDICTS[1]]
    print("  %-30s %-27s %-12s %s" % ("NOM", "ÉTAPE", "COMMIT", "USAGE COMMERCIAL"))
    print("À dupliquer (%d), récupérés par ce script :" % len(dupliquer))
    for m in dupliquer:
        print("  %-30s %-27s %-12s %s" % (m["nom"], m.get("etape", ""), m["commit"][:12], m.get("usage_commercial", "")))
    print("À référencer seulement (%d), jamais récupérés :" % len(referencer))
    for m in referencer:
        print("  %-30s %-27s %-12s %s" % (m["nom"], m.get("etape", ""), m["commit"][:12], m.get("usage_commercial", "")))
    sys.exit(0)

if seul:
    choix = [m for m in moteurs if m["nom"] == seul]
    if not choix:
        erreur("aucun dépôt nommé %r dans moteurs.json (voir --liste)" % seul, 3)
    if choix[0]["verdict"] != VERDICTS[0]:
        m = choix[0]
        erreur("%s est « %s » : il n’est pas récupéré automatiquement. Lien de lecture : %s/tree/%s"
               % (m["nom"], m["verdict"], m["url"], m["commit"]), 4)
else:
    choix = [m for m in moteurs if m["verdict"] == VERDICTS[0]]

for m in choix:
    print("%s\t%s\t%s" % (m["nom"], m["url"], m["commit"]))
'

if [ "$mode" = liste ]; then
  python3 -I -c "$PY_LIRE" "$JSON" liste ""
  echo
  echo "Destination : $DEST"
  exit 0
fi

a_recuperer=$(python3 -I -c "$PY_LIRE" "$JSON" tsv "$seul")

# Récupère un dépôt à un commit précis. Chaque commande est vérifiée explicitement
# (set -e ne s'applique pas dans une fonction appelée depuis un « if »).
recuperer_un() {
  local nom=$1 url=$2 sha=$3
  local cible="$DEST/$nom"
  local actuel=""

  # Dossier vide créé à l'avance : on le prend comme une nouvelle cible.
  if [ -d "$cible" ] && [ ! -e "$cible/.git" ] && [ -z "$(ls -A "$cible" 2>/dev/null)" ]; then
    rmdir "$cible" || return 1
  fi

  if [ -e "$cible" ] && [ ! -d "$cible/.git" ]; then
    echo "!! $nom : $cible existe, n'est pas vide et n'est pas un dépôt git ; je n'y touche pas." >&2
    echo "   Pour le récupérer : déplacez ou supprimez ce dossier, puis relancez." >&2
    return 1
  fi

  if [ -d "$cible/.git" ]; then
    actuel=$(git -C "$cible" rev-parse -q --verify 'HEAD^{commit}' 2>/dev/null || true)
    if [ -z "$actuel" ]; then
      # Aucun commit extrait : clone interrompu (pendant le téléchargement ou l'extraction).
      if [ -n "$(ls -A "$cible" | grep -vx '.git')" ]; then
        echo "!! $nom : clone interrompu pendant l'extraction (aucun commit extrait, mais des fichiers présents) ;" >&2
        echo "   reprise impossible sans risque d'écraser un fichier. Supprimez $cible puis relancez." >&2
        return 1
      fi
      echo "~  $nom : reprise d'un clone interrompu (aucun commit extrait)."
    else
      if [ -n "$(git -C "$cible" status --porcelain 2>/dev/null)" ]; then
        if [ "$actuel" = "$sha" ]; then
          echo "=  $nom : déjà au commit ${sha:0:12}, avec des modifications locales (conservées)."
          return 0
        fi
        echo "!! $nom : modifications locales ou fichiers non suivis, et commit différent (${actuel:0:12}) ; je n'écrase rien." >&2
        echo "   Sauvegardez ou annulez ces modifications (git -C \"$cible\" status), puis relancez." >&2
        return 1
      fi
      if [ "$actuel" = "$sha" ]; then
        echo "=  $nom : déjà au commit ${sha:0:12}, rien à faire."
        return 0
      fi
      echo "~  $nom : passage du commit ${actuel:0:12} au commit ${sha:0:12}."
    fi
  else
    mkdir -p "$cible" || return 1
    git -C "$cible" init -q || return 1
  fi

  if git -C "$cible" remote get-url origin >/dev/null 2>&1; then
    git -C "$cible" remote set-url origin "$url" || return 1
  else
    git -C "$cible" remote add origin "$url" || return 1
  fi

  echo "-> $nom : $url @ ${sha:0:12}"
  if ! git -C "$cible" -c protocol.file.allow=never -c core.hooksPath=/dev/null \
      fetch -q --depth 1 --no-tags origin "$sha"; then
    echo "!! $nom : échec du téléchargement du commit $sha." >&2
    return 1
  fi
  # --no-overwrite-ignore : un fichier ignoré par git (poids téléchargés dans models/, ckpts/…)
  # qui porte le nom d'un fichier suivi par le nouveau commit arrête l'extraction au lieu d'être écrasé.
  if ! git -C "$cible" -c core.hooksPath=/dev/null -c advice.detachedHead=false \
      checkout -q --no-overwrite-ignore --detach FETCH_HEAD; then
    echo "!! $nom : échec de l'extraction du commit $sha (rien n'a été écrasé)." >&2
    echo "   Si git cite des fichiers ignorés qui seraient écrasés, déplacez-les hors de $cible, puis relancez." >&2
    return 1
  fi

  actuel=$(git -C "$cible" rev-parse HEAD)
  if [ "$actuel" != "$sha" ]; then
    echo "!! $nom : HEAD vaut $actuel au lieu de $sha." >&2
    return 1
  fi
  echo "   ok : $(du -sh --exclude=.git "$cible" 2>/dev/null | cut -f1) de fichiers dans $cible"
  if [ -f "$cible/.gitmodules" ]; then
    echo "   note : ce dépôt a des sous-modules, non récupérés. Si besoin (code tiers, à relire) :"
    echo "          git -C \"$cible\" -c protocol.file.allow=never submodule update --init --depth 1"
  fi
  return 0
}

mkdir -p "$DEST"
echecs=()
total=0
while IFS=$'\t' read -r nom url sha <&3; do
  [ -n "$nom" ] || continue
  total=$((total + 1))
  if ! recuperer_un "$nom" "$url" "$sha"; then
    echecs+=("$nom")
  fi
done 3<<< "$a_recuperer"

echo
if [ "${#echecs[@]}" -gt 0 ]; then
  echo "Terminé avec ${#echecs[@]} échec(s) sur $total : ${echecs[*]}" >&2
  exit 1
fi
echo "Terminé : $total dépôt(s) au commit épinglé dans $DEST"
echo "Rappel : lire les « conditions » de chaque dépôt dans moteurs.json avant tout usage ou toute redistribution."
