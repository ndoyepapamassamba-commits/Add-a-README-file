# TOURNAGE DES MARIONNETTES (20/10/2026, « tout reprendre … en gardant le moteur ; tu lui donneras les personnages et les
# scènes qu'il faut »). Remplace seulement l'étape « tournage » de l'usine : voix (voix.py), visèmes (levres.py), rires,
# ambiance, montage (compose.py : sous-titres, titres, habillage, son) restent ceux du moteur. Ici :
#   1. le LIEU de chaque sketch est choisi d'après son texte et les métiers de ses personnages (plateau.json l'impose) ;
#   2. les PISTES DE JEU viennent du cerveau du moteur (jeu.pistes : tête, buste, regard, souffle, gestes, émotions,
#      clignements, bouche bée de la chute) ;
#   3. le DÉCOUPAGE suit le rythme de vos TikTok (échanges en plan à deux, chute en plan serré, réaction en gros plan) ;
#   4. chaque image est DESSINÉE (Skia) à la taille du plan : marionnettes et décor nets à tout cadrage, bouches dessinées
#      d'après les visèmes Rhubarb de la réplique, même lumière pour tous.
# python3 tourne_marionnettes.py DOSSIER_SORTIE   (dans le dossier de l'épisode : timeline.json, histoire.json)
import json, math, os, re, sys, time
import numpy as np, cv2, skia

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import marionnette as M, decor2d as D2

FPS, CW, CH = 30, 576, 460
ASP = CW / CH
PLAN_S = 5.0   # un échange tenu ≈ 5 s dans un même plan (rythme mesuré sur vos TikTok : 10,4–18,4 plans/min)
ENV = {'buste': 5.0, 'tete': 9.0, 'tete_tangage': 10.0, 'tete_lacet': 20.0, 'buste_lacet': 8.0, 'souffle': 0.02, 'epaules': 3.0, 'bassin_x': 4.0}

# ── choix du lieu ─────────────────────────────────────────────────────────────────────────────────────────────────
MOTS_LIEUX = {
    'dispensaire': ['piqûre', 'piqure', 'tension', 'infirmi', 'docteur', 'médicament', 'santé', 'hôpital', 'malade', 'vaccin', 'dentiste', 'ordonnance'],
    'classe': ['dictée', 'copies', 'cahier', 'école', 'classe', 'devoir', 'élève', 'maître', 'conduite', 'tableau'],
    'maquis': ['maquis', 'poulet', 'attiéké', 'bière', 'serveur', 'garba', 'alloco', 'addition', 'plat', 'manger'],
    'marche': ['marché', 'prix', 'tomate', 'marchand', 'kilo', 'étal', 'acheter', 'vendre', 'cher'],
    'salon': ['maison', 'télé', 'salon', 'mari', 'mariage', 'belle-mère', 'enfants', 'canapé'],
    'boutique': ['boutique', 'crédit', 'sucre', 'pain', 'commerçant', 'monnaie'],
    'bureau': ['guichet', 'dossier', 'papier', 'mairie', 'banque', 'formulaire', 'tampon', 'bureau', 'compte'],
    'cour': ['cour', 'voisin', 'linge', 'poule', 'puits', 'loyer', 'concession'],
}


def choisir_lieu(sk, fiches):
    """score de chaque lieu : mots du sketch (titre, mise en scène, répliques) + métier des personnages (fiches, poids 0,5)."""
    txt = ' '.join([sk.get('titre', ''), sk.get('mise_en_scene', '')] + [r.get('texte', '') for r in sk.get('repliques', [])]).lower()
    metier = ' '.join((fiches.get(a, {}).get('tenue', '') + ' ' + fiches.get(a, {}).get('personnalite', '')) for a in sk.get('acteurs', [])).lower()
    mes = sk.get('mise_en_scene', '').lower()   # la mise en scène dit où l'on est : elle compte double
    sc = {l: sum(txt.count(m) for m in ms) + sum(mes.count(m) for m in ms) + 0.25 * sum(metier.count(m) for m in ms) for l, ms in MOTS_LIEUX.items()}
    return max(sc, key=lambda l: (sc[l], l == 'cour')), sc


def lieux_episode(sks, fiches):
    """un épisode garde son lieu (comme une série TikTok tournée au même endroit) ; un sketch n'en change que si son
    propre lieu l'emporte nettement (au moins 2 points d'avance sur le lieu de l'épisode)."""
    par = {s['id']: choisir_lieu(s, fiches) for s in sks}; tot = {}
    for _, sc in par.values():
        for l, v in sc.items(): tot[l] = tot.get(l, 0) + v
    lieu_ep = max(tot, key=lambda l: (tot[l], l == 'cour'))
    return {sid: (best if sc[best] >= sc[lieu_ep] + 2 else lieu_ep, sc) for sid, (best, sc) in par.items()}, lieu_ep


