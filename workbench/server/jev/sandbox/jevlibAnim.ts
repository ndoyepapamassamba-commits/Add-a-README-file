// OUTILS D'ANIMATION, DE CINÉMA ET PROCÉDURE D'ANIMATION DE PERSONNAGE DE JEV (jev 1.1, 15/10/2026 — « outils
// d'animation pour JEV », « outils cinématographiques pour JEV », « procédure d'animation DE PERSONNAGE pour JEV »).
// Ajoutés à la bibliothèque `jev` servie aux pages du bac à sable (même module, mêmes règles : aucune dépendance, code
// maison, vérifié par tests/unit/jevlibAnim.test.ts). Chaque valeur chiffrée dit sa source ; « approché » quand c'est
// une valeur de manuel ou une pratique d'animateur, pas une mesure.
//   jev.motion    dictionnaire des mouvements (humains et non humains) + lexique des verbes → recette
//   jev.speech    parole française : syllabes, visèmes (bouches A–H, X de Rhubarb, MIT), accents de fin de groupe,
//                 clignements, bouche à l'instant t avec coarticulation
//   jev.music     temps, mesures, pulsation, danse calée sur le tempo, détection du tempo d'un signal
//   jev.smooth    filtre « One Euro », amortisseur et ressort critiques, fondu « dead blending », inertialisation
//   jev.qa        contrôle qualité du mouvement : à-coups, glissement des pieds, pénétration du sol, alignement sur le
//                 rythme (BAS), synchronisation labiale (seuils UIT-R BT.1359)
//   jev.cine      grammaire des plans, cadrage par la taille de plan et la règle des tiers, champ-contrechamp, plans
//                 à deux, mouvements de caméra, tremblé, travelling compensé, profondeur de champ physique (sans effet
//                 « maquette »), formats, étalonnages, découpage d'un dialogue et contrôle des raccords (180°, 30°)
//   jev.character la PROCÉDURE d'animation de personnage (14 étapes) + plan exécutable d'une scène dialoguée et
//                 évaluation de la pose à l'instant t (bouche, yeux, tête, gestes, souffle)
// Rien ici n'utilise de backquote ni de « dollar-accolade » : la source est un modèle String.raw.

