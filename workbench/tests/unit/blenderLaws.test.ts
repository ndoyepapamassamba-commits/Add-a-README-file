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

describe('Sol praticable et ombres (ground.py)', () => {
  it('feet over the produce are refused; behind a stall with the head seen is natural occlusion; the forestage carries the actors', () => {
    const r = py(`
import json, numpy as np, ground as G
# A painted set: a near stall (bright depth) on its lower half, a far wall above; no painted floor at all.
dn = np.full((61, 81), 0.1); dn[30:, :] = 1.0
g = {'C0': [0, -2.4, 1.0], 'Yp': 0.35, 'DEPTH': 2.4, 'x0': -2.0, 'Wm': 4.0, 'ztop': 2.4, 'mH': 2.3, 'EX': 0.35, 'EZ': 0.3, 'dn': dn,
     'fl': np.zeros((61, 81), bool)}
stage = {'x0': -4, 'x1': 4, 'y0': -2.1, 'y1': 0.348}
behind = G.stance(g, 0.0, 1.3, 1.7)            # an adult behind the stall: legs hidden, head above it
child = G.stance(g, 0.0, 1.3, 0.5)             # too small: swallowed whole
front = G.stance(g, 0.0, 0.1, 1.7, stage)      # on the 3D forestage
g2 = dict(g); g2['dn'] = np.full((61, 81), 0.05)  # a far wall everywhere, still no floor: feet seen over a wall
vide = G.stance(g2, 0.0, 1.3, 1.7)
g3 = dict(g2); g3['fl'] = np.ones((61, 81), bool)  # the same wall area recognised as painted floor
peint = G.stance(g3, 0.0, 1.3, 1.7)
print(json.dumps({'behind': [behind['pieds'], behind['tete'], G.legal(behind)], 'child': [child['pieds'], child['tete'], G.legal(child)],
  'front': [front['pieds'], G.legal(front, animal=True)], 'vide': [vide['pieds'], G.legal(vide)], 'peint': [peint['pieds'], G.legal(peint, animal=True)],
  'henBehind': G.legal(behind, animal=True)}))`);
    if (!r) return;
    expect(r.behind).toEqual(['cache', true, true]);
    expect(r.child).toEqual(['cache', false, false]);
    expect(r.front).toEqual(['avant-scene', true]);
    expect(r.vide).toEqual(['vide', false]);
    expect(r.peint).toEqual(['sol-peint', true]);
    expect(r.henBehind).toBe(false); // an animal must be SEEN on a floor
  });

  it('a lateral light needs agreeing painted people; shadows fall away from the light; the floor kind follows the place', () => {
    const r = py(`
import json, numpy as np, ground as G
H, W = 200, 400
rgb = np.full((H, W, 3), 0.5); lab = np.zeros((H, W), np.uint8)
for k in range(4):  # four painted people lit from the right (their right third brighter)
    x0 = 40 + 90 * k
    lab[60:180, x0:x0 + 40] = G.PERSON
    rgb[60:180, x0:x0 + 13] = 0.35; rgb[60:180, x0 + 27:x0 + 40] = 0.75
lat = G.scene_light(rgb, lab)
one = G.scene_light(rgb, np.where(np.arange(W)[None, :] < 90, lab, 0))
dx, dy = G.shadow_vector(lat['sign'], lat['strength'])
quad = G.shadow_quad(-0.2, 0.2, 0.0, 1.7, 0.0, (dx, dy))
print(json.dumps({'lat': lat['mode'], 'sign': lat['sign'], 'one': one['mode'], 'dx': dx, 'dy': dy, 'feet': quad[0][:2], 'head': quad[2][:2],
  'kinds': [G.floor_kind(p) for p in ('Marché', 'Salon', 'Taxi', 'Plage', 'Tribunal')]}))`);
    if (!r) return;
    expect(r.lat).toBe('laterale');
    expect(r.sign).toBe(1);
    expect(r.one).toBe('frontale'); // one figure is not evidence
    expect(r.dx as number).toBeLessThan(0); // light from the right: the shadow goes left
    expect(r.dy as number).toBeGreaterThan(0); // and toward the back of the set
    expect(r.feet).toEqual([-0.2, 0]); // the shadow starts at the feet
    expect((r.head as number[])[0]).toBeLessThan(0.2);
    expect(r.kinds).toEqual(['terre', 'carrelage', 'bitume', 'sable', 'parquet']);
  });
});