# ── pistes de jeu (cerveau du moteur) ─────────────────────────────────────────────────────────────────────────────
def pistes(T, sid, acteurs, pos, ppm, nf):
    import jeu
    return jeu.pistes(T['lines'], sid, acteurs, pos, {n: False for n in acteurs}, {n: dict(ENV) for n in acteurs}, nf, FPS,
                      {n: 2 for n in acteurs}, echelles={n: ppm for n in acteurs}, cotes_bras={n: ['l', 'r'] for n in acteurs},
                      reglages={'bras_amax': {n: [40.0, 40.0] for n in acteurs}})


# ── découpage ─────────────────────────────────────────────────────────────────────────────────────────────────────
def echanges(Ls):
    G, cur = [], []
    for L in Ls:
        if L.get('chute'):
            if cur: G.append(cur); cur = []
            G.append([L]); continue
        if cur and L['t0'] + L['dur'] - cur[0]['t0'] > PLAN_S * 1.3: G.append(cur); cur = []
        cur.append(L)
        if L['t0'] + L['dur'] - cur[0]['t0'] >= PLAN_S: G.append(cur); cur = []
    if cur: G.append(cur)
    return G


def decoupage(T, sk_t, acteurs_sk, reaction):
    SH = []
    for sid, (t_a, t_b) in sk_t.items():
        Ls = [L for L in T['lines'] if L['sketch'] == sid]; Gs = echanges(Ls); acts = acteurs_sk[sid]
        for gi, Gr in enumerate(Gs):
            L = Gr[0]; t0 = t_a if gi == 0 else L['t0'] - 0.12
            t1 = (Gs[gi + 1][0]['t0'] - 0.12) if gi + 1 < len(Gs) else t_b
            if L.get('chute'):
                fin = L['t0'] + L['dur'] + 0.05; SH.append([t0, fin, sid, 'serre', L['qui'], L['t0'] + 0.6 * L['dur']])
                vict = (reaction.get(sid) or {}).get('qui') or next((a for a in acts if a != L['qui']), L['qui'])
                SH.append([fin, t1, sid, 'gros', vict, None]); continue
            qui = list(dict.fromkeys(x['qui'] for x in Gr))
            if gi == 0: SH.append([t0, t1, sid, 'ouvre', acts, None]); continue
            if len(qui) > 1 and len(acts) >= 2: SH.append([t0, t1, sid, 'duo', qui, None])
            else: SH.append([t0, t1, sid, 'moyen', qui[0], None])
    return SH


# ── caméra ────────────────────────────────────────────────────────────────────────────────────────────────────────
def borne(c):
    cx, cy, w, h = c; k = min(1.0, D2.W / w, D2.H / h); w, h = w * k, h * k
    return (min(max(cx, w / 2), D2.W - w / 2), min(max(cy, h / 2), D2.H - h / 2), w, h)


def cadre(kind, who, G):
    """G : {nom: gabarit} ; → (cx, cy, w, h) en coordonnées du décor."""
    if kind == 'large' or not who: return (D2.W / 2, D2.H / 2, D2.W, D2.H)
    if kind in ('duo', 'ouvre'):
        gs = [G[n] for n in (who if isinstance(who, list) else [who]) if n in G]
        x0 = min(g['tete'][0] - g['hw'] * 0.9 for g in gs); x1 = max(g['tete'][0] + g['hw'] * 0.9 for g in gs)
        top = min(g['tete_box'][1] - g['hh'] * 0.30 for g in gs); bas = max(g['yh'] + g['hh'] * 0.3 for g in gs)
        h = max((bas - top), (x1 - x0) * 1.25 / ASP); w = h * ASP
        return borne(((x0 + x1) / 2, top + h * 0.5, w, h))
    g = G[who]; hh = g['hh']; h = {'moyen': 3.2, 'serre': 2.4, 'gros': 1.9}[kind] * hh; w = h * ASP; tb = g['tete_box']
    # tête entière avec un peu d'air au-dessus (boîte de la tête DESSINÉE, chignon et coiffe compris), espace devant le regard
    cx = (tb[0] + tb[2]) / 2 + g['face'] * w * 0.10; cy = tb[1] - {'moyen': 0.40, 'serre': 0.30, 'gros': 0.20}[kind] * hh + h / 2
    return borne((cx, cy, w, h))


def lisse(u):
    u = min(max(u, 0.0), 1.0); return u * u * (3 - 2 * u)


def camera(sh, t, G):
    t0, t1, sid, kind, who, _ = sh; u = (t - t0) / max(1e-3, t1 - t0)
    if kind == 'ouvre':   # on situe en large puis la caméra pousse vers l'échange, sans couper
        a = cadre('large', None, G); b = cadre('duo', who, G); k = lisse((t - t0) / 2.2)
        return tuple(a[i] * (1 - k) + b[i] * k for i in range(4))
    c = cadre(kind, who, G); z = 1.0 - 0.05 * lisse(u)   # poussée lente (5 %) : la caméra vit comme dans vos TikTok
    return borne((c[0], c[1], c[2] * z, c[3] * z))


