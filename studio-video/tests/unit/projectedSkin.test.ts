import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bakeProjection } from '../../navigateur/studio/projectedSkin';

/** A skinned box (one bone, identity), 0.4 m wide, 1 m tall, 0.3 m deep, standing on y = 0. */
function skinnedBox(): { root: THREE.Group; mesh: THREE.SkinnedMesh } {
  const geo = new THREE.BoxGeometry(0.4, 1, 0.3, 2, 4, 2).toNonIndexed();
  geo.translate(0, 0.5, 0);
  const n = geo.attributes.position!.count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Float32Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  const bone = new THREE.Bone();
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshToonMaterial());
  mesh.add(bone);
  mesh.bind(new THREE.Skeleton([bone]));
  const root = new THREE.Group();
  root.add(mesh);
  root.updateMatrixWorld(true);
  return { root, mesh };
}

describe('peau 2D : projection du dessin sur le corps', () => {
  it('front faces receive the drawing, back faces do not; the drawing frame covers the figure', () => {
    const { root, mesh } = skinnedBox();
    // A 200 × 500 drawing whose figure fills the picture.
    const bake = bakeProjection(root, { width: 200, height: 500 }, [0, 0, 1, 1]);
    expect(bake.frame.y1).toBeCloseTo(1, 6);
    expect(bake.frame.y0).toBeCloseTo(0, 6);
    expect(bake.frame.x1 - bake.frame.x0).toBeCloseTo(0.4, 6);
    const uv = mesh.geometry.getAttribute('projUv') as THREE.BufferAttribute;
    const vis = mesh.geometry.getAttribute('projVis') as THREE.BufferAttribute;
    const nrm = mesh.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    let front = 0;
    let back = 0;
    for (let i = 0; i < vis.count; i++) {
      const nz = nrm.getZ(i);
      if (nz > 0.9) {
        expect(vis.getX(i)).toBeGreaterThan(0.9);
        front++;
        // The projected coordinates follow the position: left edge → u = 0, top → v = 1.
        expect(uv.getX(i)).toBeCloseTo((pos.getX(i) + 0.2) / 0.4, 5);
        expect(uv.getY(i)).toBeCloseTo(pos.getY(i), 5);
      } else if (nz < -0.9) {
        expect(vis.getX(i)).toBe(0);
        back++;
      }
    }
    expect(front).toBeGreaterThan(0);
    expect(back).toBeGreaterThan(0);
    expect(bake.coverage).toBeGreaterThan(0.1);
    expect(bake.coverage).toBeLessThan(0.6);
  });
  it('a figure drawn in the middle of a larger picture is fitted on the model (height and centre)', () => {
    const { root } = skinnedBox();
    const bake = bakeProjection(root, { width: 1000, height: 1000 }, [0.3, 0.1, 0.7, 0.9]);
    // The figure spans 80 % of the picture height → the picture is 1.25 m tall, its top 0.1 × 1.25 above the head.
    expect(bake.frame.y1 - bake.frame.y0).toBeCloseTo(1.25, 6);
    expect(bake.frame.y1).toBeCloseTo(1 + 0.125, 6);
    expect((bake.frame.x0 + bake.frame.x1) / 2).toBeCloseTo(0, 6);
  });
});
