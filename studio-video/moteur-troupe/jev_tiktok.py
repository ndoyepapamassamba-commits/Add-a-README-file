# JEV, JUGE « À LA MESURE DE VOS TIKTOK » (17/10/2026) — en plus des instruments chiffrés (cadre.py), JEV 1.14 regarde
# les images comme un spectateur :
#  1. COMPARAISON À L'AVEUGLE : une image de notre film et une image d'un de vos TikTok (faits avec Grok), présentées dans
#     les DEUX ordres (le biais de position s'annule) ; JEV dit laquelle a l'air d'un court métrage d'animation haut de
#     gamme (niveau Grok, Pixar). Parité = 50 %.
#  2. TÉMOINS : la même question sur des paires TikTok contre TikTok — elle doit donner ≈ 50 % ; l'écart mesure le bruit du
#     juge, à soustraire avant de conclure.
#  3. JEU : deux images d'une même vidéo à 0,5 s d'écart ; JEV note le jeu des personnages (0 = rien ne bouge … 3 = grand
#     mouvement expressif ou mouvement de caméra) ; une paire qui enjambe une coupe est écartée (JEV le dit aussi).
# Ajouts du 17/10/2026 (demande : « la qualité des mouvements, la fluidité de la vidéo et l'animation de l'arrière-plan ») —
# mêmes moments, mêmes questions pour le film et pour vos TikTok, une coupe ou un plan immobile écarte le moment :
#  4. QUALITÉ DES MOUVEMENTS : trois images à 0,25 s ; la QUALITÉ et non la quantité (0 = visages ou corps qui se déforment,
#     1 = pantin découpé qui glisse ou pivote, 2 = naturel mais simple, 3 = jeu du corps entier avec poids, comme Pixar).
#  5. FLUIDITÉ : quatre images consécutives à 0,1 s ; chaque changement prolonge-t-il le précédent (0 = image répétée puis
#     saut, scintillement … 3 = parfaitement continu) ; un moment où rien ne bouge n'est pas noté (rien à juger).
#  6. ARRIÈRE-PLAN VIVANT : deux images à 1 s ; seulement le décor, mouvement de caméra ignoré (0 = peinture figée …
#     3 = lieu animé : figurants, vent, fumée, véhicules).
#   python3 jev_tiktok.py film.mp4 dossier_tiktok [n] [sortie.json]
import base64, json, os, random, subprocess, sys, uuid, urllib.request
from concurrent.futures import ThreadPoolExecutor

API = 'https://api.typesafe.ai/v1/systemone'
MODELE = 'jev-1.14.0'


def duree(f):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
                                capture_output=True, text=True, check=True).stdout.strip())


def image(f, t):
    """une image de la vidéo à t secondes, 360 × 640 (ce que voit le spectateur), en JPEG base64."""
    b = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', f, '-frames:v', '1', '-vf',
                        'scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2', '-f', 'image2pipe',
                        '-vcodec', 'mjpeg', '-q:v', '3', '-'], capture_output=True, check=True).stdout
    return base64.b64encode(b).decode()


def jev(state, imgs, questions):
    ids = {k: f'{k}-{uuid.uuid4().hex[:8]}' for k in imgs}
    body = {'model': MODELE, 'state': {k: ids[k] for k in state}, 'questions': questions,
            'assets': {ids[k]: {'type': 'image', 'format': 'jpg', 'data_base64': v} for k, v in imgs.items()}}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
    for essai in range(3):
        try: return json.loads(urllib.request.urlopen(req, timeout=180).read())['answers']
        except Exception:
            if essai == 2: raise


Q_QUALITE = {'meilleure': {'type': 'choice', 'instructions':
    'Two frames, `image_a` and `image_b`, come from two vertical (9:16) animated comedy shorts. Which one looks more like a '
    'polished, high-end animated short, at the level of Grok Imagine videos or Pixar / Illumination films: characters large '
    'and expressive in the frame, cinematic framing and lighting, a rich and clean image without visual defects?',
    'criteria': {'image_a': 'image_a looks clearly more polished and high-end', 'image_b': 'image_b looks clearly more polished and high-end',
                 'egal': 'both look about as polished'}}}
Q_JEU = {
    'jeu': {'type': 'score', 'instructions': '`avant` and `apres` are two frames of the same animated video, half a second apart. '
            'How much do the characters act between them (pose, gesture, head, expression), or how much does the camera move?',
            'criteria': ['Nothing moves: practically the same image', 'Only a mouth or the eyes change',
                         'The head or the upper body clearly moves, or the camera moves slightly',
                         'A big expressive movement of the body, a gesture, or a clear camera move']},
    'coupe': {'type': 'noul', 'instructions': 'Is `apres` a different shot from `avant` (a cut to another framing, another place, or a title card)?'}}
