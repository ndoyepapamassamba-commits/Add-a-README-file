# MONTAGE AU FORMAT DE LA CHAÎNE (mesuré sur la vidéo la plus vue) : clip 576×460 à y = 282 dans un 9:16 576×1024,
# sous-titres karaoké SOUS le clip (Montserrat Black, OFL), mot prononcé en vert, mots de la chute en rouge.
# 18/10/2026 (remarques sur la v3) : plus AUCUN flou — les bandes ne sont plus l'image agrandie et floutée mais l'habillage
# net de la chaîne (marque.py : signature logo + @pseudo, titre du sketch, carte de signature en fin) ; le crédit des moteurs
# quitte l'image : celui des voix (CC-BY, obligatoire) passe dans la légende de la publication (legende.txt).
# Vérifications par le calcul avant d'écrire une image.
# python3 compose.py tournage_dir sortie.mp4
import json, os, re, subprocess, sys, glob, numpy as np, cv2, unicodedata
from PIL import Image, ImageDraw, ImageFont
D, OUTMP4 = sys.argv[1], sys.argv[2]
# cadence du tournage (60 i/s depuis le 18/10/2026 ; 30 pour les tournages plus anciens)
FPS = json.load(open(f'{D}/tournage.json')).get('fps', 30) if os.path.isfile(f'{D}/tournage.json') else 30
W, H, CLIP_Y, CH_ = 576, 1024, 282, 460
SAFE = dict(left=60 / 1080 * W, right=W - 120 / 1080 * W, bottom=H - 320 / 1920 * H)
FONT = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/fonts/Montserrat.ttf'
GREEN, RED, WHITE = (52, 232, 52), (255, 64, 64), (255, 255, 255)
T = json.load(open('timeline.json')); Hs = json.load(open('histoire.json'))
PUNCH = {unicodedata.normalize('NFC', w) for w in Hs['mots_chute']}
def font(sz, style=b'Black'):
    f = ImageFont.truetype(FONT, sz)
    try: f.set_variation_by_name(style)
    except Exception: pass
    return f
F1 = font(40); FC = font(14, b'SemiBold')
def words_of(L):
    toks = [t for t in L['texte'].replace('…', '… ').split() if t]; ws = []
    for t in toks:
        if re.fullmatch(r'[!?.,;:…»«]+', t) and ws: ws[-1] += t; continue
        ws.append(t)
    # temps des mots : partage des voyelles du texte sur la durée réelle de parole (phonèmes non muets)
    sp = [p for p in L['phonemes'] if p['ph'] not in (' ', '^', '$', '_', ',', '.', '!', '?', 'X')]  # X = bouche au repos (visèmes Rhubarb)
    a0 = L['t0'] + (sp[0]['t0'] if sp else 0); a1 = L['t0'] + (sp[-1]['t1'] if sp else L['dur'])
    n = [max(1, len(re.findall(r'[aeiouyéèêëàâîïôûœ]+', w.lower()))) for w in ws]; tot = sum(n); out, c = [], a0
    for w, k in zip(ws, n): dt = (a1 - a0) * k / tot; out.append((w, c, c + dt)); c += dt
    return out
# BLOCS PAR GROUPES DE SENS (18/10/2026). v29 : « LE POULET / A FAIT » (coupé avant « l'université ? », 4 mots au plus par
# bloc) — JEV « conforme » 0,28 ; la proposition entière « LE POULET A FAIT / L'UNIVERSITÉ ? » 0,84. Règle des sous-titreurs
# (BBC, Netflix) : couper aux ponctuations, garder ensemble ce qui va ensemble, ne jamais finir un bloc sur un mot-outil
# (article, préposition, auxiliaire, pronom, conjonction) qui appelle la suite.
OUTILS = set("le la les l' un une des du de d' au aux à a ai as avons avez ont suis es est sommes êtes sont va vais vas vont "
             "en dans sur sous pour par avec sans chez vers entre contre et ou mais donc car ni que qu' comme si quand "
             "je j' tu il elle on nous vous ils elles me m' te t' se s' ce c' cet cette ces qui dont ne n' mon ma mes ton ta tes "
             "son sa ses notre nos votre vos leur leurs quel quelle quels quelles chaque très monsieur madame mademoiselle".split())
NOMBRE = re.compile(r"\d+|(un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|"
                    r"trente|quarante|cinquante|soixante|cent|cents|mille)([-‑](et-)?\w+)*", re.I)
