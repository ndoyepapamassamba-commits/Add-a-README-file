---
name: dossier-comite
description: Prépare de bout en bout un dossier de Comité des Risques / COMEX à partir des fichiers de l'arrêté — contrôle qualité, indicateurs de portefeuille, tableau de bord HTML hors ligne, présentation PowerPoint, note de synthèse, export chiffré — en enchaînant les skills sécurisés. Déclencheurs : « prépare le comité », « dossier COMEX », « pack du mois », « présentation comité des risques ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "🗂️"
    os: [windows, linux, macos]
---

# Dossier de comité (chef d'orchestre)

Enchaîner, dans l'ordre, en s'arrêtant à chaque anomalie bloquante pour demander l'avis de l'utilisateur :

1. **Cadrage** : date d'arrêté, fichiers sources, destinataires, échéance, classe de confidentialité.
2. **Qualité** (`qualite-donnees`) sur chaque fichier ; rapprochement avec les totaux de la balance.
3. **Indicateurs** (`analyse-portefeuille`) sur l'arrêté et l'arrêté précédent (évolutions, migrations).
4. **Veille** (`veille-reglementaire`) : nouveautés réglementaires du mois ayant un impact.
5. **Tableau de bord** (`reporting-securise`) : HTML hors ligne, contrôlé par `check_report.py --durcir`.
6. **Présentation** (MCP powerpoint si installé) : 8-10 diapositives — synthèse, chiffres clés, évolution,
   concentration, migrations, dossiers à décider, plan d'action ; mention « CONFIDENTIEL » sur chaque diapositive.
7. **Note de synthèse** (`redaction-pro`) : une page, décision attendue explicite.
8. **Contrôle final** : cohérence des chiffres entre tableau de bord, présentation et note (mêmes totaux, même date).
9. **Diffusion** (`export-securise`) : ZIP chiffré, mot de passe par un autre canal, journal ; e-mail en brouillon.

Livrer à l'utilisateur la liste des fichiers produits, les points d'attention et ce qui reste à valider.
