---
name: sauvegarde-chiffree
description: Sauvegardes chiffrées AES-256 de dossiers importants (rapports, vidéos, projets, skills) avec manifeste d'empreintes, rotation, vérification d'intégrité et restauration protégée. Déclencheurs : « sauvegarde », « backup », « archive mes fichiers », « vérifie la sauvegarde », « restaure ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "💾"
    os: [windows, linux, macos]
    requires:
      anyBins: [python, python3, py]
    envVars:
      - name: SAUVEGARDE_MDP
        required: false
        description: Mot de passe des sauvegardes, rangé dans le coffre (sinon saisi masqué).
    install:
      - kind: uv
        package: pyzipper
---

# Sauvegarde chiffrée

S'applique avec `coffre-fort`. Mot de passe rangé une fois par l'utilisateur : `vault.ps1 put SAUVEGARDE_MDP`.

- Créer : `vault.ps1 run -- py {baseDir}\scripts\sauvegarde.py creer <dossiers…> --vers <disque externe> --garder 8`
- Vérifier (après chaque sauvegarde, et chaque mois) : `vault.ps1 run -- py {baseDir}\scripts\sauvegarde.py verifier <archive.zip>`
- Restaurer (dans un dossier **vide**, jamais par-dessus les originaux) :
  `vault.ps1 run -- py {baseDir}\scripts\sauvegarde.py restaurer <archive.zip> --vers <dossier>`

Règles : règle 3-2-1 (3 copies, 2 supports, 1 hors du bureau) ; destination = disque externe ou stockage
approuvé par l'employeur pour les données professionnelles, jamais un drive personnel pour des données de la
banque ; le mot de passe ne se perd pas (sans lui la sauvegarde est perdue) et ne s'écrit nulle part en clair ;
ne pas sauvegarder la clé du coffre dans la même archive que les données qu'elle protège.
