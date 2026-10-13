import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Python half of the Blender film pipeline (plan / finish), checked from the test suite. Skipped where python3,
// numpy or Pillow are missing (they are needed by the pipeline anyway).
const BF = join(__dirname, '../../scripts/blenderfilm');
function py(code: string): unknown | null {
  try {
    return JSON.parse(
      execFileSync('python3', ['-c', code], {
        cwd: BF,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .trim()
        .split('\n')
        .pop()!,
    );
  } catch (e) {
    if (/ENOENT|ModuleNotFoundError|No module named/.test(String((e as { stderr?: string }).stderr ?? e)))
      return null;
    throw e;
  }
}

describe('PIPELINE BLENDER — finition (son, image, publication)', () => {
  it('captions file times, balanced hook lines, the grade keeps the picture', () => {
    const r = py(`
import json, numpy as np
from PIL import Image, ImageDraw
import finish
img = Image.new('RGB', (576, 1024), (120, 90, 60))
d = ImageDraw.Draw(img)
f = finish.font(43)
lines = finish.balanced_lines(d, 'Qui a mangé le poulet ?', f, 576 * 0.82)
g = np.asarray(finish.film_look(img, np.random.default_rng(1))).astype(float)
print(json.dumps({'srt': finish.srt_time(3723.5), 'lines': lines, 'size': list(g.shape), 'centre': g[512, 288].mean(), 'corner': g[5, 5].mean(), 'chunks': len(finish.chunks([['Qui', 0, 1], ['a', 1, 2], ['mangé', 2, 3], ['le', 3, 4], ['poulet', 4, 5]]))}))
`);
    if (!r) return;
    const o = r as {
      srt: string;
      lines: string[];
      size: number[];
      centre: number;
      corner: number;
      chunks: number;
    };
    expect(o.srt).toBe('01:02:03,500');
    expect(o.lines).toEqual(['Qui a mangé', 'le poulet ?']);
    expect(o.size).toEqual([1024, 576, 3]);
    expect(Math.abs(o.centre - 100)).toBeLessThan(25); // the grade does not wash the picture out
    expect(o.corner).toBeLessThan(o.centre); // vignette
    expect(o.chunks).toBe(2);
  });
  it('sound design: ambiences are finite and quiet, the room keeps the line length, the comic hits exist', () => {
    const r = py(`
import json, numpy as np
import plan
rng = np.random.default_rng(2)
amb = plan.ambience(['foule', 'oiseaux', 'circulation', 'vagues', 'cuisine', 'tele', 'annonces', 'enfants', 'ventilateur', 'insectes'], 6, rng)
v = np.sin(np.arange(48000) / 48000 * 2 * np.pi * 220).astype(np.float32) * 0.5
out = {k: len(plan.room(v, k, rng)) for k in ('piece', 'hall', 'exterieur', 'dry')}
print(json.dumps({'n': len(amb), 'finite': bool(np.isfinite(amb).all()), 'peak': float(np.abs(amb).max()), 'room': out, 'boom': len(plan.punch_sfx('boom')), 'pop': len(plan.punch_sfx('pop'))}))
`);
    if (!r) return;
    const o = r as {
      n: number;
      finite: boolean;
      peak: number;
      room: Record<string, number>;
      boom: number;
      pop: number;
    };
    expect(o.n).toBe(6 * 48000);
    expect(o.finite).toBe(true);
    expect(o.peak).toBeGreaterThan(0);
    for (const k of ['piece', 'hall', 'exterieur', 'dry']) expect(o.room[k]).toBe(48000);
    expect(o.boom).toBeGreaterThan(o.pop);
  });
});
