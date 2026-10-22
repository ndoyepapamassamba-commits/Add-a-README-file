# MASSAMBA AI MOTION STUDIO

Studio vidéo IA issu de **MASSAMBA Motion Studio 2**. Il couvre :

- la génération **image → vidéo** et **texte → vidéo** avec de vrais moteurs, gratuits par défaut ;
- le **sketch V1** de la troupe, tourné par le moteur local ;
- un storyboard multiscène et le mode « Film complet » ;
- les personnages de référence, dont les 122 personnages de la nouvelle troupe ;
- une timeline qui monte de vraies vidéos ;
- l'audio, la voix off et les sous-titres ;
- l'export MP4 validé ;
- l'historique des générations, les projets et la sauvegarde automatique ;
- un mode démo honnête.

## Démarrer

- **Fichier seul** : `npm run assembler`, puis ouvrez `dist/MASSAMBA-AI-Motion-Studio.html`. Aucune installation n'est nécessaire.
- **Avec le serveur local** (moteur V1, voix Piper, fournisseurs à clé) : `node serveur/serveur.mjs`, puis ouvrez http://127.0.0.1:8787.

Guides :

- [docs/GUIDE-INSTALLATION.md](docs/GUIDE-INSTALLATION.md) : installation pas à pas ;
- [docs/GUIDE-MOTEURS-ET-COUTS.md](docs/GUIDE-MOTEURS-ET-COUTS.md) : moteurs, connexions et coûts ;
- [docs/FONCTIONS.md](docs/FONCTIONS.md) : ce qui marche, en entier ou en partie ;
- [docs/RAPPORT-TESTS.md](docs/RAPPORT-TESTS.md) : résultats réels des tests ;
- [docs/AUDIT.md](docs/AUDIT.md) : audit de l'original et plan de migration.

## Organisation du code

| Fichier | Rôle |
|---|---|
| `index.html`, `css/studio.css` | Interface en 9 sections, thème sombre ; tous les identifiants d'origine sont conservés |
| `js/registre.js` | Registre des moteurs : capacités relues en direct, aucun prix inventé |
| `js/gradio.js` | Client du protocole Gradio (Spaces Hugging Face) : envoi, file d'attente, flux d'états, téléchargement |
| `js/fournisseurs.js` | Adaptateurs : Space, chaîne Pollinations → Wan, serveur local, démo ; validation des demandes |
| `js/taches.js` | Gestionnaire de tâches : états, concurrence, délai, reprise, coupure réseau, annulation, restauration |
| `js/prompt.js` | Assistant de consigne : 11 préréglages, caméras, structure sourcée, traduction affichée, continuité |
| `js/stockage.js` | Format de projet v3, migration v2 → v3, filtre des secrets, IndexedDB |
| `js/studio.js` | Moteur de montage (repris de l'original) : vraies vidéos, découpe, glisser, sous-titres, forme d'onde |
| `js/export.js` | Export MP4 (WebCodecs + mp4-muxer) image par image, mixage hors ligne, validation ; repli WebM |
| `js/app.js` | Les 9 sections : génération, storyboard, médiathèque, personnages, montage, audio, historique, projets, moteurs |
| `serveur/serveur.mjs` | Serveur local sans dépendance : clés secrètes, voies payantes fermées, limites, journaux caviardés |
| `serveur/fournisseurs.mjs` | Connecteurs fal, Replicate, Runway, Luma, Kling et moteur V1 |
| `serveur/moteur_v1.py`, `serveur/voix_piper.py` | Pont vers le moteur de la troupe et voix Piper locale |
| `outils/troupe.py`, `outils/assembler.mjs` | Données de la troupe ; assemblage en un seul fichier HTML |
| `tests/` | Tests unitaires (`node --test`) et 17 tests e2e Playwright |

## Tests

```
npm run test:unitaires   # 17 tests : noyau et serveur
npm run test:e2e         # 17 tests de la mission, dans Chromium contre le serveur local
```

## Licences

- Code MASSAMBA : MIT.
- `vendor/mp4-muxer.js` : MIT (voir `vendor/mp4-muxer.LICENSE`).
- Moteurs appelés : voir le guide des moteurs (Wan 2.2 Apache-2.0, LTX-2 Community License…).
- Les images de la troupe (`prive/`) ne sont jamais versionnées.
