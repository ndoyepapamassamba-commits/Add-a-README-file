#!/usr/bin/env python3
"""MONTAGE FINAL — les images rendues par Blender deviennent le film livré, dans le format de vos TikTok :
  • plans à deux personnages en BANDEAU : l'image nette au centre, le haut et le bas remplis de la même image floutée ;
  • sous-titres mot à mot (gras, contour noir, le mot prononcé en couleur), placés hors des visages ;
  • insert emoji plein écran sur la chute (comme vos vidéos) ;
  • voix + musique, H.264, 25 i/s ; puis un CONTRÔLE : nombre d'images, durée image = durée son, images figées,
    sauts de luminosité hors coupes.

  python3 scripts/blenderfilm/finish.py --plan film1/plan.json --frames film1/frames --out film1/film.mp4
"""
import argparse, glob, json, math, os, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf', '/Library/Fonts/Arial Bold.ttf']
EMOJI = ['/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', 'C:/Windows/Fonts/seguiemj.ttf', '/System/Library/Fonts/Apple Color Emoji.ttc']


def font(size):
    for f in FONTS:
        if os.path.isfile(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def emoji_card(ch, W, H, t):
    """Black card with a big colour emoji, a small bounce in."""
    card = Image.new('RGB', (W, H), (0, 0, 0))
    for f in EMOJI:
        if not os.path.isfile(f):
            continue
        try:
            fnt = ImageFont.truetype(f, 109)
            im = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
            ImageDraw.Draw(im).text((10, 10), ch, font=fnt, embedded_color=True)
            bb = im.getbbox()
            if not bb:
                continue
            im = im.crop(bb)
            k = 0.62 + 0.1 * min(1, t / 0.18) - 0.04 * max(0, min(1, (t - 0.18) / 0.2))
            side = int(W * k)
            im = im.resize((side, int(side * im.height / im.width)), Image.LANCZOS)
            card.paste(im, ((W - im.width) // 2, (H - im.height) // 2), im)
            return card
        except Exception:
            continue
    d = ImageDraw.Draw(card)
    d.text((W // 2, H // 2), ':-D', font=font(120), fill=(255, 220, 60), anchor='mm')
    return card


def band(img):
    """Two-shot of the owner's style: the sharp square in the middle, the same picture blurred above and below."""
    W, H = img.size
    y0 = (H - W) // 2
    sq = img.crop((0, y0, W, y0 + W))
    bg = sq.resize((H, H), Image.BILINEAR).crop(((H - W) // 2, 0, (H - W) // 2 + W, H)).filter(ImageFilter.GaussianBlur(18))
    bg = Image.eval(bg, lambda v: int(v * 0.82))
    bg.paste(sq, (0, y0))
    return bg


def film_look(img, rng, strength=1.0):
    """The GRADE of an animated feature: gentle S-curve, warm highlights / cool shadows, a soft BLOOM on the lights,
    a vignette that holds the eye in the centre, a whisper of grain (no flat digital look). Text is drawn after."""
    a = np.asarray(img).astype(np.float32) / 255.0
    H, W = a.shape[:2]
    lum = a.mean(2, keepdims=True)
    a = a + 0.06 * strength * np.sin((a - 0.5) * np.pi) * (1 - np.abs(a - 0.5) * 1.2)
    a = a + (lum - 0.5) * np.array([0.03, 0.004, -0.035], np.float32) * strength
    hi = np.clip((lum - 0.7) / 0.3, 0, 1) * a
    small = Image.fromarray((np.clip(hi, 0, 1) * 255).astype(np.uint8)).resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(5))
    bloom = np.asarray(small.resize((W, H), Image.BILINEAR)).astype(np.float32) / 255.0
    a = 1 - (1 - a) * (1 - bloom * 0.35 * strength)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
    a = a * (1 - 0.22 * strength * np.clip(r - 0.55, 0, 1) ** 1.6)[..., None]
    a = a + rng.normal(0, 0.007 * strength, (H, W, 1)).astype(np.float32)
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))




def loudness_normalise(src, dst, target=-14.0, tp=-1.0):
    """Two-pass EBU R128 to the platforms' target (TikTok / Reels / Shorts play around -14 LUFS)."""
    try:
        r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', src, '-af', f'loudnorm=I={target}:TP={tp}:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True)
        js = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
        af = (f"loudnorm=I={target}:TP={tp}:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:"
              f"measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', af, '-ar', '48000', dst], check=True)
        return float(js['input_i'])
    except Exception as e:
        print('[finish] loudnorm ignoré :', e)
        return None


def lufs(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    import re
    m = re.findall(r'I:\s+(-?[\d.]+) LUFS', r.stderr)
    p = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', r.stderr)
    return (float(m[-1]) if m else None), (float(p[-1]) if p else None)


def srt_time(t):
    ms = int(round(t * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


def write_extras(plan, frames_have, out_mp4, rng):
    """For the creator: the TikTok COVER (expressive close-up + hook), the .srt captions, the post text."""
    base = os.path.splitext(out_mp4)[0]
    # Cover: the middle of the punchline shot (the biggest face), else the hook.
    shots = plan['shots']
    # The biggest face: the close-up of the punchline, else the close-up nearest the end, else any shot.
    cus = [s for s in shots if s['type'] == 'cu' and s['start'] > 0]
    pick = next((s for s in cus if s.get('move') == 'punch'), cus[-1] if cus else shots[0])
    f = (pick['start'] + pick['end']) // 2 + 1
    f = min(max(1, f), len(frames_have))
    img = Image.open(frames_have[f]).convert('RGB')
    if pick['type'] == 'two':
        img = band(img)
    img = film_look(img, rng)
    W, H = 1080, 1920
    img = img.resize((W, int(img.height * W / img.width)), Image.LANCZOS).crop((0, 0, W, H))
    d = ImageDraw.Draw(img)
    hook = (plan.get('hook') or plan.get('title') or '').upper()
    fnt = font(int(W * 0.095))
    lines = balanced_lines(d, hook, fnt, W * 0.86)
    y = int(H * 0.1)
    for i, line in enumerate(lines):
        d.text((W // 2, y + i * int(W * 0.115)), line, font=fnt, fill=(255, 225, 60) if i == len(lines) - 1 else (255, 255, 255), stroke_width=9, stroke_fill=(0, 0, 0), anchor='ma')
    img.save(base + '.cover.jpg', quality=92)
    # Captions file (same chunks as on screen).
    n = 1
    with open(base + '.srt', 'w', encoding='utf-8') as fh:
        for c in plan['captions']:
            for ch in chunks(c['words']):
                fh.write(f"{n}\n{srt_time(ch[0][1])} --> {srt_time(ch[-1][2] + 0.18)}\n{' '.join(w[0] for w in ch)}\n\n")
                n += 1
    # Post text: title, hook, hashtags of the universe and of the characters.
    names = ['#' + ''.join(x.capitalize() for x in a['name'].replace('’', ' ').replace('-', ' ').split()) for a in plan.get('actors', [])]
    tags = ['#humour', '#comedie', '#sketch', '#abidjan', '#cotedivoire', '#africatoon', '#animation', '#pourtoi', '#fyp'] + names
    with open(base + '.post.txt', 'w', encoding='utf-8') as fh:
        fh.write(f"{plan.get('title', '')} 😂\n{plan.get('hook', '')}\nTag la personne qui fait exactement ça 👇\n\n{' '.join(tags)}\n")


def chunks(words, max_words=3, max_chars=18):
    out, cur = [], []
    for w in words:
        if cur and (len(cur) >= max_words or len(' '.join(x[0] for x in cur + [w])) > max_chars):
            out.append(cur)
            cur = []
        cur.append(w)
        if w[0].endswith(('.', '!', '?', '…')):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def draw_caption(img, chunk, t, y, fs):
    d = ImageDraw.Draw(img)
    fnt = font(fs)
    W = img.width
    words = [w[0] for w in chunk]
    widths = [d.textlength(w + ' ', font=fnt) for w in words]
    total = sum(widths) - d.textlength(' ', font=fnt)
    if total > W * 0.92:
        fs2 = int(fs * W * 0.92 / total)
        return draw_caption(img, chunk, t, y, max(24, fs2))
    x = (W - total) / 2
    for (w, s, e), wd in zip(chunk, widths):
        on = s <= t < e + 0.05
        d.text((x, y), w, font=fnt, fill=(255, 225, 60) if on else (255, 255, 255), stroke_width=max(3, fs // 10), stroke_fill=(0, 0, 0), anchor='ls')
        x += wd


def balanced_lines(d, text, fnt, maxw):
    """One line if it fits, else the 2-line split with the smallest longest line (no orphan word)."""
    words = text.split()
    if d.textlength(text, font=fnt) <= maxw or len(words) < 2:
        return [text]
    best = None
    for k in range(1, len(words)):
        a, b = ' '.join(words[:k]), ' '.join(words[k:])
        w = max(d.textlength(a, font=fnt), d.textlength(b, font=fnt))
        if best is None or w < best[0]:
            best = (w, [a, b])
    return best[1]


def draw_hook(img, text, t, dur=2.8):
    """THE HOOK on screen (first seconds): bold black text on a white rounded card, popping in, top of the frame
    (under the TikTok top bar), then fading out."""
    if not text or t >= dur:
        return
    W, H = img.size
    k = min(1.0, t / 0.16)
    pop = 0.86 + 0.14 * k + 0.05 * math.sin(min(1.0, t / 0.3) * math.pi)
    fade = 1.0 if t < dur - 0.3 else max(0.0, (dur - t) / 0.3)
    fs = int(W * 0.075 * pop)
    fnt = font(fs)
    d = ImageDraw.Draw(img)
    lines = balanced_lines(d, text, fnt, W * 0.82)
    lh = int(fs * 1.18)
    bw = int(max(d.textlength(x, font=fnt) for x in lines) + fs * 0.9)
    bh = lh * len(lines) + int(fs * 0.5)
    x0, y0 = (W - bw) // 2, int(H * 0.115)
    card = Image.new('RGBA', (bw, bh), (0, 0, 0, 0))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle((0, 0, bw - 1, bh - 1), radius=int(fs * 0.35), fill=(255, 255, 255, int(240 * fade)))
    for i, line in enumerate(lines):
        cd.text((bw // 2, int(fs * 0.25) + i * lh + lh // 2), line, font=fnt, fill=(10, 10, 10, int(255 * fade)), anchor='mm')
    img.paste(card, (x0, y0), card)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', required=True)
    ap.add_argument('--frames', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--no-captions', action='store_true')
    ap.add_argument('--no-grade', action='store_true', help='sans étalonnage (halo, vignette, grain)')
    ap.add_argument('--no-loudnorm', action='store_true')
    a = ap.parse_args()
    plan = json.load(open(a.plan, encoding='utf-8'))
    fps, nF = plan['fps'], plan['frames']
    files = sorted(glob.glob(os.path.join(a.frames, 'f*.png')))
    have = {int(os.path.basename(f)[1:6]): f for f in files}
    missing = [f for f in range(1, nF + 1) if f not in have]
    if missing:
        raise SystemExit(f'images manquantes : {len(missing)} (première : {missing[0]})')
    W, H = Image.open(have[1]).size
    shot_of = np.zeros(nF + 2, int)
    for k, s in enumerate(plan['shots']):
        shot_of[s['start'] + 1: s['end'] + 1] = k
    caps = []
    for c in plan['captions']:
        for ch in chunks(c['words']):
            caps.append((ch[0][1], ch[-1][2] + 0.18, ch))
    emo = plan.get('emoji', [])
    rng = np.random.default_rng(3)
    audio = plan['audio']
    norm = os.path.splitext(a.out)[0] + '.mix-14lufs.wav'
    in_lufs = None if a.no_loudnorm else loudness_normalise(audio, norm)
    if in_lufs is not None and os.path.isfile(norm):
        audio = norm
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-', '-i', audio,
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-af', 'apad', '-c:a', 'aac', '-b:a', '160k',
           # Exactly nF frames: the length is the picture's (the sound is padded), never cut one frame short by -shortest.
           '-frames:v', str(nF), '-t', f'{nF / fps:.3f}', '-movflags', '+faststart', a.out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    lum, prev = [], None
    frozen_run, frozen_max = 0, 0
    fs = int(W * 0.08)
    for f in range(1, nF + 1):
        t = (f - 1) / fps
        img = Image.open(have[f]).convert('RGB')
        s = plan['shots'][shot_of[f]]
        two = s['type'] == 'two'
        if two:
            img = band(img)
        if not a.no_grade:
            img = film_look(img, rng)
        e = next((x for x in emo if x['start'] <= t < x['end']), None)
        if e:
            img = emoji_card(e['char'], W, H, t - e['start'])
        else:
            draw_hook(img, plan.get('hook', ''), t)
        if e:
            pass
        elif not a.no_captions:
            c = next((x for x in caps if x[0] - 0.05 <= t < x[1]), None)
            if c:
                y = int(H * (0.865 if two else 0.80))
                draw_caption(img, c[2], t, y, fs)
        arr = np.asarray(img)
        ff.stdin.write(arr.tobytes())
        g = arr[::8, ::8].mean(2)
        lum.append(float(g.mean()))
        if prev is not None and np.abs(g - prev).mean() < 0.05:
            frozen_run += 1
            frozen_max = max(frozen_max, frozen_run)
        else:
            frozen_run = 0
        prev = g
    ff.stdin.close()
    ff.wait()
    # Contrôle.
    probe = lambda stream, field: subprocess.run(['ffprobe', '-v', 'error', '-select_streams', stream, '-show_entries', field, '-of', 'csv=p=0', a.out], capture_output=True, text=True).stdout.strip()
    vframes = probe('v:0', 'stream=nb_frames')
    vdur = float(probe('v:0', 'stream=duration') or 0)
    adur = float(probe('a:0', 'stream=duration') or 0)
    cuts = {s['start'] + 1 for s in plan['shots']} | {int(x['start'] * fps) + 1 for x in emo} | {int(x['end'] * fps) + 1 for x in emo}
    jumps = [i + 1 for i in range(1, len(lum)) if abs(lum[i] - lum[i - 1]) > 18 and (i + 1) not in cuts and i not in cuts]
    rep = {'frames_expected': nF, 'frames_encoded': int(vframes or 0), 'video_s': round(vdur, 3), 'audio_s': round(adur, 3), 'av_gap_ms': round(abs(vdur - adur) * 1000),
           'longest_frozen_s': round(frozen_max / fps, 2), 'brightness_jumps_outside_cuts': len(jumps), 'shots': len(plan['shots']), 'size': [W, H], 'fps': fps}
    out_lufs, out_peak = lufs(a.out)
    rep.update({'loudness_lufs': out_lufs, 'true_peak_dbfs': out_peak, 'graded': not a.no_grade, 'first_word_s': round(plan['timeline'][0]['speak0'], 2) if plan.get('timeline') else None})
    write_extras(plan, have, a.out, rng)
    json.dump(rep, open(os.path.splitext(a.out)[0] + '.qa.json', 'w'), indent=1)
    print('[finish]', json.dumps(rep, ensure_ascii=False))


if __name__ == '__main__':
    main()
