import { describe, expect, it } from 'vitest';
import { applyHands, handShapesFor, RELAXED } from '../../server/jev/studio/actor/hands';
import { JOINT_INDEX, SKELETON } from '../../server/jev/studio/actor/skeleton';
import { QI, qAngle, type Q } from '../../server/jev/studio/actor/math';

describe('hands (J2): shapes from the line, engine-joint curls before the retarget', () => {
  it('gesture / emotion words choose the shape; shock opens both hands', () => {
    expect(handShapesFor({ gesture: 'pointe le marché' })).toEqual({ l: 'relaxed', r: 'point' });
    expect(handShapesFor({ gesture: 'serre les poings', emotion: 'colère' })).toEqual({ l: 'fist', r: 'fist' });
    expect(handShapesFor({ gesture: 'salue' })).toEqual({ l: 'open', r: 'open' });
    expect(handShapesFor({ gesture: 'pouce levé' })).toEqual({ l: 'relaxed', r: 'thumb' });
    expect(handShapesFor({ react: 'choc', gesture: 'poing' })).toEqual({ l: 'open', r: 'open' });
    expect(handShapesFor({})).toEqual(RELAXED);
  });
  it('only the finger joints turn; a fist curls more than an open hand; left and right mirror; the blend is gradual', () => {
    const rest: Q[] = SKELETON.map(() => [...QI] as Q);
    const fist = applyHands(rest, { l: 'fist', r: 'fist' });
    const open = applyHands(rest, { l: 'open', r: 'open' });
    const li = JOINT_INDEX.get('l_index1')!;
    const ri = JOINT_INDEX.get('r_index1')!;
    expect(qAngle(fist[li]!)).toBeCloseTo(1.3, 5);
    expect(qAngle(open[li]!)).toBeCloseTo(0.04, 5);
    expect(fist[li]![2]).toBeCloseTo(-fist[ri]![2], 6); // mirrored about Z
    SKELETON.forEach((j, i) => {
      if (!/index|thumb/.test(j.name)) expect(fist[i]).toEqual(rest[i]);
    });
    const half = applyHands(rest, { l: 'fist', r: 'fist' }, RELAXED, 0.5);
    expect(qAngle(half[li]!)).toBeCloseTo((1.3 + 0.35) / 2, 5);
  });
});
