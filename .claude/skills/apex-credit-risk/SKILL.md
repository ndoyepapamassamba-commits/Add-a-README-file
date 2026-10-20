---
name: apex-credit-risk
description: Compétence maître « engagements et risque de crédit » issue de l'application APEX (Credit Risk OS, banque UMOA) — lecture d'un arrêté ACTE 7 / PCB / CRM, indicateurs de portefeuille (NPL, ECL IFRS 9, classes BCEAO, stages, PHI, EWS), impayés 30‑90 j et protocoles, douteux et provisionnement (Instruction 026 art. 16), déclassements de fin de mois, conformité IFRS 7/9 et UMOA, capital IRB, Monte Carlo et stress, Risk Outlook probabiliste avec provenance, CCB close monitoring, FODEP, codification, mémoire des arrêtés, et exports premium Excel / Word / PowerPoint / PDF / HTML / mail. À utiliser dès qu'une demande parle d'engagements, de crédit, d'impayés, de douteux, de provisions, de NPL, de watchlist, de comité de crédit, de portefeuille bancaire, d'ACTE 7, de BCEAO, d'IFRS 9, ou demande un classeur, un rapport ou une présentation sur ces sujets ; génère la ou les sous-compétences nécessaires à chaque requête.
triggers:
  - engagements
  - impayés
  - douteux
  - provisions
  - NPL
  - watchlist
  - comité de crédit
  - ACTE 7
  - BCEAO
  - IFRS 9
  - stage 3
  - déclassement
  - recouvrement
  - risque de crédit
  - portefeuille
  - FODEP
  - close monitoring
---

# APEX Credit Risk — compétence maître

Tout le savoir-faire de l'application APEX (Ecobank Sénégal Credit Risk OS) est traduit ici en compétences réutilisables par MASSAMBA Workbench. Une requête sur les engagements, un classeur Excel bancaire, un rapport Word, une présentation de comité ou un mail de relance active cette compétence, qui **compose les sous-compétences utiles** (fiches `references/`) et les applique aux données réellement fournies.

