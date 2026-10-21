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
import json, math, os, subprocess, sys
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
# DÉCOR PAR LE TEXTE (21/10/2026, épisode banque 1 v13 : part de l'arrière-plan qui bouge 0,096 contre 0,161 pour la V1 ;
# décor seul, caméra fixe : 0,000 au maquis, 0,004 au marché, 0,000 au salon). ADE20K n'a pas de classe « fumée » : la colonne
# de fumée peinte du grill du maquis restait figée et le panache physique de la V1 (decor_vivant.fumee, Morton–Taylor–Turner)
# ne naissait jamais. CLIPSeg (Lüddecke et Ecker, CVPR 2022 ; poids CIDAS/clipseg-rd64-refined, Apache-2.0, sur CLIP ViT-B/16,
# MIT ; classe CLIPSegForImageSegmentation de transformers, logits 352 × 352 par phrase) segmente le décor par des mots :
# fumée et vapeur → couche « fumee » ; vêtements suspendus et auvents → complètent la couche « tissu » d'ADE20K.
# Une fois par décor, en cache à côté des couches vivantes (texte.npz) ; sans le modèle, le décor garde les couches d'ADE20K.
DECOR_TEXTE = os.environ.get('DECOR_TEXTE', '1') == '1'
# SURFACES AU SOLEIL (21/10/2026) : murs, façades et sols où l'ombre des feuilles de la V1 (vie_fond.feuillage) peut passer —
# ADE20K : mur, bâtiment, sol, route, herbe, trottoir, terre, maison, champ, sable, chemin, escalier, piste de terre
SURFACES = (0, 1, 3, 6, 9, 11, 13, 25, 29, 46, 52, 53, 91)
SURFACES_V1 = os.environ.get('SURFACES_V1', '1') == '1'
# VENT DANS LES FEUILLES (21/10/2026, v15 : plan à deux du marché 0,02 à 0,04 de fond qui bouge) : la V1 tenait son ombre de
# feuillage en plans serrés sur le mur de la cour, qui grossissaient le frémissement ; sur les plans plus larges de la banque,
# 1,6 à 3,2 px de frémissement restaient sous le seuil. Feuilles ×2 (rafale) : banc en cadre de plan à deux, marché 0,008 →
# 0,023, salon 0,021 → 0,062 ; taches de soleil tamisé jugées naturelles sur le rendu (sol du salon, chaussée du marché).
VENT_BANQUE = float(os.environ.get('VENT_BANQUE', '2.8'))   # v18 à 2,0 : fond 0,147 ; v19 à 2,5 (ombre 0,35) : 0,158 (V1 0,161)
FORCE_BANQUE = float(os.environ.get('FORCE_BANQUE', '0.38'))   # ombre des feuilles un peu plus marquée qu'à la cour de la V1 (0,30) : plans plus larges
MOTS = {'fumee': ('smoke', 'steam'), 'tissu': ('hanging clothes', 'fabric awning')}   # parasols : rigides, hors du tissu


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
            cur = None; S.append({'t0': t0, 't1': t1, 'sorte': 'gros', 'garde': [cible] if cible else [], 'k': [k],
                                  'deux': [n for n in dict.fromkeys([cible, ch]) if n]}); continue
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
        # RECUL AVANT LA CARTE (21/10/2026, épisode banque 1 v9 : 4 à-coups, dont 2 sous les cartes) : la carte de fin de sketch
        # se posait sur le gros plan de la réaction — plus aucune place hors du visage, et le personnage n'était plus reconnu
        # sous l'émoji (part de l'image lue comme personne 0,45 → 0,04 ; sur un plan à deux 0,25 → 0,16). La V1 pose ses cartes
        # sur un plan moyen. La caméra recule donc vers le plan à deux (l'auteur de la chute et celui qui encaisse) dans les
        # 0,6 s qui précèdent la carte, en zoom d'objectif comme le coup de zoom de la chute
        tc = P.get('_carte_t0')
        if s.get('deux') and tc is not None and s['t0'] < tc < s['t1'] + 1e-6:
            cz = cadre(B, s['deux'], 'duo' if len(s['deux']) > 1 else 'moyen', BW, BH)
            if tetes_ok(B, cz, s['deux']): s['tz'], s['cz'] = max(s['t0'], tc - 0.45), cz
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
    if s.get('tz') is not None and t >= s['tz']:   # recul avant la carte de fin de sketch
        v = ease((t - s['tz']) / 0.6); c = [a + (b - a) * v for a, b in zip(c, s['cz'])]
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


