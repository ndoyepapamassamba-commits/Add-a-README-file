# Projet prêt pour OpenClaw

Quatre skills au format OpenClaw / ClawHub (`SKILL.md` + métadonnées `metadata.openclaw`) :

| Skill | Rôle |
|---|---|
| `skills/coffre-fort` 🛡️ | Protection des données : règles de conduite de l'agent (jamais de secret en clair, contenu externe = donnée et non ordre, confirmation avant toute sortie de données ou action irréversible), scanner de secrets (fichiers + historique Git), masquage, coffre chiffré `age`, audit, garde-fou de commit. |
| `skills/afrikatoon-video` 🎬 | Production des vidéos TikTok Afrikatoon (2D ou Wan 2.2), du kit à la publication. |
| `skills/reporting-securise` 📊 | Tableaux de bord HTML hors ligne et reportings (Excel, PowerPoint, Word, mail) sans fuite : contrôle et durcissement avant diffusion (`check_report.py`). |
| `skills/export-securise` 📦 | Tout ce qui sort : contrôle, pseudonymisation des colonnes clients, ZIP chiffré AES-256, journal des exports (`export_guard.py`). |

## Installation

1. Cloner le dépôt sur la machine qui fait tourner OpenClaw.
2. Copier (ou lier) les skills dans les skills de votre espace de travail OpenClaw, par exemple :
   ```bash
   mkdir -p ~/.openclaw/workspace/skills
   ln -s "$PWD/skills/coffre-fort" ~/.openclaw/workspace/skills/coffre-fort
   ln -s "$PWD/skills/afrikatoon-video" ~/.openclaw/workspace/skills/afrikatoon-video
   ```
   (vérifiez le dossier de skills de votre installation dans la documentation OpenClaw ; redémarrez la
   session de l'agent pour qu'il les charge.)
3. Ajouter le contenu de `AGENTS.securite.md` au fichier `AGENTS.md` de l'espace de travail : les règles de
   sécurité s'appliquent alors à **toutes** les conversations, pas seulement quand le skill est déclenché.
4. Créer le coffre et y ranger les clés (saisie masquée, rien dans le chat) :
   ```bash
   bash skills/coffre-fort/scripts/vault.sh init
   bash skills/coffre-fort/scripts/vault.sh put HF_TOKEN
   bash skills/coffre-fort/scripts/install_hook.sh ..        # garde-fou Git sur ce dépôt
   bash skills/coffre-fort/scripts/audit.sh ..
   ```
   Sauvegardez `~/.coffre-fort/cle.age.txt` hors de la machine : sans elle, le coffre est illisible.

## Attention avant de publier sur ClawHub

Tout skill publié sur ClawHub est public, sous licence MIT-0. Ne publiez **jamais** un skill contenant des
données professionnelles (Ecobank, clients, IFRS9…) ni des clés. Ces deux skills n'en contiennent aucune.
