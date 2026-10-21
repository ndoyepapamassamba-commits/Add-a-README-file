# CAMÉRA ET DÉCOR DE LA V1 POUR TOUTES LES VIDÉOS DE LA BANQUE (21/10/2026)
# Consignes : « la V1 est plus fluide, les personnages plus animés, ils se regardent, la V1 anime bien les arrière-plans » ;
# « toutes les vidéos devront avoir ou dépasser les mesures de la V1 » ; « essaye de généraliser les changements pour pousser la
# V1 à toutes les vidéos pour éviter de les faire une par une ».
# La V1 publiée (troupe2/ep01/v17) sort de moteur-troupe/tourne.py ; sa grammaire, lue dans le code (REG l. 45, cadres_du_plan
# l. 1153-1190, cadre_t l. 1233-1245, facteur_parallaxe l. 185-194), est reprise ici telle quelle, avec les MÊMES réglages, pour
# l'assembleur commun (assemble.py) — celui qui monte les vidéos des 54 personnages à partir de la banque de gestes :
#  · DÉCOUPAGE : chaque sketch s'ouvre large et la caméra POUSSE vers l'échange (ouverture 1,2 s) ; plans à deux de ≥ 5 s
#    (plan_s), une coupe quand un troisième personnage prend la parole ; plan serré sur la chute avec coup de zoom fluide
#    (×1,15 en 0,45 s, whip_s) ; gros plan de la réaction tenu ;
#  · CAMÉRA VIVANTE : glissement latéral de 2,5 px d'écran par 1/30 s (cam_px, sur 576 px de large) vers le côté qui a de la
#    place, sinon grue (montée ou descente un plan sur deux), poussée de 10 % par plan (pousse), mouvement adouci ;
#    les têtes restent entières ou absentes du cadre ;
#  · PARALLAXE 0,35 : le décor suit la caméra à sa profondeur (Depth Anything V2, déjà calculée par assemble.couches) — 1 au
#    niveau des pieds des acteurs, 1 − 0,35 au plus loin, jusqu'à 1 + 0,175 au premier plan ;
#  · DÉCOR VIVANT : feuillages, linge, rideaux, auvents et eau du décor (classes ADE20K de assemble.couches, au lieu de l'œil
#    de JEV coupé) ondulent par textures de mouvement stochastiques (Chuang et al., SIGGRAPH 2005, réécrit dans
#    moteur-troupe/decor_vivant.py) aux rafales communes du vent ; ombre de feuillage et oiseaux du ciel (vie_fond.py, v35) ;
#  · GESTES SANS À-COUP : la boucle aller-retour des clips (33 images à 16 i/s) repart désormais en douceur à chaque bout
#    (vitesse nulle au retournement, temps en cosinus) et chaque image de sortie est interpolée entre deux images du clip
#    (16 → 24 i/s sans image répétée une fois sur deux).
# Rendu image par image en numpy (positions au sous-pixel : la caméra ne saute jamais d'un pixel entier), puis ffmpeg pour le
# fond, les titres et le son (assemble.segment).
import math, os, subprocess, sys
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, '..', 'moteur-troupe'))
# VITESSE RÉELLE DE LA V1 (21/10/2026) : dans la V1, la largeur du décor bornait le glissement (tourne.py : « 0,5 px/image au
# lieu de 2,5 », mesuré le 17/10) ; caméra au-dessus de 25 px/s (bande à 288 de large) 4,2 % du temps, 90e centile 15,9 px/s.
# Les décors de la banque laissaient filer cam_px entier : 26,5 % du temps au-dessus de 25 px/s, 90e centile 40,2 px/s, et les
# 9 à-coups de l'épisode banque 1 (V1 : 1) tombent tous dans ces glissements. CAM_V1 ramène la vitesse à celle de la V1.
CAM_V1 = float(os.environ.get('CAM_V1', '0.4'))
DECOR_V1 = os.environ.get('DECOR_V1', '1') == '1'
REG = {'plan_s': 5.0, 'cam_px': 2.5, 'pousse': 1.10, 'parallaxe': 0.35, 'whip_s': 0.45, 'ouverture': 1.2, 'zoom_chute': 1.15}
ECRAN_V1 = 576              # largeur d'écran de la V1 (tourne.CW) : cam_px est compté sur elle
COUPE_S = 2.5               # durée minimale d'un plan avant une coupe sur le parleur suivant
SORTIE = None               # (largeur, hauteur) de l'image de scène si elle diffère de la toile (format V1 : 576 × 460)


