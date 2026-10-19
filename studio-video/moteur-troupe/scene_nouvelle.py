# SCÈNE NOUVELLE EN UNE COMMANDE (19/10/2026, « une solution globale ») : décor vide + personnages de la troupe → scène prête à
# tourner dans prep/<nom>, sans geste manuel :
#   1. compositeur.py : figures posées à l'échelle, lumière et ombres du décor (physique.ombre), découpes exactes ;
#   2. prepare_scene.py : squelettes MediaPipe et visages, comme pour une scène peinte ;
#   3. masques et plaques remplacés par les découpes EXACTES du compositeur et le décor exact (aucune reconstitution LaMa,
#      aucun reste de personne : le chignon oublié par la segmentation du 19/10 n'existe plus) ;
#   4. prepare_rig.py (mode exact : exacte.json), puis les bibliothèques de visages (prepare_expressions.py, à part : long).
# python3 scene_nouvelle.py BIBLIO NOM PLAQUE PX_PAR_M SOL_Y [--lumiere L.json] [--ref image.png masque.png …]
#                           [--copie-de prep/<lieu>] "NOM|figure.png|taille_m|x_frac" …
import json, os, shutil, subprocess, sys, time
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import compositeur

COPIES = ('lumiere.json', 'genese.json', 'linge.npz', 'vie.json')   # ne dépendent que du décor (même plaque) : repris du lieu d'origine


def prepare(biblio, nom, plaque_p, ppm, sol_y, acteurs, L=None, ref=None, copie_de=None, journal=print):
    t0 = time.time(); B = os.path.abspath(biblio); os.makedirs(f'{B}/scenes', exist_ok=True)
    acteurs = sorted(acteurs, key=lambda z: z[3])
    plaque = cv2.cvtColor(cv2.imread(plaque_p), cv2.COLOR_BGR2RGB)
    img, places, fond = compositeur.compose(plaque, acteurs, ppm, sol_y, ref, L)
    sc = f'{B}/scenes/{nom}.png'; cv2.imwrite(sc, cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
    alphas = [p_.pop('_alpha') for p_ in places]
    d = f'{B}/prep/{nom}'
    # SCÈNE RECOMPOSÉE (19/10/2026) : les visages déjà dessinés (expressions/, ≈ 25 min par personnage) d'un acteur resté
    # identique au pixel près sont gardés ; ceux d'un acteur changé (miroir, place, taille) sont refaits
    ancien = cv2.cvtColor(cv2.imread(f'{d}/image.png'), cv2.COLOR_BGR2RGB) if os.path.isfile(f'{d}/image.png') else None
    garde = f'{B}/prep/.{nom}-expressions'; shutil.rmtree(garde, ignore_errors=True)
    if ancien is not None and os.path.isdir(f'{d}/expressions'): shutil.move(f'{d}/expressions', garde)
    shutil.rmtree(d, ignore_errors=True)
    r = subprocess.run([sys.executable, f'{ICI}/prepare_scene.py', f'scenes/{nom}.png', f'prep/{nom}', ','.join(a[0] for a in acteurs)],
                       cwd=B, capture_output=True, text=True)
    if r.returncode: raise RuntimeError('prepare_scene : ' + (r.stderr or r.stdout)[-800:])
    S = json.load(open(f'{d}/scene.json')); H, W = img.shape[:2]
    if [a['nom'] for a in S['acteurs']] != [a[0] for a in acteurs]:
        raise RuntimeError(f"ordre des acteurs différent : {[a['nom'] for a in S['acteurs']]}")
    exacte = {'plaque': 'plaque-pleine.png', 'alphas': {}}; union = np.zeros((H, W), np.uint8)
    for a, al in zip(S['acteurs'], alphas):
        f = f"exacte-{a['slug']}.png"; cv2.imwrite(f'{d}/{f}', np.clip(al * 65535, 0, 65535).astype(np.uint16)); exacte['alphas'][a['slug']] = f
        m = (al > 0.5).astype(np.uint8); cv2.imwrite(f"{d}/{a['slug']}-masque.png", m * 255)
        ys, xs = np.nonzero(m); a['bbox'] = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
        up = (al > 0.02).astype(np.uint8); up[int(a['bassin_y']) + 6:] = 0; union |= cv2.dilate(up, np.ones((17, 17), np.uint8))
    pl = img.copy(); pl[union > 0] = fond[union > 0]   # haut du corps retiré, jambes gardées (comme prepare_scene), décor EXACT dessous
    cv2.imwrite(f'{d}/plaque.png', cv2.cvtColor(pl, cv2.COLOR_RGB2BGR)); cv2.imwrite(f'{d}/plaque-pleine.png', cv2.cvtColor(fond, cv2.COLOR_RGB2BGR))
    S['compose'] = {'plaque': os.path.abspath(plaque_p), 'px_par_m': ppm, 'sol_y': sol_y, 'acteurs': places}
    json.dump(S, open(f'{d}/scene.json', 'w'), ensure_ascii=False, indent=1); json.dump(exacte, open(f'{d}/exacte.json', 'w'), indent=1)
    if os.path.isdir(garde):
        for a, p_ in zip(S['acteurs'], places):
            X0, Y0, X1, Y1 = p_['bbox']
            if os.path.isdir(f"{garde}/{a['slug']}") and ancien.shape == img.shape and np.array_equal(ancien[Y0:Y1, X0:X1], img[Y0:Y1, X0:X1]):
                os.makedirs(f'{d}/expressions', exist_ok=True); shutil.move(f"{garde}/{a['slug']}", f"{d}/expressions/{a['slug']}")
                journal(f"{a['nom']} : acteur inchangé, visages déjà dessinés gardés")
        shutil.rmtree(garde, ignore_errors=True)
    if copie_de:
        for f in COPIES:
            if os.path.isfile(f'{copie_de}/{f}'): shutil.copy(f'{copie_de}/{f}', f'{d}/{f}')
    journal(f'{nom} : composée et préparée en {time.time() - t0:.0f} s — {", ".join(a[0] for a in acteurs)}')
    import prepare_rig
    t1 = time.time(); prepare_rig.prepare(d, jev=os.environ.get('JEV_AUTORISE') == '1'); journal(f'{nom} : squelettes en {time.time() - t1:.0f} s')
    return d


if __name__ == '__main__':
    args = sys.argv[1:]; ref = L = copie = None
    if '--lumiere' in args:
        i = args.index('--lumiere'); L = json.load(open(args[i + 1])); args = args[:i] + args[i + 2:]
    if '--copie-de' in args:
        i = args.index('--copie-de'); copie = os.path.abspath(args[i + 1]); args = args[:i] + args[i + 2:]
    if '--ref' in args:
        i = args.index('--ref'); j = i + 1
        while j < len(args) and args[j].endswith('.png') and '|' not in args[j]: j += 1
        im = cv2.cvtColor(cv2.imread(args[i + 1]), cv2.COLOR_BGR2RGB)
        ref = np.concatenate([im[cv2.imread(m, 0) > 127] for m in args[i + 2:j]]) if j > i + 2 else None
        args = args[:i] + args[j:]
    biblio, nom, plaque_p, ppm, sol_y = args[0], args[1], args[2], float(args[3]), float(args[4])
    acteurs = []
    for s in args[5:]:
        n, png, t, xf = s.split('|'); acteurs.append((n, cv2.cvtColor(cv2.imread(png, cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA), float(t), float(xf)))
    print(prepare(biblio, nom, plaque_p, ppm, sol_y, acteurs, L, ref, copie))
