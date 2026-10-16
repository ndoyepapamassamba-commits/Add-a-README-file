// jev 1.1 — outils d'animation, de cinéma et procédure d'animation de personnage : la bibliothèque EXACTEMENT telle
// qu'elle est servie aux pages (module chargé depuis sa source), vérifiée par le calcul. Plus la passe photo réaliste
// (requêtes construites, sans réseau réel).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { JEVLIB_API, JEVLIB_SOURCE, JEVLIB_VERSION } from '../../server/jev/sandbox/jevlib';
import { sandboxBlock, sandboxCards } from '../../server/jev/sandbox/knowledge';
import { parseSceneLocal } from '../../server/jev/realize/sceneKit';
import { photoMotionPrompt, photoPass, photorealPrompt, PHOTO_MODELS } from '../../direct/lib/studio/photoPass';
import { useStore } from '../../direct/lib/store';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let jev: any;
beforeAll(async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jevlib11-')), 'jev.mjs');
  fs.writeFileSync(f, JEVLIB_SOURCE);
  jev = await import(/* @vite-ignore */ pathToFileURL(f).href);
});

const GPS = [
  { who: 'Mamadou', text: 'Bonjour, tu as réglé le GPS ?' },
  { who: 'Baye', text: 'Oui, il dit de tourner à gauche… dans le champ de tournesols !', emotion: 0.8 },
  { who: 'Mamadou', text: 'Mais il n’y a pas de route ici !' },
  { who: 'Baye', text: 'Le GPS a toujours raison, mon frère.' },
];

describe('jev 1.1 — lissage et transitions', () => {
  it('amortisseur indépendant de la cadence : la moitié du chemin en une demi-vie, quel que soit le pas', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = jev.smooth.damp(a, 1, 0.5, 0.5 / 60);
    let b = 0;
    for (let i = 0; i < 5; i++) b = jev.smooth.damp(b, 1, 0.5, 0.1);
    expect(a).toBeCloseTo(0.5, 6);
    expect(b).toBeCloseTo(0.5, 6);
  });
  it('ressort critique : rejoint la cible sans la dépasser', () => {
    let x = 0, v = 0, max = 0;
    for (let i = 0; i < 600; i++) {
      [x, v] = jev.smooth.spring(x, v, 1, 0.2, 1 / 120);
      max = Math.max(max, x);
    }
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
    expect(x).toBeCloseTo(1, 4);
  });
  it('inertialisation : part du décalage, arrive à 0 sans vitesse résiduelle', () => {
    const f = (t: number) => jev.smooth.inertialize(0.8, 0, 0.3, t);
    expect(f(0)).toBeCloseTo(0.8, 9);
    expect(f(0.3)).toBeCloseTo(0, 9);
    expect(Math.abs(f(0.3) - f(0.2999)) / 1e-4).toBeLessThan(1e-2);
    // monotone (pas de rebond)
    for (let t = 0; t < 0.3; t += 0.01) expect(f(t + 0.01)).toBeLessThanOrEqual(f(t) + 1e-9);
  });
  it('dead blending : part de la pose source, finit exactement sur la cible', () => {
    expect(jev.smooth.deadBlend(0, 2, 1, 0)).toBeCloseTo(0, 9);
    expect(jev.smooth.deadBlend(0, 2, 1, 0.3, 0.3)).toBeCloseTo(1, 9);
  });
  it('filtre One Euro : écrase le bruit au repos et suit une rampe rapide', () => {
    const f = jev.smooth.oneEuro(1, 0.05);
    const rnd = jev.makeNoise(3).random;
    let raw = 0, filt = 0;
    for (let i = 0; i < 300; i++) {
      const t = i / 60, x = 0.5 + (rnd() - 0.5) * 0.02, y = f(x, t);
      if (i > 30) { raw += Math.abs(x - 0.5); filt += Math.abs(y - 0.5); }
    }
    expect(filt).toBeLessThan(raw * 0.6);
    // sur une rampe rapide (3 unités/s), le retard fond quand beta monte : c'est l'adaptation à la vitesse
    const lag = (beta: number) => {
      const g = jev.smooth.oneEuro(1, beta);
      let y = 0;
      for (let i = 0; i < 120; i++) y = g(i * 0.05, i / 60);
      return Math.abs(119 * 0.05 - y);
    };
    expect(lag(1)).toBeLessThan(lag(0) * 0.4);
  });
});

