# VOIX DE LA TROUPE AU TON DE LA CHAÎNE (16/10/2026)
#  1. Piper (MIT) lit chaque réplique et donne la durée de chaque phonème (synchro labiale exacte) ;
#  2. WORLD (Morise et al. 2016, BSD modifiée ; liaison pyworld, MIT) décompose la voix (hauteur, enveloppe, apériodicité)
#     et la recompose avec la hauteur moyenne et l'ÉTENDUE mesurées sur les vidéos de l'utilisateur
#     (tone_reference.json : hommes 229 Hz, femmes 307 Hz, étendue relative ≈ 0,5 — Piper : 0,29 à 0,45), une montée
#     finale sur les questions, un appui sur les exclamations ; l'enveloppe est dilatée pour la voix d'enfant ;
#  3. sonie de chaque réplique ramenée à −16 LUFS (pyloudnorm, MIT) ; placement au rythme de la chaîne
#     (0,26 s entre deux répliques, 0,31 s de silence avant la chute) ; contrôle d'intelligibilité par Whisper (MIT).
import json, os, re, sys, wave
import numpy as np, pyworld as pw, pyloudnorm as pyln
from piper import PiperVoice, SynthesisConfig
P = os.environ.get('PIPER_VOICES', os.path.expanduser('~/.cache/massamba-models/piper/'))  # dossier des voix Piper (.onnx + .json)
SR = 22050
# personnage : (modèle, locuteur, hauteur visée Hz, facteur d'étendue, vitesse (length_scale), dilatation des formants)
CAST = {  # deux voix sources propres et libres : siwis (CC-BY 4.0) et gilles (CC0) ; chaque personnage = hauteur + étendue + timbre (WORLD)
  # (MLS écartée : charabia mesuré par Whisper même sans transformation ; tom : données AGPL ; upmc : CC-BY-SA)
  'MAMAN NOUNOU':  ('fr_FR-siwis-medium', None, 285, 1.35, 0.85, 1.00),
  'TANTIE AWA':    ('fr_FR-siwis-medium', None, 245, 1.45, 0.85, 0.93),
  'COUMBA':        ('fr_FR-siwis-medium', None, 320, 1.25, 0.85, 1.05),
  'PETIT MAMADOU': ('fr_FR-siwis-medium', None, 350, 1.30, 0.85, 1.16),
  'BAYE NDIAYE':   ('fr_FR-gilles-low', None, 150, 1.60, 0.85, 0.95),
  'MODOU':         ('fr_FR-gilles-low', None, 200, 1.60, 0.85, 1.00),
  'KOFFI':         ('fr_FR-gilles-low', None, 185, 1.40, 0.85, 1.04),
}
# débit visé (syllabes par seconde de parole) : chaîne 5,92 (hommes) / 4,71 (femmes), Ladjagaï 6,3–6,7 → un cran au-dessus de la chaîne
DEBIT = {'MAMAN NOUNOU': 5.4, 'TANTIE AWA': 5.4, 'COUMBA': 5.4, 'PETIT MAMADOU': 5.6, 'BAYE NDIAYE': 6.0, 'MODOU': 6.2, 'KOFFI': 6.2}
SYL = re.compile(r'[aeiouyéèêëàâîïôûœ]+', re.I)

def compress_silences(y, ph, sr, keep=0.07, minsil=0.12):
    # raccourcit chaque silence interne > minsil à keep (les voix MLS lisent comme un livre audio) ; phonèmes recalés
    hop = int(0.01 * sr); e = np.array([np.sqrt(np.mean((y[k:k + hop].astype(np.float32) / 32768) ** 2)) for k in range(0, len(y), hop)])
    thr = max(0.012, 0.06 * e.max()); quiet = e < thr
    cuts = []; k = 0
    while k < len(quiet):
        if quiet[k]:
            j = k
            while j < len(quiet) and quiet[j]: j += 1
            if k > 0 and j < len(quiet) and (j - k) * 0.01 > minsil: cuts.append((k * hop + int(keep / 2 * sr), j * hop - int(keep / 2 * sr)))
            k = j
        else: k += 1
    if not cuts: return y, ph
    parts, last, removed = [], 0, []
    for a, b in cuts: parts.append(y[last:a]); removed.append((a / sr, (b - a) / sr)); last = b
    parts.append(y[last:])
    def mapt(t):
        d = 0.0
        for a, r in removed:
            if t > a + r: d += r
            elif t > a: d += t - a
        return t - d
    return np.concatenate(parts), [dict(p, t0=mapt(p['t0']), t1=mapt(p['t1'])) for p in ph]

