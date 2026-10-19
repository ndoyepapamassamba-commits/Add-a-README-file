# CONTRÔLE DE LA TROUPE AVANT PUBLICATION (19/10/2026). Consigne : « un contrôle automatique de l'âge apparent, qui bloquera
# la publication tant qu'il échoue » ; « les personnages qui se regardent, la taille des têtes par rapport au corps » ;
# « je préfère les dessins animés de la troupe ». Trois mesures par personnage, sur la scène préparée d'un lieu :
#  1. ÂGE APPARENT — SigLIP (Apache-2.0, google/siglip-base-patch16-224) compare le visage, puis le corps entier, à des
#     tranches d'âge écrites (« une petite fille », « une femme d'une cinquantaine d'années »…). Le corps entier compte : une
#     tête trop grosse sur un corps court se lit « enfant » même si le visage est celui d'une adulte. Conforme si la
#     probabilité des tranches attendues (carte adn.py) dépasse 0,5 sur le visage ET sur le corps (règle « aucune
#     tolérance » : > 0,5 sur chaque image contrôlée).
#  2. PROPORTIONS — hauteur de tête par la ligne des yeux (au milieu de la tête : H = 2 × (menton − yeux)), puis nombre de
#     têtes entre le sommet du crâne et les hanches (repères de pose). Canon du dessin : l'adulte mesure 7,5 à 8 têtes,
#     hanches à mi-hauteur ; l'enfant de 8–12 ans 6 à 7 têtes (guides de proportions, cités dans le registre). Le dessin
#     animé réduit tout, on compare donc les personnages entre eux : un adulte doit compter plus de têtes que l'enfant
#     (PROP_ECART) ; mesure rapportée pour chaque personnage.
#  3. REGARD — orientation peinte du visage (même modèle que tourne.py : nez entre les yeux, + = vers la droite de
#     l'écran) : chaque personnage doit pouvoir se tourner vers CHACUN de ses partenaires d'au moins REGARD_MIN degrés, avec
#     ce que le moteur ajoute au dessin (TOUR_MAX : 6° au squelette pour un visage de trois quarts + 18° au visage par
#     LivePortrait, jeu.LACET_VISAGE). 19/10/2026 : l'ancienne règle « tourné vers un partenaire » refusait Petit Mamadou,
#     peint de face, que le moteur tourne pourtant vers ses parents (juge local des regards sur la v9 : 0,99 et 1,0), et ne
#     voyait pas que Maman Nounou, peinte tournée de 32° vers l'enfant, ne peut pas se tourner vers Baye (0 sur 4 répliques).
#   python3 controle_troupe.py prep/<lieu> [prep/<lieu> …]        → rapport JSON, code de sortie 1 si un lieu échoue
import json, math, os, re, sys
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
SIGLIP = os.path.expanduser(os.environ.get('CONTROLE_SIGLIP', '~/.cache/massamba-models/age'))
REGARD_MIN = float(os.environ.get('REGARD_MIN', 10.0))     # degrés vers le partenaire, atteignables avec le jeu du moteur
TOUR_MAX = 24.0                                            # degrés que le moteur ajoute au visage peint (squelette 6 + LivePortrait 18)
PROP_ECART = float(os.environ.get('PROP_ECART', 0.4))      # têtes de plus pour un adulte que pour l'enfant de la scène
STYLE = {'dessin': 'a 3D animated cartoon character, ', 'photo': 'a photo of '}
TRANCHES = ['enfant', 'ado', 'vingtaine', 'trentaine', 'cinquantaine', 'aine']
TEXTES = {'f': ['a little girl', 'a teenage girl', 'a young woman in her twenties', 'a woman in her thirties',
                'a middle-aged woman in her fifties', 'an old woman'],
          'm': ['a little boy', 'a teenage boy', 'a young man in his twenties', 'a man in his thirties',
                'a middle-aged man in his fifties', 'an old man']}
_M = {}


