# VOIX CLONÉES D'AFRIQUE DE L'OUEST (17/10/2026) — « choisir des voix africaines, Afrique de l'Ouest, ivoirien ».
# Qwen3-TTS 0.6B Base (Apache-2.0, Qwen, janvier 2026) clone une voix à partir de quelques secondes : chaque personnage
# reçoit la voix d'un locuteur du corpus OpenSLR 57 « African Accented French » (Apache-2.0 : Niger, Cameroun, Gabon,
# Tchad, Congo), donc l'ACCENT de la référence, pas celui d'un lecteur parisien. Mesuré le 17/10 : Whisper comprend la voix
# clonée de Modou à 92 % (erreur de mots 0,08) contre 60 % pour Piper + WORLD (0,40).
# Lancé par voix.py (VOIX_MOTEUR=qwen3) avec l'interpréteur qui porte torch (QWEN_PY), une fois pour toutes les répliques :
#   python3 -I voix_qwen.py travaux.json   ([{"id", "texte", "ref", "ref_texte", "sortie"}] → un .wav par réplique)
import json, os, sys, time
import torch, soundfile as sf
from qwen_tts import Qwen3TTSModel

MODELE = os.path.expanduser(os.environ.get('QWEN_TTS', '~/.cache/massamba-models/qwen3-tts/base-0.6b'))
torch.set_num_threads(int(os.environ.get('QWEN_THREADS', os.cpu_count() or 2)))
J = json.load(open(sys.argv[1], encoding='utf-8'))
t0 = time.time(); m = Qwen3TTSModel.from_pretrained(MODELE, device_map='cpu', dtype=torch.float32)
print(f'modèle chargé en {time.time() - t0:.0f} s', flush=True)
invites = {}   # une invite de clonage par voix de référence (calculée une fois)
for k, j in enumerate(J):
    if os.path.isfile(j['sortie']) and not os.environ.get('QWEN_REFAIT'): continue
    cle = (j['ref'], j.get('ref_texte'))
    if cle not in invites:
        invites[cle] = m.create_voice_clone_prompt(ref_audio=j['ref'], ref_text=j.get('ref_texte'), x_vector_only_mode=not j.get('ref_texte'))
    t1 = time.time()
    # PLAFOND DE DURÉE (17/10/2026) : sans plafond, une prise qui ne trouve pas sa fin tourne jusqu'à 2 048 jetons
    # (164 s de son, 17 min de calcul : « Ah bon ? Et les plumes… » bloquée 8 min). Plafond = débit lent du français
    # (7 caractères/s) + 1,5 s, à 12,5 jetons/s ; une prise qui touche le plafond est une fuite : nouvelle graine.
    plafond_s = max(3.0, 1.5 + len(j['texte']) / 7); essais = []
    for e in range(3):
        torch.manual_seed(int(j.get('graine', 7)) + 101 * e)   # même texte, même voix → même prise (reproductible)
        w, sr = m.generate_voice_clone(text=j['texte'], language='French', voice_clone_prompt=invites[cle],
                                       max_new_tokens=int(12.5 * plafond_s))
        essais.append(w[0])
        if len(w[0]) / sr < plafond_s - 0.25: break
        print(f"   {j['id']} : prise {e + 1} au plafond ({plafond_s:.1f} s), nouvelle graine", flush=True)
    w0 = min(essais, key=len)
    sf.write(j['sortie'], w0, sr)
    print(f"{k + 1}/{len(J)} {j['id']} : {len(w0) / sr:.1f} s en {time.time() - t1:.0f} s ({len(essais)} prise(s))", flush=True)