describe('jev 1.1 — dictionnaire des mouvements', () => {
  it('nage : fréquence de battement tirée du nombre de Strouhal (f = St·U/A)', () => {
    const s = jev.motion.swim(1, 0, 1, 1, 0.3);
    expect(s.hz).toBeCloseTo(1.5, 9); // A = 0,2 L ⇒ f = 0,3 × 1 / 0,2
  });
  it('allures : au trot les diagonales sont en phase, appui ≈ 50 % du cycle ; au pas 4 temps décalés', () => {
    let st = 0;
    for (let i = 0; i < 1000; i++) {
      const p = i / 1000;
      expect(jev.motion.leg('trot', 'LH', p).stance).toBe(jev.motion.leg('trot', 'RF', p).stance);
      if (jev.motion.leg('trot', 'LH', p).stance) st++;
    }
    expect(st / 1000).toBeCloseTo(0.5, 2);
    const pas = jev.motion.gaits.pas;
    expect([pas.LH, pas.LF, pas.RH, pas.RF]).toEqual([0, 0.25, 0.5, 0.75]);
  });
  it('lexique des verbes : un prompt → les bonnes recettes', () => {
    const r = jev.motion.find('Les oiseaux volent, le drapeau flotte, le chien trotte et les gens dansent').map((x: { recipe: string }) => x.recipe);
    expect(r).toEqual(expect.arrayContaining(['motion.flap / motion.glide', 'motion.flag / motion.bob', 'motion.leg("trot")', 'music.dance']));
  });
  it('saut balistique : durée de vol 2·√(2h/g)', () => {
    expect(jev.motion.hop(0, 0.5).flight).toBeCloseTo(2 * Math.sqrt((2 * 0.5) / 9.80665), 9);
  });
});

describe('jev 1.1 — parole française', () => {
  it('visèmes : p b m ferment la bouche (A), « ou » l’arrondit (F), « a » l’ouvre (D)', () => {
    const shapes = (w: string) => jev.speech.word(w).map((p: { shape: string }) => p.shape).join('');
    expect(shapes('papa')).toBe('ADAD');
    expect(shapes('bonjour')).toMatch(/^AE.F/);
    expect(shapes('fou')).toBe('GF');
  });
  it('accents de fin de groupe (le français accentue la dernière syllabe) et débit réglable', () => {
    const p = jev.speech.plan('Bonjour Mamadou, tu vas bien ?', { rate: 6 });
    expect(p.accents.length).toBe(2); // « …Mamadou, » et « …bien ? »
    const last = p.syllables.filter((s: { accent: boolean }) => s.accent);
    expect(last.map((s: { word: string }) => s.word)).toEqual(['Mamadou,', 'bien']);
    expect(p.duration).toBeGreaterThan(p.syllables.length / 6);
    // la bouche est fermée sur le « m » de Mamadou
    const m = p.visemes.find((v: { ph?: string; shape: string; t: number }) => v.ph === 'p' && v.t > 0.2);
    expect(jev.speech.mouthAt(p, m.t + 0.005, 0).open).toBeLessThan(0.25);
  });
  it('clignements ≈ 26 / min en parlant', () => {
    const long = Array.from({ length: 40 }, () => 'Le GPS a toujours raison, mon frère,').join(' ');
    const p = jev.speech.plan(long, { rate: 6 });
    const perMin = (jev.speech.blinks(p, { seed: 3 }).length / p.duration) * 60;
    expect(perMin).toBeGreaterThan(22);
    expect(perMin).toBeLessThan(30);
  });
});

describe('jev 1.1 — musique', () => {
  const clicks = (bpm: number, seconds = 12, sr = 22050) => {
    const s = new Float32Array(seconds * sr);
    for (let t = 0; t < seconds; t += 60 / bpm) for (let k = 0; k < 400; k++) s[Math.floor(t * sr) + k] = Math.sin(k * 0.6) * Math.exp(-k / 80);
    return s;
  };
  it('détecte le tempo d’une piste de clics (100 et 128 BPM, ± 2)', () => {
    expect(Math.abs(jev.music.detectBpm(clicks(100), 22050).bpm - 100)).toBeLessThan(2);
    expect(Math.abs(jev.music.detectBpm(clicks(128), 22050).bpm - 128)).toBeLessThan(2);
  });
  it('temps et temps forts', () => {
    expect(jev.music.beat(2, 120).index).toBe(4);
    expect(jev.music.beat(2, 120).downbeat).toBe(true);
    expect(jev.music.beat(2.5, 120).downbeat).toBe(false);
  });
});

