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
