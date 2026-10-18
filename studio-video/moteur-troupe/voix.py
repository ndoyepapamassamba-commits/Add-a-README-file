# VOIX DE LA TROUPE AU TON DE LA CHAÎNE (16/10/2026)
#  1. Piper (MIT) lit chaque réplique et donne la durée de chaque phonème (synchro labiale exacte) ;
#  2. WORLD (Morise et al. 2016, BSD modifiée ; liaison pyworld, MIT) décompose la voix (hauteur, enveloppe, apériodicité)
#     et la recompose avec la hauteur moyenne et l'ÉTENDUE mesurées sur les vidéos de l'utilisateur
#     (tone_reference.json : hommes 229 Hz, femmes 307 Hz, étendue relative ≈ 0,5 — Piper : 0,29 à 0,45), une montée
#     finale sur les questions, un appui sur les exclamations ; l'enveloppe est dilatée pour la voix d'enfant ;
#  3. sonie de chaque réplique ramenée à −16 LUFS (pyloudnorm, MIT) ; placement au rythme de la chaîne
#     (0,26 s entre deux répliques, 0,31 s de silence avant la chute) ; contrôle d'intelligibilité par Whisper (MIT).
#  4. (17/10) VOIX D'AFRIQUE DE L'OUEST — VOIX_MOTEUR=qwen3 : chaque personnage qui a une référence dans VOIX_REFS/refs.json
#     (extraits du corpus OpenSLR 57, Apache-2.0) est dit par Qwen3-TTS (Apache-2.0) qui clone cette voix et son accent
#     (voix_qwen.py, lancé une fois pour toutes les répliques) ; la hauteur n'est poussée qu'à mi-chemin du registre
#     dessin animé (moyenne géométrique), pour garder l'accent ; les formes de bouche viennent ensuite de levres.py.
import json, os, re, sys, wave, hashlib, subprocess
import numpy as np, pyworld as pw, pyloudnorm as pyln
from piper import PiperVoice, SynthesisConfig
P = os.environ.get('PIPER_VOICES', os.path.expanduser('~/.cache/massamba-models/piper/'))  # dossier des voix Piper (.onnx + .json)
SR = 22050
# personnage : (modèle, locuteur, hauteur visée Hz, facteur d'étendue, vitesse (length_scale), dilatation des formants)
CAST = {  # deux voix sources propres et libres : siwis (CC-BY 4.0) et gilles (CC0) ; chaque personnage = hauteur + étendue + timbre (WORLD)
  # (MLS écartée : charabia mesuré par Whisper même sans transformation ; tom : données AGPL ; upmc : CC-BY-SA)
  # HAUTEURS NATURELLES (17/10/2026) — « le son est encore très aigu » : mesuré dans la v27 (Coumba 343 Hz, Tantie 311,
  # Maman 296, Petit Mamadou 309, Modou 189, Koffi 163, Baye 161) ; conseil de JEV (moteur-iv/conseil_voix_v28.json) :
  # cause « cibles trop hautes » 0,91, remède « hauteurs naturelles, voix posée entièrement sur sa cible » 0,91.
  'MAMAN NOUNOU':  ('fr_FR-siwis-medium', None, 195, 1.35, 0.85, 1.00),
  'TANTIE AWA':    ('fr_FR-siwis-medium', None, 200, 1.45, 0.85, 0.93),
  'COUMBA':        ('fr_FR-siwis-medium', None, 215, 1.25, 0.85, 1.05),
  'PETIT MAMADOU': ('fr_FR-siwis-medium', None, 275, 1.30, 0.85, 1.16),
  'BAYE NDIAYE':   ('fr_FR-gilles-low', None, 115, 1.60, 0.85, 0.95),
  'MODOU':         ('fr_FR-gilles-low', None, 125, 1.60, 0.85, 1.00),
  'KOFFI':         ('fr_FR-gilles-low', None, 120, 1.40, 0.85, 1.04),
}
# débit visé (syllabes par seconde de parole) : chaîne 5,92 (hommes) / 4,71 (femmes), Ladjagaï 6,3–6,7 → un cran au-dessus de la chaîne
DEBIT = {'MAMAN NOUNOU': 5.4, 'TANTIE AWA': 5.4, 'COUMBA': 5.4, 'PETIT MAMADOU': 5.6, 'BAYE NDIAYE': 6.0, 'MODOU': 6.2, 'KOFFI': 6.2}
SYL = re.compile(r'[aeiouyéèêëàâîïôûœ]+', re.I)
MOTEUR = os.environ.get('VOIX_MOTEUR', 'piper')
REFS_DIR = os.path.expanduser(os.environ.get('VOIX_REFS', '~/.cache/massamba-models/voix-refs'))
REFS = json.load(open(f'{REFS_DIR}/refs.json', encoding='utf-8')) if MOTEUR == 'qwen3' and os.path.isfile(f'{REFS_DIR}/refs.json') else {}
QWEN_PY = os.environ.get('QWEN_PY', sys.executable)

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