def aspect(BW, BH):
    return SORTIE[0] / SORTIE[1] if SORTIE else BW / BH
FEUILLAGE = (4, 17, 66, 72)                          # ADE20K : arbre, plante, fleur, palmier
TISSU = (18, 63, 81, 86, 92, 106, 114, 131, 149)     # rideau, store, serviette, auvent, vêtements, dais, tente, couverture, drapeau
EAU = (21, 26, 60, 109, 128)                         # eau, mer, rivière, piscine, lac
LAMPE = (36, 82, 134)                                # lampe, lumière, applique
ANIMAL = (126,)                                      # animal


def ease(u):
    u = min(1.0, max(0.0, u)); return u * u * (3 - 2 * u)


# ── ACTEURS : boîtes du corps et de la tête dans la bande ─────────────────────────────────────────────────────────────────
def boites(P, BW, BH, hauts):
    """corps (x0, y0, x1, y1) et tête de chaque acteur, en pixels de la bande ; hauts[nom] = haut du personnage dans son clip
    (fraction de la hauteur du clip, lu sur l'alpha)."""
    B = {}
    for nom, a in P['acteurs'].items():
        h = a.get('taille', 0.95) * BH; sol = a.get('sol', 0.97) * BH; top = sol - (0.97 - hauts.get(nom, 0.05)) * h
        w = 0.36 * h if a.get('taille', 0.95) > 0.7 else 0.42 * h; x = a.get('x', 0.5) * BW; hb = sol - top
        B[nom] = {'corps': (x - w / 2, top, x + w / 2, sol), 'tete': (x - 0.13 * hb, top - 0.01 * hb, x + 0.13 * hb, top + 0.2 * hb), 'h': hb, 'x': x}
    return B


def _borne(c, BW, BH):
    cx, cy, w, h = c; A = aspect(BW, BH)
    if h > BH: h = BH; w = h * A
    if w > BW: w = BW; h = w / A
    return (float(min(max(cx, w / 2), BW - w / 2)), float(min(max(cy, h / 2), BH - h / 2)), float(w), float(h))


def _dans(b, c, marge=0.0):
    cx, cy, w, h = c
    return b[0] >= cx - w / 2 - marge and b[2] <= cx + w / 2 + marge and b[1] >= cy - h / 2 - marge and b[3] <= cy + h / 2 + marge


def _dehors(b, c):
    cx, cy, w, h = c
    return b[2] <= cx - w / 2 or b[0] >= cx + w / 2 or b[3] <= cy - h / 2 or b[1] >= cy + h / 2


def tetes_ok(B, c, garde):
    """« têtes entières ou absentes » (tourne.faces_ok) : celles des acteurs gardés entières, les autres entières ou dehors."""
    return all(_dans(B[n]['tete'], c) for n in garde) and all(_dans(B[n]['tete'], c, 2) or _dehors(B[n]['tete'], c) for n in B if n not in garde)


