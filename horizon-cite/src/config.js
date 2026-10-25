// Données de jeu : dimensions de la carte, routes, zones, services, paliers.
// Toutes les distances sont en mètres, les durées en secondes de simulation.

export const MAP_HALF = 1024;          // la carte jouable va de -1024 à +1024
export const TERRAIN_HALF = 1536;      // le relief est modélisé un peu au-delà
export const BUILD_LIMIT = 900;        // zone constructible |x|,|z| < 900
export const WATER_LEVEL = -2;
export const ROAD_Y = 0.16;            // élévation des routes au-dessus du sol
export const CELL = 8;                 // taille d'une case de zonage
export const ZONE_DEPTH = 4;           // profondeur de zonage (cases)

export const DAY_SECONDS = 3;          // 1 jour du calendrier = 3 s de simulation
export const DAYCYCLE_SECONDS = 420;   // cycle jour/nuit complet
export const START_MONEY = 70000;
export const SPEEDS = [0, 1, 2, 4];
export const START_YEAR = 2026;

export const OUTSIDE_ENTRY = { x: -1180, z: 20 };   // l'autoroute entre par l'ouest
export const HIGHWAY_END = { x: -640, z: 20 };

// Types de routes. lanes = [voies sens a->b, voies sens b->a]
export const ROAD_TYPES = {
  small: {
    id: 'small', name: 'Route à 2 voies', desc: 'Route résidentielle de base, 40 km/h. Permet le zonage.',
    width: 16, carriage: 8, lanes: [1, 1], laneW: 3.5, median: 0, speed: 11, cost: 2.2, upkeep: 0.12,
    zoning: true, sidewalk: true, unlock: 0,
  },
  oneway: {
    id: 'oneway', name: 'Sens unique', desc: 'Deux voies dans un seul sens. La flèche suit le sens du tracé.',
    width: 16, carriage: 8, lanes: [2, 0], laneW: 3.5, median: 0, speed: 11, cost: 2.6, upkeep: 0.14,
    zoning: true, sidewalk: true, unlock: 1,
  },
  medium: {
    id: 'medium', name: 'Route à 4 voies', desc: 'Route de quartier, 50 km/h, capacité doublée.',
    width: 24, carriage: 15, lanes: [2, 2], laneW: 3.5, median: 0, speed: 14, cost: 4.8, upkeep: 0.25,
    zoning: true, sidewalk: true, unlock: 2,
  },
  large: {
    id: 'large', name: 'Avenue à 6 voies', desc: 'Grande avenue arborée à terre-plein central, 60 km/h.',
    width: 32, carriage: 24, lanes: [3, 3], laneW: 3.5, median: 3, speed: 17, cost: 8.5, upkeep: 0.42,
    zoning: true, sidewalk: true, unlock: 5, trees: true,
  },
  highway: {
    id: 'highway', name: 'Autoroute', desc: '100 km/h, aucun zonage possible. Idéale pour relier les quartiers.',
    width: 30, carriage: 30, lanes: [3, 3], laneW: 3.75, median: 3, speed: 28, cost: 12, upkeep: 0.6,
    zoning: false, sidewalk: false, unlock: 3,
  },
};

// Zones. id 0 = non zoné.
export const ZONES = [
  null,
  { id: 1, key: 'res_low', name: 'Résidentiel faible densité', short: 'Pavillons', color: 0x74d04c, cat: 'R', maxLevel: 5, unlock: 0 },
  { id: 2, key: 'res_high', name: 'Résidentiel haute densité', short: 'Immeubles', color: 0x239a3d, cat: 'R', maxLevel: 5, unlock: 5 },
  { id: 3, key: 'com_low', name: 'Commercial faible densité', short: 'Commerces', color: 0x5aaaf6, cat: 'C', maxLevel: 3, unlock: 0 },
  { id: 4, key: 'com_high', name: 'Commercial haute densité', short: 'Centres commerciaux', color: 0x2563d8, cat: 'C', maxLevel: 3, unlock: 5 },
  { id: 5, key: 'ind', name: 'Industriel', short: 'Industrie', color: 0xe8c23a, cat: 'I', maxLevel: 3, unlock: 0 },
  { id: 6, key: 'office', name: 'Bureaux', short: 'Bureaux', color: 0x31c4c8, cat: 'O', maxLevel: 3, unlock: 5 },
];

