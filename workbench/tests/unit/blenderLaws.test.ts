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
crowd = np.zeros((H, W), np.uint8)
crowd[170:300, 100:700] = G.PERSON  # a dense crowd parsed as one blob, its head line on row 170
fit_crowd = G.horizon_fit(crowd, walk)
print(json.dumps({'gaps': gaps, 'people': fit_people, 'floor': fit_floor, 'crowd': fit_crowd}))`);
    if (!r) return;
    expect(r.gaps).toEqual([0.26, 0.26, 0.26, 0.4, 1.51]); // no long breath inside one story
    const p = r.people as Record<string, number | string>;
    const f = r.floor as Record<string, number | string>;
    expect(p.methode).toMatch(/têtes de 3 passants/);
    expect(p.horizon).toBeCloseTo(0.42, 2); // heads at 40 % (+ 2 %: heads stand a little above the eye line)
    expect(p.mH).toBeCloseTo((1.6 * 400) / (380 - 168), 1); // eye height / (feet row − horizon row) × picture height
    expect(f.methode).toBe('bout du sol praticable');
    expect(f.mH as number).toBeGreaterThan(p.mH as number); // the far end of the floor lies below the horizon: a larger scale
    const c = r.crowd as Record<string, number | string>;
    expect(c.methode).toBe('ligne des têtes de la foule');
    expect(c.horizon).toBeCloseTo(0.445, 2); // the crowd's head line (row 170 = 42.5 %) + 2 %
  });

  it('a place with several views: the film opens in the named view and cuts only between shots, never inside the gag', () => {
    const r = py(`
import json, plan as P
decors = {'Gare — Adjamé · vue 1': {'lieu': 'gare', 'lieu_nom': 'Gare — Adjamé', 'vue': 1}, 'Gare — Adjamé · vue 2': {'lieu': 'gare', 'vue': 2},
          'Gare — Adjamé · vue 3': {'lieu': 'gare', 'vue': 3}, 'Salon': {}}
fps, nF = 25, 25 * 60
shots = [{'start': s} for s in range(0, nF, 100)]  # a shot every 4 s
punch = 1300  # the punchline starts at 52 s: no cut after it (the reaction stays in the same picture)
cuts = P.cut_views(shots, P.place_views('Gare — Adjamé', decors), fps, nF, punch)
print(json.dumps({'place': P.place_views('Gare — Adjamé', decors), 'named': P.place_views('Gare — Adjamé · vue 2', decors),
  'single': P.place_views('Salon', decors), 'none': P.place_views('Lune', decors), 'cuts': cuts,
  'short': P.cut_views(shots[:3], ['A', 'B'], fps, 250)}))`);
    if (!r) return;
    expect(r.place).toEqual(['Gare — Adjamé · vue 1', 'Gare — Adjamé · vue 2', 'Gare — Adjamé · vue 3']);
    expect((r.named as string[])[0]).toBe('Gare — Adjamé · vue 2'); // the view the story names opens the film
    expect(r.single).toEqual(['Salon']);
    expect(r.none).toEqual([]);
    const cuts = r.cuts as { decor: string; start: number; end: number }[];
    expect(cuts.map((c) => c.decor)).toEqual([
      'Gare — Adjamé · vue 1',
      'Gare — Adjamé · vue 2',
      'Gare — Adjamé · vue 3',
    ]);
    expect(cuts[0]!.start).toBe(0);
    expect(cuts[cuts.length - 1]!.end).toBe(1500);
    for (let i = 1; i < cuts.length; i++) {
      expect(cuts[i]!.start).toBe(cuts[i - 1]!.end); // no gap, no overlap
      expect(cuts[i]!.start % 100).toBe(0); // on a shot boundary
      expect(cuts[i]!.start).toBeLessThanOrEqual(1300); // never between the punchline and its reaction
    }
    expect(r.short).toEqual([{ decor: 'A', start: 0, end: 250 }]); // a 10 s film keeps one view
  });
  it('the audit of film 5: laughter drawing only for laughter, the hook never on a face, mostly medium and wide shots', () => {
    const r = py(`
