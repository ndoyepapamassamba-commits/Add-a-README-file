#!/usr/bin/env python3
"""
FORGE D'ASSETS — des animaux et des objets RÉELS reproduits pour le moteur Blender, dans le style de la troupe.

  1. SOURCE   : de vraies photos sous licence libre (CC0 / domaine public) cherchées par l'API Openverse — la licence, la
                source et l'auteur sont gardés avec chaque asset (provenance.json) ;
  2. DÉTOURAGE: BiRefNet lite (licence MIT, ONNX) — le sujet seul, avec son alpha ;
  3. CHOIX    : la meilleure photo est choisie par mesure (un seul sujet entier, non coupé par le cadre, net, assez
                grand, vu de profil pour un animal) — pas au hasard ;
  4. STYLE    : la photo est reprise dans le style des personnages de la troupe (Stable Diffusion 1.5, licence
                CreativeML OpenRAIL-M, guidé par un dessin de la troupe via IP-Adapter, licence Apache-2.0 ; LCM-LoRA
                pour la vitesse) à force modérée : la forme et les couleurs RÉELLES sont gardées, le rendu devient
                celui de la troupe. Sans ces modèles, un étalonnage vers la signature visuelle de la troupe (style.py) ;
  5. SORTIE   : <cache>/<espece>/asset.png (RGBA, pieds en bas) + asset.json (hauteur réelle, provenance, mesures).

Les modèles sont téléchargés une fois dans ~/.cache/massamba-models ; les assets dans ~/.cache/massamba-assets (jamais
commités : ce ne sont pas des données du dépôt). Usage :
    python3 scripts/asset-forge.py poule [--style <dessin_troupe.png>] [--n 12]
"""
import argparse
import io
import json
import os
import sys
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image

MODELS = os.path.expanduser('~/.cache/massamba-models')
ASSETS = os.path.expanduser('~/.cache/massamba-assets')
BIREFNET = ('birefnet-lite.onnx', 'https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx')

# What to look for, and the real size of the subject (m) — the engine places it at that size.
CATALOGUE = {
    'poule': {'q': ['brown hen chicken side view', 'hen chicken standing', 'free range hen'], 'hauteur': 0.40, 'animal': True,
              'decrit': 'a free-range hen with deep chestnut red-brown glossy feathers, golden orange neck feathers, a bright red comb and red wattles, yellow legs and feet, standing'},
    'coq': {'q': ['rooster side view', 'rooster standing'], 'hauteur': 0.55, 'animal': True},
    'chevre': {'q': ['goat standing side view', 'pygmy goat'], 'hauteur': 0.62, 'animal': True},
    'chien': {'q': ['village dog standing side', 'basenji dog standing'], 'hauteur': 0.55, 'animal': True},
    'chat': {'q': ['cat standing side view', 'tabby cat standing'], 'hauteur': 0.28, 'animal': True},
    'canard': {'q': ['muscovy duck', 'duck standing side view'], 'hauteur': 0.45, 'animal': True},
    'pigeon': {'q': ['pigeon standing side view', 'rock dove'], 'hauteur': 0.25, 'animal': True},
    'vache': {'q': ['zebu cattle side view', 'zebu cow'], 'hauteur': 1.35, 'animal': True},
    'tomates': {'q': ['crate of tomatoes', 'wooden crate tomatoes market', 'tomatoes in a wooden box'], 'hauteur': 0.30, 'animal': False,
                'decrit': 'a wooden crate full of ripe red tomatoes'},
    'marmite': {'q': ['aluminium cooking pot', 'cooking pot lid'], 'hauteur': 0.27, 'animal': False},
    'bouteilles': {'q': ['glass bottles', 'green glass bottle'], 'hauteur': 0.28, 'animal': False},
    'ballon': {'q': ['soccer ball', 'football ball'], 'hauteur': 0.22, 'animal': False},
}