describe('jev 1.1 — contrôle qualité du mouvement', () => {
  it('pieds : 0 glissement quand le pied reste planté, glissement mesuré sinon ; pénétration du sol', () => {
    const planted = Array.from({ length: 30 }, () => [1, 0, 2]);
    expect(jev.qa.footSkate(planted, 1 / 30).speed).toBe(0);
    const sliding = Array.from({ length: 30 }, (_, i) => [i * 0.01, 0, 0]);
    expect(jev.qa.footSkate(sliding, 1 / 30).speed).toBeCloseTo(0.3, 6);
    expect(jev.qa.penetration([[0, -0.05, 0], [0, 0.1, 0]]).maxDepth).toBeCloseTo(0.05, 9);
  });
  it('à-coups : un saut isolé est repéré', () => {
    const s = Array.from({ length: 60 }, (_, i) => Math.sin(i / 10));
    expect(jev.qa.jitter(s, 1 / 30).spikes).toBe(0);
    s[30]! += 0.5;
    expect(jev.qa.jitter(s, 1 / 30).spikes).toBeGreaterThan(0);
  });
  it('rythme : score BAS = 1 quand chaque arrêt tombe sur un temps', () => {
    expect(jev.qa.beatAlignment([0.5, 1, 1.5], [0, 0.5, 1, 1.5, 2])).toBeCloseTo(1, 9);
    expect(jev.qa.beatAlignment([0.25, 0.75], [0, 0.5, 1])).toBeLessThan(0.1);
  });
  it('synchro labiale : retrouve une bouche en avance de 2 images et la juge imperceptible', () => {
    const fps = 30, n = 120;
    const energy = Array.from({ length: n }, (_, i) => Math.max(0, Math.sin(i / 3)));
    const mouth = Array.from({ length: n }, (_, i) => Math.max(0, Math.sin((i + 2) / 3)));
    const r = jev.qa.lipSync(mouth, energy, fps);
    expect(r.offset).toBeCloseTo(2 / 30, 6);
    expect(r.verdict).toBe('imperceptible');
    const late = Array.from({ length: n }, (_, i) => Math.max(0, Math.sin((i - 6) / 3)));
    expect(jev.qa.lipSync(late, energy, fps).verdict).not.toBe('imperceptible');
  });
});