def carte(nom):
    """âge (années) et genre tirés de la carte adn.py."""
    import adn
    c = adn.ADN.get(nom, '').lower(); g = 'f' if re.search(r'\b(woman|girl|grandmother|she|her)\b', c) else 'm'
    m = re.search(r'(\d+)-year-old', c) or re.search(r'about (\d+)', c)
    if m: return int(m.group(1)), g
    d = re.search(r'(early |late )?(twenties|thirties|forties|fifties|sixties|seventies)', c)
    base = {'twenties': 20, 'thirties': 30, 'forties': 40, 'fifties': 50, 'sixties': 60, 'seventies': 70}
    if d: return base[d.group(2)] + {'early ': 2, 'late ': 8}.get(d.group(1) or '', 5), g
    return None, g


def attendues(age):
    if age is None: return set(TRANCHES)
    if age < 13: return {'enfant'}
    if age < 20: return {'ado'}
    if age < 30: return {'vingtaine', 'trentaine'}
    if age < 45: return {'vingtaine', 'trentaine'} if age < 36 else {'trentaine', 'cinquantaine'}
    if age < 60: return {'cinquantaine'}
    return {'cinquantaine', 'aine'}


def _siglip():
    if 'm' not in _M:
        import torch
        from transformers import AutoProcessor, AutoModel
        _M['m'] = (AutoProcessor.from_pretrained(SIGLIP), AutoModel.from_pretrained(SIGLIP).eval(), torch)
    return _M['m']


def tranches(img_rgb, genre, style='dessin'):
    """probabilité de chaque tranche d'âge (softmax des scores SigLIP sur les 6 phrases)."""
    P, M, torch = _siglip()
    t = [STYLE[style] + x for x in TEXTES[genre]]
    with torch.no_grad():
        x = P(text=t, images=img_rgb, padding='max_length', return_tensors='pt')
        lg = M(**x).logits_per_image[0]
    p = torch.softmax(lg, 0).numpy()
    return {k: round(float(v), 3) for k, v in zip(TRANCHES, p)}


def _boite(x0, y0, x1, y1, W, H, k=1.0):
    cx, cy, w, h = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * k, (y1 - y0) * k
    return int(max(0, cx - w / 2)), int(max(0, cy - h / 2)), int(min(W, cx + w / 2)), int(min(H, cy + h / 2))