def cadre(B, noms, sorte, BW, BH, cote=0.0):
    """cadre (cx, cy, w, h) au format de la bande : large, duo (les acteurs nommés, de la tête à la taille), moyen (un acteur,
    de la tête à mi-cuisse, place du côté où il regarde), serre (tête et buste), gros (visage)."""
    A = aspect(BW, BH)
    if sorte == 'large' or not noms:   # plan d'ensemble : toute la hauteur, centré sur les acteurs
        xs = [B[n]['x'] for n in (noms or B)] or [BW / 2]
        return _borne((float(np.mean(xs)), BH / 2, BH * A, BH), BW, BH)
    x0 = min(B[n]['corps'][0] for n in noms); x1 = max(B[n]['corps'][2] for n in noms); hm = max(B[n]['h'] for n in noms)
    haut = min(B[n]['corps'][1] for n in noms)
    # cadres resserrés (21/10/2026, place des personnages 0,28 contre 0,366 sur la V1) : plan à deux de la tête aux hanches,
    # plan moyen de la tête à la taille
    if sorte == 'duo': h = max(0.58 * hm, (x1 - x0 + 0.18 * hm) / A); cx = (x0 + x1) / 2
    else:
        k = {'moyen': 0.6, 'serre': 0.46, 'gros': 0.3}[sorte]; h = k * hm
        cx = (x0 + x1) / 2 + cote * {'moyen': 0.14, 'serre': 0.1, 'gros': 0.05}[sorte] * h * A
    cy = haut - 0.09 * h + h / 2
    c = _borne((cx, cy, h * A, h), BW, BH)
    if not tetes_ok(B, c, noms):   # une tête coupée : on décale, sinon on élargit jusqu'à la prendre entière
        for dx in sorted(np.linspace(-0.3 * c[2], 0.3 * c[2], 13), key=abs):
            c2 = _borne((c[0] + dx, c[1], c[2], c[3]), BW, BH)
            if tetes_ok(B, c2, noms): return c2
        for k in (1.15, 1.3, 1.5, 1.8, 2.2):
            c2 = _borne((c[0], c[1], c[2] * k, c[3] * k), BW, BH)
            if tetes_ok(B, c2, noms): return c2
        return _borne((BW / 2, BH / 2, BH * A, BH), BW, BH)
    return c


