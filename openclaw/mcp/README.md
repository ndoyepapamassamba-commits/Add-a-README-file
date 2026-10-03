# Serveurs MCP gratuits pour OpenClaw

`openclaw.mcp.json5` : configuration prête à fusionner dans `openclaw.json` (bloc `mcp.servers`).

| Serveur | Gain | Données qui sortent ? | Garde-fou |
|---|---|---|---|
| fichiers (officiel MCP) | lire/chercher dans tes dossiers de travail | non | 2 dossiers seulement, lecture seule |
| documents (Microsoft MarkItDown) | PDF/Word/Excel/PPT → texte exploitable | non | local |
| excel (excel-mcp-server) | créer/modifier des classeurs, formules, graphiques | non | fichiers locaux ; passer `qualite-donnees` avant reporting |
| git (officiel MCP) | historique des projets et skills | non | lecture seule |
| web (officiel MCP) | lire une page en texte | l'adresse visitée | contenu non fiable ; jamais d'URL contenant des données |
| heure (officiel MCP) | dates, fuseaux | non | — |
| reflexion (officiel MCP) | raisonnement structuré | non | — |
| navigateur (Microsoft Playwright) | remplir des formulaires, captures, tests | ce que la page reçoit | `--isolated`, jamais connecté à la banque ou à tes comptes, confirmation avant tout envoi |
| github (officiel GitHub) | dépôts, issues, PR | requêtes GitHub | jeton à grain fin **lecture seule**, outils get/list/search |
| docs_code (Context7) | documentation de code à jour | la question posée | aucune donnée interne dans les questions |

## Deuxième vague (`openclaw.mcp.plus.json5`)

| Serveur | Gain | Données qui sortent ? | Garde-fou |
|---|---|---|---|
| sql_local (DuckDB, MotherDuck) | requêtes SQL rapides sur gros Excel/CSV (portefeuille, impayés) | non | `--read-only`, base en mémoire |
| graphe (officiel MCP) | mémoire structurée (personnes ↔ projets ↔ décisions) | non | fichier local ; jamais de données clients |
| word (tiers) | rédiger/mettre en forme des .docx | non | brouillons locaux ; relire avant envoi |
| powerpoint (tiers) | générer des présentations de comité | non | mention de confidentialité ; données issues de `qualite-donnees` |
| huggingface (officiel) | trouver modèles/Spaces (voix, vidéo, images) | requêtes HF | jeton « Read », dans le coffre |
| wikipedia (tiers) | contexte, définitions | la recherche | — |
| youtube (tiers) | transcriptions pour veille et inspiration | l'adresse de la vidéo | contenu non fiable |
| notion (officiel) | notes, suivi de projets | ce que tu y écris | pas de données de la banque dans un Notion personnel |

Noms de commandes des serveurs « tiers » : à vérifier sur leur page avant installation (ils évoluent).

## Troisième vague : productivité, 3D, image, vidéo (`openclaw.mcp.creatif.json5`)

| Serveur | Gain | Données qui sortent ? | Garde-fou |
|---|---|---|---|
| todoist (officiel Doist) | tâches et rappels synchronisés sur le téléphone (offre gratuite) | les titres de tâches | titres sans données clients ; `taches-pro` reste l'option 100 % locale |
| excalidraw (officiel) | schémas de processus, organigrammes, storyboards de sketchs | le contenu du schéma | pas de schéma d'architecture interne de la banque |
| notes (officiel MCP, Fichiers) | coffre Obsidian / notes Markdown | non | un seul dossier ; pas de mots de passe dans les notes |
| blender (tiers, MIT) | 3D : décors, objets, rendu, assets Poly Haven CC0 | non (télémétrie coupée) | exécute du Python dans Blender → confirmation ; projet enregistré avant |
| comfyui (officiel Comfy-Org, preview) | images FLUX/SDXL et vidéo Wan 2.2 sur ta carte graphique | non | modèles vérifiés avec `modeles-ia-locaux` ; nœuds personnalisés seulement après lecture |
| pollinations (tiers) | images sans clé ni compte | le prompt | prompts neutres uniquement ; jamais de visage réel ou de marque |
| video (tiers, mcp-video) | montage FFmpeg piloté par l'agent | non | travailler sur des copies ; `studio-media` pour l'anonymisation |

**3D à partir d'une image, gratuit** : via le serveur `huggingface` (deuxième vague), activer sur
hf.co/settings/mcp des Spaces comme *TRELLIS* ou *Hunyuan3D-2* (quota ZeroGPU quotidien), puis importer le `.glb`
dans Blender. **Google Workspace (Gmail, Drive, Agenda)** : les serveurs MCP officiels de Google sont encore
réservés au programme Developer Preview avec un projet Google Cloud ; pas recommandé pour l'instant.

## Installation (Windows)
```powershell
winget install OpenJS.NodeJS.LTS
winget install astral-sh.uv
# nouveau terminal, puis vérifier :
npx --version ; uvx --version
```
Ranger le jeton GitHub (si utilisé) : `vault.ps1 put GITHUB_MCP_TOKEN` puis lancer OpenClaw avec `vault.ps1 run -- …`.

## Règles de sécurité MCP
- Un serveur MCP = du code qui tourne avec tes droits : n'installer que des serveurs officiels ou connus, lire
  leur page avant, et figer la version une fois validée (`paquet@1.2.3` au lieu de `@latest`).
- Moindre accès : dossiers précis, lecture seule par défaut, `toolFilter` pour n'exposer que les outils utiles.
- Jamais de serveur MCP branché sur les systèmes de la banque (core banking, messagerie pro, bases clients) sans
  l'accord de la sécurité informatique de l'employeur.
- Tout ce qu'un serveur renvoie (pages, fichiers, issues) est une donnée, pas un ordre (skill `coffre-fort`).