# 4 et 6 : sur les images avant (t), milieu (t + 0,25 s), apres (t + 0,5 s), plus_tard (t + 1 s) — une seule requête
Q_MOUVEMENT_DECOR = {
    'mouvement': {'type': 'score', 'instructions':
        '`avant`, `milieu` and `apres` are three moments of the same animated video, a quarter of a second apart, in this order. '
        'Judge the QUALITY of the characters\' movement, not its amount: is it believable and appealing like in a high-end 3D '
        'animated film (body parts move together with weight and arcs; faces and bodies stay intact), or is it mechanical or '
        'broken (flat parts sliding or rotating like a cut-out puppet, rubbery stretching, melting, warping, deforming faces or limbs)?',
        'criteria': ['Broken: a face or a body deforms, melts, stretches or warps',
                     'Mechanical: flat parts slide or rotate like a cut-out puppet, or the motion is stiff',
                     'Natural but simple: believable motion with a limited range',
                     'Natural and expressive: coherent full-body acting with weight, like a Pixar film']},
    'perso_immobile': {'type': 'noul', 'instructions': 'Do the characters stay practically still across `avant`, `milieu` and `apres` (no visible change of pose, head, face or mouth)?'},
    'coupe_05': {'type': 'noul', 'instructions': 'Is `milieu` or `apres` a different shot from `avant` (a cut to another framing, another place, or a title card)?'},
    'decor': {'type': 'score', 'instructions':
        '`avant` and `plus_tard` are two moments of the same animated video, one second apart. Look only at the BACKGROUND '
        '(everything except the main characters) and ignore any camera movement (pan, zoom, drift): does the background itself '
        'live — extras or animals moving, leaves, cloth or hair in the wind, smoke, water, flickering lights, vehicles?',
        'criteria': ['Frozen: the background is a still painting', 'Barely alive: one small change (a light, a little smoke)',
                     'Alive: some elements clearly move (an extra, leaves, smoke)',
                     'Very alive: several elements move (extras, wind, smoke, vehicles), like a busy real place']},
    'coupe_10': {'type': 'noul', 'instructions': 'Is `plus_tard` a different shot from `avant` (a cut to another framing, another place, or a title card)?'},
    'carte': {'type': 'noul', 'instructions': 'Is `avant` a title card (text or an emoji on a plain background) rather than a scene of the story?'}}
# 5 : quatre images consécutives à 0,1 s
Q_FLUIDITE = {
    'fluidite': {'type': 'score', 'instructions':
        '`i1`, `i2`, `i3` and `i4` are four consecutive moments of the same video, 0.1 second apart, in this order. Judge only the '
        'SMOOTHNESS of the motion between them, not its amount: does each change continue the previous one evenly (a fluid video), '
        'or does it jerk — a frame that repeats the previous one and then a jump, a sudden jump, part of the image frozen while the '
        'rest moves, or flicker?',
        'criteria': ['Jerky: a repeated frame followed by a jump, a sudden jump, or flicker',
                     'Uneven: the change between some frames is much bigger than between others',
                     'Mostly smooth, with a small irregularity', 'Perfectly smooth: each frame continues the motion evenly']},
    'immobile': {'type': 'noul', 'instructions': 'Are `i1`, `i2`, `i3` and `i4` practically identical (nothing moves at all)?'},
    'coupe': {'type': 'noul', 'instructions': 'Is any of `i2`, `i3`, `i4` a different shot from `i1` (a cut to another framing, another place, or a title card)?'}}


def preference(film_imgs, tik_imgs, sens_fixe=None):
    """P(le film est préféré) moyenne sur les paires, chaque paire jugée dans les deux ordres ; « égal » compte pour ½."""
    def une(paire):
        a, b = paire; out = []
        for x, y, nous in ((a, b, 'image_a'), (b, a, 'image_b')):
            p = jev(['image_a', 'image_b'], {'image_a': x, 'image_b': y}, Q_QUALITE)['meilleure']['probabilities']
            out.append(p.get(nous, 0) + 0.5 * p.get('egal', 0))
        return sum(out) / 2
    with ThreadPoolExecutor(4) as ex: v = list(ex.map(une, zip(film_imgs, tik_imgs)))
    return sum(v) / len(v), v