def shape(x, sr, f0_target, spread, formant, question, exclam, tempo=1.0):
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
    y = pw.synthesize(f0n, sp, ap, sr, frame_period=5.0 / tempo)   # tempo > 1 : même voix, même hauteur, dite plus vite
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

def _finit(y, sr_in):
    """rééchantillonnage, sonie −16 LUFS, silences de tête et de queue retirés → (int16 à SR, décalage s)."""
    if sr_in != SR:
        import scipy.signal as ss; y = ss.resample_poly(y.astype(np.float64), SR, sr_in).astype(np.int16)
    meter = pyln.Meter(SR); yf = y.astype(np.float64) / 32768
    probe = np.tile(yf, int(np.ceil(0.8 * SR / max(1, len(yf)))) + 1) if len(yf) < 0.8 * SR else yf
    lo = meter.integrated_loudness(probe); yf = yf * (10 ** ((-16.0 - lo) / 20))
    y = (np.clip(yf, -1, 1) * 32767).astype(np.int16)
    e = np.abs(y.astype(np.float32)); thr = 0.02 * 32767
    i0 = max(0, int(np.argmax(e > thr)) - int(0.03 * SR)); i1 = min(len(y), len(y) - int(np.argmax(e[::-1] > thr)) + int(0.06 * SR))
    return y[i0:i1], i0 / SR


def texte_tts(t):
    """texte dit par le modèle : interjections étirées ramenées à leur forme courte (« Ehhh » se faisait épeler),
    ponctuation doublée simplifiée ; le sous-titre garde le texte écrit."""
    t = re.sub(r'([A-Za-zÀ-ÿ])\1{2,}', r'\1', t.replace('…', ','))
    return re.sub(r'([?!])[?!]+', r'\1', t)


def qwen_fichier(qui, texte, graine=7):
    r = REFS[qui]; h = hashlib.sha1((f"{r['wav']}|{r.get('texte')}|{texte}" + (f'|{graine}' if graine != 7 else '')).encode()).hexdigest()[:12]
    return f'voix/qwen/{h}.wav'


def _lance_qwen(J):
    os.makedirs('voix/qwen', exist_ok=True); json.dump(J, open('voix/qwen/travaux.json', 'w'), ensure_ascii=False)
    subprocess.run([QWEN_PY, '-I', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'voix_qwen.py'), 'voix/qwen/travaux.json'], check=True)


_ASR = None
def _wer(f, texte):
    """erreur de mots de Whisper small (MIT) sur une prise (chiffres en lettres, parler ivoirien exclu : mots.py)."""
    global _ASR
    if _ASR is None:
        from faster_whisper import WhisperModel
        _ASR = WhisperModel('small', device='cpu', compute_type='int8', download_root=os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/whisper')
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import mots
    seg, _ = _ASR.transcribe(f, language='fr', beam_size=5)
    return mots.erreur_mots(texte, ' '.join(x.text for x in seg))


PRISES = {}   # (qui, texte) → fichier de la meilleure prise
def qwen_lot(H, graines=(7, 8, 9), seuil=0.34):
    """toutes les répliques des personnages qui ont une voix de référence, en un seul passage du modèle ; chaque prise est
    réécoutée par Whisper, et une réplique mal comprise est refaite avec une autre graine (la meilleure prise est gardée)."""
    reste = [(L['qui'], L['texte'], f"{S['id']}-{li}") for S in H['sketchs'] for li, L in enumerate(S['repliques']) if L['qui'] in REFS]
    best = {}
    for g in graines:
        if not reste: break
        _lance_qwen([{'id': i, 'texte': texte_tts(t), 'ref': f"{REFS_DIR}/{REFS[q]['wav']}", 'ref_texte': REFS[q].get('texte'),
                      'graine': g, 'sortie': qwen_fichier(q, t, g)} for q, t, i in reste])
        suivant = []
        for q, t, i in reste:
            f = qwen_fichier(q, t, g); e = _wer(f, t)
            if (q, t) not in best or e < best[(q, t)][1]: best[(q, t)] = (f, e)
            if e > seuil: suivant.append((q, t, i))
            print(f'  voix clonée {i} (graine {g}) : erreur de mots {e:.2f}', flush=True)
        reste = suivant
    PRISES.update({k: v[0] for k, v in best.items()})
    json.dump({f'{q} | {t}': {'fichier': f, 'erreur_mots': round(e, 3)} for (q, t), (f, e) in best.items()},
              open('voix/qwen/prises.json', 'w'), ensure_ascii=False, indent=1)


def synth_qwen(qui, texte, chute=False):
    with wave.open(PRISES.get((qui, texte)) or qwen_fichier(qui, texte)) as w: sr = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), np.int16)
    _, _, f0t, spread, _, fm = CAST[qui]
    f0, _ = pw.harvest(a.astype(np.float64) / 32768, sr, f0_floor=60, f0_ceil=600, frame_period=10.0); v = f0[f0 > 0]
    cible = f0t   # remède désigné par JEV (17/10) : la voix est posée ENTIÈREMENT sur sa hauteur naturelle (plus de mi-chemin)
    # débit de la chaîne (DEBIT) : la voix clonée garde le débit de sa référence ; on l'accélère jusqu'à ×1,3 au plus, jamais
    # sur une chute (dite calmement, et comprise)
    debit = len(SYL.findall(texte)) / max(0.3, len(a) / sr * 0.82)   # ≈ part parlée de la prise (silences de bord retirés ensuite)
    tempo = 1.0 if chute else float(np.clip(DEBIT[qui] / max(1e-3, debit), 1.0, 1.3))
    y = shape(a, sr, cible, 1.0, 1.0, '?' in texte, '!' in texte, tempo)   # étendue 1,0 : l'intonation propre de la voix est gardée (JEV)
    y, _ = _finit(y, sr)
    return y, []   # formes de bouche : levres.py (Rhubarb) lit l'audio ensuite


