import { describe, expect, it } from 'vitest';
import { DOCS, ragContext, searchDocs } from '../../coeur/lab3d/rag';
import {
  extractCode,
  feedbackFor,
  generateWithCorrection,
  linesAround,
  type LabRun,
} from '../../coeur/lab3d/selfCorrect';

const STATS = { meshes: 1, triangles: 12, drawCalls: 1, bodies: 0, programs: 1 };
const ok = (meshes = 1): LabRun => ({ ok: true, errors: [], warnings: [], stats: { ...STATS, meshes } });

describe('RAG TECHNIQUE LOCAL', () => {
  it('finds the right card for a real error message', () => {
    expect(searchDocs('THREE.Geometry is not a constructor')[0]!.doc.id).toMatch(
      /three-geometry|three-errors/,
    );
    expect(searchDocs('renderer.outputEncoding sRGBEncoding')[0]!.doc.id).toBe('three-colorspace');
    expect(
      searchDocs("ERROR: 0:12: '=' : cannot convert from 'const int' to 'highp float' glsl")[0]!.doc.id,
    ).toBe('glsl-basics');
    expect(searchDocs('balle qui rebondit physique cannon restitution')[0]!.doc.id).toBe('cannon-basics');
    expect(searchDocs('export glb compression draco')[0]!.doc.id).toBe('gltf-export');
    expect(searchDocs('zzzz qqqq')).toEqual([]);
  });
  it('always injects the sandbox API, then the relevant cards', () => {
    const c = ragContext('shader de feu avec bruit fbm', 2);
    expect(c).toContain('API du bac à sable');
    expect(c).toContain('bruit procédural');
    expect(DOCS.every((d) => d.text.length > 80)).toBe(true);
  });
});

describe('AUTO-CORRECTION 3D', () => {
  it('extracts the code block and shows the faulty line in context', () => {
    expect(extractCode('Voici :\n```js\nconst a = 1;\n```\nfin')).toBe('const a = 1;');
    expect(extractCode('const b = 2;')).toBe('const b = 2;');
    expect(linesAround('a\nb\nc\nd\ne', 3, 1)).toBe('     2 | b\n>>   3 | c\n     4 | d');
  });
  it('feeds the real error back with docs and stops as soon as the scene renders', async () => {
    const seen: string[][] = [];
    const answers = [
      '```js\nconst g = new THREE.Geometry();\nscene.add(new THREE.Mesh(g));\n```',
      '```js\nconst g = new THREE.BoxGeometry(1,1,1);\nscene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial()));\n```',
    ];
    const r = await generateWithCorrection({
      prompt: 'un cube',
      generate: async (m) => {
        seen.push(m.map((x) => x.content));
        return answers[seen.length - 1]!;
      },
      run: async (code) =>
        code.includes('THREE.Geometry(')
          ? {
              ok: false,
              errors: [{ kind: 'runtime', msg: 'THREE.Geometry is not a constructor', line: 1 }],
              warnings: [],
              stats: { ...STATS, meshes: 0 },
            }
          : ok(),
    });
    expect(r.ok).toBe(true);
    expect(r.rounds).toHaveLength(2);
    const fb = seen[1]!.at(-1)!;
    expect(fb).toContain('THREE.Geometry is not a constructor');
    expect(fb).toContain('>>   1 | const g = new THREE.Geometry();');
    expect(fb).toContain('BufferGeometry');
    expect(seen[0]![0]).toContain('DOCUMENTATION TECHNIQUE');
  });
  it('an empty scene is a failure; after maxRounds the last attempt is returned as not ok', async () => {
    expect(feedbackFor('x', ok(0))).toContain('aucun mesh');
    let n = 0;
    const r = await generateWithCorrection({
      prompt: 'x',
      maxRounds: 3,
      generate: async () => `\`\`\`js\n// essai ${++n}\n\`\`\``,
      run: async () => ok(0),
    });
    expect(r.ok).toBe(false);
    expect(r.rounds).toHaveLength(3);
    expect(r.code).toBe('// essai 3');
  });
});