OPEN = {}
for ph in 'mbp': OPEN[ph] = 0
for ph in ['f', 'v', 's', 'z', 'ʃ', 'ʒ', 't', 'd', 'n', 'ɲ', 'i', 'j', 'u', 'y', 'w', 'ɥ']: OPEN[ph] = 1
for ph in ['l', 'ʁ', 'r', 'k', 'ɡ', 'g', 'ɔ', 'o', 'ø', 'ə']: OPEN[ph] = 2
for ph in ['ɛ', 'œ', 'e']: OPEN[ph] = 3
for ph in ['a', 'ɑ']: OPEN[ph] = 4
_voices = {}
def voice(m):
    if m not in _voices: _voices[m] = PiperVoice.load(P + m + '.onnx')
    return _voices[m]

def shape(x, sr, f0_target, spread, formant, question, exclam):
    x = x.astype(np.float64) / 32768
    f0, t = pw.harvest(x, sr, f0_floor=60, f0_ceil=600, frame_period=5.0)
    sp = pw.cheaptrick(x, f0, t, sr); ap = pw.d4c(x, f0, t, sr)
    v = f0 > 0
    if v.sum() < 5: return (x * 32767).astype(np.int16)
    lf = np.log(f0[v]); mu = np.median(lf)
    lf2 = np.log(f0_target) + (lf - mu) * spread
    n = len(f0); idx = np.nonzero(v)[0]; pos = (idx - idx[0]) / max(1, idx[-1] - idx[0])
    if question: lf2 += np.where(pos > 0.72, (pos - 0.72) / 0.28 * np.log(1.32), 0)          # montée finale
    if exclam: lf2 += np.log(1.06) * np.exp(-((pos - 0.25) / 0.2) ** 2) + np.log(1.10) * np.exp(-((pos - 0.85) / 0.12) ** 2)
    f0n = f0.copy(); f0n[v] = np.exp(lf2)
    if formant != 1.0:  # dilate l'enveloppe spectrale (formants plus hauts = timbre d'enfant)
        fb = sp.shape[1]; src = np.clip(np.arange(fb) / formant, 0, fb - 1)
        sp = np.array([np.interp(src, np.arange(fb), row) for row in sp])
    y = pw.synthesize(f0n, sp, ap, sr, frame_period=5.0)
    return (np.clip(y, -1, 1) * 32767).astype(np.int16)

