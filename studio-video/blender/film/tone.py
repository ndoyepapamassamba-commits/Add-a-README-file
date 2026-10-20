"""
TON ET VOIX — le rythme comique et les voix de la chaîne, MESURÉS sur ses vidéos, appliqués au plan du film.

Référence : tone_reference.json (mesures agrégées seulement — aucune transcription, aucun extrait), produite par
outils/voice-study.py (transcription faster-whisper, licence MIT ; pauses par le VAD Silero, MIT ; hauteur par YIN) puis
`python3 tone.py --etude <etude.json> --voices <dossier Piper>` qui y ajoute la mesure des voix Piper locales.

  • RYTHME : tour de parole dans une blague, silence avant la chute, respiration entre deux blagues, longueur d'une
    blague (en répliques) — le plan place les silences comme la chaîne, au lieu d'un silence fixe entre chaque réplique ;
  • VOIX   : hauteur et EXPRESSIVITÉ (étendue de la mélodie) de la chaîne comparées à chaque voix Piper ; la voix de
    chaque personnage est rapprochée de la chaîne par le vocodeur WORLD (Morise et al. 2016, BSD ; pyworld, MIT) :
    mélodie élargie autour de sa propre hauteur, hauteur déplacée SANS déplacer le timbre (pas d'effet « accéléré »),
    timbre d'enfant par déplacement des formants. Sans pyworld : rééchantillonnage (méthode précédente).
Pur Python + numpy (pyworld optionnel) : testable sans Blender.
"""
import json
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REFERENCE = os.path.join(HERE, 'tone_reference.json')

# Used only when no measurement exists (the engine's former constants).
DEFAULT = {'rythme': {'tour_de_parole_s': 0.8, 'silence_avant_chute_s': 1.35, 'silence_avant_chute_p75_s': 1.35, 'entre_blagues_s': 1.24,
                      'entre_blagues_p75_s': 1.24, 'repliques_par_blague': 18, 'rire_s': None},
           'voix': {}, 'piper': {}}


def load(path=REFERENCE):
    try:
        ref = json.load(open(path, encoding='utf-8'))
        ref['_mesure'] = True
        return ref
    except (OSError, ValueError):
        d = json.loads(json.dumps(DEFAULT))
        d['_mesure'] = False
        return d


# ---------------------------------------------------------------- rhythm


def timing(tone):
    """The silences of the plan, from the measured rhythm (seconds)."""
    r = tone['rythme']
    turn = float(r.get('tour_de_parole_s') or 0.8)
    pre = float(r.get('silence_avant_chute_p75_s') or r.get('silence_avant_chute_s') or turn)
    lead = min(0.12, turn / 2)
    return {'lead': lead, 'tail': max(0.0, turn - lead), 'beat': max(0.0, pre - turn), 'block': max(2, int(round(r.get('repliques_par_blague') or 3))),
            'breath': float(r.get('entre_blagues_s') or turn), 'breath_max': float(r.get('entre_blagues_p75_s') or r.get('entre_blagues_s') or turn)}


