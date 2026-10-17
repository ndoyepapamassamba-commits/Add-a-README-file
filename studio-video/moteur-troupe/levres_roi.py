# TEST 5 bis — BOUCHE MESURÉE LÀ OÙ ELLE EST (16/10/2026). Le détecteur de visages (MediaPipe, entraîné sur de vrais
# visages) ne trouve pas Baye (barbe), Maman ou Tantie dans les plans moyens : 7 répliques sur 22 n'étaient pas mesurées.
# Ici, le visage de CELUI QUI PARLE est retrouvé dans l'image rendue par corrélation avec son visage d'origine
# (multi-échelle au début de la réplique, puis suivi local), et l'ouverture = part de pixels sombres (intérieur de la
# bouche) dans la zone bouche, corrélée à l'énergie de sa voix (décalage −3…+3 images).
# python3 levres_roi.py film.mp4 timeline.json montage.json sortie.json
import json, sys, cv2, numpy as np
MP4, TL, MON, OUT = sys.argv[1:5]; FPS = 30
T = json.load(open(TL)); M = json.load(open(MON))
cap = cv2.VideoCapture(MP4); frames = []
while True:
    ok, f = cap.read()
    if not ok: break
    frames.append(f[282:742])
res = []
for L in T['lines']:
    d = M['scenes'][L['sketch']]; S = json.load(open(f'{d}/scene.json')); img = cv2.imread(f'{d}/image.png')
    a = [x for x in S['acteurs'] if x['nom'] == L['qui']][0]; v = a['visage']; x0, y0, x1, y1 = [int(t) for t in v['box']]
    tpl = img[y0:y1, x0:x1]; fh = y1 - y0; sx, sy = v['seam'][0] - x0, v['seam'][1] - y0; mw = max(v['mouthWidth'], 0.3 * (x1 - x0))
    a0, a1 = int(L['t0'] * FPS), min(len(frames), int((L['t0'] + L['dur']) * FPS))
    op, ks, pos = [], [], None
    for k in range(a0, a1):
        fr = frames[k]
        if pos is None or k % 15 == 0:   # recherche multi-échelle (début et toutes les 0,5 s : le cadre dérive lentement)
            best = None
            for sc in np.linspace(0.4, 2.6, 45):
                t2 = cv2.resize(tpl, None, fx=sc, fy=sc)
                if t2.shape[0] >= fr.shape[0] or t2.shape[1] >= fr.shape[1]: break
                r = cv2.matchTemplate(fr, t2, cv2.TM_CCOEFF_NORMED); _, mv, _, ml = cv2.minMaxLoc(r)
                if best is None or mv > best[0]: best = (mv, sc, ml)
            if best is None or best[0] < 0.55: pos = None; continue
            sc = best[1]; t2 = cv2.resize(tpl, None, fx=sc, fy=sc); pos = best[2]
        else:   # suivi local ± 12 px
            X, Y = pos; X0, Y0 = max(0, X - 12), max(0, Y - 12)
            sub = fr[Y0:Y + t2.shape[0] + 12, X0:X + t2.shape[1] + 12]
            if sub.shape[0] < t2.shape[0] or sub.shape[1] < t2.shape[1]: pos = None; continue
            r = cv2.matchTemplate(sub, t2, cv2.TM_CCOEFF_NORMED); _, mv, _, ml = cv2.minMaxLoc(r)
            if mv < 0.45: pos = None; continue
            pos = (X0 + ml[0], Y0 + ml[1])
        X, Y = pos; cxm, cym = X + sx * sc, Y + sy * sc; hw, h0, h1 = 0.6 * mw * sc, 0.06 * fh * sc, 0.24 * fh * sc
        roi = fr[int(cym - h0):int(cym + h1), int(cxm - hw):int(cxm + hw)]
        if roi.size == 0: continue
        lum = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY).astype(np.float32)
        face = cv2.cvtColor(fr[Y:Y + t2.shape[0], X:X + t2.shape[1]], cv2.COLOR_BGR2GRAY).astype(np.float32)
        op.append(float((lum < 0.45 * np.median(face)).mean())); ks.append(k)
    if len(op) < 0.5 * (a1 - a0) or len(op) < 10: res.append({'qui': L['qui'], 'texte': L['texte'][:40], 'corr': None, 'images_suivies_%': round(100 * len(op) / max(1, a1 - a0))}); continue
    env = np.array(L['env'])
    def env_at(k):   # énergie moyenne de la voix pendant l'image k (33 ms)
        i0 = max(0, int((k / FPS - L['t0']) * 100)); i1 = int(((k + 1) / FPS - L['t0']) * 100)
        return 0.0 if i0 >= len(env) else float(env[i0:max(i0 + 1, min(len(env), i1))].mean())
    e = np.array([env_at(k) for k in ks])
    o = np.array(op)
    if o.std() < 1e-4: corr = 0.0
    else: corr = max(np.corrcoef(o[max(0, -dd):len(o) - max(0, dd)], e[max(0, dd):len(e) - max(0, -dd)])[0, 1] for dd in range(-3, 4))
    res.append({'qui': L['qui'], 'texte': L['texte'][:40], 'corr': round(float(corr), 2), 'images_suivies_%': round(100 * len(op) / (a1 - a0)), 'ouverture_max': round(float(o.max()), 3)})
cs = [r['corr'] for r in res if r['corr'] is not None]
out = {'repliques_mesurees': len(cs), 'sur': len(res), 'correlation_mediane': round(float(np.median(cs)), 2), 'repliques_corr_sup_0_3': int(sum(c >= 0.3 for c in cs)), 'detail': res}
out['ok'] = bool(len(cs) >= 0.8 * len(res) and np.median(cs) >= 0.3)
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print('levres_roi', 'OK' if out['ok'] else 'À REPRENDRE', {k: v for k, v in out.items() if k != 'detail'})