# ── DÉCOUPAGE EN PLANS ────────────────────────────────────────────────────────────────────────────────────────────────────
def plans(P, B, BW, BH):
    """plans de la vidéo : [{'t0', 't1', 'sorte', 'garde', 'cs' (ouverture), 'c0', 'c1', 'cp' (coup de zoom), 'tw'}]."""
    R = P['repliques']; S = []; cur = None; avant = None
    chute = next((k for k, r in enumerate(R) if r.get('chute')), None)
    for k, r in enumerate(R):
        t0, t1 = r['_t0'], r['_t0'] + float(r['duree'])
        if k == chute: cur = None; S.append({'t0': t0, 't1': t1, 'sorte': 'serre', 'garde': [r['qui']], 'k': [k]}); continue
        # 21/10/2026 (épisode banque 1) : l'attente avant la 1re réplique était prise pour une réaction (gros plan de 0,8 s), et
        # le plan d'ouverture des sketchs 2 et 3 n'était plus le premier : ni plan large, ni plan à deux. Elle ouvre le plan suivant.
        if not r.get('qui') and not S and (chute is None or k < chute): avant = (t0, k); continue
        if not r.get('qui'):   # réaction après la chute : gros plan de celui qui encaisse
            ch = R[chute]['qui'] if chute is not None else None
            re_ = r.get('reagit', {}); cible = next((n for n, g in re_.items() if g == 'choc' and n != ch), next((n for n in re_ if n != ch), ch))
            cur = None; S.append({'t0': t0, 't1': t1, 'sorte': 'gros', 'garde': [cible] if cible else [], 'k': [k]}); continue
        # « dépasser la V1 » : la V1 tient ses plans à deux 5 s et plus (plan_s) ; les TikTok de l'utilisateur coupent ≈ 11 fois
        # par minute (cadre.py). Coupe à chaque changement de parleur dès que le plan a duré COUPE_S, champ-contrechamp sur
        # celui qui parle (plan moyen), le plan à deux réservé à l'ouverture et aux échanges rapides
        if cur and (r['qui'] in cur['garde'] or (len(cur['garde']) < 2 and cur['t1'] - cur['t0'] < COUPE_S)) \
                and cur['t1'] - cur['t0'] < 2 * REG['plan_s']:
            cur['t1'] = t1; cur['k'].append(k)
            if r['qui'] not in cur['garde']: cur['garde'].append(r['qui'])
        else:
            cur = {'t0': t0, 't1': t1, 'sorte': None, 'garde': [r['qui']], 'k': [k]}
            # PLAN À DEUX DE RELANCE (21/10/2026) : après un champ-contrechamp X / Y, le retour sur X montre les deux — la V1 tient
            # ses plans à deux, les nôtres n'en avaient plus après l'ouverture (sketch 2 : 8 plans moyens d'une personne, regards
            # 0,167 contre 0,846) ; le nombre de coupes ne change pas
            if len(S) >= 2 and S[-1].get('sorte') is None and S[-2].get('sorte') is None and len(S[-1]['garde']) == len(S[-2]['garde']) == 1 \
                    and S[-2]['garde'][0] == r['qui'] and S[-1]['garde'][0] != r['qui']:
                cur['garde'] = [r['qui'], S[-1]['garde'][0]]; cur['sorte'] = 'duo'
            if avant: cur['t0'], cur['k'] = avant[0], [avant[1]] + cur['k']; avant = None
            S.append(cur)
    for i, s in enumerate(S):
        if s['sorte'] is None:
            if len(s['garde']) == 1:   # un seul parleur : il s'adresse au précédent (ou au plus proche)
                n = s['garde'][0]; autres = [x for x in B if x != n]
                prec = next((R[k]['qui'] for k in range(s['k'][0] - 1, -1, -1) if R[k].get('qui') and R[k]['qui'] != n), None)
                vis = prec or (min(autres, key=lambda x: abs(B[x]['x'] - B[n]['x'])) if autres else None)
                if vis and i == 0: s['garde'] = [n, vis]; s['sorte'] = 'duo'
                else: s['sorte'] = 'moyen'; s['cote'] = (1.0 if vis and B[vis]['x'] > B[n]['x'] else -1.0) if vis else 0.0
            else: s['sorte'] = 'duo'
        s['c0'] = cadre(B, s['garde'], s['sorte'], BW, BH, s.get('cote', 0.0))
        s['cs'] = cadre(B, list(B), 'large', BW, BH) if i == 0 else None
        mouvement(s, B, BW, BH, i)
        if s['sorte'] == 'serre':
            s['tw'] = s['t0'] + 0.55 * (s['t1'] - s['t0'])
            cx, cy, w, h = s['c1']; hb = B[s['garde'][0]]['tete']; cp = _borne(((cx + (hb[0] + hb[2]) / 2) / 2, (cy + (hb[1] + hb[3]) / 2) / 2, w / REG['zoom_chute'], h / REG['zoom_chute']), BW, BH)
            s['cp'] = cp if tetes_ok(B, cp, s['garde']) else s['c1']
    return S


def mouvement(s, B, BW, BH, i):
    """cadre d'arrivée c1 : glissement de cam_px vers le côté qui a de la place, sinon de l'autre côté, sinon grue, avec poussée
    (tourne.cadres_du_plan) ; trajet entier sans tête coupée."""
    c0 = s['c0']; d = s['t1'] - s['t0']; cible = CAM_V1 * REG['cam_px'] * 30 * d / ECRAN_V1 * c0[2]   # pixels de bande parcourus
    dirn = 1.0 if BW - (c0[0] + c0[2] / 2) >= c0[0] - c0[2] / 2 else -1.0; sens_v = -1.0 if i % 2 else 1.0
    essais = []
    for g, dr, vv, pz in ([(g, dirn, 0, z) for g in (1.0, 0.7, 0.45, 0.25) for z in (REG['pousse'], 1.0)] + [(g, -dirn, 0, z) for g in (1.0, 0.7, 0.45) for z in (REG['pousse'], 1.0)]
                          + [(0.0, dirn, k, z) for k in (1.0, -1.0, 0.5, -0.5) for z in (REG['pousse'], 1.0)] + [(0.0, dirn, 0.0, z) for z in (1.2, 1.15, REG['pousse'], 1 / 1.08, 1.0)]):
        c1 = _borne((c0[0] + dr * g * cible, c0[1] + sens_v * vv * 0.15 * cible, c0[2] / pz, c0[3] / pz), BW, BH)
        if not all(tetes_ok(B, tuple(a + (b - a) * u for a, b in zip(c0, c1)), s['garde']) for u in (0.25, 0.5, 0.75, 1.0)): continue
        vie = math.hypot(c1[0] - c0[0], c1[1] - c0[1]) + 0.5 * abs(1 - c0[2] / c1[2]) * c0[2]
        essais.append((min(vie, cible), g == 1.0 and dr == dirn, c1))
    s['c1'] = max(essais, key=lambda e: (e[0], e[1]))[2] if essais else c0


