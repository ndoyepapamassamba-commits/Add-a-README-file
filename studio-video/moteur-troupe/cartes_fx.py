# CARTES DE CLÔTURE DE SKETCH REDESSINÉES (18/10/2026) — « les émojis de clôture de chaque sketch : il faut les rendre beaucoup
# plus beaux, beaucoup plus attractifs, revoir le design ». Avant : un émoji 3D posé à plat, grossi par paliers (×1,32 puis
# ×1,15), et le titre jaune dessous. Maintenant, sur la fin du sketch assombrie :
#   · un SOLEIL DE RAYONS néon (cyan / rose de la chaîne) qui tourne lentement derrière l'émoji, avec un halo doré ;
#   · l'émoji ENTRE EN POP élastique (0 → 1,25 → 0,94 → 1 en 0,4 s) puis rit : rebond et balancement amortis (±9°) ;
#   · ombre portée douce, éclats d'étoiles qui scintillent autour, deux petits émojis satellites qui entrent par les côtés ;
#   · le titre du sketch suivant sur un RUBAN incliné (dégradé rose → violet, liseré cyan), lettres blanches à contour, et
#     un compteur « SKETCH 2/3 » au-dessus (repère de progression : on reste pour la suite).
# Tout est dessiné net (polygones, aplats, alpha) : aucun flou de fond. Rendu en RGBA à la taille du clip, sans état.
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/fonts/Montserrat.ttf'
CYAN, ROSE, VIOLET, JAUNE, OR = (37, 244, 238), (254, 44, 85), (120, 40, 200), (255, 210, 63), (255, 190, 40)
# ÉMOJIS ANIMÉS (18/10/2026, « il faut mettre des émojis animés ») : Animated Noto Emoji de Google (CC BY 4.0, crédit dans la
# légende de publication), WebP animés 512 px dessinés image par image — 1f602 rire aux larmes (59 images), 1f923 mort de
# rire, 1f92d main sur la bouche. Mis en cache hors dépôt ; repli sur les émojis 3D fixes (Fluent, MIT) s'ils manquent.
ANIMES = os.path.expanduser(os.environ.get('EMOJI_ANIMES', '~/.cache/massamba-models/emoji-anime'))
PRINCIPAUX = ['1f602', '1f923', '1f602']
SATELLITES = ['1f923', '1f92d']
FIXE = {'1f602': 'face_with_tears_of_joy', '1f923': 'rolling_on_the_floor_laughing', '1f92d': 'face_with_open_mouth'}
_EMO, _ANIM = {}, {}


def _anime(cp):
    """images RGBA et durées (s) de l'émoji animé, téléchargé une fois (fonts.gstatic.com, Noto, CC BY 4.0)."""
    if cp in _ANIM: return _ANIM[cp]
    f = f'{ANIMES}/{cp}.webp'
    if not os.path.isfile(f):
        try:
            import subprocess; os.makedirs(ANIMES, exist_ok=True)
            subprocess.run(['curl', '-s', '-m', '60', '-o', f, f'https://fonts.gstatic.com/s/e/notoemoji/latest/{cp}/512.webp'], check=True)
        except Exception: pass
    fr = []
    try:
        im = Image.open(f)
        if getattr(im, 'n_frames', 1) < 2: raise ValueError('pas animé')
        for k in range(getattr(im, 'n_frames', 1)):
            im.seek(k); fr.append((im.convert('RGBA').copy(), (im.info.get('duration') or 33) / 1000.0))
    except Exception:
        fr = []
    _ANIM[cp] = fr
    return fr


_DISPO = []
def disponibles():
    """codes des émojis animés publiés par Noto (api.json, 881 le 18/10/2026) — un code absent n'est jamais affiché."""
    if not _DISPO:
        f = f'{ANIMES}/api.json'
        try:
            if not os.path.isfile(f):
                import subprocess; os.makedirs(ANIMES, exist_ok=True)
                subprocess.run(['curl', '-s', '-f', '-m', '60', '-o', f, 'https://googlefonts.github.io/noto-emoji-animation/data/api.json'], check=True)
            import json; _DISPO.extend(x['codepoint'] for x in json.load(open(f))['icons'])
        except Exception: _DISPO.extend(FIXE)
    return _DISPO


