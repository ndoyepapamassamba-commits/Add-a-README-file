# PLAN DE TOURNAGE GÉNÉRATIF (20/10/2026). Consigne : « il y a un manque notoire de fluidité des gestes et de cohérence […] il
# faut changer complètement d'approche, prendre le temps de réfléchir et me créer des vidéos genre Veo 3 en termes de fluidité et
# de rendu […] générer des plaques, les images et les scènes adaptées et refaire tout proprement par des greffes mesurées ».
# Constat mesuré : les marionnettes changent de corps par POSES ENTIÈRES (47 changements de pose sur ep01 p5) ; un dessin ne
# contient pas le mouvement continu, il faut un modèle qui l'a APPRIS sur des millions de vidéos. Nouvelle chaîne :
#   1. mise en scène DÉTERMINISTE (ce que notre moteur fait bien, juge unique 9/9) : décor peint propre, personnages à leur
#      taille et à leur place, cadre, et la boîte exacte de chaque personnage → une image clé par plan (tourne_peint en 1056 × 864) ;
#   2. mouvement GÉNÉRATIF : InfiniteTalk (MeiGen-AI, Apache-2.0 code ET poids, base Wan2.1-I2V-14B Apache-2.0) anime l'image clé
#      d'après les voix — lèvres, tête, buste, mains, jusqu'à deux personnes ; la liaison voix ↔ personne se fait par un masque
#      par personne (wan/multitalk.py l. 592-601), que notre moteur connaît au pixel au lieu de le deviner. ATTENTION, lu dans le
#      code : `human_mask[x_min:x_max, y_min:y_max]` indexe d'abord les LIGNES — la « bbox » d'InfiniteTalk est donc
#      [haut, gauche, bas, droite] et non [gauche, haut, droite, bas] ;
#   3. caméra, montage, son, sous-titres, juge unique : INCHANGÉS. Le plan est généré caméra fixe, puis le trajet de caméra du
#      moteur (cameras.json) est rejoué en recadrant (assemble_generatif.py).
# Ce module fait l'étape 1 et prépare l'entrée de l'étape 2 : un dossier par plan (image clé, voix de chaque personne à la durée
# exacte du plan, entrée JSON d'InfiniteTalk, consigne de jeu) et plans.json (mesures de couverture).
#   python3 plan_generatif.py DOSSIER_VERSION_MARIONNETTES SORTIE   (dans le dossier de l'épisode : timeline.json, voix/)
import json, os, subprocess, sys, wave
import numpy as np
from scipy.signal import resample_poly

ICI = os.path.dirname(os.path.abspath(__file__)); MOTEUR = os.path.join(os.path.dirname(ICI), 'moteur-troupe')
sys.path.insert(0, MOTEUR)
# image clé 1056 × 864 : rapport 0,818 = case « 0.82 » d'InfiniteTalk (wan/utils/multitalk_utils.py l. 26, choix de la case la
# plus proche : wan/multitalk.py l. 446), ramenée à 704 × 576 SANS recadrage ; voix à 16 kHz (wav2vec d'InfiniteTalk)
FPS, KW, KH, SR = 30, 1056, 864, 16000
STYLE = ('Pixar-style 3D animated comedy, West African setting. Static camera. Smooth, natural, continuous body motion with '
         'expressive hand gestures and head movements; faces, outfits and proportions stay exactly as in the first frame; '
         'no morphing, no extra people, no text.')
JEU = {   # émotion de la réplique → consigne de jeu (anglais : langue d'entraînement des légendes de Wan)
    'soupcon': 'raises one eyebrow, suspicious, leans in', 'accuse': 'points a finger accusingly, scolding',
    'colere': 'angry, gesturing sharply with both hands', 'mecontent': 'annoyed, hands on hips', 'frustration': 'exasperated, throws hands up',
    'surprise': 'eyes wide, surprised, steps back', 'peur': 'scared, shrinking back', 'panique': 'panicking, waving hands',
    'choc': 'frozen in shock, eyes wide, hands to cheeks', 'haussement': 'shrugs with palms up', 'innocent': 'plays innocent, palms up, smiling',
    'frime': 'shows off proudly, adjusts his sunglasses, chin up', 'malice': 'mischievous grin', 'joie': 'happy, smiling broadly',
    'camera': 'turns to the viewer with a knowing look', 'emu': 'moved, hand on chest', 'rire': 'bursts out laughing, shoulders shaking'}


def lit_wav(f):
    with wave.open(f) as w:
        sr, n, c = w.getframerate(), w.getnframes(), w.getnchannels()
        y = np.frombuffer(w.readframes(n), np.int16).astype(np.float32) / 32768
    y = y.reshape(-1, c).mean(1) if c > 1 else y
    return resample_poly(y, SR, sr).astype(np.float32) if sr != SR else y


def ecrit_wav(f, y):
    with wave.open(f, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())


def dans_cadre(b, part=0.6):
    """part de la boîte b (x0, y0, x1, y1) dans l'image clé."""
    w, h = max(1e-6, b[2] - b[0]), max(1e-6, b[3] - b[1])
    return max(0.0, min(b[2], KW) - max(b[0], 0)) * max(0.0, min(b[3], KH) - max(b[1], 0)) / (w * h) >= part


