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

GARDE_MAX, GARDE_MOY = 12, 1.0
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
    # le même sont gardés ; ceux d'un acteur changé (miroir, place, taille) sont refaits. « Le même » : écart au plus
    # GARDE_MAX niveaux et en moyenne moins de GARDE_MOY sur sa boîte (mesuré : Maître Koné recomposé, même figure et mêmes
    # réglages → au plus 9 niveaux, 0,35 en moyenne ; cause pas encore isolée : calcul de l'agrandissement ou version du code ;
    # charge() recale de toute façon la couleur du visage sur le dessin de la scène)
    ancien = cv2.cvtColor(cv2.imread(f'{d}/image.png'), cv2.COLOR_BGR2RGB) if os.path.isfile(f'{d}/image.png') else None
    # ACTEUR DÉPLACÉ (20/10/2026) : même figure, même taille, autre place (Maître Koné et Sœur Awa rapprochés de 0,2 m pour
    # que leur plan à deux garde les bouches lisibles) — les visages sont gardés et leur cadre (meta « box ») décalé d'autant
    places0 = {}
    if os.path.isfile(f'{d}/scene.json'):
        try: places0 = {p_['nom']: p_ for p_ in (json.load(open(f'{d}/scene.json')).get('compose') or {}).get('acteurs', [])}
        except Exception: places0 = {}
    garde = f'{B}/prep/.{nom}-expressions'; shutil.rmtree(garde, ignore_errors=True)
    if ancien is not None and os.path.isdir(f'{d}/expressions'): shutil.move(f'{d}/expressions', garde)
    shutil.rmtree(d, ignore_errors=True)
    # découpes exactes passées à prepare_scene (20/10/2026) : chaque acteur y est analysé seul, le décor peuplé ne lui vole plus
    # son squelette ni son visage (ecole-n1 : visages de Koné et d'Awa pris sur des élèves peints)
    ft = []
    for k, al in enumerate(alphas):
        ft.append(f'{B}/scenes/.{nom}-alpha-{k}.png'); cv2.imwrite(ft[-1], np.clip(al * 65535, 0, 65535).astype(np.uint16))
    r = subprocess.run([sys.executable, f'{ICI}/prepare_scene.py', f'scenes/{nom}.png', f'prep/{nom}', ','.join(a[0] for a in acteurs)],
                       cwd=B, capture_output=True, text=True, env=dict(os.environ, PREPARE_ALPHAS=','.join(ft)))
    for f_ in ft: os.remove(f_)
    if r.returncode: raise RuntimeError('prepare_scene : ' + (r.stderr or r.stdout)[-800:])
    S = json.load(open(f'{d}/scene.json')); H, W = img.shape[:2]
    if [a['nom'] for a in S['acteurs']] != [a[0] for a in acteurs]:
        raise RuntimeError(f"ordre des acteurs différent : {[a['nom'] for a in S['acteurs']]}")
    exacte = {'plaque': 'plaque-pleine.png', 'alphas': {}}; union = np.zeros((H, W), np.uint8)
    for a, al in zip(S['acteurs'], alphas):
        # CONTRÔLE (20/10/2026, défaut vu sur ecole-n1) : le visage repéré doit être DANS la silhouette de son acteur
        vb = (a.get('visage') or {}).get('box')
        if not vb or al[min(H - 1, int((vb[1] + vb[3]) / 2)), min(W - 1, int((vb[0] + vb[2]) / 2))] < 0.5:
            raise RuntimeError(f"{a['nom']} : visage {'introuvable' if not vb else 'repéré hors de sa silhouette'} ({vb})")
        f = f"exacte-{a['slug']}.png"; cv2.imwrite(f'{d}/{f}', np.clip(al * 65535, 0, 65535).astype(np.uint16)); exacte['alphas'][a['slug']] = f
        m = (al > 0.5).astype(np.uint8); cv2.imwrite(f"{d}/{a['slug']}-masque.png", m * 255)
        ys, xs = np.nonzero(m); a['bbox'] = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
        up = (al > 0.02).astype(np.uint8); up[int(a['bassin_y']) + 6:] = 0; union |= cv2.dilate(up, np.ones((17, 17), np.uint8))
    pl = img.copy(); pl[union > 0] = fond[union > 0]   # haut du corps retiré, jambes gardées (comme prepare_scene), décor EXACT dessous
    cv2.imwrite(f'{d}/plaque.png', cv2.cvtColor(pl, cv2.COLOR_RGB2BGR)); cv2.imwrite(f'{d}/plaque-pleine.png', cv2.cvtColor(fond, cv2.COLOR_RGB2BGR))
    S['compose'] = {'plaque': os.path.abspath(plaque_p), 'px_par_m': ppm, 'sol_y': sol_y, 'acteurs': places}
    json.dump(S, open(f'{d}/scene.json', 'w'), ensure_ascii=False, indent=1); json.dump(exacte, open(f'{d}/exacte.json', 'w'), indent=1)
    if os.path.isdir(garde):
        for a, p_, al in zip(S['acteurs'], places, alphas):
            X0, Y0, X1, Y1 = p_['bbox']; o_ = places0.get(a['nom'], {}); x0, y0, x1, y1 = o_.get('bbox') or (X0, Y0, X1, Y1)
            dx, dy = int(X0 - x0), int(Y0 - y0); e_ = None
            if ancien.shape == img.shape and (x1 - x0, y1 - y0) == (X1 - X0, Y1 - Y0) and bool(o_.get('miroir')) == bool(p_.get('miroir')):
                # les pixels PLEINS de l'acteur seulement (découpe exacte) : le décor derrière lui change quand il se déplace, et
                # le bord semi-transparent le laisse voir (mesuré 20/10/2026, Koné et Awa décalés de 40 px : alpha > 0,5 →
                # jusqu'à 97 niveaux sur ce bord ; alpha > 0,98 → au plus 4 niveaux, 0,03 en moyenne)
                m_ = al[Y0:Y1, X0:X1] > 0.98
                e_ = np.abs(ancien[y0:y1, x0:x1].astype(np.int16) - img[Y0:Y1, X0:X1].astype(np.int16))[m_] if (dx or dy) else \
                     np.abs(ancien[Y0:Y1, X0:X1].astype(np.int16) - img[Y0:Y1, X0:X1].astype(np.int16))
            if os.path.isdir(f"{garde}/{a['slug']}") and e_ is not None and e_.size and e_.max() <= GARDE_MAX and e_.mean() < GARDE_MOY:
                os.makedirs(f'{d}/expressions', exist_ok=True); shutil.move(f"{garde}/{a['slug']}", f"{d}/expressions/{a['slug']}")
                if dx or dy:
                    for f_ in ('meta.json', 'partiel.json'):
                        q_ = f"{d}/expressions/{a['slug']}/{f_}"
                        if os.path.isfile(q_):
                            M_ = json.load(open(q_))
                            if M_.get('box'): M_['box'] = [M_['box'][0] + dx, M_['box'][1] + dy, M_['box'][2]]
                            json.dump(M_, open(q_, 'w'))
                journal(f"{a['nom']} : acteur inchangé{f' (déplacé de {dx:+d}, {dy:+d} px)' if dx or dy else ''}, visages déjà dessinés gardés")
        shutil.rmtree(garde, ignore_errors=True)
    if copie_de:
        for f in COPIES:
            if os.path.isfile(f'{copie_de}/{f}'): shutil.copy(f'{copie_de}/{f}', f'{d}/{f}')
    # CASTING (20/10/2026, « toute la troupe […] pour mes 10 000 vidéos ») : les acteurs encore sans visages reçoivent la
    # bibliothèque du casting, replacée sur leur figure posée (casting_troupe.transfere) — secondes au lieu d'une heure
    if os.environ.get('SCENE_CASTING', '1') == '1':
        import casting_troupe
        casting_troupe.transfere(d, B, journal)
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
