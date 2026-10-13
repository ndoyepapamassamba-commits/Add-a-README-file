/**
 * MONDE VIVANT — le catalogue des LIEUX de l'univers et de ce qui les fait vivre : décor (un décor peint du kit troupe,
 * ou un décor 3D construit par Blender quand le lieu n'a pas encore de décor peint), objets interactifs, figurants (PNJ)
 * avec leurs comportements, animaux avec ceux de leur espèce, effets d'ambiance, lumière et sons d'ambiance.
 *
 * Deux usages :
 *  • le moteur narratif : placeBrief() dit au scénariste ce que le lieu contient (objets à utiliser dans les gags,
 *    figurants qui réagissent, animaux qui s'en mêlent) ;
 *  • le pipeline Blender : worldJson() est écrit dans scripts/blenderfilm/world.json ; world.py y choisit, plan par
 *    plan et de façon déterministe (graine = l'histoire), les figurants (personnages de la troupe qui FRÉQUENTENT ce lieu,
 *    d'après leur fiche), les animaux, les objets cités par les répliques, les effets et la variante de lumière.
 * Un lieu inconnu prend le gabarit le plus proche (intérieur / extérieur) : le nombre de lieux n'est pas limité.
 */

export type Behavior = 'passe' | 'attend' | 'discute' | 'travaille' | 'file' | 'regarde';
export type Species = 'poule' | 'oiseau' | 'pigeon' | 'chat' | 'chien' | 'chevre' | 'margouillat' | 'canard';
export type Fx =
  'poussiere' | 'vapeur' | 'feuilles' | 'bokeh' | 'rayons' | 'ventilateur' | 'ecran' | 'vagues';
export type Ambience =
  | 'foule'
  | 'oiseaux'
  | 'circulation'
  | 'vagues'
  | 'cuisine'
  | 'tele'
  | 'annonces'
  | 'enfants'
  | 'ventilateur'
  | 'musique'
  | 'insectes';
export type Template = 'piece' | 'hall' | 'rue' | 'parc';
export type Grade = 'jour' | 'doree' | 'soir' | 'nuit';

export interface PlaceObject {
  /** Prop kind known by the Blender builder (scripts/blenderfilm/world.py PROPS). */
  id: string;
  nom: string;
  /** How a character can use it in a gag. */
  interaction: string;
  /** Words of a line that bring it on screen next to the speaker. */
  mots: string[];
}
export interface NpcSlot {
  role: string;
  comportement: Behavior;
  n: [number, number];
}
export interface AnimalSlot {
  espece: Species;
  comportement: string;
  /** Probability the species is present in a given film. */
  p: number;
  n: [number, number];
}
export interface Place {
  id: string;
  nom: string;
  match: RegExp;
  exterieur: boolean;
  /** Painted set of the troupe kit (manifest décor name) — else the 3D template Blender builds. */
  kit?: string;
  template: Template;
  /** Colours of the 3D template (walls / ground / accents), Africa Toon palette. */
  palette: string[];
  /** Sets whose regulars (character sheets « lieux ») are good extras here. */
  habitues: string[];
  heure: Grade;
  objets: PlaceObject[];
  pnj: NpcSlot[];
  animaux: AnimalSlot[];
  fx: Fx[];
  sons: Ambience[];
  /** One line of ambience for the writer and the image prompts. */
  vie: string;
}

const O = (id: string, nom: string, interaction: string, mots: string[]): PlaceObject => ({
  id,
  nom,
  interaction,
  mots,
});
const N = (role: string, comportement: Behavior, a: number, b: number): NpcSlot => ({
  role,
  comportement,
  n: [a, b],
});
const A = (espece: Species, comportement: string, p: number, a: number, b: number): AnimalSlot => ({
  espece,
  comportement,
  p,
  n: [a, b],
});