import json, plan as P, finish as F
H, bh = 1024, 125
print(json.dumps({'smile': P.spoken_pose({'text': 'Pour toi, mon fils ? Mille francs.', 'pose': 'rire'}),
  'laugh': P.spoken_pose({'text': 'Ha ha ha !', 'pose': 'neutre'}), 'shrug': P.spoken_pose({'text': 'Moi, j’ai pris.', 'pose': 'haussement'}),
  'free': F.hook_top([], bh, H), 'head_top': F.hook_top([[0.3, 0.08, 0.7, 0.35]], bh, H),
  'cycle': P.SHOT_CYCLE}))`);
    if (!r) return;
    expect(r.smile).toBe('neutre'); // a spoken line is never played with the fit-of-laughter drawing
    expect(r.laugh).toBe('rire');
    expect(r.shrug).toBe('haussement');
    expect(r.free).toBe(108); // under the TikTok top bar (10.5 % of the height) when no face is there
    expect(r.head_top as number).toBeGreaterThanOrEqual(0.37 * 1024); // below a head at the top of the frame
    const cycle = r.cycle as string[];
    expect(cycle.filter((t) => t === 'cu').length).toBeLessThanOrEqual(1);
  });
});

describe('Corps et décor vivants (acting.py, crowd.py)', () => {
  it('a speaking actor leans toward the partner and the head follows; listening stands back up; the old idle stays still', () => {
    const r = py(`
import json, math, numpy as np, acting
fps, nF = 25, 250
jaw = np.zeros(nF); jaw[50:150] = 0.4          # speaks from 2 s to 6 s, then listens
L = acting.curves(jaw, [np.zeros(nF)], -0.4, nF, fps, 7)
R = acting.curves(jaw, [np.zeros(nF)], 0.42, nF, fps, 7)
O = acting.curves(jaw, [np.zeros(nF)], -0.4, nF, fps, 7, on=False)
d = lambda a: math.degrees(float(np.mean(a)))
print(json.dumps({'leftSpeak': d(L['spine'][75:140]), 'leftListen': d(L['spine'][190:240]), 'leftHead': d(L['head'][75:140]),
  'rightSpeak': d(R['spine'][75:140]), 'oldSpine': float(np.abs(O['spine']).max()), 'breath': L['breath_amp'],
  'shift': math.degrees(float(np.ptp(L['root'])))}))`);
    if (!r) return;
    expect(r.leftSpeak as number).toBeLessThan(-3.5); // left actor: top toward +x (negative rotation, measured sign)
    expect(Math.abs(r.leftListen as number)).toBeLessThan(1.0);
    expect(r.leftHead as number).toBeLessThan(-0.5); // the head follows the lean, never cancels it
    expect(r.rightSpeak as number).toBeGreaterThan(3.5);
    expect(r.oldSpine).toBe(0);
    expect(r.breath as number).toBeGreaterThanOrEqual(0.02);
    expect(r.shift as number).toBeGreaterThan(1.5); // weight shifts are visible
  });

  it('acting for the camera: a close-up plays smaller, a two-shot fully, without fading at the film ends', () => {
    const r = py(`
import json, numpy as np, acting
shots = [{'start': 0, 'end': 80, 'type': 'mcu', 'target': 'a'}, {'start': 80, 'end': 160, 'type': 'two', 'target': 'a'},
         {'start': 160, 'end': 250, 'type': 'cu', 'target': 'a'}]
sc = acting.shot_scale(shots, 'a', 250, 25)
jaw = np.full(250, 0.4)
full = acting.curves(jaw, [], -0.4, 250, 25, 7)
cu = acting.curves(jaw, [], -0.4, 250, 25, 7, scale=sc)
print(json.dumps({'start': float(sc[0]), 'two': float(sc[120]), 'cu': float(sc[200]), 'end': float(sc[-1]),
  'ratio': float(np.abs(cu['spine'][190:240]).mean() / np.abs(full['spine'][190:240]).mean())}))`);
    if (!r) return;
    expect(r.start).toBeCloseTo(0.65, 2); // the first shot is a medium close-up: no fade from 0 at the film start
    expect(r.two).toBe(1);
    expect(r.cu).toBeCloseTo(0.45, 2);
    expect(r.end).toBeCloseTo(0.45, 2);
    expect(r.ratio as number).toBeCloseTo(0.45, 2); // the lean in a close-up = 45 % of the two-shot lean
  });

  it('captured motion (ASF/AMC) is read in the plane of our cards, clamped for a drawing, played once then settles', () => {
    const r = py(`
