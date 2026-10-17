# BOUCHE JUGÉE PAR JEV, SANS TOLÉRANCE (17/10/2026). Consignes : « tout doit coller à 100 % selon le jugement de JEV » ;
# « tout ce que tu feras sera appuyé par le jugement de JEV ». La mesure par pixels sombres (levres_roi) ne voit pas une
# bouche qui montre les dents ; ici JEV regarde le visage de celui qui parle aux instants où la piste de bouche (visèmes
# tirés de la voix) l'ouvre le plus — voyelles ouvertes — et aux instants où elle la ferme — m, b, p, silences — au centre
# de chaque segment. Une réplique passe si JEV voit la bouche OUVERTE aux trois instants ouverts ET FERMÉE (ou presque)
# aux trois instants fermés : six décisions, aucune erreur admise.
#   python3 jev_levres.py film.mp4 timeline.json montage.json sortie.json
import json, os, subprocess, sys, uuid
from concurrent.futures import ThreadPoolExecutor
import numpy as np, cv2
import jev_api

OUVERTE = ('`{c}` is a close-up of a cartoon character who is speaking. Is the mouth clearly open — lips apart with the inside '
           'of the mouth or the teeth visible, as when saying "ah" or "o"?')
FERMEE = ('`{c}` is a close-up of a cartoon character who is speaking. Is the mouth closed or nearly closed — lips together or '
          'almost touching, as when saying "m", "b" or "p"?')


def image(mp4, t):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', mp4, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True).stdout
    return cv2.imdecode(np.frombuffer(r, np.uint8), 1)[282:742]


def trouve(fr, tpl):
    best = None
    for sc in np.linspace(0.4, 2.6, 45):
        t2 = cv2.resize(tpl, None, fx=sc, fy=sc)
        if t2.shape[0] >= fr.shape[0] or t2.shape[1] >= fr.shape[1]: break
        _, mv, _, ml = cv2.minMaxLoc(cv2.matchTemplate(fr, t2, cv2.TM_CCOEFF_NORMED))
        if best is None or mv > best[0]: best = (mv, ml[0], ml[1], t2.shape[1], t2.shape[0])
    return best


def gros_plan(fr, tpl):
    b = trouve(fr, tpl)
    if b is None or b[0] < 0.4: return None
    _, x, y, w, h = b; m = int(0.25 * max(w, h))
    c = fr[max(0, y - m):y + h + m, max(0, x - m):x + w + m]
    k = 360 / max(c.shape[:2]); return cv2.resize(c, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)


def instants(L):
    """3 centres de segments les plus ouverts, 3 centres de segments fermés (≥ 60 ms), loin des bords de la réplique."""
    ph = [p for p in L.get('phonemes', []) if p['t1'] - p['t0'] >= 0.06 and 0.08 < (p['t0'] + p['t1']) / 2 < L['dur'] - 0.08]
    ouv = sorted((p for p in ph if p['open'] >= 1.0), key=lambda p: (-p['open'], -(p['t1'] - p['t0'])))[:3]
    fer = sorted((p for p in ph if p['open'] <= 0.01 and p['ph'] != 'X'), key=lambda p: -(p['t1'] - p['t0']))[:3]
    if len(fer) < 3: fer += sorted((p for p in ph if p['open'] <= 0.01 and p not in fer), key=lambda p: -(p['t1'] - p['t0']))[:3 - len(fer)]
    c = lambda p: L['t0'] + (p['t0'] + p['t1']) / 2
    return [c(p) for p in ouv], [c(p) for p in fer]


def juge_ligne(mp4, L, tpl):
    o, f = instants(L)
    if len(o) < 3 or len(f) < 3: return {'qui': L['qui'], 'texte': L['texte'][:40], 'ok': None, 'raison': 'réplique trop courte'}
    ims = {}
    for k, t in enumerate(o): ims[f'o{k}'] = gros_plan(image(mp4, t), tpl)
    for k, t in enumerate(f): ims[f'f{k}'] = gros_plan(image(mp4, t), tpl)
    if any(v is None for v in ims.values()): return {'qui': L['qui'], 'texte': L['texte'][:40], 'ok': False, 'raison': 'visage introuvable'}
    ids, assets, Q = {}, {}, {}
    for c, im in ims.items():
        ids[c] = f'{c}-{uuid.uuid4().hex[:6]}'; assets[ids[c]] = {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(im)}
        Q[f'ouverte_{c}'] = {'type': 'noul', 'instructions': OUVERTE.format(c=c)}
        Q[f'fermee_{c}'] = {'type': 'noul', 'instructions': FERMEE.format(c=c)}
    a = jev_api.demande(ids, Q, assets, outil='jev_levres')
    po = [round(a[f'ouverte_o{k}']['noul'], 2) for k in range(3)]; pf = [round(a[f'fermee_f{k}']['noul'], 2) for k in range(3)]
    return {'qui': L['qui'], 'texte': L['texte'][:40], 'ouverte_aux_voyelles': po, 'fermee_aux_consonnes': pf,
            'ok': all(p > 0.5 for p in po) and all(p > 0.5 for p in pf), 'instants': {'ouverts': [round(t, 2) for t in o], 'fermes': [round(t, 2) for t in f]}}


if __name__ == '__main__':
    MP4, TL, MON, OUT = sys.argv[1:5]
    T = json.load(open(TL)); M = json.load(open(MON)); base = os.path.dirname(os.path.abspath(MON)); tpls = {}
    for L in T['lines']:
        k = (L['sketch'], L['qui'])
        if k not in tpls:
            d = M['scenes'][L['sketch']]; d = d if os.path.isabs(d) else os.path.join(base, d)
            S = json.load(open(f'{d}/scene.json')); img = cv2.imread(f'{d}/image.png')
            a = [x for x in S['acteurs'] if x['nom'] == L['qui']][0]; x0, y0, x1, y1 = [int(v) for v in a['visage']['box']]; tpls[k] = img[y0:y1, x0:x1]
    with ThreadPoolExecutor(6) as ex: R = list(ex.map(lambda L: juge_ligne(MP4, L, tpls[(L['sketch'], L['qui'])]), T['lines']))
    ok = [r for r in R if r['ok'] is not None]
    out = {'repliques': len(R), 'jugees': len(ok), 'conformes': sum(bool(r['ok']) for r in ok), 'ok': bool(ok) and all(r['ok'] for r in ok), 'detail': R}
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print('jev_levres', 'OK' if out['ok'] else 'À REPRENDRE', f"{out['conformes']}/{out['jugees']} répliques conformes")
    for r in R:
        if not r.get('ok'): print('  ', r['qui'], '«', r['texte'], '»', r.get('ouverte_aux_voyelles'), r.get('fermee_aux_consonnes'), r.get('raison', ''))
