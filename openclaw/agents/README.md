# Équipe d'agents OpenClaw

Sept agents spécialisés, coordonnés par un chef d'orchestre. La puissance vient de la **spécialisation**
(chacun a ses skills, sa personnalité, sa méthode et son format de retour) ; la sécurité vient des **cloisons**
(chacun n'a que les outils dont il a besoin).

```
                         Toi (WhatsApp / Telegram / interface)
                                       │
                             🎯 chef  (seul à te parler, délègue, vérifie)
            ┌──────────┬──────────┬────┴─────┬────────────┬──────────┐
        🏦 risques  🔎 veille  🎬 studio  🗓️ secretaire  🛡️ gardien  🧑‍💻 dev
        modèle local  Internet   vidéos     tâches       audit       scripts
        pas de web   pas de     pas de     pas de web   modèle      pas de web
                     fichiers   web                     local
```

| Agent | Skills | Serveurs MCP | Outils | Modèle |
|---|---|---|---|---|
| 🎯 chef | coffre-fort, briefing-quotidien | heure, reflexion, graphe | lecture, délégation, mémoire | par défaut |
| 🏦 risques | qualite-donnees, analyse-portefeuille, reporting-securise, export-pro, export-securise, dossier-comite, boite-a-outils | sql_local, excel, documents, word, powerpoint, fichiers | fichiers + commandes | **local (Ollama)** |
| 🔎 veille | recherche-brave, veille-reglementaire | web, wikipedia, youtube, docs_code, github, huggingface, notion, todoist, excalidraw, pollinations | Internet + écriture de ses notes | par défaut |
| 🎬 studio | afrikatoon-video, studio-media, tiktok-performance | blender, comfyui, video | fichiers + commandes | par défaut |
| 🗓️ secretaire | taches-pro, briefing-quotidien, redaction-pro, boite-a-outils | notes, heure, graphe | fichiers + commandes | par défaut |
| 🛡️ gardien | coffre-fort, sauvegarde-chiffree, modeles-ia-locaux, memoire-semantique | git, fichiers | lecture + scripts d'audit | **local (Ollama)** |
| 🧑‍💻 dev | boite-a-outils, qualite-donnees | git, excel, fichiers | fichiers + commandes | par défaut |

Tous reçoivent `coffre-fort` et les règles de `AGENTS.securite.md`.

## Les 4 cloisons
1. **Un seul agent touche Internet** (`veille`) et il ne lit aucun fichier, n'exécute rien, ne voit pas la mémoire :
   une page piégée ne trouve rien à voler.
2. **Les données bancaires restent sur un modèle local** (`risques`, `gardien`) sans Internet.
3. **Seul le chef délègue** (`subagents.allowAgents`), et lui n'exécute rien ni n'écrit.
4. **Les confirmations restent chez toi** : envoi, publication, suppression, installation passent par le chef,
   qui te demande « oui ».

`audit_agents.py` vérifie automatiquement ces règles (triade dangereuse « contenu non fiable + données + sortie »,
modèle cloud sur des données bancaires, délégation ouverte, espaces partagés, passerelle exposée).

## Installation (Windows)
```powershell
cd $HOME\afrikatoon ; git pull origin claude/gallant-bell-286f0p
py openclaw\agents\install_agents.py                 # aperçu
py openclaw\agents\install_agents.py --appliquer     # crée ~\.openclaw\workspace-<agent>\ (AGENTS.md, SOUL.md, skills)
ollama pull qwen3:8b                                  # modèle local de risques et gardien (voir modeles-ia-locaux)
```
Puis fusionner `openclaw.agents.json5` dans `~\.openclaw\openclaw.json` (copie de sauvegarde avant), et :
```powershell
py openclaw\agents\audit_agents.py $HOME\.openclaw\openclaw.json   # doit dire « Aucun risque bloquant »
openclaw gateway restart
```
Selon la version d'OpenClaw, la liste s'appelle `agents.entries` (récent) ou `agents.list` avec un champ `id`
(ancien) ; l'audit comprend les deux. Pour les outils MCP, le joker `serveur__*` peut être remplacé par les noms
exacts donnés par `openclaw mcp list`.

## Exemples de demandes au chef
- « Prépare le Comité des risques de septembre à partir de `arrete_sept.xlsx` »
- « Vidéo du jour sur la belle-mère et le mariage »
- « Bonjour » → plan du jour, alertes de sécurité, 3 actualités
- « Écris-moi une macro qui consolide les fichiers des agences »
- « Fais l'audit sécurité de la semaine »