def _statique(cp):
    """émoji fixe Noto (PNG 128 px, Apache-2.0) quand la version animée n'existe pas."""
    f = f'{ANIMES}/{cp}.png'
    if not os.path.isfile(f):
        try:
            import subprocess; os.makedirs(ANIMES, exist_ok=True)
            subprocess.run(['curl', '-s', '-f', '-m', '60', '-o', f, f'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/png/128/emoji_u{cp}.png'], check=True)
        except Exception: return None
    try: return Image.open(f).convert('RGBA')
    except Exception: return None


def _image_emoji(cp, d, u):
    """l'émoji `cp` à l'instant u (s), taille d × d : image animée si présente, sinon l'émoji 3D fixe ; None si l'émoji
    n'existe pas (jamais un émoji de remplacement qui dirait autre chose)."""
    if cp not in disponibles() and cp not in FIXE: return None
    fr = _anime(cp)
    if fr:
        tot = sum(x[1] for x in fr); v = u % tot; k = 0
        while k < len(fr) - 1 and v >= fr[k][1]: v -= fr[k][1]; k += 1
        cle = (cp, k, d)
        if cle not in _EMO: _EMO[cle] = fr[k][0].resize((d, d), Image.LANCZOS)
        return _EMO[cle]
    if cp not in FIXE: return None
    return _emoji(FIXE[cp], d)


def _police(sz, style=b'Black'):
    f = ImageFont.truetype(FONT, sz)
    try: f.set_variation_by_name(style)
    except Exception: pass
    return f


def _emoji(nom, d):
    k = (nom, d)
    if k not in _EMO:
        f = f'emoji/{nom}.png'
        im = Image.open(f if os.path.isfile(f) else 'emoji/face_with_tears_of_joy.png').convert('RGBA')
        _EMO[k] = im.resize((d, d), Image.LANCZOS)
    return _EMO[k]


def _pop(u):
    """échelle élastique : 0 → 1,25 (0,18 s) → 0,94 (0,3 s) → 1 (0,4 s), u en secondes depuis l'entrée."""
    if u <= 0: return 0.0
    if u < 0.18: x = u / 0.18; return 1.25 * (1 - (1 - x) ** 3)
    if u < 0.30: x = (u - 0.18) / 0.12; return 1.25 - 0.31 * x * x * (3 - 2 * x)
    if u < 0.40: x = (u - 0.30) / 0.10; return 0.94 + 0.06 * x * x * (3 - 2 * x)
    return 1.0


def _etoile(dr, x, y, r, a, coul):
    pts = []
    for k in range(8):
        rr = r if k % 2 == 0 else r * 0.28; th = k * math.pi / 4 + math.pi / 8 * 0
        pts.append((x + rr * math.cos(th), y + rr * math.sin(th)))
    dr.polygon(pts, fill=coul + (int(255 * a),))


