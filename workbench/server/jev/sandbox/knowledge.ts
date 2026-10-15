// LES SAVOIRS DE JEV POUR DIRIGER LE BAC À SABLE (v64). Des fiches courtes, par domaine, choisies selon la demande et
// ajoutées aux consignes du modèle de Réalisation : règles de métier (ce qui rend un résultat juste et spectaculaire) +
// fonctions de la bibliothèque `jev` à utiliser. Chaque fiche dit sa source et si ses valeurs sont VÉRIFIÉES (formules
// testées numériquement) ou APPROCHÉES (valeurs de manuel lissées, à confirmer). Ce que JEV ne sait pas encore est
// cherché par sa veille (cerveau JEV) et rangé en fiche apprise.
export type SandboxDomain = 'mouvement' | 'physique' | 'quantique' | 'mathématiques' | 'projection' | 'lumière';
export interface SandboxCard {
  id: string;
  domain: SandboxDomain;
  title: string;
  /** When the card applies (matched on the request). */
  when: RegExp;
  rules: string[];
  api: string[];
  sources: string[];
  status: 'vérifié' | 'approché';
}

export const SANDBOX_CARDS: SandboxCard[] = [
  {
    id: 'mvt-marche',
    domain: 'mouvement',
    title: 'Marche et course humaines crédibles',
    when: /\b(march\w*|court|courir|course|jogging|pas\b|d[ée]marche|personnage|humain|homme|femme|enfant|danse\w*|acteur|avatar|corps)\b/i,
    rules: [
      'Cycle de marche : ≈ 60 % d’appui, 40 % d’oscillation ; hanche fléchie ≈ 30° au contact du talon, en extension ≈ 10° en fin d’appui ; genou ≈ 60° de flexion au milieu de l’oscillation, presque tendu au contact ; cheville en flexion plantaire ≈ 20° au décollement des orteils.',
      'Le bassin monte et descend deux fois par foulée (≈ 4 cm au total), se balance latéralement ; les bras balancent en opposition des jambes ; le tronc reste stable.',
      'Vitesse et foulée liées (≈ 1,4 m de foulée à 1,4 m/s pour 1,75 m) ; les pieds ne glissent jamais : la jambe d’appui pousse le corps.',
      'Proportions : utiliser jev.human.segments(taille) plutôt que des longueurs au hasard ; respecter les amplitudes articulaires (jev.human.limits).',
      'Vie : respiration (12–20 / min), clignements (≈ 15 / min), micro-déplacements du poids quand le personnage est immobile.',
    ],
    api: ['jev.human.gait(phase, vitesse)', 'jev.human.segments(H)', 'jev.human.limits', 'jev.human.breath(t)', 'jev.human.blink(t)'],
    sources: ['Winter, Biomechanics and Motor Control of Human Movement (4e éd., 2009)', 'Perry & Burnfield, Gait Analysis (2e éd., 2010)', 'Uustal, Normal Gait (hanche 30° au contact initial)'],
    status: 'approché',
  },
  {
    id: 'mvt-animation',
    domain: 'mouvement',
    title: 'Principes d’animation (Disney) appliqués au code',
    when: /\b(anim\w*|mouvement|geste|saut\w*|rebond\w*|personnage|cartoon|dessin anim\w*|expressi\w*)\b/i,
    rules: [
      'Anticipation avant un geste, suivi (follow-through) et chevauchement après ; ralenti en entrée et en sortie (jev.ease.inOutCubic, outBack pour un dépassement).',
      'Écrasement-étirement en conservant le volume (sx·sy·sz ≈ 1) ; arcs naturels (jev.catmullRom / jev.bezier) plutôt que des lignes droites.',
      'Rythme : gestes principaux sur les temps forts, pauses tenues ; rien ne bouge en même temps que tout le reste.',
    ],
    api: ['jev.ease.*', 'jev.catmullRom', 'jev.bezier', 'jev.quat.slerp'],
    sources: ['Thomas & Johnston, The Illusion of Life (1981)'],
    status: 'approché',
  },
  {
    id: 'phy-meca',
    domain: 'physique',
    title: 'Physique classique juste',
    when: /\b(physique|gravit\w*|chute|lanc\w*|projectile|balistique|ressort|pendule|rebond\w*|collision|choc|corde|tissu|drapeau|orbite|plan[eè]te|satellite|fluide|flott\w*|frottement|tra[iî]n[ée]e)\b/i,
    rules: [
      'g = 9,80665 m/s² ; une scène à l’échelle 1 unité = 1 m ; pas de temps fixe (1/60 s) découplé de l’affichage, avec accumulateur.',
      'Ressorts amortis (jev.physics.springDamper) pour tout ce qui suit ou rebondit ; cordes et tissus par Verlet + contraintes (jev.physics.verlet), 8 itérations.',
      'Chocs : quantité de mouvement conservée, coefficient de restitution < 1 (jev.physics.collide1D) ; orbites par Kepler (jev.physics.keplerPosition), pas par une boucle d’Euler qui dérive.',
      'Pour beaucoup de corps rigides : cannon-es (MIT) ou Rapier (Apache-2.0), pas une physique maison.',
    ],
    api: ['jev.physics.*', 'jev.rk4', 'jev.solveQuadratic'],
    sources: ['Halliday, Resnick & Walker, Fundamentals of Physics', 'Jakobsen, Advanced Character Physics (GDC 2001, Verlet)'],
    status: 'vérifié',
  },
  {
    id: 'qu-orbitales',
    domain: 'quantique',
    title: 'Physique quantique montrée juste',
    when: /\b(quantique|quantum|orbitale?s?|atome|[ée]lectron|hydrog[eè]ne|fonction d.onde|schr[öo]dinger|puits|oscillateur|fentes?|young|interf[ée]rence|effet tunnel|tunnel|qubit|bloch|spin|photon|superposition|intrication)\b/i,
    rules: [
      'Une orbitale est une DENSITÉ de probabilité |ψ|² : la montrer en nuage de points (jev.quantum.sampleOrbital → THREE.Points, additif) ou en isosurface, jamais en électron sur une orbite circulaire.',
      'Formes : s sphérique, p en haltère (2 lobes), d en trèfle (4 lobes) ou dz² ; le nombre de nœuds radiaux est n − l − 1 ; la taille croît ≈ n² a0.',
      'Fentes de Young : franges cos² modulées par l’enveloppe de diffraction sinc² (jev.quantum.doubleSlit) ; impacts accumulés un par un pour montrer la nature corpusculaire.',
      'Effet tunnel : transmission qui chute exponentiellement avec la largeur de la barrière (jev.quantum.tunneling) ; paquet d’ondes qui s’étale avec le temps (jev.quantum.wavePacket).',
      'Qubit : sphère de Bloch (jev.quantum.bloch) ; une mesure donne 0 ou 1 avec les probabilités cos²(θ/2), sin²(θ/2).',
    ],
    api: ['jev.quantum.*'],
    sources: ['Griffiths & Schroeter, Introduction to Quantum Mechanics (3e éd.)', 'CODATA 2018 (constantes)'],
    status: 'vérifié',
  },
  {
    id: 'math-outils',
    domain: 'mathématiques',
    title: 'Mathématiques au service de l’image',
    when: /\b(math\w*|fractal\w*|courbe|spline|b[ée]zier|bruit|perlin|proc[ée]dural|terrain|g[ée]om[ée]trie|fourier|onde|spirale|sym[ée]trie|al[ée]atoire|rotation|quaternion|[ée]quation|fonction|graphe)\b/i,
    rules: [
      'Rotations 3D en quaternions (jev.quat) et interpolation slerp : jamais d’angles d’Euler interpolés (blocage de cardan).',
      'Terrains, nuages, textures : bruit cohérent fractal (jev.makeNoise(seed).fbm) avec une graine fixe pour la reproductibilité.',
      'Trajectoires : splines Catmull-Rom (passent par les points) ou Bézier (contrôle fin) ; équations différentielles par RK4 (jev.rk4), pas par Euler.',
      'Visualiser une formule : la tracer sur un axe gradué avec unités, et la nommer (KaTeX disponible pour l’écrire).',
    ],
    api: ['jev.quat', 'jev.makeNoise', 'jev.catmullRom', 'jev.bezier', 'jev.rk4', 'jev.fourier', 'jev.solveQuadratic'],
    sources: ['Perlin, Improving Noise (SIGGRAPH 2002)', 'Shoemake, Animating Rotation with Quaternion Curves (SIGGRAPH 1985)'],
    status: 'vérifié',
  },
  {
    id: 'proj-camera',
    domain: 'projection',
    title: 'Projection 3D et caméra de cinéma',
    when: /\b(3d|camera|cam[ée]ra|perspective|projection|plan\b|travelling|zoom|focale|objectif|vue|point de vue|cadrage|profondeur|scène|sc[eè]ne|monde|vid[ée]o|film)\b/i,
    rules: [
      'Choisir une FOCALE de cinéma et en déduire le champ (jev.proj.fovFromFocal) : 24–35 mm large, 50 mm naturel, 85 mm portrait ; camera.fov de three.js est le champ VERTICAL.',
      'near / far serrés autour de la scène (ex. 0,1 et 200) pour la précision de profondeur ; l’horizon au tiers de l’image ; règle des tiers pour le sujet.',
      'Mouvements de caméra lents et lissés (jev.ease), cible qui précède légèrement le sujet ; un seul axe de mouvement à la fois.',
      'Pour cliquer ou placer un objet sous la souris : jev.proj.unproject(px, py, cam) donne le rayon ; jev.proj.project vérifie qu’un élément est bien dans le cadre (visible).',
    ],
    api: ['jev.proj.project', 'jev.proj.unproject', 'jev.proj.fovFromFocal', 'jev.proj.perspective', 'jev.proj.lookAt'],
    sources: ['OpenGL / WebGL : matrices de projection (gluPerspective, gluLookAt)', 'three.js PerspectiveCamera (fov vertical)'],
    status: 'vérifié',
  },
  {
    id: 'lum-rendu',
    domain: 'lumière',
    title: 'Lumière et rendu « époustouflants »',
    when: /\b(lumi[eè]re|[ée]clairage|soleil|coucher|aube|nuit|n[ée]on|ombre|reflet|brillant|m[ée]tal|verre|cin[ée]ma\w*|r[ée]aliste|beau|[ée]poustouflant|magnifique|spectaculaire)\b/i,
    rules: [
      'Éclairage trois points (clé, contre, débouchage) ou soleil + ciel hémisphérique ; ombres douces (PCFSoftShadowMap) sur le sol ; ACESFilmicToneMapping, sortie sRGB.',
      'Matériaux physiques (MeshStandardMaterial / Physical) avec rugosité et métal cohérents ; environnement (RoomEnvironment + PMREM) pour des reflets crédibles.',
      'Profondeur : brouillard atmosphérique léger, lumière chaude en avant-plan / froide au loin ; post-traitement modéré (bloom sur les sources seulement, vignette).',
      'Une palette de 3 à 5 couleurs harmonieuses ; un seul point focal par plan.',
    ],
    api: ['three/addons/environments/RoomEnvironment.js', 'three/addons/postprocessing/*'],
    sources: ['three.js manual — Color management, Tone mapping', 'Brown, Cinematography: Theory and Practice'],
    status: 'approché',
  },
];