def controle(d, style=None):
    S = json.load(open(f'{d}/scene.json')); img = cv2.cvtColor(cv2.imread(f'{d}/image.png'), cv2.COLOR_BGR2RGB); H, W = img.shape[:2]
    style = style or ('photo' if os.path.isfile(f'{d}/photo.json') else 'dessin')
    A = S['acteurs']; R = {'lieu': os.path.basename(os.path.normpath(d)), 'style': style, 'personnages': {}, 'echecs': []}
    for a in A:
        sl = a['slug']; f3 = f'{d}/rig/visage3d-{sl}.npy'; v3 = np.load(f3) if os.path.isfile(f3) else None
        age, genre = carte(a['nom']); att = attendues(age); r = {'age_carte': age, 'tranches_attendues': sorted(att)}
        # — visage et corps
        if v3 is not None:
            fx0, fy0 = v3[:, 0].min(), v3[:, 1].min(); fx1, fy1 = v3[:, 0].max(), v3[:, 1].max()
        else:
            fx0, fy0, fx1, fy1 = a['visage']['box']
        bx = _boite(fx0, fy0, fx1, fy1, W, H, 1.6); bb = a['bbox']
        pv = tranches(img[bx[1]:bx[3], bx[0]:bx[2]], genre, style); pc = tranches(img[bb[1]:bb[3], bb[0]:bb[2]], genre, style)
        r['age_visage'] = round(sum(pv[t] for t in att), 3); r['age_corps'] = round(sum(pc[t] for t in att), 3)
        r['tranche_visage'] = max(pv, key=pv.get); r['tranche_corps'] = max(pc, key=pc.get)
        if r['age_visage'] <= 0.5: R['echecs'].append(f"{a['nom']} : visage lu « {r['tranche_visage']} » (attendu {'/'.join(sorted(att))}, {r['age_visage']})")
        if r['age_corps'] <= 0.5: R['echecs'].append(f"{a['nom']} : silhouette lue « {r['tranche_corps']} » (attendu {'/'.join(sorted(att))}, {r['age_corps']})")
        # — proportions : têtes du sommet du crâne aux hanches
        pts = np.array(a['pts'])[:, :2]
        if v3 is not None:
            yeux = (v3[33, 1] + v3[263, 1]) / 2; menton = v3[152, 1]
        else:
            yeux = np.mean([e['c'][1] for e in a['visage']['eyes']]); menton = a['visage']['box'][3]
        Ht = 2 * (menton - yeux); crane = yeux - Ht / 2; hanches = (pts[23, 1] + pts[24, 1]) / 2
        r['tete_px'] = round(float(Ht), 1); r['tetes_crane_hanches'] = round(float((hanches - crane) / max(1.0, Ht)), 2)
        # — regard : orientation peinte (tourne.py)
        if v3 is not None:
            rr = (v3[1, 0] - v3[33, 0]) / max(1e-6, v3[263, 0] - v3[33, 0]); r['lacet_peint'] = round(math.degrees(math.atan(1.8 * (rr - 0.5))), 1)
        else:
            e0, e1 = sorted(a['visage']['eyes'], key=lambda e: e['c'][0]); rr = (a['visage']['nose'][0] - e0['c'][0]) / max(1e-6, e1['c'][0] - e0['c'][0])
            r['lacet_peint'] = round(math.degrees(math.atan(1.8 * (rr - 0.5))), 1)
        cx = (bb[0] + bb[2]) / 2; vers, hors = [], []
        for b in A:
            if b is a: continue
            sens = 1 if (b['bbox'][0] + b['bbox'][2]) / 2 > cx else -1
            if sens * r['lacet_peint'] >= REGARD_MIN: vers.append(b['nom'])
            if sens * r['lacet_peint'] + TOUR_MAX < REGARD_MIN: hors.append(b['nom'])
        r['tourne_vers'] = vers; r['hors_de_portee'] = hors
        for n in hors:
            R['echecs'].append(f"{a['nom']} : ne peut pas regarder {n} (visage peint à {r['lacet_peint']}°, le moteur ajoute au plus {TOUR_MAX:.0f}°)")
        R['personnages'][a['nom']] = r
    enf = [p['tetes_crane_hanches'] for n, p in R['personnages'].items() if (p['age_carte'] or 99) < 13]
    for n, p in R['personnages'].items():
        if enf and (p['age_carte'] or 0) >= 18 and p['tetes_crane_hanches'] < max(enf) + PROP_ECART:
            R['echecs'].append(f"{n} : {p['tetes_crane_hanches']} têtes du crâne aux hanches, pas plus que l'enfant ({max(enf)}) — tête trop grosse pour un adulte")
    R['conforme'] = not R['echecs']
    return R


def controle_cache(d):
    """controle() gardé dans <lieu>/controle_troupe.json tant que l'image et les repères du lieu n'ont pas changé."""
    import hashlib
    h = hashlib.sha1()
    for f in [f'{d}/image.png', f'{d}/scene.json'] + sorted(__import__('glob').glob(f'{d}/rig/visage3d-*.npy')):
        if os.path.isfile(f): h.update(open(f, 'rb').read())
    h = h.hexdigest()[:16]; fc = f'{d}/controle_troupe.json'
    if os.path.isfile(fc):
        c = json.load(open(fc))
        if c.get('empreinte') == h: return c
    R = controle(d); R['empreinte'] = h; json.dump(R, open(fc, 'w'), ensure_ascii=False, indent=1)
    return R


if __name__ == '__main__':
    tous = [controle_cache(d) for d in sys.argv[1:]]
    print(json.dumps(tous, ensure_ascii=False, indent=1))
    sys.exit(0 if all(r['conforme'] for r in tous) else 1)