// Objets réutilisés.
const TABLE = O('table', 'table basse', 'on y pose, on y cache, on tape dessus', ['table']);
const CHAISE = O('chaise', 'chaise en plastique', 'on s’y effondre, on la tire pour s’asseoir', [
  'chaise',
  'assieds',
  'asseoir',
]);
const POULET = O('poulet', 'plat de poulet', 'le plat qui disparaît, la preuve du crime', [
  'poulet',
  'cuisse',
]);
const ASSIETTE = O('assiette', 'assiette garnie', 'on la vide, on la partage mal', [
  'attiéké',
  'garba',
  'riz',
  'assiette',
  'manger',
  'plat',
]);
const MARMITE = O('marmite', 'marmite fumante', 'on y goûte en cachette', ['marmite', 'sauce', 'cuisine']);
const BOUTEILLES = O('bouteilles', 'bouteilles', 'on les cache derrière le dos', [
  'bouteille',
  'boisson',
  'bière',
  'sucrerie',
]);
const BALLON = O('ballon', 'ballon', 'il rebondit au mauvais moment', ['ballon', 'foot', 'basket']);
const TELEPHONE = O('telephone', 'téléphone', 'il sonne au pire moment, il filme tout', [
  'téléphone',
  'appel',
  'filme',
  'tiktok',
  'live',
]);
const VALISE = O('valise', 'valise', 'on la fouille, elle déborde', ['valise', 'bagage', 'voyage']);
const PANIER = O('tomates', 'pyramide de tomates', 'on marchande, on renverse', [
  'tomate',
  'légume',
  'marché',
]);
const BILLETS = O('billets', 'liasse de billets', 'on la compte, on la cache', ['liasse', 'billets']);
const GATEAU = O('gateau', 'gâteau d’anniversaire', 'les bougies, le nom écrit faux', [
  'gâteau',
  'anniversaire',
  'bougie',
]);
const PAPIERS = O('papiers', 'pile de papiers', 'il manque toujours un papier', [
  'papier',
  'dossier',
  'bulletin',
  'facture',
  'formulaire',
]);

