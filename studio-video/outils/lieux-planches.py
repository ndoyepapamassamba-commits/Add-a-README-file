#!/usr/bin/env python3
"""
LIEUX DU PROPRIÉTAIRE — ses planches de lieux (rues, places, marchés, bâtiments publics, avec foule) deviennent des décors
du moteur, groupés par lieu : plusieurs vues d'un même lieu pour y rejouer des scènes différentes.

  1. DÉCOUPAGE : les gouttières claires qui séparent les vues (lignes puis colonnes de chaque rangée) ;
  2. BANDEAU : le cartouche du nom (rectangle sombre et uni contenant du texte clair, en bas de la vue) est repéré ;
  3. NOM : le texte du cartouche est lu (EasyOCR, Apache-2.0 ; détecteur CRAFT, MIT) — sans cartouche, la grande
     enseigne de la scène (« GARE ROUTIÈRE D'ADJAMÉ ») nomme la vue, et reste peinte ;
  4. EFFACEMENT : le cartouche est effacé et la scène reconstituée dessous (LaMa, Apache-2.0 — repli : OpenCV) ;
  5. REGROUPEMENT : les vues dont les noms désignent le même lieu (mots du nom communs, ou l'un dans l'autre ; jamais
     deux villes ni deux quartiers différents) forment un lieu, nommé « Gare Routière — Adjamé » ;
  6. ENREGISTREMENT (--enregistrer) : chaque vue entre au manifeste du kit privé (« <Lieu> · vue n »), son échelle lue
     sur la foule peinte (ground.horizon_fit) ; troupe-enhance.py lui donne ensuite HD, relief et sol praticable.
Les images restent dans le kit privé (.private, jamais commité). Usage :
    python3 outils/lieux-planches.py <planche.webp> [...] [--kit .private/troupe] [--controle <image>]
    python3 outils/lieux-planches.py x --regrouper | --enregistrer   (vues déjà découpées)
"""
import argparse
import json
import os
import re
import sys
import unicodedata

import numpy as np
from PIL import Image

MODELS = os.path.expanduser('~/.cache/massamba-models')


def gutters(mask, frac=0.85, min_gap=40):
    """Runs of rows (or columns) that are gutters; returns the spans BETWEEN them (the tiles)."""
    g = mask.mean(1) > frac
    spans, start = [], 0
    k = 0
    n = len(g)
    while k < n:
        if g[k]:
            j = k
            while j < n and g[j]:
                j += 1
            if k - start >= min_gap:
                spans.append((start, k))
            start = j
            k = j
        else:
            k += 1
    if n - start >= min_gap:
        spans.append((start, n))
    return spans


def tiles(im):
    """The views of a board: rows between horizontal gutters, then columns between vertical gutters of each row."""
    x = np.asarray(im.convert('RGB')).astype(np.float32)
    white = (x.mean(2) > 225) & ((x.max(2) - x.min(2)) < 25)
    out = []
    for y0, y1 in gutters(white):
        for x0, x1 in gutters(white[y0:y1].T):
            out.append((x0, y0, x1, y1))
    return out


