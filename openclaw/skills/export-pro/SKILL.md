---
name: export-pro
description: Exports propres, fidèles et sans fuite — Excel mis en forme (en-tête, filtres, totaux, impression, feuille « Contrôle » avec empreinte), CSV compatible Excel français (BOM, « ; », virgule décimale, anti-injection de formules), rapprochement source/export ligne à ligne et totaux, nettoyage des métadonnées Office (auteur, société). Déclencheurs : « exporte en Excel », « fais un CSV », « mets en forme », « vérifie l'export », « les totaux collent ? », « enlève l'auteur ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "📤"
    os: [windows, linux, macos]
    requires:
      anyBins: [python, python3, py]
    install:
      - kind: uv
        package: openpyxl
---

# Export pro

S'applique avec `coffre-fort` et `export-securise` (leurs règles priment). Script :
`py {baseDir}\scripts\export_pro.py` (Windows) ou `python3 {baseDir}/scripts/export_pro.py`.

## Méthode, toujours dans cet ordre
1. **Qualité d'abord** : `qualite-donnees` sur la source (doublons, vides, montants aberrants). On n'exporte pas
   un fichier faux.
2. **Produire** une copie, jamais la source :
   - Excel : `export_pro.py excel source.xlsx --sortie rapport.xlsx --titre "Encours au 30/09" --classe "CONFIDENTIEL – USAGE INTERNE"`
     → en-tête bleu, filtres, volets figés, formats `# ##0`, totaux `SOUS.TOTAL` (suivent les filtres), mise en page
     paysage 1 page de large, mention de classe en en-tête d'impression, pagination, feuille **Contrôle**.
   - CSV : `export_pro.py csv source.xlsx --sortie export.csv` (UTF-8 BOM, `;`, virgule décimale, dates JJ/MM/AAAA ;
     tout texte commençant par `= + - @` est neutralisé pour empêcher l'injection de formules).
3. **Prouver la fidélité** : `export_pro.py controle source.xlsx rapport.xlsx --cle "Compte"` → nombre de lignes,
   totaux de chaque colonne chiffrée, clés manquantes ou en trop. **Code 1 = écart : ne pas diffuser**, expliquer.
4. **Nettoyer** : `export_pro.py metadonnees rapport.docx --nettoyer` (auteur, dernier modificateur, société, titre ;
   signale commentaires et relecteurs à retirer dans Office).
5. **Sortir** : uniquement via `export-securise` (scan, pseudonymisation, ZIP chiffré, journal), après accord.

## Règles
- Ne jamais modifier le fichier source ; ne jamais écraser un export sans copie (le script garde `*.precedent`).
- Toujours dire à l'utilisateur : lignes exportées, totaux clés, résultat du contrôle.
- Montants en FCFA sans décimales sauf demande ; arrondis seulement à l'affichage, jamais dans les données.
- Pour un PDF : ouvrir l'Excel produit et « Exporter en PDF » (la mise en page est déjà prête), ou
  `libreoffice --headless --convert-to pdf rapport.xlsx` si LibreOffice est installé.