def cartes_texte(im8, dossier):
    """{couche: probabilité H × W} lue par CLIPSeg sur le décor (MOTS) ; {} sans le modèle. Cache dossier/texte.npz."""
    f = os.path.join(dossier, 'texte.npz')
    if os.path.isfile(f):
        z = np.load(f); return {k: z[k].astype(np.float32) for k in z.files}
    try:
        import torch
        from transformers import CLIPSegProcessor, CLIPSegForImageSegmentation
        from PIL import Image
        nom = os.environ.get('CLIPSEG_MODELE', 'CIDAS/clipseg-rd64-refined'); cd = os.environ.get('CLIPSEG_CACHE') or None
        proc = CLIPSegProcessor.from_pretrained(nom, cache_dir=cd); mod = CLIPSegForImageSegmentation.from_pretrained(nom, cache_dir=cd).eval()
        phrases = [m for v in MOTS.values() for m in v]; im = Image.fromarray(im8)
        with torch.inference_mode():
            lg = mod(**proc(text=phrases, images=[im] * len(phrases), padding=True, return_tensors='pt')).logits
        pr = torch.sigmoid(lg).reshape(len(phrases), *lg.shape[-2:]).numpy(); H, W = im8.shape[:2]; out = {}; i = 0
        for k, v in MOTS.items():
            out[k] = cv2.resize(pr[i:i + len(v)].max(0), (W, H), interpolation=cv2.INTER_LINEAR).astype(np.float32); i += len(v)
        del mod
    except Exception as e:
        print(f'  décor par le texte indisponible : {e}', file=sys.stderr); return {}
    tmp = f'{f}.{os.getpid()}.npz'; np.savez_compressed(tmp, **{k: v.astype(np.float16) for k, v in out.items()}); os.replace(tmp, f)
    return out


# FUMÉE PEINTE QUI MONTE (21/10/2026, même épisode) : le panache physique ajouté par-dessus naît du cœur clair de la fumée
# peinte (13 px de base au maquis) et la colonne peinte, 5 % du décor, restait figée. La texture de la fumée peinte elle-même
# est advectée vers le haut — méthode publiée, réécrite : Neyret, « Advected Textures », SCA 2003 (deux couches advectées qui
# se relaient en fondu, chacune remise à zéro quand son poids est nul : aucun saut de boucle), principe repris par Holynski et
# al., « Animating Pictures with Eulerian Motion Fields », CVPR 2021. Montée de 11 % de la hauteur du décor par seconde
# (≈ 70 px/s à 1080), méandres latéraux qui changent avec la hauteur et le temps. Premier essai (texture advectée telle
# quelle) : les lettres de l'enseigne, la braise et la porte sombre montaient avec la fumée — seule l'OPACITÉ de la fumée,
# séparée de ce qu'elle couvre, est advectée et rendue comme un écart à l'image peinte.
VOLUTES_V = float(os.environ.get('VOLUTES_V', '0.11'))   # montée, en hauteur de décor par seconde
VOLUTES_P = 1.6                                           # période de relais des deux couches (s)