export const PLACES: Place[] = [
  {
    id: 'salon',
    nom: 'Salon',
    match: /\b(salon|maison|living|sejour|chez (lui|elle|nous))\b/,
    exterieur: false,
    kit: 'Salon',
    template: 'piece',
    palette: ['#2f8f8a', '#7a4a2a', '#e0b050'],
    habitues: ['Salon', 'Cour'],
    heure: 'soir',
    objets: [
      TABLE,
      POULET,
      TELEPHONE,
      O('tele', 'vieille télévision', 'coupure de courant au but décisif', ['télé', 'match', 'courant']),
      BILLETS,
    ],
    pnj: [
      N('membre de la famille qui passe', 'passe', 0, 1),
      N('voisin qui regarde par la porte', 'regarde', 0, 1),
    ],
    animaux: [
      A('chat', 'dort sur le canapé, s’étire, suit la nourriture des yeux', 0.6, 1, 1),
      A('margouillat', 'fait des pompes sur le mur', 0.3, 1, 1),
    ],
    fx: ['ventilateur', 'ecran', 'poussiere'],
    sons: ['ventilateur', 'tele', 'enfants'],
    vie: 'ventilateur qui tourne, télé allumée en fond, odeur de sauce, le chat qui guette le poulet',
  },
  {
    id: 'cour',
    nom: 'Cour',
    match: /\b(cour|concession|devant la maison|porte)\b/,
    exterieur: true,
    kit: 'Village',
    template: 'rue',
    palette: ['#9a9a90', '#c9a46a', '#d24b3e'],
    habitues: ['Cour', 'Salon'],
    heure: 'jour',
    objets: [
      CHAISE,
      MARMITE,
      BALLON,
      O('linge', 'corde à linge', 'on se cache derrière le pagne qui sèche', ['linge', 'pagne']),
      BOUTEILLES,
    ],
    pnj: [
      N('voisine qui balaie', 'travaille', 0, 1),
      N('enfants qui jouent', 'passe', 1, 2),
      N('voisin curieux', 'regarde', 0, 1),
    ],
    animaux: [
      A('poule', 'picore, s’enfuit en caquetant quand on crie', 0.9, 2, 4),
      A('chevre', 'broute, mâchouille un papier', 0.35, 1, 1),
      A('margouillat', 'fait des pompes sur le mur', 0.5, 1, 1),
      A('chat', 'traverse la cour', 0.3, 1, 1),
    ],
    fx: ['poussiere', 'rayons'],
    sons: ['enfants', 'oiseaux', 'foule'],
    vie: 'poules qui picorent, linge qui sèche, enfants qui courent, la voisine qui écoute par-dessus le mur',
  },
  {
    id: 'marche',
    nom: 'Marché',
    match: /\b(marche|market|etal|vendeuse|commercante)\b/,
    exterieur: true,
    kit: 'Marché',
    template: 'rue',
    palette: ['#e2a23b', '#c0392b', '#2e86c1'],
    habitues: ['Marché'],
    heure: 'jour',
    objets: [
      PANIER,
      BILLETS,
      ASSIETTE,
      O('bassine', 'bassine sur la tête', 'elle vacille, elle tombe', ['bassine', 'tête']),
    ],
    pnj: [
      N('client qui marchande', 'discute', 1, 2),
      N('passant chargé', 'passe', 1, 3),
      N('vendeuse qui crie ses prix', 'travaille', 1, 1),
    ],
    animaux: [
      A('poule', 'dans une cage puis en liberté', 0.6, 1, 3),
      A('chevre', 'mange les légumes de l’étal', 0.3, 1, 1),
      A('pigeon', 'picore les graines tombées', 0.5, 2, 4),
    ],
    fx: ['poussiere', 'rayons', 'vapeur'],
    sons: ['foule', 'circulation'],
    vie: 'foule qui marchande, parasols colorés, poussière dorée, une chèvre qui vole une tomate',
  },
  {
    id: 'maquis',
    nom: 'Maquis',
    match: /\b(maquis|bar|buvette|allocodrome)\b/,
    exterieur: true,
    kit: 'Maquis',
    template: 'rue',
    palette: ['#1f3b73', '#e8a33d', '#c0392b'],
    habitues: ['Maquis'],
    heure: 'nuit',
    objets: [
      ASSIETTE,
      BOUTEILLES,
      TABLE,
      CHAISE,
      O('ardoise', 'ardoise des dettes', 'le nom de Koffi en haut de la liste', [
        'ardoise',
        'crédit',
        'addition',
        'dette',
      ]),
    ],
    pnj: [
      N('clients attablés', 'discute', 2, 3),
      N('serveur qui circule', 'passe', 1, 1),
      N('danseur', 'travaille', 0, 1),
    ],
    animaux: [
      A('chat', 'attend les arêtes sous la table', 0.5, 1, 1),
      A('chien', 'mendie près des grillades', 0.3, 1, 1),
    ],
    fx: ['bokeh', 'vapeur', 'ecran'],
    sons: ['musique', 'foule', 'cuisine'],
    vie: 'guirlandes lumineuses, fumée des grillades, match sur le grand écran, musique coupée au moment de l’addition',
  },
  {
    id: 'restaurant',
    nom: 'Restaurant',
    match: /\b(restaurant|resto|cantine|gargote)\b/,
    exterieur: false,
    kit: 'Maquis',
    template: 'piece',
    palette: ['#f2e3c6', '#8e5b3a', '#2a9d8f'],
    habitues: ['Maquis', 'Cérémonie'],
    heure: 'jour',
    objets: [
      ASSIETTE,
      POULET,
      MARMITE,
      TABLE,
      CHAISE,
      O('menu', 'ardoise du menu', 'le prix change pendant qu’on lit', ['menu', 'prix']),
    ],
    pnj: [
      N('clients qui mangent', 'discute', 2, 3),
      N('serveuse', 'passe', 1, 1),
      N('cuisinière', 'travaille', 1, 1),
    ],
    animaux: [A('chat', 'guette sous les tables', 0.5, 1, 1)],
    fx: ['vapeur', 'ventilateur', 'rayons'],
    sons: ['cuisine', 'foule', 'ventilateur'],
    vie: 'marmites fumantes, ventilateur au plafond, clients qui commentent la sauce',
  },
  {
    id: 'salon-coiffure',
    nom: 'Salon de coiffure',
    match: /\b(coiffure|coiffeuse|salon de beaute|tresses)\b/,
    exterieur: false,
    kit: 'Salon de coiffure',
    template: 'piece',
    palette: ['#f4a6c1', '#ffffff', '#c2185b'],
    habitues: ['Salon de coiffure'],
    heure: 'jour',
    objets: [
      TELEPHONE,
      O('sechoir', 'sèche-cheveux', 'bruit qui couvre la vérité, coiffure qui s’envole', [
        'sèche',
        'cheveux',
        'coiffure',
        'mèches',
      ]),
      CHAISE,
    ],
    pnj: [
      N('cliente sous le casque', 'attend', 1, 2),
      N('coiffeuse qui tresse', 'travaille', 1, 1),
      N('cliente qui attend son tour', 'file', 0, 1),
    ],
    animaux: [],
    fx: ['ventilateur', 'rayons'],
    sons: ['foule', 'ventilateur', 'musique'],
    vie: 'casques sèche-cheveux qui ronronnent, ragots à voix basse, miroirs à ampoules',
  },
  {
    id: 'ceremonie',
    nom: 'Cérémonie',
    match: /\b(mariage|ceremonie|bapteme|fete|dot)\b/,
    exterieur: true,
    kit: 'Cérémonie',
    template: 'parc',
    palette: ['#ffffff', '#d4af37', '#b03a2e'],
    habitues: ['Cérémonie'],
    heure: 'doree',
    objets: [
      ASSIETTE,
      GATEAU,
      BILLETS,
      O('micro', 'micro du DJ', 'la dédicace qui révèle le secret', ['micro', 'dédicace', 'discours']),
    ],
    pnj: [
      N('invités qui dansent', 'travaille', 1, 2),
      N('invités attablés', 'discute', 1, 2),
      N('photographe', 'passe', 0, 1),
    ],
    animaux: [
      A('oiseau', 'traverse le ciel', 0.6, 2, 3),
      A('chevre', 'la chèvre de la dot, attachée', 0.25, 1, 1),
    ],
    fx: ['bokeh', 'rayons', 'feuilles'],
    sons: ['musique', 'foule'],
    vie: 'tentes blanc et or, billets qui volent sur les danseurs, musique trop forte',
  },
  {
    id: 'hopital',
    nom: 'Hôpital',
    match: /\b(hopital|clinique|infirmerie|maternite|centre de sante|docteur|medecin)\b/,
    exterieur: false,
    kit: 'Hôpital',
    template: 'piece',
    palette: ['#a8d5ba', '#ffffff', '#2e86c1'],
    habitues: ['Hôpital'],
    heure: 'jour',
    objets: [
      PAPIERS,
      O('perfusion', 'pied à perfusion', 'on s’y accroche pour fuir la facture', ['perfusion', 'piqûre']),
      O('lit', 'lit d’hôpital', 'le malade imaginaire s’y jette', ['lit', 'malade', 'couché']),
      POULET,
    ],
    pnj: [
      N('patient qui attend', 'file', 1, 3),
      N('soignant pressé', 'passe', 1, 1),
      N('patient qui tousse', 'attend', 0, 1),
    ],
    animaux: [],
    fx: ['ventilateur', 'rayons'],
    sons: ['annonces', 'ventilateur', 'foule'],
    vie: 'salle d’attente pleine, appels au haut-parleur, une infirmière qui court',
  },
  {
    id: 'ecole',
    nom: 'École',
    match: /\b(ecole|classe|lycee|college|maitre|bulletin)\b/,
    exterieur: false,
    kit: 'École',
    template: 'piece',
    palette: ['#f5e6b8', '#2e7d32', '#1565c0'],
    habitues: ['École'],
    heure: 'jour',
    objets: [
      PAPIERS,
      BALLON,
      O('tableau', 'tableau noir', 'la faute écrite en grand', ['tableau', 'craie', 'dictée']),
    ],
    pnj: [N('élèves qui chahutent', 'passe', 2, 3), N('élève qui récite', 'travaille', 0, 1)],
    animaux: [
      A('margouillat', 'fait des pompes sous la fenêtre', 0.35, 1, 1),
      A('oiseau', 'se pose sur le rebord', 0.3, 1, 2),
    ],
    fx: ['poussiere', 'rayons'],
    sons: ['enfants', 'oiseaux'],
    vie: 'craie qui grince, élèves qui chuchotent, rayons de soleil pleins de poussière',
  },
  {
    id: 'bureau',
    nom: 'Bureau',
    match: /\b(bureau|banque|office|administration|mairie|guichet)\b/,
    exterieur: false,
    kit: 'Bureau',
    template: 'piece',
    palette: ['#d9d4c7', '#5d6d7e', '#b9770e'],
    habitues: ['Bureau'],
    heure: 'jour',
    objets: [
      PAPIERS,
      BILLETS,
      O('ordinateur', 'vieil ordinateur', 'il plante au moment de valider', [
        'ordinateur',
        'système',
        'réseau',
      ]),
      TELEPHONE,
    ],
    pnj: [
      N('collègue débordé', 'travaille', 1, 2),
      N('client qui fait la queue', 'file', 1, 3),
      N('vigile', 'attend', 0, 1),
    ],
    animaux: [],
    fx: ['ventilateur', 'ecran'],
    sons: ['ventilateur', 'foule'],
    vie: 'piles de dossiers, ventilateur qui fait voler les papiers, file d’attente qui soupire',
  },
  {
    id: 'tribunal',
    nom: 'Tribunal',
    match: /\b(tribunal|proces|juge|avocat)\b/,
    exterieur: false,
    kit: 'Tribunal',
    template: 'hall',
    palette: ['#8d6e63', '#f5f5f5', '#1a237e'],
    habitues: ['Tribunal'],
    heure: 'jour',
    objets: [
      PAPIERS,
      O('marteau', 'marteau du juge', 'on tape pour faire taire', ['silence', 'marteau', 'objection']),
    ],
    pnj: [N('public qui chuchote', 'regarde', 2, 3), N('greffier', 'travaille', 0, 1)],
    animaux: [],
    fx: ['rayons', 'poussiere'],
    sons: ['foule'],
    vie: 'public qui chuchote, ventilateurs au plafond, dossiers qui s’empilent',
  },
  {
    id: 'aeroport',
    nom: 'Aéroport',
    match: /\b(aeroport|avion|vol|douane|frontiere|passeport)\b/,
    exterieur: false,
    kit: 'Douane',
    template: 'hall',
    palette: ['#eceff1', '#1565c0', '#2e7d32'],
    habitues: ['Douane'],
    heure: 'jour',
    objets: [
      VALISE,
      PAPIERS,
      O('tapis', 'tapis à bagages', 'la valise qui ne vient jamais', ['bagage', 'tapis']),
    ],
    pnj: [
      N('voyageurs avec valises', 'passe', 2, 3),
      N('voyageurs qui attendent', 'file', 1, 2),
      N('agent de contrôle', 'travaille', 0, 1),
    ],
    animaux: [A('pigeon', 'picore sous les bancs', 0.3, 1, 2)],
    fx: ['rayons', 'ecran'],
    sons: ['annonces', 'foule'],
    vie: 'annonces au haut-parleur, valises qui roulent, contrôle des bagages',
  },
  {
    id: 'gare',
    nom: 'Gare routière',
    match: /\b(gare|autogare|gbaka|car|bus|woro|terminus)\b/,
    exterieur: true,
    kit: 'Taxi',
    template: 'rue',
    palette: ['#f1c40f', '#27ae60', '#7f8c8d'],
    habitues: ['Taxi', 'Marché'],
    heure: 'jour',
    objets: [
      VALISE,
      BILLETS,
      O('bidon', 'bidon et ballots', 'on s’assoit dessus, ils s’effondrent', ['ballot', 'bidon', 'sac']),
    ],
    pnj: [
      N('voyageurs chargés', 'passe', 2, 3),
      N('apprenti qui crie les destinations', 'travaille', 1, 1),
      N('vendeuse ambulante', 'passe', 1, 1),
    ],
    animaux: [
      A('poule', 'dans un panier sur le toit, s’échappe', 0.5, 1, 2),
      A('chevre', 'voyage elle aussi', 0.3, 1, 1),
      A('pigeon', 'picore', 0.4, 2, 3),
    ],
    fx: ['poussiere', 'rayons'],
    sons: ['circulation', 'foule', 'annonces'],
    vie: 'gbakas qui klaxonnent, apprentis qui crient « Adjamé ! », vendeuses de pain et d’eau',
  },
  {
    id: 'rue',
    nom: 'Rue',
    match: /\b(rue|quartier|trottoir|carrefour|route|avenue|taxi)\b/,
    exterieur: true,
    kit: 'Taxi',
    template: 'rue',
    palette: ['#f39c12', '#16a085', '#8e44ad'],
    habitues: ['Taxi', 'Marché', 'Cour'],
    heure: 'jour',
    objets: [TELEPHONE, BOUTEILLES, O('moto', 'moto', 'elle ne démarre pas', ['moto', 'démarre'])],
    pnj: [
      N('passants', 'passe', 2, 4),
      N('vendeur ambulant', 'passe', 0, 1),
      N('badauds qui commentent', 'regarde', 0, 2),
    ],
    animaux: [
      A('chien', 'trotte et renifle', 0.4, 1, 1),
      A('poule', 'traverse la rue', 0.4, 1, 2),
      A('margouillat', 'fait des pompes sur le mur', 0.4, 1, 1),
      A('pigeon', 'picore', 0.3, 2, 3),
    ],
    fx: ['poussiere', 'rayons'],
    sons: ['circulation', 'foule'],
    vie: 'taxis orange, motos, vendeurs ambulants, badauds qui commentent toute dispute',
  },
  {
    id: 'centre-commercial',
    nom: 'Centre commercial',
    match: /\b(centre commercial|supermarche|mall|boutique|magasin|caisse)\b/,
    exterieur: false,
    template: 'hall',
    palette: ['#fafafa', '#e74c3c', '#3498db'],
    habitues: ['Marché', 'Maquis', 'Salon de coiffure'],
    heure: 'jour',
    objets: [
      BILLETS,
      TELEPHONE,
      O('caddie', 'caddie', 'il part tout seul', ['caddie', 'courses', 'promo']),
      O('vitrine', 'vitrine', 'on se regarde dedans', ['vitrine', 'promo', 'solde']),
    ],
    pnj: [
      N('clients avec sacs', 'passe', 2, 4),
      N('clients devant une vitrine', 'regarde', 1, 2),
      N('agent d’accueil', 'attend', 0, 1),
    ],
    animaux: [],
    fx: ['rayons', 'ecran', 'bokeh'],
    sons: ['foule', 'annonces', 'musique'],
    vie: 'carrelage brillant, vitrines en promo, annonces de soldes, escalator qui grince',
  },
  {
    id: 'parc',
    nom: 'Parc',
    match: /\b(parc|jardin|square|pelouse|banc)\b/,
    exterieur: true,
    template: 'parc',
    palette: ['#4caf50', '#8d6e63', '#ffeb3b'],
    habitues: ['Plage', 'École', 'Cour'],
    heure: 'doree',
    objets: [
      BALLON,
      O('banc', 'banc', 'on s’y endort, quelqu’un s’y assoit déjà', ['banc', 'asseoir']),
      TELEPHONE,
    ],
    pnj: [
      N('promeneurs', 'passe', 1, 3),
      N('amoureux sur un banc', 'discute', 0, 1),
      N('joggeur', 'passe', 0, 1),
    ],
    animaux: [
      A('oiseau', 'vole d’arbre en arbre', 0.9, 2, 4),
      A('pigeon', 'picore les miettes', 0.6, 2, 4),
      A('chien', 'court après le ballon', 0.35, 1, 1),
      A('canard', 'se dandine au bord de l’eau', 0.2, 1, 2),
    ],
    fx: ['feuilles', 'rayons', 'poussiere'],
    sons: ['oiseaux', 'enfants', 'insectes'],
    vie: 'oiseaux dans les arbres, feuilles qui tombent, joggeur qui passe deux fois',
  },
  {
    id: 'plage',
    nom: 'Plage',
    match: /\b(plage|beach|mer|lagune|bord de l eau)\b/,
    exterieur: true,
    kit: 'Plage',
    template: 'parc',
    palette: ['#f6d7a7', '#1abc9c', '#e67e22'],
    habitues: ['Plage'],
    heure: 'doree',
    objets: [ASSIETTE, BOUTEILLES, BALLON],
    pnj: [
      N('pêcheurs avec filets', 'travaille', 1, 2),
      N('baigneurs', 'passe', 1, 2),
      N('vendeur de noix de coco', 'passe', 0, 1),
    ],
    animaux: [A('oiseau', 'mouettes qui planent', 0.9, 2, 4), A('chien', 'court sur le sable', 0.3, 1, 1)],
    fx: ['vagues', 'rayons'],
    sons: ['vagues', 'oiseaux', 'foule'],
    vie: 'pirogues colorées, vagues, mouettes, vendeurs ambulants sur le sable',
  },
  {
    id: 'village',
    nom: 'Village',
    match: /\b(village|brousse|case|campagne|champ|ferme)\b/,
    exterieur: true,
    kit: 'Village',
    template: 'parc',
    palette: ['#c0392b', '#8d6e63', '#27ae60'],
    habitues: ['Village'],
    heure: 'jour',
    objets: [
      MARMITE,
      O('mortier', 'mortier et pilon', 'on pile le foutou en rythme', ['foutou', 'piler', 'mortier']),
      CHAISE,
    ],
    pnj: [
      N('femmes qui pilent', 'travaille', 1, 2),
      N('anciens sous l’arbre', 'discute', 1, 2),
      N('enfants', 'passe', 1, 2),
    ],
    animaux: [
      A('poule', 'picore, caquette', 0.95, 3, 5),
      A('chevre', 'broute, bêle au mauvais moment', 0.8, 1, 3),
      A('oiseau', 'traverse le ciel', 0.7, 2, 3),
      A('canard', 'se dandine', 0.3, 1, 2),
    ],
    fx: ['poussiere', 'feuilles', 'rayons'],
    sons: ['oiseaux', 'insectes', 'enfants'],
    vie: 'baobab, cases, poules partout, chèvres qui bêlent, anciens sous l’arbre à palabres',
  },
  {
    id: 'chambre',
    nom: 'Chambre',
    match: /\b(chambre|lit|dortoir|logement|appartement|studio)\b/,
    exterieur: false,
    template: 'piece',
    palette: ['#f3e5ab', '#6d4c41', '#7e57c2'],
    habitues: ['Salon', 'Cour'],
    heure: 'soir',
    objets: [
      O('lit', 'lit', 'on se cache dessous', ['lit', 'dormir', 'sieste']),
      TELEPHONE,
      O('armoire', 'armoire', 'quelqu’un est caché dedans', ['armoire', 'cacher', 'caché']),
    ],
    pnj: [],
    animaux: [A('chat', 'dort sur le lit', 0.5, 1, 1), A('margouillat', 'au plafond', 0.3, 1, 1)],
    fx: ['ventilateur', 'ecran'],
    sons: ['ventilateur', 'insectes'],
    vie: 'ventilateur qui grince, moustiquaire, téléphone qui vibre sous l’oreiller',
  },
];

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ');
/** The place of a location / idea text: the first catalogue place whose words appear, by priority of specificity. */
const PRIORITY = [
  'salon-coiffure',
  'centre-commercial',
  'aeroport',
  'gare',
  'hopital',
  'tribunal',
  'ecole',
  'ceremonie',
  'maquis',
  'restaurant',
  'marche',
  'plage',
  'village',
  'parc',
  'chambre',
  'bureau',
  'salon',
  'cour',
  'rue',
];
export function placeOf(text: string): Place | null {
  const t = fold(text);
  for (const id of PRIORITY) {
    const p = PLACES.find((x) => x.id === id)!;
    if (p.match.test(t)) return p;
  }
  return null;
}
/** Any location, even unknown: the catalogue place, else a new place built on the closest template. */
export function placeFor(text: string): Place {
  const known = placeOf(text);
  if (known) return known;
  const t = fold(text);
  const out = /\b(dehors|exterieur|cour|terrain|stade|chantier|route|foret|riviere)\b/.test(t);
  return {
    id: `lieu-${
      t
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30) || 'nouveau'
    }`,
    nom: text.trim().slice(0, 40) || 'Nouveau lieu',
    match: /$^/,
    exterieur: out,
    template: out ? 'rue' : 'piece',
    palette: out ? ['#e0a96d', '#6d9dc5', '#c44536'] : ['#efe1c6', '#8a5a44', '#3d8b8b'],
    habitues: out ? ['Taxi', 'Marché', 'Cour'] : ['Salon', 'Bureau'],
    heure: 'jour',
    objets: [TELEPHONE, BILLETS, CHAISE],
    pnj: [N('passants', 'passe', 1, 2), N('témoin qui regarde', 'regarde', 0, 1)],
    animaux: out
      ? [A('oiseau', 'traverse le ciel', 0.6, 1, 3), A('chien', 'trotte', 0.3, 1, 1)]
      : [A('chat', 'traverse', 0.3, 1, 1)],
    fx: out ? ['poussiere', 'rayons'] : ['ventilateur'],
    sons: out ? ['circulation', 'oiseaux'] : ['ventilateur'],
    vie: out ? 'passants, un chien qui trotte, poussière dorée' : 'ventilateur, un chat qui traverse',
  };
}
/** What the writer gets about the place: objects to use, extras who react, animals that get involved. */
export function placeBrief(text: string): string {
  const p = placeOf(text);
  if (!p) return '';
  return [
    `LE LIEU EST VIVANT (${p.nom}) : ${p.vie}.`,
    `Objets à utiliser dans les gags : ${p.objets.map((o) => `${o.nom} (${o.interaction})`).join(' ; ')}.`,
    p.pnj.length ? `Figurants qui réagissent en fond : ${p.pnj.map((n) => n.role).join(', ')}.` : '',
    p.animaux.length
      ? `Animaux possibles : ${p.animaux.map((a) => `${a.espece} (${a.comportement})`).join(' ; ')}.`
      : '',
    'Fais interagir les personnages avec ces objets, ces figurants et ces animaux au moins une fois (un objet qui trahit, un figurant qui réagit au punch, un animal qui s’en mêle).',
  ]
    .filter(Boolean)
    .join(' ');
}
/** The catalogue as the Blender pipeline reads it (scripts/blenderfilm/world.json). */
export function worldJson(): Record<string, unknown> {
  return {
    priority: PRIORITY,
    places: PLACES.map((p) => ({ ...p, match: p.match.source })),
  };
}