import json, math, os, tempfile, numpy as np, mocap
d = tempfile.mkdtemp()
asf = os.path.join(d, 't.asf'); amc = os.path.join(d, 't.amc')
open(asf, 'w').write('''
:units
  length 1.0
  angle deg
:root
   order TX TY TZ RX RY RZ
   axis XYZ
   position 0 0 0
   orientation 0 0 0
:bonedata
  begin
     name lowerback
     direction 0 1 0
     length 10
     axis 0 0 0 XYZ
    dof rx ry rz
  end
  begin
     name thorax
     direction 0 1 0
     length 10
     axis 0 0 0 XYZ
    dof rx ry rz
  end
  begin
     name upperneck
     direction 0 1 0
     length 3
     axis 0 0 0 XYZ
    dof rx ry rz
  end
  begin
     name head
     direction 0 1 0
     length 5
     axis 0 0 0 XYZ
    dof rx ry rz
  end
:hierarchy
  begin
    root lowerback
    lowerback thorax
    thorax upperneck
    upperneck head
  end
''')
lines = [':FULLY-SPECIFIED', ':DEGREES']
for i in range(240):
    a = 20 * math.sin(i / 240 * 2 * math.pi)  # the chest bends sideways ±20° (rz) over 2 s at 120 fps
    lines += [str(i + 1), 'root 0 40 0 0 0 0', f'lowerback 0 0 {a:.3f}', 'thorax 0 0 0', 'upperneck 0 0 0', 'head 0 0 0']
open(amc, 'w').write(chr(10).join(lines))
c = mocap.card_curves(mocap.parse_asf(asf), mocap.parse_amc(amc), fps=25)
mocap._CURVES[('t', 25, 1.6)] = c
mocap.LIBRARY['t'] = {'subject': 'x', 'trial': 'x', 'desc': 'test', 'words': ('test',)}
o = mocap.overlay('t', 80, 25)
print(json.dumps({'tilt': math.degrees(float(np.ptp(c['spine']))), 'secs': c['seconds'], 'clamp': math.degrees(float(np.max(np.abs(o['spine'])))),
  'start': float(o['spine'][0]), 'end': float(o['spine'][-1]), 'prompt': mocap.from_prompt('elle se plie de rire')}))`);
    if (!r) return;
    expect(r.tilt as number).toBeGreaterThan(35); // ±20° sideways bend read as ≈ 40° peak to peak, seen from the front
    expect(r.secs as number).toBeCloseTo(2.0, 1);
    expect(r.clamp as number).toBeLessThanOrEqual(9.01); // a drawn card never leans more than 9°
    expect(r.start).toBe(0); // starts from our drawing's pose
    expect(Math.abs(r.end as number)).toBeLessThan(1e-6); // played once, then settles back (no frozen offset)
    expect(r.prompt).toBe('rire');
  });

  it('the lips meet on m / b / p heard by Rhubarb, the rest of the loudness lips is untouched', () => {
    const r = py(`
import json, numpy as np, lipsync
env = np.full(25, 0.6)
out = lipsync.jaw_from_cues([{'start': 0.2, 'end': 0.32, 'value': 'A'}, {'start': 0.4, 'end': 0.6, 'value': 'D'}], env, 25)
print(json.dumps({'closed': float(out[5:8].max()), 'open': float(out[12]), 'before': float(out[2])}))`);
    if (!r) return;
    expect(r.closed as number).toBeLessThanOrEqual(0.03); // « m » of « Maman »: lips meet even when loud
    expect(r.open).toBe(0.6); // other shapes do not override the voice (they opened less on French voices)
    expect(r.before).toBe(0.6);
  });

  it('the painted crowd sways person by person, feet still, without tearing between neighbours', () => {
    const r = py(`
import json, numpy as np, crowd
inst = np.zeros((200, 160), np.uint8)
inst[40:180, 20:80] = 1; inst[60:180, 80:140] = 2  # two painted people side by side, touching, feet on row 179
C, S = crowd.sway_field(inst)
amp = np.hypot(C, S)
ang = lambda y, x: float(np.arctan2(S[y, x], C[y, x]))
dx = 0.012 * C  # the shader's sway ratio
print(json.dumps({'head1': float(amp[48, 50]), 'feet1': float(amp[178, 50]), 'head2': float(amp[68, 110]), 'feet2': float(amp[178, 110]),
  'phaseGap': abs(ang(48, 50) - ang(68, 110)), 'stretch': float(np.abs(np.diff(dx, axis=1)).max()), 'tall1': float(amp[48, 50]) > float(amp[68, 110])}))`);
    if (!r) return;
    expect(r.head1 as number).toBeGreaterThan(50); // ≈ height × lever, in pixels
    expect(r.feet1 as number).toBeLessThan(0.1 * (r.head1 as number)); // feet anchored (law of physics)
    expect(r.feet2 as number).toBeLessThan(0.1 * (r.head2 as number));
    expect(r.phaseGap as number).toBeGreaterThan(0.05); // two people never sway in lockstep
    expect(r.stretch as number).toBeLessThan(0.25); // < 0.25 px of change per pixel: no tear at the seam
    expect(r.tall1).toBe(true); // the taller person sways more (amplitude ∝ height)
  });
});

describe('Réalisateur (director.py, mocap.py) — gestes par étiquette, règles mesurables, validation fermée', () => {
  it('finds the gesture a line calls for (whole words, longest cue) and maps a tag to a CMU clip by seed', () => {
    const r = py(`
