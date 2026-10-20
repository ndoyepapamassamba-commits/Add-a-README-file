# Charte d'export verrouillée — « GOD 3D · BLUE ECOBANK »

Relevée sur le classeur de référence **Impayés 30-90j plan d'actions** et imposée à **tous** les exports de l'application :
Excel (`data.export`), Word / PowerPoint / PDF-HTML / mail (`report.export`), ainsi qu'aux fichiers que les agents
génèrent eux-mêmes (règles injectées dans leurs prompts).

| Élément | Valeur |
|---|---|
| Marine (bandeau titre) | `#001B4D` |
| Bleu Ecobank (sous-titre, en-têtes de tableau, liens) | `#003DA5` |
| Or (filet d'accent, sous-titre sur marine) | `#C8A951` |
| Cyan (onglet données, statut I) | `#06B6D4` |
| Fonds | glace `#EAF1F5`, étiquettes KPI `#F5F9FF`, saisie `#FFF4CC` |
| Filets de tableau | `#DBE6F7` |
| Texte | `#0F172A` / `#334155`, clair sur bandeau bleu `#DDEEF5` |
| Polices | Segoe UI (texte), Consolas (nombres, valeurs KPI) |

**Excel** : ligne 1 bandeau marine (20 pt gras blanc, 40 pt) · ligne 2 bandeau bleu (9,5 pt, 18 pt) · ligne 3 étiquettes KPI
(8,5 pt gras, 24 pt) · ligne 4 valeurs KPI (Consolas 16 pt gras marine, 50 pt, formules `SUBTOTAL` vivantes) · ligne 5 espace ·
ligne 6 en-tête bleu · pas de quadrillage, zoom 90 %, en-tête figé, filtre automatique, onglet cyan, nombres Consolas
alignés à droite `#,##0`, couleurs de statuts (Stage 1/2/3, I…V, segments).

**Verrou** : `server/services/houseDesign.ts` est l'unique source ; l'objet est profondément figé, sa signature est
recalculée et comparée à `DESIGN_LOCK` (tests unitaires `houseDesignLock`, onglet JEV → Régression). Aucun outil
d'export n'accepte de couleur ou de police. Pour changer la charte il faut modifier ce fichier **et** sa signature
(décision explicite, visible dans le diff).

## Graphiques natifs Excel
Les graphiques des classeurs sont des graphiques **natifs Excel** (séries liées aux cellules, palette de la charte),
pas des images : matplotlib n'est pas disponible dans le bac à sable hors-ligne et un graphique natif reste éditable.

## Grammaire « Comité » — un dossier, cinq livrables (14/10/2026)

Les livrables de référence du comité (classeur « nouveau concept », deck minuté, rapport à sommaire natif) ont été relevés
et transformés en une **grammaire unique** : `server/services/dossier/`. Un **dossier structuré** (thèse, indicateurs
K01…, messages clés, méthode, chapitres avec constats / analyse / cadre / cas / figures / tableaux / recommandations,
décisions à voter, hypothèses, qualité des données, glossaire, sources) est rendu **à l'identique** en :

| Livrable | Module | Ce qu'il contient |
|---|---|---|
| Classeur `.xlsx` | `dossierXlsx.ts` | COCKPIT (tuiles vivantes `='DATA_KPI'!C…`, thèse, navigation, 3 figures), une feuille par chapitre (constats, analyse, figures 3D natives, tableau, recommandations), PLAN D'ACTIONS (statut à saisir, liste de validation), DÉCISIONS, HYPOTHÈSES, PARAMÈTRES, QUALITÉ, SOURCES, GLOSSAIRE, DATA_KPI |
| Deck `.pptx` | `dossierPptx.ts` | titre + 4 tuiles, « le chiffre », 10 indicateurs, méthode, par chapitre : constats + figures puis cas + cartes de recommandation (Réf · P1, responsable, échéance, indicateur), plan d'actions, décisions (☐ Pour ☐ Contre), annexes ; bande « Lecture — » sur chaque diapositive ; notes minutées sur `minutes` |
| Rapport `.docx` | `dossierDocx.ts` | page de garde (bandeau, badge, tuiles, thèse), sommaire natif pré-rempli, « Ce qu'il faut retenir », chapitres avec figures légendées, plan d'actions, décisions, annexes A–E, en-tête / pied avec numérotation |
| Page `.html` | `dossierHtml.ts` | A4 imprimable (→ PDF), figures SVG, mêmes sections |
| Mail `.eml` | `dossierHtml.ts` | mail couleur 680 px (tuiles, messages, décisions) + `.mail.html` |

**Thème** : chaque module lit les couleurs **vivantes** (`liveColorProxy`) du thème actif — galerie, réglage
« Thème par défaut » ou paramètre `theme` de l'outil — donc **toutes** les feuilles, pages et diapositives changent
ensemble. Deux thèmes ajoutés : `comite` (bleu Ecobank officiel 00415E / 005C83 / 8CC63F, Calibri) et `extraordinaire`
(Aurore : 14102E / 2B1F6B / 00B3A4 / FF6B57, Segoe UI). Les séries de graphiques suivent `chartSeries` du thème.

**Outils de l'app** :
- `report.export` : le Markdown devient un dossier (`dossierFromMarkdown`) ; les indicateurs et figures du brief s'y
  joignent ; écrit aussi `<nom>.dossier.json`.
- `dossier.compose` : le modèle écrit le dossier complet (grammaire fermée, JSON) à partir du brief, des notes et des
  sources ; **profondeur imposée par le code** (`checkDepth`, une seconde passe `deepenPrompt` si un point est mince) ;
  chaque chiffre est vérifié contre le brief (`verifyAgainstBrief`) ; repli `dossierFromBrief` (règles seules) si le
  modèle est indisponible.
- `dossier.export` : rend un `.dossier.json` dans les formats demandés, au thème choisi.

**JEV dans chaque décision** (`dossierJudge.ts`, TypeSafe System One) : plan (quelles dimensions méritent un chapitre,
quel constat ouvre le dossier), ton de chaque indicateur, priorité de chaque recommandation, type de figure, note de
« prêt pour le comité » (0–4) et caractère décisionnel de la thèse. Les réponses ne s'appliquent qu'avec une confiance
≥ 0,55 ; les règles gardent chaque changement (un anneau n'accepte qu'une série) ; sans clé JEV, les règles décident.

**Vérification** : SDK Open XML de Microsoft (0 erreur exigée), contrôle sémantique Excel, rendus PNG lus
(`.claude/skills/m365-verification`). Pièges corrigés en chemin : ordre `a:lnB` avant le remplissage (PPT), ordre des
bordures de cellule Word, `dataValidations` avant `hyperlinks` (Excel), ordre des enfants de `<font>` et couleurs ARGB
(`fixStylesXml`).