// Empreintes possibles (largeur x profondeur en cases) par zone
export const FOOTPRINTS = {
  1: [[2, 2], [2, 3], [3, 3], [2, 4], [3, 4], [1, 2], [2, 2]],
  2: [[2, 2], [2, 3], [3, 3], [3, 4], [4, 4], [4, 3]],
  3: [[1, 2], [2, 2], [2, 3], [3, 3], [1, 1], [2, 2]],
  4: [[2, 3], [3, 3], [3, 4], [4, 4]],
  5: [[2, 2], [3, 3], [3, 4], [4, 4], [4, 3], [2, 3]],
  6: [[2, 2], [2, 3], [3, 3], [4, 4], [3, 4]],
};

// Services et bâtiments uniques.
// cov : couverture (champ, rayon, force). veh : véhicules de service.
export const SERVICES = [
  // --- Électricité
  { id: 'coal', cat: 'power', name: 'Centrale à charbon', desc: 'Production stable mais très polluante.',
    cost: 19000, upkeep: 560, w: 40, d: 48, unlock: 0, power: 40, jobs: 30,
    pollution: { r: 260, s: 1.0 }, noise: { r: 160, s: 0.6 } },
  { id: 'wind', cat: 'power', name: 'Éolienne', desc: 'Énergie propre, production modeste.',
    cost: 6000, upkeep: 80, w: 16, d: 16, unlock: 0, power: 8, jobs: 2, noise: { r: 60, s: 0.3 } },
  { id: 'solar', cat: 'power', name: 'Centrale solaire', desc: 'Grande production propre, sans pollution.',
    cost: 42000, upkeep: 1100, w: 56, d: 56, unlock: 9, power: 60, jobs: 20 },
  // --- Eau
  { id: 'pump', cat: 'water', name: 'Station de pompage', desc: 'À placer sur la côte, en amont des rejets d\'eaux usées.',
    cost: 2800, upkeep: 140, w: 16, d: 24, unlock: 0, water: 700, jobs: 6, shore: true },
  { id: 'watertower', cat: 'water', name: 'Château d\'eau', desc: 'Puise dans la nappe : se place n\'importe où.',
    cost: 6200, upkeep: 260, w: 16, d: 16, unlock: 4, water: 380, jobs: 4 },
  { id: 'outlet', cat: 'water', name: 'Rejet des eaux usées', desc: 'Évacue les eaux usées dans la mer. Pollue l\'eau alentour.',
    cost: 2200, upkeep: 110, w: 16, d: 16, unlock: 0, sewage: 900, jobs: 4, shore: true, waterPollution: 280 },
  { id: 'treatment', cat: 'water', name: 'Station d\'épuration', desc: 'Traite les eaux usées sans polluer la mer.',
    cost: 28000, upkeep: 900, w: 40, d: 40, unlock: 8, sewage: 2400, jobs: 30, shore: true },
  // --- Déchets
  { id: 'landfill', cat: 'garbage', name: 'Décharge', desc: 'Stocke les déchets. Pollue le sol et fait baisser la valeur foncière.',
    cost: 4200, upkeep: 320, w: 40, d: 40, unlock: 1, capacity: 240000, jobs: 20,
    veh: { type: 'garbage', count: 8, radius: 1600 }, pollution: { r: 120, s: 0.6 } },
  { id: 'incinerator', cat: 'garbage', name: 'Incinérateur', desc: 'Brûle les déchets et produit de l\'électricité.',
    cost: 32000, upkeep: 1300, w: 40, d: 40, unlock: 6, power: 20, jobs: 40, burn: true,
    veh: { type: 'garbage', count: 14, radius: 2400 }, pollution: { r: 200, s: 0.7 } },
  // --- Santé
  { id: 'clinic', cat: 'health', name: 'Clinique médicale', desc: 'Soigne les malades du quartier.',
    cost: 6000, upkeep: 420, w: 24, d: 24, unlock: 1, jobs: 25, cov: { f: 'health', r: 460, s: 1 },
    veh: { type: 'ambulance', count: 4, radius: 1000 } },
  { id: 'hospital', cat: 'health', name: 'Hôpital', desc: 'Grande couverture médicale, nombreuses ambulances.',
    cost: 24000, upkeep: 1500, w: 40, d: 48, unlock: 5, jobs: 120, cov: { f: 'health', r: 950, s: 1.3 },
    veh: { type: 'ambulance', count: 10, radius: 2000 } },
  { id: 'cemetery', cat: 'health', name: 'Cimetière', desc: 'Les corbillards ramassent les défunts.',
    cost: 4000, upkeep: 260, w: 40, d: 32, unlock: 4, capacity: 5000, jobs: 12,
    veh: { type: 'hearse', count: 7, radius: 1800 }, cov: { f: 'park', r: 60, s: 0.15 } },
  { id: 'crematorium', cat: 'health', name: 'Crématorium', desc: 'Ne se remplit jamais, beaucoup de corbillards.',
    cost: 22000, upkeep: 900, w: 32, d: 32, unlock: 8, jobs: 30, burn: true,
    veh: { type: 'hearse', count: 12, radius: 2600 } },
  // --- Pompiers
  { id: 'fire', cat: 'fire', name: 'Caserne de pompiers', desc: 'Prévient et éteint les incendies.',
    cost: 5200, upkeep: 420, w: 24, d: 32, unlock: 2, jobs: 25, cov: { f: 'fire', r: 540, s: 1 },
    veh: { type: 'firetruck', count: 5, radius: 1100 } },
  // --- Police
  { id: 'police', cat: 'police', name: 'Commissariat', desc: 'Fait baisser la criminalité.',
    cost: 5200, upkeep: 420, w: 24, d: 24, unlock: 2, jobs: 25, cov: { f: 'police', r: 540, s: 1 },
    veh: { type: 'police', count: 5, radius: 1100 } },
  // --- Éducation
  { id: 'school', cat: 'education', name: 'École élémentaire', desc: 'Premier niveau d\'éducation.',
    cost: 6200, upkeep: 380, w: 32, d: 32, unlock: 1, jobs: 20, cov: { f: 'edu1', r: 480, s: 1 } },
  { id: 'highschool', cat: 'education', name: 'Lycée', desc: 'Deuxième niveau d\'éducation.',
    cost: 15000, upkeep: 820, w: 40, d: 48, unlock: 3, jobs: 45, cov: { f: 'edu2', r: 720, s: 1 } },
  { id: 'university', cat: 'education', name: 'Université', desc: 'Formation supérieure : bureaux et industrie de pointe.',
    cost: 38000, upkeep: 1600, w: 56, d: 64, unlock: 6, jobs: 120, cov: { f: 'edu3', r: 1300, s: 1 } },
  // --- Transports
  { id: 'busdepot', cat: 'transport', name: 'Dépôt de bus', desc: 'Nécessaire pour faire rouler les lignes de bus.',
    cost: 8000, upkeep: 450, w: 32, d: 40, unlock: 4, jobs: 30 },
  // --- Parcs
  { id: 'park_small', cat: 'parks', name: 'Petit parc', desc: 'Un carré de verdure. Augmente la valeur foncière.',
    cost: 600, upkeep: 30, w: 16, d: 16, unlock: 1, cov: { f: 'park', r: 160, s: 0.55 } },
  { id: 'playground', cat: 'parks', name: 'Aire de jeux', desc: 'Les familles adorent.',
    cost: 900, upkeep: 40, w: 16, d: 16, unlock: 1, cov: { f: 'park', r: 160, s: 0.6 } },
  { id: 'plaza', cat: 'parks', name: 'Place à fontaine', desc: 'Une place pavée avec fontaine.',
    cost: 2400, upkeep: 90, w: 24, d: 24, unlock: 2, cov: { f: 'park', r: 240, s: 0.8 } },
  { id: 'park_large', cat: 'parks', name: 'Grand parc', desc: 'Étang, allées et grands arbres.',
    cost: 6500, upkeep: 220, w: 40, d: 40, unlock: 3, cov: { f: 'park', r: 380, s: 1.2 } },
  { id: 'sports', cat: 'parks', name: 'Terrain de sport', desc: 'Terrain de foot et piste.',
    cost: 4200, upkeep: 160, w: 40, d: 32, unlock: 3, cov: { f: 'park', r: 300, s: 0.9 } },
  // --- Monuments (uniques)
  { id: 'townhall', cat: 'monuments', name: 'Hôtel de ville', desc: 'Le cœur administratif. Bonheur +5 dans toute la ville.',
    cost: 15000, upkeep: 400, w: 40, d: 40, unlock: 4, unique: true, happy: 5, jobs: 40, cov: { f: 'park', r: 300, s: 0.8 } },
  { id: 'stadium', cat: 'monuments', name: 'Stade', desc: 'Grand stade. Bonheur +6 dans toute la ville.',
    cost: 48000, upkeep: 900, w: 72, d: 72, unlock: 6, unique: true, happy: 6, jobs: 60, cov: { f: 'park', r: 400, s: 0.7 } },
  { id: 'tvtower', cat: 'monuments', name: 'Tour panoramique', desc: 'Domine l\'horizon. Bonheur +5 dans toute la ville.',
    cost: 36000, upkeep: 700, w: 24, d: 24, unlock: 7, unique: true, happy: 5, jobs: 20, cov: { f: 'park', r: 500, s: 0.9 } },
  { id: 'cathedral', cat: 'monuments', name: 'Cathédrale', desc: 'Chef-d\'œuvre gothique. Bonheur +7 dans toute la ville.',
    cost: 60000, upkeep: 800, w: 40, d: 64, unlock: 10, unique: true, happy: 7, jobs: 15, cov: { f: 'park', r: 500, s: 1.1 } },
];
export const SERVICE_BY_ID = Object.fromEntries(SERVICES.map((s) => [s.id, s]));

