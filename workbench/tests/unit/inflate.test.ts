import { describe, expect, it } from 'vitest';
import { gridMesh } from '../../server/jev/studio/actor/arap';
import { contourOf, inflateMesh, inflatedSolid } from '../../server/jev/studio/actor/inflate';
import { bonesFromBody, heatWeights } from '../../server/jev/studio/actor/boneHeat';
import { BP, type SheetBody } from '../../server/jev/studio/actor/puppetMotion';
import { matchBones } from '../../server/jev/studio/actor/rig3d';

/** A stick figure: a round head, a torso, two arms out, two legs (px, 200 × 400). */
const W = 200;
const H = 400;
const figure = (x: number, y: number) => {
  if (Math.hypot(x - 100, y - 50) < 32) return true; // head
  if (x > 70 && x < 130 && y > 80 && y < 230) return true; // torso
  if (y > 95 && y < 125 && x > 10 && x < 190) return true; // arms (T)
  if (y >= 230 && y < 390 && ((x > 72 && x < 98) || (x > 102 && x < 128))) return true; // legs
  return false;
};
const body: SheetBody = {
  [BP.nose]: [0.5, 0.13],
  [BP.lEye]: [0.54, 0.11],
  [BP.rEye]: [0.46, 0.11],
  [BP.lSh]: [0.62, 0.27],
  [BP.rSh]: [0.38, 0.27],
  [BP.lEl]: [0.8, 0.27],
  [BP.rEl]: [0.2, 0.27],
  [BP.lWr]: [0.93, 0.27],
  [BP.rWr]: [0.07, 0.27],
  [BP.lHip]: [0.58, 0.57],
  [BP.rHip]: [0.42, 0.57],
  [BP.lKn]: [0.58, 0.77],
  [BP.rKn]: [0.42, 0.77],
  [BP.lAn]: [0.58, 0.96],
  [BP.rAn]: [0.42, 0.96],
};

describe('gonflage du dessin', () => {
  const m = gridMesh(figure, W, H, 5, 1);
  const r = inflateMesh(m, 0.8);
  it('the contour has no thickness, the middle of a part is the thickest, the volume is closed and sewn', () => {
    const n = m.rest.length / 2;
    const contour = contourOf(m);
    let maxZ = 0;
    let torsoMid = 0;
    let armMid = 0;
    for (let i = 0; i < n; i++) {
      if (contour[i]) expect(r.z[i]).toBe(0);
      maxZ = Math.max(maxZ, r.z[i]!);
      const x = m.rest[i * 2]!;
      const y = m.rest[i * 2 + 1]!;
      if (x === 100 && y === 180) torsoMid = r.z[i]!;
      if (x === 40 && y === 110) armMid = r.z[i]!;
    }
    // The torso (60 px wide) is thicker than an arm (30 px) and about depth × half-width.
    expect(torsoMid).toBeGreaterThan(armMid);
    expect(torsoMid).toBeGreaterThan(0.8 * 30 * 0.6);
    expect(torsoMid).toBeLessThan(0.8 * 30 * 1.3);
    expect(maxZ).toBeLessThan(60);
    // Normals: unit, facing the viewer in the middle, leaning outward near the edge.
    const at = (x: number, y: number) => {
      for (let i = 0; i < n; i++) if (m.rest[i * 2] === x && m.rest[i * 2 + 1] === y) return i;
      return -1;
    };
    const c = at(100, 180);
    expect(Math.hypot(r.nrm[c * 3]!, r.nrm[c * 3 + 1]!, r.nrm[c * 3 + 2]!)).toBeCloseTo(1, 5);
    expect(r.nrm[c * 3 + 2]).toBeGreaterThan(0.95);
    const e = at(75, 180); // near the torso's left edge → normal leans to −x
    expect(r.nrm[e * 3]).toBeLessThan(-0.3);
    const s = inflatedSolid(m, r, W, H);
    // Closed: no edge is left open (2 triangles; 4 on the rim diagonals, where the two sides pinch to zero thickness).
    const edges = new Map<string, number>();
    for (let t = 0; t < s.idx.length / 3; t++)
      for (let k = 0; k < 3; k++) {
        const a = s.idx[t * 3 + k]!;
        const b = s.idx[t * 3 + ((k + 1) % 3)]!;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    expect([...edges.values()].every((c) => c === 2 || c === 4)).toBe(true);
    expect([...edges.values()].filter((c) => c === 4).length / edges.size).toBeLessThan(0.2);
    expect(s.frontCount).toBe(n);
    // Back vertices mirror the front ones (same x, y; opposite z).
    for (let b = 0; b < s.mirror.length; b++) {
      const f = s.mirror[b]!;
      const j = n + b;
      expect(s.pos[j * 3]).toBe(s.pos[f * 3]);
      expect(s.pos[j * 3 + 2]).toBeCloseTo(-s.pos[f * 3 + 2]!, 6);
    }
  });
  it('bone heat: each part follows its own bone, the blends sit at the joints, the names are recognised by rig3d', () => {
    const bones = bonesFromBody(body, W, H)!;
    expect(bones.map((b) => b.name)).toEqual(expect.arrayContaining(['Hips', 'Spine', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightUpLeg', 'RightLeg', 'RightFoot']));
    const map = matchBones(bones.map((b) => ({ name: b.name, parent: b.parent })));
    expect(bones[map.head!]!.name).toBe('Head');
    expect(bones[map.l_elbow!]!.name).toBe('LeftForeArm');
    expect(bones[map.r_knee!]!.name).toBe('RightLeg');
    const sw = heatWeights(m, bones, figure);
    const n = m.rest.length / 2;
    const name = (i: number) => bones[sw.idx[i * 4]!]!.name;
    const at = (x: number, y: number) => {
      for (let i = 0; i < n; i++) if (m.rest[i * 2] === x && m.rest[i * 2 + 1] === y) return i;
      return -1;
    };
    expect(name(at(100, 40))).toBe('Head');
    expect(name(at(190, 110))).toBe('LeftHand');
    expect(name(at(170, 110))).toBe('LeftForeArm');
    expect(name(at(10, 110))).toBe('RightHand');
    expect(name(at(85, 350))).toBe('RightLeg');
    expect(name(at(115, 250))).toBe('LeftUpLeg');
    // Weights sum to one, the dominant weight far from any joint is nearly pure.
    for (let i = 0; i < n; i++) expect(sw.w[i * 4]! + sw.w[i * 4 + 1]! + sw.w[i * 4 + 2]! + sw.w[i * 4 + 3]!).toBeCloseTo(1, 5);
    expect(sw.w[at(170, 110) * 4]).toBeGreaterThan(0.8);
    // At the elbow the arm and the forearm share the vertex.
    const el = at(160, 110);
    const names = [0, 1].map((k) => bones[sw.idx[el * 4 + k]!]!.name);
    expect(names).toEqual(expect.arrayContaining(['LeftArm', 'LeftForeArm']));
    expect(sw.w[el * 4 + 1]).toBeGreaterThan(0.15);
  });
});
