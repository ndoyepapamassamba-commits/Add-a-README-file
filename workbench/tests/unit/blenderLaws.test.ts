import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The laws the Blender film engine applies BEFORE generating and the conformity check verifies afterwards
// (scripts/blenderfilm: plausibility.py, casting.py, framing.py, style.py). Pure Python + numpy, no Blender needed.
const BF = join(__dirname, '../../scripts/blenderfilm');
function py(code: string): Record<string, unknown> | null {
  try {
    const out = execFileSync('python3', ['-c', code], {
      cwd: BF,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    return JSON.parse(out.trim().split('\n').pop()!);
  } catch (e) {
    if (/No module named 'numpy'|ENOENT/.test(String((e as { stderr?: string }).stderr ?? e))) return null;
    throw e;
  }
}

describe('Lois physiques et humaines (plausibility.py)', () => {
  it('gravity, proxemics and a talking pair placed face to face, never on top of each other', () => {
    const r = py(`
import json, plausibility as P
pos = P.layout([{'id': 0, 'w': 0.6, 'x': 0.1, 'y': 0.96, 'group': 'a', 'talk': True},
                {'id': 1, 'w': 0.55, 'x': 0.2, 'y': 0.96, 'group': 'a', 'talk': True}],
               [{'x': -0.4, 'y': 0, 'w': 0.6}, {'x': 0.4, 'y': -0.05, 'w': 0.6}], lambda y: (-2, 2), 1.25)
(x0, y0, f0), (x1, y1, f1) = pos[0], pos[1]
print(json.dumps({'air6': P.airtime(0.06), 'hopTop': P.hop(P.airtime(0.06) / 2, 0.06), 'hopAfter': P.hop(1.0, 0.06),
  'zone': P.zone(0.81), 'intime': P.zone(0.3), 'gap': abs(x1 - x0), 'depth': y0, 'faces': [f0, f1],
  'overlap': P.gap1d(P.core(x0, 0.6), P.core(x1, 0.55))}))`);
    if (!r) return;
    expect(r.air6 as number).toBeCloseTo(0.221, 2); // 6 cm jump = 0.22 s in the air (g = 9.81)
    expect(r.hopTop as number).toBeCloseTo(0.06, 3);
    expect(r.hopAfter).toBe(0);
    expect(r.zone).toBe('personnelle');
    expect(r.intime).toBe('intime');
    expect(r.gap as number).toBeGreaterThanOrEqual(0.75); // conversation distance (Hall)
    expect(r.gap as number).toBeLessThanOrEqual(1.2);
    expect(r.depth as number).toBeGreaterThanOrEqual(1.25); // social distance from the actors' conversation
    expect(r.faces).toEqual([1, -1]); // face to face
    expect(r.overlap as number).toBeGreaterThan(0); // their bodies never overlap
  });

  it('a background face glued to an actor face is a merger; behind the head or far away it is not', () => {
    const r = py(`
import json, plausibility as P
a = [(0.10, 0.40), (0.65, 0.30)]
print(json.dumps({'fusion': P.face_conflict((0.17, 0.45), a, 0.07, False, 0.64), 'hidden': P.face_conflict((0.11, 0.41), a, 0.07, False, 0.64),
  'far': P.face_conflict((0.17, 0.45), a, 0.07, True, 0.4), 'eyeline': P.face_conflict((0.38, 0.36), a, 0.07, False, 0.6),
  'free': P.face_conflict((0.9, 0.8), a, 0.07, False, 0.6)}))`);
    if (!r) return;
    expect(r.fusion).toBe('fusion');
    expect(r.hidden).toBe('');
    expect(r.far).toBe('');
    expect(r.eyeline).toBe('regard');
    expect(r.free).toBe('');
  });
});

describe('Casting des figurants (casting.py)', () => {
  it('an extra must belong to the place and its drawn action must be possible there', () => {
    const r = py(`
import json, casting as C
market = {'Marché'}
print(json.dumps({
  'selfieGirlAtMarket': C.verdict({'lieux': ['Maquis', 'Plage'], 'activite': 'se prend en selfie'}, market, 'foule'),
  'hairdresserAtMarket': C.verdict({'lieux': ['Salon de coiffure', 'Marché'], 'activite': 'coiffe une cliente, sèche-cheveux à la main'}, market, 'discute'),
  'cookWalking': C.verdict({'lieux': ['Marché'], 'activite': 'remue une grande marmite fumante'}, market, 'passe'),
  'cookWorking': C.verdict({'lieux': ['Marché'], 'activite': 'remue une grande marmite fumante'}, market, 'travaille'),
  'vendor': C.verdict({'lieux': ['Marché'], 'activite': 'porte une bassine d attiéké sur la tête en criant les prix'}, market, 'passe'),
  'job': C.role_match({'activite': 'compte ses billets derrière son étal'}, 'vendeuse qui crie ses prix')}))`);
    if (!r) return;
    expect((r.selfieGirlAtMarket as [boolean, string])[0]).toBe(false);
    expect((r.selfieGirlAtMarket as [boolean, string])[1]).toMatch(/ne fréquente pas/);
    expect((r.hairdresserAtMarket as [boolean, string])[0]).toBe(false);
    expect((r.cookWalking as [boolean, string])[0]).toBe(false);
    expect((r.cookWorking as [boolean, string])[0]).toBe(true);
    expect((r.vendor as [boolean, string])[0]).toBe(true);
    expect(r.job).toBe(1);
  });
});

describe('Cadrage exact et peinture non déformée (framing.py)', () => {
  it('from the painting viewpoint the set is seen as painted; a dolly away stretches it', () => {
    const r = py(`
import json, numpy as np, framing as F
dn = np.ones((61, 81)); dn[20:40, 30:50] = 0.2   # a near block on a far wall: a depth edge
g = {'C0': [0, -2.4, 1.0], 'Yp': 0.35, 'DEPTH': 2.4, 'x0': -2.0, 'Wm': 4.0, 'ztop': 2.4, 'mH': 2.3, 'EX': 0.35, 'EZ': 0.3, 'dn': dn}
th, tv, ox, oz = F.lens_view(100, 0.0, 0.0, 'VERTICAL', 9 / 16)
at_c0 = F.decor_distortion(g, (0, -2.4, 1.0, ox, oz), th, tv)
moved = F.decor_distortion(g, (0.4, -1.0, 1.4), 0.25, 0.44)
over_in = max(F.view_overflow(g, (0, -2.4, 1.0, ox, oz), th, tv))
over_out = max(F.view_overflow(g, (1.9, -2.4, 1.0), 0.3, 0.5))
th2, tv2, ox2, oz2 = F.lens_view(50, 0.1, 0.0, 'HORIZONTAL', 9 / 16)
print(json.dumps({'shareC0': at_c0[0], 'p95C0': at_c0[1], 'shareMoved': moved[0], 'overIn': over_in, 'overOut': over_out, 'shiftUnit': ox2 / (2 * th2)}))`);
    if (!r) return;
    expect(r.shareC0).toBe(0);
    expect(r.p95C0 as number).toBeCloseTo(1, 6);
    expect(r.shareMoved as number).toBeGreaterThan(0);
    expect(r.overIn).toBe(0);
    expect(r.overOut as number).toBeGreaterThan(0);
    expect(r.shiftUnit as number).toBeCloseTo(0.1, 6); // horizontal fit: shift in units of the frame WIDTH (Blender)
  });
});

describe('Style des décors (style.py)', () => {
  it('a flat render is measured as flat, a textured one is not; the grade moves toward the troupe', () => {
    const r = py(`
import json, numpy as np, style as S
rng = np.random.default_rng(1)
flat = np.full((200, 200, 3), 0.5)
tex = np.clip(0.5 + 0.15 * rng.standard_normal((200, 200, 3)), 0, 1)
sf, st = S.signature(flat), S.signature(tex)
ref = {k: {'median': v, 'p10': v * 0.8, 'p90': v * 1.2} for k, v in st.items()}
dull = np.clip(0.5 + 0.03 * rng.standard_normal((200, 200, 3)), 0, 1)
g, gains = S.grade(dull, S.signature(dull), ref)
print(json.dumps({'flatAplats': sf['aplats'], 'texAplats': st['aplats'], 'flatDetail': sf['detail'], 'texDetail': st['detail'],
  'satGain': gains['saturation'], 'inBand': S.compare(st, ref)['aplats'][3], 'flatOut': S.compare(sf, ref)['aplats'][3]}))`);
    if (!r) return;
    expect(r.flatAplats).toBe(1);
    expect(r.texAplats as number).toBeLessThan(0.05);
    expect(r.flatDetail as number).toBeLessThan(r.texDetail as number);
    expect(r.satGain as number).toBeGreaterThan(1);
    expect(r.inBand).toBe(true);
    expect(r.flatOut).toBe(false);
  });
});
