import { describe, expect, it } from 'vitest';
import { BP, puppetPose, type PuppetDrive, type SheetBody } from '../../server/jev/studio/actor/puppetMotion';
import { MOVES, envelope, guardBody, ik2, naturalBends, type MoveName, type P } from '../../server/jev/studio/actor/bodyMoves';

// Two drawings: a frontal figure with arms down, and a three-quarter figure facing right with an accusing arm.
const frontal: SheetBody = {
  [BP.nose]: [0.5, 0.1], [BP.lEye]: [0.53, 0.09], [BP.rEye]: [0.47, 0.09],
  [BP.lSh]: [0.65, 0.22], [BP.rSh]: [0.35, 0.22], [BP.lEl]: [0.7, 0.38], [BP.rEl]: [0.3, 0.38],
  [BP.lWr]: [0.72, 0.52], [BP.rWr]: [0.28, 0.52], [BP.lHip]: [0.6, 0.55], [BP.rHip]: [0.4, 0.55],
  [BP.lKn]: [0.59, 0.76], [BP.rKn]: [0.41, 0.76], [BP.lAn]: [0.58, 0.97], [BP.rAn]: [0.42, 0.97],
  [BP.lHeel]: [0.57, 0.98], [BP.rHeel]: [0.43, 0.98], [BP.lToe]: [0.62, 0.99], [BP.rToe]: [0.38, 0.99],
};
const threeQuarter: SheetBody = {
  [BP.nose]: [0.6, 0.1], [BP.lEye]: [0.62, 0.09], [BP.rEye]: [0.56, 0.09],
  [BP.lSh]: [0.62, 0.22], [BP.rSh]: [0.38, 0.23], [BP.lEl]: [0.78, 0.25], [BP.rEl]: [0.33, 0.38],
  [BP.lWr]: [0.92, 0.2], [BP.rWr]: [0.4, 0.5], [BP.lHip]: [0.58, 0.55], [BP.rHip]: [0.42, 0.56],
  [BP.lKn]: [0.6, 0.76], [BP.rKn]: [0.43, 0.77], [BP.lAn]: [0.6, 0.97], [BP.rAn]: [0.42, 0.97],
};
const W = 300, H = 900;
const drive = (o: Partial<PuppetDrive>): PuppetDrive => ({ t: 1.3, talking: true, listening: false, energy: 0.5, beat: 0.5, pose: 'neutre', age: 1, phase: 0.4, laugh: 0, shock: 0, ...o });
const restOf = (b: SheetBody) => new Map<number, P>(Object.entries(b).map(([k, v]) => [Number(k), [v[0] * W, v[1] * H] as P]));
const len = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const BONES: [number, number][] = [[BP.lSh, BP.lEl], [BP.lEl, BP.lWr], [BP.rSh, BP.rEl], [BP.rEl, BP.rWr], [BP.lHip, BP.lKn], [BP.lKn, BP.lAn], [BP.rHip, BP.rKn], [BP.rKn, BP.rAn]];

