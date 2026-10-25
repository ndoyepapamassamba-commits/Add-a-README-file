# Horizon Cité

City-builder 3D qui tourne dans le navigateur, inspiré de Cities: Skylines. Tout tient dans **un seul fichier HTML** : moteur 3D, simulation, interface et sons. Aucun serveur ni installation n'est nécessaire, et le jeu fonctionne hors ligne.

## Jouer

1. Ouvrez **`dist/horizon-cite.html`** d'un double-clic (Chrome, Edge, Firefox ou Safari récent).
2. Choisissez :
   - **Nouvelle ville** : ₡ 70 000 et une sortie d'autoroute à l'ouest de la carte ;
   - **Ville de démonstration** : une ville de 2 500 habitants déjà construite ;
   - **Bac à sable** : argent illimité, tout débloqué.

Les sauvegardes restent dans votre navigateur (3 emplacements et une sauvegarde automatique). Pour passer d'un navigateur à l'autre, utilisez le code d'export dans *Menu → Sauvegarder*.

## Commandes

| Action | Clavier / souris |
|---|---|
| Se déplacer | `Z` `Q` `S` `D` ou flèches, ou glisser au clic gauche (sans outil) |
| Pivoter / incliner | `A` `E`, clic droit glissé, `T` `G` |
| Zoomer | molette (vers le curseur), `R` `F` |
| Pause / vitesses | `Espace`, `1` `2` `3` |
| Annuler / fermer | clic droit, `Échap` |
| Bulldozer | `B` ou `Suppr` |
| Vues d'information | `I` |
| Sauvegarde rapide | `Ctrl` + `S` |
| Tracer sans aimantation | `Maj` maintenue pendant le tracé |

Sur tablette ou téléphone : un doigt déplace la vue (ou utilise l'outil actif), deux doigts zooment et font pivoter.

## Ce qui est reproduit

- **Routes** : 5 types (2 voies, sens unique, 4 voies, avenue arborée à 6 voies, autoroute), tracé droit ou courbe. Aimantation des angles et des longueurs, carrefours générés automatiquement avec trottoirs arrondis et passages piétons, amélioration et inversion des sens uniques, lampadaires, feux tricolores aux carrefours importants.
- **Zonage** : cases de 8 m sur 4 rangées le long des routes, résidentiel, commercial (faible et haute densité), industrie, bureaux, avec pinceaux et remplissage.
- **Croissance** : demande R / C / I, chantiers avec grues, montée en niveau (1 à 5 pour le résidentiel, 1 à 3 pour le reste) selon la valeur foncière et l'éducation, abandon des bâtiments négligés.
- **Services** : électricité (charbon, éolienne, solaire), eau (pompage côtier, château d'eau, rejet d'eaux usées qui pollue l'eau des pompes voisines, station d'épuration), déchets, santé, défunts (avec la fameuse « vague de morts » des quartiers qui vieillissent ensemble), pompiers et incendies, police, éducation, parcs, monuments.
- **Véhicules** : chaque voiture, camion, bus, corbillard, camion-poubelle, ambulance ou camion de pompiers circule réellement sur les voies. Itinéraires A*, choix de voie selon le virage, feux, embouteillages, véhicules d'urgence prioritaires.
- **Transports** : dépôt de bus et lignes en boucle, avec arrêts, fréquentation et recettes.
- **Économie** : impôts par zone, recettes et dépenses hebdomadaires, emprunts, historique.
- **Progression** : 13 paliers de population (de *Petit hameau* à *Mégalopole*) qui débloquent routes, zones et services, avec une récompense à chaque palier.
- **Vues d'information** : électricité, eau, déchets, santé, pompiers, criminalité, éducation, pollution, bruit, valeur foncière, bonheur, trafic, transports, niveaux.
- **Ambiance** : cycle jour/nuit (fenêtres, enseignes et lampadaires allumés), mer animée avec écume, forêts, fumées d'usine, fil social **Gazouille**, conseils, sons synthétisés.

## Ce qui est simplifié

- L'électricité et l'eau passent sous les routes : il n'y a pas de lignes à haute tension ni de canalisations à tracer.
- Pas de ponts, tunnels, métro, trains, quartiers, politiques, catastrophes ni modification du relief.
- La population est simulée par bâtiment, et non habitant par habitant.
- La carte est générée par le code ; tous les bâtiments et véhicules sont des modèles procéduraux originaux.

## Développer

Le code source est découpé en modules dans `src/` (Three.js r160) :

| Module | Rôle |
|---|---|
| `terrain.js`, `environment.js`, `trees.js` | relief, mer, ciel, lumière, forêts |
| `roads.js`, `roadmesh.js`, `path.js` | graphe routier, maillages, itinéraires |
| `zones.js`, `buildings.js`, `buildgen.js`, `materials.js` | zonage, bâtiments, modèles procéduraux, fenêtres en shader |
| `sim.js`, `fields.js` | simulation, couverture des services |
| `traffic.js`, `transit.js` | véhicules, lignes de bus |
| `tools.js`, `placement.js`, `ui.js`, `info.js` | outils, interface, vues d'information |
| `save.js`, `audio.js`, `chirper.js`, `fx.js`, `icons.js` | sauvegardes, sons, Gazouille, particules, icônes |

```bash
cd horizon-cite
npm install
npm run build          # → dist/horizon-cite.html, autonome (Three.js inclus)
node build.mjs --cdn   # variante plus légère qui charge Three.js depuis jsDelivr
```

Pour développer sans reconstruire, servez le dossier (`python3 -m http.server`) et ouvrez `index.html`, qui charge les modules de `src/` directement.

## Mentions

Hommage non officiel aux grands city-builders, sans lien avec Colossal Order ni Paradox Interactive. Aucun fichier du jeu original n'est utilisé : seules les règles de jeu, documentées publiquement, sont reprises. Three.js est distribué sous licence MIT.
