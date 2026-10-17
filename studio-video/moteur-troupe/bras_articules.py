# BRAS ARTICULÉS QUI VISENT LES POSES DESSINÉES (17/10/2026). Défaut vu par l'utilisateur : « Mais ça a changé le
# personnage ». Mesuré par JEV (moteur-iv/conseil_identite_poses.json) : coller la pose de la planche donne un autre
# personnage sur les 8 poses essayées (identité 0,15 à 0,29, toutes sous 0,5) ; cause « la planche est dessinée avec un
# autre visage, un autre âge, une autre carrure, d'autres détails de costume » (0,99). Remède désigné par JEV (0,84, gain
# 3,51 sur 4) : GARDER LES PIXELS DU PERSONNAGE DE LA SCÈNE ; la planche ne donne plus que la CIBLE DU SQUELETTE.
#   1. chaque bras entier du personnage devient deux calques — bras (de l'épaule au coude, coiffe ronde à l'épaule) et
#      avant-bras + main (disque rond au coude, posé par-dessus) : une articulation ronde centrée sur son pivot ne laisse
#      voir aucune coupure, quel que soit l'angle (méthode des papiers découpés : Live2D, DragonBones MIT, réécrite) ;
#   2. ce qu'il y avait derrière le bras entier est reconstitué UNE fois par LaMa (Apache-2.0) : le buste, la robe, ou le
#      décor (plaque) — le bras levé découvre le corps, jamais un trou ni un fantôme de bras ;
#   3. les angles visés (bras, avant-bras) sont lus sur la pose dessinée (33 points du corps) et appliqués au bras du
#      personnage de la scène par cinématique directe à deux os ; buste et tête suivent la pose dans leur enveloppe sans
#      défaut. GÉNÉRALISÉ : la planche d'un personnage sert de vocabulaire à tous les autres (assis compris : les bras
#      jouent, les jambes restent), donc un personnage sans planche gesticule aussi.
#   prepare(img, alpha, pts, bbox) → calques (format de gestes.prepare, lus par rig2d)
#   cibles(slug_planche, pts_scene, bbox) → {pose: {'gauche': (a_bras, a_avant_bras), 'droit': …, 'buste': d, 'tete': d}}
import math, os
import numpy as np, cv2
import gestes

COTES = {'gauche': ('l', 11, 13, 15, (17, 19, 21)), 'droit': ('r', 12, 14, 16, (18, 20, 22))}   # MediaPipe


def _seg(xs, ys, A, B):
    d = B - A; L2 = float(d @ d) + 1e-6
    t = ((xs - A[0]) * d[0] + (ys - A[1]) * d[1]) / L2; tc = np.clip(t, 0, 1)
    return t, np.hypot(xs - (A[0] + tc * d[0]), ys - (A[1] + tc * d[1]))


def _ang(v): return math.atan2(float(v[1]), float(v[0]))
def _wrap(a): return (a + math.pi) % (2 * math.pi) - math.pi


def joints(P, s):
    """épaule, coude, poignet, centre de la main (modèle rig2d complété)."""
    S, E, W = P[s + 'Sh'], P[s + 'El'], P[s + 'Wr']; M = P[s + 'Hand']
    if np.linalg.norm(M - W) < 0.15 * np.linalg.norm(W - E): M = W + 0.35 * (W - E)
    return np.asarray(S, np.float64), np.asarray(E, np.float64), np.asarray(W, np.float64), np.asarray(M, np.float64)


def coude_corrige(alpha, S, E, W, conf):
    """repère du coude peu sûr (MediaPipe < 0,5) et bras plié (poing sur la hanche) : le coude est le point de la
    silhouette le plus écarté du segment épaule → poignet, du côté extérieur."""
    if conf >= 0.5: return E
    y0, y1 = int(min(S[1], W[1])), int(max(S[1], W[1])) + 1; H, Wd = alpha.shape
    ys, xs = np.nonzero(alpha[max(0, y0):min(H, y1)] > 0.5); ys = ys + max(0, y0)
    if not len(xs): return E
    d = W - S; n = np.array([-d[1], d[0]]) / (np.linalg.norm(d) + 1e-6)
    if (E - S) @ n < 0: n = -n                              # côté où MediaPipe a vu le coude
    off = (xs - S[0]) * n[0] + (ys - S[1]) * n[1]
    i = int(np.argmax(off)); C = np.array([xs[i], ys[i]], np.float64)
    r = 0.18 * np.linalg.norm(d)
    return C - n * r if off[i] > 2 * r else E               # le coude est à une demi-largeur de bras du bord