def caption_corner(tile):
    """The name cartouche of a view: a rectangle anchored at the lower LEFT corner (it starts at the left edge and goes
    down to the bottom), dark navy (or charcoal) holding light letters. Measured row by row: in a cartouche row, the
    run of cartouche pixels (navy, its anti-aliased mix with the white letters, the letters) starting at the left edge
    is long; the cartouche is the block of such rows that reaches the bottom, its width the median run.
    (Closing the colour mask into blobs failed: the blue sky and glass towers merge with the navy.) None if absent."""
    x = np.asarray(tile.convert('RGB')).astype(np.int32)
    H, W = x.shape[:2]
    R, G, B = x[..., 0], x[..., 1], x[..., 2]
    lum = x.mean(2)
    light = (lum > 185) & ((x.max(2) - x.min(2)) < 60)
    best = None
    for kind in ('marine', 'anthracite'):
        if kind == 'marine':
            core = (R < 45) & (B > 35) & (B > R + 25) & (G < B) & (lum < 110)
            mix = (B > R + 20) & (B >= G)  # navy blended with the letters
        else:
            core = (lum < 75) & ((x.max(2) - x.min(2)) < 40)
            mix = (x.max(2) - x.min(2)) < 45
        ok = core | light | (mix & (lum < 200))
        runs = np.zeros(H, int)
        lead = max(3, int(0.04 * W))  # a few scene pixels may sit left of the cartouche (tile cut)
        for y in range(int(0.5 * H), H):
            row = ok[y]
            s0 = next((k for k in range(lead) if row[k]), None)
            if s0 is None:
                continue
            gap, k = 0, s0
            for k in range(s0, W):
                gap = gap + 1 if not row[k] else 0
                if gap >= 6:
                    k -= 5
                    break
            # a cartouche row must be mostly its core colour (not just light or mixed sky)
            runs[y] = k if k > 0 and core[y, :k].mean() > 0.35 else 0
        # the block of long runs that reaches (nearly) the bottom
        long_ = runs >= 0.2 * W
        y1 = H - 1
        while y1 > 0.5 * H and not long_[y1]:
            y1 -= 1
        if H - 1 - y1 > 0.06 * H:
            continue
        y0 = y1
        while y0 - 1 >= 0.5 * H and long_[y0 - 1]:
            y0 -= 1
        # Rows through big letters are mostly letters (core below the bar): bridge them when the cartouche's own colour
        # resumes above within a letter's height, every row in between being cartouche-coloured over the width.
        w0 = int(np.median(runs[y0:y1 + 1]))
        while True:
            top = next((y for y in range(y0 - 2, max(int(0.5 * H), y0 - int(0.14 * H)) - 1, -1) if long_[y]), None)
            if top is None or not all(ok[y, :w0].mean() >= 0.7 and core[y, :w0].mean() >= 0.08 for y in range(top + 1, y0)):
                break
            y0 = top
            while y0 - 1 >= 0.5 * H and long_[y0 - 1]:
                y0 -= 1
        if y1 - y0 + 1 < 0.05 * H or y1 - y0 + 1 > 0.32 * H:
            continue
        blk = runs[y0:y1 + 1]
        w = int(np.percentile(blk[blk > 0], 75))
        text = float(light[y0:y1 + 1, :w].mean())
        if text < 0.03:
            continue
        sc = w * (y1 - y0 + 1)
        if best is None or sc > best[0]:
            best = (sc, (0, int(y0), w, int(y1) + 1))
    return best[1] if best else None


def caption_band(tile):
    """Second reading: a horizontal dark band in the lower left, closed horizontally over its letters (a wide, flat
    kernel) — finds the cartouches with a margin or a border that the corner reading misses."""
    import cv2
    x = np.asarray(tile.convert('RGB')).astype(np.int32)
    H, W = x.shape[:2]
    R, B = x[..., 0], x[..., 2]
    lum = x.mean(2)
    navy = (R < 45) & (B > 60) & (B > R + 40) & (lum < 110)
    charcoal = (lum < 75) & ((x.max(2) - x.min(2)) < 40)
    light = (lum > 200) & ((x.max(2) - x.min(2)) < 50)
    best = None
    for m in (navy, charcoal):
        if not m.any():
            continue
        kern = np.ones((max(3, int(0.03 * H)), max(9, int(0.08 * W))), np.uint8)
        band = cv2.morphologyEx((m.astype(np.uint8) | (light & (cv2.dilate(m.astype(np.uint8), kern) > 0)).astype(np.uint8)), cv2.MORPH_CLOSE, kern)
        n, lab, st, _ = cv2.connectedComponentsWithStats(band, 8)
        for c in range(1, n):
            bx, by, bw, bh, area = st[c]
            if bx > 0.12 * W or bw < 0.2 * W or bh < 0.05 * H or bh > 0.3 * H or by + bh < 0.7 * H:
                continue
            comp = lab[by:by + bh, bx:bx + bw] == c
            rows = np.nonzero(comp.mean(1) > 0.5)[0]
            if not len(rows):
                continue
            y0, y1 = by + int(rows.min()), by + int(rows.max()) + 1
            fill = float(comp[rows.min():rows.max() + 1].mean())
            if fill < 0.6 or float(light[y0:y1, bx:bx + bw].mean()) < 0.03:
                continue
            sc = bw * (y1 - y0) * fill
            if best is None or sc > best[0]:
                best = (sc, (int(bx), int(y0), int(bx + bw), int(y1)))
    return best[1] if best else None


