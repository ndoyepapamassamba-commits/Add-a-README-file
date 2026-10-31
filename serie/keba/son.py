"""Le son : bruitages de dessin animé synthétisés, musique composée note à note, mixage.

- Bruitages : synthèse numpy/scipy (aucun fichier, aucune licence à vérifier), légèrement différents à chaque graine.
- Musique : partition générée selon les humeurs posées par le metteur en scène (calme, malice, suspense, silence,
  chaos, poursuite), avec des ponctuations (coup d'orchestre) aux chocs ; jouée par FluidSynth (LGPL, outil externe)
  avec la banque d'instruments FluidR3_GM (MIT). Dans le burlesque, la musique fait la moitié du rire : elle se tait
  juste avant la chute.
Greffes : numpy, scipy.signal (BSD), mido (MIT) pour écrire le MIDI.
"""
import math
import random
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy import signal

TAUX = 48000
BANQUE = Path("/usr/share/sounds/sf2/FluidR3_GM.sf2")


# --- bruitages ---------------------------------------------------------------------------------------------------

def _t(duree):
    return np.arange(int(duree * TAUX)) / TAUX


def _env(n, attaque=0.003, chute=8.0):
    t = np.arange(n) / TAUX
    a = np.clip(t / attaque, 0, 1)
    return a * np.exp(-t * chute)


def _bruit(alea, n):
    return alea.standard_normal(n)


def _passe_bande(x, bas, haut):
    b, a = signal.butter(2, [bas / (TAUX / 2), min(haut / (TAUX / 2), 0.99)], btype="band")
    return signal.lfilter(b, a, x)


def _passe_bas(x, f):
    b, a = signal.butter(2, f / (TAUX / 2))
    return signal.lfilter(b, a, x)


def _glisse(f0, f1, duree, vibrato=0.0):
    t = _t(duree)
    f = f0 * (f1 / f0) ** (t / duree) * (1 + vibrato * np.sin(2 * math.pi * 7 * t))
    return np.sin(2 * math.pi * np.cumsum(f) / TAUX)


def _clac(al):
    n = int(0.09 * TAUX)
    claque = _passe_bande(_bruit(al, n), 1200, 5000) * _env(n, 0.0005, 90)
    corps = np.sin(2 * math.pi * al.uniform(160, 210) * _t(0.09)) * _env(n, 0.001, 45)
    return claque * 0.8 + corps * 0.5


def _whoosh(al):
    d = al.uniform(0.32, 0.42)
    n = int(d * TAUX)
    t = _t(d)
    x = _bruit(al, n)
    forme = np.sin(math.pi * t / d) ** 2
    return _passe_bande(x, 400, 2600) * forme * 0.9


def _tink(al):
    d = 0.35
    t = _t(d)
    x = sum(np.sin(2 * math.pi * f * al.uniform(0.96, 1.04) * t) * amp
            for f, amp in ((2150, 1.0), (3380, 0.6), (5230, 0.35), (7020, 0.2)))
    return x * _env(len(t), 0.0005, 14) * 0.45


def _bonk(al):
    d = 0.22
    son_ = _glisse(al.uniform(380, 460), 110, d) * _env(int(d * TAUX), 0.001, 16)
    bois = np.sin(2 * math.pi * 820 * _t(d)) * _env(int(d * TAUX), 0.0005, 60)
    return son_ * 0.8 + bois * 0.4


def _boing(al):
    d = 0.7
    t = _t(d)
    f = al.uniform(190, 240) * (1 + 0.25 * t / d) * (1 + 0.18 * np.exp(-t * 3) * np.sin(2 * math.pi * 17 * t))
    return np.sin(2 * math.pi * np.cumsum(f) / TAUX) * _env(len(t), 0.002, 4.5) * 0.8


def _splash(al):
    d = 0.8
    n = int(d * TAUX)
    x = _passe_bas(_bruit(al, n), 3500) * _env(n, 0.004, 5.5)
    bulles = np.zeros(n)
    for _ in range(14):
        i = al.integers(int(0.05 * TAUX), n - int(0.06 * TAUX))
        m = int(0.05 * TAUX)
        bulles[i:i + m] += _glisse(al.uniform(500, 900), al.uniform(1200, 2200), 0.05) * _env(m, 0.001, 50) * 0.35
    return (x * 0.7 + bulles) * 0.9


def _glissade(al):
    return _glisse(al.uniform(1500, 1800), 280, 0.75, vibrato=0.02) * _env(int(0.75 * TAUX), 0.01, 1.2) * 0.6


def _montee(al):
    return _glisse(300, al.uniform(1400, 1700), 0.6, vibrato=0.02) * _env(int(0.6 * TAUX), 0.01, 0.8) * 0.6


