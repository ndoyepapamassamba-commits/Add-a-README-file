# MONTAGE AU FORMAT DE LA CHAÎNE (mesuré sur la vidéo la plus vue) : clip 576×460 à y = 282 dans un 9:16 576×1024, fond =
# même image agrandie et floutée, sous-titres karaoké SOUS le clip (Montserrat Black, OFL), mot prononcé en vert, mots de
# la chute en rouge, crédit des voix en fin (CC-BY). Vérifications par le calcul avant d'écrire une image.
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
LARGEUR = 2 * (SAFE['right'] + 1) - W   # 450 px : ligne centrée dans la zone sûre (celle que vérifient les assertions)
def coupes(ch):   # dispositions sur une ou deux lignes dans la zone sûre : (coût, k) ; une ligne finie sur un mot-outil coûte 1000
    up = [w.upper() for w, _, _ in ch]; r = []
    for k in range(1, len(up) + 1):
        w1 = F1.getlength(' '.join(up[:k])); w2 = F1.getlength(' '.join(up[k:])) if up[k:] else 0
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
caps = []
for L in T['lines']:
    cs = chunks(words_of(L))
    for i, ch in enumerate(cs):
        a = ch[0][1] - 0.05; b = cs[i + 1][0][1] - 0.05 if i + 1 < len(cs) else ch[-1][2] + 0.3
        caps.append([a, b, ch, layout(ch)])
caps.sort(key=lambda c: c[0])
for i in range(len(caps) - 1):
    if caps[i][1] > caps[i + 1][0]: caps[i][1] = caps[i + 1][0]
for a, b, ch, rows in caps:  # vérifications par le calcul
    for r in rows:
        wl = F1.getlength(' '.join(ch[i][0].upper() for i in r))
        assert (W - wl) / 2 >= SAFE['left'] - 1 and (W + wl) / 2 <= SAFE['right'] + 1, f'hors zone sûre : {[ch[i][0] for i in r]}'
    assert 752 + len(rows) * 50 <= SAFE['bottom'], 'sous-titre trop bas'
norm = lambda w: re.sub(r'[^A-ZÀ-ÖØ-Þ]', '', unicodedata.normalize('NFC', w.upper()))
def draw_caption(ov, t):
    for a, b, ch, rows in caps:
        if not (a <= t < b): continue
        act = max([i for i, (w, s, e) in enumerate(ch) if s - 0.02 <= t] or [0]); dr = ImageDraw.Draw(ov); y = 752
        for r in rows:
            txt = [ch[i][0].upper() for i in r]; wl = F1.getlength(' '.join(txt)); x = (W - wl) / 2
            for j, i in enumerate(r):
                w = txt[j]; col = (RED if norm(w) in {norm(p) for p in PUNCH} else GREEN) if i == act else WHITE
                dr.text((x + 2, y + 3), w, font=F1, fill=(0, 0, 0, 140)); dr.text((x, y), w, font=F1, fill=col, stroke_width=5, stroke_fill=(0, 0, 0))
                x += F1.getlength(w + ' ')
            y += 50
        return
# crédit des voix d'après le moteur réellement utilisé pour chaque réplique (voix.py écrit « moteur » dans la frise)
_mot = {L.get('moteur', 'piper') for L in T['lines']}
_v = (["Qwen3-TTS (Apache-2.0) d'après OpenSLR 57 (Apache-2.0)"] if 'qwen3' in _mot else []) + \
     (['Piper « siwis » (CC BY 4.0, SIWIS), « gilles » (CC0)'] if 'piper' in _mot else [])