def caption_box(tile):
    """The cartouche: the corner reading first, the band reading if it found nothing. A cartouche sits at the bottom of
    the view and holds a line of letters: a thin band higher up is a painted shop front or a crowd (control sheet of
    the boards: the false bands ended at 62–75 % of the height, the cartouches at 90–100 %, none thinner than 6 %)."""
    box = caption_corner(tile) or caption_band(tile)
    if box and (box[3] < 0.85 * tile.height or box[3] - box[1] < 0.06 * tile.height):
        return None
    return box


_OCR = {}


def _reader():
    if 'r' not in _OCR:
        try:
            import easyocr
            _OCR['r'] = easyocr.Reader(['fr'], gpu=False, model_storage_directory=os.path.join(MODELS, 'easyocr'), verbose=False)
        except Exception as e:
            print('  (lecture des noms indisponible :', str(e)[:80], ')')
            _OCR['r'] = None
    return _OCR['r']


def read_name(crop):
    """The place's name written in the cartouche (EasyOCR, French). None without the model."""
    r = _reader()
    if r is None:
        return None
    big = crop.resize((crop.width * 3, crop.height * 3), Image.LANCZOS)
    lines = r.readtext(np.asarray(big.convert('RGB')), detail=1, paragraph=False)
    lines.sort(key=lambda t: (round(min(p[1] for p in t[0]) / 20), min(p[0] for p in t[0])))
    return ' '.join(t[1] for t in lines if t[2] > 0.2).strip() or None


def read_sign(tile):
    """A view without a cartouche is often named by the scene's own big sign (« GARE ROUTIÈRE D'ADJAMÉ » over the
    station, « STADE OLYMPIQUE » on the stadium): the tallest confident text of the view, with the lines of a similar
    height just around it. It names the view for the grouping only — the sign belongs to the scene and stays."""
    r = _reader()
    if r is None:
        return None
    big = tile.resize((tile.width * 2, tile.height * 2), Image.LANCZOS)
    found = []
    for box, text, conf in r.readtext(np.asarray(big.convert('RGB')), detail=1, paragraph=False):
        ys = [p[1] for p in box]
        h = max(ys) - min(ys)
        if conf >= 0.5 and sum(ch.isalpha() for ch in text) >= 4 and h >= 0.04 * big.height:
            found.append((h, min(ys), min(p[0] for p in box), text))
    if not found:
        return None
    top = max(found)
    near = [f for f in found if f[0] >= 0.6 * top[0] and abs(f[1] - top[1]) <= 2.2 * top[0]]
    near.sort(key=lambda f: (round(f[1] / (0.6 * top[0])), f[2]))
    return ' '.join(f[3] for f in near).strip() or None


_LAMA = {}