def schedule(durations, punch, seconds, tone, holds=None, after=1.25, breaths=True, react_at=None):
    """Places the lines like the channel: TIGHT turns inside an exchange (measured turn gap), a short beat before the
    punchline, a breath between two exchanges (blocks of the measured number of lines per joke). Spare time to reach the
    asked duration goes to those breaths (up to the measured upper quartile), then after the punchline (the reaction
    shot), and only then, evenly. Returns (timeline, report)."""
    t = timing(tone)
    holds = holds or [0.0] * len(durations)
    n = len(durations)
    gaps = [0.0] * n  # silence added at the END of line i (before line i+1)
    # The room after the punchline (reaction shot, emoji) comes after the reaction to it when there is one (a laugh).
    ra = punch if react_at is None else react_at
    for i in range(n):
        if i == ra:
            gaps[i] += after
        if i + 1 == punch:
            gaps[i] += t['beat']
    # Breaths between exchanges belong to a COMPILATION of short jokes (measured between sketches); a continuous story
    # keeps its tight turns (measured inside one long sketch: turns of 0 to 0.85 s, no long pause).
    breaths = [i for i in range(n - 1) if (i + 1) % t['block'] == 0 and i + 1 != punch and i != punch] if breaths else []
    for i in breaths:
        gaps[i] += t['breath']
    first = 0.1
    base = sum(durations) + first + (n - 1) * (t['lead'] + t['tail']) + t['tail'] + sum(gaps) + sum(holds)
    spare = max(0.0, seconds - base)
    report = {'mesure': tone.get('_mesure', False), 'tour_s': round(t['lead'] + t['tail'], 2), 'avant_chute_s': round(t['lead'] + t['tail'] + t['beat'], 2),
              'respirations': len(breaths), 'reserve_s': round(spare, 2)}
    # 1. breaths up to the measured upper quartile; 2. after the punchline (up to a laugh's length); 3. evenly.
    room = [(i, max(0.0, t['breath_max'] - t['breath'])) for i in breaths]
    if punch >= 0 and react_at is None:
        room.append((punch, max(0.0, float(tone['rythme'].get('rire_s') or 2.0))))
    for i, r in room:
        k = min(r, spare)
        gaps[i] += k
        spare -= k
    report['etale_s'] = round(spare, 2)
    if spare > 0:
        for i in range(n):
            gaps[i] += spare / n
    tl = []
    cur = 0.0
    for i, d in enumerate(durations):
        s0 = cur + (first if i == 0 else t['lead'])
        s1 = s0 + d
        end = s1 + t['tail'] + gaps[i] + float(holds[i])
        tl.append({'i': i, 'start': cur, 'speak0': s0, 'speak1': s1, 'end': end})
        cur = end
    return tl, report


# ---------------------------------------------------------------- reactions (a short story gets the channel's reactions)

DETERMINERS = {'le', 'la', 'les', "l'", 'un', 'une', 'des', 'du', 'de', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'ce', 'cet',
               'cette', 'ces', 'notre', 'votre', 'leur', 'leurs', 'au', 'aux'}
NUMBERS = {'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'quinze', 'vingt', 'trente', 'quarante',
           'cinquante', 'soixante', 'cent', 'cents', 'mille', 'million', 'millions'}


VOCATIVES = {'madame', 'monsieur', 'papa', 'maman', 'chérie', 'chéri', 'tantie', 'tonton', 'docteur', 'patron', 'vieux', 'fils', 'ma', 'mon', 'fille'}
SUBORDINATE = {'pour', 'parce', 'que', 'qui', 'quand', 'si', 'comme', 'mais', 'et', 'car', 'donc', 'alors', 'puisque', 'lorsque'}


def echo(text):
    """The channel's reaction: the listener repeats, stunned, the key words of what was just said (« Au passé ? »,
    « Mille ?! ») — the last noun group or amount of the last sentence, without the closing vocative (« …, madame »)
    and taken in the clause that carries it (not in « pour que ça me quitte »)."""
    import re
    sent = [x for x in re.split(r'(?<=[.!?…])\s+', text.strip()) if x.strip()]
    last_s = sent[-1] if sent else text
    # a closing vocative after a comma is not what is echoed
    parts = [p_.strip() for p_ in last_s.split(',')]
    while len(parts) > 1 and all(w.lower().strip('.!?… ') in VOCATIVES for w in parts[-1].split()):
        parts.pop()
    toks = re.sub(r'[.!?…;:«»"]+', ' ', ' , '.join(parts)).split()
    if not toks:
        return 'Quoi ?!'
    # clauses split at commas and subordinators; the last one that carries a noun group (determiner or amount)
    clauses, cur = [], []
    for w in toks:
        if w == ',':
            if cur:
                clauses.append(cur)
            cur = []
        elif w.lower() in SUBORDINATE and cur:
            clauses.append(cur)
            cur = []
        else:
            cur.append(w)
    clauses.append(cur)
    def has_group(c):
        return any(w.lower().replace('’', "'") in DETERMINERS or w.lower() in NUMBERS or w[:1].isdigit() for w in c)
    toks = [w for w in toks if w != ',']
    clause = next((c for c in reversed(clauses) if c and has_group(c)), (clauses[-1] if clauses and clauses[-1] else toks))
    if len(clause) <= 3:
        grp = clause
    else:
        idx = [i for i, w in enumerate(clause) if w.lower().replace('’', "'") in DETERMINERS or w.lower() in NUMBERS or w[:1].isdigit()]
        k = idx[-1] if idx else len(clause) - 2
        # an amount is said whole (« cinq cents », « deux mille »)
        while k - 1 >= 0 and (clause[k - 1].lower() in NUMBERS or clause[k - 1][:1].isdigit()):
            k -= 1
        # « le prix du carburant » : go back over « det noun » pairs
        while k - 2 >= 0 and clause[k - 2].lower() in DETERMINERS and clause[k - 1].lower() not in DETERMINERS:
            k -= 2
        grp = clause[k:][:5]
        if len(grp) > 1 and grp[0].lower() in ('de', 'du', 'des'):
            grp = grp[1:]
    out = ' '.join(grp)
    return out[:1].upper() + out[1:] + ' ?!'


