# 02 · Indicateurs de portefeuille (calculés comme dans APEX)

Toutes les formules ci-dessous sont celles du moteur (`compute`, `portfolioHealth`, `bigExposures`, `ewsScore`,
`scenarioResult`, `renderCapital`, concepts APEX). Les montants sont des XOF ; « encours » = Ototal incluant le PDO.

## 1. Agrégats de base (fonction `compute`)
| Indicateur | Formule |
|---|---|
| Encours total `enc` | Σ ototal (titres LGMO/LTB exclus dès l'ingestion) |
| Limites `ftot`, non tiré `unused`, utilisation | Σ ftotal ; Σ max(0, ftotal − ototal) ; enc / ftot |
| ECL (brut) | Σ ecl ligne (provision IFRS 9 renseignée, sinon ototal × taux du stage 1 % / 25 % / 100 %) |
| Couverture ECL | ecl / enc |
| Impayés PDO, ratio PDO | Σ pdo ; pdo / enc |
| **Ratio NPL BCEAO (exclusion symétrique)** | Σ ototal des lignes `npl` non exclues ÷ Σ ototal des lignes non exclues |
| Ratio NPL brut | Σ ototal npl ÷ Σ ototal (sans exclusion) ; repère de gestion : **< 5 %** |
| Couverture des douteux | Σ ecl des lignes npl non exclues ÷ numérateur NPL |
| Par classe / stage / segment / produit / gestionnaire / FRR | n, encours, ecl, pdo, npl par clé |
| Stage 2 + 3 (`stage23`) | encours S2 + S3 (« sous surveillance ») |
| HHI mono‑client, groupe, segment | Σ (part)² ; lecture : < 0,01 diversifié · < 0,05 modéré · < 0,10 concentré · sinon très concentré |
| Top 12 débiteurs, top 8 groupes, part du 1er | tri décroissant des encours consolidés |

### Agrégation client (clé Code Client)
Pour chaque client : encours, limite, ecl, pdo, sûretés, **classe la pire** (`worst`, rang le plus élevé), retard max
`maxDj`, retard max projeté `maxDjProj`, statut NP, lignes, groupe effectif.
- **Vrai groupe** : Group Code non fourre‑tout (≠ '', 0, 888, 999) et portant **≤ 3 noms** distincts de groupe (les
  buckets techniques portent des milliers de noms).
- `retail` = BUSINESS_SEGMENT contient CONSUMER|PARTICUL|RETAIL|DETAIL|MENAGE|STAFF.
- `isNpl` = classe pire ∈ NPL_CLASS **ou** une ligne npl (classe III/IV/V ou GL 292) ; `isNplProj` = isNpl ou une ligne
  franchit son seuil à la fin du mois ; `hasArrears` = pdo > 0 ou maxDj > 0.
- **ECL net de sûretés** : la sûreté réelle du client (feed GARANTIES, sinon codification ACTE 7) est imputée aux
  lignes les plus risquées d'abord (tri stage ↓, retard ↓, encours ↓) ; pour une ligne à ECL modélisé,
  ecl = taux × max(0, encours − part couverte) ; une provision réelle reste inchangée.
- Garanties : lignes éligibles (code ≠ 9000/4250, valeur > 0, non échue), types triés par priorité (cash/DAT, puis
  hypothèque 1er rang 54*, puis autres), prochaine échéance de sûreté, `garCov` = min(1, sûretés / encours),
  `enBlanc` = aucune sûreté.
- **Contagion (Instr. 026 art. 11)** : hors clientèle de détail, `contagion` = (douteux **et** au moins une ligne saine
  non escomptée) **ou** (non douteux et une ligne franchira 90 j d'ici la fin du mois). Type `reclass` (reclassement
  immédiat de tout l'encours consolidé) ou `proj` (bascule projetée).
- **Tension S1/S2** : non douteux et (pdo > 0 ou maxDj > 30 ou déclencheur Watchlist actif).
- Encours exposé `atRisk` = tout l'encours du client si douteux, en impayé ou en contagion.

Agrégats dérivés : encours/clients en impayé (`arrearsEnc/Clients`), douteux (`doubtfulEnc/Clients`), bascule
projetée fin de mois (`doubtfulProjEnc/Clients`), sûretés réelles et couverture (`collatReal`, `collatCov`),
clients sous déclencheur (`nTrig`, `encTrig`), compteurs 9000/4250, sûretés échues.

## 2. Indice de Santé du Portefeuille (0–100 → AAA…C) — `portfolioHealth`
| Axe | Points | Formule (bornée 0..max) |
|---|---|---|
| Qualité (NPL) | 25 | 25 − ratio NPL × 200 (0 % → 25 ; 5 % → 15 ; 10 % → 5) |
| Couverture des douteux | 18 | couverture × 18 |
| Pression Stage 2 | 15 | 15 − (encours S2 / enc) × 150 |
| Diversification | 15 | 15 − HHI client × 300 |
| Impayés (PDO) | 12 | 12 − (pdo / enc) × 240 |
| Charge Watchlist | 7 | 7 − (clients en watchlist / clients) × 35 |
| Dynamique de migration | 8 | 6 si pas de N‑1 ; sinon 4 − 0,4 × (dégradations − améliorations) + 0,1 × améliorations |

Grades : ≥ 90 AAA Excellente · ≥ 80 AA Très solide · ≥ 70 A Solide · ≥ 60 BBB Correcte · ≥ 50 BB Sous surveillance ·
≥ 40 B Fragile · ≥ 30 CCC Vulnérable · sinon C Critique.

## 3. Score EWS client (0–1000), PD, distance au défaut — `ewsScore`
- Facteurs : fDj = min(1, maxDj/180) · fCls = rang classe/5 · fStg = (stage max − 1)/2 · fPdo = min(1, 4 × pdo/enc) ·
  fUtil = u > 1 ? min(1, 0,5 + 2(u−1)) : 0,3 u · fNp = 1 si statut NP.
- score = 1000 × (0,28 fDj + 0,22 fCls + 0,18 fStg + 0,12 fPdo + 0,10 fUtil + 0,10 fNp) + 1,5 × (ESG − 50) +
  min(180, 45 × nb déclencheurs), borné 0..1000. ESG par défaut 50 (saisie 0–100).
- Bandes : < 400 Sain · 400–600 Surveillance · ≥ 600 Critique. Priorité watchlist : ≥ 600 URGENT · ≥ 450 ÉLEVÉE ·
  sinon MOYENNE.
- Notation interne de surveillance : douteux → D ; score < 150 A1 Très sain · < 300 A2 Sain · < 450 B1 Acceptable ·
  < 600 B2 Sous surveillance · < 750 C1 Fragile · sinon C2 Critique (la fiche mail simplifie en A/B/C).
- **PD depuis le FRR** (courbe interne) : FRR 1 0,3 % · 2 0,5 % · 3 0,8 % · 4 1,2 % · 5 1,8 % · 6 2,5 % · 7 5 % · 8 11 % ·
  9 40 % · 10 95 % ; défaut 2 %. **DD** = −Φ⁻¹(PD) / (vol segment / 0,25), vol CORPORATE 0,22 · COMMERCIAL 0,30 ·
  CONSUMER 0,38 · N/A 0,30.

## 4. Signaux client (`clientSignals`) et recommandations (`clientReco` → `causeReco`, voir 03)
Rupture (`br`) : impayé > 90 j · dépassement de limite (u > 1) · PDO > 10 % de l'encours · classe douteuse · à
déclasser par contagion · déclencheur Watchlist · dégradation de classe vs N‑1.
Avertissement (`wa`) : retard 1–90 j · ligne saturée (u > 95 %) · classe II/IIA · sûretés < 20 % (encours > 50 M) ·
call memo ancien (> 120 j) ou manquant (encours > 200 M, non détail) · nouvel engagement > 100 M.
Sévérité d'un client = 10 × ruptures + avertissements.

## 5. Watchlist (`isWatch`) = portefeuille **non encore dégradé** sous surveillance
Client non douteux et (déclencheur actif **ou** score EWS ≥ 500 **ou** contagion/tension **ou** dégradation de
classe vs N‑1 **ou** nouvel engagement > 100 M). Les douteux en sortent (suivis en recouvrement).

## 6. Migration vs arrêté N‑1 (`migOf`)
Appariement par Code Client : dégradation (rang pire ↑), amélioration, nouvelle entrée en douteux, cure (sortie de
douteux), nouveau client. Dynamique nette = dégradations − améliorations (défavorable si > 0).
Matrice de transition empirique par compte (classe N‑1 → N) ; illustrative (0,90 diagonale, 0,06, 0,025, 0,005) sans N‑1.

## 7. Grandes expositions et capital (`bigExposures`, `renderCapital`, `whatIf`)
- Limite de division des risques : **25 % du CET1** par vrai groupe ou client ; grand risque ≥ 10 % ; clients sans
  groupe retenus si encours ≥ 5 % du CET1 ; **souverains exemptés** (banques signalées).
- RWA standard = encours × pondération de classe × densité (I/IA/IIA/II 100 %, IIN/III/IV/V 150 %, éditables) ;
  solvabilité = CET1 / RWA vs **11,5 %** ; sensibilité NII = choc de taux × encours (proxy repricing < 1 an).
- What‑If d'un octroi : ΔECL = taux stage × max(0, montant − sûreté × LGD) ; ΔRWA = montant × pondération de stage
  (S1 0,75 · S2 1,0 · S3 1,5 × densité) ; nouveau ratio NPL, solvabilité, exposition/CET1 (alerte > 25 %).

## 8. Stress paramétrique (`scenarioResult`) — hypothèses ajustables, jamais des états officiels
Paramètres par défaut : pdMult base 1 / adverse 1,8 / sévère 3,2 · LGD 45 % · décote sûretés 10 % · sévérité de
migration 15 % · CCF 30 % · corrélation 1 · spread refi 1,5 % · CPR 8 % · choc de taux 2 % · CET1 60 Mds · densité RWA 1.
- Migration : down1 = min(0,6, migSev × (mult − 1)) ; down2 = min(0,75, 1,4 × migSev × (mult − 1)) ; S1' = S1(1−down1) ;
  S2' = S2(1−down2) + S1·down1 ; S3' = S3 + S2·down2.
- ECL stressé = S1'·r1 + S2'·r2 + S3'·r3 (r3 = eclS3 × LGD/0,45) + tirage CCF (0,5/1/1,3 × CCF × non tiré × corr) × r2.
- RWA = S1'×0,75 + S2'×1 + S3'×1,5 (× densité) + tirage ; ratio = CET1 / RWA ; surcoût NII = spread × (0,4/1/1,3) × encours ;
  charge P&L = ECL stressé − ECL courant. Mur de maturité par tranches 0‑12, 12‑24, 24‑36, 36‑48, 48‑60, 60m+, n/d.

## 9. Covenants opérationnels (`covStatus`) et cross‑default
Cinq covenants dérivés : aucun impayé > 90 j (warn > 30) · utilisation < 100 % (warn > 90 %) · domiciliation des flux
(feed Dashboard prioritaire, sinon champ domicile) · échéance non dépassée avec encours · hors douteux (warn II/IIA).
Statut client = pire covenant (dérogation possible). **Cross‑default** : une rupture dans un vrai groupe contamine
les entités liées non en rupture.

## 10. Concepts APEX (indicateurs originaux, `CNC_DOC`)
| Sigle | Définition / formule | Seuils |
|---|---|---|
| IPB Indice de Pression de Bascule (%) | Σ encours sain × min(1, jours/seuil)² ÷ Σ encours sain (seuil 90 j, 180 j souverains/publics) | < 1 % calme · 1–3 % vigilance · > 3 % tension |
| DVI Demi‑vie de l'impayé (j) | Δt × ln 0,5 ÷ ln(1 − taux de régularisation entre deux arrêtés) | < 45 rapide · 45–120 normal · > 120 inertie |
| CIR Coefficient d'Inertie du Recouvrement (%) | encours douteux depuis ≥ 270 j ÷ encours douteux ; masse inerte = Σ max(0, encours − dépréciation IFRS 9) | < 30 % sain · 30–50 % vigilance · > 50 % figé |
| EAP Écart d'Alignement Prudentiel (%) | Σ \|IFRS 9 − provision BCEAO requise (20/50/100 % selon ancienneté)\| ÷ encours douteux | < 10 % aligné · 10–25 % divergence · > 25 % rupture |
| ICC Indice de Contagion Concentrée (% FP) | Σ encours des 20 premiers groupes « contaminés » (un membre en impayé ou douteux) ÷ fonds propres (sinon encours total) | < 25 % faible · 25–75 % marqué · > 75 % systémique |

## 11. Portefeuille à risque, appétit pour le risque, sensibilité NPL
- PAR30/60/90 = encours des clients dont le retard max > 30/60/90 j (PAR90 inclut les douteux) ÷ encours.
- Appétit pour le risque (seuils indicatifs à valider) : NPL alerte 5 % / limite 8 % · couverture des douteux min 70 % /
  50 % · PAR30 8 % / 12 % · Stage 2 10 % / 15 % · top 20 hors souverains 40 % / 55 % · solvabilité implicite min 14 % /
  11,5 % · couverture par sûretés min 25 % / 15 %. Vert sous l'alerte, orange entre, rouge au‑delà de la limite.
- Tornade NPL : régularisation des 10 premiers douteux, passage en perte des douteux > 4 ans, croissance de la base 5 %,
  bascule J3‑J4, bascule COD ≥ 60 j, reclassement des contagions — écart en pb vs ratio actuel.

## 12. Radar de robustesse (8 axes, 0 fragile → 100 solide)
Qualité 100 − NPL × 1000 · Couverture = couverture douteux × 100 · Stage 2 = 100 − part S2 × 400 · Concentration =
100 − HHI×10000/15 · Sûretés = couverture × 250 · Capital = 100 − UL/CET1 × 150 (50 sans CET1) · Conformité =
100 − 300 × part des secteurs en dépassement (70 sans limites) · Surveillance = capture × 60 + AUC × 40 (60 sans N‑1).