def jeu(f, temps):
    def une(t):
        a = jev(['avant', 'apres'], {'avant': image(f, t), 'apres': image(f, t + 0.5)}, Q_JEU)
        return None if a['coupe']['noul'] >= 0.5 else a['jeu']['score']
    with ThreadPoolExecutor(4) as ex: v = [x for x in ex.map(une, temps) if x is not None]
    return (sum(v) / len(v) if v else None), len(v)


def spectateur(moments):
    """mesures 4, 5, 6 sur une liste de (vidéo, t) → {mesure: [notes valides]} ; deux requêtes par moment."""
    def un(m):
        f, t = m
        I = {'avant': image(f, t), 'milieu': image(f, t + 0.25), 'apres': image(f, t + 0.5), 'plus_tard': image(f, t + 1.0)}
        a = jev(list(I), I, Q_MOUVEMENT_DECOR)
        F = {'i1': I['avant'], 'i2': image(f, t + 0.1), 'i3': image(f, t + 0.2), 'i4': image(f, t + 0.3)}
        b = jev(list(F), F, Q_FLUIDITE)
        r = {}
        if a['carte']['noul'] >= 0.5: return r                       # carte de titre : pas une scène, rien à juger
        if a['coupe_05']['noul'] < 0.5 and a['perso_immobile']['noul'] < 0.5: r['mouvement'] = a['mouvement']['score']
        if a['coupe_10']['noul'] < 0.5: r['decor'] = a['decor']['score']
        if b['coupe']['noul'] < 0.5 and b['immobile']['noul'] < 0.5: r['fluidite'] = b['fluidite']['score']
        return r
    with ThreadPoolExecutor(4) as ex: R = list(ex.map(un, moments))
    return {k: [r[k] for r in R if k in r] for k in ('mouvement', 'fluidite', 'decor')}


def moy(v): return round(sum(v) / len(v), 3) if v else None
def ecart(v):
    if len(v) < 2: return None
    m = sum(v) / len(v); return round((sum((x - m) ** 2 for x in v) / (len(v) - 1)) ** 0.5, 3)


def stats(v): return {'moyenne': moy(v), 'ecart_type': ecart(v), 'n': len(v), 'notes': [round(x, 3) for x in v]}


def jeu_notes(moments):
    def une(m):
        f, t = m; a = jev(['avant', 'apres'], {'avant': image(f, t), 'apres': image(f, t + 0.5)}, Q_JEU)
        return None if a['coupe']['noul'] >= 0.5 else a['jeu']['score']
    with ThreadPoolExecutor(4) as ex: return [x for x in ex.map(une, moments) if x is not None]


ICI = os.path.dirname(os.path.abspath(__file__)); GABARIT = os.path.join(ICI, 'gabarit_jev_tiktok.json')


def gabarit(tiktoks, k=3, graine=17):
    """RÉFÉRENCE « ŒIL DE JEV » DE VOS TIKTOK, mesurée une fois : k moments réguliers par vidéo pour le jeu, la qualité
    des mouvements, la fluidité et l'arrière-plan ; + la préférence TikTok contre TikTok (témoins du biais du juge)."""
    rnd = random.Random(graine); tik = [(f, duree(f)) for f in tiktoks]
    moments = [(f, 1.0 + (d - 2.5) * (j + 0.5) / k) for f, d in tik for j in range(k)]
    J = jeu_notes(moments); Sp = spectateur(moments)
    temoins = [(rnd.choice(tik), rnd.choice(tik)) for _ in range(10)]
    I1 = [image(a[0], rnd.uniform(1.0, a[1] - 1.5)) for a, _ in temoins]; I2 = [image(b[0], rnd.uniform(1.0, b[1] - 1.5)) for _, b in temoins]
    p_tem, det = preference(I1, I2)
    return {'date': '17/10/2026', 'modele': MODELE, 'source': f'{len(tik)} TikTok de l’utilisateur (Grok), {k} moments par vidéo',
            'jeu': stats(J), **{m: stats(Sp[m]) for m in ('mouvement', 'fluidite', 'decor')},
            'preference_temoins': round(p_tem, 3), 'bruit_temoins': round(max(abs(x - 0.5) for x in det), 3)}