def cadre_t(s, t):
    """cadre de la caméra au temps t et cadre de référence de la parallaxe (tourne.cadre_t)."""
    u = ease((t - s['t0']) / max(0.5, s['t1'] - s['t0']))
    c = [a + (b - a) * u for a, b in zip(s['c0'], s['c1'])]; ref = s['c0']
    if s.get('cs') is not None:   # ouverture : du plan d'ensemble au cadre de l'échange
        v = ease((t - s['t0']) / max(0.3, REG['ouverture']))
        ref = [a + (b - a) * v for a, b in zip(s['cs'], s['c0'])]; c = [a + (b - a) * v for a, b in zip(s['cs'], c)]
    if s.get('tw') is not None and t >= s['tw']:   # coup de zoom de la chute : zoom d'objectif, sans parallaxe
        v = ease((t - s['tw']) / max(0.05, REG['whip_s'])); c = [a + (b - a) * v for a, b in zip(c, s['cp'])]
    return c, ref


# ── DÉCOR : parallaxe et vie ──────────────────────────────────────────────────────────────────────────────────────────────
def facteur_parallaxe(d, pieds):
    """tourne.facteur_parallaxe : 1 aux pieds des acteurs, 1 − P au plus loin, 1 + P/2 au premier plan, lissé."""
    Pp = REG['parallaxe']; df = float(np.median(pieds)) if pieds else 0.6; lo, hi = float(d.min()), float(d.max())
    k = np.where(d <= df, 1 - Pp * (df - d) / max(1e-3, df - lo), 1 + 0.5 * Pp * (d - df) / max(1e-3, hi - df))
    return cv2.GaussianBlur(k.astype(np.float32), (0, 0), 6)


def _phase(H, W, graine, lam):
    rng = np.random.default_rng(graine); p = cv2.GaussianBlur(rng.standard_normal((H, W)).astype(np.float32), (0, 0), lam)
    return (p / (p.std() + 1e-6)).astype(np.float32)