def outil(w, suivant=''):   # le mot appelle la suite : mot-outil, ou nombre suivi d'un nombre (« cinq | cents », « dix | mille »)
    if re.search(r'[.!?…,;:»]$', w): return False
    return w.lower().replace('’', "'") in OUTILS or bool(NOMBRE.fullmatch(w) and suivant and NOMBRE.fullmatch(re.sub(r'[.!?…,;:»]+$', '', suivant)))
# SOUS-TITRES STYLÉS ET ÉMOJIS QUI TRADUISENT (18/10/2026, « même les textes de la vidéo doivent être stylés ; traduire ce qui se
# dit en émoji parfois ; quand on est choqué, le choc ; un jeu de couleurs brillant, fluide, pas trop agressif ») :
#   · le mot prononcé est posé sur une PASTILLE arrondie à la couleur douce du personnage qui parle (repère de qui parle),
#     lettres sombres ; les autres mots en blanc à contour adouci et ombre légère ; mots de la chute en jaune chaud ;
#   · un ÉMOJI ANIMÉ (Noto, CC BY 4.0) jaillit DANS LA LIGNE, juste après le mot qui l'appelle, au moment où il est dit
#     (argent → 💸, lunettes → 😎, loyer → 🏠…), et reste jusqu'à la fin du bloc.
# ÉMOJIS DANS LA LIGNE, JAMAIS SUR LA SCÈNE (18/10/2026, v4 → v5) : posés au-dessus des mots, ils débordaient de 30 px dans
# l'image des acteurs (💸 sur la robe de Tantie Awa, 🚦 sur son pagne) ; JEV les voyait comme des objets qui flottent ou hors
# de propos (« physique » 387 images, « hors contexte » 301, « style » 448 : 650 images fautives contre 238 en v3) et
# trois sous-titres devenaient « illisibles ». Leur place est réservée dans la largeur de la ligne (découpe comprise) et
# un contrôle refuse tout émoji qui toucherait l'image des acteurs.
COUL_PERSO = {'COUMBA': (255, 128, 190), 'KOFFI': (255, 200, 80), 'MAMAN NOUNOU': (110, 225, 150), 'BAYE NDIAYE': (120, 180, 255),
              'PETIT MAMADOU': (255, 228, 100), 'TANTIE AWA': (255, 160, 100), 'MODOU': (90, 225, 230)}
EMOJI_MOTS = {   # racine du mot (sans accent, minuscule) → émoji ANIMÉ disponible chez Noto (vérifié dans api.json)
    'argent': '1f4b8', 'dje': '1f4b8', 'barre': '1f4b8', 'paie': '1f4b8', 'payer': '1f4b8', 'paye': '1f4b8', 'facture': '1f4b8',
    'banque': '1f4b8', 'portefeuille': '1f4b8', 'bedou': '1f4b8', 'riche': '1f911', 'lunette': '1f60e', 'classe': '1f60e',
    'brillent': '1f60e', 'poisson': '1f41f', 'patron': '1f440', 'peur': '1f628', 'bulletin': '1f440', 'premier': '1f947',
    'termite': '1f41c', 'cache': '1f648', 'confidentiel': '1f92b', 'loyer': '1f3e0', 'maison': '1f3e0', 'route': '1f6a6',
    'embouteillage': '1f6a6', 'gbaka': '1f697', 'voiture': '1f697', 'garage': '1f697', 'courant': '1f4a1', 'foot': '26bd',
    'ballon': '26bd', 'documentaire': '1f4fa', 'radio': '1f3b6', 'ronfle': '1f634', 'dort': '1f634', 'regime': '1f957',
    'docteur': '1fa7a', 'gratuit': '1f193', 'marche': '1f6d2', 'malade': '1f912', 'tomate': '1f345', 'quoi': '1f631',
}
_sans = lambda w: unicodedata.normalize('NFD', w.lower()).encode('ascii', 'ignore').decode()
def emoji_de(w):
    m = re.sub(r"[^a-z]", '', _sans(w.split("'")[-1]))
    if len(m) < 3: return None
    for k, cp in EMOJI_MOTS.items():
        if m == k or (len(k) >= 4 and m.startswith(k)) or (len(m) >= 5 and k.startswith(m)): return cp
    return None
