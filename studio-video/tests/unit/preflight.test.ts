import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// PREFLIGHT QA (blender/film/preflight.py) on real Blender scenes: a trapped one must be blocked with every fault
// named, a clean one must pass. Skipped where the bpy module is not installed.
const BF = join(__dirname, '../../blender/film');
function blender(code: string): Record<string, unknown> | null {
  try {
    const out = execFileSync('python3', ['-c', code], {
      cwd: BF,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
    });
    return JSON.parse(
      out
        .trim()
        .split('\n')
        .filter((l) => l.startsWith('{'))
        .pop()!,
    );
  } catch (e) {
    if (/No module named 'bpy'|ENOENT/.test(String((e as { stderr?: string }).stderr ?? e))) return null;
    throw e;
  }
}
const SETUP = `
import bpy, json, sys, preflight
bpy.ops.wm.read_factory_settings(use_empty=True)
def box(name, x0, x1, y0, y1, z0, z1, bevel=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (x1 - x0, y1 - y0, z1 - z0)
    bpy.ops.object.transform_apply(scale=True)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    ob.data.materials.append(m)
    if bevel:
        ob.modifiers.new('bevel', 'BEVEL')
    return ob
bpy.data.lights.new('l', 'POINT')
lo = bpy.data.objects.new('lamp', bpy.data.lights['l'])
bpy.context.scene.collection.objects.link(lo)
lo.location = (0, 0, 2.5)
box('planks', -3, 3, -3, 3, -0.1, 0)
box('plasterceiling', -3, 3, -3, 3, 2.9, 3.0)
`;

describe('PREFLIGHT QA — contrôle de conformité 3D obligatoire', () => {
  it('a trapped scene is BLOCKED and every fault is named; safe fixes are applied; HTML report written', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'pf-')), 'rapport');
    const r = blender(`${SETUP}
box('plasterwallL', -3.1, -3, -3, 3, 0, 2.9, bevel=True)       # bevelled shell → light leak (auto-fixed)
box('woodbed', 0, 3.5, 0, 1.6, 0, 0.5)                         # 3.5 m bed → unrealistic size
box('woodtable', 3.0, 4.0, 0.2, 1.2, 0, 0.45)                  # half inside the bed → interpenetration
box('woodbox', 1.0, 1.4, 0.4, 0.8, 0.1, 0.3)                   # entirely inside the bed → hidden object
box('woodnight', -2, -1.5, 0, 0.5, 0.3, 0.8)                   # floating 30 cm above the floor
t = box('poster', -1, 0, 2.9, 2.95, 1, 2)
m = t.data.materials[0]
n = m.node_tree.nodes.new('ShaderNodeTexImage')
img = bpy.data.images.new('affiche', 4, 4)
img.source = 'FILE'
img.filepath = '/nonexistent/affiche.png'
n.image = img
story = {'cast': [{'id': 'z', 'name': 'ZORGLUB', 'height': 1.7}], 'beats': [{'who': 'z', 'text': 'Bonjour'}, {'who': 'q', 'text': ''}], 'hook': ''}
life = {'grade': 'jour', 'animals': [{'species': 'chat', 'behavior': 'dort sur le lit'}], 'objets': [], 'kit': None}
res = preflight.run('test', 'piège', story=story, life=life, out='${out}', render_checks=False)
print(json.dumps(res))
`);
    if (!r) return;
    const res = r as {
      passed: boolean;
      verdict: string;
      score: number;
      issues: { categorie: string; severite: string; message: string; objet?: string }[];
      fixes: string[];
    };
    expect(res.passed).toBe(false);
    expect(res.verdict).toBe('bloqué');
    const has = (cat: string, re: RegExp) =>
      res.issues.some((i) => i.categorie === cat && re.test(`${i.message} ${i.objet ?? ''}`));
    expect(has('materiaux', /texture introuvable/)).toBe(true);
    expect(has('echelle', /taille irréaliste.*woodbed|woodbed.*taille irréaliste|3\.50/)).toBe(true);
    expect(has('collisions', /interpénètrent/)).toBe(true);
    expect(has('objets', /objet caché.*woodbed/)).toBe(true);
    expect(has('collisions', /flotte/)).toBe(true);
    expect(has('narratif', /ZORGLUB/)).toBe(true);
    expect(has('narratif', /locuteur hors distribution/)).toBe(true);
    expect(has('narratif', /pas d’accroche/)).toBe(true);
    expect(has('narratif', /dort sur le lit.*pas de lit|pas de lit/)).toBe(false); // the scene HAS a bed (woodbed)
    expect(res.fixes.join(' ')).toMatch(/plasterwallL : chanfrein retiré/);
    expect((res as unknown as { conforme_des_la_generation: boolean }).conforme_des_la_generation).toBe(
      false,
    );
    expect(readFileSync(`${out}.html`, 'utf8')).toContain('des objectifs atteints');
    expect(JSON.parse(readFileSync(`${out}.json`, 'utf8')).verdict).toBe('bloqué');
  });
  it('a clean furnished room passes, with real-time budgets and the rig check measured', () => {
    const r = blender(`${SETUP}
box('plasterback', -3, 3, 3, 3.1, 0, 2.95)
box('woodbed', 0.2, 2.3, 1.0, 3.0, 0, 0.5)
box('woodnight', -0.4, 0.1, 2.5, 3.0, 0, 0.55)
arm = bpy.data.armatures.new('rig')
ao = bpy.data.objects.new('rig', arm)
bpy.context.scene.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao
bpy.ops.object.mode_set(mode='EDIT')
b = arm.edit_bones.new('root'); b.head = (0, 0, 0); b.tail = (0, 0, 1)
bpy.ops.object.mode_set(mode='OBJECT')
story = {'cast': [{'id': 'b', 'name': 'BAYE NDIAYE', 'height': 1.72}], 'beats': [{'who': 'b', 'text': 'Qui a mangé le poulet ?'}], 'hook': 'Le poulet', 'punch': {'beat': 0}}
res = preflight.run('test', 'propre', story=story, life={'grade': 'jour', 'animals': [], 'objets': ['lit'], 'kit': None}, render_checks=False)
print(json.dumps(res))
`);
    if (!r) return;
    const res = r as {
      passed: boolean;
      score: number;
      verdict: string;
      issues: { severite: string; message: string }[];
      stats: Record<string, unknown>;
    };
    expect(res.passed).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(80);
    expect(res.issues.filter((i) => i.severite === 'majeur' || i.severite === 'critique')).toEqual([]);
    expect(res.stats.temps_reel).toMatchObject({ lumieres: 1 });
    expect(res.stats.budget_pc).toBe('respecté');
    expect(res.stats.animation).toMatchObject({ armatures: 1 });
    // The report demonstrates the objectives: measured dimensions, objective rate, right at the first generation.
    const o = res as unknown as {
      taux_objectifs: number;
      conforme_des_la_generation: boolean;
      dimensions: Record<string, number | null>;
      objectifs: { objectif: string; atteint: boolean }[];
    };
    expect(o.conforme_des_la_generation).toBe(true);
    expect(o.dimensions.personnages).toBe(100);
    expect(o.dimensions.recit).toBe(100);
    expect(o.dimensions.environnement).toBe(100);
    expect(o.dimensions.stabilite).toBe(100);
    expect(o.dimensions.performances).toBe(100);
    expect(o.objectifs[0]).toMatchObject({ atteint: true });
    expect(o.taux_objectifs).toBeGreaterThan(50);
  });
});