def erase(tile, box, pad=None):
    """The cartouche erased and the scene rebuilt under it: LaMa (big-lama, Apache-2.0, ONNX) — else OpenCV Telea.
    LaMa works at 512×512: it is given a window around the cartouche (the cartouche and as much scene on each side),
    not the whole view squashed into a square — the rebuilt scene keeps the view's detail and proportions."""
    import cv2
    x0, y0, x1, y1 = box
    pad = pad if pad is not None else max(6, int(0.3 * (y1 - y0)))  # the frame and glow of a signboard too
    x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(tile.width, x1 + pad), min(tile.height, y1 + pad)
    rgb = np.asarray(tile.convert('RGB'))
    mask = np.zeros(rgb.shape[:2], np.uint8)
    mask[y0:y1, x0:x1] = 255
    sess = _LAMA.get('s', 'x')
    if sess == 'x':
        path = os.path.join(MODELS, 'lama_fp32.onnx')
        try:
            import onnxruntime as ort
            sess = ort.InferenceSession(path, providers=['CPUExecutionProvider']) if os.path.exists(path) else None
        except Exception:
            sess = None
        _LAMA['s'] = sess
    if sess is not None:
        H, W = rgb.shape[:2]
        side = min(max(x1 - x0, y1 - y0) + 2 * max(24, (y1 - y0)), max(H, W))  # a square window, the cartouche inside
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        wx0 = int(np.clip(cx - side // 2, 0, max(0, W - side)))
        wy0 = int(np.clip(cy - side // 2, 0, max(0, H - side)))
        wx1, wy1 = min(W, wx0 + side), min(H, wy0 + side)
        win, wmask = rgb[wy0:wy1, wx0:wx1], mask[wy0:wy1, wx0:wx1]
        im = cv2.resize(win, (512, 512), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255.0
        mk = (cv2.resize(wmask, (512, 512), interpolation=cv2.INTER_NEAREST) > 127).astype(np.float32)
        names = [i.name for i in sess.get_inputs()]
        out = sess.run(None, {names[0]: im.transpose(2, 0, 1)[None], names[1]: mk[None, None]})[0][0].transpose(1, 2, 0)
        out = out if out.max() > 2 else out * 255
        out = cv2.resize(np.clip(out, 0, 255).astype(np.uint8), (wx1 - wx0, wy1 - wy0), interpolation=cv2.INTER_AREA)
        res = rgb.copy()
        sub = res[wy0:wy1, wx0:wx1]
        sub[wmask > 0] = out[wmask > 0]
        return Image.fromarray(res), 'LaMa'
    return Image.fromarray(cv2.inpaint(rgb, mask, 7, cv2.INPAINT_TELEA)), 'OpenCV Telea'


STOP = {'de', 'la', 'le', 'les', 'du', 'des', 'd', 'l', 'et', 'a', 'au', 'aux', 'en', 'sur'}
# Abidjan's districts (« Abidjan » alone covers them all), then the other towns of the boards.
ABIDJAN = {'plateau', 'adjame', 'cocody', 'yopougon', 'treichville', 'marcory', 'koumassi', 'riviera', 'bouet', 'anyama', 'zone',
           'abobo', 'attecoube', 'bingerville'}
# How a district / town is written in a place name, and the acronyms kept in capitals.
DISPLAY = {'bouet': 'Port-Bouët', 'pedro': 'San-Pédro', 'bassam': 'Grand-Bassam', 'lahou': 'Grand-Lahou', 'zone': 'Zone 4', 'adjame': 'Adjamé',
           'attecoube': 'Attécoubé', 'bouake': 'Bouaké', 'ayame': 'Ayamé', 'senoufo': 'Sénoufo'}
ACRONYMS = {'hkb', 'fhb', 'bceao', 'chu', 'cie', 'sodeci', 'rti'}
TOWNS = {'bouake', 'yamoussoukro', 'korhogo', 'man', 'assinie', 'bassam', 'pedro', 'divo', 'agboville', 'ayame', 'toumodi', 'boundiali',
         'lahou', 'daloa', 'gagnoa'}


def _ascii(t):
    return unicodedata.normalize('NFKD', t or '').encode('ascii', 'ignore').decode()


def split_name(text):
    """« 3. PALAIS PRÉSIDENTIEL Avenue Franchet d'Esperey Plateau » → the NAME (the words written in capitals) and the
    whole text (whose district words also count)."""
    words = re.findall(r"[\w'’.-]+", re.sub(r'^\s*\d+[.)]\s*', '', text or ''))
    caps = [w for w in words if any(ch.isalpha() for ch in w) and (_ascii(w).lower() in ACRONYMS or
                                                                    sum(ch.isupper() for ch in w) >= 0.7 * sum(ch.isalpha() for ch in w))]
    # a sign written in mixed case (« Université Félix Houphouët-Boigny ») has no capital name: all its words count
    name = ' '.join(caps) if key_words(' '.join(caps)) - SLOGAN else ' '.join(words)
    return name, text or ''


# Slogans under the names on the boards (« Une ville en mouvement », « Cadre de vie d'exception ») — not place words.
SLOGAN = {'ville', 'cadre', 'vie', 'exception', 'dexception', 'nature', 'detente', 'une', 'mouvement', 'opportunites', 'dopportunites',
          'toujours', 'vivant', 'voyager', 'decouvrir', 'grandir', 'restararts', 'restaurants', 'loisirs', 'affaires'}
# Acronyms written out on the signs (« Université FHB » = « Université Félix Houphouët-Boigny »).
ALIASES = {'fhb': {'felix', 'houphouet', 'boigny'}, 'hkb': {'henri', 'konan', 'bedie'}}


def key_words(name):
    t = _ascii(name).lower()
    k = {w for w in re.findall(r'[a-z0-9]+', t) if w not in STOP and len(w) > 1}
    for a, full in ALIASES.items():
        if a in k:
            k |= full
    return k


def districts(text):
    k = key_words(text)
    return (k & ABIDJAN) | (k & TOWNS) | ({'abidjan'} if 'abidjan' in k else set())


def same_place(a, b):
    """Same place: most significant words of the NAMES in common, and compatible places — two different towns or two
    different Abidjan districts are never merged (« Grand marché » of Bouaké ≠ of Adjamé); « Abidjan » alone covers
    its districts."""
    na, ta = split_name(a)
    nb, tb = split_name(b)
    da, db = districts(ta), districts(tb)
    ca, cb = key_words(na) - ABIDJAN - TOWNS - SLOGAN - {'abidjan'}, key_words(nb) - ABIDJAN - TOWNS - SLOGAN - {'abidjan'}
    if not ca or not cb:
        return False
    small, large = sorted((ca, cb), key=len)
    # most words in common — or one name inside the other (« Marché d'Adjamé » ⊂ « Grand Marché — Adjamé »,
    # « Stade olympique » ⊂ « Stade olympique Alassane Ouattara ») when it is specific: two words, or the same district
    inside = small <= large and (len(small) >= 2 or bool((da & db) - {'abidjan'}))
    if len(ca & cb) / len(ca | cb) < 0.6 and not inside:
        return False
    sa, sb = da - {'abidjan'}, db - {'abidjan'}
    if sa and sb and not (sa & sb):
        return False
    town_a, town_b = da & TOWNS, db & TOWNS
    if (town_a or town_b) and town_a != town_b and not (('abidjan' in da or sa & ABIDJAN) and not town_b and not town_a):
        return False
    return True


def _word(w):
    """One word of a place name in title case: « L'INDÉPENDANCE » → « l'Indépendance », « LHÔTEL » (apostrophe lost by
    the OCR) → « l'Hôtel », « HOUPHOUËT-BOIGNY » → « Houphouët-Boigny », acronyms kept (HKB, CHU)."""
    if _ascii(w).lower() in ACRONYMS:
        return w.upper()
    if w.lower() in STOP:
        return w.lower()
    m = re.match(r"^([LlDd])['’]?(H?[AEIOUYÉÈÊÂÔÎaeiouyéèêâôî].*)$", w)
    if m and len(w) > 3 and (("'" in w or "’" in w) or w[:2].upper() == 'LH'):
        return m.group(1).lower() + "'" + _word(m.group(2))
    return '-'.join(p[:1].upper() + p[1:].lower() for p in w.split('-'))


def place_name(names):
    """The place's display name: the shortest caption NAME (capital words, no number, no « PK », no town), in title case,
    followed by its district or town (« Gare Routière — Adjamé »)."""
    def core(n):
        town = key_words(n)
        out = []
        for w in split_name(n)[0].split():
            parts = set(re.findall(r'[a-z0-9]+', _ascii(w).lower()))
            if w.isdigit() or parts & (ABIDJAN | TOWNS | SLOGAN | {'abidjan', 'pk'}) or (w.lower() == 'san' and 'pedro' in town):
                continue
            out.append(w)
        while out and out[-1].lower() in STOP:
            out.pop()
        return out
    cores = [core(n) for n in names if core(n)]
    t = ' '.join(_word(w) for w in min(cores, key=lambda c: (len(c), len(' '.join(c))))) if cores else ''
    t = t[:1].upper() + t[1:]
    where = {}
    for n in names:
        for d in districts(n):
            where[d] = where.get(d, 0) + 1
    local = [d for d in where if d != 'abidjan'] or list(where)
    if local:
        d = max(local, key=lambda d: where[d])
        label = DISPLAY.get(d) or next((_word(w) for n in names for w in re.findall(r"[\w'’-]+", n) if _ascii(w).lower() == d), d.capitalize())
        t = f'{t} — {label}' if t else label
    return t or names[0]


def group(views):
    """Places: views whose names designate the same place (several views of one place = champ, contrechamp, coin…)."""
    places = []
    for v in views:
        if not v['nom_lu']:
            continue
        for pl in places:
            if any(same_place(n, v['nom_lu']) for n in pl['noms']):
                pl['vues'].append(v)
                pl['noms'].append(v['nom_lu'])
                break
        else:
            places.append({'noms': [v['nom_lu']], 'vues': [v]})
    for pl in places:
        pl['nom'] = place_name(pl['noms'])
    return places


def slug(t):
    return re.sub(r'[^a-z0-9]+', '-', _ascii(t).lower()).strip('-')


def register(kit):
    """The views become sets of the engine, listed in the PRIVATE kit's manifest (never committed): one entry per view,
    « <Lieu> · vue k », with its place (`lieu`, `lieu_nom`, `vue`) so a story can cut from one view of a place to
    another, and its metric scale (`fit`) read from the painted crowd: standing adults' heads line up on the horizon of
    an eye-level picture (ground.horizon_fit on the UperNet ADE20K parse). The views nobody named go under « Abidjan ».
    Then outils/troupe-enhance.py adds HD, depth and floor."""
    import importlib.util
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, os.path.join(here, '..', 'blender', 'film'))
    import ground
    spec = importlib.util.spec_from_file_location('troupe_enhance', os.path.join(here, 'troupe-enhance.py'))
    te = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(te)
    seg = te.seg_model()
    d = json.load(open(os.path.join(kit, 'lieux', 'lieux.json'), encoding='utf-8'))
    places = group(d['vues'])
    loose = [v for v in d['vues'] if not v['nom_lu']]
    if loose:
        places.append({'nom': 'Abidjan', 'vues': loose})
    man_p = os.path.join(kit, 'manifest.json')
    man = json.load(open(man_p, encoding='utf-8'))
    man['decors'] = [x for x in man.get('decors', []) if x.get('source') != 'planche']
    n = 0
    for pl in places:
        for k, v in enumerate(pl['vues'], 1):
            im = Image.open(os.path.join(kit, v['fichier']))
            if seg is not None:
                lab, walk = te.segment(seg, im)
                fit = ground.horizon_fit(lab, walk)
            else:
                fit = {'mH': 3.0, 'floor': 0.95, 'cx': 0.5, 'methode': 'défaut (modèle de scène absent)'}
            man['decors'].append({'name': f"{pl['nom']} · vue {k}" if len(pl['vues']) > 1 else pl['nom'], 'file': v['fichier'], 'w': im.width, 'h': im.height,
                                  'lieu': slug(pl['nom']), 'lieu_nom': pl['nom'], 'vue': k, 'vues': len(pl['vues']),
                                  'fit': {kk: fit[kk] for kk in ('mH', 'floor', 'cx')}, 'echelle': fit.get('methode'),
                                  'source': 'planche', 'planche': v['planche'], 'nom_source': v.get('nom_source')})
            n += 1
            print(f"  {man['decors'][-1]['name']}: {fit['mH']} m de haut ({fit.get('methode')})", flush=True)
    json.dump(man, open(man_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{n} vues de {len(places)} lieux enregistrées dans le kit → lancer outils/troupe-enhance.py (HD, profondeur, sol)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('planches', nargs='+')
    ap.add_argument('--kit', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.private', 'troupe'))
    ap.add_argument('--controle', default='')
    ap.add_argument('--regrouper', action='store_true', help='refaire seulement le regroupement par lieu (vues déjà découpées)')
    ap.add_argument('--enregistrer', action='store_true', help='enregistrer les vues comme décors du kit (manifeste privé)')
    A = ap.parse_args()
    if A.enregistrer:
        return register(A.kit)
    if A.regrouper:
        p = os.path.join(A.kit, 'lieux', 'lieux.json')
        views = json.load(open(p, encoding='utf-8'))['vues']
        places = group(views)
        json.dump({'vues': views, 'lieux': [{'nom': pl['nom'], 'vues': [v['fichier'] for v in pl['vues']]} for pl in places]},
                  open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f"{len(views)} vues, {len(places)} lieux nommés : " + ', '.join(f"{pl['nom']} ({len(pl['vues'])})" for pl in places if len(pl['vues']) > 1))
        return
    out_dir = os.path.join(A.kit, 'lieux', 'vues')
    os.makedirs(out_dir, exist_ok=True)
    views = []
    sheet = []
    for p in A.planches:
        im = Image.open(p).convert('RGB')
        stem = os.path.splitext(os.path.basename(p))[0]
        for i, (x0, y0, x1, y1) in enumerate(tiles(im)):
            t = im.crop((x0 + 2, y0 + 2, x1 - 2, y1 - 2))
            box = caption_box(t)
            name = read_name(t.crop(box)) if box else None
            source = 'bandeau' if name else None
            if not name:
                name = read_sign(t)
                source = 'enseigne' if name else None
            clean, how = erase(t, box) if box else (t, 'aucun bandeau')
            f = os.path.join(out_dir, f'{stem}-{i:02d}.png')
            clean.save(f)
            views.append({'fichier': os.path.relpath(f, A.kit), 'planche': os.path.basename(p), 'nom_lu': name, 'nom_source': source, 'bandeau': box, 'effacement': how,
                          'w': clean.width, 'h': clean.height})
            print(f"{stem} vue {i:2d} {clean.size} bandeau {box} → « {name} » ({how})", flush=True)
            if A.controle:
                c = t.copy()
                if box:
                    from PIL import ImageDraw
                    ImageDraw.Draw(c).rectangle(box, outline=(0, 255, 0), width=3)
                sheet.append((c, clean))
    # Re-running some boards keeps the views of the others.
    lj = os.path.join(A.kit, 'lieux', 'lieux.json')
    done = {os.path.basename(p) for p in A.planches}
    if os.path.exists(lj):
        views = [v for v in json.load(open(lj, encoding='utf-8'))['vues'] if v['planche'] not in done] + views
        views.sort(key=lambda v: v['fichier'])
    places = group(views)
    json.dump({'vues': views, 'lieux': [{'nom': pl['nom'], 'vues': [v['fichier'] for v in pl['vues']]} for pl in places]},
              open(lj, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    multi = [pl for pl in places if len(pl['vues']) > 1]
    print(f"{len(views)} vues, {len(places)} lieux nommés, dont {len(multi)} avec plusieurs vues : " +
          ', '.join(f"{pl['nom']} ({len(pl['vues'])})" for pl in multi[:12]))
    if A.controle and sheet:
        w = 360
        for page in range(0, len(sheet), 24):
            rows = []
            for c, cl in sheet[page:page + 24]:
                a = c.resize((w, int(w * c.height / c.width)))
                b = cl.resize((w, int(w * cl.height / cl.width)))
                r = Image.new('RGB', (2 * w + 8, max(a.height, b.height)), (0, 0, 0))
                r.paste(a, (0, 0))
                r.paste(b, (w + 8, 0))
                rows.append(r)
            cols = [rows[i:i + 8] for i in range(0, len(rows), 8)]
            H = max(sum(r.height + 6 for r in col) for col in cols)
            board = Image.new('RGB', (len(cols) * (2 * w + 20), H), (20, 20, 20))
            for ci, col in enumerate(cols):
                y = 0
                for r in col:
                    board.paste(r, (ci * (2 * w + 20), y))
                    y += r.height + 6
            stem, ext = os.path.splitext(A.controle)
            board.save(f'{stem}-{page // 24 + 1}{ext}', quality=85)

if __name__ == '__main__':
    main()