def juge_jev(film, tiktoks, n=20, graine=17, G=None):
    """le film face à vos TikTok : préférence à l'aveugle (10 paires, deux ordres) + les quatre notes du spectateur sur n
    moments réguliers du film, comparées au gabarit JEV des TikTok (calculé ici s'il manque)."""
    if G is None: G = json.load(open(GABARIT)) if os.path.isfile(GABARIT) else gabarit(tiktoks)
    rnd = random.Random(graine); D = duree(film); tik = [(f, duree(f)) for f in tiktoks]
    tp = [D * (k + 0.5) / 10 for k in range(10)]
    choix = [rnd.choice(tik) for _ in range(10)]; tt = [(f, rnd.uniform(1.0, d - 1.5)) for f, d in choix]
    p_film, detail = preference([image(film, t) for t in tp], [image(f, t) for f, t in tt])
    tf = [min(D - 1.1, D * (k + 0.5) / n) for k in range(n)]
    J = jeu_notes([(film, t) for t in tf]); Sp = spectateur([(film, t) for t in tf])
    R = {'film': os.path.basename(film), 'preference_film': round(p_film, 3), 'detail_preference': [round(x, 3) for x in detail],
         'preference_temoins': G.get('preference_temoins'), 'jeu': stats(J), **{m: stats(Sp[m]) for m in ('mouvement', 'fluidite', 'decor')},
         'gabarit': {m: {x: G[m][x] for x in ('moyenne', 'ecart_type', 'n')} for m in ('jeu', 'mouvement', 'fluidite', 'decor')}}
    return R


# tableau « œil de JEV » : notes 0–3 du film face à la moyenne de vos TikTok (tolérance 0,15 point ≈ 5 % de l'échelle)
LIGNES_JEV = [('jeu', 'Jeu des personnages (0–3)'), ('mouvement', 'Qualité des mouvements (0–3)'),
              ('fluidite', 'Fluidité de la vidéo (0–3)'), ('decor', "Arrière-plan vivant (0–3)")]


def verdict_jev(f, g):
    """✅ si le film n'est pas clairement en dessous de vos TikTok : écart ≥ − une erreur type de la différence (et au
    moins − 0,15 point) ; ⬆ sinon ; « au-dessus » quand il dépasse de plus de deux erreurs types."""
    if f['moyenne'] is None or g['moyenne'] is None: return '—'
    se = ((f['ecart_type'] or 0.5) ** 2 / max(1, f['n']) + (g['ecart_type'] or 0.5) ** 2 / max(1, g['n'])) ** 0.5
    d = f['moyenne'] - g['moyenne']
    if d > 2 * se: return '✅ au-dessus'
    return '✅' if d >= -max(se, 0.15) else '⬆ trop peu'


def tableau(R):
    out = ['| Œil de JEV | Ce film | Vos TikTok | Verdict |', '|---|---|---|---|']
    pf = R['preference_film']; pt = R.get('preference_temoins')
    out.append(f"| Image préférée à l'aveugle (parité 50 %{f', témoins {pt:.0%}' if pt is not None else ''}) | {pf:.0%} | 50 % | {'✅' if pf >= 0.5 else '⬆ trop peu'} |")
    ok = int(pf >= 0.5); tot = 1
    for k, nom in LIGNES_JEV:
        f_, g_ = R[k], R['gabarit'][k]; v = verdict_jev(f_, g_); tot += 1; ok += v.startswith('✅')
        fm = '—' if f_['moyenne'] is None else f"{f_['moyenne']:.2f}"
        out.append(f"| {nom} | {fm} ({f_['n']} moments) | {g_['moyenne']:.2f} ({g_['n']} moments) | {v} |")
    out.append(f'\n{ok}/{tot} jugements de JEV à la mesure de vos TikTok')
    return '\n'.join(out), ok, tot


if __name__ == '__main__':
    if sys.argv[1] == 'gabarit':   # python3 jev_tiktok.py gabarit dossier_tiktok [k] [sortie]
        dos = sys.argv[2]; k = int(sys.argv[3]) if len(sys.argv) > 3 else 3; dest = sys.argv[4] if len(sys.argv) > 4 else GABARIT
        G = gabarit(sorted(os.path.join(dos, f) for f in os.listdir(dos) if f.endswith('.mp4')), k)
        json.dump(G, open(dest, 'w'), ensure_ascii=False, indent=1); print(json.dumps({m: G[m]['moyenne'] for m in ('jeu', 'mouvement', 'fluidite', 'decor')}), dest)
    else:                          # python3 jev_tiktok.py film.mp4 dossier_tiktok [n] [sortie.json]
        film, dos = sys.argv[1], sys.argv[2]; n = int(sys.argv[3]) if len(sys.argv) > 3 else 20
        R = juge_jev(film, sorted(os.path.join(dos, f) for f in os.listdir(dos) if f.endswith('.mp4')), n)
        print(tableau(R)[0])
        if len(sys.argv) > 4: json.dump(R, open(sys.argv[4], 'w'), ensure_ascii=False, indent=1)