def _fracas(al):
    d = 1.4
    t = _t(d)
    x = sum(np.sin(2 * math.pi * f * al.uniform(0.97, 1.03) * t) * a
            for f, a in ((131, 1.0), (287, 0.8), (461, 0.6), (692, 0.5), (1103, 0.35), (1579, 0.25)))
    tole = x * _env(len(t), 0.001, 3.2) * 0.35
    choc = _passe_bas(_bruit(al, len(t)), 2500) * _env(len(t), 0.0005, 18) * 0.6
    return tole + choc


def _kling(al):
    d = 0.6
    t = _t(d)
    x = np.sin(2 * math.pi * 1780 * t) + 0.6 * np.sin(2 * math.pi * 2670 * t) + 0.3 * np.sin(2 * math.pi * 4410 * t)
    return x * _env(len(t), 0.001, 6) * 0.35


def _toc(al):
    n = int(0.05 * TAUX)
    return _passe_bande(_bruit(al, n), 900, 2600) * _env(n, 0.0005, 120) * 1.6


def _bee(al):
    d = 0.85
    t = _t(d)
    f0 = al.uniform(330, 400)
    scie = signal.sawtooth(2 * math.pi * np.cumsum(f0 * (1 + 0.02 * np.sin(2 * math.pi * 5 * t))) / TAUX)
    trem = 0.55 + 0.45 * np.sin(2 * math.pi * al.uniform(19, 24) * t)
    x = _passe_bande(scie * trem, 600, 2400) + 0.5 * _passe_bande(scie * trem, 2600, 3400)
    return x * np.sin(math.pi * t / d) ** 0.6 * 0.5


def _pouf(al):
    n = int(0.3 * TAUX)
    return _passe_bas(_bruit(al, n), 700) * _env(n, 0.01, 9) * 1.2


def _etoiles(al):
    sortie = np.zeros(int(0.9 * TAUX))
    for k in range(4):
        f = al.choice([2093, 2349, 2637, 3136])
        m = int(0.25 * TAUX)
        i = int(k * 0.18 * TAUX)
        sortie[i:i + m] += np.sin(2 * math.pi * f * _t(0.25)) * _env(m, 0.001, 14) * 0.3
    return sortie


BRUITAGES = {"clac": _clac, "whoosh": _whoosh, "tink": _tink, "bonk": _bonk, "boing": _boing, "splash": _splash,
             "glissade": _glissade, "montee": _montee, "fracas": _fracas, "kling": _kling, "toc": _toc, "bee": _bee,
             "pouf": _pouf, "etoiles": _etoiles}


def bruitage(nom: str, graine: int = 0) -> np.ndarray:
    al = np.random.default_rng(_graine(nom, graine))          # pas de hash() : il change d'un processus à l'autre
    x = np.asarray(BRUITAGES[nom](al), dtype=np.float64)
    pic = np.abs(x).max()
    if pic > 0.95:
        x *= 0.95 / pic
    return x.astype(np.float32)


def _graine(nom, graine):
    return sum(ord(c) * (i + 1) for i, c in enumerate(nom)) * 1000 + int(graine)


# --- musique -----------------------------------------------------------------------------------------------------

COUP_ORCHESTRE = 55
MARIMBA, KALIMBA, BASSE, PIZZ = 12, 108, 32, 45
GAMME = [0, 2, 4, 7, 9]           # pentatonique majeure : joyeuse, sans fausse note
TONIQUE = 60
TEMPO = 116


@dataclass
class Note:
    debut: float
    duree: float
    hauteur: int
    force: int
    programme: int        # -1 = percussions (canal 10)


def _hauteur(degre, octave=0):
    o, d = divmod(degre, len(GAMME))
    return TONIQUE + 12 * (o + octave) + GAMME[d]