def main():
    H = json.load(open('histoire.json'))
    os.makedirs('voix', exist_ok=True)
    if REFS: qwen_lot(H)
    TURN, PRE_CHUTE, CARD, LEAD, TAIL = 0.26, 0.31, 1.0, 0.3, 1.4
    PRE = float(os.environ.get('VOIX_PRE', 0.8))   # avant le 1er mot d'un sketch : la caméra finit de pousser du large vers celui qui
                                                  # parle (tourne.py, ouverture 1,2 s) ; sinon la 1re réplique est dite visage minuscule (v24)
    REACTION, REACTION_TAG = float(os.environ.get('VOIX_REACTION', 2.0)), 0.9   # tenue après une chute finale / après la réplique qui suit la chute (compilation de blagues : 0,8 s)
    t = LEAD; lines = []; cards = []
    for si, S in enumerate(H['sketchs']):
        if si > 0: cards.append({'t0': t, 't1': t + CARD, 'apres': S['id']}); t += CARD + 0.25
        S['t0'] = t
        for li, L in enumerate(S['repliques']):
            clone = L['qui'] in REFS
            y, ph = synth_qwen(L['qui'], L['texte'], bool(L.get('chute'))) if clone else synth(L['qui'], L['texte'])
            nsyl = len(SYL.findall(L['texte'])); rate = nsyl / (len(y) / SR)
            if not clone and abs(rate / DEBIT[L['qui']] - 1) > 0.08 and not (L.get('chute') and rate > DEBIT[L['qui']]):  # la vitesse suit le débit de la chaîne ; une chute n'est jamais accélérée (dite calmement, et comprise : Whisper)
                ls = max(0.55, min(1.3, CAST[L['qui']][4] * rate / DEBIT[L['qui']]))
                y, ph = synth(L['qui'], L['texte'], ls); rate = nsyl / (len(y) / SR)
            L = dict(L, debit=round(rate, 2), moteur='qwen3' if clone else 'piper')
            f = f'voix/{S["id"]}-{li}.wav'
            with wave.open(f, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes())
            if L.get('chute'): t += PRE_CHUTE
            if li == 0: t += PRE
            # enveloppe d'énergie à 100 Hz (bouche)
            hop = SR // 100; env = [float(np.sqrt(np.mean((y[k:k + hop].astype(np.float32) / 32768) ** 2))) for k in range(0, len(y), hop)]
            mx = max(env) or 1; env = [round(min(1, e / mx), 3) for e in env]
            lines.append(dict(L, sketch=S['id'], wav=f, t0=round(t, 3), dur=round(len(y) / SR, 3), phonemes=ph, env=env))
            t += len(y) / SR + TURN
        # RÉACTION TENUE après la chute (Afrikatoon : gros plan immobile 2,2–3,4 s ; récapitulatif comique, règle 5) : le plan
        # de réaction existe vraiment (sinon il fait moins de 0,5 s et le montage le fond dans le plan précédent)
        t += REACTION if S['repliques'][-1].get('chute') else REACTION_TAG
        S['t1'] = t
    # TIMBRE (18/10/2026, « la sortie son trop aiguë ») : chaque personnage égalisé sur la courbe spectrale des voix des TikTok
    # de son registre (timbre.py ; 12 à 15 dB de souffle en trop vers 8–10 kHz), puis l'enveloppe de la bouche recalculée
    if os.environ.get('VOIX_TIMBRE', '1') == '1':
        import timbre
        par = {}
        for k, L in enumerate(lines): par.setdefault(L['qui'], []).append(k)
        for q, ks in par.items():
            ys = [timbre.lire(lines[k]['wav'])[0] for k in ks]
            zs, _ = timbre.applique(ys, timbre.registre(CAST[q][2]), SR)
            for k, z in zip(ks, zs):
                timbre.ecrire(lines[k]['wav'], z, SR); y = (np.clip(z, -1, 1) * 32767).astype(np.int16)
                hop = SR // 100; env = [float(np.sqrt(np.mean((y[j:j + hop].astype(np.float32) / 32768) ** 2))) for j in range(0, len(y), hop)]
                mx = max(env) or 1; lines[k]['env'] = [round(min(1, e / mx), 3) for e in env]
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