/** The cards that fit a request: every domain whose words appear, at most `max`, most specific first. */
export function sandboxCards(request: string, kind?: string, max = 4): SandboxCard[] {
  const hits = SANDBOX_CARDS.filter((c) => c.when.test(request));
  // A 3D world or a film always gets the camera card.
  if ((kind === '3d' || kind === 'video') && !hits.some((c) => c.domain === 'projection')) hits.push(SANDBOX_CARDS.find((c) => c.id === 'proj-camera')!);
  const order: SandboxDomain[] = ['quantique', 'mouvement', 'physique', 'mathématiques', 'projection', 'lumière'];
  return [...new Set(hits)].sort((a, b) => order.indexOf(a.domain) - order.indexOf(b.domain)).slice(0, max);
}

/** The block appended to the sandbox system prompt. */
export function sandboxBlock(cards: SandboxCard[]): string {
  if (!cards.length) return '';
  return [
    'SAVOIRS DE JEV (à appliquer ; les fonctions citées sont dans la bibliothèque « jev ») :',
    ...cards.flatMap((c) => [`▸ ${c.title} — ${c.status === 'vérifié' ? 'formules vérifiées' : 'valeurs de manuel approchées'} (${c.sources[0]})`, ...c.rules.map((r) => `  - ${r}`), `  - Outils : ${c.api.join(', ')}`]),
  ].join('\n');
}