export const JEVLIB_ANIM_SOURCE = String.raw`
// ═════════════════════════ jev.smooth — lissage et transitions ═════════════════════════
const LN2 = Math.log(2);
export const smooth = {
  /** Amortissement indépendant de la cadence : rejoint la cible à moitié toutes les halflife secondes. */
  damp: (x, target, halflife, dt) => x + (target - x) * (1 - Math.pow(2, -dt / Math.max(1e-6, halflife))),
  /** Ressort critique (sans dépassement) paramétré par une demi-vie (Holden, « Spring-It-On », 2021) : [x, v]. */
  spring(x, v, goal, halflife, dt) {
    const y = (4 * LN2) / Math.max(1e-5, halflife) / 2;
    const j0 = x - goal, j1 = v + j0 * y, e = Math.exp(-y * dt);
    return [e * (j0 + j1 * dt) + goal, e * (v - j1 * y * dt)];
  },
  /**
   * Filtre « One Euro » (Casiez, Roussel, Vogel, CHI 2012) : lisse le bruit à basse vitesse, réduit le retard à haute
   * vitesse. beta dépend des unités (≈ 0,007 pour des pixels de souris ; ≈ 0,5–1 pour des mètres ou des angles).
   */
  oneEuro(minCutoff = 1, beta = 0.007, dCutoff = 1) {
    let xPrev = null, dxPrev = 0, tPrev = null;
    const alpha = (cut, te) => { const tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / te); };
    return (x, t) => {
      if (xPrev === null) { xPrev = x; tPrev = t; return x; }
      const te = Math.max(1e-6, t - tPrev);
      const dx = (x - xPrev) / te;
      const edx = dxPrev + alpha(dCutoff, te) * (dx - dxPrev);
      const cut = minCutoff + beta * Math.abs(edx);
      const out = xPrev + alpha(cut, te) * (x - xPrev);
      xPrev = out; dxPrev = edx; tPrev = t;
      return out;
    };
  },
  /**
   * « Dead blending » (Holden, 2023) : la pose source est extrapolée avec une vitesse qui décroît (demi-vie), puis
   * fondue vers la cible ; t = temps depuis le début de la transition.
   */
  deadBlend(x0, v0, target, t, blendTime = 0.3, halflife = 0.08) {
    const k = LN2 / Math.max(1e-6, halflife);
    const ext = x0 + (v0 / k) * (1 - Math.exp(-k * t));
    const a = clamp(t / Math.max(1e-6, blendTime), 0, 1);
    const s = a * a * (3 - 2 * a);
    return ext + (target - ext) * s;
  },
  /**
   * Inertialisation quintique (Bollo, GDC 2018) : décalage x0 (vitesse v0) ramené à 0 en t1 secondes, sans saut de
   * position, de vitesse ni d'accélération ; renvoie le décalage à l'instant t.
   */
  inertialize(x0, v0, t1, t) {
    if (Math.abs(x0) < 1e-9) return 0;
    let v = v0;
    if (v * x0 > 0) v = 0; // une vitesse qui éloigne de 0 est annulée (sinon dépassement)
    let T = t1;
    if (v !== 0) T = Math.min(T, (-5 * x0) / v);
    if (t >= T) return 0;
    const a0 = (-8 * v * T - 20 * x0) / (T * T);
    const A = -(a0 * T * T + 6 * v * T + 12 * x0) / (2 * Math.pow(T, 5));
    const B = (3 * a0 * T * T + 16 * v * T + 30 * x0) / (2 * Math.pow(T, 4));
    const C = -(3 * a0 * T * T + 12 * v * T + 20 * x0) / (2 * Math.pow(T, 3));
    return A * Math.pow(t, 5) + B * Math.pow(t, 4) + C * Math.pow(t, 3) + (a0 / 2) * t * t + v * t + x0;
  },
};

// ═════════════════════════ jev.motion — dictionnaire des mouvements ═════════════════════════
export const motion = {
  /**
   * Battements d'ailes typiques (Hz) — ordres de grandeur de manuel, APPROCHÉS : colibri 50, moineau 14, pigeon 7,
   * corbeau 4, mouette 3, aigle 2, chauve-souris 10, papillon 8, abeille 230.
   */
  wingHz: { colibri: 50, moineau: 14, pigeon: 7, corbeau: 4, mouette: 3, aigle: 2, 'chauve-souris': 10, papillon: 8, abeille: 230 },
  /** Aile : angle (rad) ; le corps monte quand l'aile s'abaisse (portance), décalé d'un quart de cycle. */
  flap(t, hz = 7, amp = 1.0) {
    const ph = TAU * hz * t;
    return { wing: Math.sin(ph) * amp, body: -Math.cos(ph) * 0.04 * amp, tail: Math.sin(ph + 1.2) * 0.1 * amp };
  },
  /** Plané : ailes tenues, petites corrections lentes, roulis dans les virages. */
  glide: (t, turn = 0) => ({ wing: 0.08 + Math.sin(t * 1.3) * 0.03, roll: -turn * 0.6, pitch: Math.sin(t * 0.7) * 0.04 }),
  /**
   * Nage d'un poisson : onde latérale qui croît vers la queue. Fréquence tirée du nombre de Strouhal St = f·A/U
   * (≈ 0,2–0,4 chez les nageurs efficaces, Triantafyllou et al.) : f = St·U/A. x ∈ [0 tête, 1 queue].
   */
  swim(x, t, speed = 1, length = 1, st = 0.3) {
    const A = 0.2 * length;
    const f = (st * speed) / A;
    const k = TAU / (0.95 * length);
    const env = 0.02 + 0.98 * x * x;
    return { lateral: A * 0.5 * env * Math.sin(k * x * length - TAU * f * t), hz: f };
  },
  /** Serpent : ondulation qui se propage de la tête à la queue (déplacement = onde). */
  slither: (x, t, speed = 0.6, wavelength = 0.4, amp = 0.12) => amp * Math.sin((TAU / wavelength) * (x - speed * t)),
  /** Herbe, branches, arbres : balancement propre (≈ 0,2–1 Hz, approché) + rafales. */
  sway(t, height = 1, freq = 0.4, gust = 0.5, seed = 1) {
    const n = makeNoise(seed);
    const g = 0.5 + 0.5 * n.noise2(t * 0.15, seed);
    return Math.sin(TAU * freq * t + seed) * 0.04 * height * (0.6 + gust * g) + n.noise2(t * 1.7, seed * 3) * 0.015 * height;
  },
  /** Drapeau, tissu au vent : onde qui court vers le bord libre, amplitude croissante. u ∈ [0 mât, 1 bout]. */
  flag: (u, v, t, wind = 1) => wind * (0.18 * u * Math.sin(TAU * (1.4 * u - 1.2 * t) + v * 1.5) + 0.04 * u * Math.sin(TAU * (3.1 * u - 2.3 * t))),
  /** Flamme, bougie : intensité scintillante (bruit), ≈ 0,8–1,2. */
  flicker(t, seed = 2) { const n = makeNoise(seed); return 1 + 0.12 * n.noise2(t * 9, 0.3) + 0.06 * n.noise2(t * 23, 1.7); },
  /** Objet qui flotte : pilonnement + roulis + tangage. */
  bob: (t, size = 1) => ({ heave: 0.08 * size * Math.sin(t * 1.1), roll: 0.05 * Math.sin(t * 0.8 + 1), pitch: 0.03 * Math.sin(t * 1.3 + 2) }),
  /** Respiration d'un corps (humain ou animal) : 0..1 ; fréquence par minute. */
  breathe: (t, perMin = 14) => 0.5 - 0.5 * Math.cos((TAU * t * perMin) / 60),
  /** Queue de chien qui remue (approché ≈ 2–4 Hz selon l'excitation 0..1). */
  wag: (t, excitement = 0.6) => Math.sin(TAU * (2 + 2 * excitement) * t) * (0.3 + 0.5 * excitement),
  /**
   * Poule, pigeon : tête stabilisée (elle reste fixe pendant que le corps avance) puis projetée en avant — le
   * « hochement » des oiseaux qui marchent. Renvoie le décalage de la tête par rapport au corps (m).
   */
  headBob(t, stepHz = 2.2, reach = 0.04) {
    const p = (t * stepHz) % 1;
    return p < 0.6 ? -reach * (p / 0.6) : -reach + reach * smoothstep(0.6, 0.75, p) * 2 - reach * smoothstep(0.75, 1, p);
  },
  /**
   * Allures des quadrupèdes (Hildebrand) : décalage de phase de chaque patte (fraction du cycle) et facteur de service
   * (part du cycle au sol). pas : séquence latérale à 4 temps ; trot : diagonales ; amble : latérales ; galop : rotatoire.
   */
  gaits: {
    pas: { LH: 0, LF: 0.25, RH: 0.5, RF: 0.75, duty: 0.7 },
    trot: { LH: 0, RF: 0, RH: 0.5, LF: 0.5, duty: 0.5 },
    amble: { LH: 0, LF: 0, RH: 0.5, RF: 0.5, duty: 0.55 },
    galop: { LH: 0, RH: 0.1, LF: 0.5, RF: 0.6, duty: 0.35 },
  },
  /** État d'une patte : au sol ou en l'air, hauteur du pied (0..1), avancée (-1 arrière … 1 avant). */
  leg(gait, legName, phase) {
    const g = motion.gaits[gait] || motion.gaits.pas;
    const p = (((phase + (g[legName] || 0)) % 1) + 1) % 1;
    const stance = p < g.duty;
    const u = stance ? p / g.duty : (p - g.duty) / (1 - g.duty);
    return { stance, lift: stance ? 0 : Math.sin(Math.PI * u), reach: stance ? 1 - 2 * u : -1 + 2 * (u * u * (3 - 2 * u)) };
  },
  /** Saut balistique d'une hauteur h (m) : durée de vol et hauteur à l'instant t (g = 9,80665). */
  hop(t, h = 0.4) { const v = Math.sqrt(2 * 9.80665 * h), T = (2 * v) / 9.80665, u = ((t % T) + T) % T; return { y: v * u - 0.5 * 9.80665 * u * u, flight: T }; },
  /**
   * Lexique des verbes de mouvement (fr / en / es / pt / ar translittéré) → recette de la bibliothèque. Sert à JEV
   * pour lire un prompt (« les oiseaux volent, le drapeau flotte, les gens dansent ») et choisir les fonctions.
   */
  lexicon: [
    { re: /\b(march\w*|promen\w*|walk\w*|camin\w*|anda\w*)\b/i, recipe: 'human.gait', what: 'marche humaine' },
    { re: /\b(cour\w*|run\w*|corr\w*|sprint\w*)\b/i, recipe: 'human.gait(speed≥3)', what: 'course' },
    { re: /\b(vol\w*|fly\w*|flies|vuel\w*|voa\w*|battement)\b/i, recipe: 'motion.flap / motion.glide', what: 'vol battu ou plané' },
    { re: /\b(nag\w*|swim\w*|nad\w*|poisson|fish)\b/i, recipe: 'motion.swim', what: 'nage ondulatoire' },
    { re: /\b(ramp\w*|serpent\w*|slither\w*|crawl\w*)\b/i, recipe: 'motion.slither', what: 'reptation' },
    { re: /\b(flott\w*|float\w*|drapeau|flag|bandera|bannière|banner)\b/i, recipe: 'motion.flag / motion.bob', what: 'tissu au vent ou objet qui flotte' },
    { re: /\b(balanc\w*|sway\w*|vent|wind|viento|herbe|grass|branche)\b/i, recipe: 'motion.sway', what: 'balancement au vent' },
    { re: /\b(flamme|feu|fire|bougie|candle|scintill\w*|flicker\w*)\b/i, recipe: 'motion.flicker', what: 'flamme qui scintille' },
    { re: /\b(respir\w*|breath\w*|souffl\w*)\b/i, recipe: 'motion.breathe', what: 'respiration' },
    { re: /\b(trott\w*|trot)\b/i, recipe: 'motion.leg("trot")', what: 'trot' },
    { re: /\b(galop\w*|gallop\w*)\b/i, recipe: 'motion.leg("galop")', what: 'galop' },
    { re: /\b(chien|dog|perro|cachorro|queue|tail)\b/i, recipe: 'motion.wag + motion.leg("trot")', what: 'chien' },
    { re: /\b(poule|coq|chicken|hen|pigeon|picor\w*|peck\w*)\b/i, recipe: 'motion.headBob + motion.leg', what: 'oiseau qui marche' },
    { re: /\b(saut\w*|bond\w*|jump\w*|hop\w*|salt\w*)\b/i, recipe: 'motion.hop', what: 'saut' },
    { re: /\b(dans\w*|dance\w*|bail\w*|groove|chor[ée]\w*)\b/i, recipe: 'music.dance', what: 'danse sur le tempo' },
    { re: /\b(parl\w*|talk\w*|speak\w*|habl\w*|fal\w*|dialogu\w*|chant\w*|sing\w*)\b/i, recipe: 'speech.plan + character.pose', what: 'parole et synchronisation labiale' },
    { re: /\b(hoch\w*|nod\w*|acquiesc\w*)\b/i, recipe: 'character.pose (nods)', what: 'hochement de tête' },
    { re: /\b(salu\w*|wave\w*|wav\w*)\b/i, recipe: 'character.gesture("salut")', what: 'salut de la main' },
    { re: /\b(ri[rt]\w*|laugh\w*|rire)\b/i, recipe: 'character.gesture("rire")', what: 'rire (épaules, tête en arrière)' },
  ],
  /** Recettes trouvées dans un texte (dédoublonnées). */
  find(text) { const out = []; for (const e of motion.lexicon) if (e.re.test(text) && !out.some((o) => o.recipe === e.recipe)) out.push({ recipe: e.recipe, what: e.what }); return out; },
};

// ═════════════════════════ jev.speech — parole française et synchronisation labiale ═════════════════════════
// Bouches de Rhubarb Lip Sync (MIT) : A fermée (p b m), B légèrement ouverte (la plupart des consonnes, i), C ouverte
// (è é in), D grande ouverte (a an), E arrondie (o on eu), F très arrondie (ou u w ch), G dents sur la lèvre (f v),
// H langue visible (l), X repos.
const VOWELS = /[aeiouyàâäéèêëîïôöùûüœæ]/;
const RULES = [
  [/^(eau|au)/, 'o', 'E'], [/^(ou|où|oû)/, 'u', 'F'], [/^(oi|oî)/, 'wa', 'F'], [/^(on|om)(?![aeiouyn])/, 'ɔ̃', 'E'],
  [/^(an|am|en|em)(?![aeiouyn])/, 'ɑ̃', 'D'], [/^(ain|ein|in|im|un)(?![aeiouyn])/, 'ɛ̃', 'C'], [/^(eu|œu|œ)/, 'ø', 'E'],
  [/^(ai|ei|è|ê|é)/, 'ɛ', 'C'], [/^(a|à|â)/, 'a', 'D'], [/^(i|î|ï|y)/, 'i', 'B'], [/^(o|ô)/, 'o', 'E'], [/^(u|û|ü)/, 'y', 'F'],
  [/^e/, 'ə', 'C'], [/^(ch)/, 'ʃ', 'F'], [/^(ph)/, 'f', 'G'], [/^(gn)/, 'ɲ', 'B'], [/^(qu)/, 'k', 'B'], [/^[pbm]/, 'p', 'A'],
  [/^[fv]/, 'f', 'G'], [/^l/, 'l', 'H'], [/^[jg](?=[eéèêiy])/, 'ʒ', 'F'], [/^w/, 'w', 'F'], [/^h/, '', null], [/^./, 'c', 'B'],
];
export const speech = {
  /**
   * Débit syllabique moyen du français ≈ 7,2 syllabes/s en lecture (Pellegrino, Coupé & Marsico, Language 2011) ;
   * le jeu d'acteur est souvent plus lent (5–6) : réglable.
   */
  rate: 6,
  /** Mot → phonèmes approchés avec leur bouche (règles de lecture simplifiées, consonnes muettes finales). */
  word(w) {
    let s = w.toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüçœæ'-]/g, '');
    // consonnes finales muettes ; e final muet sauf dans les monosyllabes (le, de, je, que…)
    if (s.length > 2) s = s.replace(/(?<=[a-zé])(s|t|d|x|z|p)$/, '');
    if (s.length > 3) s = s.replace(/(?<=[^aeiouyé])e$/, '');
    s = s.replace(/ç/g, 's');
    const out = [];
    while (s.length) {
      let hit = false;
      for (const [re, ph, shape] of RULES) {
        const m = s.match(re);
        if (m) { if (ph) out.push({ ph, shape, v: VOWELS.test(m[0][0]) && !/^(qu|gn|ch|ph)$/.test(m[0]) }); s = s.slice(m[0].length); hit = true; break; }
      }
      if (!hit) s = s.slice(1);
    }
    return out;
  },
  /** Syllabes (une voyelle = un noyau) groupées en groupes rythmiques (ponctuation, ou 7 syllabes au plus). */
  syllables(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const syl = [];
    let group = 0, inGroup = 0;
    for (const raw of words) {
      const phs = speech.word(raw);
      let cur = [];
      for (const p of phs) { cur.push(p); if (p.v) { syl.push({ phs: cur, word: raw, group }); cur = []; inGroup++; } }
      if (cur.length && syl.length) syl[syl.length - 1].phs.push(...cur);
      if (/[,;:.!?…]$/.test(raw) || inGroup >= 7) { group++; inGroup = 0; }
    }
    return syl;
  },
  /**
   * Plan d'une réplique : syllabes datées, visèmes datés, accents (le français accentue la DERNIÈRE syllabe du groupe
   * rythmique : c'est là que tombent gestes de battement et hochements), pauses, clignements.
   */
  plan(text, opts = {}) {
    const rate = opts.rate || speech.rate, t0 = opts.start || 0;
    const syl = speech.syllables(text);
    const visemes = [{ t: t0, shape: 'X' }];
    const accents = [];
    let t = t0;
    syl.forEach((s, i) => {
      const last = !syl[i + 1] || syl[i + 1].group !== s.group;
      const d = (1 / rate) * (last ? 1.35 : 1); // la syllabe accentuée est allongée
      const step = d / Math.max(1, s.phs.length);
      s.phs.forEach((p, k) => { if (p.shape) visemes.push({ t: t + k * step, shape: p.shape, ph: p.ph }); });
      s.t0 = t; s.t1 = t + d; s.accent = last;
      if (last) accents.push(t + d * 0.45);
      t += d;
      if (last && syl[i + 1]) { visemes.push({ t, shape: 'X' }); t += 0.18; } // respiration entre groupes
    });
    visemes.push({ t, shape: 'X' });
    return { syllables: syl, visemes, accents, start: t0, end: t, duration: t - t0 };
  },
  /** Ouverture, étirement et arrondi de chaque bouche (0..1) — pour piloter une mâchoire et des lèvres. */
  shapes: {
    A: { open: 0, wide: 0.2, round: 0.1 }, B: { open: 0.2, wide: 0.45, round: 0 }, C: { open: 0.45, wide: 0.55, round: 0 },
    D: { open: 0.85, wide: 0.5, round: 0 }, E: { open: 0.45, wide: 0.15, round: 0.6 }, F: { open: 0.2, wide: 0, round: 1 },
    G: { open: 0.12, wide: 0.4, round: 0 }, H: { open: 0.35, wide: 0.4, round: 0 }, X: { open: 0.04, wide: 0.3, round: 0.05 },
  },
  /**
   * Bouche à l'instant t avec coarticulation : chaque visème s'étale sur ±60 ms, poids lissés (pas de bouche qui
   * claque), et la bouche ANTICIPE le son de lead secondes (pratique d'animateur : 1–2 images avant le son).
   */
  mouthAt(plan, t, lead = 0.04, spread = 0.06) {
    const tt = t + lead, v = plan.visemes;
    let open = 0, wide = 0, round = 0, wsum = 0, best = 'X', bestW = -1;
    for (let i = 0; i < v.length; i++) {
      const a = v[i].t, b = v[i + 1] ? v[i + 1].t : a + 0.12;
      const d = tt < a ? a - tt : tt > b ? tt - b : 0;
      if (d > spread * 2) continue;
      const w = Math.exp(-(d * d) / (2 * spread * spread * 0.25));
      const sh = speech.shapes[v[i].shape] || speech.shapes.X;
      open += sh.open * w; wide += sh.wide * w; round += sh.round * w; wsum += w;
      if (w > bestW) { bestW = w; best = v[i].shape; }
    }
    if (!wsum) return { open: 0.04, wide: 0.3, round: 0.05, shape: 'X' };
    return { open: open / wsum, wide: wide / wsum, round: round / wsum, shape: best };
  },
  /**
   * Clignements : ≈ 17/min au repos et ≈ 26/min en conversation (Bentivoglio et al., Movement Disorders 1997), plus un
   * clignement aux fins de groupe et aux grands mouvements de tête. Renvoie les instants (s).
   */
  blinks(plan, opts = {}) {
    // le nombre total suit le taux mesuré ; les fins de groupe sont servies d'abord (elles font PARTIE du taux)
    const perMin = opts.speaking === false ? 17 : 26, rnd = makeNoise(opts.seed || 5).random;
    const dur = Math.max(0, plan.end - plan.start), N = Math.max(dur > 1 ? 1 : 0, Math.round((perMin * dur) / 60));
    const out = [], ok = (t) => out.every((b) => Math.abs(b - t) >= 0.8);
    const acc = plan.accents.map((a) => a + 0.12).sort(() => rnd() - 0.5);
    for (const a of acc) if (out.length < N && rnd() < 0.7 && ok(a)) out.push(a);
    for (let k = 0; out.length < N && k < N * 40; k++) { const t = plan.start + rnd() * dur; if (ok(t)) out.push(t); }
    return out.sort((a, b) => a - b);
  },
  /** Fermeture de la paupière (0 ouverte … 1 fermée) : ≈ 150 ms, fermeture plus rapide que l'ouverture. */
  lidAt(blinks, t) {
    for (const b of blinks) { const u = t - b; if (u >= 0 && u < 0.15) return u < 0.05 ? u / 0.05 : 1 - (u - 0.05) / 0.1; }
    return 0;
  },
};

// ═════════════════════════ jev.music — tempo, danse ═════════════════════════
export const music = {
  /** Position musicale : n° de temps, phase dans le temps, mesure, temps fort. */
  beat(t, bpm = 120, perBar = 4, offset = 0) {
    const b = ((t - offset) * bpm) / 60, i = Math.floor(b);
    return { index: i, phase: b - i, bar: Math.floor(i / perBar), inBar: ((i % perBar) + perBar) % perBar, downbeat: ((i % perBar) + perBar) % perBar === 0 };
  },
  /** Enveloppe de pulsation (1 sur le temps, décroît ensuite) ; sharp = vitesse de décroissance. */
  pulse: (t, bpm = 120, sharp = 6, offset = 0) => Math.exp(-sharp * ((((t - offset) * bpm) / 60) % 1)),
  /**
   * Danse calée sur le tempo : rebond vers le bas SUR le temps, balancement sur deux temps, épaules en contretemps.
   * Styles : 'groove' (souple), 'afro' (buste et épaules), 'coupe-decale' (épaules rapides, double tempo).
   */
  dance(t, bpm = 110, style = 'groove', energy = 1) {
    const B = music.beat(t, bpm), ph = B.phase, k = energy;
    const down = -Math.exp(-5 * ph) * 0.06 * k;
    const sway = Math.sin(Math.PI * (B.index % 2 + ph)) * 0.12 * k;
    const sh = style === 'coupe-decale' ? Math.sin(TAU * 2 * (B.index + ph)) * 0.25 * k : Math.sin(TAU * (B.index + ph) + Math.PI) * 0.12 * k;
    const chest = style === 'afro' ? Math.sin(TAU * (B.index + ph)) * 0.08 * k : 0.02 * Math.sin(TAU * (B.index + ph));
    return { hipY: down, sway, shoulders: sh, chest, armL: 0.4 + 0.3 * sh, armR: 0.4 - 0.3 * sh, head: Math.sin(TAU * (B.index + ph) * 0.5) * 0.08 * k };
  },
  /**
   * Tempo d'un signal audio mono (Float32Array) : enveloppe d'énergie, flux positif (attaques), autocorrélation entre
   * 60 et 180 BPM, légère préférence autour de 120 (octave). Renvoie { bpm, confidence }.
   */
  detectBpm(samples, sampleRate, minBpm = 60, maxBpm = 180) {
    const hop = 512, n = Math.floor(samples.length / hop), env = new Float32Array(n);
    for (let i = 0; i < n; i++) { let e = 0; for (let k = 0; k < hop; k++) { const s = samples[i * hop + k]; e += s * s; } env[i] = Math.sqrt(e / hop); }
    const flux = new Float32Array(n);
    for (let i = 1; i < n; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
    const fps = sampleRate / hop;
    let best = 0, bestLag = 0, sum = 0, cnt = 0;
    for (let lag = Math.floor((60 / maxBpm) * fps); lag <= Math.ceil((60 / minBpm) * fps); lag++) {
      let c = 0;
      for (let i = lag; i < n; i++) c += flux[i] * flux[i - lag];
      const bpm = (60 * fps) / lag, w = Math.exp(-Math.pow(Math.log2(bpm / 120), 2) / (2 * 0.9 * 0.9));
      c *= w; sum += c; cnt++;
      if (c > best) { best = c; bestLag = lag; }
    }
    if (!bestLag) return { bpm: 0, confidence: 0 };
    // affinage parabolique autour du pic
    const ac = (lag) => { let c = 0; for (let i = lag; i < n; i++) c += flux[i] * flux[i - lag]; return c; };
    const y0 = ac(bestLag - 1), y1 = ac(bestLag), y2 = ac(bestLag + 1), den = y0 - 2 * y1 + y2;
    const lagF = bestLag + (den ? (0.5 * (y0 - y2)) / den : 0);
    return { bpm: (60 * fps) / lagF, confidence: cnt ? best / (sum / cnt) : 0 };
  },
};

// ═════════════════════════ jev.qa — contrôle qualité du mouvement ═════════════════════════
export const qa = {
  /** À-coups : jerk (dérivée 3e) RMS et nombre d'images où l'accélération saute (> k × médiane). series: nombres ou [x,y,z]. */
  jitter(series, dt, k = 6) {
    const vec = series.map((p) => (Array.isArray(p) ? p : [p]));
    const d = (a, b) => a.map((x, i) => (x - b[i]) / dt);
    const vel = [], acc = [], jerk = [];
    for (let i = 1; i < vec.length; i++) vel.push(d(vec[i], vec[i - 1]));
    for (let i = 1; i < vel.length; i++) acc.push(d(vel[i], vel[i - 1]));
    for (let i = 1; i < acc.length; i++) jerk.push(d(acc[i], acc[i - 1]));
    const mag = (a) => Math.hypot(...a);
    const jr = jerk.length ? Math.sqrt(jerk.reduce((s, j) => s + mag(j) ** 2, 0) / jerk.length) : 0;
    const am = acc.map(mag).sort((a, b) => a - b), med = am.length ? am[Math.floor(am.length / 2)] : 0;
    const spikes = acc.filter((a) => mag(a) > k * Math.max(med, 1e-6)).length;
    return { jerkRms: jr, spikes };
  },
  /** Sauts d'image d'un film rendu : diffs[i] = écart moyen entre l'image i et i+1. Un pic isolé (> k × médiane et
   *  > ratio × ses voisins) près d'une coupe prévue est une coupe ; ailleurs c'est un saut imprévu. Des écarts élevés
   *  soutenus sont un mouvement rapide (panoramique, geste), pas un saut. Une coupe prévue sans pic est signalée.
   *  allowed : discontinuités permises mais non obligatoires (changement de dessin d'un acteur, parfois hors champ). */
  frameJumps(diffs, opts = {}) {
    const fps = opts.fps || 24, k = opts.k || 4, ratio = opts.ratio || 2, cuts = opts.cuts || [], allowed = opts.allowed || [], tol = opts.tol == null ? 1.5 / fps : opts.tol;
    const sorted = diffs.slice().sort((a, b) => a - b), med = Math.max(1e-6, sorted[Math.floor(sorted.length / 2)] || 0);
    const found = [], jumps = [], fast = [], swaps = [];
    let run = null;
    for (let i = 0; i < diffs.length; i++) {
      const v = diffs[i], t = (i + 1) / fps, high = v > k * med;
      const spike = high && v > ratio * Math.max(diffs[i - 1] || 0, diffs[i + 1] || 0);
      if (spike) {
        const near = cuts.find((c) => Math.abs(c - t) <= tol), ok = allowed.find((c) => Math.abs(c - t) <= tol);
        (near != null ? found : ok != null ? swaps : jumps).push({ t, frame: i + 1, ratio: v / med, cut: near ?? ok });
      }
      if (high && !spike) { if (!run) run = { t0: t, t1: t, peak: 0 }; run.t1 = t; run.peak = Math.max(run.peak, v / med); }
      else if (run) { fast.push(run); run = null; }
    }
    if (run) fast.push(run);
    const missing = cuts.filter((c) => !found.some((f) => Math.abs(f.t - c) <= tol));
    return { median: med, cuts: found, swaps, jumps, fast, missing, ok: !jumps.length && !missing.length };
  },
  /** Glissement des pieds : vitesse horizontale moyenne (m/s) d'un pied pendant qu'il touche le sol (y < contact). */
  footSkate(foot, dt, contact = 0.03) {
    let s = 0, n = 0;
    for (let i = 1; i < foot.length; i++) if (foot[i][1] < contact && foot[i - 1][1] < contact) { s += Math.hypot(foot[i][0] - foot[i - 1][0], foot[i][2] - foot[i - 1][2]) / dt; n++; }
    return { speed: n ? s / n : 0, frames: n };
  },
  /** Pénétration du sol : profondeur maximale et part des points sous le sol. */
  penetration(points, groundY = 0, tol = 0.005) {
    let max = 0, under = 0;
    for (const p of points) { const d = groundY - p[1]; if (d > tol) { under++; max = Math.max(max, d); } }
    return { maxDepth: max, ratio: points.length ? under / points.length : 0 };
  },
  /** Temps forts cinématiques : minima locaux de la vitesse (les « arrêts » du mouvement), en secondes. */
  kinematicBeats(speed, dt, minGap = 0.2) {
    const out = [];
    for (let i = 1; i < speed.length - 1; i++) if (speed[i] < speed[i - 1] && speed[i] <= speed[i + 1] && (!out.length || i * dt - out[out.length - 1] > minGap)) out.push(i * dt);
    return out;
  },
  /** Score d'alignement sur le rythme (BAS, Li et al., AIST++ 2021) : moyenne de exp(−d²/2σ²) des temps du mouvement au temps musical le plus proche. */
  beatAlignment(motionBeats, musicBeats, sigma = 0.1) {
    if (!motionBeats.length || !musicBeats.length) return 0;
    let s = 0;
    for (const b of motionBeats) { let d = Infinity; for (const m of musicBeats) d = Math.min(d, Math.abs(b - m)); s += Math.exp(-(d * d) / (2 * sigma * sigma)); }
    return s / motionBeats.length;
  },
  /**
   * Synchronisation labiale : décalage (s) qui maximise la corrélation entre ouverture de bouche et énergie du son
   * (positif = la bouche est EN AVANCE). Jugée avec les seuils de l'UIT-R BT.1359 : détectable au-delà de 45 ms
   * d'avance du son ou 125 ms de retard, inacceptable au-delà de 90 / 185 ms.
   */
  lipSync(mouth, energy, fps, maxLag = 0.25) {
    const n = Math.min(mouth.length, energy.length), L = Math.round(maxLag * fps);
    const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length, mm = mean(mouth.slice(0, n)), me = mean(energy.slice(0, n));
    let best = -2, bestLag = 0, r0 = 0;
    for (let lag = -L; lag <= L; lag++) {
      let c = 0, a = 0, b = 0;
      for (let i = 0; i < n; i++) { const j = i + lag; if (j < 0 || j >= n) continue; const x = mouth[i] - mm, y = energy[j] - me; c += x * y; a += x * x; b += y * y; }
      const r = a && b ? c / Math.sqrt(a * b) : 0;
      if (lag === 0) r0 = r;
      if (r > best) { best = r; bestLag = lag; }
    }
    // pic plat (bouche pilotée par les phonèmes : consonnes sonores bouche fermée, etc.) : un décalage qui ne gagne pas
    // au moins 0,03 de corrélation sur le zéro n'est pas une preuve de décalage — on garde zéro
    if (best - r0 < 0.03) bestLag = 0;
    const offset = bestLag / fps; // > 0 : la bouche précède le son
    const soundLeads = offset < 0 ? -offset : 0, soundLags = offset > 0 ? offset : 0;
    const verdict = best < 0.25 ? 'indéterminé' : soundLeads > 0.09 || soundLags > 0.185 ? 'inacceptable' : soundLeads > 0.045 || soundLags > 0.125 ? 'détectable' : 'imperceptible';
    return { offset, correlation: best, atZero: r0, verdict };
  },
  /** Amplitudes articulaires : angles (degrés) hors des limites normales de jev.human.limits. */
  limits(pose) {
    const L = human.limits, bad = [];
    for (const [j, a] of Object.entries(pose)) { const lim = L[j]; if (!lim) continue; const max = Math.max(...Object.values(lim)); if (Math.abs(a) > max) bad.push({ joint: j, angle: a, max }); }
    return bad;
  },
};

// ═════════════════════════ jev.cine — outils de cinéma ═════════════════════════
const SIZES = {
  // part de la hauteur du sujet visible dans le cadre (personnage debout ≈ 1,75 m), du plus serré au plus large
  TGP: { name: 'très gros plan (yeux)', show: 0.07, aim: 0.94 },
  GP: { name: 'gros plan (visage)', show: 0.15, aim: 0.93 },
  PR: { name: 'plan rapproché poitrine', show: 0.3, aim: 0.88 },
  PA: { name: 'plan américain (mi-cuisse)', show: 0.62, aim: 0.8 },
  PM: { name: 'plan moyen (en pied)', show: 1.12, aim: 0.62 },
  PE: { name: 'plan d’ensemble', show: 3, aim: 0.4 },
  PG: { name: 'plan général', show: 9, aim: 0.3 },
};
const ORDER = ['PG', 'PE', 'PM', 'PA', 'PR', 'GP', 'TGP'];
export const cine = {
  sizes: SIZES,
  order: ORDER,
  /** Objectifs d'une valise de cinéma (mm, plein format 24 mm de haut) → champ vertical en degrés. */
  lenses: [14, 18, 24, 35, 50, 85, 135].map((mm) => ({ mm, fov: proj.fovFromFocal(mm) })),
  /** Formats de projection. */
  aspects: { 'Scope 2,39:1': 2.39, 'Panoramique 1,85:1': 1.85, '16:9': 16 / 9, '9:16 (vertical)': 9 / 16, '4:3': 4 / 3, '1:1': 1 },
  /** Bandes noires (px) pour afficher un format dans une fenêtre. */
  letterbox(w, h, ratio) { const r = w / h; return r > ratio ? { x: Math.round((w - h * ratio) / 2), y: 0 } : { x: 0, y: Math.round((h - w / ratio) / 2) }; },
  /** Distance qui montre la hauteur visible voulue avec ce champ vertical. */
  distanceFor: (visibleH, fovDeg) => visibleH / (2 * Math.tan(rad(fovDeg) / 2)),
  /**
   * Cadrer un sujet {pos:[x,y,z], height, facing:[x,z]} dans une taille de plan, depuis un côté (angle en degrés autour
   * du sujet, 0 = de face), à hauteur d'œil, avec de l'air devant le regard ; renvoie {eye, target, fov}.
   */
  frame(subject, size = 'PM', opts = {}) {
    const S = SIZES[size] || SIZES.PM, fov = opts.fov || proj.fovFromFocal(opts.mm || (size === 'GP' || size === 'TGP' ? 85 : size === 'PR' ? 50 : 35));
    const H = subject.height || 1.75, f = subject.facing || [0, 1];
    const ang = rad(opts.angle || 0), fx = f[0] * Math.cos(ang) - f[1] * Math.sin(ang), fz = f[0] * Math.sin(ang) + f[1] * Math.cos(ang);
    const vis = H * S.show, d = cine.distanceFor(vis, fov);
    const aimY = subject.pos[1] + H * S.aim, eyeY = opts.height != null ? opts.height : Math.min(aimY, subject.pos[1] + 1.6);
    // les yeux du sujet sur la ligne du tiers supérieur : la cible est un peu plus bas que le visage
    const thirdShift = vis / 6;
    const lead = (opts.lead == null ? 0.08 : opts.lead) * vis;
    return {
      eye: [subject.pos[0] + fx * d, eyeY, subject.pos[2] + fz * d],
      target: [subject.pos[0] + f[0] * lead, aimY - thirdShift, subject.pos[2] + f[1] * lead],
      fov,
    };
  },
  /** Plan à deux : A et B sur les deux lignes de tiers, caméra du côté choisi de l'axe (règle des 180°). */
  twoShot(A, B, opts = {}) {
    const fov = opts.fov || proj.fovFromFocal(35), aspect = opts.aspect || 16 / 9, side = opts.side || 1;
    const mx = (A[0] + B[0]) / 2, mz = (A[2] + B[2]) / 2, dx = B[0] - A[0], dz = B[2] - A[2], half = Math.hypot(dx, dz) / 2 || 0.5;
    const hfov = 2 * Math.atan(Math.tan(rad(fov) / 2) * aspect);
    const d = (3 * half) / Math.tan(hfov / 2); // chaque sujet à 1/6 de largeur du centre = sur une ligne de tiers
    const nx = (-dz / (2 * half)) * side, nz = (dx / (2 * half)) * side;
    return { eye: [mx + nx * d, (opts.height || 1.55), mz + nz * d], target: [mx, (A[1] + B[1]) / 2 + 1.45, mz], fov };
  },
  /** Amorce (par-dessus l'épaule) : derrière l'épaule de A, B cadré sur un tiers. */
  overShoulder(A, B, opts = {}) {
    const dx = B[0] - A[0], dz = B[2] - A[2], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, side = opts.side || 1;
    const back = opts.back || 0.9, off = 0.45 * side;
    return { eye: [A[0] - ux * back - uz * off, 1.6, A[2] - uz * back + ux * off], target: [B[0], B[1] + 1.5, B[2]], fov: opts.fov || proj.fovFromFocal(50) };
  },
  /** De quel côté de l'axe A→B est la caméra (+1 / −1) — sert à vérifier la règle des 180°. */
  sideOf(A, B, eye) { const c = (B[0] - A[0]) * (eye[2] - A[2]) - (B[2] - A[2]) * (eye[0] - A[0]); return c >= 0 ? 1 : -1; },
  /**
   * Mouvements de caméra (u ∈ [0,1] sur la durée du plan, adouci) à partir d'un plan {eye, target} :
   * travelling avant/arrière (dolly), latéral (truck), grue (crane), panoramique (pan), bascule (tilt), arc autour du
   * sujet (orbit), montée de drone, et « vertigo » (travelling compensé) qui garde la taille du sujet.
   */
  move(kind, shot, u, amount = 1) {
    const k = ease.inOutSine(clamp(u, 0, 1)), e = shot.eye.slice(), t = shot.target.slice();
    const f = v3.norm(v3.sub(t, e)), r = v3.norm(v3.cross(f, [0, 1, 0]));
    const D = v3.len(v3.sub(t, e));
    switch (kind) {
      case 'dolly-in': return { eye: v3.add(e, v3.scale(f, D * 0.35 * amount * k)), target: t, fov: shot.fov };
      case 'dolly-out': return { eye: v3.sub(e, v3.scale(f, D * 0.35 * amount * k)), target: t, fov: shot.fov };
      case 'truck': return { eye: v3.add(e, v3.scale(r, 2 * amount * k)), target: v3.add(t, v3.scale(r, 2 * amount * k)), fov: shot.fov };
      case 'crane': return { eye: [e[0], e[1] + 4 * amount * k, e[2]], target: t, fov: shot.fov };
      case 'drone': return { eye: v3.add([e[0], e[1] + 25 * amount * k, e[2]], v3.scale(f, -10 * amount * k)), target: t, fov: shot.fov };
      case 'pan': { const a = rad(30 * amount) * (k - 0.5), q = quat.fromAxisAngle([0, 1, 0], a); return { eye: e, target: v3.add(e, quat.rotate(q, v3.sub(t, e))), fov: shot.fov }; }
      case 'tilt': return { eye: e, target: [t[0], t[1] + D * Math.tan(rad(15 * amount)) * (k - 0.5), t[2]], fov: shot.fov };
      case 'orbit': { const q = quat.fromAxisAngle([0, 1, 0], rad(40 * amount) * k); return { eye: v3.add(t, quat.rotate(q, v3.sub(e, t))), target: t, fov: shot.fov }; }
      case 'vertigo': {
        // le sujet garde sa taille : largeur visible W = 2·d·tan(fov/2) constante pendant que la caméra avance
        const W = 2 * D * Math.tan(rad(shot.fov) / 2), d2 = D * (1 - 0.5 * amount * k);
        return { eye: v3.add(e, v3.scale(f, D - d2)), target: t, fov: deg(2 * Math.atan(W / (2 * d2))) };
      }
      default: return { eye: e, target: t, fov: shot.fov };
    }
  },
  /** Caméra portée : petites rotations (rad) en bruit 1/f, ≈ 1–4 Hz ; intensity 0 (pied) … 1 (reportage). */
  shake(t, intensity = 0.3, seed = 9) { const n = makeNoise(seed); return { yaw: intensity * 0.01 * (n.noise2(t * 1.3, 0) + 0.5 * n.noise2(t * 3.7, 1)), pitch: intensity * 0.008 * (n.noise2(t * 1.1, 2) + 0.5 * n.noise2(t * 4.1, 3)), roll: intensity * 0.004 * n.noise2(t * 0.9, 4) }; },
  /**
   * Profondeur de champ PHYSIQUE (mm et m) : hyperfocale H = f²/(N·c) + f ; zone nette [proche, loin]. Avec
   * c = 0,03 mm (plein format). Évite l'effet « maquette » : un plan large réel n'a presque jamais de flou.
   */
  dof(focalMm, fNumber, focusM, coc = 0.03) {
    const f = focalMm, s = focusM * 1000, H = (f * f) / (fNumber * coc) + f;
    const near = (s * (H - f)) / (H + s - 2 * f), far = s < H ? (s * (H - f)) / (H - s) : Infinity;
    return { hyperfocal: H / 1000, near: near / 1000, far: far === Infinity ? Infinity : far / 1000 };
  },
  /** Le flou d'un plan donnerait-il l'impression d'une maquette ? (zone nette trop courte pour un plan large) */
  miniatureRisk(size, dofRange) { const wide = ['PG', 'PE'].includes(size); const depth = dofRange.far - dofRange.near; return wide && depth < 50; },
  /** Réglages de BokehPass (three.js) tirés de l'optique réelle. */
  bokeh(focalMm, fNumber, focusM) { return { focus: focusM, aperture: (focalMm / fNumber) * 0.00001, maxblur: 0.01 }; },
  /**
   * Étalonnages (sans fichier LUT) : saturation, contraste, teinte des hautes lumières et des ombres. « nuit
   * américaine » = la nuit tournée de jour : sous-exposition ≈ 2 diaphs, dominante bleue, désaturation.
   */
  grades: {
    neutre: { sat: 1, contrast: 1, exposure: 1, hi: [0, 0, 0], lo: [0, 0, 0] },
    'heure dorée': { sat: 1.05, contrast: 1.05, exposure: 1.05, hi: [0.05, 0.025, -0.02], lo: [0.0, -0.005, 0.01] },
    'bleu-orange': { sat: 1.1, contrast: 1.12, exposure: 1, hi: [0.04, 0.015, -0.03], lo: [-0.02, 0.0, 0.04] },
    'nuit américaine': { sat: 0.55, contrast: 1.15, exposure: 0.25, hi: [-0.02, 0.0, 0.05], lo: [-0.01, 0.0, 0.03] },
    'noir et blanc': { sat: 0, contrast: 1.2, exposure: 1, hi: [0, 0, 0], lo: [0, 0, 0] },
    pellicule: { sat: 0.86, contrast: 1.04, exposure: 1, hi: [0.025, 0.012, -0.018], lo: [-0.008, 0.0, 0.014] },
  },
  /** Passe d'étalonnage prête pour ShaderPass (three.js) : { uniforms, vertexShader, fragmentShader }. */
  gradeShader(name = 'pellicule', vignette = 0.25) {
    const g = cine.grades[name] || cine.grades.pellicule, v3s = (a) => 'vec3(' + a.map((x) => x.toFixed(4)).join(',') + ')';
    return {
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse; varying vec2 vUv;',
        'void main(){ vec4 c = texture2D(tDiffuse, vUv); c.rgb *= ' + g.exposure.toFixed(3) + ';',
        ' float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); c.rgb = mix(vec3(l), c.rgb, ' + g.sat.toFixed(3) + ');',
        ' c.rgb = (c.rgb - 0.18) * ' + g.contrast.toFixed(3) + ' + 0.18;',
        ' c.rgb += ' + v3s(g.hi) + ' * smoothstep(0.35, 1.2, l) + ' + v3s(g.lo) + ' * (1.0 - smoothstep(0.0, 0.3, l));',
        ' c.rgb *= 1.0 - ' + vignette.toFixed(3) + ' * smoothstep(0.38, 0.9, distance(vUv, vec2(0.5)));',
        ' gl_FragColor = vec4(max(c.rgb, 0.0), c.a); }',
      ].join('\n'),
    };
  },
  /** Distance (fraction de la diagonale) d'un point de l'image au point fort des tiers le plus proche. */
  thirds(x, y, w, h) { let best = Infinity; for (const a of [1 / 3, 2 / 3]) for (const b of [1 / 3, 2 / 3]) best = Math.min(best, Math.hypot(x / w - a, y / h - b)); return best / Math.SQRT2; },
  /**
   * Durées moyennes de plan par genre (secondes, Stephen Follows — échantillon de films, toutes années) : action 4,
   * aventure 5,1, science-fiction 6,2, horreur 15,7. Les autres genres : à mesurer, non inventés.
   */
  asl: { action: 4, aventure: 5.1, 'science-fiction': 6.2, horreur: 15.7 },
  /**
   * Découpage d'une scène dialoguée (idiomes du montage classique, cf. Leake et al., SIGGRAPH 2017) :
   * plan d'ensemble d'ouverture, puis le personnage qui parle à l'image, amorces et plans serrés de plus en plus
   * proches quand l'émotion monte, plan de réaction sur les questions et les chutes, caméra toujours du même côté de
   * l'axe (180°), jamais deux plans trop semblables à la suite (30°, changement de taille), coupe qui suit la voix de
   * jLead secondes (« J-cut » : on entend la réplique suivante avant de voir celui qui la dit).
   * lines: [{ who, text, t0, t1, emotion? 0..1 }] ; renvoie [{ t0, t1, size, subject, kind, side, angle }].
   */
  coverage(lines, opts = {}) {
    const side = opts.side || 1, jLead = opts.jLead == null ? 0.25 : opts.jLead, est = opts.establish == null ? 2.5 : opts.establish;
    const shots = [];
    if (!lines.length) return shots;
    const start = lines[0].t0;
    shots.push({ t0: start, t1: start + est, size: 'PE', subject: 'groupe', kind: 'ensemble', side, angle: 0 });
    // une première réplique courte se dit sur le plan d'ensemble (sinon on couperait au bout d'un instant)
    const firstOnWide = lines[0].t1 - (start + est) < 1.2;
    if (firstOnWide) shots[0].t1 = lines[0].t1;
    // garde de résolution : maxSize = plan le plus serré que l'image source supporte (ex. dessin de 900 px → 'PA')
    const capI = opts.maxSize ? ORDER.indexOf(opts.maxSize) : ORDER.length - 1;
    const cap = (sz) => (ORDER.indexOf(sz) > capI ? ORDER[capI] : sz);
    const tighter = (sz) => ORDER[Math.min(capI, ORDER.indexOf(sz) + 1)];
    lines.forEach((l, i) => {
      if (i === 0 && firstOnWide) return;
      const emo = l.emotion == null ? Math.min(1, i / Math.max(4, lines.length)) : l.emotion;
      let size = cap(emo > 0.75 ? 'GP' : emo > 0.4 ? 'PR' : 'PA');
      const t0 = Math.max(shots[shots.length - 1].t0 + 0.8, i ? l.t0 - jLead : start + est, i === 1 && firstOnWide ? shots[0].t1 - jLead : -Infinity);
      const prev = shots[shots.length - 1];
      const kind = i % 2 ? 'amorce' : 'champ';
      const angle = l.who === lines[0].who ? 30 : -30;
      if (prev.subject === l.who && prev.size === size && (prev.kind === 'réaction' || tighter(size) === size)) {
        // la réaction se prolonge (ou on ne peut plus resserrer) : on reste dans le même plan, pas de faux raccord
        prev.kind = prev.kind === 'réaction' ? kind : prev.kind;
        prev.t1 = l.t1;
      } else {
        if (prev.subject === l.who && prev.size === size) size = tighter(size); // même personnage : on resserre
        shots.push({ t0, t1: l.t1, size, subject: l.who, kind, side, angle });
      }
      // réaction : sur une question ou une chute (« ! », « ? », « … »), plan court sur celui qui écoute
      const listener = lines.find((o) => o.who !== l.who);
      if (/[?!…]\s*$/.test(l.text) && listener && l.t1 - t0 > 1.6) shots.push({ t0: l.t1 - 0.6, t1: l.t1 + 0.4, size: cap(size === 'GP' ? 'GP' : 'PR'), subject: listener.who, kind: 'réaction', side, angle: listener.who === lines[0].who ? 30 : -30 });
    });
    for (let i = 0; i < shots.length - 1; i++) shots[i].t1 = shots[i + 1].t0;
    return shots;
  },
  /** Contrôle des raccords d'un découpage : 180°, saut d'axe (même sujet, même taille), plans trop courts / trop longs. */
  check(shots, opts = {}) {
    const issues = [], min = opts.minLen || 0.8, max = opts.maxLen || 12;
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i], d = s.t1 - s.t0;
      if (d < min - 1e-6) issues.push({ at: s.t0, rule: 'plan trop court', detail: d.toFixed(2) + ' s' });
      if (d > max) issues.push({ at: s.t0, rule: 'plan trop long', detail: d.toFixed(1) + ' s' });
      const p = shots[i - 1];
      if (!p) continue;
      if (p.side !== s.side) issues.push({ at: s.t0, rule: 'règle des 180° (changement de côté de l’axe)', detail: p.side + ' → ' + s.side });
      if (p.subject === s.subject && p.size === s.size && Math.abs((p.angle || 0) - (s.angle || 0)) < 30) issues.push({ at: s.t0, rule: 'faux raccord / saut (même sujet, même taille, < 30°)', detail: s.subject });
    }
    return issues;
  },
};

// ═════════════════════════ jev.character — procédure d'animation de personnage ═════════════════════════
export const character = {
  /** La procédure, étape par étape : ce qu'on fait, la règle mesurable, l'outil jev, le contrôle. */
  procedure: [
    { step: 1, name: 'Intention', rule: 'Ce que veut le personnage, son émotion, le sous-texte de chaque réplique ; la pensée précède l’action.', tool: 'texte du script', check: 'chaque réplique a une intention' },
    { step: 2, name: 'Corps et proportions', rule: 'Proportions réelles (segments), amplitudes articulaires respectées, taille et voix cohérentes.', tool: 'jev.human.segments, jev.human.limits', check: 'jev.qa.limits(pose) vide' },
    { step: 3, name: 'Blocage (poses clés)', rule: 'Poses qui racontent l’histoire, silhouettes lisibles, ligne d’action ; clés en pas à pas.', tool: 'poses clés', check: 'chaque idée lisible en silhouette' },
    { step: 4, name: 'Timing', rule: 'Les temps viennent de la parole (syllabes, accents de fin de groupe) et de la musique (temps forts) ; tenues sur les chutes.', tool: 'jev.speech.plan, jev.music.beat', check: 'accents et temps forts datés' },
    { step: 5, name: 'Intermédiaires', rule: 'Anticipation avant, dépassement après, arcs (pas de lignes droites), ralentis d’entrée et de sortie.', tool: 'jev.ease, jev.catmullRom, jev.bezier', check: 'trajectoires en arcs' },
    { step: 6, name: 'Courbes (spline)', rule: 'Interpolation continue ; pieds à plat quand ils portent (aucun glissement), pas d’interpolation linéaire.', tool: 'jev.smooth.spring, jev.smooth.damp', check: 'jev.qa.footSkate < 0,05 m/s' },
    { step: 7, name: 'Parole', rule: 'Visèmes français, coarticulation, la bouche en avance d’1–2 images sur le son ; mâchoire et lèvres séparées (ouverture, étirement, arrondi).', tool: 'jev.speech.plan, jev.speech.mouthAt', check: 'jev.qa.lipSync « imperceptible »' },
    { step: 8, name: 'Regard', rule: 'Les yeux partent avant la tête (jusqu’à ≈ 100 ms), clignement aux grands changements de regard et aux fins de groupe ; regard vers l’interlocuteur.', tool: 'character.pose (gaze), jev.speech.blinks', check: 'aucun regard figé > 4 s' },
    { step: 9, name: 'Gestes', rule: 'Le geste de battement atteint son sommet un peu AVANT ou SUR la syllabe accentuée (fin de groupe en français) ; gestes déictiques vers ce dont on parle.', tool: 'jev.speech.plan (accents)', check: 'sommets à ≤ 100 ms des accents' },
    { step: 10, name: 'Mouvement secondaire', rule: 'Respiration, poids qui se déplace, vêtements et cheveux qui suivent (ressorts), maintien vivant : jamais une pose figée.', tool: 'jev.motion.breathe, jev.smooth.spring', check: 'aucune immobilité totale > 2 s' },
    { step: 11, name: 'Écoute', rule: 'Celui qui écoute réagit : hochements aux pauses, sourcils, regard, petites réactions sur les chutes.', tool: 'character.plan (nods)', check: 'au moins une réaction par réplique longue' },
    { step: 12, name: 'Polissage', rule: 'Transitions entre clips sans saut (dead blending, inertialisation) ; bruit de capture filtré (One Euro).', tool: 'jev.smooth.deadBlend, jev.smooth.inertialize, jev.smooth.oneEuro', check: 'jev.qa.jitter : 0 pic' },
    { step: 13, name: 'Caméra et montage', rule: 'Découpage du dialogue (ensemble, champ-contrechamp, réactions), 180°, 30°, coupe qui suit la voix.', tool: 'jev.cine.coverage, jev.cine.frame, jev.cine.twoShot', check: 'jev.cine.check vide' },
    { step: 14, name: 'Contrôle final', rule: 'Mesurer, corriger, refaire : pieds, sol, à-coups, synchro labiale, rythme, amplitudes.', tool: 'jev.qa.*', check: 'tous les contrôles au vert' },
  ],
  /**
   * Plan exécutable d'une scène dialoguée. lines: [{ who, text, emotion? }] ; cast: { nom: { pos:[x,y,z] } }.
   * Renvoie la chronologie (répliques datées, visèmes, accents → gestes et hochements, clignements, regards), le
   * découpage caméra, et le rapport de contrôle.
   */
  plan(lines, cast = {}, opts = {}) {
    const gap = opts.gap == null ? 0.35 : opts.gap;
    let t = opts.start || 0;
    const timed = [], tracks = {};
    const who = [...new Set(lines.map((l) => l.who))];
    for (const w of who) tracks[w] = { speech: [], gestures: [], nods: [], blinks: [], gaze: [] };
    for (const l of lines) {
      const p = speech.plan(l.text, { start: t, rate: opts.rate });
      timed.push({ ...l, t0: p.start, t1: p.end, plan: p });
      const tr = tracks[l.who];
      tr.speech.push(p);
      // gestes de battement : sommet 60 ms avant l'accent (début du geste 350 ms avant), un accent sur deux
      p.accents.forEach((a, i) => { if (i % 2 === 0 || l.emotion > 0.6) tr.gestures.push({ start: a - 0.41, apex: a - 0.06, end: a + 0.3, amp: 0.5 + 0.5 * (l.emotion || 0.4) }); });
      tr.blinks.push(...speech.blinks(p, { seed: timed.length * 7 }));
      // ceux qui écoutent : hochement aux fins de groupe, regard sur celui qui parle (les yeux 80 ms avant la tête)
      for (const o of who) {
        if (o === l.who) continue;
        p.accents.forEach((a, i) => { if (i % 2 === 1) tracks[o].nods.push(a + 0.15); });
        tracks[o].gaze.push({ t: p.start, at: l.who, eyes: p.start, head: p.start + 0.08 });
        tracks[o].blinks.push(...speech.blinks(p, { speaking: false, seed: timed.length * 11 }));
      }
      // celui qui parle : regard vers l'interlocuteur, détour du regard au milieu des longues répliques (on réfléchit)
      const other = who.find((o) => o !== l.who);
      if (other) tracks[l.who].gaze.push({ t: p.start, at: other, eyes: p.start, head: p.start + 0.08 });
      if (p.duration > 3) tracks[l.who].gaze.push({ t: p.start + p.duration * 0.4, at: 'ailleurs', eyes: p.start + p.duration * 0.4, head: p.start + p.duration * 0.4 + 0.1 }, { t: p.start + p.duration * 0.6, at: other || 'face', eyes: p.start + p.duration * 0.6, head: p.start + p.duration * 0.6 + 0.08 });
      t = p.end + gap;
    }
    for (const w of who) tracks[w].blinks.sort((a, b) => a - b);
    const shots = cine.coverage(timed.map((l) => ({ who: l.who, text: l.text, t0: l.t0, t1: l.t1, emotion: l.emotion })), opts);
    const issues = cine.check(shots);
    void cast;
    return { lines: timed, tracks, shots, issues, duration: t - gap - (opts.start || 0), procedure: character.procedure.map((s) => s.name) };
  },
  /**
   * Pose du personnage « who » à l'instant t : bouche (ouverture, étirement, arrondi, visème), paupières, regard (cible,
   * avec la tête qui suit les yeux), hochement, geste (0..1), souffle. À appliquer à n'importe quel rig.
   */
  pose(plan, who, t) {
    const tr = plan.tracks[who];
    if (!tr) return null;
    const sp = tr.speech.find((p) => t >= p.start - 0.1 && t <= p.end + 0.1);
    const mouth = sp ? speech.mouthAt(sp, t) : { open: 0.04, wide: 0.3, round: 0.05, shape: 'X' };
    let gaze = null, headGaze = null;
    for (const g of tr.gaze) { if (g.eyes <= t) gaze = g.at; if (g.head <= t) headGaze = g.at; }
    let nod = 0;
    for (const n of tr.nods) { const u = t - n; if (u >= 0 && u < 0.5) nod = Math.max(nod, Math.sin(Math.PI * (u / 0.5)) * 0.12); }
    let gesture = 0;
    for (const g of tr.gestures) if (t >= g.start && t <= g.end) gesture = Math.max(gesture, (t <= g.apex ? ease.inOutCubic((t - g.start) / (g.apex - g.start)) : 1 - ease.inOutCubic((t - g.apex) / (g.end - g.apex))) * g.amp);
    return { mouth, lid: speech.lidAt(tr.blinks, t), gaze, headGaze, nod, gesture, breath: motion.breathe(t, sp ? 18 : 14), speaking: Boolean(sp && t >= sp.start && t <= sp.end) };
  },
};
`;
