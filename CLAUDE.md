# Règles du projet — ECOBANK Credit Risk OS APEX

## Règle d'export premium (obligatoire, pour tous les exports actuels et à venir)

Tout export **Excel, Word ou PowerPoint**, dans **toute salle et toute vue** (y compris les applications greffées : DRAFT, Control Tower, Centrale des Risques, Comité des Risques, PDO Mailer…), doit sortir au format premium commun. Ce format est appliqué **automatiquement au téléchargement** par la finition premium (`pmHook` → `pmFinish` : `pmXlsx`, `pmDocx`, `pmPptx`, `pmHtmlToDocx`), y compris pour les exports générés dans les iframes des salles. Aucune salle ne doit contourner ce mécanisme.

- **Excel** : feuille « Sommaire » cliquable et vivante ; **chaque feuille commence par un tableau de bord avant l'en-tête** (bandeau, tuiles, graphiques natifs couvrant toute la largeur, barre de navigation à boutons avec feuille active en surbrillance) ; segments et recherche client quand la feuille est un tableau de données ; données colorées selon la palette des graphiques ; sections de rapport (synthèses multi-sections) : tableau de bord généré par `pmSheetReport`. Aucune valeur NaN/Infinity, XML conforme au schéma.
- **Word** : page de garde BLUE ECOBANK avec chiffres clés, sommaire automatique, en-tête/pied de page, pagination. Les rapports générés en HTML (.doc) sont convertis en vrai .docx.
- **PowerPoint** : sommaire interactif, barre de progression, pagination, bouton retour.
- Les indicateurs de la page de garde/du Sommaire viennent de la source de l'export (APEX, ou l'application greffée via `window.__CDR__.kpi()` pour le Comité).

### Vérification avant livraison
Valider chaque type d'export avec le validateur Open XML SDK (0 erreur attendue pour xlsx/docx ; le PPT peut garder les écarts propres à PptxGenJS), contrôler le rendu (LibreOffice), et ne jamais livrer un export qui ne passe pas par `pmFinish`.

## Applications greffées (salles alimentées par APEX)
Une application greffée est embarquée en base64 dans un iframe (`crB64`, `cdrB64`, `pdoMailerB64`…) et **alimentée par les données d'APEX** (archive des arrêtés `arList/arGet`), jamais par un chargement manuel seul. Le **Voyage dans le temps** doit donner accès à toutes les vues et données à la date choisie (l'arrêté affiché d'APEX fait foi, avec sélecteur de date dans la salle).