def synth(qui, texte, ls=None):
    m, spk, f0t, spread, ls0, fm = CAST[qui]
    ls = ls or ls0
    cfg = SynthesisConfig(length_scale=ls, speaker_id=spk) if spk is not None else SynthesisConfig(length_scale=ls)
    v = voice(m)
    chunks = list(v.synthesize(texte.replace('…', ','), syn_config=cfg, include_alignments=True))
    sr = chunks[0].sample_rate
    a = np.frombuffer(b''.join(c.audio_int16_bytes for c in chunks), np.int16)
    ph, tt = [], 0.0
    for c in chunks:
        for al in (c.phoneme_alignments or []):
            d = al.num_samples / sr; s = al.phoneme
            if s in ('ˈ', 'ˌ', 'ː', '̃') and ph: ph[-1]['t1'] += d
            else: ph.append({'ph': s, 't0': tt, 't1': tt + d, 'open': OPEN.get(s, 0 if s in ' ^$_,.!?' else 1)})
            tt += d
    a, ph = compress_silences(a, ph, sr)
    y = shape(a, sr, f0t, spread, fm, '?' in texte, '!' in texte)
    if sr != SR:
        import scipy.signal as ss; y = ss.resample_poly(y.astype(np.float64), SR, sr).astype(np.int16); ph = [dict(p) for p in ph]
    meter = pyln.Meter(SR); yf = y.astype(np.float64) / 32768
    probe = np.tile(yf, int(np.ceil(0.8 * SR / max(1, len(yf)))) + 1) if len(yf) < 0.8 * SR else yf  # réplique très courte : mesurée répétée
    lo = meter.integrated_loudness(probe); yf = yf * (10 ** ((-16.0 - lo) / 20))
    y = (np.clip(yf, -1, 1) * 32767).astype(np.int16)
    # silences de tête et de queue retirés (le rythme est posé par le montage)
    e = np.abs(y.astype(np.float32)); thr = 0.02 * 32767
    i0 = max(0, int(np.argmax(e > thr)) - int(0.03 * SR)); i1 = min(len(y), len(y) - int(np.argmax(e[::-1] > thr)) + int(0.06 * SR))
    off = i0 / SR; y = y[i0:i1]
    ph = [dict(p, t0=max(0, p['t0'] - off), t1=max(0, p['t1'] - off)) for p in ph if p['t1'] - off > 0]
    return y, ph

def main():
    H = json.load(open('histoire.json'))
    os.makedirs('voix', exist_ok=True)
    TURN, PRE_CHUTE, CARD, LEAD, TAIL = 0.26, 0.31, 1.0, 0.5, 1.4
    t = LEAD; lines = []; cards = []
    for si, S in enumerate(H['sketchs']):
        if si > 0: cards.append({'t0': t, 't1': t + CARD, 'apres': S['id']}); t += CARD + 0.25
        S['t0'] = t
        for li, L in enumerate(S['repliques']):
            y, ph = synth(L['qui'], L['texte'])
            nsyl = len(SYL.findall(L['texte'])); rate = nsyl / (len(y) / SR)
            if abs(rate / DEBIT[L['qui']] - 1) > 0.08 and not (L.get('chute') and rate > DEBIT[L['qui']]):  # la vitesse suit le débit de la chaîne ; une chute n'est jamais accélérée (dite calmement, et comprise : Whisper)
                ls = max(0.55, min(1.3, CAST[L['qui']][4] * rate / DEBIT[L['qui']]))
                y, ph = synth(L['qui'], L['texte'], ls); rate = nsyl / (len(y) / SR)
            L = dict(L, debit=round(rate, 2))
            f = f'voix/{S["id"]}-{li}.wav'
            with wave.open(f, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())
            if L.get('chute'): t += PRE_CHUTE
            # enveloppe d'énergie à 100 Hz (bouche)
            hop = SR // 100; env = [float(np.sqrt(np.mean((y[k:k + hop].astype(np.float32) / 32768) ** 2))) for k in range(0, len(y), hop)]
            mx = max(env) or 1; env = [round(min(1, e / mx), 3) for e in env]
            lines.append(dict(L, sketch=S['id'], wav=f, t0=round(t, 3), dur=round(len(y) / SR, 3), phonemes=ph, env=env))
            t += len(y) / SR + TURN
        S['t1'] = t
    total = t + TAIL
    mix = np.zeros(int(total * SR) + 1, np.float32)
    for L in lines:
        with wave.open(L['wav']) as w: y = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        i = int(L['t0'] * SR); mix[i:i + len(y)] += y
    mix = np.clip(mix, -1, 1)
    with wave.open('voix/mix.wav', 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
    json.dump({'total': round(total, 3), 'sketchs': [{k: S[k] for k in ('id', 'titre', 'lieu', 'image', 'acteurs', 't0', 't1')} for S in H['sketchs']], 'cartes': cards, 'lines': lines},
              open('timeline.json', 'w'), ensure_ascii=False)
    print(f'{len(lines)} répliques, durée {total:.1f} s')

if __name__ == '__main__':
    main()
