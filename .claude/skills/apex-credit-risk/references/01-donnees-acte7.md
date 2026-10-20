# 01 · Données d'entrée : le classeur PDO « ACTE 7 » et ses annexes

Source : moteur APEX (ECOBANK Credit Risk OS), sections « INGESTION EXCEL » et « COMPUTE ». Tout ce qui suit est la
règle appliquée par l'application ; rien n'est inventé. Montants en XOF, dates au format Excel ou texte.

## 1. Reconnaître la feuille maîtresse ACTE 7
- La feuille maîtresse est celle dont une ligne (dans les 60 premières) contient au moins **3** des 4 en-têtes clés :
  `Ototal Including PDO In Local Currency`, `Classification`, `Stage IFRS9 Model`, `gl_code`.
- Les feuilles dont le nom contient « synth » sont ignorées ; en cas de plusieurs candidates, on garde celle qui a le
  plus de lignes de données.
- Une ligne est exploitable si `Contracts/Accounts` ou `Code Client` est renseigné.
- Les **titres** (`Product Code` ∈ {LGMO, LTB} : obligations, bons du Trésor) sont **hors champ** des analyses crédit.

## 2. Colonnes lues (nom exact de l'en-tête → champ)
| En-tête ACTE 7 | Champ | Rôle |
|---|---|---|
| Contracts/Accounts | account | facilité (une ligne = une facilité / un compte) |
| gl_code | gl | compte général ; `292…` = créance douteuse BCEAO |
| Code Client | clc | clé d'agrégation client |
| Relationship | rel | nom de la contrepartie |
| Group Code / Group Name | grp / grpName | groupe de risque (voir « vrai groupe ») |
| Country Code | country | |
| ORR, FRR | orr, frr | notations (FRR 1–10 → PD interne) |
| Sic Code | sic | secteur |
| Segment Code | seg | segment technique (exclusion 8110) |
| BUSINESS_SEGMENT | bseg | CORPORATE / COMMERCIAL / CONSUMER… (défaut « N/A ») |
| Credit Program | program | |
| Product Code | prod | OA, CC, CKU, LCU exclus du NPL ; TOD/AX = comptes ordinaires débiteurs |
| Classification | classification | classe BCEAO I, IA, IIA, II, IIN, III, IV, V |
| Stage IFRS9 Model | stage | 1, 2, 3 (borné) |
| Ftotal In Local Currency | ftotal | **limite** (autorisation) |
| Ototal Including PDO In Local Currency | ototal | **encours** incluant les impayés — base de tous les ratios |
| PDO Amount In Local Currency | pdo | montant impayé (Past Due Obligation) |
| Collateral value In Local Currency | collat | valeur de sûreté |
| Security Code / Security Currency | secCode / secCcy | type de garantie, devise |
| Cprovisions IFRS9 In Local Currency | cprovF | dépréciation IFRS 9 renseignée (ECL réel) |
| CProvisions Per Local Regulatory In Local Currency | cprovL | provision réglementaire locale |
| Loan Interest Rate | rate | taux appliqué |
| Accrual In Local Currency / Interest In Suspense In Local Currency | accrual / iis | |
| Status (P/NP) | status | P performant / NP non performant |
| Date In PDO / Date in NP / Reporting Date / Maturity Date / Booking Date | dPdo / dNp / dRep / dMat / dBook | |
| Account Officer | officer | gestionnaire (défaut « N/A ») |
| Domicile of the Repayment Source | domicile | domiciliation des flux |
| Facility Currency | ccy | |
| DESCRIPTION | desc | libellé (sert à détecter l'escompte) |

Lecture des nombres : espaces (y compris fines/insécables) retirés, la **dernière** virgule ou point est la décimale.
L'**arrêté** = la plus grande `Reporting Date` du fichier (sinon aujourd'hui).