def composer(sections, coups, graine=0) -> list[Note]:
    al = random.Random(graine)
    temps = 60.0 / TEMPO
    notes = []
    motif = [al.choice(range(0, 8)) for _ in range(8)]
    for t0, t1, humeur in sections:
        if humeur == "silence":
            continue
        n_temps = int((t1 - t0) / temps)
        for i in range(n_temps):
            t = t0 + i * temps
            mesure, pos = divmod(i, 4)
            if humeur in ("calme", "malice", "chaos", "poursuite") and pos in (0, 2):
                notes.append(Note(t, temps * 0.9, _hauteur(motif[mesure % 8] % 5, -2), 70, BASSE))
            if humeur == "calme":
                notes.append(Note(t, temps * 0.5, 63 if pos % 2 else 62, 55, -1))
                if al.random() < 0.7:
                    d = motif[(i + mesure) % 8]
                    notes.append(Note(t, temps * 0.8, _hauteur(d), 72, MARIMBA))
                if pos == 3:
                    notes.append(Note(t + temps / 2, temps * 0.4, _hauteur(motif[i % 8] + 2, 1), 60, KALIMBA))
            elif humeur == "malice":
                notes.append(Note(t, temps * 0.3, _hauteur(motif[i % 8] % 5, -1), 64, PIZZ))
                notes.append(Note(t + temps / 2, temps * 0.25, 82, 40, -1))
            elif humeur == "suspense":
                if pos in (0, 2):
                    notes.append(Note(t, temps * 0.4, _hauteur(i % 5, -1) + (i // 4), 58, PIZZ))
            elif humeur in ("chaos", "poursuite"):
                for k in range(2 if humeur == "chaos" else 4):
                    sous = t + k * temps / (2 if humeur == "chaos" else 4)
                    notes.append(Note(sous, temps * 0.2, al.choice((62, 63, 64, 60, 61)), 80, -1))
                    notes.append(Note(sous, temps * 0.25, _hauteur(motif[(i + k) % 8] + k, 0), 78, MARIMBA))
                notes.append(Note(t, temps * 0.2, 82, 50, -1))
                if pos == 3:
                    notes.append(Note(t, temps * 0.3, al.choice((65, 66)), 90, -1))
    for t in coups:
        notes.append(Note(float(t), 0.6, 48, 110, COUP_ORCHESTRE))
        notes.append(Note(float(t), 0.6, 55, 105, COUP_ORCHESTRE))
    notes.sort(key=lambda n: n.debut)
    return notes


def jouer(notes, duree: float, chemin_wav: Path) -> Path:
    import mido
    chemin_wav = Path(chemin_wav)
    mid = mido.MidiFile(ticks_per_beat=480)
    piste = mid.tracks.append(mido.MidiTrack()) or mid.tracks[0]
    piste.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(TEMPO)))
    programmes = sorted({n.programme for n in notes if n.programme >= 0})
    canaux = {p: c for p, c in zip(programmes, [c for c in range(16) if c != 9])}
    for p, c in canaux.items():
        piste.append(mido.Message("program_change", program=p, channel=c, time=0))
    evenements = []
    for n in notes:
        c = 9 if n.programme < 0 else canaux[n.programme]
        evenements.append((n.debut, 1, mido.Message("note_on", note=n.hauteur, velocity=n.force, channel=c)))
        evenements.append((n.debut + n.duree, 0, mido.Message("note_off", note=n.hauteur, velocity=0, channel=c)))
    evenements.append((duree, 0, mido.MetaMessage("end_of_track")))
    evenements.sort(key=lambda e: (e[0], e[1]))
    ticks_par_s = 480 * TEMPO / 60.0
    precedent = 0
    for t, _, msg in evenements:
        tick = int(round(t * ticks_par_s))
        msg.time = max(0, tick - precedent)
        precedent = tick
        if msg.type == "end_of_track":
            piste.append(msg)
            break
        piste.append(msg)
    chemin_mid = chemin_wav.with_suffix(".mid")
    mid.save(chemin_mid)
    subprocess.run(["fluidsynth", "-ni", "-q", "-g", "0.7", "-r", str(TAUX), "-F", str(chemin_wav), str(BANQUE),
                    str(chemin_mid)], check=True, capture_output=True)
    return chemin_wav


def lire_wav(chemin) -> np.ndarray:
    with wave.open(str(chemin)) as w:
        n, canaux, largeur = w.getnframes(), w.getnchannels(), w.getsampwidth()
        brut = np.frombuffer(w.readframes(n), dtype={2: np.int16, 4: np.int32}[largeur])
    x = brut.reshape(-1, canaux).astype(np.float32) / (2 ** (8 * largeur - 1))
    return x if canaux == 2 else np.repeat(x, 2, axis=1)


def mixer(duree: float, evenements, musique=None, volume_musique=0.55, graine=0) -> np.ndarray:
    """evenements : [(t, nom_bruitage, volume[, panoramique -1..1])]. Rend un tableau stéréo float32."""
    n = int(round(duree * TAUX))
    piste = np.zeros((n, 2), dtype=np.float64)
    if musique is not None:
        m = musique[:n]
        piste[:len(m)] += m * volume_musique
    for k, ev in enumerate(evenements):
        t, nom, vol = ev[:3]
        pan = ev[3] if len(ev) > 3 else 0.0
        x = bruitage(nom, graine=graine * 1000 + k).astype(np.float64) * vol
        i = int(round(t * TAUX))
        if i >= n:
            continue
        x = x[: n - i]
        g, d = math.sqrt((1 - pan) / 2), math.sqrt((1 + pan) / 2)
        piste[i:i + len(x), 0] += x * g * math.sqrt(2)
        piste[i:i + len(x), 1] += x * d * math.sqrt(2)
    pic = np.abs(piste).max()
    if pic > 0.97:
        piste *= 0.97 / pic
    return piste.astype(np.float32)


def ecrire_wav(piste: np.ndarray, chemin) -> Path:
    chemin = Path(chemin)
    donnees = (np.clip(piste, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(chemin), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(TAUX)
        w.writeframes(donnees.tobytes())
    return chemin