# ── rendu ─────────────────────────────────────────────────────────────────────────────────────────────────────────
_ETAT = {}


def _init(etat):
    _ETAT.update(etat)
    _ETAT['img'] = {sid: D2.Decor(*_ETAT['lieux'][sid]).image(2.5) for sid in _ETAT['lieux']}
    F = M.bible(); _ETAT['mar'] = {n: M.marionnette(n, F) for n in _ETAT['tous']}


def _visemes(L, t):
    for v in L.get('visemes') or []:
        if v['t0'] <= t - L['t0'] < v['t1']: return v['v']
    return 'X'


def pose(nom, f, t, sid):
    P_ = _ETAT['pistes'][sid].get(nom, {}); v = lambda k, d=0.0: float(P_[k][f]) if k in P_ else d
    emos = {e: v('emo_' + e) for e in M.EMO_VISAGE}
    bouche, k = 'X', 1.0
    for L in _ETAT['lignes_par'].get((sid, nom), []):
        if L['t0'] <= t < L['t0'] + L['dur']: bouche = _visemes(L, t); break
    bb = v('bouche_bee')
    if bouche == 'X' and bb > 0.15: bouche, k = 'D', min(1.0, bb * 1.2)
    g0, g1 = v('geste_0'), v('geste_1'); face = _ETAT['face'][sid][nom]
    avant, arriere = (g0, g1) if face > 0 else (g1, g0)
    bras = lambda g: (8.0 + 38.0 * g, 12.0 + 80.0 * g)
    cl = v('cligne', -1.0)
    if cl < 0:   # clignement naturel (≈ toutes les 3–5 s, 0,15 s)
        ph = (t * 1.0 + (hash(nom) % 97) / 23.0) % 3.7; cl = max(0.0, 1 - abs(ph - 0.08) / 0.08) if ph < 0.16 else 0.0
    return dict(tete=v('tete'), tete_lacet=v('tete_lacet'), tete_tangage=v('tete_tangage'), buste=v('buste'), souffle=v('souffle') * 40,
                epaules=v('epaules'), bassin_x=v('bassin_x'), bras_d=bras(avant) if face > 0 else bras(arriere),
                bras_g=bras(arriere) if face > 0 else bras(avant), regard=(np.clip(v('regard_x') / 10.0, -1, 1), np.clip(v('regard_y') / 10.0, -1, 1)),
                cligne=float(np.clip(cl, 0, 1)), emotions=emos, bouche=bouche, bouche_k=k, face=face)


def image(f):
    E = _ETAT; t = f / FPS; sh = next((s for s in E['SH'] if s[0] <= t < s[1]), E['SH'][-1] if t >= E['SH'][-1][0] else E['SH'][0])
    sid = sh[2]; G = E['gab'][sid]; cx, cy, w, h = camera(sh, t, G)
    s = skia.Surface(CW, CH); c = s.getCanvas(); k = CW / w
    c.scale(k, k); c.translate(-(cx - w / 2), -(cy - h / 2))
    c.drawImageRect(E['img'][sid], skia.Rect.MakeWH(D2.W, D2.H), skia.Paint(FilterQuality=skia.kMedium_FilterQuality))
    d = E['decor'][sid]; boites = {}
    for nom in sorted(E['acteurs'][sid], key=lambda n: E['pos'][sid][n]):
        boites[nom] = E['mar'][nom].dessine(c, E['pos'][sid][nom], d['sol_y'], d['ppm'], pose(nom, f, t, sid), lumiere=d['lumiere'], teinte=d['teinte'])
    a = s.makeImageSnapshot().toarray(colorType=skia.ColorType.kRGBA_8888_ColorType)
    cv2.imwrite(f"{E['D']}/clip/f{f:05d}.jpg", cv2.cvtColor(a, cv2.COLOR_RGBA2BGR), [cv2.IMWRITE_JPEG_QUALITY, 93])
    # bouche de celui qui parle, dans l'image (pour le juge unique)
    tr = lambda b: [(b[0] - (cx - w / 2)) * k, (b[1] - (cy - h / 2)) * k, (b[2] - (cx - w / 2)) * k, (b[3] - (cy - h / 2)) * k]
    return f, {n: {'bouche': tr(b['bouche']), 'tete': tr(b['tete'])} for n, b in boites.items()}


def _bloc(fs):
    return [image(f) for f in fs]


