import { describe, expect, it } from 'vitest';
import { RULES, checkPlan, rulesReport, type Plan, type PlanBody } from '../../coeur/studio/actor/directorRules';

// A good plan: two actors face to face in a two-shot, a villager behind on the right, a punchline with a measured beat,
// a laugh in reaction seen in the two-shot, a close-up on the liar, cuts hidden on drawing changes.
const actor = (id: string, x0: number, facing: 1 | -1): PlanBody => ({
  id, role: 'acteur', box: [x0, 320, x0 + 140, 800], head: [x0 + 30, 320, x0 + 110, 420], depth: 9.5, heightM: 1.7, onGround: true, facing,
  shadow: { dir: [-0.85, -0.53], widthRatio: 0.3 },
});
const villager: PlanBody = { id: 'villageoise', role: 'figurant', box: [490, 400, 540, 560], depth: 30, heightM: 1.6, onGround: true, shadow: { dir: [-0.85, -0.53], widthRatio: 0.28 } };
const good = (): Plan => ({
  frame: { w: 576, h: 1024 },
  total: 17.2,
  fixedCamera: true,
  shots: [
    { t0: 0, t1: 8.6, size: 'PE', subject: 'groupe' },
    { t0: 8.6, t1: 12.17, size: 'PA', subject: 'Modou' },
    { t0: 12.17, t1: 17.2, size: 'PE', subject: 'groupe' },
  ],
  frames: [0.5, 5, 13, 16].map((t) => ({ t, shot: t < 8.6 ? 0 : t < 12.17 ? 1 : 2, bodies: [actor('Modou', 110, 1), actor('Maman', 320, -1), villager] })),
  lines: [
    { who: 'Maman', t0: 1.0, t1: 3.35, text: 'Modou ! Tu étais où depuis ce matin ?', emotion: 0.5, state: 'accuse' },
    { who: 'Modou', t0: 3.6, t1: 6.4, text: 'Maman, je cherchais du travail en ville.', emotion: 0.3, state: 'neutre' },
    { who: 'Maman', t0: 6.66, t1: 8.4, text: 'Et alors ? Tu as trouvé ?', emotion: 0.6, state: 'haussement' },
    { who: 'Modou', t0: 8.66, t1: 11.9, text: 'Oui ! Le travail m’a vu… et il s’est sauvé !', emotion: 0.85, state: 'haussement', punch: { phrase: 'et il s’est sauvé !', at: 10.9, pauseBefore: 0.34 } },
    { who: 'Maman', t0: 12.17, t1: 15.5, text: 'Ah, Modou ! Toi, tu es un vrai comédien !', emotion: 0.85, state: 'rire' },
  ],
  beats: [{ t: 1.2, move: 'tournerTete' }, { t: 11.6, move: 'rire' }],
  swaps: [{ who: 'Modou', t: 8.6 }, { who: 'Maman', t: 12.17 }],
  liar: 'Modou',
});

