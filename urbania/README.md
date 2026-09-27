# Urbania

Jeu de construction de ville en 3D pour navigateur, inspiré des mécaniques des jeux de gestion urbaine.
Un seul fichier HTML, sans installation : ouvrez `index.html` dans Chrome, Edge ou Firefox (une connexion Internet est nécessaire pour charger Three.js).

## Ce que le jeu simule

| Système | Contenu |
|---|---|
| Routes | Graphe de nœuds et de segments de Bézier, 9 types (rue, sens unique, avenue, avenue avec voies de bus, boulevard, autoroute, bretelle, chemin piéton, voie ferrée), tracé droit ou courbe, rond-points, viaducs, ponts automatiques, tunnels, amélioration, feux tricolores |
| Trafic | Véhicules sur des voies, choix de voie avant de tourner, distance de sécurité, feux et priorités, itinéraires qui évitent les bouchons |
| Zonage | Cellules de 8 m le long des routes (jusqu'à 4 de profondeur), 6 types de zones, lots de 1×1 à 4×4, niveaux 1 à 5 pour le résidentiel et 1 à 3 pour les commerces, l'industrie et les bureaux |
| Habitants | Agents individuels : nom, âge, éducation, domicile, emploi ou école, santé, bonheur, naissances, décès, arrivées et départs |
| Services | Police, pompiers, cliniques et hôpitaux, cimetières et crématoriums, écoles, lycées, universités, décharges, incinérateurs et recyclage, avec véhicules envoyés en mission |
| Réseaux | Électricité éolienne, solaire, thermique et hydraulique, pompage et châteaux d'eau, rejets et stations d'épuration, distribués par le réseau routier |
| Transports | Lignes de bus et dépôt, métro, trains de voyageurs, port de fret, aéroport, autoroute et voie ferrée vers l'extérieur |
| Économie | Impôts par zone, budget par service, prêts, politiques, importations et exportations, tourisme |
| Quartiers | Quartiers peints au pinceau, 9 politiques, spécialisations industrielles, commerciales et technologiques |
| Terrain et eau | Terraformation (élever, abaisser, niveler, adoucir), simulation de l'eau avec écoulement, sources, barrages, pollution de l'eau |
| Ambiance | Cycle jour et nuit, soleil, pluie, orage, brouillard, neige, sons procéduraux et radio générative |

## Développement

Les sources sont dans `src/` : le HTML et les styles dans `00-head.html`, puis les modules JavaScript concaténés dans l'ordre.

```
python3 build.py   # génère index.html (document complet) et dist/artifact.html
```