describe('jev 1.1 — cinéma', () => {
  it('profondeur de champ physique : 50 mm, f/2,8, mise au point 3 m', () => {
    const d = jev.cine.dof(50, 2.8, 3);
    expect(d.hyperfocal).toBeCloseTo(29.81, 2);
    expect(d.near).toBeCloseTo(2.729, 2);
    expect(d.far).toBeCloseTo(3.33, 2);
    expect(jev.cine.dof(35, 8, 10).far).toBe(Infinity); // au-delà de l'hyperfocale : net jusqu'à l'infini
    expect(jev.cine.miniatureRisk('PG', { near: 2.7, far: 3.3 })).toBe(true);
  });
  it('cadrage par taille de plan : la distance montre exactement la hauteur voulue', () => {
    const subj = { pos: [0, 0, 0], height: 1.75, facing: [0, 1] };
    const s = jev.cine.frame(subj, 'PM', { mm: 35 });
    const d = Math.hypot(s.eye[0], s.eye[2]);
    expect(2 * d * Math.tan((s.fov * Math.PI) / 360)).toBeCloseTo(1.75 * jev.cine.sizes.PM.show, 6);
  });
  it('plan à deux : chaque personnage sur une ligne de tiers', () => {
    const A = [-1, 0, 0], B = [1, 0, 0];
    const s = jev.cine.twoShot(A, B, { aspect: 16 / 9 });
    const cam = { eye: s.eye, target: [0, s.eye[1], 0], up: [0, 1, 0], fov: s.fov, near: 0.1, far: 100, width: 1600, height: 900 };
    const xa = jev.proj.project([A[0], s.eye[1], A[2]], cam).x / 1600, xb = jev.proj.project([B[0], s.eye[1], B[2]], cam).x / 1600;
    expect([xa, xb].sort()).toEqual([expect.closeTo(1 / 3, 3), expect.closeTo(2 / 3, 3)]);
  });
  it('« vertigo » : le sujet garde sa taille pendant que la caméra avance', () => {
    const shot = { eye: [0, 1.6, 10], target: [0, 1.6, 0], fov: 30 };
    const w = (u: number) => {
      const m = jev.cine.move('vertigo', shot, u);
      return 2 * Math.hypot(m.eye[0], m.eye[2]) * Math.tan((m.fov * Math.PI) / 360);
    };
    expect(w(0.5)).toBeCloseTo(w(0), 6);
    expect(w(1)).toBeCloseTo(w(0), 6);
  });
  it('étalonnage prêt pour ShaderPass, bandes noires du scope', () => {
    const g = jev.cine.gradeShader('nuit américaine');
    expect(g.fragmentShader).toContain('gl_FragColor');
    expect(g.fragmentShader).toContain('0.250');
    expect(jev.cine.letterbox(1920, 1080, 2.39).y).toBe(Math.round((1080 - 1920 / 2.39) / 2));
  });
  it('découpage du dialogue « Le GPS rebelle » : ensemble, champs, réactions — sans faux raccord', () => {
    const plan = jev.character.plan(GPS);
    expect(plan.shots[0].size).toBe('PE');
    expect(plan.shots.some((s: { kind: string }) => s.kind === 'réaction')).toBe(true);
    expect(new Set(plan.shots.map((s: { side: number }) => s.side)).size).toBe(1); // 180° respectée
    expect(plan.issues).toEqual([]);
    // le contrôle repère bien un saut d'axe et un faux raccord quand on les provoque
    const bad = [
      { t0: 0, t1: 2, size: 'PR', subject: 'A', side: 1, angle: 0 },
      { t0: 2, t1: 4, size: 'PR', subject: 'A', side: -1, angle: 10 },
    ];
    expect(jev.cine.check(bad).map((i: { rule: string }) => i.rule).join(' ')).toMatch(/180°.*faux raccord/);
  });
  it('garde de résolution (maxSize) : jamais plus serré que permis, et pas de faux raccord créé par le plafond', () => {
    // dialogue de la troupe : question → réaction sur Modou (PR) puis Modou répond très ému (GP) — plafonnés à PA
    const lines = [
      { who: 'MN', text: 'Modou ! Tu étais où depuis ce matin ?', t0: 1, t1: 3.3, emotion: 0.5 },
      { who: 'Modou', text: 'Maman, je cherchais du travail en ville.', t0: 3.57, t1: 6.3, emotion: 0.3 },
      { who: 'MN', text: 'Et alors ? Tu as trouvé ?', t0: 6.82, t1: 8.6, emotion: 0.6 },
      { who: 'Modou', text: 'Oui ! Le travail m’a vu… et il s’est sauvé !', t0: 8.81, t1: 12.2, emotion: 0.85 },
      { who: 'MN', text: 'Ah, Modou ! Toi, tu es un vrai comédien !', t0: 12.51, t1: 16.5, emotion: 0.9 },
    ];
    const shots = jev.cine.coverage(lines, { establish: 1.4, maxSize: 'PA' });
    const order = jev.cine.order as string[];
    for (const s of shots) expect(order.indexOf(s.size)).toBeLessThanOrEqual(order.indexOf('PA'));
    expect(jev.cine.check(shots)).toEqual([]);
    // sans plafond, le découpage resserre bien sur l'émotion
    expect(jev.cine.coverage(lines, { establish: 1.4 }).some((s: { size: string }) => s.size === 'GP')).toBe(true);
  });
});

describe('jev 1.1 — contrôle des sauts d’image d’un film', () => {
  it('sépare coupes prévues, saut imprévu, mouvement rapide et coupe manquante', () => {
    const d = Array.from({ length: 96 }, () => 2);
    d[23] = 70; // coupe à 1,0 s (image 24)
    d[59] = 40; // saut isolé à 2,5 s, non prévu
    for (let i = 70; i < 80; i++) d[i] = 20; // panoramique de 0,4 s
    const r = jev.qa.frameJumps(d, { fps: 24, cuts: [1.0, 3.5] });
    expect(r.cuts.map((c: { t: number }) => c.t)).toEqual([1]);
    expect(r.jumps).toHaveLength(1);
    expect(r.jumps[0].t).toBeCloseTo(2.5, 6);
    expect(r.fast).toHaveLength(1);
    expect(r.fast[0].peak).toBeCloseTo(10, 6);
    expect(r.missing).toEqual([3.5]);
    expect(r.ok).toBe(false);
    // un changement de dessin déclaré n'est ni un saut, ni une coupe manquante quand il se passe hors champ
    const r2 = jev.qa.frameJumps(d, { fps: 24, cuts: [1.0], allowed: [2.5, 3.9] });
    expect(r2.swaps.map((x: { t: number }) => x.t)).toEqual([2.5]);
    expect(r2.jumps).toEqual([]);
    expect(r2.ok).toBe(true);
  });
});