def carte(W, H, u, titre, rang, total, place, nom_emoji=None):
    """calque RGBA (H × W × 4, uint8) de la carte à l'instant u (s depuis le début de la carte)."""
    ex, ey, ty, base = place
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    s = _pop(u); R = base * 0.5
    # 1. soleil de rayons fins qui tourne (16 rayons alternés cyan / rose), halo doré léger
    if s > 0:
        Rr = R * 2.0 * min(1.0, s); ang0 = u * 0.8
        for k in range(16):
            a0 = ang0 + k * math.pi / 8; a1 = a0 + math.pi / 40
            coul = (CYAN if k % 2 else ROSE) + (70,)
            dr.polygon([(ex + 0.55 * R * math.cos(a0), ey + 0.55 * R * math.sin(a0)), (ex + Rr * math.cos(a0), ey + Rr * math.sin(a0)),
                        (ex + Rr * math.cos(a1), ey + Rr * math.sin(a1)), (ex + 0.55 * R * math.cos(a1), ey + 0.55 * R * math.sin(a1))], fill=coul)
        rr = R * 1.18 * min(1.0, s); dr.ellipse((ex - rr, ey - rr, ex + rr, ey + rr), fill=OR + (55,))
    # 2. émoji principal ANIMÉ (pop élastique, léger balancement amorti)
    if s > 0:
        ang = 6.0 * math.sin(2 * math.pi * 1.6 * u) * math.exp(-1.1 * u)
        d = max(8, int(base * s)); e = _image_emoji(nom_emoji or PRINCIPAUX[(rang - 1) % len(PRINCIPAUX)], d, u)
        if abs(ang) > 0.3: e = e.rotate(ang, resample=Image.BICUBIC, expand=True)
        im.alpha_composite(e, (int(ex - e.width / 2), int(ey - e.height / 2)))
    # 3. éclats d'étoiles qui scintillent
    for k in range(7):
        th = k * 2 * math.pi / 7 + 0.4; rr = R * (1.55 + 0.25 * (k % 3))
        a = max(0.0, math.sin(2 * math.pi * (1.6 * u + k * 0.37))) * min(1.0, s)
        if a > 0.05: _etoile(dr, ex + rr * math.cos(th), ey + rr * math.sin(th), 6 + 4 * (k % 2), a, (255, 255, 255) if k % 2 else JAUNE)
    # 4. deux petits émojis satellites qui entrent par les côtés
    for j, (nom, cote) in enumerate(zip(SATELLITES, (-1, 1))):
        v = min(1.0, max(0.0, (u - 0.12 - 0.08 * j) / 0.3)); v = 1 - (1 - v) ** 3
        if v <= 0: continue
        d2 = int(base * 0.42); e2 = _image_emoji(nom, d2, u + 0.3 * j).rotate(cote * 12, resample=Image.BICUBIC, expand=True)
        x2 = ex + cote * (R * 1.7) * v + cote * (1 - v) * W * 0.6; y2 = ey + R * 0.55 + 6 * math.sin(2 * math.pi * 1.8 * u + j)
        if v >= 1: x2 = min(max(x2, e2.width / 2 + 6), W - e2.width / 2 - 6)   # jamais coupé par le bord du cadre
        im.alpha_composite(e2, (int(x2 - e2.width / 2), int(y2 - e2.height / 2)))
    # 5. compteur + ruban incliné du titre
    if titre:
        f = _police(30); fz = _police(15, b'Bold')
        larg = min(W - 40, max(f.getlength(l) for l in [titre]) + 60); h = 58
        rub = Image.new('RGBA', (int(larg), h), (0, 0, 0, 0)); a_ = np.linspace(0, 1, int(larg))[None, :, None]
        g = (np.array(ROSE) * (1 - a_) + np.array(VIOLET) * a_) * np.ones((h, 1, 1))
        rub_np = np.dstack([g, np.full((h, int(larg), 1), 235)]).astype(np.uint8); rub = Image.fromarray(rub_np, 'RGBA')
        dr2 = ImageDraw.Draw(rub); dr2.rectangle((0, 0, int(larg) - 1, 3), fill=CYAN + (255,)); dr2.rectangle((0, h - 4, int(larg) - 1, h - 1), fill=CYAN + (255,))
        ft = f
        while ft.getlength(titre) > larg - 30 and ft.size > 18: ft = _police(ft.size - 2)
        dr2.text((larg / 2, h / 2), titre, font=ft, fill=(255, 255, 255, 255), anchor='mm', stroke_width=3, stroke_fill=(30, 10, 40, 255))
        # TITRE LISIBLE DÈS LA PREMIÈRE IMAGE (18/10/2026, v4 : le ruban entrait en fondu 0,08–0,33 s, JEV jugeait le titre
        # « illisible » sur les 5 premières images de chaque carte) : opaque d'emblée, seule son échelle s'anime (0,9 → 1)
        v = 1.0; e_ = min(1.0, max(0.0, u / 0.2)); k_ = 0.9 + 0.1 * (1 - (1 - e_) ** 3)
        rub = rub.resize((max(1, int(rub.width * k_)), max(1, int(rub.height * k_))), Image.LANCZOS).rotate(-4, resample=Image.BICUBIC, expand=True)
        if v > 0:
            al = np.array(rub); al[..., 3] = (al[..., 3] * v).astype(np.uint8); rub = Image.fromarray(al)
            im.alpha_composite(rub, (int(W / 2 - rub.width / 2), int(ty)))
            lab = f'SKETCH {rang}/{total}'; lw = fz.getlength(lab) + 22
            pastille = Image.new('RGBA', (int(lw), 24), (0, 0, 0, 0)); dp = ImageDraw.Draw(pastille)
            dp.rounded_rectangle((0, 0, int(lw) - 1, 23), radius=12, fill=(20, 12, 40, int(230 * v)), outline=JAUNE + (int(255 * v),), width=2)
            dp.text((lw / 2, 12), lab, font=fz, fill=JAUNE + (int(255 * v),), anchor='mm')
            im.alpha_composite(pastille, (int(W / 2 - lw / 2), int(ty - 28)))
    return np.array(im)