def tourne(D):
    t_dep = time.time(); T = json.load(open('timeline.json')); Hs = json.load(open('histoire.json')); F = M.bible()
    plateau = json.load(open('plateau.json')) if os.path.isfile('plateau.json') else {}
    nf = int(math.ceil(T['total'] * FPS)); os.makedirs(f'{D}/clip', exist_ok=True)
    sk_h = {s['id']: s for s in Hs['sketchs']}; sk_t = {}
    for s in T['sketchs']: sk_t[s['id']] = (max(0.0, s['t0'] - 0.3), s['t1'] + 0.25)
    ids = list(sk_t); lim = [0.0] + [(sk_t[a][1] + sk_t[b][0]) / 2 for a, b in zip(ids, ids[1:])] + [T['total'] + 1]
    for i, sid in enumerate(ids): sk_t[sid] = (lim[i], lim[i + 1])   # les sketchs se touchent (cartes de titre comprises)
    lieux, scores, acteurs, pos, face, gab, decor, P_ = {}, {}, {}, {}, {}, {}, {}, {}
    choix, lieu_ep = lieux_episode([sk_h.get(sid, {'id': sid}) for sid in ids], F)
    for sid in ids:
        sk = sk_h.get(sid, {'id': sid}); acts = sk.get('acteurs') or list(dict.fromkeys(L['qui'] for L in T['lines'] if L['sketch'] == sid))
        lieu = (plateau.get(sid) or {}).get('lieu'); sc = None
        if not lieu: lieu, sc = choix[sid]
        heure = (plateau.get(sid) or {}).get('heure', 'midi'); lieux[sid] = (lieu, heure); scores[sid] = sc
        d = D2.Decor(lieu, heure); xs = [D2.W * x for x in d.places(len(acts))]
        acteurs[sid] = acts; pos[sid] = dict(zip(acts, xs)); cx_ = np.mean(xs)
        face[sid] = {n: (1.0 if (np.mean([x for m, x in pos[sid].items() if m != n] or [cx_]) >= pos[sid][n]) else -1.0) for n in acts}
        ppm = d.ppm(d.sol_y); decor[sid] = dict(sol_y=d.sol_y, ppm=ppm, lumiere=d.lumiere, teinte=d.teinte)
        gab[sid] = {}
        for n in acts:
            m_ = M.marionnette(n, F); g = m_.gabarit(pos[sid][n], d.sol_y, ppm); g['face'] = face[sid][n]
            rec = skia.PictureRecorder(); cv = rec.beginRecording(skia.Rect.MakeWH(D2.W, D2.H))   # boîtes réelles du dessin au repos
            b = m_.dessine(cv, pos[sid][n], d.sol_y, ppm, dict(face=face[sid][n]), lumiere=d.lumiere, teinte=d.teinte); rec.finishRecordingAsPicture()
            g['tete_box'] = b['tete']; gab[sid][n] = g
        P_[sid] = pistes(T, sid, acts, pos[sid], ppm, nf)
    t_pistes = time.time() - t_dep; print(f'pistes de jeu : {t_pistes:.1f} s', file=sys.stderr)
    SH = decoupage(T, sk_t, acteurs, {s: sk_h.get(s, {}).get('reaction') for s in ids})
    lignes_par = {}
    for L in T['lines']: lignes_par.setdefault((L['sketch'], L['qui']), []).append(L)
    etat = dict(D=os.path.abspath(D), SH=SH, lieux=lieux, acteurs=acteurs, pos=pos, face=face, gab=gab, decor=decor, pistes=P_,
                lignes_par=lignes_par, tous=sorted({n for a in acteurs.values() for n in a}))
    from concurrent.futures import ProcessPoolExecutor
    import multiprocessing as mp
    nproc = int(os.environ.get('TOURNE_PROCS', os.cpu_count() or 4)); blocs = [list(range(i, nf, nproc)) for i in range(nproc)]
    with ProcessPoolExecutor(nproc, mp_context=mp.get_context('fork'), initializer=_init, initargs=(etat,)) as ex:
        res = [r for b in ex.map(_bloc, blocs) for r in b]
    boites = {str(f): b for f, b in sorted(res)}
    json.dump({'fps': FPS, 'marionnettes': True, 'decoupage': SH, 'lieux': {s: {'lieu': l, 'heure': h, 'scores': scores[s]} for s, (l, h) in lieux.items()},
               'positions': pos, 'duree_s': {'pistes': round(t_pistes, 1), 'images': round(time.time() - t_dep - t_pistes, 1)}, 'images': nf},
              open(f'{D}/tournage.json', 'w'), ensure_ascii=False, indent=1)
    json.dump(boites, open(f'{D}/boites.json', 'w'))
    print(json.dumps({'images': nf, 'plans': len(SH), 'lieux': lieux, 'secondes': round(time.time() - t_dep, 1)}, ensure_ascii=False))


if __name__ == '__main__':
    tourne(sys.argv[1])