// Catégories de la barre d'outils
export const CATEGORIES = [
  { id: 'roads', name: 'Routes' },
  { id: 'zoning', name: 'Zonage' },
  { id: 'power', name: 'Électricité' },
  { id: 'water', name: 'Eau et égouts' },
  { id: 'garbage', name: 'Déchets' },
  { id: 'health', name: 'Santé et défunts' },
  { id: 'fire', name: 'Pompiers' },
  { id: 'police', name: 'Police' },
  { id: 'education', name: 'Éducation' },
  { id: 'transport', name: 'Transports' },
  { id: 'parks', name: 'Parcs et décoration' },
  { id: 'monuments', name: 'Monuments' },
];

// Paliers de population (noms et seuils calqués sur la progression documentée du jeu original).
// Les déblocages sont portés par le champ "unlock" de chaque route, zone et service.
export const MILESTONES = [
  { name: 'Terrain vierge', pop: 0, reward: 0 },
  { name: 'Petit hameau', pop: 500, reward: 5000 },
  { name: 'Village méritant', pop: 1000, reward: 8000 },
  { name: 'Petite bourgade', pop: 1600, reward: 12000 },
  { name: 'Ville en essor', pop: 2800, reward: 15000 },
  { name: 'Ville animée', pop: 5500, reward: 20000 },
  { name: 'Grande ville', pop: 8000, reward: 25000 },
  { name: 'Petite cité', pop: 11000, reward: 30000 },
  { name: 'Grande cité', pop: 18000, reward: 35000 },
  { name: 'Cité grandiose', pop: 22000, reward: 40000 },
  { name: 'Capitale', pop: 36000, reward: 50000 },
  { name: 'Cité colossale', pop: 48000, reward: 60000 },
  { name: 'Métropole', pop: 70000, reward: 80000 },
  { name: 'Mégalopole', pop: 90000, reward: 100000 },
];

// Véhicules
export const VEHICLE_TYPES = ['car', 'van', 'truck', 'bus', 'garbage', 'hearse', 'ambulance', 'firetruck', 'police', 'moving'];
export const CAR_COLORS = [0xf2f2f2, 0xf2f2f2, 0x1b1d22, 0x1b1d22, 0x9aa1a8, 0x9aa1a8, 0x5c6168, 0xb3262e, 0x23488f, 0x1d2f55,
  0x2f5d3a, 0xd9b44a, 0x7a2130, 0xe8e2d0, 0x3d7fb8];

// Densité de véhicules selon la qualité
export const QUALITY = {
  low: { name: 'Basse', pixelRatio: 1, shadows: 1024, maxVehicles: 450, treeShadows: false, antialias: false },
  medium: { name: 'Moyenne', pixelRatio: 1.25, shadows: 2048, maxVehicles: 1100, treeShadows: true, antialias: true },
  high: { name: 'Haute', pixelRatio: 2, shadows: 4096, maxVehicles: 2000, treeShadows: true, antialias: true },
};
