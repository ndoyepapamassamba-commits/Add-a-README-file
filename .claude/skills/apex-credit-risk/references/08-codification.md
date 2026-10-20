# 08 — Codification : SIC, sûretés, produits, segments, devises, pays, agences, programmes produits

Source : APEX `CODIF` et aides `cdSic`, `cdSector`, `cdProd`, `cdSeg`, `cdSec`, `cdGrp`, `cdPP`, `cdAgence`, `cdFamily`, `cdSectorLimits`, `cdOfficerScorecard`.
Données : `data/codification.json` (clés `sic`, `sec`, `prod`, `seg`, `ccy`, `dom`, `ag`, `pp`). Les référentiels **groupes clients** et **limites sectorielles internes** ne sont pas dans le dépôt : les charger depuis le fichier de l'utilisateur (feuille « CODIF » ou « Limites ») ; sans eux, écrire « NON CODIFIÉ » / « limite non renseignée ».

## 1. Règles de lecture
- Un code absent du référentiel ⇒ libellé **« NON CODIFIÉ »** (jamais un libellé deviné), et le code brut est conservé à côté.
- Les codes sont comparés après `trim()` et mise en majuscules ; les codes numériques gardent leurs zéros de tête (`'0111'` ≠ `'111'` ⇒ essayer les deux).
- `cdFamily` regroupe les produits en familles pour la fiche client : Trésorerie (AX, TOD, LX), Terme (TLX, HTLX, CTLX…), Immobilier (NHTLX, HITLX, PP_1300), Auto/Moto (ATLX, MTLX), Crédit-bail (LEASE), Escompte (BD, BN), Restructuré (RLX, RTLX), Signature (CKU, CC, AE, GCP, LCU), Marché (CP, PLX, LTB, LGMO, INV, PSR), Interbancaire (OA).

## 2. Secteurs d'activité (`sic`, 965 codes)
Chaque code ⇒ `[libellé, secteur, section]` ; `cdSic(code)` renvoie les trois ; `cdSector(code)` le secteur (ex. `111` → Blé · AGRICULTURE · A). Les secteurs servent aux limites sectorielles, au radar et au choc sectoriel du stress.

## 3. Limites sectorielles (`cdSectorLimits`)
Pour chaque secteur : `[plancher, plafond]` en part de l'encours total (fichier utilisateur). Statut : **dépassement** si part > plafond, **sous-exposition** si part < plancher, **conforme** sinon ; afficher part, plafond, écart en XOF.

## 4. Codes de sûretés (`sec`, 49 codes) et éligibilité
Familles : 1xxx contre-garanties bancaires ; 2xxx stand-by / avals / titres banque centrale ; 3xxx espèces, épargne, DAT, titres ; 4xxx nantissements de stocks, créances, **4250 domiciliation de salaire**, fonds de commerce ; 5xxx nantissements d'actifs et d'équipements, **54xx hypothèques** (5400 1er rang, 5410 pari-passu, 5420 2e rang, 5430 3e rang, 5440/5450 par destination, 5500 promesse) ; 6xxx cautions de sociétés, **6500 garantie de l'État** ; 7xxx cautions personnes physiques / actionnaires ; 8xxx lettres d'intention ; **9000 sans garantie**.
Priorité d'éligibilité (`secPrio`) : espèces et DAT (3xxx) > banques et État (1xxx, 2xxx, 6500) > hypothèques 1er rang (5400, 5440, 5450, 5410) > autres nantissements > cautions > lettres d'intention > 9000. Les hypothèques 54\* sont plafonnées à l'encours (fiche 04).

## 5. Produits (`prod`, 28 codes) ⇒ `[libellé, catégorie]`
Catégories : *Loans and Advances* (AC, ATLX, AX, BD, BN, CP, CTLX, HITLX, HTLX, LEASE, LX, MTLX, NHTLX, RLX, RTLX, TLX, TOD), *Contingent* (AE, CC, CKU, GCP, LCU), *Operating Accounts with Banks* (OA), *Placements* (PLX), *Treasury bills* (LTB), *Government Bonds* (LGMO), *Corporate Bonds* (INV), *Pre-Settlement Risk* (PSR).
Exclusions symétriques du ratio NPL : OA, CC, CKU, LCU ; titres LGMO, LTB hors champ ; RLX/RTLX = restructurés (compte 291).

## 6. Segments (`seg`, 14 codes)
1000 Particuliers · 1500 Micro-entreprises · 1600 PME · 8100 Institutions financières · 8110 Micro-finance (exclu) · 8200 Entreprises locales · 8300 Grande entreprise locale · 8400 Multinationales · 8500 Entreprises régionales · 8600 Parapubliques · 8700 ONG internationales · 8750 ONG locales · 8800 État central et démembrements · 8900 Entités gouvernementales locales.
Retail = 1000 et 1500 (PD/corrélation retail dans la fiche 09) ; BU CSB / CMB / CIB dans la fiche 07.

## 7. Devises (`ccy`, 48 ISO 4217), pays (`dom`, 241 codes ISO 3166 avec libellés français), agences (`ag`, 38 codes `L01`…`L40` → nom d'agence), programmes produits (`pp`, 27 codes → `[libellé, famille PP]` : Salary Backed, Asset Finance, Inventory Finance, Contract/LPO/Receivables, Cash/T-Bill/Bank Guarantee Backed, Charge, PP Old).

## 8. Scorecard gestionnaire (`cdOfficerScorecard`)
Par gestionnaire (`off`), score sur 100 :

| Axe | Poids | Mesure |
|---|---|---|
| Qualité du portefeuille | 40 | 1 − (encours NPL + S2) / encours |
| Impayés | 20 | 1 − impayés / encours |
| Déclencheurs | 15 | 1 − dossiers avec déclencheur / dossiers |
| Watchlist | 10 | 1 − dossiers watch / dossiers |
| Covenants | 15 | 1 − bris / covenants suivis |

Grades : **A ≥ 80**, **B ≥ 65**, **C ≥ 50**, **D** sinon. Présenter avec le nombre de dossiers et l'encours géré ; un gestionnaire absent du fichier n'est pas noté.
