# RETOUCHE DE LA TROUPE EN DESSIN ANIMÉ (19/10/2026). Consignes : « je préfère les dessins animés de la troupe » ; « une seconde
# passe sur le visage seul, en plus grande taille, avec l'âge renforcé » ; « les personnages qui se regardent, la taille des
# têtes par rapport au corps ». La scène dessinée d'un lieu est corrigée À LA SOURCE, dans son propre style, puis le moteur la
# prépare et la joue comme d'habitude :
#  1. controle_troupe dit ce qui ne va pas (âge lu sur le visage ou la silhouette, proportions, regard) ;
#  2. la consigne d'édition est écrite à partir de ces échecs et des cartes adn.py (âge de chaque personnage), personnage par
#     personnage, placé par sa position ; FLUX.2 [klein] 4B (Apache-2.0) l'exécute sur notre processeur (vie_reelle.photo) ;
#  3. seuls les personnages corrigés sont repris de l'image éditée (rectangle élargi vers le haut, bord fondu) : le décor
#     reste le dessin d'origine au pixel près, net ;
#  4. seconde passe VISAGE pour chaque visage encore lu trop jeune : recadrage serré agrandi, âge renforcé, recollé fondu ;
#  5. le contrôle est refait ; on recommence avec une autre graine tant qu'il échoue (ESSAIS) ; la scène retenue est
#     préparée (scène, squelettes, expressions reprises du lieu dessiné) dans prep/<lieu>-v2.
#   python3 retouche_troupe.py <dossier prep> <lieu> [<lieu> …]
import json, os, shutil, subprocess, sys, time
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import controle_troupe as CT, vie_reelle as V
ESSAIS = int(os.environ.get('RETOUCHE_ESSAIS', 3)); GRAINES = (1871, 7, 4242, 99)
STYLE = ('Edit this 3D animated cartoon picture. Keep exactly the same 3D animated cartoon style (Pixar-like), the same place, '
         'framing and lighting, the same characters at the same places in the same poses, with the same clothes, colors, hair '
         'and headscarves. Change only this: ')


def _ou(a, A, W):
    cx = (a['bbox'][0] + a['bbox'][2]) / 2 / W; xs = sorted((b['bbox'][0] + b['bbox'][2]) / 2 for b in A)
    if len(A) >= 3: return f"the {['first', 'second', 'third', 'fourth'][xs.index((a['bbox'][0] + a['bbox'][2]) / 2)]} person from the left"
    return 'the person on the left' if cx < 0.5 else 'the person on the right'


def signes_age(age):
    """traits d'âge à dessiner, selon l'âge de la carte (19/10/2026, contrôle de la chambre : « subtle age lines » faisait passer
    Tantie Awa de « enfant » 0,86 à 0,46 sans atteindre la cinquantaine, 0,01) — des marques nommées, visibles en dessin 3D."""
    if age is None or age < 30: return 'a mature adult face'
    if age < 45: return 'an adult face in the thirties: defined cheekbones and jaw, light lines at the corners of the eyes'
    if age < 60: return ('a middle-aged face in the fifties: visible wrinkles on the forehead and at the corners of the eyes, nasolabial folds '
                         'from the nose to the mouth, slightly heavier cheeks and jaw, a few grey hairs at the temples')
    return 'an elderly face: grey hair, deep wrinkles on the forehead and around the eyes and mouth, sagging cheeks'


def consigne(S, R, W, renfort=0):
    """consigne d'édition tirée des échecs du contrôle (renfort : 0, 1, 2 → formulation plus appuyée)."""
    import adn
    A = S['acteurs']; P = R['personnages']; parts = []
    for a in A:
        p = P[a['nom']]; carte = adn.ADN.get(a['nom'], ''); qui = carte.split(',')[1].strip() if ',' in carte else a['nom']
        lui = 'her' if CT.carte(a['nom'])[1] == 'f' else 'him'; il = 'she' if lui == 'her' else 'he'; son = 'her' if lui == 'her' else 'his'
        echecs = [e for e in R['echecs'] if e.startswith(a['nom'])]
        if not echecs: continue
        ou = _ou(a, A, W); bouts = []
        if any('lu' in e or 'têtes' in e for e in echecs) and (p['age_carte'] or 99) >= 18:
            fort = ['', ' clearly', ' unmistakably'][min(renfort, 2)]
            bouts.append(f"{ou} is{fort} {qui}, a grown-up adult, not a child: give {lui} adult body proportions (a smaller head "
                         f"relative to the body, a longer torso and longer limbs) and {signes_age(p['age_carte'])}, "
                         f"with smaller eyes relative to the face")
        if any('ne peut pas regarder' in e for e in echecs):
            # partenaires des deux côtés : visage de face, prêt à se tourner vers chacun ; sinon trois quarts vers le partenaire
            cx = (a['bbox'][0] + a['bbox'][2]) / 2; cotes = {np.sign((b['bbox'][0] + b['bbox'][2]) / 2 - cx) for b in A if b is not a}
            if len(cotes) > 1:
                bouts.append(f"{ou} turns {son} head to face the viewer, a front view with the chin slightly down, ready to look at "
                             f"the people on both sides of {lui} (not turned away to one side)")
            else:
                cible = next(b for b in A if b is not a)
                bouts.append(f"{ou} turns {son} head and eyes to look at {_ou(cible, A, W)} ({il} faces that person in three-quarter view, not the camera)")
        parts += bouts
    return STYLE + '; '.join(parts) + '. Everything else stays exactly identical.'