def prepare_volutes(im8, p):
    """fumée peinte séparée de ce qui est derrière elle (probabilité CLIPSeg p) : fond reconstitué sous la fumée (cv2.inpaint,
    Telea), couleur de la fumée (95e centile de sa clarté) et OPACITÉ par pixel — seul ce qui éclaircit et désature le fond est
    de la fumée (lettres d'enseigne, braise et porte sombre restent en place). None sans fumée."""
    m = cv2.GaussianBlur(np.clip((p - 0.3) / 0.3, 0, 1).astype(np.float32), (0, 0), 5)
    if (m > 0.5).sum() < 0.002 * m.size: return None
    H, W = m.shape; ys, xs = np.nonzero(m > 0.05); mg = int(0.04 * W)
    x0, x1, y0, y1 = max(0, xs.min() - mg), min(W, xs.max() + mg), max(0, ys.min() - mg), min(H, ys.max() + mg)
    bloc = np.ascontiguousarray(im8[y0:y1, x0:x1]); mb = m[y0:y1, x0:x1]
    trou = cv2.dilate((mb > 0.15).astype(np.uint8) * 255, np.ones((9, 9), np.uint8))
    fond = cv2.inpaint(bloc, trou, 15, cv2.INPAINT_TELEA).astype(np.float32); I = bloc.astype(np.float32)
    L = lambda x: x @ np.float32([0.299, 0.587, 0.114])
    sat = lambda x: (x.max(2) - x.min(2)) / np.maximum(x.max(2), 1.0)
    dedans = mb > 0.5; Ls = float(np.percentile(L(I)[dedans], 95)); cs = I[dedans & (L(I) >= Ls - 1)].mean(0)
    a = np.clip((L(I) - L(fond)) / np.maximum(Ls - L(fond), 8.0), 0, 1) * np.clip((0.45 - sat(I)) / 0.2, 0, 1) * mb
    a = cv2.GaussianBlur(a.astype(np.float32), (0, 0), 1.0)
    # la colonne de fumée seule : les ampoules d'une guirlande, claires et blanches elles aussi, sont des morceaux à part
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate((a > 0.1).astype(np.uint8), np.ones((7, 7), np.uint8)))
    if n > 1: a = a * cv2.GaussianBlur((lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.float32), (0, 0), 2)
    h, w = y1 - y0, x1 - x0; X, Y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    col = (a > 0.08); base = np.where(col.any(0), h - 1 - col[::-1].argmax(0), 0).astype(np.float32)   # pied de chaque colonne
    base = cv2.GaussianBlur(np.maximum.accumulate(np.maximum.accumulate(base)[::-1])[::-1][None], (0, 0), 0.03 * W)[0]   # pied lissé
    return {'r': (x0, y0, x1, y1), 'a': a, 'd': (cs[None, None, :] - fond).astype(np.float32), 'X': X, 'Y': Y, 'pied': base[None, :], 'H': H}