EMO_W = 50   # place d'un émoji dans la ligne (42 px, élastique jusqu'à 53, + marges)
def emo_rangs(ch):   # mots du bloc qui portent un émoji : deux au plus, un seul par émoji
    r, vus = [], set()
    for i, (w, _, _) in enumerate(ch):
        cp = emoji_de(w)
        if cp and cp not in vus and len(r) < 2 and F1.getlength(w.upper()) + EMO_W <= LARGEUR: r.append(i); vus.add(cp)   # mot trop long : pas de place, pas d'émoji
    return r
def largeur(ch, idx, em):   # largeur d'une ligne (mots idx du bloc ch), émojis compris
    idx = list(idx)
    return F1.getlength(' '.join(ch[i][0].upper() for i in idx)) + EMO_W * sum(1 for i in idx if i in em)
LARGEUR = 2 * (SAFE['right'] + 1) - W   # 450 px : ligne centrée dans la zone sûre (celle que vérifient les assertions)
def coupes(ch):   # dispositions sur une ou deux lignes dans la zone sûre : (coût, k) ; une ligne finie sur un mot-outil coûte 1000
    up = [w.upper() for w, _, _ in ch]; r = []; em = set(emo_rangs(ch))
    for k in range(1, len(up) + 1):
        w1 = largeur(ch, range(k), em); w2 = largeur(ch, range(k, len(up)), em) if up[k:] else 0
        if max(w1, w2) <= LARGEUR: r.append((max(w1, w2) + (1000 if k < len(up) and outil(ch[k - 1][0], ch[k][0]) else 0), k))
    return r
tient = lambda ch: bool(coupes(ch))
def chunks(tw):
    props, cur = [], []
    for w in tw:
        cur.append(w)
        if re.search(r'[.!?…,;:]$', w[0]): props.append(cur); cur = []
    if cur: props.append(cur)
    out = []
    for p in props:   # découpe la moins coûteuse : peu de blocs, ≤ 4 mots de préférence, jamais sur un mot-outil
        n = len(p); best = [0.0] + [None] * n; cut = [0] * (n + 1)
        for i in range(1, n + 1):
            for j in range(max(0, i - 6), i):
                if best[j] is None or not tient(p[j:i]): continue
                c = best[j] + 10 + 3 * max(0, i - j - 4) + (100 if i < n and outil(p[i - 1][0], p[i][0]) else 0) \
                    + (50 if min(coupes(p[j:i]))[0] >= 1000 else 0)   # bloc visible d'un coup : ligne sur un mot-outil tolérée en dernier recours
                if best[i] is None or c <= best[i]: best[i], cut[i] = c, j   # à égalité, premier groupe le plus long (groupe nominal entier)
        i, morceaux = n, []
        while i > 0: morceaux.append(p[cut[i]:i]); i = cut[i]
        out += morceaux[::-1]
    return out
def layout(ch):
    r = coupes(ch); k = min(r)[1] if r else len(ch)   # deux lignes équilibrées, sans ligne finie sur un mot-outil si possible
    return [list(range(0, k)), list(range(k, len(ch)))] if k < len(ch) else [list(range(len(ch)))]
caps = []; CAP_QUI = {}
for L in T['lines']:
    cs = chunks(words_of(L))
    for i, ch in enumerate(cs):
        a = ch[0][1] - 0.05; b = cs[i + 1][0][1] - 0.05 if i + 1 < len(cs) else ch[-1][2] + 0.3
        caps.append([a, b, ch, layout(ch)]); CAP_QUI[id(ch)] = L['qui']
caps.sort(key=lambda c: c[0])
for i in range(len(caps) - 1):
    if caps[i][1] > caps[i + 1][0]: caps[i][1] = caps[i + 1][0]
for a, b, ch, rows in caps:  # vérifications par le calcul
    for r in rows:
        wl = largeur(ch, r, set(emo_rangs(ch)))
        assert (W - wl) / 2 >= SAFE['left'] - 1 and (W + wl) / 2 <= SAFE['right'] + 1, f'hors zone sûre : {[ch[i][0] for i in r]}'
    assert 752 + len(rows) * 50 <= SAFE['bottom'], 'sous-titre trop bas'