def prepare_decor(img, d, seg, pieds, graine=5, cache=None):
    """tout ce qui ne change pas d'une image à l'autre : plaque, facteur de parallaxe, couches vivantes, ciel et ombres.
    DÉCOR DE LA V1 (21/10/2026, épisode banque 1 : arrière-plan qui bouge 0,09 contre 0,161 pour la V1) : feuillages, linge et
    auvents, ampoules et bêtes sont animés par les textures de mouvement de la V1 elle-même (moteur-troupe/decor_vivant.py,
    Chuang et al. 2005, ×6 de jour comme tourne.py), leurs couches lues sur la segmentation ADE20K du décor au lieu de l'œil
    de JEV ; le balancement maison (≈ 4 px/s à l'écran, sous le seuil de 9 px/s de la mesure) ne reste que pour l'eau."""
    H, W = d.shape; V = {'img': img.astype(np.float32), 'k': facteur_parallaxe(d, pieds), 'H': H, 'W': W}
    V['X'], V['Y'] = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    couches = []; V['dv'] = None
    if DECOR_V1:
        try:
            import decor_vivant as DV
            im8 = np.clip(img, 0, 255).astype(np.uint8); lisse = lambda m: cv2.GaussianBlur(m.astype(np.float32), (0, 0), 3)
            cartes = {'feuillage': lisse(np.isin(seg, FEUILLAGE)), 'tissu': lisse(np.isin(seg, TISSU)),
                      'lumiere': lisse(np.isin(seg, LAMPE)), 'animal': lisse(np.isin(seg, ANIMAL))}
            import hashlib, tempfile   # couches en cache (une fois par décor, partagées par les processus de rendu)
            dv = os.path.join(cache or _dossier_lit(os.path.join(tempfile.gettempdir(), 'x.mov')),
                              'vie2-' + hashlib.sha1(im8[::7, ::7].tobytes() + seg[::7, ::7].tobytes()).hexdigest()[:12]); os.makedirs(dv, exist_ok=True)
            V['dv'] = DV.prepare(dv, im8, (), jev=False, cartes=cartes); sol = DV.soleil(im8)
            V['ampl'] = (6.0 if sol is not None and sol[1] > 110 else 1.0) * W / 1080
        except Exception as e:
            print(f'  décor de la V1 non préparé : {e}', file=sys.stderr); V['dv'] = None
    for classes, ampl, freq, vertical in (((EAU, 0.9, 1.3, 1.0),) if V['dv'] is not None else ((FEUILLAGE, 2.6, 0.55, 0.35), (TISSU, 2.2, 0.42, 0.25), (EAU, 0.9, 1.3, 1.0))):
        m = np.isin(seg, classes).astype(np.float32)
        if m.mean() < 0.002: continue
        m = cv2.GaussianBlur(cv2.erode(m, np.ones((5, 5), np.uint8)), (0, 0), 3) * (W / 1080)   # bords tenus, pas de déchirure
        couches.append({'m': m * ampl, 'f': freq, 'v': vertical, 'phi': _phase(H, W, graine + len(couches), 9) * 2.2})
    V['couches'] = couches
    try:
        import vie_fond
        V['fond'] = vie_fond.prepare(img.astype(np.float32), d, (), graine=11)
        V['fond']['ciel'] = V['fond']['ciel'] | (seg == 2)
    except Exception as e:
        print(f'  vie du fond non préparée : {e}', file=sys.stderr); V['fond'] = None
    return V