describe('Geste et récit (gesture.py)', () => {
  it('a drawn pointing arm that misses the partner is replayed by the closest pose, and a line that relied on it names the target', () => {
    const r = py(`
import json, os, tempfile, numpy as np, gesture as G
from PIL import Image
d = tempfile.mkdtemp()
def drawing(name):
    a = np.zeros((400, 200, 4), np.uint8); a[40:395, 60:140] = 255; Image.fromarray(a).save(os.path.join(d, name)); return name
body = {'shL': [80, 110, 1], 'shR': [120, 110, 1], 'elR': [150, 90, 1], 'wrR': [185, 40, 1], 'hipL': [85, 220, 1], 'hipR': [115, 220, 1],
        'anL': [90, 395, 1], 'anR': [110, 395, 1]}
face = {'nose': [108, 70], 'eyes': [{'c': [95, 62]}, {'c': [115, 62]}], 'chin': [100, 95]}
poses = [{'kind': k, 'png': drawing(k + '.png'), 'h': 400, 'body': body, 'face': face} for k in ('neutre', 'accuse', 'haussement')]
rig = {'cast': {'AMI': {'poses': poses}, 'VOISINE': {'poses': poses}}}
story = {'cast': [{'id': 'ami', 'name': 'AMI'}, {'id': 'voisine', 'name': 'VOISINE'}],
         'beats': [{'who': 'ami', 'pose': 'accuse', 'text': 'Toi, là ! Rends-moi mes tomates.'}, {'who': 'voisine', 'pose': 'neutre', 'text': 'Quelles tomates ?'}]}
out = G.adapt_story(story, rig, d, {'AMI': 1.7, 'VOISINE': 1.6})
print(json.dumps({'n': len(out), 'pose': story['beats'][0]['pose'], 'text': story['beats'][0]['text'], 'note': bool(story['beats'][0].get('adaptation')),
  'aim': G.pointing_ok({'point': {'E': (0.1, 1.2), 'T': (0.5, 1.4)}}, -0.4, (0.0, 1.5), 0.4)[0]}))`);
    if (!r) return;
    expect(r.n).toBe(1);
    expect(r.pose).toBe('haussement'); // an accusation the drawing cannot aim becomes indignation
    expect(r.text).toMatch(/^Toi, là, Voisine !/); // the words that pointed now name the person
    expect(r.note).toBe(true);
    expect(r.aim).toBe(true); // a line elbow → fingertip that meets the partner's face is accepted
  });
});

