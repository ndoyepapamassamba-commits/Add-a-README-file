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
