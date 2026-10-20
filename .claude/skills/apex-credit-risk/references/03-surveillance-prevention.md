# 03 · Surveillance et prévention des dégradations (logique PDO Monitor / APEX)

Objet : le portefeuille **non encore dégradé**. Les créances déjà douteuses sortent de la watchlist et relèvent du
recouvrement et du provisionnement (voir 04 pour les douteux et 06 pour les règles BCEAO).

## 1. Déclencheurs de déclassement et analyse causale (`clientCause`)
Seuils du moteur : impayé de droit commun **90 j** (`IMP_SEUIL`), COD **300 000 XOF** (`COD_SEUIL`), restructuré en
retard **≥ 31 j** (`R_SEUIL`).
Nature du concours par code produit : TOD, AX = compte ordinaire débiteur (COD) · R…LX, RLX, RTLX = restructuré ·
CKU, CC, AE, GCP, LCU = engagement par signature · autres = crédit.

Déclencheurs (ordre d'apparition, sévérité br/wa) :
1. `codAge` COD débiteur depuis > 90 j (ancienneté dès le dépassement de limite ou le tirage non autorisé, art. 8 al. 2) ;
   `codYoung` COD de 1–90 j (à régulariser avant le seuil).
2. `imp` impayé > 90 j ; `impproj` franchissement du seuil projeté à la fin du mois.
3. `cod` COD > 300 000 XOF.
4. `restr` créance restructurée en retard ≥ 31 j (retour en douteux, art. 7).
5. `gl292` lignes logées en GL 292 (douteux comptable non reflété dans la classe).
6. `pdoTotal` encours intégralement porté en impayé (≥ 99,9 %) : déchéance du terme ou passage intégral en souffrance.
7. `stage3` Stage 3 IFRS 9 sans classification douteuse.
8. `iin` classe II / IIA (watch‑list : dernière classe saine).
9. `contagion` art. 11 (reclassement intégral ou bascule projetée).

**Cause racine** (`causeRoot`) : la ligne entrée la première en non‑performant (Date in NP la plus ancienne) est
l'origine ; les autres lignes NP sont contaminées. À égalité, on remonte au début propre de chaque ligne (début du débit
pour un COD, entrée en PDO pour un contrat) ; à date égale le COD l'emporte.
**Verdict** : déjà douteux → le classement s'explique par les déclencheurs (sinon classement d'appréciation art. 8 al. 1
à documenter) ; non douteux avec déclencheur de rupture → « situation incohérente au regard des données : déclasser ou
justifier le maintien » ; sans déclencheur → conforme, surveillance de routine.
**Faits** : part de l'impayé dans l'encours, lecture produit par produit (4 plus grosses lignes), sûretés (en blanc ou
couverture).

## 2. Recommandations causales (`causeReco`)
A. **Déjà douteux** : recouvrement ciblé sur la ligne d'origine (retour en sain après un an de paiements réguliers,
art. 10) ; **provision art. 16** selon l'ancienneté en douteux (20 % < 90 j, 50 % 90–269 j, 100 % ≥ 270 j) sur la part
non couverte, insuffisance chiffrée ; sûretés à réaliser / exposition en blanc ; passage en irrécouvrable au terme du
5e exercice (art. 13) si ≥ 4 ans ; gel des concours.
B. **Non douteux avec données de défaut** : régulariser la ligne d'origine (COD ou contrat) qui libère l'encours
contaminé ; instruire le déclassement ou documenter le maintien ; échéance critique de fin de mois ; COD à surveiller ;
COD > 300 000 ; restructuré ; GL 292 ; sûreté à obtenir (en blanc > 50 M) ou renforcer (< 50 %) ; sûretés échues à
renouveler ; déclencheurs (assurance, deferral, dossier, domiciliation) ; call memo manquant.

## 3. Impayés 30–90 jours : plages, criticité, plan d'action (`crmTailor`)
- Périmètre : crédits amortissables de contreparties saines, pdo > 0, 30 ≤ jours < 90, hors TOD/AX/CC/CKU/LCU/OA, hors
  restructurés (R…), hors douteux/NP. Source : fichier « Impayés 30‑90 j » (colonnes Réf, Code Client, Client, Produit,
  Segment, Gestionnaire, Échéance, Jours, Délai, Bande, Classe, Stade, Montant, Criticité, Action recommandée) ou
  reconstitution depuis l'ACTE 7.
- **Plages** : J1 30–45 j · J2 46–60 j · J3 61–75 j · J4 76–90 j (J5 > 90 seuil franchi, J0 < 30).
- **Criticité de base** : J1 particulier FAIBLE / entreprise MOYENNE · J2 MOYENNE · J3, J4 ÉLEVÉE · J5 CRITIQUE ;
  **+1 niveau** pour une entreprise dont l'impayé ≥ **10 M XOF**.