describe('répertoire complet des mouvements du corps (marionnette dessinée)', () => {
  it('lists every region of the body, and says honestly what needs another drawing or the face layers', () => {
    const regions = new Set(Object.values(MOVES).map((m) => m.region));
    for (const r of ['tête', 'yeux', 'bouche', 'épaules', 'buste', 'bras', 'jambes', 'corps']) expect(regions.has(r as never)).toBe(true);
    expect(Object.keys(MOVES).length).toBeGreaterThanOrEqual(40);
    expect(MOVES.croiserBras.needs).toBe('dessin');
    expect(MOVES.cligner.needs).toBe('visage');
  });
  it('envelope: anticipation backwards, action, hold, release to rest', () => {
    expect(envelope(0.05)).toBeLessThan(0);
    expect(envelope(0.5)).toBeCloseTo(1, 5);
    expect(envelope(0)).toBe(0);
    expect(envelope(1)).toBe(0);
  });
  it('two-bone IK keeps the bone lengths and bends on the asked side', () => {
    for (const bend of [1, -1]) {
      const r = ik2([0, 0], 100, 80, [120, 40], bend);
      expect(len([0, 0], r.mid)).toBeCloseTo(100, 6);
      expect(len(r.mid, r.end)).toBeCloseTo(80, 6);
      const u: P = [r.mid[0], r.mid[1]], v: P = [r.end[0] - r.mid[0], r.end[1] - r.mid[1]];
      expect(Math.sign(u[0] * v[1] - u[1] * v[0])).toBe(bend);
    }
  });
  it('the guard puts an elbow bent the WRONG way back on its natural side (16/10: « le bras est dans l’autre sens »)', () => {
    const rest = restOf(frontal), tg = new Map(rest);
    const s = rest.get(BP.lSh)!, e = rest.get(BP.lEl)!, w = rest.get(BP.lWr)!;
    // the hand brought up near the shoulder, the elbow folded on the WRONG side
    const natural = naturalBends(rest, H).get(BP.lEl)!;
    const r = ik2(s, len(s, e), len(e, w), [s[0] + 20, s[1] + 90], -natural);
    tg.set(BP.lEl, r.mid); tg.set(BP.lWr, r.end);
    const rep = guardBody(rest, tg, H);
    expect(rep.flips).toBe(1);
    // held at the edge of straight (≤ 8° on the wrong side): never bent backwards, and no one-frame flip
    const u: P = [tg.get(BP.lEl)![0] - s[0], tg.get(BP.lEl)![1] - s[1]], v: P = [tg.get(BP.lWr)![0] - tg.get(BP.lEl)![0], tg.get(BP.lWr)![1] - tg.get(BP.lEl)![1]];
    const ang = (Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * 180) / Math.PI;
    expect(Math.sign(ang) === natural || Math.abs(ang) <= 8.01).toBe(true);
    expect(guardBody(rest, new Map(tg), H).flips).toBe(0);
  });
  it('the guard is CONTINUOUS: a forearm swept through straight to the wrong side never jumps between two frames', () => {
    const rest = restOf(frontal);
    const s = rest.get(BP.lSh)!, e = rest.get(BP.lEl)!, w = rest.get(BP.lWr)!;
    const natural = naturalBends(rest, H).get(BP.lEl)!;
    const up: P = [e[0] - s[0], e[1] - s[1]], l2 = len(e, w), n = Math.hypot(up[0], up[1]);
    let prev: P | null = null, maxJump = 0;
    for (let deg = 40; deg >= -40; deg--) { // forearm angle to the upper arm, natural side first, 1° per frame
      const a = (natural * deg * Math.PI) / 180;
      const d: P = [(up[0] / n) * Math.cos(a) - (up[1] / n) * Math.sin(a), (up[0] / n) * Math.sin(a) + (up[1] / n) * Math.cos(a)];
      const tg = new Map(rest);
      tg.set(BP.lWr, [e[0] + d[0] * l2, e[1] + d[1] * l2]);
      guardBody(rest, tg, H);
      const hand = tg.get(BP.lWr)!;
      if (prev) maxJump = Math.max(maxJump, len(prev, hand));
      prev = hand;
    }
    expect(maxJump).toBeLessThan(4); // 1° of a 126 px forearm ≈ 2.2 px; a mirror flip would jump tens of pixels
  });
  const names = Object.keys(MOVES) as MoveName[];
  for (const [label, body] of [['de face', frontal], ['de trois-quarts', threeQuarter]] as const) {
    it(`every movement, ${label}, both directions, all phases: no limb left reversed, bones whole, feet planted`, () => {
      const rest = restOf(body);
      let played = 0;
      for (const name of names) {
        for (const toward of [1, -1] as const) {
          for (const u of [0.05, 0.2, 0.35, 0.5, 0.7, 0.9]) {
            for (const amplitude of [1, 1.7]) {
              const r = puppetPose(body, W, H, drive({ toward, moves: [{ name, u }], amplitude, pose: name === 'pointer' ? 'accuse' : 'neutre' }));
              played++;
              // after the guard, a second pass has nothing left to fix
              const again = guardBody(rest, new Map(r.targets), H);
              expect(again.flips, `${name} u=${u} vers ${toward} ×${amplitude}`).toBe(0);
              expect(again.overFlex).toBe(0);
              for (const [a, b] of BONES) {
                const A = r.targets.get(a), B = r.targets.get(b);
                if (A && B) expect(Math.abs(len(A, B) / len(rest.get(a)!, rest.get(b)!) - 1), `${name} os ${a}-${b}`).toBeLessThan(0.012);
              }
              for (const f of [BP.lAn, BP.rAn]) if (!r.freeFeet.includes(f)) expect(len(r.targets.get(f)!, rest.get(f)!)).toBeLessThan(1e-6);
            }
          }
        }
      }
      expect(played).toBeGreaterThan(900);
    });
  }
  it('aimed movements go TO the partner: pointing, presenting, stopping, leaning in', () => {
    for (const toward of [1, -1] as const) {
      for (const name of ['pointer', 'presenter', 'stop'] as const) {
        const r0 = puppetPose(frontal, W, H, drive({ toward, talking: false, listening: true, beat: 0 }));
        const r1 = puppetPose(frontal, W, H, drive({ toward, talking: false, listening: true, beat: 0, moves: [{ name, u: 0.5 }] }));
        const hand = (m: Map<number, P>) => (toward > 0 ? m.get(BP.lWr)! : m.get(BP.rWr)!);
        expect(toward * (hand(r1.targets)[0] - hand(r0.targets)[0]), `${name} vers ${toward}`).toBeGreaterThan(10);
      }
      const lean = puppetPose(frontal, W, H, drive({ toward, talking: false, listening: true, moves: [{ name: 'pencherVers', u: 0.5 }] }));
      const mid = (lean.targets.get(BP.lSh)![0] + lean.targets.get(BP.rSh)![0]) / 2;
      expect(toward * (mid - 0.5 * W)).toBeGreaterThan(5);
    }
  });
  it('hands on the head and scratching reach the head; bending the knees folds them forward without moving the feet', () => {
    const r = puppetPose(frontal, W, H, drive({ moves: [{ name: 'mainsTete', u: 0.5 }] }));
    expect(len(r.targets.get(BP.lWr)!, r.targets.get(BP.nose)!)).toBeLessThan(0.12 * H);
    const k = puppetPose(threeQuarter, W, H, drive({ toward: 1, moves: [{ name: 'flechir', u: 0.5 }] }));
    expect(k.targets.get(BP.lHip)![1]).toBeGreaterThan(0.55 * H + 10);
    expect(k.targets.get(BP.lKn)![0]).toBeGreaterThan(0.6 * W); // the knee comes forward (the figure faces right)
    expect(k.guard.flips).toBe(0);
  });
});
