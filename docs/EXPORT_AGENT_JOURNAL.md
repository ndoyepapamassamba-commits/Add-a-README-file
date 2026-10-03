# Journal de l'agent EXPORT

Chaque passage ajoute une entrée : changements, défauts trouvés et cause racine, contrôles passés, idées
suivantes. Les leçons servent de garde-fous pour les passages suivants.

---

## 2026-10-03 — APEX 38 : couche sémantique avancée partout, apprentissage supervisé, chaîne reproductible

### Changements

- **Stress narratif** dans les exports qui ont des données :
  - Excel RI : section RISK avec tableau et barres 3D, plus insight 09 ;
  - Word/PDF : tableau dédié ;
  - PowerPoint : diapositive en barres 3D ;
  - Impayés : feuille « Stress narratif » ;
  - salles : ligne de synthèse dans la feuille sémantique.

  L'analyse sémantique juge seulement l'exposition (probabilité ≥ 0,60). Les montants et les entrées en douteux attendues, base et stress ×2 EXPERT, sont calculés par le code.
- **Bénéficiaires potentiellement liés** (CONCENTRATION et Word/PDF).
  - Le code repère les paires de noms sur des mots non génériques.
  - L'analyse sémantique donne deux jugements : un lien (Score de 0 à 2) et « même famille » (Noul).
  - « Lien probable » n'apparaît que si les deux jugements concordent (lien ≥ 1,1 et même famille ≥ 0,60).
  - Sur la démo, les trois vraies paires sont retenues et les deux pièges écartés. Les pièges (SAHEL, NIAYES) obtiennent un lien de 0,91–0,92 et une probabilité « même famille » de 0,43–0,50.
- **Phrase de lecture du Comité** et **importance de chaque constat**, obtenues par un appel portefeuille.
  - Les insights sont triés par importance.
  - Le constat choisi porte le badge « ◆ LECTURE DU COMITÉ ».