- **Protocoles** (contact / régularisation / marge avant bascule, jours) : FAIBLE 7 / 21 / 20 (relance auto, suivi
  hebdo) · MOYENNE 3 / 15 / 15 (téléphone, SMS, lettre, cause, suivi hebdo) · ÉLEVÉE 2 / 15 / 7 (visite, mise en
  demeure, plan formalisé ≤ 15 j) · CRITIQUE 1 / 7 / 5 (visite, réaménagement étudié avant 90 j).
- Diagnostic ligne : jours (fichier + décalage à l'arrêté), date de bascule d90, bascule avant clôture, écart de
  décompte > 7 j avec l'ACTE 7, part de l'impayé dans l'encours (échéances vs capital exigible), ligne échue,
  relation (encours, lignes en impayé, déjà douteux, **contagion** si non détail et encours sain contaminable
  ≥ max(1 M, 10 % de la ligne)), ligne d'origine, sûretés (en blanc, couverture < 50 %, échues, code 4250 seul),
  déclencheurs, call memo, trajectoire N‑1 (impayé apparu / en hausse > 10 % / en baisse > 10 %), cohérence classe
  (IA avec > 30 j → II attendu) et stage (S1 avec > 30 j → S2 à documenter).
- Score de criticité révisée : seuil franchi 34 · délai ≤ 10 j 30 · ≤ 20 j 22 · ≤ 35 j 12 · ≤ 50 j 6 · + 10 bascule
  avant clôture · + 6 si ≥ 45 j · montant ≥ 100 M 25 · ≥ 20 M 16 · ≥ 5 M 9 · ≥ 1 M 4 · sinon 1 · + facteurs
  (contagion 8/15/25 selon 10 M/100 M, en blanc 6/12, ligne échue 8, aggravation 8, déclencheur 5, sûreté échue 6…).
  **Vigilance renforcée** = ≥ 2 facteurs aggravants, ou 1 facteur et impayé ≥ 10 M.
- Impact d'une bascule : base = ligne + encours contaminé ; IFRS 9 : + base × (1 − couverture) − ECL actuel ;
  BCEAO art. 16 : + 20 % de la part non couverte au déclassement, + 50 % à 3 mois, + 100 % à 9 mois ; + pb de NPL.
- Plan daté : premier contact ≤ min(aujourd'hui + contact, d90 − 2 j) ; régularisation ≤ min(aujourd'hui + regul,
  d90 − marge) (48 h si seuil franchi) ; escalade à d90 − 2 j ; étapes propres (particulier : employeur /
  domiciliation ; entreprise : flux, carnet de commandes, trésorerie ; ligne d'origine ; contagion ; sûretés ;
  déclencheurs ; CRITIQUE : réaménagement = créance restructurée, art. 6). **Planification réaliste** : par
  gestionnaire, 5 premiers contacts par jour ouvré au plus, dossiers classés par urgence.
- Statut à chaque nouvel arrêté : Actif / Régularisé (vérifier 2 échéances) / Basculé (> 90 j) / Sortie (absent).
  Évolution : Nouvelle entrée / Aggravé (montant +5 % ou criticité ↑) / Stable.
- Statistiques : matrice plage × criticité, calendrier des bascules par semaine (S0…S+n), par gestionnaire, PAR.

## 4. Comptes ordinaires débiteurs (`debPlan`)
Même logique de plages sur l'ancienneté du débit. Périmètre : solde > 0, non NP, et (jours ≥ 30 ou sans autorisation
≥ 1 M, ou dépassement ≥ 1 M, ou autorisation expirée ≥ 1 M). Diagnostics propres : **sans autorisation** (ancienneté
dès le premier jour), **dépassement** (> 102 % de la limite), **autorisation expirée**, contagion, sûretés,
déclencheurs ; impact IFRS 9 / BCEAO / NPL ; plan : couvrir le solde ou faire approuver une autorisation adossée aux
flux, renouveler ou clôturer, suspendre les tirages, vérifier la domiciliation ; escalade ; 72 h si > 90 j.
Contagion COD (`trCodWatch`) : COD non douteux, non détail, dont l'ancienneté > 90 j (à date) ou le franchira à la
clôture : tout l'encours sain (< 90 j, hors escompte) de la relation est « contaminable ». `trCodUnclassified` : COD
> 90 j non déclassés (déclassement dû au titre de l'art. 8 al. 2, indépendamment de la contagion).

## 5. File de triage à SLA (`trQueue`, `cdPriorityClients`)
Priorité client : GL 292 non classé +45 · contagion +35 · bascule fin de mois +30 · impayé > 60 j +18 · déclencheurs
+10 chacun (max 3) · sûretés < 30 % et encours > 500 M +12 · call memo manquant +8 · limite dépassée +8 ; × (1 +
min(1,5, 60 × part de l'encours)). Horizon : Immédiat (GL 292 ou contagion) · Fin de mois (bascule projetée) · 30 jours
(impayé > 60 j) · Trimestre. **SLA** : Immédiat 2 j · Fin de mois 7 j · 30 jours 15 j · Trimestre 30 j ; hors SLA si
l'ancienneté du signal dépasse le SLA. Statuts : À traiter / En cours / Traité. Deltas vs N‑1 : nouveaux douteux,
dégradations, nouveaux impayés, retours en sain. Sûretés échues ou à renouveler sous 90 j.

## 6. Efficacité de la surveillance (standard agences de notation, `efBacktest`)
Population : clients sains à N‑1 présents à N. Signaux N‑1 : Stage 2, classe IIN, classe IIA, impayé, retard > 30 j,
retard > 60 j, compte débiteur. Score ordinal N‑1 : IIN 30 / IIA 15 / IA 5 ; S2 20 / S3 30 ; retard > 60 30 / > 30 20 /
> 0 10 ; impayé 10 ; COD 10 (max 100). Mesures : taux de capture, précision, lift, AUC (Mann‑Whitney), KS ; grade AUC
≥ 0,8 Excellent · ≥ 0,7 Bon · ≥ 0,6 Acceptable · sinon Insuffisant ; performance par signal ; défauts non anticipés ;
matrice de transition (I, IA, II, IIN, III, IV, V + sortis) avec PD à 1 mois par classe saine ; charge par gestionnaire
(dossiers en file / moyenne : ≥ 2 Saturé · ≥ 1,3 Élevé · ≥ 0,7 Normal · sinon Faible).

## 7. Covenants documentaires et déclencheurs Watchlist (`covAnalysis`)
Familles (poids dans le score de conformité client 100 − Σ) : Dossiers de crédit échus 25 · Deferral 20 · Assurances
échues 20 · Domiciliation non respectée 15 · Call memo manquant 15 (ancien > 120 j : 8) · autres 10. Lecture :
**lift** = taux d'impayé des clients en manquement ÷ taux du portefeuille (> 1,2 : surrisque ; sinon risque
documentaire et position de recouvrement). Conformité par gestionnaire (dossiers ≥ 50 M ou avec déclencheur).

## 8. Prochaine meilleure action (`nbaActions`)
File unique dédoublonnée par (client, source), classée priorité P1–P4 puis impact puis échéance : impayés 30‑90 j
(criticité → priorité ; ÉLEVÉE avant clôture ou vigilance → P1), COD > 90 j (P1 si relation ≥ 50 M, P2, P3 ; échéance
3 j ou 10 j si ≥ 50 M ; impact 75 % de l'encours), contagion (P1 si ≥ 50 M, échéance 5 j), sûretés échues (P2, 15 j,
impact 45 % de la valeur), crédits échus (P1/P2), anomalies décaissement/refinancement (P3), recouvrement des 15 plus
gros douteux (P3, 30 j, impact 20 %). Chaque action : responsable, échéance, impact, « pourquoi ».

## 9. Anomalies de portefeuille (`anomScan`) et qualité des données (`dqScan`)
Anomalies : crédit échu non remboursé (≤ 30 j, 31–90 j, 3–12 mois, > 1 an, avec recommandation art. 8/13/16) ·
échéance dépassée sans impayé (prorogation non saisie) · encours > limite (+5 % et > 1 M) · nouveau concours ≤ 60 j
sur relation en impayé (≥ 1 M) · refinancement possible (evergreening : nouveaux concours ≤ 90 j ≥ 80 % des impayés ≥ 30 j)
· LTV > 150 % (encours > 100 M). Hors découverts et renouvelables (TOD/AX/CC/CKU/LCU/OA).
Qualité des données (score 100 − pénalités, poids Critique 12 · Élevée 6 · Moyenne 3 · Faible 1) : contrats en double,
code client manquant, encours négatif, impayé > encours, Stage 3 sans classe douteuse, classe douteuse en Stage 1,
échéance manquante (amortissables), échéance antérieure à la mise en place, client sans gestionnaire, SIC non codifié.

## 10. Calendrier de surveillance (6 semaines) et registre des moteurs
Par semaine : montants qui basculent (30‑90 j et COD), échéances d'actions, sûretés à renouveler. Le registre exécute
réellement chaque moteur (ingestion, NPL, contagion, cause racine, garanties, codification, triage, backtest, mémoire,
Markov, capital, Monte Carlo, stress, anomalies, qualité, 30‑90 j, preuves de reproductibilité et de réconciliation)
et consigne statut, durée, résultat et limites.
