# MONTAGE AU FORMAT DE LA CHAÎNE (référence : la vidéo TikTok la plus vue de l'utilisateur, mesurée le 16/10/2026) :
#  - clip 576 × 460 posé à y = 282 dans un 9:16 576 × 1024 ;
#  - fond = la même image agrandie (couvre 9:16) et floutée ;
#  - sous-titres karaoké SOUS le clip : groupes de 2 à 4 mots en MAJUSCULES très grasses (Montserrat Black, OFL),
#    contour noir, le mot prononcé en vert, les mots de la chute en rouge — temps des mots tirés des phonèmes du moteur ;
#  - tout est vérifié par le calcul : sous-titres dans la zone sûre TikTok, jamais sur le clip, générique sans chevauchement.
#  python3 compose_chaine.py <dossier de version> (contient frames/, words.json ; voix-ton.wav et subs/credit.txt à côté)
import json, glob, os, re, subprocess, sys
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

V = sys.argv[1] if len(sys.argv) > 1 else 'v8'
W, H, CLIP_Y = 576, 1024, 282
SAFE = dict(top=108 / 1920 * H, bottom=H - 320 / 1920 * H, left=60 / 1080 * W, right=W - 120 / 1080 * W)
FONT = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/fonts/Montserrat.ttf'
GREEN, RED, WHITE = (52, 232, 52), (255, 64, 64), (255, 255, 255)
d = json.load(open(f'{V}/words.json'))
words_by_line, total = d['words'], d['total']
frames = sorted(glob.glob(f'{V}/frames/f*.jpg'))
NFR = len(frames)

def font(sz, style=b'Black'):
    f = ImageFont.truetype(FONT, sz)
    try: f.set_variation_by_name(style)
    except Exception: pass
    return f
F1 = font(40)

# ── mots → temps (groupes de phonèmes ; à défaut, partage proportionnel au nombre de lettres) ──
def timed_words(L):
    toks = [t for t in L['text'].replace('…', '… ').split() if t]
    ws = []
    for t in toks:
        if re.fullmatch(r'[!?.,;:…»«]+', t) and ws: ws[-1] = ws[-1] + t if t != '…' else ws[-1] + '…'; continue
        ws.append(t)
    g = L['groups']
    if not g: return []
    if len(g) == len(ws): return [(w, a['t0'], a['t1']) for w, a in zip(ws, g)]
    a0, a1 = g[0]['t0'], g[-1]['t1']
    lens = [max(1, len(re.sub(r'\W', '', w))) for w in ws]; tot = sum(lens); out, c = [], a0
    for w, n in zip(ws, lens):
        dt = (a1 - a0) * n / tot; out.append((w, c, c + dt)); c += dt
    return out

def chunks(tw, punch_words):
    out, cur = [], []
    for i, (w, a, b) in enumerate(tw):
        cur.append((w, a, b))
        end = re.search(r'[.!?…,]$', w) is not None
        if len(cur) >= 4 or end: out.append(cur); cur = []
    if cur: out.append(cur)
    return out

def layout(ch):
    # 2 lignes au plus, chaque ligne ≤ 500 px ; coupure au milieu en nombre de lettres
    up = [w.upper() for w, _, _ in ch]
    best = None
    for k in range(1, len(up) + 1):
        l1, l2 = up[:k], up[k:]
        w1 = F1.getlength(' '.join(l1)); w2 = F1.getlength(' '.join(l2)) if l2 else 0
        sc = max(w1, w2) + (0 if l2 else 0)
        if max(w1, w2) <= 500 and (best is None or sc < best[0]): best = (sc, k)
    k = best[1] if best else len(up)
    return [list(range(0, k)), list(range(k, len(up)))] if k < len(up) else [list(range(len(up)))]

PUNCH = {'SAUVÉ', 'SAUVÉ!', 'COMÉDIEN', 'COMÉDIEN!'}
caps = []  # (t_debut, t_fin, chunk, lignes)
for li, L in enumerate(words_by_line):
    tw = timed_words(L)
    for ci, ch in enumerate(chunks(tw, PUNCH)):
        a = ch[0][1] - 0.05
        nxt = None
        # le groupe suivant de la même réplique, sinon la fin de la réplique + 0,3 s
        all_ch = chunks(tw, PUNCH)
        b = all_ch[ci + 1][0][1] - 0.05 if ci + 1 < len(all_ch) else ch[-1][2] + 0.3
        caps.append((a, b, ch, layout(ch)))