norm = lambda w: re.sub(r'[^A-ZÀ-ÖØ-Þ]', '', unicodedata.normalize('NFC', w.upper()))
PUNCH_N = {norm(p) for p in PUNCH}
import cartes_fx
def draw_caption(ov, t):
    for a, b, ch, rows in caps:
        if not (a <= t < b): continue
        act = max([i for i, (w, s, e) in enumerate(ch) if s - 0.02 <= t] or [0]); dr = ImageDraw.Draw(ov); y = 752
        c_ = COUL_PERSO.get(CAP_QUI.get(id(ch)), (255, 210, 63)); em = emo_rangs(ch); sp = F1.getlength(' ')
        for r in rows:
            txt = [ch[i][0].upper() for i in r]; x = (W - largeur(ch, r, em)) / 2
            for j, i in enumerate(r):
                w = txt[j]; ww = F1.getlength(w); punch = norm(w) in PUNCH_N
                if i == act:
                    u_ = max(0.0, t - ch[i][1]); k_ = 1.0 + 0.06 * max(0.0, 1 - u_ / 0.12)   # petite impulsion à l'attaque
                    pad = 7 * k_; fond = (255, 120, 110) if punch else c_
                    dr.rounded_rectangle((x - pad, y - 3 * k_, x + ww + pad, y + 47 * k_), radius=13, fill=fond + (235,))
                    dr.text((x, y), w, font=F1, fill=(28, 14, 40))
                else:
                    col = (255, 222, 110) if punch else WHITE
                    dr.text((x + 2, y + 3), w, font=F1, fill=(0, 0, 0, 110)); dr.text((x, y), w, font=F1, fill=col, stroke_width=4, stroke_fill=(24, 12, 34))
                x += ww
                if i in em:   # l'émoji jaillit dans sa place réservée quand le mot est dit
                    u_ = t - ch[i][1] + 0.02; d = int(42 * cartes_fx._pop(u_)) if u_ > 0 else 0
                    e = cartes_fx._image_emoji(emoji_de(ch[i][0]), d, u_) if d > 8 else None
                    if e is not None:
                        ex_, ey_ = int(x + EMO_W / 2 - e.width / 2), int(y + 22 - e.height / 2)
                        assert ey_ >= CLIP_Y + CH_, f'émoji sur la scène ({ey_} < {CLIP_Y + CH_})'   # contrôle : jamais sur les acteurs
                        ov.alpha_composite(e, (ex_, ey_))
                    x += EMO_W
                x += sp
            y += 50
        return
# crédit des voix d'après le moteur réellement utilisé pour chaque réplique (voix.py écrit « moteur » dans la frise)
_mot = {L.get('moteur', 'piper') for L in T['lines']}
_v = (["Qwen3-TTS (Apache-2.0) d'après OpenSLR 57 (Apache-2.0)"] if 'qwen3' in _mot else []) + \
     (['Piper « siwis » (CC BY 4.0, SIWIS), « gilles » (CC0)'] if 'piper' in _mot else [])
credit = 'Voix : ' + ', '.join(_v) + ' · Images : Z-Image-Turbo (Apache-2.0) · Visages : LivePortrait (MIT) · Émojis animés : Noto Emoji, Google (CC BY 4.0)'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import marque
import jeu as _jeu
HAB = marque.Habillage(W, H, CLIP_Y, CH_, T['sketchs'], T['total'], SAFE['left'], SAFE['right'], fps=FPS,
                       chutes=[_jeu.prise_t(L) for L in T['lines'] if L.get('chute')])
# légende de publication : accroche, mots-clés de la chaîne, crédit CC-BY des voix (attribution exigée par la licence)
_tit = ' · '.join(s_['titre'].capitalize() for s_ in T['sketchs'] if s_.get('titre'))
open(f'{D}/legende.txt', 'w', encoding='utf-8').write(f"{_tit} 😂🤣\nTu es team qui ? Dis-le en commentaire 👇\n"
    f"#drole #comedy #funny #humour #afrique #pourtoi #fyp\n\nCrédits — {credit}\n")