def decor_t(V, t, u):
    """décor au temps t, la caméra ayant glissé de u = (ux, uy) depuis son cadre de référence (parallaxe)."""
    import vie_fond
    mx = V['X'] + (V['k'] - 1) * float(u[0]); my = V['Y'] + (V['k'] - 1) * float(u[1])
    g = vie_fond.rafale(t)
    for c in V['couches']:
        s = np.sin(2 * math.pi * c['f'] * t + c['phi']) * g
        mx = mx + c['m'] * s; my = my + c['m'] * c['v'] * np.cos(2 * math.pi * c['f'] * 0.8 * t + c['phi'])
    gain = None
    if V.get('dv') is not None:   # textures de mouvement de la V1 (tourne.py : mx − dx, lumière des ampoules)
        import decor_vivant as DV
        dx, dy, gain = DV.champ(V['dv'], t, V['ampl']); mx = mx - dx; my = my - dy
    mx, my = mx.astype(np.float32), my.astype(np.float32)
    out = cv2.remap(V['img'], mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    if gain is not None: out = out * gain[..., None]
    if V.get('fond') is not None:
        try: out = out * vie_fond.feuillage(V['fond'], t)[..., None]
        except Exception: pass
    return out, (mx, my)


# ── GESTES : boucle douce et images interpolées ───────────────────────────────────────────────────────────────────────────
TETE_V1 = os.environ.get('TETE_V1', '1') == '1'   # têtes tournées vers le partenaire (lacet_banque.py)


def despill(F, plein=False):
    """liseré vert du détourage (vu sur les gros plans de la grammaire V1 : oreilles, cou, mains) : le vert ne dépasse plus le
    plus fort du rouge et du bleu (suppression de débordement classique) — sur la bande du bord de la découpe, ou partout
    (plein) pour un personnage tourné sur fond VERT : il n'a rien de vert à lui (les personnages habillés de vert sont tournés
    sur fond bleu, bible.FOND_BLEU), tout vert qui dépasse est un reflet du fond (vu sur les mains de Le Frimeur)."""
    for i in range(len(F)):
        a = F[i, ..., 3]; zone = (a > 0) if plein else (cv2.erode((a > 250).astype(np.uint8), np.ones((7, 7), np.uint8)) == 0) & (a > 0)
        r, g, b = F[i, ..., 0], F[i, ..., 1], F[i, ..., 2]; m = zone & (g > np.maximum(r, b))
        g[m] = np.maximum(r, b)[m]
    return F


LIT_VERSION = 3   # 2 : reflet vert ôté partout sur les personnages tournés sur fond vert ; 3 : gain de tête étalonné (lacet_banque v4)
# les versions du champ de tête (lacet_banque.VERSION) et du teint (peau.VERSION) entrent aussi dans la clé : un clip préparé
# avec un ancien champ n'est jamais relu (21/10/2026, lacet_banque v5)
LIT_PLAFOND = float(os.environ.get('LIT_PLAFOND_GO', '4')) * (1 << 30)   # cache en mémoire partagée : plus vieux effacés au-delà


def _dossier_lit(mov):
    """où garder les clips préparés. DISQUE (21/10/2026, épisode de 3 sketchs arrêté à 1 484 images sur 2 400 : « Not enough
    free space ») : LIT_CACHE s'il est donné ; sinon la mémoire partagée (/dev/shm : ne prend rien au disque de la machine,
    lue plus vite) tant qu'il lui reste 4 Gio ; à défaut à côté du clip."""
    d = os.environ.get('LIT_CACHE')
    if not d:
        try:
            st = os.statvfs('/dev/shm'); d = '/dev/shm/massamba-lit' if st.f_bavail * st.f_frsize > 4 * (1 << 30) else None
        except OSError: d = None
    if not d: return os.path.dirname(mov)
    os.makedirs(d, exist_ok=True); return d


def _retention_lit(d):
    """garde le cache en mémoire partagée sous LIT_PLAFOND : les variantes les moins récemment écrites partent d'abord (un
    fichier encore ouvert par un rendu reste lisible jusqu'à sa fermeture)."""
    if not d.startswith('/dev/shm'): return
    F = sorted((os.path.getmtime(p), os.path.getsize(p), p) for p in (os.path.join(d, x) for x in os.listdir(d)) if p.endswith('.npy'))
    tot = sum(s for _, s, _ in F)
    for _, s, p in F:
        if tot <= LIT_PLAFOND: break
        try: os.remove(p); tot -= s
        except OSError: pass


def lit_clip(mov, w, h, flip, gains, tete=True, sens=1.0):
    """images RGBA du clip à la taille voulue (uint8, lues à la demande) : tête tournée vers la droite de l'image
    (avant le miroir : vers le partenaire dans les deux cas), teint de la V1, liseré vert ôté, retournées et teintées de la
    lumière du décor. MÉMOIRE (21/10/2026, épisode de 3 sketchs : un processus de rendu tué) : chaque variante préparée est
    gardée en octets (.lit-*.npy, _dossier_lit) et ouverte en lecture à la demande — 16 fois moins de mémoire qu'en
    flottants, et calculée une fois pour toutes les répliques et tous les épisodes."""
    import hashlib, lacet_banque, peau
    cle = f"{os.path.basename(mov)}|{os.path.getmtime(mov):.0f}|{w}x{h}|{int(bool(flip))}|{float(sens):+.3f}|{tuple(round(float(g), 3) for g in gains)}|{int(bool(tete))}|{LIT_VERSION}.{lacet_banque.VERSION}.{lacet_banque.SIGMA}.{peau.VERSION}"
    d = _dossier_lit(mov); f = os.path.join(d, f"{os.path.basename(mov)[:-4]}.lit-{hashlib.sha1(cle.encode()).hexdigest()[:12]}.npy")
    if os.path.isfile(f): return np.load(f, mmap_mode='r')
    F = _prepare_clip(mov, w, h, flip, gains, tete, sens)
    tmp = f'{f[:-4]}.{os.getpid()}.npy'; np.save(tmp, F); os.replace(tmp, f); _retention_lit(d)
    return np.load(f, mmap_mode='r')


def _prepare_clip(mov, w, h, flip, gains, tete, sens):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', mov, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], capture_output=True, check=True).stdout
    p = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', mov],
                       capture_output=True, text=True, check=True).stdout.strip().split(',')
    W0, H0 = int(p[0]), int(p[1]); F = np.frombuffer(raw, np.uint8).reshape(-1, H0, W0, 4).astype(np.float32)
    if tete:   # teint de la V1 (peau.py), avant la tête tournée : la couleur suit la déformation
        try:
            import peau, lacet_banque as LB
            perso, ec = LB.clip_ecoute(mov); F = peau.teinte(F, mov, perso, ec)
        except Exception as e:
            print(f'  teint non ramené ({os.path.basename(mov)}) : {e}', file=sys.stderr)
    if tete and TETE_V1:
        try:
            import lacet_banque as LB
            perso, ec = LB.clip_ecoute(mov); C = LB.champ(perso, ec); F = LB.tourne(F, mov, C, LB.gain(C, sens) * sens)
        except Exception as e:
            print(f'  tête non tournée ({os.path.basename(mov)}) : {e}', file=sys.stderr)
    try:
        import banque
        plein = banque.fond_de(os.path.basename(mov).split('--')[0]) == 'vert'
    except Exception:
        plein = False
    F = despill(F, plein)
    F = np.stack([cv2.resize(f, (w, h), interpolation=cv2.INTER_AREA if w < W0 else cv2.INTER_CUBIC) for f in F])
    if flip: F = F[:, :, ::-1]
    F[..., :3] *= np.array(gains, np.float32)
    return np.ascontiguousarray(np.clip(F, 0, 255).round().astype(np.uint8))