credit = 'Voix : ' + ', '.join(_v) + ' · Images : Z-Image-Turbo (Apache-2.0) · Visages : LivePortrait (MIT)'
# bande son : dialogue sec + jingles des cartes (musique.py) s'ils ont été posés
BANDE = 'voix/mix-musique.wav' if os.path.isfile('voix/mix-musique.wav') and os.path.getmtime('voix/mix-musique.wav') >= os.path.getmtime('voix/mix.wav') else 'voix/mix.wav'
# ambiance réelle (ambiance.py : coqs, poules, oiseaux, vent, maquis) posée sous la bande si elle est à jour
if os.path.isfile('voix/mix-ambiance.wav') and os.path.getmtime('voix/mix-ambiance.wav') >= os.path.getmtime(BANDE): BANDE = 'voix/mix-ambiance.wav'
frames = sorted(glob.glob(f'{D}/clip/f*.jpg')); os.makedirs(f'{D}/compose', exist_ok=True); total = T['total']; c0 = total - 2.0
def une_image(k):
    fp = frames[k]; t = k / FPS; fr = cv2.imread(fp)
    sc = H / fr.shape[0]; bw = int(round(fr.shape[1] * sc))
    small = cv2.GaussianBlur(cv2.resize(fr, (bw // 4, H // 4), interpolation=cv2.INTER_AREA), (0, 0), 4.5)
    bg = cv2.resize(small, (bw, H)); x0 = (bw - W) // 2; bg = (bg[:, x0:x0 + W].astype(np.float32) * 0.92).astype(np.uint8)
    bg[CLIP_Y:CLIP_Y + fr.shape[0], :] = fr
    img = Image.fromarray(cv2.cvtColor(bg, cv2.COLOR_BGR2RGB)).convert('RGBA'); ov = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw_caption(ov, t)
    if t >= c0:
        dr = ImageDraw.Draw(ov); lines = [credit[:credit.index('·', 60) + 1].strip(' ·'), credit[credit.index('·', 60) + 1:].strip()]
        for i, ln in enumerate(lines): dr.text(((W - FC.getlength(ln)) / 2, 66 + 20 * i), ln, font=FC, fill=(255, 255, 255, 230), stroke_width=2, stroke_fill=(0, 0, 0, 200))
    Image.alpha_composite(img, ov).convert('RGB').save(f'{D}/compose/c{k:05d}.jpg', quality=92)
# MONTAGE EN PARALLÈLE (18/10/2026) : à 60 i/s, 4 047 images composées une à une prenaient environ 4 min ; chaque image est
# indépendante (fond flouté, sous-titre, générique), elles sont réparties sur les processeurs
import multiprocessing as _mp
cv2.setNumThreads(1)
with _mp.get_context('fork').Pool(int(os.environ.get('COMPOSE_PROCS', os.cpu_count() or 1))) as _p:
    _p.map(une_image, range(len(frames)), chunksize=32)
# son du fichier livré : fondu de fin, puis sonie −14 LUFS et crête vraie ≤ −2,3 dBTP mesurées en boucle (sonie.py ; le
# loudnorm d'ffmpeg en une passe laissait −15,3 LUFS et −0,7 dBTP, porte H refusée)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import sonie
y_, sr_ = sonie.lit(BANDE); y_ = y_[:int(total * sr_)]; nf_ = int(0.4 * sr_); y_[-nf_:] *= np.linspace(1, 0, nf_)
sonie.ecrit(f'{D}/bande.wav', sonie.masterise(y_, sr_))
# encodage « veryfast » CRF 18 (18/10/2026, « réduire drastiquement le temps de production ») : 31 s au lieu de 56,5 s pour les
# 4 047 images de l'épisode 1, PSNR 44,3 dB entre les deux encodages (identiques à l'œil)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-framerate', str(FPS), '-i', f'{D}/compose/c%05d.jpg', '-i', f'{D}/bande.wav', '-vf', 'format=yuv420p',
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', f'{len(frames) / FPS:.3f}', '-movflags', '+faststart', OUTMP4], check=True)
print(f'{len(caps)} groupes de sous-titres, tous dans la zone sûre ; {len(frames)} images ; {OUTMP4}')