# bande son : dialogue sec + jingles des cartes (musique.py) s'ils ont été posés
BANDE = 'voix/mix-musique.wav' if os.path.isfile('voix/mix-musique.wav') and os.path.getmtime('voix/mix-musique.wav') >= os.path.getmtime('voix/mix.wav') else 'voix/mix.wav'
# ambiance réelle (ambiance.py : coqs, poules, oiseaux, vent, maquis) posée sous la bande si elle est à jour
if os.path.isfile('voix/mix-ambiance.wav') and os.path.getmtime('voix/mix-ambiance.wav') >= os.path.getmtime(BANDE): BANDE = 'voix/mix-ambiance.wav'
frames = sorted(glob.glob(f'{D}/clip/f*.jpg')); os.makedirs(f'{D}/compose', exist_ok=True); total = T['total']; c0 = total - 2.0
def image_composee(k):
    fp = frames[k]; t = k / FPS; fr = cv2.imread(fp)
    bg = HAB.fond.copy(); bg[CLIP_Y:CLIP_Y + fr.shape[0], :] = fr   # bandes nettes de la chaîne (plus de copie floutée)
    img = Image.fromarray(cv2.cvtColor(bg, cv2.COLOR_BGR2RGB)).convert('RGBA'); ov = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw_caption(ov, t)
    ov.alpha_composite(HAB.calque(t), (0, 0))   # signature + titre du sketch ; carte de signature en fin de film
    a_ = HAB.autocollant(t)                       # émoji animé qui jaillit sur chaque chute
    if a_ is not None: ov.alpha_composite(a_[0], a_[1])
    return Image.alpha_composite(img, ov).convert('RGB')
# BOUCLE SANS COUPURE (18/10/2026, « que mes vidéos passent en boucle partout ») : TikTok relance la vidéo d'elle-même ;
# un revisionnage est un signal fort. Les BOUCLE_S dernières secondes se fondent dans la toute première image (l'accroche),
# si bien que la relance ne montre aucune coupure : contrôle « boucle_sans_coupure » (dernière ≈ première image).
BOUCLE_S = float(os.environ.get('BOUCLE_S', 0.5)); _PREMIERE = []
def une_image(k):
    im = image_composee(k); u = (k / FPS - (len(frames) / FPS - BOUCLE_S)) / BOUCLE_S if BOUCLE_S > 0 else -1
    if u > 0:
        if not _PREMIERE: _PREMIERE.append(image_composee(0))
        a = min(1.0, (k + 1 - (len(frames) - BOUCLE_S * FPS)) / (BOUCLE_S * FPS)); a = a * a * (3 - 2 * a)
        im = Image.blend(im, _PREMIERE[0], a)
    im.save(f'{D}/compose/c{k:05d}.jpg', quality=92)
# MONTAGE EN PARALLÈLE (18/10/2026) : à 60 i/s, 4 047 images composées une à une prenaient environ 4 min ; chaque image est
# indépendante (fond flouté, sous-titre, générique), elles sont réparties sur les processeurs
import multiprocessing as _mp
cv2.setNumThreads(1)
if os.environ.get('COMPOSE_IMAGES'):   # essai : seulement ces images (numéros), sans son ni encodage
    for k_ in map(int, os.environ['COMPOSE_IMAGES'].split(',')): une_image(k_)
    sys.exit(0)
with _mp.get_context('fork').Pool(int(os.environ.get('COMPOSE_PROCS', os.cpu_count() or 1))) as _p:
    _p.map(une_image, range(len(frames)), chunksize=32)
# son du fichier livré : fondu de fin, puis sonie −14 LUFS et crête vraie ≤ −2,3 dBTP mesurées en boucle (sonie.py ; le
# loudnorm d'ffmpeg en une passe laissait −15,3 LUFS et −0,7 dBTP, porte H refusée)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import sonie
# dé-esseur (18/10), mastering, boucle fermée sur le contrôle des sifflantes APRÈS le mastering (19/10/2026, v12 : −9,8 dB à
# 40,9 s ; le limiteur comprime la parole forte, pas les sifflantes), crête revérifiée : sonie.bande_livree
sonie.ecrit(f'{D}/bande.wav', sonie.bande_livree(BANDE, total))
# encodage « veryfast » CRF 18 (18/10/2026, « réduire drastiquement le temps de production ») : 31 s au lieu de 56,5 s pour les
# 4 047 images de l'épisode 1, PSNR 44,3 dB entre les deux encodages (identiques à l'œil)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-framerate', str(FPS), '-i', f'{D}/compose/c%05d.jpg', '-i', f'{D}/bande.wav', '-vf', 'format=yuv420p',
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', f'{len(frames) / FPS:.3f}', '-movflags', '+faststart', OUTMP4], check=True)
print(f'{len(caps)} groupes de sous-titres, tous dans la zone sûre ; {len(frames)} images ; {OUTMP4}')