- **Action recommandée** (catalogue du code) dans WATCHLIST, ACTIONS, l'export Impayés et la feuille sémantique des salles.
- **Analyses avancées Risk Outlook** dans Word/PDF, PowerPoint et la feuille sémantique des salles. L'Excel RI et la salle les avaient déjà. Insight 10.
- **AUDIT** : couverture de toutes les capacités (dates par composants, données sensibles, famille, action, contrôle
  d'ordre, stabilité, stress narratif, phrase de lecture, bénéficiaires liés, version exacte et jetons).
- **Lot sémantique enrichi** (`tsLot`, asynchrone).
  - État de chaque dossier : secteur, garantie, taille d'exposition, trajectoire des impayés.
  - Bloc portefeuille : constats, paires et noms cités.
- **Anonymisation complète** (`--anonymiser`) : alias stables par client ; noms masqués dans le commentaire, le plan
  et les constats ; paires de noms retirées de l'appel.
- **Apprentissage supervisé** (`apprentissage.py`). Le modèle n'est pas réentraîné.
  - `a_valider.xlsx` propose une liste déroulante par question.
  - Les réponses validées deviennent des exemples joints aux consignes : 2 par option, 12 au plus.
  - Les seuils sont recalibrés dès 10 cas (90 % d'accord, plancher 0,40).
  - La version de la mémoire entre dans la clé du cache.
  - Test mécanique sur une mémoire temporaire : l'API accepte les consignes avec exemples, 7 jugements changent et les dossiers en revue passent de 16 à 11.
- **Chaîne de construction dans le dépôt** (`outils_export/`), reproductible à l'octet près.
  - Tests, jeux d'essai synthétiques, validateur.
  - Visuels Blender régénérables d'une commande (vignette comprise).

### Défauts trouvés et causes racines

1. **La couche CSS 3D a été insérée dans la bibliothèque XLSX.** Le premier `</head>` du fichier est une chaîne
   interne de la bibliothèque, ce qui cassait tous les exports Excel.
   Correctif : ancre unique `\n</head>\n<body>\n<!-- TOPBAR -->` avec assertion.
   → Toujours ancrer sur un contexte unique et vérifier la syntaxe de *tous* les scripts.
2. **`\n` littéral dans le moteur RI.** Un échappement Python (`\\n` dans une chaîne non brute) produisait une
   erreur de syntaxe sur toute la feuille RI. → Chaînes brutes, et `node --check` après chaque construction.
3. **Phrase de lecture jamais reconnue.** La bibliothèque relit l'identifiant de choix « 01 » comme le nombre 1.
   → Normaliser les identifiants (`padStart`) : les options de Choice à l'allure numérique sont fragiles.
4. **« RISK OUTLOOK OUTLOOK ».** Le renommage générique s'appliquait à « JEV OUTLOOK ». → Règles spécifiques
   d'abord ; les parenthèses « (JEV) » sont retirées.
5. **Le renommage du HTML/PDF parcourait aussi les images base64.** Le risque de corruption était latent. → Les data URI sont exclues.
6. **Navigation tronquée sur les feuilles à colonnes d'espacement** (INSIGHTS). → Bornes réparties selon la
   largeur réelle des colonnes.
7. **Puces de statut tronquées après renommage.** Les libellés étaient plus longs. → Libellés courts (« SÉMANTIQUE », « OUTLOOK · PD 12M »).
8. **Anonymisation incomplète.** Le commentaire et les constats partaient en clair. → Masquage étendu.
9. **Mise en page à reprendre** : en-tête « Même famille (p) » coupé et notes sur deux lignes tronquées. → Hauteurs de ligne ajustées.
10. **Version exacte du modèle visible.** « jev-1.13.0 » apparaissait dans l'export Impayés, la salle Analyse profonde et le Word, car le renommage ne visait que « jev-latest ».
    Correctif : « moteur sémantique v1.13.0 ». La version est gardée pour l'audit, sans le nom interne. L'agent embarqué détecte aussi `jev-…`, `Jev` et `TYPESAFE`.
    → Chercher les noms internes avec une expression large (`jev[-_]…`, insensible à la casse), pas seulement les alias connus.
11. **Cache d'enrichissement aveugle au contexte.** Le secteur, la garantie, la taille et la trajectoire n'entraient pas dans la clé : un contexte modifié réutilisait l'ancien jugement. → Contexte ajouté à la clé quand il est présent.
12. **Graphiques 3D vides dans le PowerPoint** (pont des impayés, stress narratif). `P.ChartType.bar3D` n'existe pas : la constante de PptxGenJS est `bar3d`.
    → Toujours vérifier dans le fichier produit que chaque `chartN.xml` contient bien un élément `<c:…Chart>`.
13. **PowerPoint non conforme** : 28 erreurs de schéma, 148 dans une version précédente. PowerPoint pouvait proposer une « réparation » à l'ouverture.
    Correctif : `pptxFix` dans `pmFinish`, pour toutes les salles. Il traite :
    - un seul `a:pPr` en tête de paragraphe ;
    - `notesMasterIdLst` à sa place ;
    - `grouping` des courbes ;
    - `marker` avant `dLbls` ;
    - axes orphelins retirés ;
    - série « base » des cascades invisible.
    Résultat : **0 erreur**. Rotation 3D discrète (8° / 12°) et scénarios triés du plus exposé au moins exposé.
14. **« −0 » dans le pont des impayés** (Word, PDF, PowerPoint) : les postes nuls recevaient un signe. → Un poste nul s'affiche « 0 », sans signe, en gris.

### Contrôles passés

- Tous les scripts inline : syntaxe valide (`node --check`).
- Validateur Open XML : 0 erreur pour les 7 variantes Excel RI, l'export Impayés, la salle Analyse profonde, le Word et le PowerPoint.
- Construction reproductible : `build.sh` redonne exactement l'APEX livré (même SHA-1).
- Journal de l'agent embarqué : 6 exports « conforme » (Excel ×3, Word, PowerPoint, calibration auto Risk Outlook sur 9 arrêtés).
- Aucun nom interne (TypeSafe, JEV, jev-latest) dans les fichiers livrés ; pas de doublon de renommage.
- Tailles : RI xlsx 259 Ko, docx 1,6 Mo, pptx 1,8 Mo, PDF 1,8 Mo ; Impayés 6,4 Mo et salle profonde 11,6 Mo, inchangés.
- Rendu LibreOffice relu : RISK (stress narratif), CONCENTRATION (bénéficiaires), INSIGHTS (badge), EXECUTIVE.

### Idées suivantes

- Salle Analyse profonde (11,6 Mo) et Impayés (6,4 Mo) sont lourds : mesurer la part des données et des images, puis alléger.
- Les insights 08 et 09, calculés après le lot, n'ont pas de score d'importance. Prévoir un second appel portefeuille ou un rang par défaut documenté.
- Ajouter l'exposition aux scénarios au fichier `a_valider.xlsx` pour calibrer le seuil de 0,60 sur des validations réelles.
- AUDIT : afficher l'état de la mémoire d'apprentissage (exemples, seuils recalibrés) quand le retour en contient.
- Jeux d'essai : les codes SIC synthétiques tombent tous dans l'agriculture. Un générateur aux secteurs variés rendrait les tests plus réalistes.