import json, mocap
print(json.dumps({'bof': mocap.search('Je ne sais pas moi, bof'), 'vol': mocap.search("Maman, c'est du vol !"), 'toiture': mocap.search('la toiture'),
  'toi': mocap.search('Toi, tu pars.'), 'tel': mocap.search('Allô ? oui'), 'rien': mocap.search('rien'),
  'clip0': mocap.gesture_clip('dispute', 0), 'clip1': mocap.gesture_clip('dispute', 1), 'aucun': mocap.gesture_clip('aucun'),
  'trial': list(mocap.trial_of('cmu:18_10')), 'lib': list(mocap.trial_of('rire')), 'n': len(mocap.vocab()['gestes'])}))`);
    if (!r) return;
    expect(r).toMatchObject({ bof: 'haussement', vol: 'dispute', toiture: 'aucun', toi: 'pointe', tel: 'telephone', rien: 'aucun', aucun: null });
    expect(r.clip0).toMatch(/^cmu:\d+_\d+$/);
    expect(r.clip0).not.toBe(r.clip1); // two lines with the same gesture get two different clips
    expect(r.trial).toEqual(['18', '18_10']);
    expect(r.lib).toEqual(['13', '13_14']);
    expect(r.n as number).toBeGreaterThanOrEqual(20);
  });
  it('rules first, the model for the gaps, everything validated against the drawn poses of the people on stage', () => {
    const r = py(`
import json, director
story = {'title': 'T', 'hook': 'H', 'punch': {'beat': 2},
  'cast': [{'id': 'modou', 'name': 'MODOU'}, {'id': 'nounou', 'name': 'MAMAN NOUNOU'}, {'id': 'mamadou', 'name': 'PETIT MAMADOU', 'enter': 2}],
  'beats': [{'who': 'modou', 'text': "Maman, c'est combien ?"}, {'who': 'nounou', 'text': 'Mille ?! Hier cinq cents !', 'pose': 'choc'},
            {'who': 'nounou', 'text': 'Moi, j’ai pris. Toi, tu pars.'}]}
rig = {'cast': {'MODOU': {'poses': [{'kind': k} for k in ('neutre', 'accuse', 'choc', 'haussement', 'rire')]},
                'MAMAN NOUNOU': {'poses': [{'kind': k} for k in ('neutre', 'accuse', 'choc', 'haussement', 'rire')]},
                'PETIT MAMADOU': {'poses': [{'kind': 'neutre'}]}}}
rules = [director.rules(b, i, story) for i, b in enumerate(story['beats'])]
v = director.validate({'pose': 'accuse', 'geste': 'explique', 'energie': 1.4, 'camera': 'zoom', 'reactions': {'MAMAN NOUNOU': 'choc', 'MODOU': 'rire', 'PETIT MAMADOU': 'rire'}},
                      director.character_poses(rig, 'MODOU'), {'MAMAN NOUNOU': director.character_poses(rig, 'MAMAN NOUNOU')})
