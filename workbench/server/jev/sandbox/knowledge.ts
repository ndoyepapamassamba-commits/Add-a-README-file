// LES SAVOIRS DE JEV POUR DIRIGER LE BAC À SABLE (v64). Des fiches courtes, par domaine, choisies selon la demande et
// ajoutées aux consignes du modèle de Réalisation : règles de métier (ce qui rend un résultat juste et spectaculaire) +
// fonctions de la bibliothèque `jev` à utiliser. Chaque fiche dit sa source et si ses valeurs sont VÉRIFIÉES (formules
// testées numériquement) ou APPROCHÉES (valeurs de manuel lissées, à confirmer). Ce que JEV ne sait pas encore est
// cherché par sa veille (cerveau JEV) et rangé en fiche apprise.
export type SandboxDomain = 'mouvement' | 'cinéma' | 'réalisme' | 'physique' | 'quantique' | 'mathématiques' | 'projection' | 'lumière';
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
      'Éclairage trois points (clé, contre, débouchage) ou soleil + ciel hémisphérique ; ombres PCFShadowMap (PCFSoftShadowMap n’existe plus dans three r186) avec shadow.radius pour les adoucir ; ACESFilmicToneMapping, sortie sRGB.',
      'Matériaux physiques (MeshStandardMaterial / Physical) avec rugosité et métal cohérents ; environnement (RoomEnvironment + PMREM) pour des reflets crédibles.',
      'Profondeur : brouillard atmosphérique léger, lumière chaude en avant-plan / froide au loin ; post-traitement modéré (bloom sur les sources seulement, vignette).',
      'Une palette de 3 à 5 couleurs harmonieuses ; un seul point focal par plan.',
    ],
    api: ['three/addons/environments/RoomEnvironment.js', 'three/addons/postprocessing/*'],
    sources: ['three.js manual — Color management, Tone mapping', 'Brown, Cinematography: Theory and Practice'],
    status: 'approché',
  },
  // ── v1.1 (15/10/2026) : outils d'animation, de cinéma, procédure d'animation de personnage, réalisme ──
  {
    id: 'mvt-personnage',
    domain: 'mouvement',
    title: 'Procédure d’animation de personnage (14 étapes, exécutable)',
    when: /\b(personnage|acteur|actrice|dialogue|sketch|parl\w*|discut\w*|conversation|r[ée]plique|troupe|mamadou|baye|karim|moussa|interview|t[ée]moignage|cartoon|dessin anim\w*|sc[eè]ne de vie)\b/i,
    rules: [
      'Suivre la procédure dans l’ordre : intention → proportions → poses clés (blocage) → timing (parole, musique) → intermédiaires (anticipation, arcs) → courbes (pieds sans glissement) → parole → regard → gestes → secondaire → écoute → polissage → caméra et montage → contrôle.',
      'Ne jamais écrire le timing à la main : const plan = jev.character.plan(répliques) date chaque syllabe, chaque visème, les accents, les gestes, les hochements de celui qui écoute, les clignements et le découpage caméra ; à chaque image, jev.character.pose(plan, qui, t) donne bouche, paupières, regard, hochement, geste, souffle.',
      'Regard : les yeux partent avant la tête (jusqu’à ≈ 100 ms) ; celui qui écoute regarde celui qui parle et acquiesce aux fins de groupe ; personne ne reste figé (respiration, poids, micro-gestes).',
      'Contrôle avant de livrer : jev.qa.footSkate (pieds qui glissent), jev.qa.penetration (pieds dans le sol), jev.qa.jitter (à-coups), jev.qa.lipSync (décalage bouche/son), jev.qa.limits (articulations) ; corriger puis refaire.',
    ],
    api: ['jev.character.procedure', 'jev.character.plan', 'jev.character.pose', 'jev.qa.*'],
    sources: ['Procédure classique blocage → spline → polissage (cours d’animation, AnimSchool)', 'Andrist et al., modèle tête-yeux des regards (ICMI 2012)'],
    status: 'approché',
  },
  {
    id: 'mvt-parole',
    domain: 'mouvement',
    title: 'Parole, synchronisation labiale et gestes en français',
    when: /\b(parl\w*|dialogu\w*|voix|bouche|l[èe]vres?|lip.?sync|synchro\w*|chant\w*|discours|r[ée]plique|sous-titr\w*|doublage)\b/i,
    rules: [
      'Bouches A–H et X (Rhubarb Lip Sync, MIT) : A fermée (p b m), D grande ouverte (a, an), E arrondie (o, on, eu), F très arrondie (ou, u, ch), G dents sur la lèvre (f v), H langue (l) ; jev.speech.plan(texte) les date, jev.speech.mouthAt(plan, t) les fond (coarticulation) et met la bouche 1–2 images avant le son.',
      'Le français accentue la DERNIÈRE syllabe du groupe rythmique : c’est là que tombent le sommet des gestes de battement (un peu avant la voyelle) et les hochements (jev.speech.plan → accents).',
      'Débit ≈ 7,2 syllabes/s en lecture (Pellegrino et al. 2011), plus lent pour jouer ; clignements ≈ 26/min en parlant contre ≈ 17/min au repos (Bentivoglio et al. 1997).',
      'Synchro jugée avec l’UIT-R BT.1359 : un décalage devient perceptible au-delà de 45 ms d’avance du son ou 125 ms de retard ; jev.qa.lipSync mesure le décalage.',
    ],
    api: ['jev.speech.plan', 'jev.speech.mouthAt', 'jev.speech.blinks', 'jev.speech.lidAt', 'jev.qa.lipSync'],
    sources: ['Rhubarb Lip Sync (MIT) — formes de bouche', 'UIT-R BT.1359-1 (1998)', 'Pellegrino, Coupé & Marsico, Language 87(3), 2011', 'Bentivoglio et al., Movement Disorders 12(6), 1997'],
    status: 'approché',
  },
  {
    id: 'mvt-vivant',
    domain: 'mouvement',
    title: 'Corps non humains : oiseaux, poissons, quadrupèdes, végétation, tissus, flammes',
    when: /\b(oiseau\w*|vol\w*|aile\w*|poisson\w*|nag\w*|requin|dauphin|chien\w*|chat\w*|cheva\w*|vache\w*|ch[èe]vre\w*|mouton\w*|poule\w*|coq|animal\w*|animaux|serpent\w*|herbe|arbre\w*|feuill\w*|drapeau\w*|tissu|rideau|flamme\w*|feu|bougie|vagues?)\b/i,
    rules: [
      'Choisir la recette par le verbe : jev.motion.find(prompt) relie « vole, nage, trotte, flotte, scintille, se balance… » aux fonctions de la bibliothèque.',
      'Poissons : onde latérale croissante vers la queue, fréquence par le nombre de Strouhal f = St·U/A (St ≈ 0,2–0,4) — jev.motion.swim ; oiseaux : battement (jev.motion.flap, fréquences de jev.motion.wingHz) puis plané.',
      'Quadrupèdes : allures de Hildebrand (pas à 4 temps, trot en diagonales, galop rotatoire) avec phase et temps d’appui par patte — jev.motion.leg ; poules et pigeons : tête stabilisée puis projetée (jev.motion.headBob).',
      'Herbes, arbres, drapeaux, flammes : balancement + rafales (jev.motion.sway), onde qui court vers le bord libre (jev.motion.flag), scintillement en bruit (jev.motion.flicker).',
    ],
    api: ['jev.motion.find', 'jev.motion.flap', 'jev.motion.swim', 'jev.motion.leg', 'jev.motion.headBob', 'jev.motion.sway', 'jev.motion.flag', 'jev.motion.flicker'],
    sources: ['Triantafyllou et al., nage et nombre de Strouhal (1993)', 'Hildebrand, Symmetrical gaits of horses (Science 1965)'],
    status: 'approché',
  },
  {
    id: 'mvt-musique',
    domain: 'mouvement',
    title: 'Bouger avec la musique',
    when: /\b(musique|music|danse\w*|dance|rythme|tempo|bpm|beat|chanson|clip|chor[ée]graph\w*|concert|coup[ée].d[ée]cal[ée]|afrobeat|zouglou)\b/i,
    rules: [
      'Le rebond tombe SUR le temps, le balancement sur deux temps, les épaules en contretemps : jev.music.dance(t, bpm, style) ; jev.music.beat(t, bpm) donne le temps, la mesure, le temps fort.',
      'Tempo d’un son : jev.music.detectBpm(échantillons, fréquence) (autocorrélation des attaques entre 60 et 180 BPM).',
      'Vérifier l’alignement : jev.qa.kinematicBeats(vitesses) (arrêts du mouvement) comparés aux temps musicaux par jev.qa.beatAlignment (score BAS d’AIST++).',
    ],
    api: ['jev.music.beat', 'jev.music.pulse', 'jev.music.dance', 'jev.music.detectBpm', 'jev.qa.beatAlignment'],
    sources: ['Li et al., AI Choreographer / AIST++ (ICCV 2021) — score BAS'],
    status: 'approché',
  },
  {
    id: 'mvt-qualite',
    domain: 'mouvement',
    title: 'Mouvement fluide, sans à-coup ni saut',
    when: /\b(fluide|fluidit[ée]|sans (bug|erreur|saut|à-coup)|lisse\w*|transition\w*|enchaîn\w*|tremble\w*|jitter|saccad\w*|glisse\w*|qualit[ée] du mouvement)\b/i,
    rules: [
      'Amortir à cadence indépendante (jev.smooth.damp, demi-vie) ; ressort critique pour suivre une cible sans dépassement (jev.smooth.spring).',
      'Changer d’animation sans saut : jev.smooth.deadBlend (extrapolation qui ralentit puis fondu) ou jev.smooth.inertialize (décalage ramené à 0 sans saut de vitesse ni d’accélération).',
      'Données bruitées (capture, détection de pose) : filtre One Euro (jev.smooth.oneEuro) — lisse au repos, suit sans retard en mouvement.',
      'Mesurer avant de livrer : jev.qa.jitter (0 pic), jev.qa.footSkate (< 0,05 m/s), jev.qa.penetration (0).',
    ],
    api: ['jev.smooth.damp', 'jev.smooth.spring', 'jev.smooth.deadBlend', 'jev.smooth.inertialize', 'jev.smooth.oneEuro', 'jev.qa.*'],
    sources: ['Casiez, Roussel & Vogel, 1€ Filter (CHI 2012)', 'Bollo, Inertialization (GDC 2018)', 'Holden, Dead Blending (2023)'],
    status: 'vérifié',
  },
  {
    id: 'cine-plans',
    domain: 'cinéma',
    title: 'Grammaire des plans et mouvements de caméra',
    when: /\b(cin[ée]\w*|film\w*|plan\w*|cam[ée]ra|cadr\w*|travelling|drone|grue|zoom|vertigo|profondeur de champ|flou|bokeh|[ée]talonn\w*|format|scope|bande annonce|trailer|blockbuster|vid[ée]o|clip)\b/i,
    rules: [
      'Nommer chaque plan par sa taille (TGP, GP, PR, PA, PM, PE, PG) et le cadrer par jev.cine.frame(sujet, taille) : distance tirée du champ, yeux sur la ligne du tiers supérieur, air devant le regard ; deux personnages : jev.cine.twoShot, amorce : jev.cine.overShoulder.',
      'Un mouvement par plan, motivé : jev.cine.move("dolly-in" | "truck" | "crane" | "drone" | "pan" | "tilt" | "orbit" | "vertigo", plan, u) ; caméra portée seulement si le récit le veut (jev.cine.shake).',
      'Flou PHYSIQUE : jev.cine.dof(focale, ouverture, mise au point) ; jamais de faible profondeur de champ sur un plan large ou aérien (effet maquette, jev.cine.miniatureRisk) ; BokehPass réglé par jev.cine.bokeh.',
      'Format et étalonnage : jev.cine.letterbox(w, h, 2.39) pour le scope ; jev.cine.gradeShader("heure dorée" | "bleu-orange" | "nuit américaine" | "pellicule") dans un ShaderPass ; saturation retenue (l’excès fait jouet).',
    ],
    api: ['jev.cine.frame', 'jev.cine.twoShot', 'jev.cine.overShoulder', 'jev.cine.move', 'jev.cine.dof', 'jev.cine.gradeShader', 'jev.cine.letterbox', 'jev.cine.thirds'],
    sources: ['Ronfard et al., Prose Storyboard Language (WICED 2022)', 'Lino & Christie, Toric space (SIGGRAPH 2015)', 'Optique : hyperfocale H = f²/(N·c) + f'],
    status: 'vérifié',
  },
  {
    id: 'cine-montage',
    domain: 'cinéma',
    title: 'Découpage et montage d’une scène dialoguée',
    when: /\b(dialogu\w*|sketch|conversation|discut\w*|champ.contrechamp|montage|d[ée]coupage|storyboard|r[ée]plique|interview|sc[eè]ne)\b/i,
    rules: [
      'Idiomes (Leake et al., SIGGRAPH 2017) : plan d’ensemble d’ouverture, celui qui parle à l’image, plans de réaction sur les questions et les chutes, plans de plus en plus serrés quand l’émotion monte — jev.cine.coverage(répliques).',
      'Règle des 180° : la caméra reste du même côté de l’axe entre les deux personnages ; règle des 30° : deux plans successifs du même sujet changent d’angle d’au moins 30° ou de taille — jev.cine.check(plans) liste les faux raccords.',
      'Coupe qui suit la voix (J-cut) : on entend la réplique suivante ≈ 0,25 s avant de voir celui qui la dit ; couper pendant un mouvement (raccord dans le mouvement).',
      'Durée moyenne de plan selon le genre (Stephen Follows) : action ≈ 4 s, science-fiction ≈ 6,2 s, horreur ≈ 15,7 s.',
    ],
    api: ['jev.cine.coverage', 'jev.cine.check', 'jev.cine.asl', 'jev.character.plan'],
    sources: ['Leake, Davis, Truong & Agrawala, Computational Video Editing for Dialogue-Driven Scenes (SIGGRAPH 2017)', 'Stephen Follows, durée moyenne des plans par genre'],
    status: 'approché',
  },
  {
    id: 'realisme',
    domain: 'réalisme',
    title: 'Réalisme : ce qui fait « vrai » et ce qui fait « jouet »',
    when: /\b(r[ée]alis\w*|r[ée]el\w*|photo\w*|irr[ée]el\w*|lego|jouet|maquette|texture\w*|mati[èe]re\w*|cin[ée]matique|ultra|d[ée]taill\w*|voiture\w*|personnages?|b[âa]timent\w*|immeuble\w*)\b/i,
    rules: [
      'Ce qui fait jouet : couleurs saturées, arêtes vives, caméra haute avec flou (maquette), objets sans roues ni détails d’échelle ; ce qui fait vrai : peintures passées et salissures, arêtes arrondies (ExtrudeGeometry avec biseau, RoundedBoxGeometry), roues et ombres de contact, petits détails (balcons, câbles, plaques, rétroviseurs).',
      'Rendu : occlusion ambiante (GTAOPass), anticrénelage (cible MSAA samples: 4 du EffectComposer), environnement PMREM du ciel, peinture automobile en MeshPhysicalMaterial avec vernis (clearcoat), saturation retenue à l’étalonnage.',
      'Le procédural garde la composition et le mouvement ; pour une PHOTO réelle (visages, carrosseries, matières), passer le rendu dans un modèle d’édition d’image (bouton « Photo réaliste ») puis, si besoin, image → vidéo.',
    ],
    api: ['three/addons/postprocessing/GTAOPass.js', 'THREE.MeshPhysicalMaterial (clearcoat)', 'jev.cine.gradeShader("pellicule")'],
    sources: ['Retour utilisateur du 15/10/2026 (« trop Lego », « manque de réalisme »)', 'three.js r186 — GTAOPass, EffectComposer'],
    status: 'approché',
  },
];

