#!/usr/bin/env python3
"""PLAN DU FILM — une histoire (JSON : distribution, décor, répliques) devient une chronologie complète, image par image :
voix (vos fichiers audio, ou des voix françaises locales Piper, 0 $), minutage de chaque réplique, ouverture de la bouche
mesurée sur la voix, mouvements de tête, hochements, clignements, poses jouées, entrées en scène, découpage en plans
(rythme de vos TikTok : un plan toutes les 4 à 7 s), sous-titres mot à mot, fond musical discret.

  python3 scripts/blenderfilm/plan.py --story histoire.json --rig ~/massamba-blender/troupe/rig.json \
      --voices ~/piper --out ~/massamba-blender/film1 [--seconds 60]

Sortie : plan.json + mix.wav (voix + musique, 48 kHz) dans --out. Aucune donnée inventée : les chiffres du plan sont mesurés
sur les fichiers produits (durées, énergie de la voix).
"""
import argparse, json, math, os, random, re, subprocess, sys, wave
import numpy as np

SR = 48000
VOICES = {  # voix françaises locales (Piper) : fichier, locuteur
    'siwis': ('fr_FR-siwis-medium.onnx', None),
    'tom': ('fr_FR-tom-medium.onnx', None),
    'gilles': ('fr_FR-gilles-low.onnx', None),
    'jessica': ('fr_FR-upmc-medium.onnx', 0),
    'pierre': ('fr_FR-upmc-medium.onnx', 1),
}