def colle(orig, edit, boites, plume=25):
    """reprend de l'image éditée seulement les rectangles des personnages corrigés (élargis : 25 % vers le haut, 10 % sur
    les côtés), bord fondu ; le reste est le dessin d'origine."""
    H, W = orig.shape[:2]; m = np.zeros((H, W), np.float32)
    for x0, y0, x1, y1 in boites:
        w, h = x1 - x0, y1 - y0
        m[max(0, int(y0 - 0.25 * h)):min(H, int(y1 + 0.03 * h)), max(0, int(x0 - 0.1 * w)):min(W, int(x1 + 0.1 * w))] = 1
    m = cv2.GaussianBlur(m, (0, 0), plume)[..., None]
    return (edit.astype(np.float32) * m + orig.astype(np.float32) * (1 - m)).astype(np.uint8)


def passe_visage(img_path, a, age_texte, genre, sortie, journal=print, graine=1871, age=None):
    """seconde passe sur le visage seul : carré serré autour du visage (×2,2) agrandi, âge renforcé, recollé en ellipse fondue."""
    im = cv2.imread(img_path); H, W = im.shape[:2]; x0, y0, x1, y1 = a['visage']['box']
    cx, cy, c = (x0 + x1) / 2, (y0 + y1) / 2 - 0.1 * (y1 - y0), 2.2 * max(x1 - x0, y1 - y0)
    X0, Y0 = int(max(0, cx - c / 2)), int(max(0, cy - c / 2)); X1, Y1 = int(min(W, cx + c / 2)), int(min(H, cy + c / 2))
    tmp = os.path.splitext(sortie)[0]; cv2.imwrite(tmp + '-visage.png', im[Y0:Y1, X0:X1])
    C = ('Edit this close-up of a 3D animated cartoon character (Pixar-like style). Keep exactly the same cartoon style, the same '
         'hair or headscarf, clothes, skin tone, head orientation, gaze direction and background. Make the face clearly that of '
         f"{age_texte}: mature adult facial proportions, smaller eyes relative to the face, {signes_age(age)}. "
         f"Not a child, not a teenager.")
    r = V.photo(tmp + '-visage.png', tmp + '-visage-age.png', largeur=448, pas=3, ref_largeur=448, consigne=C, graine=graine, journal=journal)
    f = cv2.imread(tmp + '-visage-age.png'); h, w = f.shape[:2]
    m = np.zeros((h, w), np.float32); cv2.ellipse(m, (w // 2, int(h * 0.52)), (int(w * 0.36), int(h * 0.42)), 0, 0, 360, 1, -1)
    m = cv2.GaussianBlur(m, (0, 0), max(4, w / 30))[..., None]
    im[Y0:Y1, X0:X1] = (f * m + im[Y0:Y1, X0:X1] * (1 - m)).astype(np.uint8); cv2.imwrite(sortie, im)
    for s in ('-visage.png', '-visage-age.png'): os.remove(tmp + s)
    return {'visage': a['nom'], 'secondes': r['secondes']}


def _prepare_scene(src_png, dst, noms):
    r = subprocess.run([sys.executable, f'{ICI}/prepare_scene.py', src_png, dst, ','.join(noms)], capture_output=True, text=True, cwd=ICI)
    if r.returncode: raise RuntimeError('prepare_scene en échec :\n' + (r.stderr or r.stdout)[-800:])


def retouche(prep, nom, journal=print):
    src, dst = os.path.join(prep, nom), os.path.join(prep, f'{nom}-v2'); os.makedirs(dst, exist_ok=True); t0 = time.time()
    S = json.load(open(f'{src}/scene.json')); orig = cv2.imread(f'{src}/image.png'); W = orig.shape[1]
    noms = [a['nom'] for a in sorted(S['acteurs'], key=lambda a: a['bbox'][0])]
    R0 = CT.controle_cache(src); journal(f"{nom} : contrôle de départ — {'conforme' if R0['conforme'] else '; '.join(R0['echecs'])}")
    J = {'lieu': nom, 'depart': R0['echecs'], 'essais': []}
    if R0['conforme']:
        J['retenu'] = 'dessin d’origine'; json.dump(J, open(f'{dst}/retouche.json', 'w'), ensure_ascii=False, indent=1); return J
    meilleur = None
    for k in range(ESSAIS):
        C = consigne(S, R0, W, renfort=k); e = {'graine': GRAINES[k], 'consigne': C}
        ed = f'{dst}/edit-{k}.png'
        if os.path.isfile(ed): e['edition'] = {'reprise': ed}   # édition déjà calculée (essai précédent) : reprise, pas recalculée
        else: e['edition'] = V.photo(f'{src}/image.png', ed, largeur=864, pas=3, ref_largeur=576, consigne=C, graine=GRAINES[k], journal=journal)
        corriges = [a for a in S['acteurs'] if any(x.startswith(a['nom']) for x in R0['echecs'])]
        cand = f'{dst}/candidat-{k}.png'; cv2.imwrite(cand, colle(orig, cv2.imread(ed), [a['bbox'] for a in corriges]))
        essai = f'{dst}/essai-{k}'; _prepare_scene(cand, essai, noms); R = CT.controle(essai)
        # seconde passe visage : chaque visage encore lu trop jeune
        for a in json.load(open(f'{essai}/scene.json'))['acteurs']:
            if any(x.startswith(f"{a['nom']} : visage lu") for x in R['echecs']) and (R['personnages'][a['nom']]['age_carte'] or 0) >= 18:
                import adn
                age_t = adn.ADN.get(a['nom'], ',').split(',')[1].strip()
                e.setdefault('visages', []).append(passe_visage(f'{essai}/image.png', a, age_t, CT.carte(a['nom'])[1], cand, journal, GRAINES[k], CT.carte(a['nom'])[0]))
                _prepare_scene(cand, essai, noms); R = CT.controle(essai)
        e['echecs'] = R['echecs']; J['essais'].append(e); journal(f"{nom} essai {k + 1} : {'conforme' if R['conforme'] else '; '.join(R['echecs'])}")
        if meilleur is None or len(R['echecs']) < len(meilleur[1]['echecs']): meilleur = (k, R)
        if R['conforme']: break
    k, R = meilleur; J['retenu'] = f'essai {k + 1}'; J['conforme'] = R['conforme']
    # la scène retenue devient le lieu v2 : préparation complète (squelettes, expressions reprises du lieu dessiné)
    for f in os.listdir(f'{dst}/essai-{k}'): shutil.move(f'{dst}/essai-{k}/{f}', f'{dst}/{f}')
    shutil.copy(f'{dst}/candidat-{k}.png', f'{dst}/source.png')
    for x in os.listdir(dst):
        if x.startswith(('essai-', 'candidat-', 'edit-')): shutil.rmtree(f'{dst}/{x}', ignore_errors=True) if os.path.isdir(f'{dst}/{x}') else os.remove(f'{dst}/{x}')
    for script, args in (('prepare_rig.py', [dst]), ('prepare_expressions.py', [dst])):
        r = subprocess.run([sys.executable, f'{ICI}/{script}', *args], capture_output=True, text=True, cwd=ICI, env=dict(os.environ, EXPRESSIONS_RECETTES_DE=src))
        if r.returncode: raise RuntimeError(f'{script} en échec :\n' + (r.stderr or r.stdout)[-800:])
    J['controle_final'] = CT.controle_cache(dst); J['secondes'] = round(time.time() - t0)
    json.dump(J, open(f'{dst}/retouche.json', 'w'), ensure_ascii=False, indent=1)
    journal(f"{nom} : {'CONFORME' if J['controle_final']['conforme'] else 'échecs : ' + '; '.join(J['controle_final']['echecs'])} en {J['secondes']} s")
    return J


if __name__ == '__main__':
    for n in sys.argv[2:]:
        print(json.dumps(retouche(sys.argv[1], n, journal=lambda m: print(time.strftime('%H:%M:%S'), m, flush=True)), ensure_ascii=False)[:2000], flush=True)
