const test = require('node:test');
const assert = require('node:assert');
const FaceRig = require('../js/55-facerig.js');

test('delaunay : carré + centre → 4 triangles, orientation cohérente', () => {
  const tris = FaceRig.delaunay([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]]);
  assert.strictEqual(tris.length, 4);
  tris.forEach(t => assert.ok(t.includes(4)));
});

test('delaunay : points aléatoires → nombre de triangles = 2n - 2 - h (enveloppe convexe)', () => {
  const pts = []; let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 120; i++) pts.push([r() * 500, r() * 900]);
  const tris = FaceRig.delaunay(pts);
  assert.ok(tris.length > 200 && tris.length < 240, 'tris=' + tris.length);
  // chaque triangle est non dégénéré
  tris.forEach(([a, b, c]) => { const A = pts[a], B = pts[b], C = pts[c]; const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])); assert.ok(area > 1e-6); });
});

test('fromAnchors + metrics : gabarit plausible', () => {
  const pts = FaceRig.fromAnchors({ leftEye: [400, 500], rightEye: [600, 500], mouth: [500, 700] });
  assert.strictEqual(pts.length, 478);
  const m = FaceRig.metrics(pts);
  assert.ok(m.bbox.w > 150 && m.bbox.h > 200, JSON.stringify(m.bbox));
  assert.ok(Math.abs(m.mouthC[0] - 500) < 2);
  assert.ok(m.mouthC[1] > 650 && m.mouthC[1] < 750);
  assert.ok(m.mouthW > 100);
});

test('buildMesh : points dynamiques, triangles dynamiques, lookup', () => {
  const face = FaceRig.fallbackFace(1080, 1920);
  const mesh = FaceRig.buildMesh([face], 1080, 1920);
  assert.ok(mesh.points.length > FaceRig.CONTROL.length);
  assert.ok(mesh.tris.length > 100);
  assert.ok(mesh.dynTris.length < mesh.tris.length);
  assert.ok(mesh.dynTris.length > 50);
  const iChin = mesh.lookup[0].get(FaceRig.IDX.CHIN);
  assert.ok(iChin != null && mesh.dyn[iChin] === 1);
  // deux visages
  const two = FaceRig.buildMesh([FaceRig.fallbackFace(1080, 1920, 'left'), FaceRig.fallbackFace(1080, 1920, 'right')], 1080, 1920);
  assert.strictEqual(two.lookup.length, 2);
  assert.ok(two.lookup[1].get(FaceRig.IDX.CHIN) != null);
});