def read_wav(path):
    with wave.open(path) as w:
        sr, n, ch, sw = w.getframerate(), w.getnframes(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(n)
    a = np.frombuffer(raw, dtype={2: np.int16, 4: np.int32}[sw]).astype(np.float32)
    a /= 32768.0 if sw == 2 else 2147483648.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(1)
    if sr != SR:
        t = np.arange(int(len(a) * SR / sr)) * sr / SR
        a = np.interp(t, np.arange(len(a)), a).astype(np.float32)
    return a


def write_wav(path, a):
    a = np.clip(a, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((a * 32767).astype(np.int16).tobytes())


# French needs its nasal vowels (an, on, in, un: the combining tilde U+0303). A voice model without that phoneme says
# « francs » as « fra » (measured: « Mille francs » re-transcribed « le meilleur sardin »). Such a voice is replaced
# by the closest voice of the same kind that has it, at the original voice's measured pitch (timbre of the stand-in).
NASAL = '\u0303'
STAND_IN = {'gilles': 'pierre'}
_CAN = {}


def speaks_french(voice, voices_dir):
    if voice not in _CAN:
        model, _ = VOICES.get(voice, VOICES['siwis'])
        try:
            _CAN[voice] = NASAL in json.load(open(os.path.join(voices_dir, model + '.json'), encoding='utf-8'))['phoneme_id_map']
        except (OSError, ValueError, KeyError):
            _CAN[voice] = True  # unknown: trusted as before
    return _CAN[voice]


# Piper is deterministic (the same text gives the same samples): the takes of a line are made DIFFERENT on purpose —
# the shaped voice, another prosody draw of the model, and a half-shaped voice (closer to the model's own, often clearer).
TAKES = [{'noise': None, 'noise_w': None, 'shape': 1.0}, {'noise': 0.45, 'noise_w': 0.6, 'shape': 1.0}, {'noise': None, 'noise_w': None, 'shape': 0.5}]


def tts(text, voice, out, voices_dir, speed=1.0, pitch=1.0, expr=1.0, formant=1.0, stand_in=True, take=0):
    from piper import PiperVoice
    from piper.config import SynthesisConfig
    if stand_in and not speaks_french(voice, voices_dir) and STAND_IN.get(voice) and speaks_french(STAND_IN[voice], voices_dir):
        import tone
        pp = tone.load().get('piper') or {}
        ratio = (pp.get(voice, {}).get('f0') or 107.7) / (pp.get(STAND_IN[voice], {}).get('f0') or 141.9)
        if voice not in _CAN.get('_dit', set()):
            _CAN.setdefault('_dit', set()).add(voice)
            print(f"[voix] « {voice} » ne prononce pas les voyelles nasales → « {STAND_IN[voice]} » à sa hauteur (×{ratio:.2f})", flush=True)
        voice, pitch = STAND_IN[voice], pitch * ratio
    model, spk = VOICES.get(voice, VOICES['siwis'])
    v = PiperVoice.load(os.path.join(voices_dir, model))
    tmp = out + '.raw.wav'
    with wave.open(tmp, 'wb') as w:
        tk = TAKES[take % len(TAKES)]
        v.synthesize_wav(text, w, SynthesisConfig(speaker_id=spk, length_scale=1.0 / speed, noise_scale=tk['noise'], noise_w_scale=tk['noise_w']))
        if tk['shape'] != 1.0:
            # half-way shaping, in log terms (pitch and melody factors)
            pitch, expr, formant = pitch ** tk['shape'], 1 + (expr - 1) * tk['shape'], formant ** tk['shape']
    a = read_wav(tmp)
    os.remove(tmp)
    shaped = None
    if abs(pitch - 1) > 0.01 or abs(expr - 1) > 0.01 or abs(formant - 1) > 0.01:
        # The channel's voice (tone.py): melody widened, pitch moved with the timbre kept (WORLD vocoder).
        import tone
        shaped = tone.shape(a, SR, pitch, expr, formant)
    if shaped is not None:
        a = shaped
    elif abs(pitch - 1) > 0.01:
        # A child / cartoon voice: higher pitch, same duration (resample up, then time-stretch back with ffmpeg atempo).
        t = np.arange(int(len(a) / pitch)) * pitch
        a = np.interp(t, np.arange(len(a)), a).astype(np.float32)
        write_wav(out + '.p.wav', a)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', out + '.p.wav', '-filter:a', f'atempo={1 / pitch:.4f}', '-ar', str(SR), '-ac', '1', out], check=True)
        os.remove(out + '.p.wav')
        a = read_wav(out)
    # Trim the silences around the line (the plan places them).
    env = np.abs(a)
    idx = np.nonzero(env > 0.02)[0]
    if len(idx):
        a = a[max(0, idx[0] - int(0.02 * SR)): idx[-1] + int(0.05 * SR)]
    write_wav(out, a)
    return a


def envelope(a, fps):
    """Loudness per film frame (RMS of the samples of that frame), 0..1 after a soft-knee mapping."""
    hop = SR // fps
    n = int(math.ceil(len(a) / hop))
    # Loudness of the frame (its loudest half: a syllable that starts mid-frame still opens the mouth).
    half = hop // 2
    rms = np.array([max(np.sqrt(np.mean(a[i * hop + k * half:i * hop + (k + 1) * half] ** 2) + 1e-12) for k in (0, 1)) for i in range(n)])
    db = 20 * np.log10(rms + 1e-9)
    # Normalised on the line's OWN range: the vowels open wide, the consonants and the gaps between words close it.
    voiced = db[db > db.max() - 30]
    lo = np.percentile(voiced, 25) if len(voiced) else -40
    hi = np.percentile(voiced, 96) if len(voiced) else -10
    o = np.clip((db - lo) / max(3.0, hi - lo), 0, 1) ** 1.4
    # Mouth: opens fast, closes over two frames (no flicker between syllables).
    out = np.zeros_like(o)
    for i, v in enumerate(o):
        prev = out[i - 1] if i else 0
        out[i] = v if v > prev else prev * 0.55 + v * 0.45
    return out


def word_times(text, env, fps):
    """Word timings from the voice itself: the voiced frames are shared among the words by their length."""
    words = text.split()
    voiced = np.nonzero(env > 0.12)[0]
    if not len(voiced) or not words:
        return [(w, 0, len(env) / fps) for w in words]
    t0, t1 = voiced[0] / fps, (voiced[-1] + 1) / fps
    weights = np.array([max(2, len(w.strip('.,!?…'))) for w in words], dtype=float)
    edges = np.concatenate([[0], np.cumsum(weights)]) / weights.sum()
    return [(w, t0 + (t1 - t0) * edges[i], t0 + (t1 - t0) * edges[i + 1]) for i, w in enumerate(words)]


def music_bed(seconds, bpm=96, seed=3):
    """A soft kalimba-and-shaker loop (pentatonic), under the voices."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    out = np.zeros(n, np.float32)
    beat = 60 / bpm
    scale = [0, 2, 4, 7, 9, 12, 14]
    chords = [57, 53, 48, 55]  # A, F, C, G (MIDI roots)
    t = 0.0
    step = 0
    while t < seconds:
        root = chords[(step // 8) % 4]
        if step % 2 == 0 or rng.random() < 0.35:
            note = root + scale[rng.integers(0, len(scale))] + 12
            f = 440 * 2 ** ((note - 69) / 12)
            L = int(0.9 * SR)
            tt = np.arange(L) / SR
            tone = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 2 * f * tt) + 0.12 * np.sin(2 * np.pi * 3.01 * f * tt)) * np.exp(-tt * 5.5)
            i0 = int(t * SR)
            seg = out[i0:i0 + L]
            seg += (tone[:len(seg)] * 0.16).astype(np.float32)
        # Shaker on the off-beats.
        if step % 2 == 1:
            L = int(0.06 * SR)
            noise = rng.standard_normal(L) * np.exp(-np.arange(L) / (0.012 * SR))
            noise = np.diff(np.concatenate([[0], noise]))  # bright
            i0 = int(t * SR)
            seg = out[i0:i0 + L]
            seg += (noise[:len(seg)] * 0.05).astype(np.float32)
        # Soft kick on the beats 1 and 3.
        if step % 4 == 0:
            L = int(0.25 * SR)
            tt = np.arange(L) / SR
            kick = np.sin(2 * np.pi * (55 + 60 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 9)
            i0 = int(t * SR)
            seg = out[i0:i0 + L]
            seg += (kick[:len(seg)] * 0.22).astype(np.float32)
        t += beat / 2
        step += 1
    return out


# Mostly medium and wide shots, like the channel's videos (the scene and both characters readable): a close-up
# magnifies a few dozen pixels of the painted set over the whole screen (a blurred, dead background) — it is kept for
# the reactions and one beat in six.
SHOT_CYCLE = ['two', 'mcu', 'two', 'mcu', 'cu', 'two']

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world as livingworld  # noqa: E402


def noise(n, rng, color='pink'):
    w = rng.standard_normal(n).astype(np.float32)
    if color == 'brown':
        w = np.cumsum(w)
        w -= np.convolve(w, np.ones(2001) / 2001, mode='same')
    elif color == 'pink':
        b = np.convolve(w, np.ones(8) / 8, mode='same')
        w = 0.6 * b + 0.4 * w
    return w / (np.max(np.abs(w)) or 1)


def ambience(kinds, seconds, rng):
    """SOUND DESIGN of the place (synthesised, no sample bank): crowd murmur, birds, traffic and horns, waves, kitchen
    sizzle, TV, chimes of announcements, kids far away, fan hum, crickets. Kept far under the voices."""
    n = int(seconds * SR)
    out = np.zeros(n, np.float32)
    t = np.arange(n) / SR
    slow = lambda f, ph=0: (0.6 + 0.4 * np.sin(2 * np.pi * f * t + ph)).astype(np.float32)
    for k in kinds:
        if k == 'foule':
            # Murmur: band-limited noise, slowly changing loudness, a few « voice » formants.
            m = noise(n, rng, 'pink')
            m = np.convolve(m, np.ones(24) / 24, mode='same')
            out += (m * slow(0.11) * 0.35).astype(np.float32)
        elif k == 'oiseaux':
            for _ in range(int(seconds * 0.9)):
                t0 = rng.uniform(0, seconds - 0.4)
                L = int(rng.uniform(0.05, 0.14) * SR)
                tt = np.arange(L) / SR
                f0 = rng.uniform(2600, 4200)
                chirp = np.sin(2 * np.pi * (f0 + rng.uniform(-900, 1200) * tt / tt[-1]) * tt) * np.sin(np.pi * np.arange(L) / L) ** 2
                i0 = int(t0 * SR)
                for rep in range(rng.integers(1, 4)):
                    j = i0 + rep * int(0.17 * SR)
                    out[j:j + L] += (chirp[:max(0, min(L, n - j))] * 0.11).astype(np.float32)
        elif k == 'circulation':
            m = noise(n, rng, 'brown')
            out += (m * slow(0.05, 1) * 0.3).astype(np.float32)
            for _ in range(int(seconds / 9)):
                t0 = rng.uniform(1, seconds - 1)
                L = int(rng.uniform(0.18, 0.4) * SR)
                tt = np.arange(L) / SR
                f = rng.choice([392.0, 440.0, 523.0])
                horn = np.sign(np.sin(2 * np.pi * f * tt)) * 0.5 + np.sign(np.sin(2 * np.pi * f * 1.26 * tt)) * 0.5
                horn = np.convolve(horn, np.ones(12) / 12, mode='same') * np.minimum(1, np.minimum(tt / 0.02, (tt[-1] - tt) / 0.03))
                i0 = int(t0 * SR)
                out[i0:i0 + L] += (horn[:max(0, min(L, n - i0))] * 0.06).astype(np.float32)
        elif k == 'vagues':
            m = noise(n, rng, 'pink')
            swell = (0.5 + 0.5 * np.sin(2 * np.pi * 0.09 * t)) ** 3
            out += (m * swell * 0.4).astype(np.float32)
        elif k == 'cuisine':
            crackle = (rng.random(n) > 0.9985).astype(np.float32) * rng.uniform(-1, 1, n).astype(np.float32)
            crackle = np.convolve(crackle, np.exp(-np.arange(60) / 8), mode='same')
            out += (crackle * 0.12 + noise(n, rng) * 0.03).astype(np.float32)
        elif k == 'tele':
            m = noise(n, rng, 'pink')
            m = np.convolve(m, np.ones(40) / 40, mode='same')
            out += (m * (0.5 + 0.5 * (np.sin(2 * np.pi * 3.1 * t) > 0)) * 0.12).astype(np.float32)
        elif k == 'annonces':
            for t0 in np.arange(rng.uniform(3, 8), seconds - 2, rng.uniform(14, 22)):
                for j, f in enumerate((784.0, 659.0, 523.0)):
                    L = int(0.45 * SR)
                    tt = np.arange(L) / SR
                    tone = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 4)
                    i0 = int((t0 + 0.32 * j) * SR)
                    out[i0:i0 + L] += (tone[:max(0, min(L, n - i0))] * 0.07).astype(np.float32)
        elif k == 'enfants':
            for _ in range(int(seconds / 4)):
                t0 = rng.uniform(0, seconds - 0.6)
                L = int(rng.uniform(0.2, 0.45) * SR)
                tt = np.arange(L) / SR
                f = rng.uniform(450, 750)
                v = np.sin(2 * np.pi * (f + 120 * np.sin(2 * np.pi * 5 * tt)) * tt) * np.sin(np.pi * np.arange(L) / L)
                i0 = int(t0 * SR)
                out[i0:i0 + L] += (np.convolve(v, np.ones(6) / 6, mode='same')[:max(0, min(L, n - i0))] * 0.025).astype(np.float32)
        elif k == 'ventilateur':
            hum = np.sin(2 * np.pi * 100 * t) * 0.3 + noise(n, rng, 'pink') * 0.7
            out += (hum * (0.75 + 0.25 * np.sin(2 * np.pi * 1.4 * t)) * 0.06).astype(np.float32)
        elif k == 'insectes':
            env = (np.sin(2 * np.pi * 28 * t) > 0.6).astype(np.float32) * (np.sin(2 * np.pi * 0.7 * t) > -0.2)
            out += (np.sin(2 * np.pi * 4300 * t) * env * 0.025).astype(np.float32)
    return out


def room(audio, kind, rng):
    """The voice IN the place: a small room (short, close reflections), a hall (longer tail), or outdoors (almost dry,
    a hint of slap-back). Synthetic impulse response, FFT convolution, mixed under the dry voice."""
    if kind == 'dry' or not len(audio):
        return audio
    rt, wet = {'piece': (0.32, 0.16), 'hall': (0.9, 0.2), 'exterieur': (0.12, 0.06)}.get(kind, (0.3, 0.12))
    L = int(rt * SR)
    t = np.arange(L) / SR
    ir = rng.standard_normal(L).astype(np.float32) * np.exp(-t * 6.9 / rt).astype(np.float32)
    ir[:int(0.004 * SR)] = 0  # pre-delay
    ir = np.convolve(ir, np.ones(6) / 6, mode='same')  # darker tail
    n = len(audio) + L - 1
    N = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(audio, N) * np.fft.rfft(ir, N), N)[:len(audio)]
    y = y / (np.max(np.abs(y)) or 1) * (np.max(np.abs(audio)) or 1)
    return (audio * (1 - wet) + y.astype(np.float32) * wet * 1.6).astype(np.float32)


def punch_sfx(kind='boom'):
    """The comic hits: a deep « boom » on the punchline, a « pop » when the emoji lands."""
    if kind == 'boom':
        L = int(1.1 * SR)
        tt = np.arange(L) / SR
        f = 38 + 70 * np.exp(-tt * 6)
        return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 3.2) * 0.9).astype(np.float32)
    L = int(0.12 * SR)
    tt = np.arange(L) / SR
    return (np.sin(2 * np.pi * (500 + 1400 * tt / tt[-1]) * tt) * np.exp(-tt * 30) * 0.5).astype(np.float32)


LAUGH = re.compile(r'\b(ha|hi|hé|ho)(\s*\1)+\b|😂|🤣', re.I)


def spoken_pose(beat):
    """The pose of the one who SPEAKS the line. The drawing of a burst of laughter (eyes shut, mouth wide open) is kept
    for a line that IS laughter (« Ha ha ha »), whatever the story asked; a line spoken with a smile is played on the
    neutral drawing (audit of film 5: Maman Nounou said « Pour toi, mon fils ? Mille francs. » with her
    fit-of-laughter drawing)."""
    p = beat.get('pose', 'neutre')
    laughing = bool(LAUGH.search(beat.get('text', '')))
    if laughing:
        return 'rire'
    return 'neutre' if p == 'rire' else p


def place_views(name, decors):
    """The views of the story's place, in order: `decor` names one view of a place (« Gare Routière — Adjamé · vue 2 »)
    or the place itself (« Gare Routière — Adjamé »); a set without a place is its only view."""
    d = decors.get(name)
    lieu = (d or {}).get('lieu') or next((v['lieu'] for v in decors.values() if name and name in (v.get('lieu_nom'), v.get('lieu'))), None)
    if lieu is None:
        return [name] if name in decors else []
    views = sorted((k for k, v in decors.items() if v.get('lieu') == lieu), key=lambda k: decors[k].get('vue', 0))
    if name in views:  # the named view opens the film
        views.remove(name)
        views.insert(0, name)
    return views


def cut_views(shots, views, fps, nF, punch_frame=None, every_s=15.0, min_s=4.0):
    """Where the film changes view of its place: about every `every_s` seconds, only where a shot starts anyway (a cut
    never interrupts a shot), each view held at least `min_s` seconds, and never between the punchline and the reaction
    to it (the gag stays in one picture). Returns [{'decor', 'start', 'end'}] (frames, end excluded)."""
    n = min(len(views), max(1, int(round(nF / (every_s * fps)))))
    if n < 2:
        return [{'decor': views[0], 'start': 0, 'end': nF}] if views else []
    cands = sorted({int(sh['start']) for sh in shots if 0 < sh['start'] < nF and (punch_frame is None or sh['start'] <= punch_frame)})
    cuts, last = [], 0
    for k in range(1, n):
        want = k * nF / n
        ok = [f for f in cands if f - last >= min_s * fps and nF - f >= min_s * fps]
        if not ok:
            break
        f = min(ok, key=lambda f: abs(f - want))
        cuts.append(f)
        last = f
    edges = [0] + cuts + [nF]
    return [{'decor': views[i % len(views)], 'start': edges[i], 'end': edges[i + 1]} for i in range(len(edges) - 1)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--story', required=True)
    ap.add_argument('--rig', required=True)
    ap.add_argument('--voices', default=os.path.expanduser('~/piper'), help='dossier des voix Piper (.onnx)')
    ap.add_argument('--out', required=True)
    ap.add_argument('--seconds', type=float, default=64.0)
    ap.add_argument('--seed', type=int, default=7)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    story = json.load(open(a.story, encoding='utf-8'))
    rig = json.load(open(a.rig, encoding='utf-8'))
    fps = int(story.get('fps', 25))
    rng = random.Random(a.seed)
    cast = {c['id']: c for c in story['cast']}
    for c in cast.values():
        if c['name'] not in rig['cast']:
            raise SystemExit(f"personnage absent du kit : {c['name']}")
    beats = story['beats']
    # The place's views (the owner's boards give several per place): the film opens in the first and cuts to the others.
    views = place_views(story.get('decor', ''), rig.get('decors', {}))
    if views:
        story['decor'] = views[0]
    # GESTURE ↔ STORY: a pointing gesture the drawing cannot play (the pointing law) is replaced by the closest pose by
    # intent, and the line adapted — HERE, before the voices are recorded (gesture.py; the same law as the render).
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import gesture
    try:
        hts = {n: c['height'] for n, c in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'characters.json'), encoding='utf-8')).items()}
    except Exception:
        hts = {}
    for o in gesture.adapt_story(story, rig, rig['dir'], hts):
        print(f"[récit] réplique {o['beat'] + 1} : « {o['pose']} » de {o['qui']} injouable (doigt à {o['ecart_cm']} cm du visage de {o['cible']}) → "
              f"« {o['jouee']} »" + (f" ; texte : « {o['apres']} »" if o['apres'] != o['avant'] else ' ; texte inchangé (il ne reposait pas sur le geste)'), flush=True)
    vdir = os.path.join(a.out, 'voices')
    os.makedirs(vdir, exist_ok=True)

    # TONE OF THE CHANNEL (tone.py, measured on its videos): each voice gets the channel's melody range (and, for a
    # child, its brightness), the lines are placed with the channel's silences.
    import tone as tonelib
    tone = tonelib.load()
    try:
        sheets = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'characters.json'), encoding='utf-8'))
    except (OSError, ValueError):
        sheets = {}
    shape = {}
    for cid, c in cast.items():
        sheet = dict(sheets.get(c['name'], {}), **{k: v for k, v in c.items() if k in ('pitch', 'genre', 'age')})
        tg = tonelib.targets(sheet, c.get('voice', 'siwis'), tone) if story.get('ton_chaine', True) else {}
        want = ((tone.get('voix') or {}).get(tg.get('type')) or {}) if tg else {}
        shape[cid] = {'pitch': c.get('pitch', 1.0) * tg.get('luminosite', 1.0), 'expr': tg.get('expr', 1.0), 'formant': tg.get('formant', 1.0),
                      'cible': want.get('etendue_relative')}
        if tg:
            print(f"[ton] {c['name']} ({tg['type']}, voix {c.get('voice', 'siwis')}) : mélodie ×{tg.get('expr', 1)}"
                  + (f", hauteur ×{tg['luminosite']}" if 'luminosite' in tg else '') + (f", formants ×{tg['formant']}" if tg.get('formant', 1) != 1 else ''), flush=True)

    # TAKES: a synthetic voice varies from one take to the next; each line is recorded several times and the take the
    # listener understands best (Whisper re-transcription), with the melody closest to the channel's, is kept.
    n_takes = max(1, int(story.get('prises', 3)))
    takes_log = []

    def render_one(i, b, speed):
        c = cast[b['who']]
        path = os.path.join(vdir, f'line-{i:02d}.wav')
        if b.get('audio'):
            audio = read_wav(b['audio'])
            write_wav(path, audio)
            return audio
        sh = shape[b['who']]
        takes = [tts(b['text'], c.get('voice', 'siwis'), path, a.voices, speed=speed * c.get('speed', 1.0), pitch=sh['pitch'], expr=sh['expr'], formant=sh['formant'], take=t)
                 for t in range(n_takes)]
        k, det = tonelib.choose_take(takes, b['text'], SR, sh['cible']) if n_takes > 1 else (0, [])
        write_wav(path, takes[k])
        if det:
            takes_log.append((i, k, det))
        return takes[k]

    def render_lines(speed):
        lines = []
        takes_log.clear()
        for i, b in enumerate(beats):
            lines.append(render_one(i, b, speed))
        if takes_log and takes_log[0][2][0]['erreur'] is not None:
            first = np.mean([d[0]['erreur'] for _, _, d in takes_log])
            kept = np.mean([d[k]['erreur'] for _, k, d in takes_log])
            print(f"[voix] {n_takes} prises par réplique : erreur de compréhension {first:.0%} (1re prise) → {kept:.0%} (prise retenue)", flush=True)
            for i, k, d in takes_log:
                if d[k]['erreur'] and d[k]['erreur'] > 0.25:
                    print(f"[voix] réplique {i + 1} encore mal comprise ({d[k]['erreur']:.0%}) : « {beats[i]['text']} » entendu « {d[k]['entendu']} »", flush=True)
        return lines

    # Voices, then a global tempo so that the film lasts the asked duration (pauses included).
    speed = float(story.get('speed', 1.0))
    lines = render_lines(speed)
    tm = tonelib.timing(tone)
    lead, tail = tm['lead'], tm['tail']
    speech = sum(len(x) / SR for x in lines)
    pauses = len(beats) * (lead + tail) + sum(float(b.get('hold', 0)) for b in beats)
    if speech + pauses > a.seconds + 0.5:
        # Too long: the voices speak a little faster (never beyond ×1.35), everything else unchanged.
        speed = max(0.8, min(1.35, speed * speech / max(1.0, a.seconds - pauses)))
        lines = render_lines(speed)
        speech = sum(len(x) / SR for x in lines)
    # COMIC TIMING as measured on the channel: tight turns inside an exchange, a short beat before the punchline,
    # breaths between exchanges; the time left to reach the duration goes to those breaths and to the reaction after the
    # punchline before anything is spread evenly (tone.schedule).
    pb_i = story['punch']['beat'] if story.get('punch') else -1
    compilation = story.get('format') == 'compilation'
    timeline, rep = tonelib.schedule([len(x) / SR for x in lines], pb_i, a.seconds, tone, holds=[float(b.get('hold', 0)) for b in beats], breaths=compilation)
    # A story too short for the channel's tight rhythm gets the channel's REACTIONS (the listener echoes, stunned, the
    # key words just said) instead of silences spread between the lines.
    if not compilation and story.get('reactions', True) and rep['reserve_s'] > 1.5:
        ins = tonelib.reactions(beats, pb_i, rep['reserve_s'], tone, list(cast))
        for i, nb in reversed(ins):
            beats.insert(i + 1, nb)
            lines.insert(i + 1, None)
            if pb_i > i:
                pb_i += 1
        if ins:
            if story.get('punch'):
                story['punch']['beat'] = pb_i
            for j, b in enumerate(beats):
                if lines[j] is None:
                    lines[j] = render_one(j, b, speed)
            # files are named by position: rewrite them in the new order
            for j, x in enumerate(lines):
                write_wav(os.path.join(vdir, f'line-{j:02d}.wav'), x)
            for i, nb in ins:
                print(f"[ton] réaction ajoutée : {cast[nb['who']]['name']} « {nb['text']} » (après « {beats[[k for k, b in enumerate(beats) if b is nb][0] - 1]['text'][:40]} »)", flush=True)
            speech = sum(len(x) / SR for x in lines)
            timeline, rep = tonelib.schedule([len(x) / SR for x in lines], pb_i, a.seconds, tone, holds=[float(b.get('hold', 0)) for b in beats], breaths=compilation)
    # After the punchline, the one who SCORED it laughs — with its own voice, the way the channel's characters laugh
    # (calls rate, breathed calls, pitch, brightness measured on the voice separated from the music). The one who was
    # just had does not laugh (« Maman, c'est du vol ! » right after); a story can name the laugher (« rire_de »).
    laugh_at = None
    rp = tone.get('rire')
    if not compilation and rp and story.get('rire', True) and pb_i >= 0 and rep['reserve_s'] > 2.5:
        listener = story.get('rire_de') if story.get('rire_de') in cast else beats[pb_i]['who']
        if listener:
            c = cast[listener]
            sh = shape[listener]
            syl = tts('Ha !', c.get('voice', 'siwis'), os.path.join(vdir, 'ha.wav'), a.voices, pitch=sh['pitch'])
            own = [x for b, x in zip(beats, lines) if b['who'] == listener]
            f0v = tonelib.melody(np.concatenate(own), SR)[0] if own else None
            y = tonelib.laugh(syl, SR, dict(rp, duree_s=min(float(rp['duree_s']), rep['reserve_s'] - 1.0)), f0v or tonelib.melody(syl, SR)[0] or 200.0)
            if y is not None:
                lp = os.path.join(vdir, 'rire.wav')
                write_wav(lp, y)
                beats.insert(pb_i + 1, {'who': listener, 'text': 'Ha ha ha !', 'audio': lp, 'pose': 'rire', 'insere': 'rire mesuré sur la chaîne'})
                lines.insert(pb_i + 1, y)
                for j, x in enumerate(lines):
                    write_wav(os.path.join(vdir, f'line-{j:02d}.wav'), x)
                laugh_at = pb_i + 1
                timeline, rep = tonelib.schedule([len(x) / SR for x in lines], pb_i, a.seconds, tone, holds=[float(b.get('hold', 0)) for b in beats],
                                                 breaths=compilation, react_at=laugh_at)
                print(f"[ton] rire de {c['name']} après sa chute ({len(y) / SR:.1f} s, sa propre voix)", flush=True)
    print(f"[ton] rythme {'mesuré sur la chaîne' if rep['mesure'] else 'par défaut'} : tour de parole {rep['tour_s']} s, avant la chute {rep['avant_chute_s']} s, "
          f"{rep['respirations']} respiration(s) entre échanges, réserve {rep['reserve_s']} s" + (f" dont {rep['etale_s']} s étalés (histoire courte pour le rythme de la chaîne)" if rep['etale_s'] > 0.05 else ''), flush=True)
    t = timeline[-1]['end']
    total = t
    nF = int(round(total * fps))
    # The living world around the actors (extras, animals, props of the lines, ambience), decided for the whole film.
    life = None
    if story.get('life', True) is not False:
        try:
            life = livingworld.plan_life(story, timeline, [c['name'] for c in cast.values()], rig, fps, nF)
        except FileNotFoundError as e:
            print(f'[plan] monde vivant ignoré ({e})')
    # Mix: the voices at their place, the music under them (ducked while someone speaks).
    mix = np.zeros(int(total * SR) + SR, np.float32)
    talk = np.zeros_like(mix)
    acoustic = 'dry'
    if life:
        acoustic = 'exterieur' if life.get('exterieur') else ('hall' if life.get('template') == 'hall' or life.get('place') in ('tribunal', 'aeroport', 'centre-commercial') else 'piece')
    rrng = np.random.default_rng(5)
    for i, seg in enumerate(timeline):
        i0 = int(seg['speak0'] * SR)
        v = room(lines[i], acoustic, rrng)
        mix[i0:i0 + len(v)] += v[:max(0, len(mix) - i0)] * 0.9
        talk[i0:i0 + len(lines[i])] = 1
    if story.get('music', True):
        bed = music_bed(total + 1)
        k = int(0.25 * SR)
        duck = np.convolve(talk, np.ones(k) / k, mode='same')
        mix[:len(bed)] += bed[:len(mix)] * (1 - 0.65 * np.clip(duck, 0, 1))[:len(bed)]
    # Sound design: the place's ambience far under the voices (ducked), the comic hits on the punchline.
    if life and life.get('sons'):
        amb = ambience([x for x in life['sons'] if x != 'musique'], total + 1, np.random.default_rng(11))
        k = int(0.3 * SR)
        duck = np.convolve(talk, np.ones(k) / k, mode='same')
        lvl = 0.16 if story.get('music', True) else 0.24
        mix[:len(amb)] += (amb[:len(mix)] * lvl * (1 - 0.55 * np.clip(duck, 0, 1))[:len(amb)]).astype(np.float32)
    if story.get('punch'):
        seg = timeline[story['punch']['beat']]
        for kind, at, g in (('boom', seg['speak1'] + 0.08, 0.55), ('pop', seg['speak1'] + 0.7, 0.4)):
            fx = punch_sfx(kind)
            i0 = int(at * SR)
            mix[i0:i0 + len(fx)] += fx[:max(0, len(mix) - i0)] * g
    peak = np.max(np.abs(mix)) or 1
    mix = mix / peak * 0.89
    mix = mix[:int(nF / fps * SR)]
    write_wav(os.path.join(a.out, 'mix.wav'), mix)

    # Per-actor tracks, one value per film frame.
    ids = list(cast)
    jaw = {c: np.zeros(nF) for c in ids}
    for i, seg in enumerate(timeline):
        env = envelope(lines[i], fps)
        f0 = int(round(seg['speak0'] * fps))
        w = beats[i]['who']
        jaw[w][f0:f0 + len(env)] = np.maximum(jaw[w][f0:f0 + len(env)], env[:max(0, nF - f0)])
        seg['words'] = [(wd, seg['speak0'] + s, seg['speak0'] + e) for wd, s, e in word_times(beats[i]['text'], env, fps)]
    # Head: speaking = livelier, listening = calm; nods on the stressed syllables (rises of the voice).
    turn = {c: np.zeros(nF) for c in ids}
    nod = {c: np.zeros(nF) for c in ids}
    for c in ids:
        ph = rng.random() * 10
        speaking = jaw[c] > 0.05
        act = np.convolve(speaking.astype(float), np.ones(fps) / fps, mode='same')
        tt = np.arange(nF) / fps
        turn[c] = (0.35 + 0.65 * act) * (np.sin(tt * 1.7 + ph) * 0.6 + np.sin(tt * 0.63 + ph * 2) * 0.4)
        rise = np.clip(np.diff(np.concatenate([[0], jaw[c]])), 0, None)
        peaks = np.nonzero((rise > 0.35) & (np.convolve(rise > 0.35, np.ones(6), mode='same') <= 1.5))[0]
        for p in peaks:
            L = int(0.3 * fps)
            nod[c][p:p + L] = np.maximum(nod[c][p:p + L], np.sin(np.linspace(0, np.pi, L))[:max(0, nF - p)] * 0.8)
    # Blinks every 2.5–5.5 s (4 frames).
    blinks = {c: [] for c in ids}
    for c in ids:
        f = int(rng.uniform(0.8, 2.5) * fps)
        while f < nF - 4:
            blinks[c].append(f)
            f += int(rng.uniform(2.5, 5.5) * fps)
    # Poses: the speaker's pose for the line; the reactions asked by the story; the rest keep their pose.
    pose_of = {c: 'neutre' for c in ids}
    poses = {c: [] for c in ids}
    for i, seg in enumerate(timeline):
        b = beats[i]
        f0 = int(round(seg['start'] * fps))
        want = {b['who']: spoken_pose(b)}
        for c, p in (b.get('react') or {}).items():
            want[c] = p
        for c, p in want.items():
            if pose_of[c] != p:
                # The reaction lands on the first word of the line, the speaker's pose at the cut.
                at = f0 if c == b['who'] else int(round((seg['speak0'] + 0.4) * fps))
                poses[c].append([at, p])
                pose_of[c] = p
        # Back to neutral after a strong reaction (except a laugh that lasts to the end of the line).
        for c in list(want):
            if c != b['who'] and want[c] in ('choc', 'accuse') and i + 1 < len(timeline):
                poses[c].append([int(round(timeline[i + 1]['start'] * fps)), 'neutre'])
                pose_of[c] = 'neutre'
    for c in ids:
        # One pose per frame (the last asked wins), and no repeat of the pose already played.
        byf = {}
        for f, k in poses[c]:
            byf[f] = k
        seq, last = [], None
        for f in sorted(byf):
            if byf[f] != last:
                seq.append([f, byf[f]])
                last = byf[f]
        poses[c] = seq
        if not poses[c] or poses[c][0][0] > 0:
            poses[c].insert(0, [0, 'neutre'])
    # Entrances (an actor arrives on its beat) and presence.
    enter = {c: (int(round(timeline[cast[c]['enter']]['start'] * fps)) if cast[c].get('enter') is not None else 0) for c in ids}
    # Shots: the story's, else a cycle like the owner's TikToks (a two-shot when someone enters, close-ups on the speaker).
    shots = []
    k = 0
    for i, seg in enumerate(timeline):
        b = beats[i]
        typ = b.get('shot')
        move = b.get('move')
        if i == 0 and story.get('hook_cu', True):
            # THE HOOK: the film opens on the one who starts the conflict, with a snap zoom — a medium shot (the face
            # whole and readable, the place visible behind; never a face cut by the frame or hidden by the title).
            typ, move = 'mcu', move or 'punch'
        elif not typ:
            if any(enter[c] == int(round(seg['start'] * fps)) and enter[c] > 0 for c in ids):
                typ = 'two'
            elif i == 1:
                typ = 'mcu'
            elif i == 2:
                typ = 'two'
            else:
                typ = SHOT_CYCLE[k % len(SHOT_CYCLE)]
                k += 1
        if story.get('punch') and i == story['punch']['beat']:
            move = move or 'punch'
        shots.append({'start': int(round(seg['start'] * fps)), 'end': int(round(seg['end'] * fps)), 'type': typ, 'target': b.get('target', b['who']), 'move': move or ['push', 'drift', 'push', 'pull'][i % 4]})
    # The REACTION SHOT: right after the punchline, a close-up on the one who takes it (the reaction makes people
    # laugh as much as the line), until the emoji.
    if pb_i >= 0:
        seg = timeline[pb_i]
        pb = beats[pb_i]
        victim = next(iter((pb.get('react') or {}).keys()), None)
        if victim is None:
            prev = [beats[j]['who'] for j in range(pb_i - 1, -1, -1) if beats[j]['who'] != pb['who']]
            victim = prev[0] if prev else None
        if victim and victim in cast:
            f_cut = int(round((seg['speak1'] + 0.08) * fps))
            k_sh = next(k for k, sh in enumerate(shots) if sh['start'] <= f_cut < sh['end'] or k == len(shots) - 1)
            sh = shots[k_sh]
            if sh['end'] - f_cut > int(0.3 * fps):
                shots.insert(k_sh + 1, {'start': f_cut, 'end': sh['end'], 'type': 'cu', 'target': victim, 'move': 'punch'})
                sh['end'] = f_cut
    shots[-1]['end'] = nF
    captions = [{'who': beats[i]['who'], 'words': [[w, round(s, 3), round(e, 3)] for w, s, e in seg['words']]} for i, seg in enumerate(timeline)]
    emoji = []
    if story.get('punch'):
        pb = story['punch']
        seg = timeline[pb['beat']]
        emoji.append({'start': round(seg['speak1'] + 0.7, 3), 'end': round(min(seg['end'], seg['speak1'] + 1.55), 3), 'char': pb.get('emoji', '😂')})
    pf = int(round(timeline[story['punch']['beat']]['start'] * fps)) if story.get('punch') else None
    coupes = cut_views(shots, views, fps, nF, pf, every_s=float(story.get('vue_toutes_s', 15.0))) if story.get('vues', True) is not False else []
    if len(coupes) > 1:
        print('[plan] vues du lieu : ' + ' → '.join(f"{c['decor']} ({(c['end'] - c['start']) / fps:.1f} s)" for c in coupes), flush=True)
    plan = {
        'title': story.get('title', ''), 'fps': fps, 'width': story.get('size', [576, 1024])[0], 'height': story.get('size', [576, 1024])[1], 'frames': nF, 'seconds': round(nF / fps, 3),
        'rig': os.path.abspath(a.rig), 'decor': story['decor'], 'audio': os.path.abspath(os.path.join(a.out, 'mix.wav')), 'speed': round(speed, 3),
        'actors': [{'id': c, 'name': cast[c]['name'], 'height': cast[c].get('height', 1.7), 'x': cast[c].get('x', 0), 'enter': enter[c], 'mirror': cast[c].get('mirror')} for c in ids],
        'tracks': {c: {'jaw': [round(float(v), 3) for v in jaw[c]], 'turn': [round(float(v), 3) for v in turn[c]], 'nod': [round(float(v), 3) for v in nod[c]], 'blinks': blinks[c], 'poses': poses[c]} for c in ids},
        'shots': shots, 'captions': captions, 'emoji': emoji, 'timeline': timeline, 'coupes': coupes if len(coupes) > 1 else [],
        'hook': story.get('hook', ''), 'life': life,
        # The story itself travels with the plan: the scene's preflight checks the narrative against it.
        'story': story,
    }
    json.dump(plan, open(os.path.join(a.out, 'plan.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f"[plan] {len(beats)} répliques · {len(shots)} plans · {nF} images ({nF / fps:.1f} s) · voix ×{speed:.2f} · parole {speech:.1f} s")


if __name__ == '__main__':
    main()