describe('livre de règles du réalisateur (anticipées, vérifiées avant le rendu)', () => {
  it('every rule is written down with its family and severity, before anything is rendered', () => {
    expect(RULES.length).toBeGreaterThanOrEqual(25);
    for (const fam of ['cadre', 'regards', 'échelle', 'sol', 'ombres', 'montage', 'rythme', 'comique', 'fluidité', 'figuration', 'image']) expect(RULES.some((r) => r.family === fam), fam).toBe(true);
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });
  it('a well-directed plan passes the whole book', () => {
    const v = checkPlan(good());
    expect(v, JSON.stringify(v, null, 1)).toEqual([]);
    const r = rulesReport(good());
    expect(r.ok).toBe(true);
    expect(r.lines.every((l) => l.startsWith('✓'))).toBe(true);
  });
  const broken = (f: (p: Plan) => void) => { const p = good(); f(p); return checkPlan(p).map((x) => x.rule); };
  it('framing: a villager on a face, in the gaze corridor, in front of an actor, or cut by the edge is caught', () => {
    expect(broken((p) => { p.frames[0]!.bodies[2] = { ...villager, box: [150, 330, 200, 450] }; })).toContain('cadre.tangente-tete');
    expect(broken((p) => { p.frames[0]!.bodies[2] = { ...villager, box: [270, 340, 300, 420] }; })).toContain('cadre.regards-libres');
    expect(broken((p) => { p.frames[0]!.bodies[2] = { ...villager, depth: 4, box: [100, 700, 200, 900] }; })).toContain('cadre.rien-devant');
    expect(broken((p) => { p.frames[1]!.bodies[2] = { ...villager, box: [540, 400, 640, 560] }; })).toContain('cadre.bord');
    // in a close shot a small part of a far passer-by cut by the edge is normal; a big chunk is not
    expect(broken((p) => { p.frames[2]!.bodies[2] = { ...villager, box: [540, 400, 640, 560] }; p.frames[2]!.shot = 1; })).not.toContain('cadre.bord');
    expect(broken((p) => { p.frames[2]!.bodies[2] = { ...villager, box: [400, 300, 800, 900] }; p.frames[2]!.shot = 1; })).toContain('cadre.bord');
    expect(broken((p) => { for (const f of p.frames) f.bodies.pop(); })).toContain('cadre.fond-vivant');
    // un plan moyen en pied (format bande) est jugé comme un plan large : un figurant à moitié coupé y est refusé
    expect(broken((p) => { p.shots[1]!.size = 'PM'; p.frames[2]!.bodies[2] = { ...villager, box: [540, 400, 640, 560] }; p.frames[2]!.shot = 1; })).toContain('cadre.bord');
    // a sliver of a few pixels at the edge is not in the picture: it touches no face
    expect(broken((p) => { p.frames[2]!.shot = 1; p.frames[2]!.bodies[2] = { ...villager, box: [571, 300, 1400, 700] }; p.frames[2]!.bodies[1] = { ...p.frames[2]!.bodies[1]!, head: [300, 300, 600, 420] }; })).not.toContain('cadre.tangente-tete');
  });
  it('heads: the head of ANY visible actor cut by the top or side edge is caught, not only the subject of the shot', () => {
    // plan sur Maman (plus petite) : la tête de Modou, à côté, sort par le haut (revue du 16/10, format bande)
    expect(broken((p) => { p.frames[1]!.bodies[0] = { ...p.frames[1]!.bodies[0]!, box: [110, -20, 250, 800], head: [140, -20, 220, 80] }; })).toContain('cadre.tetes-entieres');
    expect(broken((p) => { p.frames[1]!.bodies[1] = { ...p.frames[1]!.bodies[1]!, head: [520, 320, 600, 420] }; })).toContain('cadre.tetes-entieres');
    expect(checkPlan(good()).map((x) => x.rule)).not.toContain('cadre.tetes-entieres');
  });
  it('subtitles: a wide shot where the text band covers the actors, or a close shot where it covers a face, is caught', () => {
    expect(broken((p) => { p.subtitleTop = 670; })).toContain('cadre.sous-titres');
    expect(broken((p) => { p.subtitleTop = 820; })).not.toContain('cadre.sous-titres');
    expect(broken((p) => { p.subtitleTop = 400; p.frames[0]!.shot = 1; p.frames[1]!.shot = 1; p.frames[2]!.shot = 1; p.frames[3]!.shot = 1; })).toContain('cadre.sous-titres');
  });
  it('eye lines: actors back to back, or swapping sides between shots, are caught', () => {
    expect(broken((p) => { p.frames[0]!.bodies[0]!.facing = -1; })).toContain('regards.face-a-face');
    expect(broken((p) => { const f = p.frames[3]!; f.bodies[0] = actor('Modou', 320, -1); f.bodies[1] = actor('Maman', 110, 1); })).toContain('regards.180');
  });
  it('scale, ground and shadows: a giant, a floating body, a stick shadow, a second sun are caught', () => {
    expect(broken((p) => { p.frames[0]!.bodies[0]!.heightM = 2.4; })).toContain('echelle.tailles');
    expect(broken((p) => { p.frames[0]!.bodies[2] = { ...villager, onGround: false }; })).toContain('sol.pieds');
    expect(broken((p) => { p.frames[0]!.bodies[0]!.shadow = { dir: [-0.85, -0.53], widthRatio: 0.04 }; })).toContain('ombres.volume');
    expect(broken((p) => { p.frames[0]!.bodies[1]!.shadow = { dir: [0.85, -0.53], widthRatio: 0.3 }; })).toContain('ombres.une-lumiere');
  });
  it('editing: a cut in the middle of a word and two visible drawing pops in a row are caught', () => {
    expect(broken((p) => { p.shots[1]!.t0 = 5.0; p.shots[0]!.t1 = 5.0; })).toContain('montage.coupe-hors-mot');
    expect(broken((p) => { p.swaps.push({ who: 'Maman', t: 5 }, { who: 'Modou', t: 7 }); })).toContain('montage.saut-cache');
  });
  it('comic acting (research 16/10): a drawing held < 8 frames, more than 2 visible takes, a body still moving before the punch are caught; off-screen swaps are free', () => {
    expect(broken((p) => { p.swaps.push({ who: 'Modou', t: 8.7 }); })).toContain('comique.tenue-8-images');
    expect(broken((p) => { p.swaps.push({ who: 'Maman', t: 2 }, { who: 'Maman', t: 9 }, { who: 'Modou', t: 15.5 }); })).toContain('comique.prises-max-2');
    expect(broken((p) => { p.quietBeforePunch = 4; })).toContain('comique.immobile-avant-chute');
    expect(broken((p) => { p.quietBeforePunch = 0.6; p.swaps.push({ who: 'Maman', t: 5, seen: false }, { who: 'Maman', t: 7, seen: false }); })).toEqual([]);
  });
  it('director review of v4 (« tu n’as rien remarqué ? »): what was only visible in the pixels is now in the book', () => {
    // a hand cut by the frame edge in a close shot
    expect(broken((p) => { p.frames[1]!.bodies[0] = { ...actor('Modou', 110, 1), hands: [[300, 600], [575, 520]] }; })).toContain('cadre.mains-entieres');
    expect(broken((p) => { p.frames[1]!.bodies[0] = { ...actor('Modou', 110, 1), hands: [[300, 600], [520, 520]] }; })).not.toContain('cadre.mains-entieres');
    // tiny actors and half a picture of empty ground in the two-shot
    expect(broken((p) => { p.frames[0]!.bodies[0] = { ...actor('Modou', 110, 1), box: [110, 380, 160, 640] }; })).toContain('cadre.taille-acteurs');
    // a villager pulled out of the painting with its head cut flat and a wedge of ground; a 120-px villager blown up 2×
    expect(broken((p) => { p.frames[0]!.bodies[2] = { ...villager, cutout: { moved: true, clean: false, magnify: 1.1, why: 'corps coupé net au bord du haut' } }; })).toContain('figuration.decoupe-propre');
    expect(broken((p) => { p.frames[0]!.bodies[2] = { ...villager, cutout: { moved: false, clean: false, magnify: 1.0 } }; })).not.toContain('figuration.decoupe-propre');
    expect(broken((p) => { p.frames[0]!.bodies[2] = { ...villager, cutout: { moved: true, clean: true, magnify: 2.0 } }; })).toContain('figuration.resolution');
    // in a close shot whose background is defocused by 5 px, a figurant blown up 2× is as soft as the set around it
    expect(broken((p) => { p.shots[1]!.bgBlur = 5; p.frames[1]!.shot = 1; p.frames[1]!.bodies[2] = { ...villager, cutout: { moved: true, clean: true, magnify: 2.0 } }; })).not.toContain('figuration.resolution');
    // green fringe around an actor, a folded triangle in a hand
    expect(broken((p) => { p.frames[1]!.bodies[0] = { ...actor('Modou', 110, 1), spill: 0.2 }; })).toContain('image.lisere');
    expect(broken((p) => { p.frames[1]!.bodies[0] = { ...actor('Modou', 110, 1), folds: 3 }; })).toContain('image.maillage');
    // a set blown up 4× behind a close-up without defocus (blocks and pixel stairs)
    expect(broken((p) => { p.shots[1]!.bgMagnify = 4; p.shots[1]!.bgBlur = 0; })).toContain('image.fond-agrandi');
    expect(broken((p) => { p.shots[1]!.bgMagnify = 4; p.shots[1]!.bgBlur = 5; })).not.toContain('image.fond-agrandi');
    // the credit printed over « Ha ha ha ! », and a first frame that is black
    expect(broken((p) => { p.texts = [{ id: 'Ha ha ha !', t0: 15.7, t1: 19.2, box: [200, 700, 380, 740] }, { id: 'générique', t0: 17.6, t1: 19.2, box: [40, 720, 540, 745] }]; })).toContain('montage.textes');
    expect(broken((p) => { p.texts = [{ id: 'Ha ha ha !', t0: 15.7, t1: 19.2, box: [200, 700, 380, 740] }, { id: 'générique', t0: 17.6, t1: 19.2, box: [40, 960, 540, 985] }]; })).not.toContain('montage.textes');
    expect(broken((p) => { p.openingFade = 0.4; })).toContain('montage.premiere-image');
    expect(broken((p) => { p.openingFade = 0; })).not.toContain('montage.premiere-image');
  });
  it('a cut inside a line is allowed only in one of its silences (the voice pauses)', () => {
    const cutAt = (p: Plan, c: number) => { p.shots.splice(2, 1, { t0: 12.17, t1: c, size: 'PE', subject: 'groupe' }, { t0: c, t1: 17.2, size: 'PA', subject: 'Modou' }); };
    expect(broken((p) => { cutAt(p, 13.0); })).toContain('montage.coupe-hors-mot');
    expect(broken((p) => { p.lines[4]!.pauses = [[12.9, 13.1]]; cutAt(p, 13.0); })).not.toContain('montage.coupe-hors-mot');
  });
  it('a cut placed in the beat just before the punch phrase is allowed (it is a silence)', () => {
    expect(broken((p) => { p.shots[1]!.t1 = 10.73; p.shots[2]!.t0 = 10.73; })).not.toContain('montage.coupe-hors-mot');
  });
  it('rhythm measured on the channel: late hook, slow turns, no beat before the punch, short laugh, abrupt end are caught', () => {
    expect(broken((p) => { p.lines[0]!.t0 = 2.5; })).toContain('rythme.accroche');
    expect(broken((p) => { p.lines[1]!.t0 = 4.4; })).toContain('rythme.tour');
    expect(broken((p) => { p.lines[3]!.punch!.pauseBefore = 0.05; })).toContain('rythme.silence-chute');
    expect(broken((p) => { p.lines[4]!.t1 = 13.2; p.total = 14.0; })).toContain('rythme.rire');
    expect(broken((p) => { p.total = 15.6; })).toContain('rythme.fin');
  });
  it('comedy (bible): long punch, a dead word after it, no reaction, no close-up on the liar, reaction not seen together', () => {
    expect(broken((p) => { p.lines[3]!.punch!.phrase = 'et après ça il est parti très très loin de moi pour toujours'; })).toContain('comique.chute-courte');
    expect(broken((p) => { p.lines[3]!.text = 'Oui ! Le travail m’a vu… et il s’est sauvé, hein ?'; })).toContain('comique.mot-final');
    expect(broken((p) => { p.lines[4]!.state = 'neutre'; })).toContain('comique.reaction');
    expect(broken((p) => { p.shots[1]!.size = 'PE'; p.shots[1]!.subject = 'groupe'; })).toContain('comique.menteur-gros-plan');
    expect(broken((p) => { p.shots[1]!.t1 = 13.5; p.shots[2]!.t0 = 13.5; })).toContain('comique.chute-a-deux');
    expect(broken((p) => { p.beats = [{ t: 1.2, move: 'tournerTete' }]; })).toContain('comique.fond-reagit');
    expect(broken((p) => { p.lines[2]!.emotion = 0.95; })).toContain('comique.escalade');
  });
});