describe('Ton et voix de la chaîne (tone.py, plan.py)', () => {
  it('lines are placed with the measured silences: tight turns, a short beat before the punchline, breaths between exchanges', () => {
    const r = py(`
import json, tone as T
ref = {'_mesure': True, 'rythme': {'tour_de_parole_s': 0.26, 'silence_avant_chute_p75_s': 0.40, 'repliques_par_blague': 3,
       'entre_blagues_s': 3.52, 'entre_blagues_p75_s': 5.01, 'rire_s': 4.73}, 'voix': {}, 'piper': {}}
tl, rep = T.schedule([2.0] * 6, 4, 0, ref)
gaps = [round(b['speak0'] - a['speak1'], 2) for a, b in zip(tl, tl[1:])]
tl60, rep60 = T.schedule([2.0] * 6, 4, 25, ref)
old = T.timing(T.DEFAULT | {'_mesure': False})
print(json.dumps({'gaps': gaps, 'end60': round(tl60[-1]['end'], 2), 'spread': rep60['etale_s'],
  'breath60': round(tl60[3]['speak0'] - tl60[2]['speak1'], 2), 'oldTurn': round(old['lead'] + old['tail'], 2)}))`);
    if (!r) return;
    expect(r.gaps).toEqual([0.26, 0.26, 3.78, 0.4, 1.51]); // turn, turn, breath between exchanges, beat before the punch, reaction after it
    expect(r.end60).toBeCloseTo(25, 1); // the asked duration is kept
    // The spare time first widens the breaths up to the measured upper quartile (5.01 s + the turn), then the reaction
    // after the punchline (a laugh's length); only the small remainder is spread over every line.
    expect(r.breath60 as number).toBeGreaterThanOrEqual(5.27);
    expect(r.breath60 as number).toBeLessThan(5.4);
    expect(r.spread as number).toBeLessThan(0.5);
    expect(r.oldTurn).toBe(0.8); // without a measurement, the former fixed silence
  });

  it('each voice gains the channel melody range of its sex; a child keeps its pitch; a voice without nasal vowels is replaced', () => {
    const r = py(`
import json, os, tempfile, numpy as np, tone as T, plan as P
ref = {'voix': {'homme': {'f0': 229.0, 'etendue_relative': 0.516}, 'femme': {'f0': 306.9, 'etendue_relative': 0.512}},
       'piper': {'tom': {'f0': 131.0, 'etendue_relative': 0.233}, 'jessica': {'f0': 230.0, 'etendue_relative': 0.30}}}
man = T.targets({'genre': 'homme', 'age': 40}, 'tom', ref)
kid = T.targets({'genre': 'garçon', 'age': 9, 'pitch': 1.2}, 'jessica', ref)
sr = 22050; t = np.arange(int(sr * 1.5)) / sr
f = 200 + 20 * np.sin(2 * np.pi * 1.5 * t)
x = (0.3 * np.sin(2 * np.pi * np.cumsum(f) / sr) + 0.1 * np.sin(4 * np.pi * np.cumsum(f) / sr)).astype(np.float32)
y = T.shape(x, sr, 1.0, 2.0)
m0, m1 = (T.melody(x, sr), T.melody(y, sr)) if y is not None else ((None, None), (None, None))
d = tempfile.mkdtemp()
json.dump({'phoneme_id_map': {'a': [1]}}, open(os.path.join(d, 'fr_FR-gilles-low.onnx.json'), 'w'))
json.dump({'phoneme_id_map': {'a': [1], '\\u0303': [2]}}, open(os.path.join(d, 'fr_FR-upmc-medium.onnx.json'), 'w'))
print(json.dumps({'man': man, 'kid': kid, 'world': y is not None, 'f0': [m0[0], m1[0]], 'rel': [m0[1], m1[1]],
  'gilles': P.speaks_french('gilles', d), 'pierre': P.speaks_french('pierre', d), 'stand': P.STAND_IN['gilles']}))`);
    if (!r) return;
    const man = r.man as Record<string, number>;
    const kid = r.kid as Record<string, number>;
    expect(man.expr).toBe(2.2); // a flat voice (0.23) gets the channel's range, bounded
    expect(man.luminosite).toBe(1.3); // the channel's men speak high (229 Hz): half-way there, at most +30 %
    expect(kid.luminosite).toBeUndefined(); // children were not measured apart: the sheet's pitch is kept
    expect(kid.expr).toBeCloseTo(0.516 / 0.3, 1); // a boy gains the melody range measured on the channel's males
    expect(kid.formant).toBe(1.12);
    if (r.world) {
      const [a, b] = r.f0 as [number, number];
      const [ra, rb] = r.rel as [number, number];
      expect(Math.abs(b - a) / a).toBeLessThan(0.05); // the melody widens around the voice's own pitch
      expect(rb / ra).toBeGreaterThan(1.6);
    }
    expect(r.gilles).toBe(false);
    expect(r.pierre).toBe(true);
    expect(r.stand).toBe('pierre');
  });
});

describe('Forge : contenu de l’image reprise (asset-forge.py)', () => {
  it('a second subject is counted, a duplicate box of the same subject is not', () => {
    const r = py(`
import json, importlib.util, numpy as np
spec = importlib.util.spec_from_file_location('forge', '../asset-forge.py'); F = importlib.util.module_from_spec(spec); spec.loader.exec_module(F)
one = F._nms_count(np.array([[0.5, 0.5, 0.9, 0.8], [0.52, 0.5, 0.88, 0.8], [0.9, 0.3, 0.15, 0.4]]), np.array([0.81, 0.4, 0.21]), 0.3)
two = F._nms_count(np.array([[0.45, 0.5, 0.9, 0.8], [0.86, 0.25, 0.2, 0.45]]), np.array([0.6, 0.31]), 0.3)
print(json.dumps({'one': one, 'two': two, 'hen': F.CATALOGUE['poule']['owl'], 'bottles': F.CATALOGUE['bouteilles'].get('unique')}))`);
    if (!r) return;
    expect(r.one).toBe(1); // the same hen boxed twice, and a weak partial box: one subject
    expect(r.two).toBe(2); // a second hen grown from the tail (measured 0.31–0.60): two subjects → redraw rejected
    expect(r.hen).toBe('a chicken');
    expect(r.bottles).toBe(false); // several bottles are allowed
  });
});

