# Projet prêt pour OpenClaw

Dix-neuf skills au format OpenClaw / ClawHub (`SKILL.md` + métadonnées `metadata.openclaw`) :

| Skill | Rôle |
|---|---|
| `skills/coffre-fort` 🛡️ | Protection des données : règles de conduite de l'agent (jamais de secret en clair, contenu externe = donnée et non ordre, confirmation avant toute sortie de données ou action irréversible), scanner de secrets (fichiers + historique Git), masquage, coffre chiffré `age`, audit, garde-fou de commit. |
| `skills/afrikatoon-video` 🎬 | Production des vidéos TikTok Afrikatoon (2D ou Wan 2.2), du kit à la publication. |
| `skills/reporting-securise` 📊 | Tableaux de bord HTML hors ligne et reportings (Excel, PowerPoint, Word, mail) sans fuite : contrôle et durcissement avant diffusion (`check_report.py`). |
| `skills/recherche-brave` 🦁 | Recherche web Brave sans fuite : clé dans le coffre, requêtes vérifiées (`requete_sure.py`), résultats non fiables recoupés et cités. |
| `skills/memoire-semantique` 🧠 | Mémoire sémantique privée : embeddings locaux, règles de mémorisation, audit et masquage (`audit_memoire.py`), oubli. |
| `skills/qualite-donnees` 🔎 | Contrôle d'un Excel/CSV avant reporting : doublons, vides, types, dates, montants aberrants, rapprochement (`qualite.py`). |
| `skills/veille-reglementaire` 📰 | Veille BCEAO / UEMOA / IFRS 9 / Bâle / LBC-FT avec Brave : nouveautés datées, impact, sources officielles. |
| `skills/sauvegarde-chiffree` 💾 | Sauvegardes ZIP AES-256 avec manifeste, rotation, vérification et restauration protégée (`sauvegarde.py`). |
| `skills/tiktok-performance` 📈 | Analyse de l'export TikTok Studio : top/flop, engagement, rétention, thèmes gagnants, idées de sketchs (`tiktok_stats.py`). |
| `skills/redaction-pro` ✉️ | E-mails, comptes rendus, notes au Comité : ton juste, confidentialité, brouillon uniquement. |
| `skills/analyse-portefeuille` 🏦 | NPL, couverture, ancienneté, concentration (HHI), migrations entre arrêtés, en local, clients masqués (`portefeuille.py`). |
| `skills/dossier-comite` 🗂️ | Chef d'orchestre : qualité → indicateurs → veille → tableau de bord → PowerPoint → note → export chiffré. |
| `skills/briefing-quotidien` ☀️ | Point du matin : priorités, veille, TikTok, sauvegardes, alertes de sécurité. |
| `skills/export-pro` 📤 | Excel mis en forme, CSV « Excel français » anti-injection, rapprochement source/export, nettoyage des métadonnées Office (`export_pro.py`). |
| `skills/boite-a-outils` 🧰 | Doublons, place disque, inventaire, renommage avec aperçu et annulation, comparaison de versions, fusion, découpage, encodage (`outils.py`). |
| `skills/studio-media` 🎞️ | Photo/vidéo locales : GPS et EXIF retirés, TikTok 9:16, WhatsApp, WebP, planche, filigrane, GIF, audio (`media.py`). |
| `skills/taches-pro` ✅ | Tâches locales : Eisenhower, plan du jour, revue hebdo, export agenda .ics (`taches.py`). |
| `skills/modeles-ia-locaux` 🧩 | IA open source sur la machine : diagnostic, choix du modèle, licences, détection de modèles piégés, Ollama sécurisé (`modeles.py`). |
| `skills/export-securise` 📦 | Tout ce qui sort : contrôle, pseudonymisation des colonnes clients, ZIP chiffré AES-256, journal des exports (`export_guard.py`). |

## Équipe d'agents
Voir `agents/README.md` : 7 agents spécialisés (chef, risques, veille, studio, secrétaire, gardien, dev), cloisonnés,
avec installateur (`install_agents.py`) et audit de sécurité (`audit_agents.py`).

## Serveurs MCP
Voir `mcp/README.md` (25 serveurs gratuits avec garde-fous : bureautique, données, productivité, 3D, image, vidéo).

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