## Règles permanentes
1. **Toujours en français** (anglais seulement si l'utilisateur le demande, ex. reporting groupe CCB).
2. **Ne fabrique aucune donnée, aucune économie, aucune performance** : chaque chiffre vient du fichier chargé, de la mémoire des arrêtés ou d'un calcul montré. Une donnée absente s'écrit « non renseigné » / « non mesurable », jamais 0 ni une estimation silencieuse.
3. **Provenance** sur tout chiffre modélisé (OBSERVED, EMPIRICAL, MARKOV, MODELLED, EXPERT, STRESS, SIMULATED, HYBRID — fiche 12) ; les hypothèses par défaut sont affichées comme hypothèses.
4. **Aucun secret, aucune clé, aucune donnée client** dans le dépôt ou dans un exemple : les fichiers de l'utilisateur restent dans son espace de travail.
5. **Aucun nom d'outil interne** dans un livrable (fiche 05 § 1).
6. Les **trois lectures** (IFRS 9 / BCEAO / PCB) sont présentées ensemble dès qu'il s'agit de douteux ou de provisions (fiche 04 § 6).
7. Un livrable Office est **vérifié avant livraison** : `excelStrict` + `designQA` / `designGate` dans l'app, puis compétence `m365-verification` (0 erreur Open XML, aperçus lus).

## Procédure à chaque requête
1. **Qualifier la demande** : objet (portefeuille, client, douteux, impayés, conformité, capital, comité, CCB, FODEP, codification), horizon (arrêté, N‑1, projection), livrable (réponse, Excel, Word, PPT, PDF/HTML, mail), thème de couleurs choisi.
2. **Choisir les sous-compétences** avec la table de routage ci-dessous ; lire les fiches correspondantes (pas toutes).
3. **Lire les données** avec la fiche 01 : détecter la feuille maître ACTE 7, les feuilles auxiliaires, N‑1, PCB, CRM ; appliquer les exclusions symétriques et les dérivés par ligne (`excl`, `npl`, `dj`, `djProj`, `ecl`, garanties).
4. **Calculer** avec `data.query` / code, jamais de tête ; recalculer les totaux clés une seconde façon (somme clients = agrégat, pont des impayés = 0, tranches = total).
5. **Rédiger** : chiffres clés → constats → analyse → recommandations datées → hypothèses et limites. Format de réponse de chaque fiche (§ « Format de réponse attendu »).
6. **Exporter** si demandé avec la fiche 05 (structure, bande KPI et graphiques natifs avant l'en-tête, feuilles dans l'ordre, sommaire, contrôles d'audit) et le thème de l'utilisateur ; vérifier ; livrer en disant ce qui a été vérifié.
7. **Générer la sous-compétence** de la requête (voir § « Sous-compétences générées ») quand la demande est récurrente ou spécifique à l'utilisateur, pour qu'elle soit rejouable.

## Table de routage (mots de la requête → fiches)

| La requête parle de… | Fiches à lire |
|---|---|
| fichier, arrêté, ACTE 7, colonnes, feuille, N‑1, PCB, CRM, mémos | 01, 11 |
| portefeuille, santé, NPL, ECL, stage, classe, PHI, EWS, PD, concentration, grandes expositions, appétit, stress simple, covenants, concepts (IPB, DVI, CIR, EAP, ICC), radar, tornade | 02 |
| impayés, 30‑90 j, bandes J1–J4, protocole, relance, causes, déclencheurs, triage, SLA, plan d'action, NBA, efficacité, anomalies, qualité des données, calendrier | 03 |
| douteux, NPL client, provision, art. 16, complément, hypothèques, passage en perte, déclassement de fin de mois, 292, souffrance, PCB | 04 |
| Excel, classeur, tableau de bord, Word, rapport, PowerPoint, comité, PDF, HTML, mail, fiche client, dossier complet, design, couleurs, premium | 05 (+ fiche du sujet) |
| conformité, audit, IFRS 7, IFRS 9, BCEAO 026, FRR, UMOA, solvabilité, division des risques | 06 |
| CCB, close monitoring, roll rate, DPD, BU, kUSD, reporting groupe | 07 |
| code, SIC, secteur, sûreté, garantie, produit, segment, devise, pays, agence, programme, gestionnaire, scorecard, limites sectorielles | 08 |
| capital, IRB, Vasicek, RWA, Monte Carlo, VaR, ES, Gini, HHI, stress adverse / sévère / sectoriel, stress inverse, leviers, vintage, verdict | 09 |
| FODEP, EP01, EP02, EP03, EP08, EP29, EP32, FPE, FPB, APR, grands risques réglementaires | 10 |
| mémoire, archives, historique, N‑1, voyage dans le temps, salles (Atelier, DRAFT, Control Tower, Centrale, Comité, PDO Mailer), statuts de dossier | 11 |
| probabilité, PD 12M, Risk Outlook, Markov, provenance, confiance, guérison, temps avant défaut, backtest, bootstrap, sensibilité, commentaires sémantiques | 12 |

Plusieurs lignes peuvent s'appliquer : une demande « Excel des douteux avec provisions à constituer » lit 01 + 04 + 05 ; « présentation de comité » lit 01 + 02 + 03 + 04 + 05 (+ 09 si capital).

## Sous-compétences générées
Quand la requête définit un besoin rejouable (ex. « chaque mois, les impayés J3–J4 par gestionnaire en Excel aux couleurs X »), produire une sous-compétence dans l'espace de travail de l'utilisateur (`data/skills/apex-<sujet>/SKILL.md`, jamais dans le dépôt) avec :
- `name` (`apex-<sujet>`), `description` (déclencheurs explicites), `triggers` ;
- **entrées** attendues (feuilles, colonnes, N‑1 ou non, thème) ;
- **calculs** (références aux fiches et formules exactes utilisées) ;
- **livrable** (feuilles dans l'ordre, KPI de la bande, graphiques, sections Word/PPT) ;
- **contrôles** (totaux croisés, pont, `m365-verification`) ;
- **limites** (ce qui manque dans les données).
La sous-compétence réutilise les fiches de ce dossier par référence (`../apex-credit-risk/references/0X-….md`) au lieu de les recopier.

## Dans MASSAMBA Workbench
- Enregistrée dans le registre moteur (`server/engine/skills.ts`, skill `apex_credit_risk`) : déclenchée par les mots d'engagements / crédit / impayés / douteux / BCEAO / IFRS 9 / ACTE 7 ; compagnons `excel_analysis`, `excel_export`, `report_export`, `design_control`.
- Outils : `data.inspect`, `data.query`, `data.export`, `report.export` ; les exports passent par le design Maison 2, `designQA`, `designGate`, `excelStrict` (textes commençant par « = » remis en texte, formules traduites, `_xlfn.`).
- Données de codification : `data/codification.json` (SIC, sûretés, produits, segments, devises, pays, agences, programmes).

## Fiches
- `references/01-donnees-acte7.md` — lecture du fichier, constantes, dérivés par ligne, feuilles auxiliaires
- `references/02-indicateurs-portefeuille.md` — agrégats, PHI, EWS, PD, contagion, grandes expositions, stress simple, concepts
- `references/03-surveillance-prevention.md` — causes, impayés 30‑90 j, protocoles, triage, efficacité, anomalies
- `references/04-douteux-recouvrement-pcb.md` — douteux, art. 16, déclassements de fin de mois, PCB, trois lectures
- `references/05-exports-premium-design.md` — Excel / Word / PPT / PDF / mail / fiche / dossier / finition / contrôles
- `references/06-conformite-ifrs-bceao-umoa.md` — grille de classification, contrôles, score
- `references/07-ccb-close-monitoring-rollrate.md` — BU, PP, indicateurs, roll rate, report
- `references/08-codification.md` — référentiels et scorecard gestionnaire
- `references/09-decision-capital-stress.md` — Markov, IRB, Monte Carlo, concentration, stress, leviers
- `references/10-fodep.md` — états prudentiels depuis le modèle FODEP
- `references/11-memoire-archives-salles.md` — instantanés, N‑1, voyage dans le temps, salles, statuts
- `references/12-jev-probabilites.md` — Risk Outlook, provenance, calibration, analyses avancées