bad = director.validate({'pose': 'cheval', 'geste': 'danse-du-ventre', 'energie': 'x'}, ['neutre'], {})
d = director.direct(story, rig, mode='regles', log=lambda *a: None)
print(json.dumps({'rules': rules, 'v': v, 'bad': bad, 'beats': [{k: b.get(k) for k in ('geste', 'energie', 'move', 'react')} for b in d['beats']], 'backend': d['_director']['backend']}))`);
    if (!r) return;
    const rules = r.rules as { geste: string; energie: number }[];
    expect(rules[0]).toMatchObject({ geste: 'aucun', energie: 0.6 });
    expect(rules[1]).toMatchObject({ geste: 'dispute', energie: 0.8 }); // « ?! » argues even without a cue word
    expect(rules[2]).toMatchObject({ geste: 'pointe', energie: 0.9 }); // the punchline is explosive
    expect(r.v).toEqual({ pose: 'accuse', geste: 'explique', energie: 1.0, reactions: { 'MAMAN NOUNOU': 'choc' } }); // clamped, unknown camera dropped, absent people dropped
    expect(r.bad).toEqual({});
    const beats = r.beats as { geste: string; energie: number }[];
    expect(beats.map((b) => b.geste)).toEqual(['aucun', 'dispute', 'pointe']);
    expect(r.backend).toBe('regles');
  });
});

describe('Entrées en scène stylées (mocap.py BVH, 100STYLE) — lecteur BVH, clip par étiquette, règles du réalisateur', () => {
  it('reads a BVH skeleton and motion, gives the card curves, and maps an entrance tag to a 100STYLE clip', () => {
    const r = py(`
import json, os, tempfile, numpy as np, mocap, director
bvh = """HIERARCHY
ROOT Hips
{
 OFFSET 0 0 0
 CHANNELS 6 Xposition Yposition Zposition Yrotation Xrotation Zrotation
 JOINT Chest4
 {
  OFFSET 0 40 0
  CHANNELS 3 Yrotation Xrotation Zrotation
  JOINT Neck
  {
   OFFSET 0 20 0
   CHANNELS 3 Yrotation Xrotation Zrotation
   JOINT Head
   {
    OFFSET 0 10 0
    CHANNELS 3 Yrotation Xrotation Zrotation
    End Site
    {
     OFFSET 0 10 0
    }
   }
  }
 }
 JOINT LeftToe
 {
  OFFSET -10 -90 0
  CHANNELS 3 Yrotation Xrotation Zrotation
  End Site
  {
   OFFSET 0 0 5
  }
 }
 JOINT RightToe
 {
  OFFSET 10 -90 0
  CHANNELS 3 Yrotation Xrotation Zrotation
  End Site
  {
   OFFSET 0 0 5
  }
 }
}
MOTION
Frames: 4
Frame Time: 0.0333333
"""
# 4 frames: the chest tilts 0 → 10° → 0 → -10° sideways (Z rotation of Chest4), the hips bob 0 / 2 / 0 / 2 units.
z = [0] * 21  # 6 channels (Hips) + 3 × 5 joints
rows = [list(z), list(z), list(z), list(z)]
rows[1][1] = 2; rows[1][8] = 10   # frame 2: hips 2 units up, chest Z rotation +10°
rows[3][1] = 2; rows[3][8] = -10  # frame 4: hips 2 units up, chest Z rotation −10°
with tempfile.NamedTemporaryFile('w', suffix='.bvh', delete=False, encoding='utf-8') as f:
    f.write(bvh + '\\n'.join(' '.join(str(v) for v in r) for r in rows) + '\\n')
    path = f.name
skel, frames, fps = mocap.parse_bvh(path)
c = mocap.card_curves_bvh(skel, frames, fps=30, src_fps=fps, height_m=1.6)
os.unlink(path)
print(json.dumps({'joints': skel['joints'], 'frames': list(frames.shape), 'fps': fps, 'spine_deg': [round(float(np.degrees(v)), 1) for v in c['spine']], 'head_deg': [round(float(np.degrees(v)), 1) for v in c['head']],
  'bob_cm': [round(100 * float(v), 1) for v in c['bob']], 'seconds': c['seconds'],
  'clip': mocap.entrance_clip('entre_colere'), 'none': mocap.entrance_clip('x'),
  'presse': mocap.search_entrance('Pardon chef, je suis en retard'), 'normal': mocap.search_entrance('Bonjour'),
  'vieux': mocap.search_entrance('Mes genoux me font mal')}))`);
    if (!r) return;
    expect(r.joints).toEqual(['Hips', 'Chest4', 'Neck', 'Head', 'Head_end', 'LeftToe', 'LeftToe_end', 'RightToe', 'RightToe_end']);
    expect(r.frames).toEqual([4, 21]);
    expect(r.fps).toBe(30);
    // Chest4's own rotation moves its children (neck, head), not its position: the HEAD tilts ±10° relative to the
    // chest, the chest line (hips → Chest4) stays vertical; the hips bob 2 units on a 160-unit body (1,6 m) → 2 cm.
    // Sign convention of the card curves (as for CMU): a positive tilt sends the top toward −x, so a +10° Z rotation
    // reads −10°.
    const head = r.head_deg as number[];
    expect(head[1]! - head[0]!).toBeCloseTo(-10, 0);
    expect(head[3]! - head[0]!).toBeCloseTo(10, 0);
    expect(Math.max(...(r.spine_deg as number[]).map(Math.abs))).toBeLessThan(0.5);
    const bob = r.bob_cm as number[];
    expect(Math.abs(bob[1]! - bob[0]!)).toBeCloseTo(2.0, 0);
    expect(r.seconds as number).toBeCloseTo(4 / 30, 3);
    expect(r).toMatchObject({ clip: 'bvh:100style/Angry_FW', none: null, presse: 'entre_presse', normal: 'entre_normal', vieux: 'entre_vieux' });
  });
  it('the director gives every entering actor a walk style from its first line or its sheet (age ≥ 60 → old)', () => {
    const r = py(`