def demi_largeur(alpha, A, B, defaut):
    """demi-largeur du membre A → B : mesurée des deux côtés jusqu'au bord de la silhouette ; on garde le côté le plus
    court (l'autre peut traverser le buste), bornée à [0,5 ; 1,6] × la valeur par défaut."""
    d = B - A; L = float(np.linalg.norm(d)) + 1e-6; u = d / L; n = np.array([-u[1], u[0]]); H, W = alpha.shape
    mes = []
    for t in (0.3, 0.45, 0.6, 0.75):
        C = A + t * d; cot = []
        for sg in (1, -1):
            k = 0
            for k in range(1, int(2.5 * defaut) + 2):
                x, y = int(round(C[0] + sg * k * n[0])), int(round(C[1] + sg * k * n[1]))
                if not (0 <= x < W and 0 <= y < H) or alpha[y, x] < 0.5: break
            cot.append(k)
        mes.append(min(cot))
    return float(np.clip(np.median(mes), 0.5 * defaut, 1.6 * defaut))


def _largeur_peau(peau, A, B, defaut):
    """demi-largeur d'un avant-bras NU : distance au bord de la peau détectée (axe médian), près du segment A → B."""
    H, W = peau.shape; m = (peau > 0.5).astype(np.uint8)
    if m.sum() < 30: return None
    dt = cv2.distanceTransform(m, cv2.DIST_L2, 5); v = []
    for t in (0.3, 0.45, 0.6, 0.75):
        C = A + t * (B - A); x, y = int(round(C[0])), int(round(C[1])); k = int(max(3, 0.5 * defaut))
        z = dt[max(0, y - k):min(H, y + k + 1), max(0, x - k):min(W, x + k + 1)]
        if z.size: v.append(float(z.max()))
    v = [x for x in v if x > 1.5]
    return float(np.clip(np.median(v), 0.5 * defaut, 1.6 * defaut)) if len(v) >= 2 else None


