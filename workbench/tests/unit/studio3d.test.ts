import { describe, expect, it } from 'vitest';
import { blenderScript, normalizeScene, previewHtml, threeSceneCode } from '../../direct/lib/studio3dCore';

describe('3D studio', () => {
  const s = normalizeScene({
    title: 'Agence',
    objects: [
      { type: 'cube', name: 'Bâtiment', position: [1, 2, 3], color: '#005C83', spin: [0, 90, 0] },
      { type: 'sphere', opacity: 0.5, emissive: '#8CC63F' },
    ],
    lights: [{ type: 'sun', position: [5, 10, 7] }],
  });
  it('validates and fills defaults', () => {
    expect(s.objects[1]!.name).toBe('sphere_2');
    expect(s.camera!.fov).toBe(45);
    expect(() => normalizeScene({ objects: [] })).toThrow(/au moins un objet/);
    expect(() => normalizeScene({ objects: [{ type: 'teapot' }] })).toThrow(/type inconnu/);
  });
  it('builds the three.js scene and the preview', () => {
    const code = threeSceneCode(s);
    expect(code).toContain('new THREE.BoxGeometry(1,1,1)');
    expect(code).toContain('m.position.set(1,2,3)');
    expect(code).toContain('transparent:true,opacity:0.5');
    expect(previewHtml(s, '/*three*/')).toContain('GLTFExporter');
  });
  it('writes a Blender script in Z-up coordinates with materials and animation', () => {
    const py = blenderScript(s);
    expect(py).toContain('import bpy');
    expect(py).toContain('bpy.ops.mesh.primitive_cube_add(size=1)');
    expect(py).toContain('ob.location = (1, -3, 2)'); // (x, y, z) three → (x, −z, y) Blender
    expect(py).toContain('ob.keyframe_insert("rotation_euler"');
    expect(py).toContain('keyframe_new_interpolation_type = "LINEAR"');
    expect(py).toContain('bpy.ops.object.light_add(type="SUN"');
    expect(py).toContain('scene.camera = cam');
  });
});
