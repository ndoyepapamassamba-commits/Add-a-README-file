"""
TON ET VOIX — le rythme comique et les voix de la chaîne, MESURÉS sur ses vidéos, appliqués au plan du film.

Référence : tone_reference.json (mesures agrégées seulement — aucune transcription, aucun extrait), produite par
scripts/voice-study.py (transcription faster-whisper, licence MIT ; pauses par le VAD Silero, MIT ; hauteur par YIN) puis
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


def schedule(durations, punch, seconds, tone, holds=None, after=1.25):
    """Places the lines like the channel: TIGHT turns inside an exchange (measured turn gap), a short beat before the
    punchline, a breath between two exchanges (blocks of the measured number of lines per joke). Spare time to reach the
    asked duration goes to those breaths (up to the measured upper quartile), then after the punchline (the reaction
    shot), and only then, evenly. Returns (timeline, report)."""
    t = timing(tone)
    holds = holds or [0.0] * len(durations)
    n = len(durations)
    gaps = [0.0] * n  # silence added at the END of line i (before line i+1)
    for i in range(n):
        if i == punch:
            gaps[i] += after
        if i + 1 == punch:
            gaps[i] += t['beat']
    breaths = [i for i in range(n - 1) if (i + 1) % t['block'] == 0 and i + 1 != punch and i != punch]
    for i in breaths:
        gaps[i] += t['breath']
    first = 0.1
    base = sum(durations) + first + (n - 1) * (t['lead'] + t['tail']) + t['tail'] + sum(gaps) + sum(holds)
    spare = max(0.0, seconds - base)
    report = {'mesure': tone.get('_mesure', False), 'tour_s': round(t['lead'] + t['tail'], 2), 'avant_chute_s': round(t['lead'] + t['tail'] + t['beat'], 2),
              'respirations': len(breaths), 'reserve_s': round(spare, 2)}
    # 1. breaths up to the measured upper quartile; 2. after the punchline (up to a laugh's length); 3. evenly.
    room = [(i, max(0.0, t['breath_max'] - t['breath'])) for i in breaths]
    if punch >= 0:
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
    (pitch) factor on top of the sheet's own pitch, formant factor (a child's smaller vocal tract). Bounded so a
    character keeps its identity. Returns {} when nothing was measured."""
    base = (tone.get('piper') or {}).get(voice)
    v = tone.get('voix') or {}
    if not base:
        return {}
    k = kind(character)
    want = v.get(k) or {}
    out = {'type': k}
    if want.get('etendue_relative') and base.get('etendue_relative'):
        out['expr'] = round(min(2.2, max(1.0, want['etendue_relative'] / base['etendue_relative'])), 2)
    if want.get('f0') and base.get('f0') and not want.get('partage'):
        # Only for a kind measured on its own (children): the adult measure mixes men and women (no diarisation),
        # so an adult keeps its sheet pitch and only gains the channel's melody range.
        own = base['f0'] * float(character.get('pitch', 1.0))
        # Half-way (in octaves) toward the channel's measured voices of that kind, at most ±30 %.
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


# ---------------------------------------------------------------- reference


def build_reference(etude, voices_dir, out=REFERENCE):
    """Aggregates the study (numbers only) and measures each local Piper voice on the same sentence."""
    import importlib
    d = json.load(open(etude, encoding='utf-8'))
    # Voice kinds of the channel. The study clusters voices by pitch and timbre; a cluster is a CHILD voice above
    # 280 Hz (implausibly high clusters over 450 Hz are squeals / octave errors and are left out), otherwise an adult.
    adult, child = [], []
    for v in d['videos']:
        for c in v['voix']:
            if c['f0_mediane'] > 450:
                continue
            (child if c['f0_mediane'] >= 280 else adult).append(c)
    def agg(L):
        if not L:
            return None
        return {'f0': round(float(np.median([c['f0_mediane'] for c in L])), 1),
                'etendue_relative': round(float(np.median([c['expressivite_hz'] / c['f0_mediane'] for c in L])), 3),
                'debit_syll_s': round(float(np.median([c['debit_syll_s'] for c in L])), 2), 'voix_mesurees': len(L)}
    voix = {'enfant': agg(child), 'adulte': agg(adult)}
    # Adults are not split by sex from the audio (no diarisation): men and women share the adult brightness and
    # expressivity, each keeping its own Piper voice and sheet pitch.
    for k in ('femme', 'homme', 'aine'):
        voix[k] = dict(voix['adulte'], partage=True) if voix['adulte'] else None
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
    ref = {'source': f"mesures agrégées de {len(d['videos'])} vidéos de la chaîne (scripts/voice-study.py : faster-whisper MIT, VAD Silero MIT, YIN) — "
                     'aucune transcription ni extrait gardé ici', 'rythme': d['rythme'], 'voix': voix, 'piper': piper,
           'expressions': d.get('expressions', [])}
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
