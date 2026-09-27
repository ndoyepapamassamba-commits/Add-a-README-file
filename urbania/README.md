# Urbania

Jeu de construction de ville en 3D pour navigateur, inspiré des mécaniques des jeux de gestion urbaine.
Un seul fichier HTML, sans installation : ouvrez `index.html` dans Chrome, Edge ou Firefox (une connexion Internet est nécessaire pour charger Three.js).

## Ce que le jeu simule

| Système | Contenu |
|---|---|
| Bâtiments 3D | 75 modèles modélisés dans SketchUp : 8 maisons, immeubles et tours modulaires (socle, étages, couronnement), commerces, bureaux, industrie, fermes, scieries, mines, pétrole et tous les services publics ; fenêtres en creux, volets, corniches, auvents, vitrages éclairés la nuit, détails masqués au loin |
| Routes | Graphe de nœuds et de segments de Bézier, 11 types (rue, sens unique, avenue, avenue avec voies de bus, rue et avenue avec tramway, boulevard, autoroute, bretelle, chemin piéton, voie ferrée), tracé droit ou courbe, rond-points, viaducs, ponts automatiques, tunnels, amélioration, feux tricolores |
| Trafic | Véhicules sur des voies, choix de voie avant de tourner, distance de sécurité, feux et priorités, itinéraires qui évitent les bouchons |
| Zonage | Cellules de 8 m le long des routes (jusqu'à 4 de profondeur), 6 types de zones, lots de 1×1 à 4×4, niveaux 1 à 5 pour le résidentiel et 1 à 3 pour les commerces, l'industrie et les bureaux |
| Habitants | Agents individuels : nom, âge, éducation, domicile, emploi ou école, santé, bonheur, naissances, décès, arrivées et départs |
| Services | Police, pompiers, cliniques et hôpitaux, cimetières et crématoriums, écoles, lycées, universités, décharges, incinérateurs et recyclage, avec véhicules envoyés en mission |
| Réseaux | Électricité éolienne, solaire, thermique et hydraulique, pompage et châteaux d'eau, rejets et stations d'épuration, distribués par le réseau routier |
| Transports | Lignes de bus et dépôt, tramway et dépôt, métro, monorail sur voie aérienne, ferries entre embarcadères, trains de voyageurs, port de fret, aéroport, autoroute et voie ferrée vers l'extérieur |
| Économie | Impôts par zone, budget par service, prêts, politiques, importations et exportations, tourisme |
| Quartiers | Quartiers peints au pinceau, 9 politiques, spécialisations industrielles, commerciales et technologiques |
| Terrain et eau | Terraformation (élever, abaisser, niveler, adoucir), simulation de l'eau avec écoulement, ruissellement de la pluie et infiltration, marées, sources, barrages, pollution de l'eau |
| Catastrophes | Météorite (cratère, incendies), séisme, tornade, tsunami ; déclenchables à la main ou aléatoires (option du menu) |
| Saisons | Année de 48 jours de jeu : feuillage (floraison, automne, arbres nus), herbe, météo, température, durée du jour, chauffage en hiver |
| Ambiance | Cycle jour et nuit, soleil, pluie, orage, brouillard, neige, sons procéduraux et radio générative |

## Développement

Les sources sont dans `src/` : le HTML et les styles dans `00-head.html`, puis les modules JavaScript concaténés dans l'ordre.

```
python3 build.py   # génère index.html (document complet) et dist/artifact.html
```

## Modèles 3D SketchUp

Les bâtiments sont modélisés dans SketchUp par des scripts Python (`sketchup/`), puis convertis en un paquet binaire compressé intégré au jeu.

| Étape | Fichiers |
|---|---|
| Modélisation | `sketchup/lib.py` (murs percés de fenêtres, toits, corniches, volets…), `sketchup/extra.py`, puis un fichier par famille : `houses.py`, `apartments.py`, `offices.py`, `industry.py`, `services1.py` à `services3.py` |
| Exécution | `cd sketchup && python3 mkcall.py full extra.py,houses.py "h_cottage, h_house"` produit le code envoyé à SketchUp ; le résultat (faces, matières, en cm) est enregistré dans `sketchup/exports/*.json` |
| Conversion | `node tools/convert-assets.mjs src/02b-assets-data.js sketchup/exports/*.json` triangule les faces et écrit le paquet (les exports cités en dernier remplacent les modèles de même nom) |
| Catalogue | `cd sketchup && python3 mkcat.py full extra.py,apartments.py "a_walkup a_block ; T:a4:4.5:3.0:6:0:0"` produit un appel qui range les modèles en rangées (les tours sont empilées) pour les enregistrer ensemble dans un fichier `.skp` |
| Jeu | `src/02c-assets.js` charge le paquet et fournit le matériau ; `src/07b-assetgen.js` choisit, ajuste et teinte les modèles pour chaque zone et chaque service |

Conventions des modèles : façade sur la rue en `y = 0` (vers −Y), unités en mètres. Le préfixe du nom de matière fixe son rôle dans le jeu : `W_` murs, `R_` toits et `A_` accents teintés par bâtiment, `G_` vitrages (éclairés la nuit), `E_` enseignes lumineuses. Les groupes dont le nom commence par `det` sont des détails masqués au-delà d'une distance réglée par la qualité graphique. Le suffixe `@LxP` impose l'emprise au sol.

Pour la conversion, installez `three` une fois : `cd tools && npm install`.