# Places: several real views per place (« plusieurs vues des lieux »), redrawn like the troupe's painted sets.
DECORS = {
    'ville': {'q': ['Dakar street', 'Abidjan street', 'West Africa city street', 'Accra street', 'Lagos street'],
              'decrit': 'a lively West African city street with colourful buildings, shop signs, palm trees and a paved road'},
    'rue': {'q': ['African neighborhood street', 'Senegal street houses', 'Ghana street houses'],
            'decrit': 'a West African neighbourhood street with painted houses, walls and a dirt road'},
    'marche': {'q': ['African market stalls', 'Dakar market', 'West Africa open market'],
               'decrit': 'a West African open-air market with colourful stalls, umbrellas, fruit and fabrics'},
    'plage': {'q': ['Dakar beach fishing boats', 'Senegal pirogue beach', 'West Africa beach boats'],
              'decrit': 'a West African beach with painted fishing pirogues, palm trees and the sea'},
    'cour': {'q': ['African courtyard house', 'West Africa compound courtyard'],
             'decrit': 'a West African family courtyard with a mango tree, walls and a sandy ground'},
}


def http(url, timeout=60):
    req = urllib.request.Request(url, headers={'User-Agent': 'massamba-asset-forge/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def search(query, n=12):
    """Openverse: CC0 or public-domain photos only (free for any use, commercial included)."""
    u = 'https://api.openverse.org/v1/images/?' + urllib.parse.urlencode({'q': query, 'license': 'cc0,pdm', 'page_size': n, 'category': 'photograph'})
    try:
        d = json.loads(http(u))
    except Exception as e:
        print('  recherche impossible :', e, file=sys.stderr)
        return []
    return [{'url': r['url'], 'licence': r['license'], 'source': r.get('foreign_landing_url') or r['url'], 'auteur': r.get('creator') or '',
             'titre': r.get('title') or '', 'w': r.get('width') or 0, 'h': r.get('height') or 0} for r in d.get('results', [])]


def model(name, url):
    import onnxruntime as ort
    os.makedirs(MODELS, exist_ok=True)
    p = os.path.join(MODELS, name)
    if not os.path.exists(p):
        print(f'  téléchargement {name}…', flush=True)
        download(url, p)
    so = ort.SessionOptions()
    so.enable_cpu_mem_arena = False  # BiRefNet at 1024² peaks high: no pre-allocated arena
    so.intra_op_num_threads = os.cpu_count() or 4
    return ort.InferenceSession(p, so, providers=['CPUExecutionProvider'])


def download(url, path, tries=6):
    """A large file through a proxy that may cut long transfers: resumed with HTTP Range until complete."""
    part = path + '.part'
    total = None
    for _ in range(tries):
        have = os.path.getsize(part) if os.path.exists(part) else 0
        req = urllib.request.Request(url, headers={'User-Agent': 'massamba-asset-forge/1.0', **({'Range': f'bytes={have}-'} if have else {})})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                if total is None:
                    cr = r.headers.get('Content-Range')
                    total = int(cr.split('/')[-1]) if cr else int(r.headers.get('Content-Length', 0)) + have
                with open(part, 'ab' if have else 'wb') as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
        except Exception as e:
            print('  reprise du téléchargement :', str(e)[:80], flush=True)
        if total and os.path.getsize(part) >= total:
            os.replace(part, path)
            return path
    raise RuntimeError(f'téléchargement incomplet : {url}')


def cutout(sess, im):
    """BiRefNet lite (MIT): the subject's alpha at the photo's resolution."""
    rgb = im.convert('RGB')
    x = np.asarray(rgb.resize((1024, 1024), Image.BILINEAR), dtype=np.float32) / 255.0
    x = (x - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    name = sess.get_inputs()[0].name
    y = sess.run(None, {name: x.transpose(2, 0, 1)[None]})[-1][0, 0]
    a = 1 / (1 + np.exp(-y))
    a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize(rgb.size, Image.BILINEAR), dtype=np.float32) / 255.0
    return a


def score(a, animal):
    """One whole subject, not cut by the frame, big enough; an animal seen from the side (wider than tall-ish)."""
    import cv2
    m = (a > 0.5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n < 2:
        return 0.0, {}
    areas = st[1:, cv2.CC_STAT_AREA]
    k = 1 + int(np.argmax(areas))
    main = areas.max() / max(1, m.sum())
    x, y, w, h, area = st[k]
    H, W = m.shape
    fill = area / (W * H)
    touch = (x <= 2) + (y <= 2) + (x + w >= W - 2) + (y + h >= H - 2)
    edge = float(np.mean((a > 0.1) & (a < 0.9)))  # a clean cut has a thin soft edge
    asp = w / max(1, h)
    s = main * min(1.0, fill / 0.12) * (0.25 ** touch) * (1.0 - min(0.5, edge * 4))
    legs = None
    if animal:
        s *= 1.0 if 0.8 <= asp <= 2.2 else 0.5
        # An animal standing on the ground shows its LEGS: the lowest 12 % of the silhouette is much narrower than
        # the body (legs), not a wide fluffy mass (hidden in grass, lying down).
        sub = (lab[y:y + h, x:x + w] == k)
        widths = sub.sum(1)
        low = widths[int(h * 0.88):]
        legs = float(low.max() / max(1, widths.max())) if len(low) else 1.0
        s *= 1.0 if legs < 0.45 else 0.3
    return float(s), {'sujet_principal': round(float(main), 3), 'occupation': round(float(fill), 3), 'bords_touches': int(touch),
                      'proportion': round(float(asp), 2), **({'pattes_visibles': legs < 0.45} if legs is not None else {})}


def crop_rgba(im, a, pad=0.04):
    rgb = np.asarray(im.convert('RGB'), dtype=np.float32) / 255.0
    ys, xs = np.nonzero(a > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    py, px = int((y1 - y0) * pad), int((x1 - x0) * pad)
    y0, x0 = max(0, y0 - py), max(0, x0 - px)
    y1 = min(a.shape[0] - 1, y1 + 2)  # the feet at the bottom edge (the engine stands the card on them)
    x1 = min(a.shape[1] - 1, x1 + px)
    out = np.dstack([rgb[y0:y1 + 1, x0:x1 + 1], a[y0:y1 + 1, x0:x1 + 1]])
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGBA')


def troupe_look(troupe_dir, cache):
    """The troupe's colour ambiance measured on ALL its drawings (alpha region): Lab lightness mean/std, chroma mean/std,
    mean warmth (a, b). Cached."""
    if cache and os.path.exists(cache):
        return json.load(open(cache))
    import glob
    import cv2
    L, C, A_, B_ = [], [], [], []
    for f in sorted(glob.glob(os.path.join(troupe_dir, '**', '*.png'), recursive=True))[:400]:
        im = np.asarray(Image.open(f).convert('RGBA'))
        a = im[..., 3] > 200
        if a.sum() < 2000:
            continue
        lab = cv2.cvtColor(im[..., :3], cv2.COLOR_RGB2LAB).astype(np.float32)
        l, aa, bb = lab[..., 0][a] * 100 / 255, lab[..., 1][a] - 128, lab[..., 2][a] - 128
        step = max(1, len(l) // 4000)
        L.append(l[::step]); A_.append(aa[::step]); B_.append(bb[::step]); C.append(np.hypot(aa, bb)[::step])
    L, A_, B_, C = (np.concatenate(v) for v in (L, A_, B_, C))
    look = {'L_mean': float(L.mean()), 'L_std': float(L.std()), 'C_mean': float(C.mean()), 'C_std': float(C.std()),
            'a_mean': float(A_.mean()), 'b_mean': float(B_.mean()), 'n_dessins': len(glob.glob(os.path.join(troupe_dir, '**', '*.png'), recursive=True))}
    if cache:
        json.dump(look, open(cache, 'w'), indent=1)
    return look


def match_look(rgba, look, warm=0.3):
    """Brings an asset into the troupe's colour ambiance (Lab, alpha region): lightness mean/contrast and colourfulness
    (chroma) like the troupe's drawings, a part of the troupe's warmth — while each colour keeps its OWN hue (a blue bottle
    stays blue)."""
    import cv2
    x = np.asarray(rgba).copy()
    a = x[..., 3] > 128
    if a.sum() < 100:
        return rgba, {}
    lab = cv2.cvtColor(x[..., :3], cv2.COLOR_RGB2LAB).astype(np.float32)
    L, A_, B_ = lab[..., 0] * 100 / 255, lab[..., 1] - 128, lab[..., 2] - 128
    l_m, l_s = L[a].mean(), L[a].std() + 1e-3
    C = np.hypot(A_, B_)
    c_m = C[a].mean() + 1e-3
    L2 = (L - l_m) * min(1.6, look['L_std'] / l_s) + (l_m + 0.85 * (look['L_mean'] - l_m))
    k = float(np.clip(look['C_mean'] / c_m, 0.8, 1.9))
    A2 = A_ * k + warm * (look['a_mean'] - A_[a].mean() * k)
    B2 = B_ * k + warm * (look['b_mean'] - B_[a].mean() * k)
    out = np.dstack([np.clip(L2 * 255 / 100, 0, 255), np.clip(A2 + 128, 0, 255), np.clip(B2 + 128, 0, 255)]).astype(np.uint8)
    rgb = cv2.cvtColor(out, cv2.COLOR_LAB2RGB)
    x[..., :3] = np.where(a[..., None], rgb, x[..., :3])
    return Image.fromarray(x, 'RGBA'), {'luminosite': round(float(look['L_mean'] - l_m), 1), 'chroma_x': round(k, 2)}


def grade_to_troupe(rgba, ref_path):
    """Fallback style step: bring the photo's colours to the troupe's signature (saturation, contrast, warmth)."""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blenderfilm'))
    import style
    x = np.asarray(rgba, dtype=np.float64) / 255.0
    sig = style.signature(x[..., :3], x[..., 3])
    ref = json.load(open(ref_path)) if ref_path and os.path.exists(ref_path) else None
    if not ref:
        return rgba, {}
    g, gains = style.grade(x[..., :3], sig, ref)
    return Image.fromarray((np.dstack([g, x[..., 3]]) * 255).astype(np.uint8), 'RGBA'), gains


_PIPE = None


def style_distance(rgba, ref):
    """How far an asset's look is from the troupe's drawings (style.py signature, per feature: distance outside the
    troupe's band + a little distance to its median, in units of the band width). 0 = inside the band everywhere."""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blenderfilm'))
    import style
    x = np.asarray(rgba, dtype=np.float64) / 255.0
    sig = style.signature(x[..., :3], x[..., 3])
    d, detail = 0.0, {}
    for k, (v, lo, hi, ok) in style.compare(sig, ref).items():
        w = max(1e-6, hi - lo)
        # outside the troupe's band is a fault; and the look is pulled toward the troupe's MEDIAN (not just its band)
        dk = max(0.0, lo - v, v - hi) / w + 0.6 * abs(v - ref[k]['median']) / w
        d += dk
        detail[k] = round(dk, 3)
    return d, detail


def crisp_like_troupe(rgba, ref, max_amount=1.6):
    """The troupe's drawings are crisp (fine detail, local contrast): an unsharp mask whose strength is measured so the
    asset's high-frequency detail reaches the troupe's median (style.py 'detail')."""
    if not ref:
        return rgba
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blenderfilm'))
    import style
    import cv2
    x = np.asarray(rgba).astype(np.float32) / 255.0
    rgb, a = x[..., :3], x[..., 3]
    target = ref['detail']['median']
    best = rgba
    for amt in np.linspace(0.0, max_amount, 9):
        blur = cv2.GaussianBlur(rgb, (0, 0), 1.2)
        sh = np.clip(rgb + amt * (rgb - blur), 0, 1)
        d = style.signature(sh, a)['detail']
        best = Image.fromarray((np.dstack([sh, a]) * 255).astype(np.uint8), 'RGBA')
        if d >= target:
            break
    return best


def iou(a, b):
    import cv2
    b = cv2.resize(b.astype(np.float32), (a.shape[1], a.shape[0]), interpolation=cv2.INTER_LINEAR)
    A, B = a > 0.5, b > 0.5
    return float((A & B).sum() / max(1, (A | B).sum()))


def stylize(rgba, spec, strength=0.45, seed=7, size=None, plate=False):
    """The real subject redrawn in the troupe's style (3D animated film look) — LCM Dreamshaper v7 (MIT licence),
    image-to-image at a moderate strength: the real shape and colours are kept. On a plain green background (keyed
    again afterwards). Returns RGB or None when the models are not available on this machine."""
    try:
        import torch
        from diffusers import AutoPipelineForImage2Image, LCMScheduler
    except ImportError:
        print('  (style : diffusers/torch absents — étalonnage seul)', flush=True)
        return None
    global _PIPE
    if _PIPE is None:
        _PIPE = AutoPipelineForImage2Image.from_pretrained('SimianLuo/LCM_Dreamshaper_v7', torch_dtype=torch.float32, safety_checker=None,
                                                           requires_safety_checker=False, cache_dir=os.path.join(MODELS, 'hf'))
        _PIPE.scheduler = LCMScheduler.from_config(_PIPE.scheduler.config)
        _PIPE.set_progress_bar_config(disable=True)
    pipe = _PIPE
    torch.set_num_threads(os.cpu_count() or 4)
    style_img = spec.get('_style_image')
    if style_img is not None and not getattr(pipe, '_ipa', False):
        # A blocked source never stops the forge: the same weights from a local copy, the official repository, a mirror;
        # then without the adapter (the colour ambiance is still matched afterwards).
        sources = [(os.path.join(MODELS, 'ip-adapter'), {}), ('h94/IP-Adapter', {'cache_dir': os.path.join(MODELS, 'hf')}),
                   ('InvokeAI/ip_adapter_sd15', {'cache_dir': os.path.join(MODELS, 'hf')})]
        for src, kw in sources:
            if src.startswith('/') and not os.path.isfile(os.path.join(src, 'models', 'ip-adapter_sd15.safetensors')):
                continue
            try:
                pipe.load_ip_adapter(src, subfolder='models', weight_name='ip-adapter_sd15.safetensors', **kw)
                pipe.set_ip_adapter_scale(0.6)
                pipe._ipa = True
                print(f'  IP-Adapter (Apache-2.0) chargé depuis {src} : les dessins de la troupe guident le rendu', flush=True)
                break
            except Exception as e:
                print(f'  IP-Adapter indisponible depuis {src} :', str(e)[:90], '— source suivante', flush=True)
        if not getattr(pipe, '_ipa', False):
            style_img = None
    ipa = {'ip_adapter_image': style_img} if style_img is not None and getattr(pipe, '_ipa', False) else {}
    bg = Image.new('RGBA', rgba.size, (96, 178, 96, 255))
    bg.alpha_composite(rgba)
    w, h = rgba.size
    if size is None:
        k = 640 / max(w, h)
        size = (max(64, int(w * k) // 8 * 8), max(64, int(h * k) // 8 * 8))
    where = '' if plate else ', plain flat green background'
    prompt = (f"3d animated movie still, pixar style render of {spec.get('decrit', 'the subject')}{where}, "
              'warm golden sunlight, vibrant saturated colors, glossy highlights, crisp details, strong contrast, smooth stylized shapes, high quality')
    neg = 'photo, realistic, grainy, noisy, blurry, deformed, extra legs, scenery, grass, text'
    out = pipe(prompt=prompt, negative_prompt=neg, image=bg.convert('RGB').resize(size, Image.LANCZOS), strength=strength,
               num_inference_steps=8, guidance_scale=1.5, generator=torch.manual_seed(seed), **ipa).images[0]
    return out


def decor_main(A):
    """Real places → painted sets of the engine: photos with a visible GROUND (the actors stand on it) and few people
    (an empty stage), redrawn in the style of the troupe's painted sets (IP-Adapter with their sets as the style image,
    calibrated on their measured signature). Several views per place. Then troupe-enhance.py gives each view its HD,
    depth and walkable floor."""
    spec = DECORS[A.espece]
    out = os.path.join(A.out, 'decors', A.espece)
    os.makedirs(out, exist_ok=True)
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blenderfilm'))
    import ground
    import onnxruntime as ort
    seg_p = os.path.join(MODELS, 'upernet-convnext-small-ade.onnx')
    seg = ort.InferenceSession(seg_p, providers=['CPUExecutionProvider']) if os.path.exists(seg_p) else None
    cands, seen = [], set()
    for q in spec['q']:
        for r in search(q, A.n):
            if r['url'] in seen or r['w'] < 1200 or r['w'] / max(1, r['h']) < 1.3:
                continue
            seen.add(r['url'])
            cands.append(r)
    print(f'{A.espece}: {len(cands)} photo(s) libres de lieux candidates', flush=True)
    scored = []
    for i, r in enumerate(cands[: A.n * 3]):
        try:
            im = Image.open(io.BytesIO(http(r['url']))).convert('RGB')
            im.thumbnail((1600, 1600))
        except Exception as e:
            print('  ignorée :', str(e)[:60])
            continue
        m = {}
        if seg is not None:
            import importlib.util
            spec_e = importlib.util.spec_from_file_location('te', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'troupe-enhance.py'))
            te = importlib.util.module_from_spec(spec_e)
            spec_e.loader.exec_module(te)
            lab, walk = te.segment(seg, im)
            lab, walk = np.asarray(lab), np.asarray(walk) > 0
            m = {'sol': round(float(walk.mean()), 3), 'personnes': round(float((lab == ground.PERSON).mean()), 3),
                 'sol_en_bas': round(float(walk[int(walk.shape[0] * 0.7):].mean()), 3)}
        sharp = float(np.var(np.diff(np.asarray(im.convert('L'), dtype=np.float32), axis=1)))
        s_ = (min(1.0, m.get('sol_en_bas', 0.3) / 0.35) * max(0.0, 1 - m.get('personnes', 0) / 0.2) * min(1.0, sharp / 120.0))
        r.update({'score': round(s_, 3), 'mesures': m})
        print(f"  {i:2d} score {s_:.3f} {m} — {r['titre'][:50]} ({r['licence']})", flush=True)
        scored.append((s_, i, r, im))
    scored.sort(key=lambda t: -t[0])
    views = []
    for k, (s_, i, r, im) in enumerate(scored[: A.vues]):
        if s_ < 0.15:
            break
        sty = None if A.no_style else stylize_decor(im, spec, A)
        name = f'vue-{k + 1}'
        im.save(os.path.join(out, f'{name}-photo.jpg'), quality=92)
        (sty or im).save(os.path.join(out, f'{name}.jpg'), quality=92)
        views.append({'vue': name, 'score': s_, 'provenance': {kk: r[kk] for kk in ('url', 'source', 'licence', 'auteur', 'titre')}, 'mesures': r['mesures'],
                      'style': 'repris dans le style des décors de la troupe' if sty is not None else 'photo'})
        print(f"  → {name} : {r['titre'][:50]} ({r['licence']})", flush=True)
    json.dump({'lieu': A.espece, 'vues': views}, open(os.path.join(out, 'decor.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'{len(views)} vue(s) de « {A.espece} » → {out}')


def stylize_decor(im, spec, A, strength=0.42):
    """A real place redrawn in the troupe's painted-set style (1024 × 512 landscape)."""
    sub = dict(spec)
    sub['decrit'] = spec['decrit'] + ', empty of people, background plate for an animated film'
    if A.troupe_decors and os.path.isdir(A.troupe_decors):
        import glob
        fs = sorted(glob.glob(os.path.join(A.troupe_decors, 'decor-*.jpg')))[:4]
        if fs:
            col = Image.new('RGB', (1024, 512))
            for i_, f in enumerate(fs):
                t = Image.open(f).convert('RGB').resize((512, 256))
                col.paste(t, ((i_ % 2) * 512, (i_ // 2) * 256))
            sub['_style_image'] = col
    w, h = im.size
    base = im.resize((1024, max(256, int(1024 * h / w) // 8 * 8)), Image.LANCZOS)
    rgba = base.convert('RGBA')
    return stylize(rgba, sub, strength, seed=11, size=base.size, plate=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('espece')
    ap.add_argument('--n', type=int, default=12)
    ap.add_argument('--style-ref', default='', help='style-ref.json (signature visuelle de la troupe)')
    ap.add_argument('--out', default=ASSETS)
    ap.add_argument('--no-style', action='store_true', help='sans reprise de style (photo étalonnée seulement)')
    ap.add_argument('--troupe', default='', help='dossier des dessins de la troupe (référence de style et de couleurs)')
    ap.add_argument('--reutiliser', action='store_true', help='reprendre la photo déjà choisie et détourée (seulement le style)')
    ap.add_argument('--decor', action='store_true', help='un LIEU (vues réelles reprises en décors peints) au lieu d’un animal / objet')
    ap.add_argument('--vues', type=int, default=3, help='nombre de vues du lieu')
    ap.add_argument('--troupe-decors', default='', help='dossier des décors peints de la troupe (référence de style des lieux)')
    A = ap.parse_args()
    if A.decor:
        return decor_main(A)
    spec = dict(CATALOGUE[A.espece])
    look = None
    if A.troupe and os.path.isdir(A.troupe):
        look = troupe_look(A.troupe, os.path.join(A.out, 'troupe-look.json'))
        import glob
        files = sorted(glob.glob(os.path.join(A.troupe, '**', '*.png'), recursive=True))
        if files:
            # The style image: a collage of a few troupe drawings on the green ground (their light, colours, rendering).
            tiles = []
            for f in files[:: max(1, len(files) // 6)][:6]:
                t = Image.open(f).convert('RGBA')
                t.thumbnail((180, 300))
                bg = Image.new('RGBA', (180, 300), (96, 178, 96, 255))
                bg.alpha_composite(t, ((180 - t.size[0]) // 2, 300 - t.size[1]))
                tiles.append(bg)
            col = Image.new('RGB', (180 * 3, 300 * 2), (96, 178, 96))
            for i_, t in enumerate(tiles):
                col.paste(t.convert('RGB'), ((i_ % 3) * 180, (i_ // 3) * 300))
            spec['_style_image'] = col
    out = os.path.join(A.out, A.espece)
    os.makedirs(out, exist_ok=True)
    sess = model(*BIREFNET)
    prev = os.path.join(out, 'asset.json')
    if A.reutiliser and os.path.exists(os.path.join(out, 'photo.png')) and os.path.exists(prev):
        # The photo already chosen and cut out: only the style step is run again.
        old = json.load(open(prev))
        r = dict(old['provenance'])
        best = (old.get('score', 1.0), old.get('choisie', 0), r, None, None)
        cands = []
    else:
        best = None
        cands = []
    seen = set()
    for q in (spec['q'] if best is None else ()):
        for r in search(q, A.n):
            if r['url'] in seen or min(r['w'], r['h']) < 500:
                continue
            seen.add(r['url'])
            cands.append(r)
    print(f'{A.espece}: {len(cands)} photo(s) libres candidates' if best is None else f'{A.espece}: photo déjà choisie reprise', flush=True)
    for i, r in enumerate(cands[: A.n * 2]):
        try:
            im = Image.open(io.BytesIO(http(r['url'])))
            im.thumbnail((1400, 1400))
        except Exception as e:
            print('  ignorée (téléchargement) :', str(e)[:80])
            continue
        a = cutout(sess, im)
        s, m = score(a, spec['animal'])
        r.update({'score': round(s, 3), 'mesures': m})
        print(f"  {i:2d} score {s:.3f} {m} — {r['titre'][:50]} ({r['licence']})", flush=True)
        crop_rgba(im, a).save(os.path.join(out, f'candidat-{i:02d}.png'))
        if best is None or s > best[0]:
            best = (s, i, r, im, a)
    if best is None:
        raise SystemExit('aucune photo exploitable')
    s, i, r, im, a = best
    if im is None:
        rgba = Image.open(os.path.join(out, 'photo.png')).convert('RGBA')
    else:
        rgba = crop_rgba(im, a)
        rgba.save(os.path.join(out, 'photo.png'))
    methode = 'photo libre (Openverse, CC0/PDM) → détourage BiRefNet lite (MIT)'
    ref = json.load(open(A.style_ref)) if A.style_ref and os.path.exists(A.style_ref) else None
    essais = []
    if not A.no_style:
        # CALIBRATION against the troupe: several strengths and seeds; the kept one is the closest to the troupe's
        # measured look whose silhouette stays the real one (IoU with the photo ≥ 0.72) — an animal keeps its legs.
        a_photo = np.asarray(rgba)[..., 3] / 255.0
        best_sty = None
        for strength in (0.48, 0.56, 0.64):
            for seed in (7, 21, 33):
                sty = stylize(rgba, spec, strength, seed)
                if sty is None:
                    break
                a2 = cutout(sess, sty)
                cand = crop_rgba(sty, a2)
                fid = iou(np.asarray(cand)[..., 3] / 255.0, a_photo)
                _sc, det = score(a2, spec['animal'])
                cand = crisp_like_troupe(cand, ref)
                dist, dd = style_distance(cand, ref) if ref else (0.0, {})
                ok = fid >= 0.80 and (not spec['animal'] or det.get('pattes_visibles', True))
                essais.append({'force': strength, 'graine': seed, 'fidelite_silhouette': round(fid, 3), 'distance_style': round(dist, 3),
                               'pattes_visibles': det.get('pattes_visibles'), 'retenu': False, 'detail': dd})
                print(f"  style force {strength:.2f} graine {seed}: fidélité {fid:.2f}, distance au style troupe {dist:.2f}{'' if ok else ' (rejeté)'}", flush=True)
                cand.save(os.path.join(out, f'style-{int(strength * 100)}-{seed}.png'))
                if ok and (best_sty is None or dist < best_sty[0]):
                    best_sty = (dist, cand, len(essais) - 1)
            if sty is None:
                break
        if best_sty is not None:
            dist, rgba, k = best_sty
            essais[k]['retenu'] = True
            methode += (f" → repris dans le style de la troupe (LCM Dreamshaper v7, MIT, image→image force {essais[k]['force']:.2f}, "
                        f"calibré : distance au style {dist:.2f}, silhouette fidèle à {100 * essais[k]['fidelite_silhouette']:.0f} %) → détourage")
    styled, gains = grade_to_troupe(rgba, A.style_ref)
    methode += ' → étalonnage vers la signature visuelle de la troupe'
    if look:
        styled, lk = match_look(styled, look)
        gains.update(lk)
        methode += f" → ambiance de couleurs de la troupe (Lab, mesurée sur {look['n_dessins']} dessins)"
    styled.save(os.path.join(out, 'asset.png'))
    meta = {'espece': A.espece, 'hauteur_m': spec['hauteur'], 'animal': spec['animal'], 'choisie': i, 'score': s,
            'provenance': {k: r[k] for k in ('url', 'source', 'licence', 'auteur', 'titre')}, 'etalonnage': gains,
            'methode': methode, 'calibration': essais}
    json.dump(meta, open(os.path.join(out, 'asset.json'), 'w'), ensure_ascii=False, indent=1)
    print(f"→ {out}/asset.png (candidat {i}, score {s:.3f}, {r['licence']} — {r['source']})")


if __name__ == '__main__':
    main()
