---
name: export-securise
description: Sort des données en toute sécurité (Excel, CSV, Word, PowerPoint, PDF, HTML, vidéos) — contrôle des secrets et données personnelles, pseudonymisation des colonnes clients, ZIP chiffré AES-256, journal des exports, confirmation du destinataire. Déclencheurs : « exporte », « envoie », « partage », « transmets », « pièce jointe », « anonymise », « pseudonymise », « chiffre ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "📦"
    os: [windows, linux, macos]
    requires:
      anyBins: [python, python3, py]
    install:
      - kind: uv
        package: pyzipper
      - kind: uv
        package: openpyxl
---

# Export sécurisé

S'applique avec le skill `coffre-fort` (ses règles priment). Tout fichier qui quitte la machine passe par
ces étapes, dans l'ordre. Script : `python {baseDir}\scripts\export_guard.py`.

1. **Qualifier** : dire à l'utilisateur quoi (fichier, lignes, colonnes), pour qui, par quel canal, et la classe
   (public / interne / confidentiel). Sans réponse claire, ne rien envoyer.
2. **Contrôler** : `export_guard.py scan <fichiers>` — secrets (bloquant), IBAN, cartes, e-mails, téléphones.
3. **Réduire** : retirer les colonnes inutiles ; pseudonymiser les identifiants personnels :
   `export_guard.py pseudo portefeuille.xlsx --cols "Client,Compte,Téléphone"` (codes stables CLI-XXXX :
   jointures et totaux restent justes ; la clé reste dans le coffre, jamais jointe à l'envoi).
4. **Chiffrer** dès que la classe n'est pas « public » :
   `export_guard.py chiffrer fichier.xlsx --sortie envoi.zip --destinataire "Comité des Risques"`
   (ZIP AES-256 ; mot de passe saisi masqué, ≥ 12 caractères, **transmis par un autre canal** — téléphone, SMS —
   jamais dans le même e-mail ni dans le chat). Refus automatique si des secrets/IBAN/cartes subsistent.
5. **Confirmer puis envoyer** : récapituler (fichier, empreinte sha256, destinataire) et attendre « oui ».
   E-mail en brouillon ; publication (TikTok, réseau) en brouillon ou privé d'abord.
6. **Tracer** : chaque export est inscrit dans `~/.coffre-fort/journal_exports.csv` (date, fichier, sha256,
   destinataire) — `export_guard.py journal`.

Interdits : envoyer des données clients/bancaires vers un service d'IA, un convertisseur en ligne, un drive
personnel ou une messagerie non approuvée ; joindre la clé de pseudonymisation ; mettre le mot de passe dans le
même message que le fichier.