def haut_du_clip(F):
    a = F[0, ..., 3] > 128; ys = np.where(a.any(1))[0]
    return float(ys[0]) / F.shape[1] if len(ys) else 0.05


def position_douce(t, n, fps_clip=16.0, dep=0.0):
    """position (fractionnaire) dans le clip : aller-retour à temps en cosinus — vitesse nulle aux deux bouts, plus de
    retournement sec ; même vitesse moyenne que le clip."""
    T = (n - 1) / fps_clip; ph = ((t + dep) / T) % 2.0
    v = ph if ph <= 1 else 2 - ph
    return (n - 1) * (1 - math.cos(math.pi * v)) / 2


def image_a(F, p):
    i = int(math.floor(p)); a = p - i; j = min(i + 1, len(F) - 1); fi = np.asarray(F[i], np.float32)
    return fi if a < 1e-3 else fi * (1 - a) + np.asarray(F[j], np.float32) * a


def colle(canvas, im, x, y):
    """pose l'image RGBA im (float) sur canvas (float RGB) en (x, y) entiers, bornée au cadre."""
    H, W = canvas.shape[:2]; h, w = im.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0: return
    s = im[y0 - y:y1 - y, x0 - x:x1 - x]; a = s[..., 3:] / 255.0
    canvas[y0:y1, x0:x1] = canvas[y0:y1, x0:x1] * (1 - a) + s[..., :3] * a


def camera(canvas, c, BW, BH):
    """image vue par la caméra : cadre c = (cx, cy, w, h) de la scène ramené à l'image de sortie (SORTIE, sinon la toile),
    au sous-pixel."""
    if SORTIE: BW, BH = SORTIE
    cx, cy, w, h = c; sc = BW / w
    src = cv2.GaussianBlur(canvas, (0, 0), 0.45 / sc) if sc < 0.95 else canvas
    M = np.float32([[sc, 0, -(cx - w / 2) * sc], [0, sc, -(cy - h / 2) * sc]])
    return cv2.warpAffine(src, M, (BW, BH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
