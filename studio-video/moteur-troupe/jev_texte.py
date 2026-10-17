# ÉCRITURES ET HUMOUR JUGÉS PAR JEV (17/10/2026). Consigne : « le ton de l'humour, la musique, les effets, les écritures,
# tout doit être soumis à JEV » ; « aucune tolérance ». Trois niveaux :
#   1. le TEXTE de chaque sketch (répliques, personnages, jeu) : drôle, chute, français ivoirien naturel, clair, cohérent,
#      pas méchant, sans faute ;
#   2. les SOUS-TITRES tels qu'affichés (image complète au milieu de chaque réplique) : lisibles, mots de la réplique dite ;
#   3. les CARTES DE TITRE (image au milieu de chaque carte) : titre lisible et bien écrit.
# Décision de JEV (Noul) sur chaque question, sans marge : conforme > 0,5, défaut < 0,5.
#   python3 jev_texte.py film.mp4 timeline.json histoire.json sortie.json
import json, subprocess, sys, uuid
from concurrent.futures import ThreadPoolExecutor
import numpy as np, cv2
import jev_api

QS = {'drole': (True, 'Read `sketch`. Is this comedy sketch genuinely funny for an Ivorian audience on TikTok: a clear comic idea and a surprising twist?'),
      'chute': (True, 'Read `sketch`. Does the last line land as a real punchline that resolves the joke with a surprise?'),
      'ivoirien': (True, 'Read `sketch`. Do the lines sound like natural spoken Ivorian French (everyday Abidjan expressions where they fit), not like translated textbook French?'),
      'clair': (True, 'Read `sketch`. Can a viewer follow the situation and the joke from the dialogue alone?'),
      'coherent': (True, 'Read `sketch`. Are the lines logically connected, with each character consistent with their role in the scene?'),
      'mechant': (False, 'Read `sketch`. Is any line hurtful, insulting toward a group of people, or in bad taste?'),
      'faute': (False, 'Read `sketch`. Is there a spelling or grammar mistake in the lines (intentional Ivorian expressions are not mistakes)?')}
QST = {'lisible': (True, '`image` is a frame of a vertical TikTok video with burned-in captions under the picture. Are the caption words fully legible '
                   '(high contrast, not cut off, not overlapping each other)?'),
       'conforme': (True, '`image` is a frame of a video with burned-in captions; `replique` is the line being spoken at that moment. Are the '
                    'caption words shown a correct part of `replique` (same words, same spelling, possibly in capitals)?'),
       'visage': (False, 'In `image`, does the caption text cover a character\'s face or mouth?')}
QT = {'titre_lisible': (True, '`image` shows a title card over a scene of an animated comedy. Is the title clearly legible and correctly written?'),
      'titre_accroche': (True, '`image` shows a title card over a scene of an animated comedy. Does the title make you want to watch the sketch (catchy, funny)?')}


def image(mp4, t):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', mp4, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True).stdout
    return cv2.imdecode(np.frombuffer(r, np.uint8), 1)


def juge(etat, Q, images=None, outil='jev_texte'):
    ids, assets = {}, {}
    for c, im in (images or {}).items():
        ids[c] = f'{c}-{uuid.uuid4().hex[:8]}'; assets[ids[c]] = {'type': 'image', 'format': 'jpg', 'data_base64': jev_api.b64(im)}
    a = jev_api.demande({**etat, **ids}, {k: {'type': 'noul', 'instructions': t} for k, (_, t) in Q.items()}, assets or None, outil=outil)
    return {k: round(float(a[k]['noul']), 3) for k in Q}


def decide(r, Q):
    return sorted(k for k, (att, _) in Q.items() if (r[k] <= 0.5 if att else r[k] >= 0.5))


if __name__ == '__main__':
    MP4, TL, HI, OUT = sys.argv[1:5]
    T = json.load(open(TL)); H = json.load(open(HI))
    titres = {s['id']: s.get('titre', s['id']) for s in H.get('sketchs', [])}
    sketchs = sorted({L['sketch'] for L in T['lines']}, key=lambda s: min(L['t0'] for L in T['lines'] if L['sketch'] == s))
    def texte(sid):
        L_ = [L for L in T['lines'] if L['sketch'] == sid]
        etat = {'sketch': {'titre': titres.get(sid, sid), 'repliques': [{'personnage': L['qui'].title(), 'texte': L['texte'], 'jeu': L.get('jeu', '')} for L in L_]}}
        r = juge(etat, QS, outil='jev_texte_sketch'); return {'sketch': sid, **r, 'defauts': decide(r, QS)}
    def st(L):
        t = L['t0'] + 0.5 * L['dur']; r = juge({'replique': L['texte']}, QST, {'image': image(MP4, t)}, outil='jev_texte_soustitres')
        return {'qui': L['qui'], 'texte': L['texte'][:40], 't': round(t, 2), **r, 'defauts': decide(r, QST)}
    def carte(c):
        t = 0.5 * (c['t0'] + c['t1']); r = juge({}, QT, {'image': image(MP4, t)}, outil='jev_texte_titres')
        return {'apres': c.get('apres'), 't': round(t, 2), **r, 'defauts': decide(r, QT)}
    with ThreadPoolExecutor(8) as ex:
        R1 = list(ex.map(texte, sketchs)); R2 = list(ex.map(st, T['lines'])); R3 = list(ex.map(carte, T.get('cartes', [])))
    synth = {'sketchs_fautifs': {r['sketch']: r['defauts'] for r in R1 if r['defauts']},
             'sous_titres_fautifs': [f"{r['t']} s {r['qui']} « {r['texte']} » {r['defauts']}" for r in R2 if r['defauts']],
             'titres_fautifs': [f"{r['t']} s {r['apres']} {r['defauts']}" for r in R3 if r['defauts']]}
    synth['ok'] = not (synth['sketchs_fautifs'] or synth['sous_titres_fautifs'] or synth['titres_fautifs'])
    json.dump({'synthese': synth, 'sketchs': R1, 'sous_titres': R2, 'titres': R3}, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print('jev_texte', 'OK' if synth['ok'] else 'À REPRENDRE', json.dumps(synth, ensure_ascii=False)[:1500])
