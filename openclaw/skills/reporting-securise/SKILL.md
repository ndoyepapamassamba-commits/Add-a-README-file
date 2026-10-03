---
name: reporting-securise
description: Produit des reportings et tableaux de bord sécurisés (HTML hors ligne à partir d'Excel, mail de synthèse, PowerPoint/Word/Excel) — style maison bleu, graphiques intégrés, zéro donnée qui sort de la machine, mention de confidentialité, contrôle automatique avant diffusion. Déclencheurs : « dashboard », « reporting », « tableau de bord », « mail quotidien », « Comité », « COMEX », « app HTML », « suivi ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "📊"
    os: [windows, linux, macos]
    requires:
      anyBins: [python, python3, py]
---

# Reporting sécurisé

S'applique avec le skill `coffre-fort` (ses règles priment). Objectif : des rapports beaux et utiles, **sans
qu'aucune donnée ne quitte la machine** tant que l'utilisateur ne l'a pas décidé.

## Règles de conception
1. **Hors ligne, autonome** : un seul fichier HTML ; bibliothèques (graphiques, Excel, PPTX) **copiées dans le
   fichier**, jamais chargées depuis un CDN ; polices système ; images en `data:`. Aucun `fetch`, formulaire,
   iframe, traceur ni lien d'envoi automatique.
2. **Les données restent dans le navigateur** : le fichier Excel est lu localement (glisser-déposer), jamais
   envoyé ; rien n'est écrit dans `localStorage` sans le dire ; pas de données dans l'URL.
3. **Moindre donnée** : n'afficher que les colonnes utiles ; agréger (totaux, ratios, classes) plutôt que lister
   des personnes ; pour une liste nominative, pseudonymiser d'abord
   (`python ../export-securise/scripts/export_guard.py pseudo fichier.xlsx --cols "Client,Compte,Téléphone"`).
4. **Mention de confidentialité** sur l'écran et à l'impression (« CONFIDENTIEL – USAGE INTERNE » par défaut,
   ou la classe donnée par l'utilisateur), date de génération et source des données.
5. **Exports** (Excel, PowerPoint, Word, mail Outlook couleur) générés dans le navigateur ou en local, avec la même
   mention ; le mail est préparé en **brouillon**, jamais envoyé automatiquement.
6. **Exactitude** : chaque chiffre clé est recalculé depuis la source ; afficher le nombre de lignes lues, les
   lignes rejetées et les totaux de contrôle (rapprochement) ; ne jamais inventer une valeur manquante.
7. **Aucune donnée réelle dans le code ou un exemple** : données de démonstration fictives uniquement.

## Avant toute diffusion (obligatoire)
```powershell
python {baseDir}\scripts\check_report.py rapport.html --durcir --classe "CONFIDENTIEL – USAGE INTERNE"
```
Le contrôle échoue (code 1) s'il trouve une ressource ou un appel externe, un secret, l'absence de CSP ou de
mention de confidentialité ; il signale les e-mails, téléphones, IBAN et cartes visibles. Corriger, relancer,
puis seulement proposer l'envoi (règle coffre-fort n° 4) via le skill `export-securise`.