def volutes(Vv, base, t):
    """base (décor float32) avec la fumée peinte qui monte à l'instant t : l'opacité de la fumée est advectée (deux couches
    relayées), son pied réalimenté (source continue) ; le décor reçoit l'ÉCART à la fumée peinte — immobile, c'est l'image
    d'origine exactement."""
    x0, y0, x1, y1 = Vv['r']; X, Y = Vv['X'], Vv['Y']; v0 = VOLUTES_V * Vv['H']; acc = 0.0
    for k in (0.0, 0.5):
        ph = (t / VOLUTES_P + k) % 1.0; tau = ph * VOLUTES_P; w = math.sin(math.pi * ph) ** 2
        dx = 0.22 * v0 * tau * np.sin(2 * math.pi * (Y / (0.18 * Vv['H']) + 0.21 * t + k))
        sy = Y + v0 * tau; sy = np.where(sy > Vv['pied'], 2 * Vv['pied'] - sy, sy)   # sous le pied : la source (fumée en miroir)
        acc = acc + w * cv2.remap(Vv['a'], (X - dx).astype(np.float32), sy.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    acc = np.where(Y <= Vv['pied'], acc, Vv['a'])                        # sous le pied, rien ne change (grill, braise)
    out = base.copy(); out[y0:y1, x0:x1] += (acc - Vv['a'])[..., None] * Vv['d']
    return np.clip(out, 0, 255, out=out)


def de_jour(nom, clarte=None):
    """décor de jour ? lu sur son nom dans la bible (« -jour », « -nuit », « -soir », « -aube »), sinon sur sa clarté moyenne
    (> 110 : le seuil de decor_vivant). JOUR PAR LE NOM (21/10/2026) : le maquis de jour, à 108,9 de clarté, perdait l'ombre
    des feuilles et l'amplitude ×6 de ses couches vivantes."""
    b = os.path.basename(nom or '').lower()
    if '-jour' in b: return True
    if any(x in b for x in ('-nuit', '-soir', '-aube', '-crepuscule')): return False
    return clarte is not None and clarte > 110


def prepare_decor(img, d, seg, pieds, graine=5, cache=None, nom=None):
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
            cle = hashlib.sha1(im8[::7, ::7].tobytes() + seg[::7, ::7].tobytes()).hexdigest()[:12]
            racine = cache or _dossier_lit(os.path.join(tempfile.gettempdir(), 'x.mov'))
            dv = os.path.join(racine, ('vie3-' if DECOR_TEXTE else 'vie2-') + cle); os.makedirs(dv, exist_ok=True)
            if DECOR_TEXTE:   # fumée et étoffes lues par les mots (CLIPSeg), probabilité > 0,35 : couche pleine à 0,65
                T = cartes_texte(im8, dv)
                sur = lambda p: lisse(np.clip((p - 0.35) / 0.3, 0, 1) > 0.5)
                if 'fumee' in T: cartes['fumee'] = sur(T['fumee'])
                if 'tissu' in T: cartes['tissu'] = np.maximum(cartes['tissu'], sur(T['tissu']))
            V['dv'] = DV.prepare(dv, im8, (), jev=False, cartes=cartes); sol = DV.soleil(im8)
            V['panache'] = DV.panache(V['dv'], im8) is not None   # pied, largeur et couleur de la fumée peinte
            if DECOR_TEXTE and 'fumee' in T: V['volutes'] = prepare_volutes(im8, T['fumee'])
            V['ampl'] = (6.0 if de_jour(nom, sol[1] if sol is not None else None) else 1.0) * W / 1080
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
        # ombre des feuilles sur les murs, façades et sols ADE20K au soleil — jamais de nuit ni sous un ciel couvert
        sol_ = None
        try:
            import decor_vivant as DV; sol_ = DV.soleil(np.clip(img, 0, 255).astype(np.uint8))
        except Exception: pass
        surf = np.isin(seg, SURFACES) if (SURFACES_V1 and sol_ is not None and de_jour(nom, sol_[1])) else (np.zeros(seg.shape, bool) if SURFACES_V1 else None)
        V['fond'] = vie_fond.prepare(img.astype(np.float32), d, (), graine=11, surfaces=surf)
        V['fond']['vent'] = VENT_BANQUE; V['fond']['force'] = FORCE_BANQUE
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
    src = volutes(V['volutes'], V['img'], t) if V.get('volutes') else V['img']
    out = cv2.remap(src, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    if gain is not None: out = out * gain[..., None]
    if V.get('panache'):   # panache physique qui monte du grill (decor_vivant.fumee, celui de la V1), derrière les acteurs
        import decor_vivant as DV
        out = DV.fumee(V['dv'], out, t)
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
    sur fond bleu, bible.FOND_BLEU), tout vert qui dépasse est un reflet du fond (vu sur les mains de Le Frimeur).
    EN PROPORTION (21/10/2026, épisode banque 1 v9 : mains de l'Agent Doumbia OLIVE dans les gestes rapides, 40,9 s et 46,4 s) :
    plafonner le vert au rouge laisse une peau brune mêlée de vert jaune-olive (110, 130, 40 → 110, 110, 40). Le vert est
    ramené d'autant SOUS le plus fort du rouge et du bleu qu'il le dépassait (→ 110, 90, 40 : brun), sans descendre sous le
    plus faible ; ce qui n'avait pas plus de vert que de rouge et de bleu (jaunes, insignes, peau) n'est pas touché."""
    for i in range(len(F)):
        a = F[i, ..., 3]; zone = (a > 0) if plein else (cv2.erode((a > 250).astype(np.uint8), np.ones((7, 7), np.uint8)) == 0) & (a > 0)
        r, g, b = F[i, ..., 0], F[i, ..., 1], F[i, ..., 2]; hi = np.maximum(r, b); m = zone & (g > hi)
        g[m] = np.maximum(np.minimum(r, b), 2 * hi - g)[m]
    return F


_MAINS = []


def _zones_mains(mov, F):
    """boîtes des mains de chaque image du clip (MediaPipe HandLandmarker, Apache-2.0, déjà dans le cache des modèles) : [[x0, y0,
    x1, y1], …] par image, en cache à côté du clip (<clip>.mains.json) ; une image où le flou cache la main reprend celles de
    ses voisines (±2), élargies."""
    f = mov[:-4] + '.mains.json'
    if os.path.isfile(f):
        d = json.load(open(f))
        if len(d) == len(F): return d
    if not _MAINS or _MAINS[0][1] != os.getpid():
        import mediapipe as mp
        from mediapipe.tasks.python import vision, BaseOptions
        Mo = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/hand_landmarker.task'
        _MAINS[:] = [((mp, vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(base_options=BaseOptions(model_asset_path=Mo),
                      num_hands=2, min_hand_detection_confidence=0.2, min_hand_presence_confidence=0.2))), os.getpid())]
    mp, det = _MAINS[0][0]; B = []
    for im in F:
        a = im[..., 3:] / 255.0; rgb = np.ascontiguousarray(np.clip(im[..., :3] * a + 200 * (1 - a), 0, 255).astype(np.uint8)); h, w = rgb.shape[:2]
        r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)); bs = []
        for lm in r.hand_landmarks:
            xs = [p.x * w for p in lm]; ys = [p.y * h for p in lm]; m = 0.35 * max(max(xs) - min(xs), max(ys) - min(ys), 12)
            bs.append([round(min(xs) - m), round(min(ys) - m), round(max(xs) + m), round(max(ys) + m)])
        B.append(bs)
    lus = [i for i, b in enumerate(B) if b]; C_ = lambda b: ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
    for i in range(len(B)):   # image où le flou cache la main : sa boîte suit la main entre l'image lue d'avant et celle d'après
        if B[i]: continue
        p = max((k for k in lus if k < i), default=None); q = min((k for k in lus if k > i), default=None); z = []
        if p is not None and q is not None and q - p <= 6:
            u = (i - p) / (q - p)
            for b in B[p]:
                c = min(B[q], key=lambda e: math.dist(C_(b), C_(e))); z.append([round(x + (y - x) * u) + (-18 if k < 2 else 18) for k, (x, y) in enumerate(zip(b[:4], c[:4]))] + [1])
        for k in (p, q):
            if k is not None and abs(k - i) <= 2: z += [[b[0] - 24, b[1] - 24, b[2] + 24, b[3] + 24, 1] for b in B[k] if len(b) == 4]
        B[i] = z
    tmp = f'{f}.{os.getpid()}'; json.dump(B, open(tmp, 'w')); os.replace(tmp, f)
    return B


def mains_vertes(F, mov):
    """MAINS OLIVE (21/10/2026, épisode banque 1 v10/v11 : mains de l'Agent Doumbia et de Tiékoro vert-kaki à 40,5, 44,7 et
    46,9 s, là où tombent les sautes restantes). Le fond vert s'est mêlé au dessin des mains (dès la planche, puis dans le flou
    des gestes : 128, 124, 56 — rouge ≈ vert ≫ bleu) ; le dé-débordement ne peut pas les séparer d'un vrai jaune. Dans la zone
    des mains détectées (_zones_mains), les pixels plus verts que la peau du personnage reprennent la couleur de sa peau
    (médiane a*, b* de ses masques de peau, peau.py), clarté gardée ; un objet tenu qui n'est pas vert (téléphone, carnet)
    garde sa couleur, et rien n'est touché hors des mains."""
    import peau
    try:
        M = peau.masques(mov, F); Z = _zones_mains(mov, F)
    except Exception as e:
        print(f'  mains non reteintes ({os.path.basename(mov)}) : {e}', file=sys.stderr); return F
    sk = M > 0.5
    if sk.sum() < 200: return F
    lab0 = [cv2.cvtColor(np.ascontiguousarray(f[..., :3] / 255.0).astype(np.float32), cv2.COLOR_RGB2LAB) for f in F]
    a_s = float(np.median(np.concatenate([l[..., 1][m] for l, m in zip(lab0, sk)]))); b_s = float(np.median(np.concatenate([l[..., 2][m] for l, m in zip(lab0, sk)])))
    out = F.copy(); h, w = F.shape[1:3]
    for i, (lab, zs) in enumerate(zip(lab0, Z)):
        if not zs: continue
        zone = np.zeros((h, w), bool)
        for b in zs: zone[max(0, b[1]):max(0, b[3]), max(0, b[0]):max(0, b[2])] = True
        olive = (F[i, ..., 3] > 64) & (lab[..., 1] < a_s - 4) & (lab[..., 2] > 5) & (lab[..., 0] < 80)
        # toute la tache olive reliée à une main (avant-bras compris), jamais plus de 6 % de l'image (un vêtement entier)
        k, lb, st, _ = cv2.connectedComponentsWithStats(olive.astype(np.uint8), connectivity=8)
        garde = [j for j in range(1, k) if st[j, 4] <= 0.06 * h * w and (zone & (lb == j)).sum() >= 10]
        cible = np.isin(lb, garde) if garde else np.zeros((h, w), bool)
        if not cible.any(): continue
        wgt = cv2.GaussianBlur(cible.astype(np.float32), (0, 0), 1.2)[..., None]
        nl = np.dstack([lab[..., 0], np.full((h, w), a_s, np.float32), np.full((h, w), b_s, np.float32)])
        out[i, ..., :3] = F[i, ..., :3] * (1 - wgt) + cv2.cvtColor(nl, cv2.COLOR_LAB2RGB) * 255 * wgt
    return out


LIT_VERSION = 5   # 2 : reflet vert ôté partout sur les personnages tournés sur fond vert ; 3 : gain de tête étalonné (lacet_banque v4) ;
#                   4 : reflet vert retiré en proportion de son excès (despill) ; 5 : mains olive des gestes rapides reteintes
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
    if plein: F = mains_vertes(F, mov)
    F = np.stack([cv2.resize(f, (w, h), interpolation=cv2.INTER_AREA if w < W0 else cv2.INTER_CUBIC) for f in F])
    if flip: F = F[:, :, ::-1]
    F[..., :3] *= np.array(gains, np.float32)
    return np.ascontiguousarray(np.clip(F, 0, 255).round().astype(np.uint8))


def haut_du_clip(F):
    a = F[0, ..., 3] > 128; ys = np.where(a.any(1))[0]
    return float(ys[0]) / F.shape[1] if len(ys) else 0.05


def position_douce(t, n, fps_clip=16.0, dep=0.0, boucle=None, bornes=None):
    """position (fractionnaire) dans le clip : aller-retour à temps en cosinus — vitesse nulle aux deux bouts, plus de
    retournement sec ; même vitesse moyenne que le clip. boucle = (g0, c0) (levres_banque.boucle, 21/10/2026) : le clip est
    joué une fois en entier, geste compris, puis l'aller-retour en cosinus ne parcourt que la pose tenue c0 … n-1 — jamais
    plus le geste à l'envers. bornes = (a, b) (levres_banque.bornes_calmes) : clip sans pose tenue, retourné à ses deux
    images les plus calmes."""
    if not boucle and bornes:
        a, b = bornes; T = (b - a) / fps_clip; ph = ((t + dep) / max(T, 1e-3)) % 2.0; v = ph if ph <= 1 else 2 - ph
        return a + (b - a) * (1 - math.cos(math.pi * v)) / 2
    if boucle:
        u = t + dep; T1 = (n - 1) / fps_clip
        if u < T1: return max(0.0, u * fps_clip)
        L = n - 1 - boucle[1]; ph = ((u - T1) / max(L / fps_clip, 1e-3)) % 2.0; v = ph if ph <= 1 else 2 - ph
        return (n - 1) - L * (1 - math.cos(math.pi * v)) / 2
    T = (n - 1) / fps_clip; ph = ((t + dep) / T) % 2.0
    v = ph if ph <= 1 else 2 - ph
    return (n - 1) * (1 - math.cos(math.pi * v)) / 2


_FLUX = {}


def _flux(F, i):
    """flux optique DIS (OpenCV, BSD) entre les images i et i+1 du clip préparé, dans les deux sens, gardé (96 paires au plus)."""
    cle = (getattr(F, 'filename', None) or id(F), F.shape, i)
    if cle not in _FLUX:
        if len(_FLUX) >= 96: _FLUX.pop(next(iter(_FLUX)))
        gris = lambda f: cv2.cvtColor(np.clip(f[..., :3] * (f[..., 3:] / 255.0) + 128.0 * (1 - f[..., 3:] / 255.0), 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
        a, b = gris(np.asarray(F[i], np.float32)), gris(np.asarray(F[i + 1], np.float32)); dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        _FLUX[cle] = (dis.calc(a, b, None), dis.calc(b, a, None))
    return _FLUX[cle]


def image_a(F, p):
    """image du clip à la position p (fractionnaire). ENTRE DEUX IMAGES (21/10/2026, épisode banque 1 v9) : le fondu enchaîné
    des deux images voisines dédoublait les mains dans les gestes rapides ; chacune est désormais déplacée vers l'instant voulu
    le long du flux optique puis mêlées au prorata (même méthode que fluide.retime_flux, Baker et al. 2011)."""
    i = int(math.floor(p)); a = p - i; j = min(i + 1, len(F) - 1); fi = np.asarray(F[i], np.float32)
    if a < 0.04 or j == i: return fi
    if a > 0.96: return np.asarray(F[j], np.float32)
    F01, F10 = _flux(F, i); h, w = fi.shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    w0 = cv2.remap(fi, gx - a * F01[..., 0], gy - a * F01[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    w1 = cv2.remap(np.asarray(F[j], np.float32), gx - (1 - a) * F10[..., 0], gy - (1 - a) * F10[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    return w0 * (1 - a) + w1 * a


# CORPS VIVANT (21/10/2026, épisode banque 1 v14 : part du corps qui bouge 0,153 et vitesse du jeu 2,7 px/s contre 0,172 et
# 3,1 pour la V1). Joué une fois, le geste laisse l'acteur dans une pose tenue presque immobile, alors qu'un humain debout ne
# l'est jamais : il oscille sur ses chevilles (balancement postural de 0,5 à 1°, entre 0,1 et 0,5 Hz) et respire (12 à 20
# cycles par minute). Le principe d'animation de l'attente (« idle ») : un balancement de poids autour des PIEDS (qui restent
# plantés) en deux sinusoïdes lentes, plus ample quand l'acteur parle, et le souffle (le corps s'allonge de 0,4 %, ancré aux
# pieds). Doux et continu : aucun retournement brusque (à-coups) ni saute.
VIE_CORPS = os.environ.get('VIE_CORPS', '1') == '1'
VIE_DEG = (0.9, 0.62)      # amplitude du balancement (degrés) : parle, écoute (v16-v17 à 0,65/0,45 : corps 0,167 ; v18 à 0,8/0,55 : 0,170, V1 0,172)


def vie_corps(im, t, pr):
    """image RGBA de l'acteur (float) balancée sur ses pieds et qui respire à l'instant t ; pr : programme (pied, phase, parle)."""
    if not VIE_CORPS or pr.get('pied') is None: return im
    ph = pr.get('phase', 0.0); A = VIE_DEG[0] if pr.get('parle') else VIE_DEG[1]
    ang = A * (0.65 * math.sin(2 * math.pi * 0.23 * t + ph) + 0.35 * math.sin(2 * math.pi * 0.41 * t + 2.1 * ph))
    sy = 1.0 + 0.004 * math.sin(2 * math.pi * 0.27 * t + 0.7 * ph)
    fx, fy = pr['pied']; c, si = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    A = np.array([[c, si * sy], [-si, c * sy]], np.float32)            # rotation × souffle vertical, autour des pieds F
    M = np.hstack([A, (np.array([fx, fy], np.float32) - A @ np.array([fx, fy], np.float32))[:, None]])
    return cv2.warpAffine(np.asarray(im, np.float32), M, (im.shape[1], im.shape[0]), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


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