# chevauchements entre groupes de répliques différentes : le suivant l'emporte
caps.sort(key=lambda c: c[0])
for i in range(len(caps) - 1):
    if caps[i][1] > caps[i + 1][0]: caps[i] = (caps[i][0], caps[i + 1][0], caps[i][2], caps[i][3])

LS = 50  # interligne
def draw_caption(img, t):
    for a, b, ch, rows in caps:
        if not (a <= t < b): continue
        # mot actif = dernier mot commencé
        act = max([i for i, (w, s, e) in enumerate(ch) if s - 0.02 <= t] or [0])
        dr = ImageDraw.Draw(img)
        y = 752
        boxes = []
        for r in rows:
            txt = [ch[i][0].upper() for i in r]
            wl = F1.getlength(' '.join(txt)); x = (W - wl) / 2
            for j, i in enumerate(r):
                w = txt[j]; col = WHITE
                if i == act: col = RED if re.sub(r'\W', '', w) in {re.sub(r'\W', '', p) for p in PUNCH} else GREEN
                dr.text((x + 2, y + 3), w, font=F1, fill=(0, 0, 0, 140))
                dr.text((x, y), w, font=F1, fill=col, stroke_width=5, stroke_fill=(0, 0, 0))
                x += F1.getlength(w + ' ')
            boxes.append(((W - wl) / 2, y, (W + wl) / 2, y + 44))
            y += LS
        return boxes
    return []

# vérifications par le calcul (avant d'écrire une seule image)
report = []
for a, b, ch, rows in caps:
    for r in rows:
        wl = F1.getlength(' '.join(ch[i][0].upper() for i in r))
        if (W - wl) / 2 < SAFE['left'] - 1 or (W + wl) / 2 > SAFE['right'] + 1: sys.exit(f'sous-titre hors zone sûre : {[ch[i][0] for i in r]} ({wl:.0f} px)')
    yb = 752 + len(rows) * LS
    if yb > SAFE['bottom']: sys.exit(f'sous-titre trop bas : {yb:.0f} > {SAFE["bottom"]:.0f}')
    if 752 < CLIP_Y + 460: sys.exit('sous-titre sur le clip')
report.append(f'{len(caps)} groupes de sous-titres, tous dans la zone sûre (x {SAFE["left"]:.0f}–{SAFE["right"]:.0f}, bas ≤ {SAFE["bottom"]:.0f} px), sous le clip (y ≥ {CLIP_Y + 460})')
credit = open('subs/credit.txt').read().strip(); FC = font(15, b'SemiBold'); c0 = total - 1.6
report.append(f'générique en haut (y 70) pendant les {total - c0:.1f} dernières secondes, au-dessus du clip (y {CLIP_Y}) → aucun chevauchement')

os.makedirs(f'{V}/compose', exist_ok=True)
for k, fp in enumerate(frames):
    t = k / 30
    fr = cv2.imread(fp)
    # fond : l'image agrandie pour couvrir le 9:16, floutée (flou calculé en petit puis agrandi : rapide et doux)
    sc = H / fr.shape[0]; bw = int(round(fr.shape[1] * sc))
    small = cv2.resize(fr, (bw // 4, H // 4), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), 4.5)
    bg = cv2.resize(small, (bw, H), interpolation=cv2.INTER_LINEAR)
    x0 = (bw - W) // 2; bg = bg[:, x0:x0 + W]
    bg = (bg.astype(np.float32) * 0.92).astype(np.uint8)
    bg[CLIP_Y:CLIP_Y + fr.shape[0], :] = fr
    img = Image.fromarray(cv2.cvtColor(bg, cv2.COLOR_BGR2RGB)).convert('RGBA')
    ov = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw_caption(ov, t)
    if t >= c0:
        dr = ImageDraw.Draw(ov); cw = FC.getlength(credit)
        dr.text(((W - cw) / 2, 70), credit, font=FC, fill=(255, 255, 255, 220), stroke_width=2, stroke_fill=(0, 0, 0, 180))
    img = Image.alpha_composite(img, ov).convert('RGB')
    img.save(f'{V}/compose/c{k:05d}.jpg', quality=93)

subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-framerate', '30', '-i', f'{V}/compose/c%05d.jpg', '-i', 'voix-ton.wav',
                '-vf', f'fade=t=out:st={total - 0.5:.2f}:d=0.5,format=yuv420p',
                '-af', f'afade=t=in:st=0:d=0.03,afade=t=out:st={total - 0.5:.2f}:d=0.5,apad',
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-t', f'{NFR / 30:.4f}', '-movflags', '+faststart',
                f'{V}/troupe-village-{V}.mp4'], check=True)
print('\n'.join(report))