describe('jev 1.1 — procédure d’animation de personnage', () => {
  it('14 étapes, chacune avec son outil et son contrôle', () => {
    expect(jev.character.procedure).toHaveLength(14);
    for (const s of jev.character.procedure) expect(s.tool && s.check && s.rule).toBeTruthy();
  });
  it('plan exécutable : qui parle quand, celui qui écoute acquiesce, les yeux partent avant la tête', () => {
    const plan = jev.character.plan(GPS);
    const l1 = plan.lines[1];
    const mid = (l1.t0 + l1.t1) / 2;
    expect(jev.character.pose(plan, 'Baye', mid).speaking).toBe(true);
    expect(jev.character.pose(plan, 'Mamadou', mid).speaking).toBe(false);
    expect(plan.tracks.Mamadou.nods.length).toBeGreaterThan(0);
    for (const g of plan.tracks.Baye.gaze) expect(g.head - g.eyes).toBeGreaterThan(0);
    // gestes : sommet AVANT l'accent de fin de groupe
    const acc = l1.plan.accents[0];
    const g0 = plan.tracks.Baye.gestures[0];
    expect(g0.apex).toBeLessThan(acc);
    expect(acc - g0.apex).toBeLessThanOrEqual(0.1);
  });
});

describe('jev 1.1 — servie aux pages et aux savoirs', () => {
  it('version, API et fiches choisies selon la demande', () => {
    expect(JEVLIB_VERSION).toBe('1.1.0');
    expect(JEVLIB_API).toMatch(/jev\.cine.*jev\.character/s);
    const c = sandboxCards('Sketch : Mamadou et Baye discutent dans la voiture, dialogue drôle', 'video').map((x) => x.id);
    expect(c).toEqual(expect.arrayContaining(['mvt-personnage', 'cine-montage', 'cine-plans']));
    const r = sandboxCards('rue africaine trop lego, voitures irréelles, plus de réalisme', '3d').map((x) => x.id);
    expect(r).toContain('realisme');
    expect(sandboxBlock(sandboxCards('les oiseaux volent au-dessus de la forêt', '3d'))).toMatch(/jev\.motion/);
  });
});

describe('passe photo réaliste (sans réseau réel)', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('le prompt garde la composition, décrit la scène, interdit le rendu « jouet » et les marques', () => {
    const spec = parseSceneLocal(fs.readFileSync(path.join(__dirname, '../fixtures/scenes/street.txt'), 'utf8'));
    const p = photorealPrompt(spec, 'Rue africaine à Abidjan au coucher du soleil');
    expect(p).toMatch(/same composition/);
    expect(p).toMatch(/West African city/);
    expect(p).toMatch(/no toy or miniature look/);
    expect(p).toMatch(/no real brand logos/);
    expect(photoMotionPrompt(spec)).toMatch(/no morphing/);
  });
  it('sans clé : erreur claire ; avec clé : envoi de l’image puis édition par le modèle choisi', async () => {
    useStore.setState((s) => ({ settings: { ...s.settings, pollinationsKey: '' } }));
    await expect(photoPass(new Blob(['x']), 'p')).rejects.toThrow(/Clé Pollinations absente/);
    useStore.setState((s) => ({ settings: { ...s.settings, pollinationsKey: 'cle-de-test' } }));
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get('Authorization') });
      if (url.includes('/upload')) return new Response(JSON.stringify({ url: 'https://media.pollinations.ai/abc' }), { status: 200 });
      return new Response(new Blob([new Uint8Array(20_000)], { type: 'image/jpeg' }), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    });
    const r = await photoPass(new Blob(['frame'], { type: 'image/jpeg' }), 'Turn this 3D render into a REAL PHOTOGRAPH.', { model: PHOTO_MODELS[1]!.id, width: 1280, height: 720 });
    expect(calls[0]!.url).toBe('https://media.pollinations.ai/upload');
    expect(calls[1]!.url).toContain('gen.pollinations.ai/image/');
    expect(calls[1]!.url).toContain(`model=${encodeURIComponent(PHOTO_MODELS[1]!.id)}`);
    expect(calls[1]!.url).toContain('image=https%3A%2F%2Fmedia.pollinations.ai%2Fabc');
    expect(calls.every((c) => c.auth === 'Bearer cle-de-test')).toBe(true);
    expect(r.usd).toBe(PHOTO_MODELS[1]!.pollen);
    useStore.setState((s) => ({ settings: { ...s.settings, pollinationsKey: '' } }));
  });
});
