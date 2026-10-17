# MONTAGE AU FORMAT DE LA CHAÎNE (mesuré sur la vidéo la plus vue) : clip 576×460 à y = 282 dans un 9:16 576×1024, fond =
# même image agrandie et floutée, sous-titres karaoké SOUS le clip (Montserrat Black, OFL), mot prononcé en vert, mots de
# la chute en rouge, crédit des voix en fin (CC-BY). Vérifications par le calcul avant d'écrire une image.
# python3 compose.py tournage_dir sortie.mp4
import json, os, re, subprocess, sys, glob, numpy as np, cv2, unicodedata
from PIL import Image, ImageDraw, ImageFont
D, OUTMP4 = sys.argv[1], sys.argv[2]
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
def chunks(tw):
    out, cur = [], []
    for w in tw:
        cur.append(w)
        if len(cur) >= 4 or re.search(r'[.!?…,]$', w[0]): out.append(cur); cur = []
    if cur: out.append(cur)
    return out
def layout(ch):
    up = [w.upper() for w, _, _ in ch]; best = None
    for k in range(1, len(up) + 1):
        w1 = F1.getlength(' '.join(up[:k])); w2 = F1.getlength(' '.join(up[k:])) if up[k:] else 0
        if max(w1, w2) <= 470 and (best is None or max(w1, w2) < best[0]): best = (max(w1, w2), k)
    k = best[1] if best else len(up)
    return [list(range(0, k)), list(range(k, len(up)))] if k < len(up) else [list(range(len(up)))]
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
credit = 'Voix : Piper « siwis » (CC BY 4.0, SIWIS), « gilles » (CC0) · Images : Z-Image-Turbo (Apache-2.0) · Visages : LivePortrait (MIT)'
frames = sorted(glob.glob(f'{D}/clip/f*.jpg')); os.makedirs(f'{D}/compose', exist_ok=True); total = T['total']; c0 = total - 2.0
for k, fp in enumerate(frames):
    t = k / 30; fr = cv2.imread(fp)
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
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-framerate', '30', '-i', f'{D}/compose/c%05d.jpg', '-i', 'voix/mix.wav',
                '-af', f'loudnorm=I=-14:TP=-1:LRA=7,afade=t=out:st={total - 0.4:.2f}:d=0.4', '-vf', 'format=yuv420p',
                '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', f'{len(frames) / 30:.3f}', '-movflags', '+faststart', OUTMP4], check=True)
print(f'{len(caps)} groupes de sous-titres, tous dans la zone sûre ; {len(frames)} images ; {OUTMP4}')