import json, director
story = {'title': 'T', 'hook': 'H', 'cast': [{'id': 'a', 'name': 'MODOU'}, {'id': 'b', 'name': 'GRAND-PÈRE NDIAYE', 'enter': 1}, {'id': 'c', 'name': 'KOFFI', 'enter': 2}, {'id': 'd', 'name': 'TANTIE AWA', 'enter': 2, 'entree': 'entre_discret'}],
  'beats': [{'who': 'a', 'text': 'Bonjour'}, {'who': 'b', 'text': 'Bonjour les enfants.'}, {'who': 'c', 'text': 'Pardon, je suis en retard !'}, {'who': 'd', 'text': 'Chut.'}]}
rig = {'cast': {}}
d = director.direct(story, rig, mode='regles', log=lambda *a: None)
print(json.dumps({c['id']: c.get('entree') for c in d['cast']}))`);
    if (!r) return;
    expect(r).toEqual({ a: null, b: 'entre_vieux', c: 'entre_presse', d: 'entre_discret' }); // the author's choice is kept
  });
});

describe('Porte de qualité : sauts de lumière hors coupe (finish.py) — un aperçu répète ses images', () => {
  it('a cut that lands on a repeated frame of the preview is still a cut; a real jump far from any cut is counted', () => {
    const r = py(`
import json, finish
lum = [50] * 480 + [90] * 10
dup = [False] * 478 + [True, True] + [False, True, True] * 3 + [False]
print(json.dumps({'preview_cut': finish.brightness_jumps(lum, dup, {479}), 'real': finish.brightness_jumps([50] * 10 + [90] * 5, [False] * 15, {3}),
  'at_cut': finish.brightness_jumps([50] * 10 + [90] * 5, [False] * 15, {11}), 'small': finish.brightness_jumps([50] * 10 + [60] * 5, [False] * 15, set())}))`);
    if (!r) return;
    expect(r).toEqual({ preview_cut: [], real: [11], at_cut: [], small: [] });
  });
  it('a preview on threes cannot judge motion / coverage (held frames read 14–20 % low): reported, not judged; the full render is', () => {
    const r = py(`
import json, gate
ref = json.load(open('tiktok_reference.json'))
m = {'seconds': 64, 'shotsPerMin': 20.6, 'shotMedianS': 2.75, 'motion': 0.0235, 'coverage': 0.42, 'frozenS': 0, 'flicker': 0.0034}
prev = gate.rhythm_checks(m, ref, 0.66)
full = gate.rhythm_checks(dict(m, motion=0.0271, coverage=0.53), ref, 0.0)
print(json.dumps({'prev': {c['check'].split(': ')[1]: c['ok'] for c in prev}, 'note': 'rendu complet requis' in prev[3]['note'],
  'full': {c['check'].split(': ')[1]: c['ok'] for c in full}, 'held_full': gate.rhythm_checks(m, ref, 0.0)[4]['ok']}))`);
    if (!r) return;
    expect(r.prev).toEqual({ seconds: true, shotsPerMin: true, shotMedianS: true, motion: null, coverage: null, frozenS: null, flicker: null });
    expect(r.note).toBe(true);
    expect(r.full).toEqual({ seconds: true, shotsPerMin: true, shotMedianS: true, motion: false, coverage: false, frozenS: true, flicker: true });
    expect(r.held_full).toBe(true); // the same numbers on a full render are judged — and 0,42 passes
  });
});