## 3. Référentiel appliqué ligne à ligne (constantes du moteur)
- `ECL_RATE` par stage : S1 **1 %**, S2 **25 %**, S3 **100 %** (taux internes Ecobank, utilisés seulement si la
  provision IFRS 9 n'est pas renseignée).
- Exclusions NPL (convention BCEAO, **symétriques** numérateur/dénominateur) : produits {OA, CC, CKU, LCU} et segment
  {8110}.
- `NPL_CLASS` = {IIN, III, IV, V} (IIN de l'ancien référentiel = III du nouveau : toujours douteux).
- Ordre des classes : I, IA, IIA, II, IIN, III, IV, V ; rang : I 0 · IA 1 · IIA/II 2 · IIN/III 3 · IV 4 · V 5.
- Codes groupe « fourre-tout » (pas un vrai groupe) : '', 0, 888, 999.
- Souverain (exempté des limites de concentration ; seuil de bascule 180 j) : nom contenant ETAT(S), TRESOR, BCEAO,
  BANQUE CENTRALE, SOUVERAIN, MINISTERE, REPUBLIQUE, COLLECTIVITE(S).
- Banque (expositions interbancaires) : BANK, BANQUE, ECOBANK GROUP, CITIC, NATIXIS, SOCIETE GENERALE, ATTIJARI, BOA, CBAO.
- Seuil de solvabilité UMOA : **11,5 %**.
- Cours de conversion des sûretés en devise : EUR 655,957 · USD 600 · GBP 760 · CHF 680 · CAD 440 · XAF 1.

## 4. Dérivés calculés pour chaque ligne
- `excl` = produit ou segment exclu ; `gl292` = gl commence par 292 ; `npl` = classe ∈ NPL_CLASS **ou** gl292.
- `escompte` = produit+description contient ESCOMPT|EFFET|TRAITE|DISCOUNT|ESC (exclu de la contagion, art. 11).
- `ecl` = cprovF si > 0 sinon ototal × taux du stage ; `eclModeled` = vrai quand modélisé.
- `unused` = max(0, ftotal − ototal) ; `util` = ototal / ftotal.
- **Ancienneté d'impayé `dj`** (jours) = Reporting Date − la **plus ancienne** des dates Date In PDO / Date in NP,
  seulement si statut NP ou pdo > 0. `djProj` = dj + jours restant jusqu'à la fin du mois (projection à l'arrêté
  mensuel).
- **Seuil de bascule en douteux `djSeuil`** = 90 j ; **180 j** pour souverains, publics, collectivités
  (BUSINESS_SEGMENT contenant ETAT|PUBLIC|COLLECTIV|SOUVERAIN) — Instr. 026 art. 8.
- `nplProj` = npl ou djProj > djSeuil (douteux à la fin du mois si rien n'est régularisé).
- Garanties (logique PDO Monitor) : Security Code vide → **9000** (sans garantie) sauf segment CONSUMER/PARTICUL/
  RETAIL/DETAIL/MENAGE → **4250** (domiciliation de salaire). `garanti` = code présent et ≠ 9000 et ≠ 4250.
  Priorité des sûretés : code commençant par **3** = cash/DAT (prio 1), **54** = hypothèque 1er rang (prio 2), autres 3.
  Sûreté en devise convertie en XOF.

## 5. Feuilles annexes du classeur PDO (typage par la structure des colonnes)
Ligne d'en-tête = première ligne (25 premières) contenant un des jetons : Code Client, Compte, Référence, Relationship,
Client, Motif, Nouvelle classe, Encours, Solde XOF, Contrats, Produit, NUMERO DE COMPTE, Contracts/Accounts,
Ref Dossier, MONTANT A DOMICILIER, Collateral Value, Nom du Client, Documents Différés, Type de Facilité.

| Type (`kind`) | Détection dans les en-têtes | Usage |
|---|---|---|
| declass | « Nouvelle classe » ou « Motif » | déclassements récents |
| douteux | « Prov. requise » ou « Complément » | Douteux 292 : provision requise, complément à constituer |
| debiteurs | « Excess line » ou « Débiteur depuis » | comptes ordinaires débiteurs |
| croisement | « Impayés XOF » ou « Engagements » | consolidation impayés × engagements |
| impayes | « Échéance » | échéancier des impayés |

## 6. Sources annexes (Dashboard Watchlist) : feeds reconnus par leurs colonnes
| Feed | Détection | Clé | Rupture (`breach`) |
|---|---|---|---|
| garanties (sûretés) | « collateral value » + « security » | Code Client | — (valeur, devise, code, échéance ; échue si maturity < arrêté ; éligible si code ≠ 9000/4250 et valeur > 0) |
| assurance | « assuranc » | Code Client | statut contient échu/non/urgent/expir/dépass |
| deferral (documents différés) | « documents diff » / « différé » / « deferral » | Code Client | idem |
| dossiers échus / à échoir | « ref dossier » ou (« extensions » + « jours restants ») | Code Client | idem |
| domiciliation (avec ligne / sans ligne resp. / SME) | « domicil » ou « montant a domicilier » | NUMERO DE COMPTE (code client = chiffres sans les 3 derniers si > 9) | « Respecté » = non, ou toute cellule « non » |

Un second ACTE 7 chargé en annexe avec > 500 lignes est traité comme **arrêté N‑1** (migration réelle par compte et
par client, NPL N‑1). Les déclencheurs (`trig`) sont agrégés par client : ensemble des libellés de feeds en rupture.

## 7. Autres fichiers reconnus par l'application
- **Balance PCB** (état ECGCX4) : feuille avec colonne « Gl Code » ; colonnes Gl Desc, Classe, Dr Bal Lcy, Cr Bal Lcy.
- **Call memos** : Word individuel + Excel (report/seniors) — covenant de monitoring (voir 04).
- **CRM** (fichier client), **historique** d'arrêtés (mémoire), **Control Tower**, **Atelier PDO**, **DRAFT**.