describe('Réactions, prises et échelle des lieux (tone.py, ground.py)', () => {
  it('a short story gets the channel echo reactions by the listener, never around the punchline; takes are judged on what is heard', () => {
    const r = py(`
import json, tone as T
beats = [{'who': 'a', 'text': 'Maman, ton tas de tomates là, c’est combien ?'}, {'who': 'b', 'text': 'Pour toi ? Mille francs.'},
         {'who': 'a', 'text': 'Hier c’était cinq cents !'}, {'who': 'b', 'text': 'Hier, la tomate n’avait pas encore appris le prix du carburant.'},
         {'who': 'a', 'text': 'Et aujourd’hui ?'}, {'who': 'b', 'text': 'Aujourd’hui elle a pris l’avion.'}]
ins = T.reactions(beats, 5, 6.0, {'rythme': {'reactions_part': 0.16}}, ['a', 'b'])
print(json.dumps({'ins': [[i, b['who'], b['text']] for i, b in ins], 'none': T.reactions(beats, 5, 0.5, {'rythme': {}}, ['a', 'b']),
  'echo': [T.echo('On va libérer le lion, il va te poursuivre.'), T.echo('Euh... sûrement au passé, madame.')],
  'n': [T.fr_number(71), T.fr_number(80), T.fr_number(1500)], 'wer': [T.wer('Pour toi ? Mille francs.', 'Pour toi, 1000 francs.'), T.wer('Mon fils', 'Non fils')]}))`);
    if (!r) return;
    // one reaction (1 line in 6, measured): on the line with an amount and an exclamation, by the listener, whole amount
    expect(r.ins).toEqual([[2, 'b', 'Cinq cents ?!']]);
    expect(r.none).toEqual([]); // no spare time, no reaction
    expect(r.echo).toEqual(['Le lion ?!', 'Sûrement au passé ?!']); // the noun group, not the closing vocative or the next clause
    expect(r.n).toEqual(['soixante-et-onze', 'quatre-vingts', 'mille-cinq-cents']);
    expect(r.wer).toEqual([0, 0.5]); // « 1000 » heard for « Mille » is right; « Non » for « Mon » is one word wrong
  });

  it('a continuous story keeps tight turns; the scale of a real photo comes from its horizon', () => {
    const r = py(`
import json, numpy as np, tone as T, ground as G
ref = {'_mesure': True, 'rythme': {'tour_de_parole_s': 0.26, 'silence_avant_chute_p75_s': 0.40, 'repliques_par_blague': 3, 'entre_blagues_s': 3.52,
       'entre_blagues_p75_s': 5.01, 'rire_s': 4.73}, 'voix': {}, 'piper': {}}
tl, rep = T.schedule([2.0] * 6, 4, 0, ref, breaths=False)
gaps = [round(b['speak0'] - a['speak1'], 2) for a, b in zip(tl, tl[1:])]
H, W = 400, 800
lab = np.zeros((H, W), np.uint8); walk = np.zeros((H, W), np.uint8)
walk[240:, :] = 255
for x in (100, 300, 500):  # three standing passers-by whose heads are on row 160
    lab[160:260, x:x + 30] = G.PERSON
fit_people = G.horizon_fit(lab, walk)
fit_floor = G.horizon_fit(np.zeros((H, W), np.uint8), walk)
print(json.dumps({'gaps': gaps, 'people': fit_people, 'floor': fit_floor}))`);
    if (!r) return;
    expect(r.gaps).toEqual([0.26, 0.26, 0.26, 0.4, 1.51]); // no long breath inside one story
    const p = r.people as Record<string, number | string>;
    const f = r.floor as Record<string, number | string>;
    expect(p.methode).toMatch(/têtes de 3 passants/);
    expect(p.horizon).toBeCloseTo(0.42, 2); // heads at 40 % (+ 2 %: heads stand a little above the eye line)
    expect(p.mH).toBeCloseTo((1.6 * 400) / (380 - 168), 1); // eye height / (feet row − horizon row) × picture height
    expect(f.methode).toBe('bout du sol praticable');
    expect(f.mH as number).toBeGreaterThan(p.mH as number); // the far end of the floor lies below the horizon: a larger scale
  });
});