/** The cards that fit a request: every domain whose words appear, at most `max`, most specific first. */
export function sandboxCards(request: string, kind?: string, max = 6): SandboxCard[] {
  const hits = SANDBOX_CARDS.filter((c) => c.when.test(request));
  // A 3D world or a film always gets the camera card; a film also gets the grammar of shots.
  if ((kind === '3d' || kind === 'video') && !hits.some((c) => c.domain === 'projection')) hits.push(SANDBOX_CARDS.find((c) => c.id === 'proj-camera')!);
  if (kind === 'video' && !hits.some((c) => c.id === 'cine-plans')) hits.push(SANDBOX_CARDS.find((c) => c.id === 'cine-plans')!);
  const order: SandboxDomain[] = ['quantique', 'mouvement', 'cinéma', 'physique', 'réalisme', 'mathématiques', 'projection', 'lumière'];
  const sorted = [...new Set(hits)].sort((a, b) => order.indexOf(a.domain) - order.indexOf(b.domain));
  // au plus deux fiches par domaine : les autres domaines demandés gardent leur place
  const per = new Map<SandboxDomain, number>();
  return sorted.filter((c) => (per.set(c.domain, (per.get(c.domain) ?? 0) + 1).get(c.domain) ?? 0) <= 2).slice(0, max);
}

/** The block appended to the sandbox system prompt. */
export function sandboxBlock(cards: SandboxCard[]): string {
  if (!cards.length) return '';
  return [
    'SAVOIRS DE JEV (à appliquer ; les fonctions citées sont dans la bibliothèque « jev ») :',
    ...cards.flatMap((c) => [`▸ ${c.title} — ${c.status === 'vérifié' ? 'formules vérifiées' : 'valeurs de manuel approchées'} (${c.sources[0]})`, ...c.rules.map((r) => `  - ${r}`), `  - Outils : ${c.api.join(', ')}`]),
  ].join('\n');
}
