import { describe, expect, it } from 'vitest';
import { poseFromBody, worldRotZ } from '../../server/jev/studio/actor/pose2d';
import { BP, type SheetBody } from '../../server/jev/studio/actor/puppetMotion';
import { qRot, type V3 } from '../../server/jev/studio/actor/math';
import { jointIndex } from '../../server/jev/studio/actor/skeleton';

const near = (a: V3, b: V3, eps = 1e-6) => a.every((x, i) => Math.abs(x - b[i]!) < eps);
/** Left arm along +X in the picture = T-pose; arms down = hanging. */
const tpose: SheetBody = {
  [BP.nose]: [0.5, 0.1],
  [BP.lSh]: [0.6, 0.3],
  [BP.rSh]: [0.4, 0.3],
  [BP.lEl]: [0.75, 0.3],
  [BP.lWr]: [0.9, 0.3],
  [BP.rEl]: [0.25, 0.3],
  [BP.rWr]: [0.1, 0.3],
  [BP.lHip]: [0.56, 0.6],
  [BP.rHip]: [0.44, 0.6],
  [BP.lKn]: [0.56, 0.8],
  [BP.lAn]: [0.56, 1.0],
};
const down: SheetBody = { ...tpose, [BP.lEl]: [0.6, 0.45], [BP.lWr]: [0.6, 0.6], [BP.rEl]: [0.4, 0.45], [BP.rWr]: [0.4, 0.6] };

describe('pose du dessin', () => {
  it('a T-pose drawing is the rest pose', () => {
    const p = poseFromBody(tpose, 300, 300);
    for (const j of ['l_shoulder', 'l_elbow', 'r_shoulder', 'l_hip', 'spine1', 'head']) expect(near(qRot(p.rot[jointIndex(j)]!, [1, 0, 0]), [1, 0, 0])).toBe(true);
  });
  it('arms drawn hanging: the upper arms turn 90° about the picture axis, the forearms stay in line', () => {
    const p = poseFromBody(down, 300, 300);
    // Left arm: +X → −Y in the picture (y up).
    expect(near(qRot(worldRotZ(p, 'l_shoulder'), [1, 0, 0]), [0, -1, 0])).toBe(true);
    expect(near(qRot(worldRotZ(p, 'l_elbow'), [1, 0, 0]), [0, -1, 0])).toBe(true);
    expect(near(qRot(p.rot[jointIndex('l_elbow')]!, [1, 0, 0]), [1, 0, 0])).toBe(true);
    // Right arm: −X → −Y.
    expect(near(qRot(worldRotZ(p, 'r_shoulder'), [-1, 0, 0]), [0, -1, 0])).toBe(true);
  });
  it('a bent forearm is read relative to the upper arm; a lean leans the spine', () => {
    const bent: SheetBody = { ...down, [BP.lWr]: [0.75, 0.45] };
    const p = poseFromBody(bent, 300, 300);
    expect(near(qRot(worldRotZ(p, 'l_elbow'), [1, 0, 0]), [1, 0, 0], 1e-6)).toBe(true);
    const leaning: SheetBody = { ...tpose, [BP.lSh]: [0.7, 0.3], [BP.rSh]: [0.5, 0.3] };
    const q = poseFromBody(leaning, 300, 300);
    const up = qRot(worldRotZ(q, 'spine3'), [0, 1, 0]);
    expect(up[0]).toBeGreaterThan(0.2);
  });
});