def prepare(img, alpha, pts, bbox, autres=None, conf_min=0.5):
    """deux calques par bras (bras, avant-bras + main) au format de gestes.prepare, plus 'part', 'S', 'E', 'W', 'M'.
    Un bras n'est articulé que si ses repères sont sûrs (épaule, coude, poignet ≥ conf_min) et s'il n'est pas caché par
    un autre acteur (`autres` : alpha des autres, > 8 % du bras recouvert → bras laissé au squelette)."""
    import rig2d
    H, W = img.shape[:2]; M = rig2d.modele(pts, bbox); P = M['P']; p = np.asarray(pts, np.float64); out = []
    sw = float(M['sw']); cou = np.asarray(P['neck'], np.float64)
    x0b, y0b, x1b, y1b = [int(v) for v in bbox]; mgb = int(0.1 * max(x1b - x0b, y1b - y0b))
    peau = gestes.peau_corps(img, (x0b - mgb, y0b - mgb, x1b + mgb, y1b + mgb)) * np.clip(alpha, 0, 1)
    for cote, (s, iS, iE, iW, iM) in COTES.items():
        if p.shape[1] > 2 and min(p[iS, 2], p[iE, 2], p[iW, 2]) < conf_min:
            print(f'   bras {cote} : repères peu sûrs ({p[iS, 2]:.1f}, {p[iE, 2]:.1f}, {p[iW, 2]:.1f}) — laissé au squelette', flush=True); continue
        S, E, Wr, Mh = joints(P, s)
        L1, L2 = float(np.linalg.norm(E - S)), float(np.linalg.norm(Wr - E))
        if L1 < 8 or L2 < 8: continue
        r1 = demi_largeur(alpha, S, E, 0.16 * sw)
        r2 = _largeur_peau(peau, E, Wr, 0.12 * sw) or demi_largeur(alpha, E, Wr, 0.12 * sw)
        rh = max(0.9 * r2, 0.55 * float(np.linalg.norm(Mh - Wr)) + 0.5 * r2)
        pts_ = np.array([S, E, Wr, Mh]); mg = int(max(r1, r2, rh) * 1.6 + 6)
        x0, y0 = [int(max(0, v - mg)) for v in pts_.min(0)]; x1, y1 = int(min(W, pts_[:, 0].max() + mg)), int(min(H, pts_[:, 1].max() + mg))
        ys, xs = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        t1, d1 = _seg(xs, ys, S, E); t2, d2 = _seg(xs, ys, E, Wr); d3 = np.hypot(xs - Mh[0], ys - Mh[1])
        a = np.clip(alpha[y0:y1, x0:x1], 0, 1).astype(np.float32)
        # côté EXTÉRIEUR du bras (loin du buste) : la silhouette ; côté intérieur : la manche ne mord pas sur le buste
        u = (E - S) / (L1 + 1e-6); n = np.array([-u[1], u[0]])
        if (S - cou) @ n < 0: n = -n
        sd = (xs - S[0]) * n[0] + (ys - S[1]) * n[1]               # > 0 : vers l'extérieur
        haut = (d1 <= r1) & (t1 >= 0) & (t1 <= 1) & (sd >= -0.8 * r1)
        cap = (np.hypot(xs - S[0], ys - S[1]) <= 0.9 * r1) & (((xs - S[0]) * (S - cou)[0] + (ys - S[1]) * (S - cou)[1]) >= -0.2 * r1 * np.linalg.norm(S - cou))
        haut |= cap                                                  # coiffe ronde à l'épaule, jamais côté poitrine
        bas = ((d2 <= r2) & (t2 >= 0)) | (d3 <= rh) | (np.hypot(xs - E[0], ys - E[1]) <= 1.0 * max(0.8 * r1, r2))   # disque au coude
        haut &= ~(((d2 <= r2) & (t2 > 0.02)) | (d3 <= rh))
        bras = (haut | bas) & (a > 0.3)
        if bras.sum() < 60: continue
        if autres is not None and float((autres[y0:y1, x0:x1] > 0.5)[bras].mean()) > 0.08:
            print(f'   bras {cote} : caché par un autre acteur — laissé au squelette', flush=True); continue
        trou = cv2.dilate(bras.astype(np.uint8), np.ones((9, 9), np.uint8))   # bord adouci et ombre portée compris
        tp = np.zeros((H, W), np.uint8); tp[y0:y1, x0:x1] = trou
        reg = np.ascontiguousarray(img[y0:y1, x0:x1])
        fond = gestes.details(gestes.remplit_natif(img, tp)[y0:y1, x0:x1], reg, trou, bras.astype(np.float32))
        # silhouette du bras ENTIER (bord doux de la découpe ; coupure douce à l'épaule) : décontamination et corps dessous ;
        # chaque calque ne couvre que sa partie — le bras déborde de 2 px sous l'avant-bras (posé par-dessus) : pas de couture
        sil_bras = cv2.GaussianBlur(bras.astype(np.float32), (0, 0), 0.8) * a
        seul = (sil_bras > 0.3).astype(np.uint8)
        rgb_ext = cv2.inpaint(reg, (1 - seul) * cv2.dilate(seul, np.ones((11, 11), np.uint8)), 4, cv2.INPAINT_TELEA)
        haut_d = haut & ~cv2.erode((bas & ~haut).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        for part, m, piv in (('haut', haut_d, S), ('bas', bas, E)):
            sil = (cv2.GaussianBlur((m & (a > 0.3)).astype(np.float32), (0, 0), 0.8) * a).astype(np.float32)
            out.append(dict(cote=cote, part=part, nu=True, piv=np.asarray(piv, np.float32), x=float(piv[0]), lf=L2, box=(x0, y0, x1, y1),
                            rgb=reg, calque=sil, sil=sil, sil_bras=sil_bras.astype(np.float32), fondu=np.ones_like(sil), fond=fond, trou=trou.astype(bool), sens=-1.0,
                            Hc=np.asarray(Mh, np.float32), empreinte=sil, rgb_ext=rgb_ext, calque_ext=sil, amax=0.0, emax=1.0,
                            S=S.astype(np.float32), E=E.astype(np.float32), W=Wr.astype(np.float32), M=Mh.astype(np.float32),
                            r=np.float32(r1 if part == 'haut' else r2)))
    return out


def _bras_dessin(Pd, cote, miroir):
    """directions (bras, avant-bras) d'un bras de la pose dessinée ; en miroir, le bras de l'autre côté retourné."""
    c = cote if not miroir else ('droit' if cote == 'gauche' else 'gauche')
    _, iS, iE, iW, _ = COTES[c]; S, E, W = Pd[iS, :2], Pd[iE, :2], Pd[iW, :2]
    u, f = E - S, W - E
    if miroir: u, f = u * np.array([-1, 1]), f * np.array([-1, 1])
    return _ang(u), _ang(f)


def cibles(Pd_poses, P_scene, miroir=False, limite_coude=150.0):
    """angles à appliquer aux calques de la scène pour chaque pose dessinée : (bras, avant-bras) en degrés dans la
    convention des calques (sens −1 : angle d'écran, y vers le bas), plus buste et tête (écarts à la pose neutre)."""
    out = {}
    neutre = Pd_poses.get('neutre')
    for nom, Pd in Pd_poses.items():
        if nom == 'neutre': continue
        c = {}
        for cote, (s, *_r) in COTES.items():
            S, E, W, _ = joints(P_scene, s)
            pu, pf = _bras_dessin(Pd, cote, miroir)
            su, sf = _ang(E - S), _ang(W - E)
            a1 = _wrap(pu - su); rel = _wrap((pf - pu) - (sf - su))
            rel = float(np.clip(rel, -math.radians(limite_coude), math.radians(limite_coude)))
            c[cote] = (math.degrees(a1), math.degrees(rel))
        if neutre is not None:
            def tronc(Q): return _ang((Q[11, :2] + Q[12, :2]) / 2 - (Q[23, :2] + Q[24, :2]) / 2)
            def yeux(Q): return _ang(Q[2, :2] - Q[5, :2])
            sg = -1 if miroir else 1
            c['buste'] = sg * math.degrees(_wrap(tronc(Pd) - tronc(neutre))); c['tete'] = sg * math.degrees(_wrap(yeux(Pd) - yeux(neutre)))
        out[nom] = c
    return out


# ── CONTRÔLE DE JEV, POSE PAR POSE (aucune tolérance) ─────────────────────────────────────────────────────────────────
# Chaque pose visée est rendue dans la scène à 100 %, 75 % et 50 % de son ampleur ; JEV juge chaque image : même
# personnage (identité > 0,5) ET aucun défaut de rendu (< 0,5). On garde l'ampleur la plus grande qui passe ; une pose
# qu'aucune ampleur ne fait passer n'est jamais jouée. Le défaut vu par l'utilisateur (« ça a changé le personnage »)
# devient ainsi un contrôle automatique.
ECHELLES = (1.0, 0.75, 0.5)
Q_ID = ('`{r}` shows a cartoon character in its original pose; `{i}` shows the same scene after the character was re-posed. '
        'Is the character in the middle of `{i}` the very same character as in `{r}` — same face, age, body build, outfit, '
        'patterns and colors — with only the arms, head or torso posed differently?')
Q_DEF = ('Look at the character in the middle of `{i}`. Is there any visible rendering defect on this character: an arm, hand '
         'or sleeve that looks detached, duplicated, cut, smeared, stretched like rubber or bent impossibly, a floating piece '
         'of cloth or skin, a hole, or a ghost or trace of the arm at its old place?')


def juge(rendu, nom_perso, poses, cache=None, physique=None):
    """rendu(pose, echelle) → image BGR recadrée sur le personnage ; physique(pose, echelle) → part de bras posée sur le
    buste en plus du repos (loi « un membre ne traverse pas le corps ») : au-delà de TRAVERSE_MAX, refusée sans JEV.
    Renvoie {pose: échelle retenue} et le détail."""
    import json, uuid, jev_api
    C = {}
    if cache and os.path.isfile(cache):
        try: C = json.load(open(cache))
        except Exception: C = {}
    if C.get('poses') == sorted(poses) and 'echelles' in C: return C['echelles'], C.get('detail', {})
    ref = rendu(None, 0.0); rid = f'scene-{uuid.uuid4().hex[:6]}'
    assets = {rid: {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(ref)}}; etat = {'scene': rid}; Q = {}; cles = []
    refus = {}
    for p in poses:
        for e in ECHELLES:
            if physique is not None:
                tr = physique(p, e)
                if tr > TRAVERSE_MAX: refus[f'{p}@{e}'] = round(tr, 3); continue
            i = f'{p}-{int(e * 100)}-{uuid.uuid4().hex[:4]}'; cles.append((p, e, i))
            assets[i] = {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(rendu(p, e))}; etat[i] = i
            Q[f'id|{i}'] = {'type': 'noul', 'instructions': Q_ID.format(r=rid, i=i)}
            Q[f'def|{i}'] = {'type': 'noul', 'instructions': Q_DEF.format(i=i)}
    detail = {}
    for k in range(0, len(cles), 6):   # 6 images par requête : sous le contexte de JEV
        bloc = cles[k:k + 6]; ids = {rid} | {i for _, _, i in bloc}
        r = jev_api.demande({x: y for x, y in etat.items() if y in ids}, {q: v for q, v in Q.items() if q.split('|')[1] in ids},
                            {x: v for x, v in assets.items() if x in ids}, outil='bras_articules')
        for p, e, i in bloc:
            detail[f'{p}@{e}'] = (round(float(r[f'id|{i}']['noul']), 3), round(float(r[f'def|{i}']['noul']), 3))
    for k_, tr in refus.items(): detail[k_] = ('traverse le buste', tr)
    ech = {}
    for p in poses:
        ok = [e for e in ECHELLES if f'{p}@{e}' not in refus and detail[f'{p}@{e}'][0] > 0.5 and detail[f'{p}@{e}'][1] < 0.5]
        if ok: ech[p] = max(ok)
    print(f'{nom_perso} : JEV (identité, défaut) {detail} → ampleurs gardées {ech}', flush=True)
    if cache:
        try: json.dump({'poses': sorted(poses), 'echelles': ech, 'detail': detail}, open(cache, 'w'), indent=1)
        except OSError: pass
    return ech, detail


# ── LOI PHYSIQUE : UN MEMBRE NE TRAVERSE JAMAIS LE CORPS (17/10/2026) ───────────────────────────────────────────────────
# Défaut vu par l'utilisateur : « cinquième photo, le bras traverse le maillot, c'est pas normal » (essai « haussement »
# à 100 % : l'avant-bras tourne à plat autour du coude et balaie le maillot, alors qu'un vrai bras plierait le coude vers
# l'avant). Contrôle automatique : la part de l'avant-bras et de la main posée SUR LE BUSTE (polygone épaules → hanches,
# corps sans les bras) ne doit pas dépasser celle du repos de plus de TRAVERSE_MAX ; sinon la pose est refusée avant JEV.
TRAVERSE_MAX = 0.04


def _buste(R):
    P = R['M']['P']; X0, Y0, X1, Y1 = R['box']
    poly = np.array([P['lSh'], P['rSh'], P['rHip'], P['lHip']], np.float64)
    c = poly.mean(0); poly = c + (poly - c) * 0.92                      # un peu en dedans des bords du buste
    m = np.zeros((Y1 - Y0, X1 - X0), np.uint8)
    cv2.fillPoly(m, [np.round(poly - [X0, Y0]).astype(np.int32)], 1)
    return m.astype(np.float32)


def traverse(R, pose):
    """part de chaque avant-bras / main (calque) posée sur le buste, en plus du repos ; renvoie le maximum."""
    import rig2d
    X0, Y0, X1, Y1 = R['box']; w, h = X1 - X0, Y1 - Y0; buste = _buste(R)
    def parts(p):
        mats = rig2d._fk(R, p); out = []
        for b, T in zip(R['bras'], rig2d.pose_bras(R, p, mats)):
            if b.get('part') == 'haut': out.append(0.0); continue
            x0, y0, x1, y1 = b['box']; A = rig2d._tr((-X0, -Y0)) @ T @ rig2d._tr((x0, y0))
            cb = cv2.warpAffine(b['calque'], A[:2], (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
            out.append(float((cb * buste).sum() / max(1.0, cb.sum())))
        return out
    repos = parts({k: v for k, v in pose.items() if k != 'gestes'})
    return max([0.0] + [a - b for a, b in zip(parts(pose), repos)])