def prepare(DM, OUT):
    T = json.load(open('timeline.json')); TG = json.load(open(f'{DM}/tournage.json')); SH = TG['decoupage']
    import marionnette as MV
    F = MV.bible(); H = {s['id']: s for s in json.load(open('histoire.json'))['sketchs']}
    cles = [min(int(round(s[0] * FPS)) + 1, int(s[1] * FPS) - 1) for s in SH]   # 1re image du plan (après la coupe)
    # 1. images clés en haute définition, même mise en scène (le découpage est déterministe), + trajet de caméra de chaque image
    env = dict(os.environ, TOURNE_CW=str(KW), TOURNE_CH=str(KH), TOURNE_IMAGES=','.join(map(str, cles)))
    subprocess.run([sys.executable, f'{MOTEUR}/tourne_peint.py', f'{OUT}/cles'], env=env, check=True)
    BX = json.load(open(f'{OUT}/cles/boites.json'))
    plans, parole_tot, parole_liee = [], 0.0, 0.0
    for i, (sh, f0) in enumerate(zip(SH, cles)):
        t0, t1, sid, kind, who = sh[:5]; n = int(round((t1 - t0) * SR)); b = BX[str(f0)]
        vus = [p for p in b if dans_cadre(b[p]['tete'])]
        voix = {p: np.zeros(n, np.float32) for p in b}; jeux = {p: [] for p in b}
        for L in T['lines']:
            if L['sketch'] != sid or L['t0'] >= t1 or L['t0'] + L['dur'] <= t0 or L['qui'] not in voix: continue
            y = lit_wav(L['wav']); a = int(round((L['t0'] - t0) * SR))
            s0, s1 = max(0, a), min(n, a + len(y)); voix[L['qui']][s0:s1] += y[s0 - a:s1 - a]
            sec = (s1 - s0) / SR; parole_tot += sec; parole_liee += sec if L['qui'] in vus else 0.0
            jeux[L['qui']].append(L.get('jeu', ''))
        parleurs = sorted([p for p in vus if np.abs(voix[p]).max() > 1e-3], key=lambda p: -float(np.abs(voix[p]).sum()))[:2]
        # au plus deux personnes animées par la voix (limite d'InfiniteTalk) : les parleurs d'abord, puis l'écouteur le plus grand
        anim = parleurs + sorted([p for p in vus if p not in parleurs], key=lambda p: -(b[p]['tete'][3] - b[p]['tete'][1]))[:2 - len(parleurs)]
        anim = sorted(anim, key=lambda p: b[p]['tete'][0])   # de gauche à droite
        d = f'{OUT}/plans/plan-{i:02d}'; os.makedirs(d, exist_ok=True)
        os.replace(f'{OUT}/cles/clip/f{f0:05d}.jpg', f'{d}/image.jpg')
        entree = {'prompt': '', 'cond_video': 'image.jpg', 'audio_type': 'para', 'cond_audio': {}}
        if len(anim) == 2: entree['bbox'] = {}
        desc = []
        for k, p in enumerate(anim, 1):
            ecrit_wav(f'{d}/p{k}.wav', voix[p]); entree['cond_audio'][f'person{k}'] = f'p{k}.wav'
            if len(anim) == 2:
                c = b[p].get('corps') or b[p]['tete']   # [x0, y0, x1, y1] → ordre d'InfiniteTalk [haut, gauche, bas, droite]
                entree['bbox'][f'person{k}'] = [round(max(0, c[1])), round(max(0, c[0])), round(min(KH, c[3])), round(min(KW, c[2]))]
            fi = F.get(p, {}); cote = ('on the left', 'on the right')[k - 1] if len(anim) == 2 else 'in the center'
            act = '; '.join(dict.fromkeys(JEU.get(j, '') for j in jeux[p] if JEU.get(j))) or ('listens and reacts with small nods' if p not in parleurs else 'talks expressively')
            desc.append(f"The character {cote} ({fi.get('apparence', p)}; {fi.get('tenue', '')}) {act}.")
        reac = (H.get(sid) or {}).get('reaction') or {}
        if not parleurs and reac.get('qui') in anim: desc.append(f"{JEU.get(reac.get('jeu', ''), '')}. {reac.get('note', '')}")
        lieu = (H.get(sid) or {}).get('mise_en_scene', '')
        entree['prompt'] = f"{STYLE} Scene: {lieu}. " + ' '.join(desc)
        json.dump(entree, open(f'{d}/entree.json', 'w'), ensure_ascii=False, indent=1)
        meta = {'plan': i, 't0': t0, 't1': t1, 'images': int(round((t1 - t0) * FPS)), 'image_cle': f0, 'sketch': sid, 'cadre': kind,
                'anime': anim, 'parleurs': parleurs, 'mode': 'dialogue' if parleurs else 'reaction', 'modele': 'multi' if len(anim) == 2 else 'single'}
        json.dump(meta, open(f'{d}/meta.json', 'w'), ensure_ascii=False, indent=1); plans.append(meta)
    os.replace(f'{OUT}/cles/cameras.json', f'{OUT}/cameras.json')
    R = {'plans': len(plans), 'secondes': round(sum(p['t1'] - p['t0'] for p in plans), 2),
         'dialogue': sum(p['mode'] == 'dialogue' for p in plans), 'reaction': sum(p['mode'] == 'reaction' for p in plans),
         'parole_liee_a_une_personne_visible': round(parole_liee / max(1e-6, parole_tot), 3), 'detail': plans}
    json.dump(R, open(f'{OUT}/plans.json', 'w'), ensure_ascii=False, indent=1)
    return R


if __name__ == '__main__':
    r = prepare(os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2]))
    print(json.dumps({k: v for k, v in r.items() if k != 'detail'}, ensure_ascii=False))