def reactions(beats, punch, spare, tone, cast_ids, per_line=1.0):
    """Where the channel would put a short reaction (measured: about 1 line in 6 is one): after a statement or an
    exclamation, by the LISTENER, never right before the punchline nor after it, never two in a row. Inserted while the
    film has spare time (≈ one second each). Returns [(index_after, beat)] in story order."""
    share = float((tone.get('rythme') or {}).get('reactions_part') or 0.16)
    budget = min(int(round(share * len(beats) / max(1e-6, 1 - share))), int(spare // per_line))
    if budget <= 0 or len(cast_ids) < 2:
        return []
    cands = []
    for i in range(len(beats) - 1):
        a, b = beats[i], beats[i + 1]
        t = a.get('text', '').strip()
        if i == punch or i + 1 == punch or a['who'] == b['who'] or not t or t[-1] == '?':
            continue
        # comic information first: an amount, an exclamation
        w = (2 if any(ch.isdigit() for ch in t) or any(x in t.lower().split() for x in NUMBERS) else 0) + (1 if t.endswith('!') else 0)
        cands.append((w, i))
    chosen, used = [], set()
    for w, i in sorted(cands, key=lambda c: (-c[0], c[1])):
        if len(chosen) >= budget or i - 1 in used or i + 1 in used:
            continue
        used.add(i)
        chosen.append(i)
    return [(i, {'who': beats[i + 1]['who'], 'text': echo(beats[i]['text']), 'pose': 'choc', 'insere': 'réaction de la chaîne (écho étonné)'})
            for i in sorted(chosen)]


# ---------------------------------------------------------------- voices


def f0_track(x, sr=16000, fmin=70, fmax=600, win=0.04, hop=0.01, thr=0.15):
    """Pitch per voiced frame by YIN (de Cheveigné & Kawahara 2002): cumulative mean normalised difference, first dip
    under the threshold, parabolic refinement."""
    x = np.asarray(x, np.float64)
    n, h = int(win * sr), int(hop * sr)
    lo, hi = int(sr / fmax), int(sr / fmin)
    out = []
    for i in range(0, len(x) - n - hi, h):
        f = x[i:i + n + hi]
        if np.sqrt(np.mean(f[:n] ** 2)) < 0.01:
            continue
        c2 = np.concatenate([[0.0], np.cumsum(f * f)])
        r = np.correlate(f, f[:n], 'valid')[:hi + 1]
        d = c2[n] + (c2[n:n + hi + 1] - c2[:hi + 1]) - 2 * r
        cm = d[1:] * np.arange(1, hi + 1) / (np.cumsum(d[1:]) + 1e-12)
        cand = np.nonzero(cm[lo - 1:] < thr)[0]
        if not len(cand):
            continue
        t = cand[0] + lo - 1
        while t + 1 < len(cm) and cm[t + 1] < cm[t]:
            t += 1
        if 0 < t < len(cm) - 1:
            a_, b_, c_ = cm[t - 1], cm[t], cm[t + 1]
            t = t + 0.5 * (a_ - c_) / (a_ - 2 * b_ + c_ + 1e-12)
        out.append(sr / (t + 1))
    return np.array(out)


def spread(f0):
    """Melody range (p90 - p10, Hz) after a 5-frame median filter: an isolated octave error is not « expressivity »."""
    f0 = np.asarray(f0, np.float64)
    if len(f0) < 5:
        return None
    m = np.array([np.median(f0[max(0, i - 2):i + 3]) for i in range(len(f0))])
    return float(np.percentile(m, 90) - np.percentile(m, 10))


def melody(a, sr):
    """(median F0, relative range (p90 - p10) / median) of a line."""
    if sr != 16000:
        t = np.arange(int(len(a) * 16000 / sr)) * sr / 16000
        a = np.interp(t, np.arange(len(a)), a)
    f0 = f0_track(a)
    if len(f0) < 5:
        return None, None
    med = float(np.median(f0))
    return med, spread(f0) / med


def kind(character):
    """enfant / femme / homme / aine — from the character sheet (never guessed from the voice)."""
    age = character.get('age', 30)
    g = (character.get('genre') or '').lower()
    if age < 14 or g in ('garçon', 'garcon', 'fille'):
        return 'enfant'
    if age >= 60:
        return 'aine'
    return 'femme' if g == 'femme' else 'homme'


def targets(character, voice, tone):
    """How a character's Piper voice is moved toward the channel: expressivity factor (melody range), brightness
    (pitch) factor on top of the sheet's own pitch, formant factor (a child's smaller vocal tract). Men and women follow
    the measure of their own sex; a child or an elder (not measured apart) keeps its pitch and gains the melody range of
    its sex. Bounded so a character keeps its identity. Returns {} when nothing was measured."""
    base = (tone.get('piper') or {}).get(voice)
    v = tone.get('voix') or {}
    if not base:
        return {}
    k = kind(character)
    g = (character.get('genre') or '').lower()
    sex = 'femme' if g in ('femme', 'fille') else 'homme'
    want = v.get(sex) or {}
    out = {'type': k}
    if want.get('etendue_relative') and base.get('etendue_relative'):
        out['expr'] = round(min(2.2, max(1.0, want['etendue_relative'] / base['etendue_relative'])), 2)
    if want.get('f0') and base.get('f0') and k in ('homme', 'femme') and not want.get('partage'):
        own = base['f0'] * float(character.get('pitch', 1.0))
        # Half-way (in octaves) toward the channel's measured voices of that sex, at most ±30 %.
        f = math.sqrt(want['f0'] / own)
        out['luminosite'] = round(min(1.3, max(1 / 1.3, f)), 3)
    out['formant'] = 1.12 if k == 'enfant' else 1.0
    return out


def shape(a, sr, pitch=1.0, expr=1.0, formant=1.0):
    """WORLD analysis → melody widened around the line's own median (×expr in log-frequency), pitch × `pitch` with the
    spectral envelope kept (timbre unchanged), envelope warped by `formant` → resynthesis. None without pyworld."""
    try:
        import pyworld as pw
    except ImportError:
        return None
    x = np.asarray(a, np.float64)
    # A faint dither: WORLD's envelope estimate divides by the spectrum, a perfectly clean signal yields NaN.
    x = x + np.random.default_rng(0).normal(0, 1e-4, len(x))
    f0, t = pw.dio(x, sr, frame_period=5.0)
    f0 = pw.stonemask(x, f0, t, sr)
    sp = pw.cheaptrick(x, f0, t, sr)
    ap = pw.d4c(x, f0, t, sr)
    v = f0 > 0
    if v.sum() < 5:
        return None
    ref = float(np.median(f0[v]))
    g = f0.copy()
    g[v] = ref * pitch * np.exp(expr * np.log(f0[v] / ref))
    g[v] = np.clip(g[v], 60, 900)
    if abs(formant - 1) > 1e-3:
        # Formant shift: the envelope read at f / formant (a smaller vocal tract raises every resonance).
        bins = np.arange(sp.shape[1])
        src = np.clip(bins / formant, 0, sp.shape[1] - 1)
        sp = np.array([np.interp(src, bins, row) for row in sp])
        ap = np.array([np.interp(src, bins, row) for row in ap])
    y = pw.synthesize(g, np.ascontiguousarray(sp), np.ascontiguousarray(ap), sr, frame_period=5.0)
    if not np.all(np.isfinite(y)):
        return None
    y = y[:len(x)] if len(y) >= len(x) else np.pad(y, (0, len(x) - len(y)))
    peak = np.max(np.abs(y)) or 1.0
    return (y / peak * min(0.95, float(np.max(np.abs(x))) or 0.9)).astype(np.float32)


# ---------------------------------------------------------------- takes (the director picks the best one)

_UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze',
          'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
_TENS = {2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante', 8: 'quatre-vingt'}


def fr_number(n):
    """An integer in French words (« 1000 » heard by the transcriber = « mille » written in the line)."""
    n = int(n)
    if n < 20:
        return _UNITS[n]
    if n < 100:
        t, u = divmod(n, 10)
        if t in (7, 9):
            return _TENS[t - 1] + ('-et-' if n == 71 else '-') + _UNITS[10 + u]
        w = _TENS[t]
        return w + ('s' if t == 8 and u == 0 else '') if u == 0 else w + ('-et-' if u == 1 and t != 8 else '-') + _UNITS[u]
    if n < 1000:
        h, r = divmod(n, 100)
        w = ('cent' if h == 1 else _UNITS[h] + '-cent' + ('s' if r == 0 else ''))
        return w if r == 0 else w + '-' + fr_number(r)
    if n < 1_000_000:
        k, r = divmod(n, 1000)
        w = 'mille' if k == 1 else fr_number(k) + '-mille'
        return w if r == 0 else w + '-' + fr_number(r)
    return str(n)


def words(text):
    import re
    t = text.lower().replace('’', "'").replace('\u00a0', ' ')
    t = re.sub(r'(\d)[ .](\d{3})', r'\1\2', t)
    t = re.sub(r'\d+', lambda m: ' ' + fr_number(m.group(0)).replace('-', ' ') + ' ', t)
    return re.findall(r"[\w]+", t.replace('-', ' '))


def wer(ref, hyp):
    """Word error rate of what was heard against the written line (numbers spelled out on both sides)."""
    r, h = words(ref), words(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        p, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (r[i - 1] != h[j - 1]))
    return d[len(h)] / max(1, len(r))


_EAR = {}


def heard(a, sr):
    """What a French listener hears in a take — faster-whisper « small » (MIT). None without it."""
    if 'm' not in _EAR:
        try:
            from faster_whisper import WhisperModel
            _EAR['m'] = WhisperModel('small', device='cpu', compute_type='int8', download_root=os.path.expanduser('~/.cache/massamba-models/whisper'))
        except Exception:
            _EAR['m'] = None
    m = _EAR['m']
    if m is None:
        return None
    x = np.asarray(a, np.float32)
    if sr != 16000:
        t = np.arange(int(len(x) * 16000 / sr)) * sr / 16000
        x = np.interp(t, np.arange(len(x)), x).astype(np.float32)
    segs, _ = m.transcribe(x, language='fr', beam_size=5, vad_filter=False)
    return ' '.join(s.text for s in segs).strip()


def choose_take(takes, text, sr, target_rel=None):
    """The best of several takes of one line: understood (word error rate of what Whisper hears) first, then the
    melody closest to the channel's range. Returns (index, [per-take details])."""
    det = []
    for a in takes:
        h = heard(a, sr)
        e = wer(text, h) if h is not None else None
        _, rel = melody(a, sr)
        mel = 1.0 - min(1.0, abs(rel - target_rel) / target_rel) if (target_rel and rel) else 0.5
        score = (0.7 * (1.0 - min(1.0, e)) if e is not None else 0.0) + 0.3 * mel
        det.append({'entendu': h, 'erreur': None if e is None else round(e, 3), 'etendue': None if rel is None else round(rel, 3), 'score': round(score, 3)})
    return int(np.argmax([d['score'] for d in det])), det


# ---------------------------------------------------------------- laughter (the character's own voice)


def centroid16(x, sr):
    """Spectral centroid (Hz) of a sound brought to 16 kHz — the way the channel's laughs were measured."""
    x = np.asarray(x, np.float64)
    if sr != 16000:
        t = np.arange(int(len(x) * 16000 / sr)) * sr / 16000
        x = np.interp(t, np.arange(len(x)), x)
    spec = np.abs(np.fft.rfft(x))
    fr = np.fft.rfftfreq(len(x), 1 / 16000)
    return float((spec * fr).sum() / (spec.sum() + 1e-9))


def laugh(syllable, sr, params, f0_voice):
    """A laugh made from the character's OWN voice: one « ha » of its synthetic voice, analysed by WORLD, repeated as a
    bout of calls whose rate, pitch (relative to the voice's speech), pitch decline across the bout and breathiness are
    the ones MEASURED on the channel's laughs (params from tone_reference.json « rire »). None without pyworld or without
    a measurement (no invented laugh)."""
    if not params or not params.get('eclats_s'):
        return None
    try:
        import pyworld as pw
    except ImportError:
        return None
    x = np.asarray(syllable, np.float64) + np.random.default_rng(1).normal(0, 1e-4, len(syllable))
    f0, t = pw.dio(x, sr, frame_period=5.0)
    f0 = pw.stonemask(x, f0, t, sr)
    sp = pw.cheaptrick(x, f0, t, sr)
    ap = pw.d4c(x, f0, t, sr)
    v = f0 > 0
    if v.sum() < 3:
        return None
    rate = float(params['eclats_s'])
    n = max(2, int(round(float(params.get('duree_s', 2.5)) * rate)))
    period = 1.0 / rate
    call = min(len(f0) * 0.005, float(params.get('eclat_s', 0.55 * period)))
    frames = max(4, int(call / 0.005))
    # The vowel nucleus of the « ha » (frames within 20 dB of the loudest): a steady « haa » per call, not the silence
    # and the onset of the recorded syllable squeezed into 80 ms (that made a click).
    en = np.log10(sp.sum(1) + 1e-12)
    core = np.nonzero(en >= en.max() - 2.0)[0]
    lo_, hi_ = (int(core.min()), int(core.max())) if len(core) else (0, len(f0) - 1)
    idx = np.linspace(lo_, hi_, frames).astype(int)  # the nucleus stretched / squeezed to one call
    base = float(f0_voice) * float(params.get('f0_rapport', 1.3))
    slope = float(params.get('pente', 0.0))
    breath = float(params.get('souffle', 0.3))
    out = []
    # Measured on the channel: most calls are BREATHED (unvoiced « h » bursts), a few are voiced — the first ones.
    n_voiced = int(round(n * float(params.get('voise', 1.0))))
    for k in range(n):
        if k < n_voiced:
            g = np.where(v[idx], base * (1 - slope * k / max(1, n - 1)) * (1 + 0.06 * np.sin(np.linspace(0, np.pi, frames))), 0.0)
        else:
            g = np.zeros(frames)  # an aspirated call: the vowel's envelope over breath noise
        a_ = np.clip(ap[idx] ** (1 - breath), 0, 1) if k < n_voiced else np.ones_like(ap[idx])  # breathier calls; a breathed one is all noise
        y = pw.synthesize(np.ascontiguousarray(g), np.ascontiguousarray(sp[idx]), np.ascontiguousarray(a_), sr, frame_period=5.0)
        env = np.clip(np.minimum(np.arange(len(y)) / (0.008 * sr), (len(y) - np.arange(len(y))) / (0.012 * sr)), 0, 1)
        y = y * env
        y = y / (np.sqrt(np.mean(y * y)) + 1e-9) * 0.1  # every call as loud as the others (measured: all bursts carry)
        y = y * (1 - 0.45 * k / max(1, n - 1))  # the bout fades
        out.append(y)
        out.append(np.zeros(max(0, int((period - len(y) / sr) * sr))))
    y = np.concatenate(out)
    if not np.all(np.isfinite(y)):
        return None
    # Breath noise is BRIGHT (measured spectral centroid of the channel's laughs): a pre-emphasis whose strength is
    # searched so the laugh's centroid meets the measured one.
    want = params.get('timbre_hz')
    if want:
        best = (1e9, y)
        for alpha in np.linspace(-0.9, 0.97, 28):  # negative = darker (low-pass), positive = brighter
            z = np.append(y[0], y[1:] - alpha * y[:-1])
            c = centroid16(z, sr)  # measured exactly like the channel's laughs
            if abs(c - want) < best[0]:
                best = (abs(c - want), z)
        y = best[1]
    # Level from the whole bout, not from one onset click (a single peak would push every other call under the rest).
    ref = float(np.percentile(np.abs(y), 99.5)) or 1.0
    return np.clip(y / ref * 0.6, -0.95, 0.95).astype(np.float32)


# ---------------------------------------------------------------- reference


def build_reference(etude, voices_dir, out=REFERENCE):
    """Aggregates the study (numbers only) and measures each local Piper voice on the same sentence."""
    import importlib
    d = json.load(open(etude, encoding='utf-8'))
    # Voices of the channel by SEX (outils/speaker-types.py: wav2vec2 gender classifier, validated, with a vote per
    # voice-print group). Children and elders were not measured apart: they keep their sheet pitch (see targets).
    vg = d.get('voix_genre') or {}
    voix = {k: vg[k] for k in ('homme', 'femme') if vg.get(k)}
    plan = importlib.import_module('plan')
    sentence = "Chérie, depuis un mois on a fini le mariage là. Tes parents ne sont pas encore rentrés chez eux ?"
    piper = {}
    tmp = os.path.join(os.path.dirname(out), '.piper-mesure.wav')
    for name in plan.VOICES:
        try:
            a = plan.tts(sentence, name, tmp, voices_dir, stand_in=False)  # the voice itself, as it is
        except Exception as e:  # a missing voice file is reported, not fatal
            print('  voix', name, 'absente :', str(e)[:80])
            continue
        f0, rel = melody(a, plan.SR)
        piper[name] = {'f0': round(f0, 1), 'etendue_relative': round(rel, 3)}
    if os.path.exists(tmp):
        os.remove(tmp)
    ref = {'source': f"mesures agrégées de {len(d['videos'])} vidéos de la chaîne (outils/voice-study.py : faster-whisper MIT, VAD Silero MIT, YIN) — "
                     'aucune transcription ni extrait gardé ici', 'rythme': d['rythme'], 'voix': voix, 'piper': piper,
           'expressions': d.get('expressions', [])}
    # Laughs, measured on the voice separated from the music (rires.json, written by the study).
    rires = os.path.join(os.path.dirname(etude), 'rires.json')
    if os.path.exists(rires):
        ref['rire'] = json.load(open(rires, encoding='utf-8')).get('agrege')
    json.dump(ref, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return ref


if __name__ == '__main__':
    import argparse
    import sys
    sys.path.insert(0, HERE)
    ap = argparse.ArgumentParser()
    ap.add_argument('--etude', required=True)
    ap.add_argument('--voices', default=os.environ.get('PIPER_VOICES', os.path.expanduser('~/piper')))
    ap.add_argument('--out', default=REFERENCE)
    A = ap.parse_args()
    print(json.dumps(build_reference(A.etude, A.voices, A.out), ensure_ascii=False, indent=1))
