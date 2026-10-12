import { describe, expect, it } from 'vitest';
import { BP, bodyFromLandmarks, puppetTargets, type PuppetDrive, type SheetBody } from '../../server/jev/studio/actor/puppetMotion';

// A standing figure 300 × 900: arms down at the sides, an accusing right arm pointing out.
const body: SheetBody = {
  [BP.nose]: [0.5, 0.1],
  [BP.lSh]: [0.65, 0.22],
  [BP.rSh]: [0.35, 0.22],
  [BP.lEl]: [0.7, 0.38],
  [BP.rEl]: [0.2, 0.3],
  [BP.lWr]: [0.72, 0.52],
  [BP.rWr]: [0.02, 0.28],
  [BP.lHip]: [0.6, 0.55],
  [BP.rHip]: [0.4, 0.55],
  [BP.lAn]: [0.58, 0.97],
  [BP.rAn]: [0.42, 0.97],
};
const drive = (o: Partial<PuppetDrive>): PuppetDrive => ({ t: 1, talking: true, listening: false, energy: 0.5, beat: 0, pose: 'neutre', age: 1, phase: 0, laugh: 0, shock: 0, ...o });
const W = 300;
const H = 900;
const len = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('jeu du corps de la marionnette souple', () => {
  it('the feet stay planted, the bones keep their lengths', () => {
    const m = puppetTargets(body, W, H, drive({ beat: 1 }));
    expect(m.get(BP.lAn)).toEqual([0.58 * W, 0.97 * H]);
    const s = m.get(BP.lSh)!;
    const e = m.get(BP.lEl)!;
    const w = m.get(BP.lWr)!;
    expect(len(s, e)).toBeCloseTo(Math.hypot(0.05 * W, 0.16 * H), 3);
    expect(len(e, w)).toBeCloseTo(Math.hypot(0.02 * W, 0.14 * H), 3);
  });
  it('a stressed syllable lifts the talker’s forearm', () => {
    const calm = puppetTargets(body, W, H, drive({ beat: 0, t: 0 }));
    const hit = puppetTargets(body, W, H, drive({ beat: 1, t: 0 }));
    expect(hit.get(BP.lWr)![1]).toBeLessThan(calm.get(BP.lWr)![1] - 3);
  });
  it('the accusing arm jabs (the pointing wrist moves on the accent), the shrug raises the shoulders', () => {
    const a0 = puppetTargets(body, W, H, drive({ pose: 'accuse', beat: 0, t: 0 }));
    const a1 = puppetTargets(body, W, H, drive({ pose: 'accuse', beat: 1, t: 0 }));
    expect(len(a0.get(BP.rWr)!, a1.get(BP.rWr)!)).toBeGreaterThan(2);
    const sh = puppetTargets(body, W, H, drive({ pose: 'haussement', age: 0.25, t: 0 }));
    expect(sh.get(BP.lSh)![1]).toBeLessThan(0.22 * H - 0.01 * H);
  });
  it('a hand on the face moves with the head (the face is never pulled)', () => {
    const choc: SheetBody = { ...body, [BP.lWr]: [0.56, 0.12], [BP.lEl]: [0.7, 0.25] };
    const m = puppetTargets(choc, W, H, drive({ pose: 'choc', age: 0.1, t: 0.3 }));
    const dn = [m.get(BP.nose)![0] - 0.5 * W, m.get(BP.nose)![1] - 0.1 * H];
    const dw = [m.get(BP.lWr)![0] - 0.56 * W, m.get(BP.lWr)![1] - 0.12 * H];
    expect(dw[0]).toBeCloseTo(dn[0]!, 6);
    expect(dw[1]).toBeCloseTo(dn[1]!, 6);
  });
  it('walking: one foot lifts and swings forward while the other carries, the arms swing against the legs', () => {
    const a = puppetTargets(body, W, H, drive({ talking: false, walk: { phase: Math.PI / 2, dir: 1 } }));
    // Left foot in the air (lifted), right foot on the ground.
    expect(a.get(BP.lAn)![1]).toBeLessThan(0.97 * H - 0.02 * H);
    expect(a.get(BP.rAn)![1]).toBeCloseTo(0.97 * H, 6);
    const b = puppetTargets(body, W, H, drive({ talking: false, walk: { phase: (3 * Math.PI) / 2, dir: 1 } }));
    expect(b.get(BP.rAn)![1]).toBeLessThan(0.97 * H - 0.02 * H);
    // The arms swing the other way from one step to the next.
    expect(a.get(BP.lWr)![0]).not.toBeCloseTo(b.get(BP.lWr)![0], 0);
    // Bones keep their lengths while walking.
    expect(len(a.get(BP.lEl)!, a.get(BP.lWr)!)).toBeCloseTo(Math.hypot(0.02 * W, 0.14 * H), 3);
  });
  it('a usable skeleton needs the shoulders and an arm; hidden points are left out', () => {
    const pts = new Array(33 * 3).fill(0);
    const set = (k: number, x: number, y: number, v = 0.9) => {
      pts[k * 3] = x;
      pts[k * 3 + 1] = y;
      pts[k * 3 + 2] = v;
    };
    set(BP.lSh, 200, 200);
    set(BP.rSh, 100, 200);
    set(BP.lEl, 210, 340);
    set(BP.lWr, 215, 470);
    set(BP.nose, 150, 90);
    set(BP.lHip, 190, 500);
    set(BP.rKn, 120, 700, 0.2);
    const b = bodyFromLandmarks(pts, 300, 900)!;
    expect(b[BP.lWr]).toEqual([0.7167, 0.5222]);
    expect(b[BP.rKn]).toBeUndefined();
    expect(bodyFromLandmarks(new Array(99).fill(0), 300, 900)).toBeNull();
  });
});
