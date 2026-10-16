import { describe, expect, it } from 'vitest';
import { MOVES } from '../../server/jev/studio/actor/bodyMoves';
import { FIGURANT_ACTIONS, classOf, figurantCues, gust, motionOf, sceneLifeReport, screenAmplitude, seedOf, stageFigurants, validateInstance, type Box, type StageSpot } from '../../server/jev/studio/actor/sceneMotion';

describe('la vie de toute la scène (un seul système de mouvement)', () => {
  it('every detector / scene-parser name gets a class; an unknown name stays still', () => {
    expect(classOf('person')).toBe('figurant');
    expect(classOf('bird')).toBe('oiseau');
    expect(classOf('dog')).toBe('animal');
    expect(classOf('tree')).toBe('vegetation');
    expect(classOf('umbrella')).toBe('tissu');
    expect(classOf('boat')).toBe('bateau');
    expect(classOf('house')).toBe('bati');
    expect(classOf('quelque chose d’inconnu')).toBe('pose');
  });
  it('cross-checks the detector: an « umbrella » on a roof is a roof, a « person » without skeleton stays still, a body is a person', () => {
    expect(validateInstance({ label: 'umbrella', parsed: { house: 0.6, sky: 0.2 } })).toBe('bati');
    expect(validateInstance({ label: 'person', parsed: { person: 0.5 }, skeleton: false })).toBe('pose');
    expect(validateInstance({ label: 'umbrella', parsed: { person: 0.5 }, skeleton: true })).toBe('figurant');
    expect(validateInstance({ label: 'bird', parsed: { animal: 0.4 } })).toBe('oiseau');
  });
  it('one wind for everything: the same gust drives leaves and cloth at the same instant', () => {
    for (const t of [0, 1.7, 5.2, 11.9]) {
      const g = gust(t);
      expect(g).toBeGreaterThan(0.29);
      expect(g).toBeLessThan(1.01);
      const leaf = motionOf({ id: 'a', cls: 'vegetation' }, t), cloth = motionOf({ id: 'b', cls: 'tissu' }, t);
      expect(Math.sign(leaf.dx) === 1 || leaf.dx === 0).toBe(true); // the wind blows to the right: leaves never lean left
      expect(Math.sign(cloth.dx) === 1 || cloth.dx === 0).toBe(true);
    }
  });
  it('deterministic: same element, same time → same motion; two figurants do not move in unison', () => {
    expect(motionOf({ id: 'poule-1', cls: 'oiseau' }, 3.3)).toEqual(motionOf({ id: 'poule-1', cls: 'oiseau' }, 3.3));
    expect(seedOf('figurant-1')).not.toBe(seedOf('figurant-2'));
    const a = figurantCues('figurant-1', 6.1).map((c) => c.name).join(), b = figurantCues('figurant-2', 6.1).map((c) => c.name).join();
    expect(a === b && a !== 'respirer').toBe(false);
  });
  it('a figurant breathes all the time and plays only rig movements of the repertoire, one at a time', () => {
    for (const a of FIGURANT_ACTIONS) expect(MOVES[a].needs).toBe('rig');
    let busy = 0;
    for (let t = 0; t < 60; t += 0.25) {
      const c = figurantCues('villageois-3', t);
      expect(c[0]!.name).toBe('respirer');
      expect(c.length).toBeLessThanOrEqual(2);
      for (const x of c) { expect(x.u).toBeGreaterThanOrEqual(0); expect(x.u).toBeLessThanOrEqual(1); }
      if (c.length > 1) busy++;
    }
    expect(busy).toBeGreaterThan(20); // it does act (not a statue)…
    expect(busy).toBeLessThan(200); // …but not all the time
  });
  it('amplitudes shrink with depth and respect the fluidity cap (≤ 0.5 px per frame at 30 i/s)', () => {
    const near = screenAmplitude(0.05, 3, 1000, { freqHz: 0.5 }), far = screenAmplitude(0.05, 30, 1000, { freqHz: 0.5 });
    expect(far).toBeLessThan(near);
    for (const [m, d, f] of [[0.05, 3, 1000], [0.3, 2, 1500], [0.01, 50, 800]] as const) {
      const a = screenAmplitude(m, d, f, { freqHz: 0.8 });
      expect(2 * Math.PI * 0.8 * a / 30).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });
  it('a hen pecks now and then, a dog wags faster than a cow swishes; houses and the ground never move', () => {
    let pecks = 0;
    for (let t = 0; t < 10; t += 1 / 30) if ((motionOf({ id: 'poule', cls: 'oiseau' }, t).parts.peck ?? 0) > 0.3) pecks++;
    expect(pecks).toBeGreaterThan(5);
    const zc = (label: string) => { let n = 0, prev = 0; for (let t = 0; t < 4; t += 1 / 60) { const v = motionOf({ id: 'x', cls: 'animal', label }, t).parts.tail!; if (prev < 0 && v >= 0) n++; prev = v; } return n; };
    expect(zc('dog')).toBeGreaterThan(zc('cow') * 3);
    for (const cls of ['bati', 'sol', 'pose'] as const) expect(motionOf({ id: 'm', cls }, 7)).toEqual({ dx: 0, dy: 0, rot: 0, scale: 1, light: 1, cues: [], parts: {} });
  });
  it('the background SEES the story: each figurant answers a strong beat after its own delay, and no action is ever cut', () => {
    const beats = [{ t: 5, move: 'rire' as const }];
    const firstReact = (id: string) => { for (let t = 5; t < 7; t += 1 / 60) if (figurantCues(id, t, { reactions: beats }).some((c) => c.name === 'rire')) return t; return Infinity; };
    const a = firstReact('villageois-1'), b = firstReact('villageois-2');
    for (const x of [a, b]) { expect(x).toBeGreaterThanOrEqual(5.15); expect(x).toBeLessThanOrEqual(5.62); }
    expect(Math.abs(a - b)).toBeGreaterThan(1 / 60); // not in unison
    for (const id of ['villageois-1', 'villageois-2', 'villageois-3', 'poule-9']) {
      const seen = new Map<string, number>();
      for (let t = 0; t < 30; t += 1 / 30) {
        const c = figurantCues(id, t, { reactions: [{ t: 4, move: 'tournerTete' }, ...beats, { t: 17, move: 'rire' }] });
        expect(c.length).toBeLessThanOrEqual(2);
        const now = new Map(c.slice(1).map((x) => [x.name, x.u] as [string, number]));
        // an action that disappears must have ended (u near 1), one that appears must start (u near 0)
        for (const [n, u] of seen) if (!now.has(n)) expect(u, `${id} ${n} coupé à ${t.toFixed(2)}`).toBeGreaterThan(0.9);
        for (const [n, u] of now) if (!seen.has(n)) expect(u, `${id} ${n} commencé en route à ${t.toFixed(2)}`).toBeLessThan(0.1);
        seen.clear(); for (const [n, u] of now) seen.set(n, u);
      }
    }
  });
  it('figuration: extras off-screen are staged in the visible background, never over the actors nor their gaze, readable, behind them', () => {
    // a 576×1024 frame; the camera sees u ∈ [0.35, 0.65]; feet at screen y grow with v; size shrinks with depth
    const project = (s: StageSpot, hM: number, wM: number): Box | null => {
      const x = ((s.u - 0.35) / 0.3) * 576, y = 300 + (s.v - 0.6) * 1600, f = 900 / s.depth;
      return [x - (wM * f) / 2, y - hM * f, x + (wM * f) / 2, y];
    };
    const spots: StageSpot[] = [];
    for (let u = 0; u <= 1; u += 0.01) for (let v = 0.6; v <= 0.95; v += 0.01) spots.push({ u, v, depth: 2 + 40 * (0.95 - v) });
    const actors: Box[] = [[150, 300, 300, 820], [330, 340, 470, 820]], gaze: Box = [200, 300, 420, 420];
    const extras = [
      { id: 'loin-gauche', kind: 'personne' as const, heightM: 1.5, widthM: 0.5, painted: { u: 0.1, v: 0.7, depth: 12 } },
      { id: 'dans-le-champ', kind: 'personne' as const, heightM: 1.6, widthM: 0.5, painted: { u: 0.38, v: 0.7, depth: 12 } },
      { id: 'coq', kind: 'animal' as const, heightM: 0.5, widthM: 0.5, painted: { u: 0.9, v: 0.85, depth: 6 } },
    ];
    const r = stageFigurants({ frame: { w: 576, h: 1024 }, extras, spots, project, keepOut: [...actors, gaze], minDepth: { personne: 8, animal: 5 } });
    const by = Object.fromEntries(r.map((x) => [x.id, x]));
    expect(by['dans-le-champ']!.moved).toBe(false); // already well placed by the painting: kept
    expect(by['loin-gauche']!.moved).toBe(true);
    for (const x of r) {
      expect(x.box, x.id).not.toBeNull();
      const b = x.box!;
      expect(b[0]).toBeGreaterThanOrEqual(0.04 * 576); expect(b[2]).toBeLessThanOrEqual(0.96 * 576);
      for (const k of [...actors, gaze]) expect(b[0] < k[2] && k[0] < b[2] && b[1] < k[3] && k[1] < b[3], `${x.id} sur un acteur`).toBe(false);
      expect(x.spot.depth).toBeGreaterThanOrEqual(x.id === 'coq' ? 5 : 8);
    }
    expect(r).toEqual(stageFigurants({ frame: { w: 576, h: 1024 }, extras, spots, project, keepOut: [...actors, gaze], minDepth: { personne: 8, animal: 5 } })); // deterministic
    // staging in depth: an extra may stand behind an actor's BODY if its own head is clear and ≥ 65 % of it is seen
    const body: Box = [100, 200, 476, 1000], heads: Box = [100, 200, 476, 330];
    const deep = stageFigurants({ frame: { w: 576, h: 1024 }, extras: [extras[0]!], spots, project, keepOut: [heads], occluders: [body], minDepth: { personne: 8, animal: 5 } });
    expect(deep[0]!.moved).toBe(true);
    const db = deep[0]!.box!;
    const cover = Math.max(0, Math.min(db[2], body[2]) - Math.max(db[0], body[0])) * Math.max(0, Math.min(db[3], body[3]) - Math.max(db[1], body[1])) / ((db[2] - db[0]) * (db[3] - db[1]));
    expect(cover).toBeLessThanOrEqual(0.35 + 1e-9);
    expect(db[0] < heads[2] && heads[0] < db[2] && db[1] < heads[3] && heads[1] < db[3]).toBe(false);
    // a partial body (seated, cut by the edge) is never moved: it would stand as half a person
    const half = stageFigurants({ frame: { w: 576, h: 1024 }, extras: [{ ...extras[0]!, movable: false }], spots, project, keepOut: [], minDepth: { personne: 8, animal: 5 } });
    expect(half[0]!.moved).toBe(false);
    expect(half[0]!.reason).toMatch(/incompl/);
    // in FRONT of the actors (a hen in the foreground) nothing may cover them, not even partly
    const front = stageFigurants({ frame: { w: 576, h: 1024 }, extras: [extras[2]!], spots, project, keepOut: [heads], occluders: [body], actorDepth: 10, minDepth: { personne: 8, animal: 3 } });
    const fb = front[0]!.box!;
    if (front[0]!.spot.depth < 10) expect(fb[0] < body[2] && body[0] < fb[2] && fb[1] < body[3] && body[1] < fb[3]).toBe(false);
    // any other rule of the book can veto a spot (here: nothing on the left half, as if a close-up cut it there)
    const vetoed = stageFigurants({ frame: { w: 576, h: 1024 }, extras: [extras[0]!], spots, project, keepOut: [], minDepth: { personne: 8, animal: 5 }, allow: (sp) => sp.u > 0.5 });
    expect(vetoed[0]!.spot.u).toBeGreaterThan(0.5);
    // no room at all → stays painted, and says why
    const full = stageFigurants({ frame: { w: 576, h: 1024 }, extras: [extras[0]!], spots, project, keepOut: [[0, 0, 576, 1024]], minDepth: { personne: 8, animal: 5 } });
    expect(full[0]!.moved).toBe(false);
    expect(full[0]!.reason).toMatch(/aucune place/);
  });
  it('the life report says what moves and why the rest stays still', () => {
    const r = sceneLifeReport([{ id: 'f1', label: 'person', cls: 'figurant' }, { id: 'h1', label: 'house', cls: 'bati' }, { id: 'p1', label: 'bird', cls: 'oiseau' }]);
    expect(r.moving).toBe(2);
    expect(r.still).toBe(1);
    expect(r.lines[1]).toMatch(/immobile/);
  });
});
