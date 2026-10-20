# CASTING DE TOUTE LA TROUPE (20/10/2026) — « je préfère la V14 ou V15 avec leurs personnages beaucoup plus animés […] je
# voudrais après que tu impliques toute la troupe dans le moteur (plus de 50 personnages) […] règle tout pour mes 10 000
# vidéos ». Le moteur v14 (tourne.py : visages LivePortrait, gestes BEAT2, corps ARAP) ne jouait que les 7 personnages peints
# dans ses 3 lieux, et chaque scène composée redessinait ses visages (≈ 30 à 60 min par personnage : 1 h pour Maître Koné
# dans cour-n1). Ici, comme la bibliothèque de marionnettes d'un studio de découpage (Toon Boom, « Cut-out Animation
# Workflow » : modèles riggés rangés et entretenus dans une bibliothèque centrale, dupliqués sur toute la production),
# chaque personnage est préparé UNE fois, puis repris dans toutes les scènes :
#   figure  : sa vue détourée des galeries et des planches (blender/film/cutout.py → rig.json) ;
#   voix    : voix.CAST (siwis CC-BY 4.0 / gilles CC0 ; hauteur, étendue et timbre WORLD propres au personnage) ;
#   visages : bibliothèque LivePortrait (16 émotions × 5 bouches + yeux clos) dessinée une fois. Son cadre est rangé en
#             coordonnées de la FIGURE (fractions de sa largeur et de sa hauteur posées), si bien qu'elle se replace dans
#             n'importe quel décor, à n'importe quelle échelle, en miroir ou non (transfere, appelé par scene_nouvelle).
#   python3 casting_troupe.py etat                 → les 54 personnages de la bible : figure, voix, visages
#   python3 casting_troupe.py figures RIG.json     → BIBLIO/casting/<slug>/figure.png + fiche.json
#   python3 casting_troupe.py importe prep/<scène> → visages déjà dessinés d'une scène composée, versés au casting
#   python3 casting_troupe.py visages [NOM …]      → bibliothèques manquantes, dessinées dans le décor « studio » (long)
#   python3 casting_troupe.py dessine [NOM …]      → figures des personnages sans dessin (AI Horde gratuit, fond vert, contrôlées)
# BIBLIO : MASSAMBA_BIBLIO (hors dépôt : les dessins de la troupe sont privés).
import hashlib, json, os, shutil, subprocess, sys, time, unicodedata, re
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__))
BIBLIO = os.path.realpath(os.path.expanduser(os.environ.get('MASSAMBA_BIBLIO', '~/massamba-bibliotheque')))
BIBLE = os.path.join(ICI, '..', 'blender', 'film', 'characters.json')
# décor « studio » des bibliothèques : la cour peinte, à l'échelle où Maître Koné et Sœur Awa ont été dessinés (cour-n1 :
# 380 px/m, sol à 845 px) — un adulte y fait ≈ 650 px de haut et son visage ≈ 220 px, la taille où LivePortrait est net
STUDIO = {'plaque': 'prep/cour/plaque-pleine.png', 'px_par_m': 380.0, 'sol_y': 845.0, 'lumiere': 'prep/cour/lumiere.json'}
# au-delà de ce grossissement par rapport au dessin de la bibliothèque, le visage serait flou : la scène le signale
AGRANDI_MAX = 1.35


def slug_de(nom):   # même règle que prepare_scene.slug_de (MAÎTRE KONÉ → maitre-kone)
    t = unicodedata.normalize('NFKD', nom.replace('Œ', 'OE').replace('œ', 'oe')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', t).strip('-')


def bible():
    return json.load(open(BIBLE, encoding='utf-8'))


def dossier(nom, biblio=None): return os.path.join(biblio or BIBLIO, 'casting', slug_de(nom))


def empreinte(rgba):
    """empreinte d'une figure telle que le compositeur la pose (recadrée sur sa découpe) : deux dessins identiques → même
    empreinte, quel que soit le fichier."""
    a = rgba[..., 3] > 12; ys, xs = np.nonzero(a)
    r = np.ascontiguousarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
    return hashlib.sha1(r.tobytes() + str(r.shape).encode()).hexdigest()[:16]


def proportions(rgba):
    """largeur / hauteur de la figure recadrée sur sa découpe (seuil du compositeur : alpha > 0,05)."""
    ys, xs = np.nonzero(rgba[..., 3].astype(np.float32) / 255.0 > 0.05)
    return (xs.max() - xs.min() + 1) / (ys.max() - ys.min() + 1)


def lit_figure(f): return cv2.cvtColor(cv2.imread(f, cv2.IMREAD_UNCHANGED), cv2.COLOR_BGRA2RGBA)


# ── FIGURES ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
def figures(rig_json, biblio=None, journal=print):
    """une figure par personnage dessiné : la pose « neutre » de cutout.py (sinon la première), copiée telle quelle."""
    R = json.load(open(rig_json, encoding='utf-8')); base = R.get('dir') or os.path.dirname(os.path.abspath(rig_json))
    if not os.path.isdir(base): base = os.path.dirname(os.path.abspath(rig_json))
    B = bible(); n = 0
    for nom, c in R['cast'].items():
        poses = c.get('poses') or []
        p = next((q for q in poses if q.get('kind') == 'neutre'), poses[0] if poses else None)
        if not p: continue
        src = os.path.join(base, p['png'])
        if not os.path.isfile(src): journal(f'{nom} : {p["png"]} absent'); continue
        d = dossier(nom, biblio); os.makedirs(d, exist_ok=True); shutil.copy(src, f'{d}/figure.png')
        f = B.get(nom, {})
        json.dump({'nom': nom, 'slug': slug_de(nom), 'source': c.get('source'), 'pose': p['png'], 'taille_m': f.get('height', 1.7),
                   'genre': f.get('genre'), 'age': f.get('age'), 'lieux': f.get('lieux', []), 'activite': f.get('activite'),
                   'empreinte': empreinte(lit_figure(src))}, open(f'{d}/fiche.json', 'w'), ensure_ascii=False, indent=1)
        n += 1
    journal(f'{n} figures rangées dans {os.path.join(biblio or BIBLIO, "casting")}')
    return n


def fiche(nom, biblio=None):
    f = f'{dossier(nom, biblio)}/fiche.json'
    return json.load(open(f, encoding='utf-8')) if os.path.isfile(f) else None


# ── VISAGES : versés au casting, repris dans une scène ─────────────────────────────────────────────────────────────────────
def _pose_de(place, rgba_ou_aspect):
    """(x0, y0, largeur, hauteur) de la figure posée, recalculés comme compositeur.compose (le cadre « bbox » est rogné au
    bord de l'image, pas celui-ci)."""
    th = int(place['hauteur_px']); asp = rgba_ou_aspect if np.isscalar(rgba_ou_aspect) else proportions(rgba_ou_aspect)
    tw = int(place.get('largeur_px') or round(asp * th))
    return place['x'] - tw // 2, int(place['pieds_y']) - th, tw, th


def importe(scene, biblio=None, journal=print):
    """visages déjà dessinés dans une scène composée (prep/<scène>/expressions/<slug>) → casting/<slug>/visages, cadre rangé
    en fractions de la figure posée. Une bibliothèque déjà au casting n'est remplacée que par une plus grande (plus nette)."""
    S = json.load(open(f'{scene}/scene.json')); places = {p['nom']: p for p in (S.get('compose') or {}).get('acteurs', [])}
    faits = []
    for a in S['acteurs']:
        src = f"{scene}/expressions/{a['slug']}"; p = places.get(a['nom']); F = fiche(a['nom'], biblio)
        if not (p and F and os.path.isfile(f'{src}/meta.json')): continue
        M = json.load(open(f'{src}/meta.json')); x, y, s = M['box']
        fig = lit_figure(f"{dossier(a['nom'], biblio)}/figure.png")
        if p.get('figure') and p['figure'] != F['empreinte']:
            journal(f"{a['nom']} : la scène n'utilise pas la figure du casting — non importé"); continue
        x0, y0, tw, th = _pose_de(p, fig)
        C = {'u0': (x - x0) / tw, 'v0': (y - y0) / th, 'su': s / tw, 'sv': s / th, 'miroir': bool(p.get('miroir')),
             'hauteur_px': th, 'taille': M['taille'], 'empreinte': F['empreinte'], 'source': os.path.abspath(scene),
             'date': time.strftime('%Y-%m-%d %H:%M')}
        d = f"{dossier(a['nom'], biblio)}/visages"; ancien = f'{d}/casting.json'
        if os.path.isfile(ancien) and json.load(open(ancien)).get('taille', 0) > C['taille']: continue
        shutil.rmtree(d, ignore_errors=True)
        shutil.copytree(src, d, ignore=shutil.ignore_patterns('lacet.npz', 'partiel.json', '*.tmp'))
        json.dump(C, open(ancien, 'w'), ensure_ascii=False, indent=1); faits.append(a['nom'])
        journal(f"{a['nom']} : visages versés au casting (cadre {C['u0']:+.3f}, {C['v0']:+.3f}, {C['sv']:.3f} de la figure ; "
                f"{len(M['emotions'])} émotions, {M['taille']} px)")
    return faits


def transfere(d, biblio=None, journal=print):
    """scène composée prep/<nom> : chaque acteur sans visages reçoit ceux du casting, replacés sur SA figure posée (échelle,
    place, miroir) — quelques secondes au lieu d'une heure. Le cadre « box » [x, y, côté] suit la figure ; les images sont
    retournées si l'acteur est posé dans l'autre sens que dans la bibliothèque ; les champs de rotation de la tête (lacet.npz)
    sont recalculés par le tournage pour ce cadre (clé du cache). → {nom: grossissement}"""
    S = json.load(open(f'{d}/scene.json')); places = {p['nom']: p for p in (S.get('compose') or {}).get('acteurs', [])}
    out = {}
    for a in S['acteurs']:
        dl = f"{d}/expressions/{a['slug']}"; p = places.get(a['nom'])
        src = f"{dossier(a['nom'], biblio)}/visages"
        if os.path.isfile(f'{dl}/meta.json') or not p or not os.path.isfile(f'{src}/casting.json'): continue
        C = json.load(open(f'{src}/casting.json'))
        if p.get('figure') and p['figure'] != C['empreinte']:
            journal(f"{a['nom']} : autre dessin que celui du casting — visages à dessiner"); continue
        fig = lit_figure(f"{dossier(a['nom'], biblio)}/figure.png")
        x0, y0, tw, th = _pose_de(p, fig); retourne = bool(p.get('miroir')) != C['miroir']
        u0 = 1.0 - C['u0'] - C['su'] if retourne else C['u0']
        s = C['sv'] * th; box = [x0 + u0 * tw, y0 + C['v0'] * th, s]
        os.makedirs(dl, exist_ok=True)
        for f in os.listdir(src):
            if f.endswith('.png'):
                im = cv2.imread(f'{src}/{f}', cv2.IMREAD_UNCHANGED)
                cv2.imwrite(f'{dl}/{f}', im[:, ::-1] if retourne else im)
        M = json.load(open(f'{src}/meta.json')); M['box'] = box
        if retourne and (M.get('sourcils_sens') or {}).get('sens'): M['sourcils_sens']['sens'] = M['sourcils_sens']['sens'][::-1]
        M['casting'] = {'source': src, 'retourne': retourne, 'grossissement': round(s / C['taille'], 3)}
        json.dump(M, open(f'{dl}/meta.json', 'w'))
        out[a['nom']] = round(s / C['taille'], 3)
        alerte = f' — plus de ×{AGRANDI_MAX} : visage moins net, bibliothèque à redessiner à cette échelle' if s / C['taille'] > AGRANDI_MAX else ''
        journal(f"{a['nom']} : visages du casting repris (×{s / C['taille']:.2f}{', retournés' if retourne else ''}){alerte}")
    return out


def visages(noms=None, biblio=None, journal=print):
    """bibliothèques manquantes : chaque figure posée seule dans le décor studio (scene_nouvelle), visages dessinés par
    prepare_expressions.py (recettes parrainées par le personnage préparé le plus proche), versés au casting, puis la scène
    studio est effacée (seule la bibliothèque compte). Reprenable : un personnage déjà au casting est sauté."""
    B = biblio or BIBLIO; noms = noms or [n for n in bible() if fiche(n, B)]
    import scene_nouvelle
    for nom in noms:
        F = fiche(nom, B)
        if not F or os.path.isfile(f'{dossier(nom, B)}/visages/casting.json'): continue
        t0 = time.time(); sc = f"studio-{F['slug']}"
        L = json.load(open(os.path.join(B, STUDIO['lumiere']))) if os.path.isfile(os.path.join(B, STUDIO['lumiere'])) else None
        d = scene_nouvelle.prepare(B, sc, os.path.join(B, STUDIO['plaque']), STUDIO['px_par_m'], STUDIO['sol_y'],
                                   [(nom, lit_figure(f"{dossier(nom, B)}/figure.png"), float(F['taille_m']), 0.5)], L=L, journal=journal)
        r = subprocess.run([sys.executable, f'{ICI}/prepare_expressions.py', f'prep/{sc}'], cwd=B, capture_output=True, text=True)
        open(f"{dossier(nom, B)}/visages-{time.strftime('%Y%m%d-%H%M')}.log", 'w').write(r.stdout[-20000:] + r.stderr[-5000:])
        if r.returncode: journal(f'{nom} : prepare_expressions a échoué ({r.returncode})'); continue
        importe(d, B, journal)
        shutil.rmtree(d, ignore_errors=True)
        for f in (f'{B}/scenes/{sc}.png',):
            if os.path.isfile(f): os.remove(f)
        journal(f'{nom} : bibliothèque de visages en {time.time() - t0:.0f} s')


# ── DESSINER LES PERSONNAGES SANS FIGURE ─────────────────────────────────────────────────────────────────────────────────
# 15 personnages de la bible n'ont ni planche ni galerie (« à dessiner », « catalogue »). Leur figure est générée dans le style
# des galeries (3D caricatural de long métrage, plein pied, fond vert de studio) d'après LEUR fiche (apparence, tenue,
# posture : bible_comique.json), par la voie gratuite sans compte : AI Horde (horde.py, file communautaire, modèle choisi par
# l'attente annoncée) ; puis découpée comme les galeries (blender/film/cutout.key_out, fond vert) et contrôlée : une seule
# silhouette, visage lu par FaceLandmarker (compositeur.lacet_peint), corps entier (hauteur ≥ 3 × largeur de tête).
STYLE_GALERIE = ('3D animated feature film caricature, Pixar and Disney style, stylized proportions, big expressive eyes with visible white sclera, '
                 'soft subsurface skin shading, detailed fabric textures, warm and joyful. ')
# 20/10/2026 : premier essai (Monsieur Diarra) refusé, jambes coupées au bas de l'image — plan large exigé, marges vertes en haut et en bas
CADRE_GALERIE = ('ONE single character only, wide full-length shot: the WHOLE figure from the top of the head down to the shoes is inside the image, '
                 'with empty green margin above the head and below the feet, the character fills about 80 percent of the image height, '
                 'standing, three-quarter view turned slightly to the right, hands empty, mouth closed and '
                 'fully visible, eyes open, arms slightly away from the body, plain flat solid saturated chroma green studio background, '
                 'soft even front lighting, no text, no logo, no other people.')


def invite(nom):
    p = next((x for x in json.load(open(os.path.join(ICI, 'bible_comique.json'), encoding='utf-8'))['personnages'] if x['name'] == nom), {})
    f = bible().get(nom, {}); g = {'femme': 'woman', 'homme': 'man', 'fille': 'girl', 'garcon': 'boy'}.get(f.get('genre'), 'person')
    traduit = lambda t: (t or '').replace('’', "'")
    return (STYLE_GALERIE + f"Black West African (Ivorian) {g}, about {f.get('age', 35)} years old, dark brown skin. "
            f"{traduit(p.get('apparence'))} Outfit: {traduit(p.get('tenue'))} " + CADRE_GALERIE)


def dessine(noms=None, biblio=None, journal=print, essais=3):
    sys.path.insert(0, os.path.join(ICI, '..', 'blender', 'film')); import cutout, horde, compositeur
    B = biblio or BIBLIO; noms = noms or [n for n, f in bible().items() if not fiche(n, B)]
    for nom in noms:
        d = dossier(nom, B); os.makedirs(d, exist_ok=True)
        if os.path.isfile(f'{d}/fiche.json'): continue
        for k in range(essais):
            brut = f'{d}/genere-{k}.png'; t0 = time.time()
            try:
                # 448 × 576 : sous le seuil anonyme d'AI Horde (« KudosUpfront » au-delà de 576 × 576, mesuré le 20/10/2026) ; les figures
                # des galeries font ≈ 430 px de haut, le compositeur les agrandit (Swin2SR ×4)
                g = horde.generate(invite(nom), brut, 448, 576, horde.meilleur_modele(), seed=1000 + k)
            except (SystemExit, Exception) as ex:
                journal(f'{nom} : génération {k + 1} échouée ({ex})'); continue
            rgb = cv2.cvtColor(cv2.imread(brut), cv2.COLOR_BGR2RGB); rgba = cutout.isolate_figure(cutout.key_out(rgb))
            a = rgba[..., 3] > 128; n, lab, st, _ = cv2.connectedComponentsWithStats(a.astype(np.uint8))
            if n < 2: journal(f'{nom} : aucune silhouette'); continue
            i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); rgba[lab != i, 3] = 0
            ys, xs = np.nonzero(rgba[..., 3] > 12); rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            bord = (ys.min() <= 2) or (ys.max() >= rgb.shape[0] - 3)   # tête ou pieds coupés par le cadre
            lp = compositeur.lacet_peint(rgba)
            if bord or lp is None or rgba.shape[0] < 2.2 * rgba.shape[1]:
                journal(f"{nom} : essai {k + 1} refusé ({'coupé au cadre' if bord else 'visage illisible' if lp is None else 'pas en pied'})"); continue
            cv2.imwrite(f'{d}/figure.png', cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))
            f = bible().get(nom, {})
            json.dump({'nom': nom, 'slug': slug_de(nom), 'source': f"AI Horde {g.get('model')} (graine {g.get('seed')})", 'pose': 'genere',
                       'taille_m': f.get('height', 1.7), 'genre': f.get('genre'), 'age': f.get('age'), 'lieux': f.get('lieux', []),
                       'activite': f.get('activite'), 'empreinte': empreinte(rgba), 'lacet_peint': lp},
                      open(f'{d}/fiche.json', 'w'), ensure_ascii=False, indent=1)
            journal(f"{nom} : figure dessinée par {g.get('model')} en {time.time() - t0:.0f} s ({rgba.shape[1]}×{rgba.shape[0]} px, tête à {lp:+.0f}°)")
            break


# ── ÉTAT ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def etat(biblio=None):
    sys.path.insert(0, ICI); import voix
    B = biblio or BIBLIO; R = []
    for nom, f in bible().items():
        F = fiche(nom, B); C = f'{dossier(nom, B)}/visages/casting.json'
        try: v = voix.CAST[nom]; vx = f"{'siwis' if 'siwis' in v[0] else 'gilles'} {v[2]} Hz ×{v[5]:.2f}"
        except Exception: vx = None
        R.append({'nom': nom, 'dessin': f.get('dessin'), 'figure': bool(F), 'voix': vx, 'visages': os.path.isfile(C),
                  'lieux': f.get('lieux', [])})
    return R


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'etat'
    if cmd == 'figures': figures(sys.argv[2])
    elif cmd == 'importe': importe(os.path.abspath(sys.argv[2]))
    elif cmd == 'visages': visages(sys.argv[2:] or None)
    elif cmd == 'transfere': print(transfere(os.path.abspath(sys.argv[2])))
    elif cmd == 'dessine': dessine(sys.argv[2:] or None)
    else:
        R = etat()
        print('| Personnage | Dessin | Figure | Voix | Visages |\n|---|---|---|---|---|')
        for r in R: print(f"| {r['nom']} | {r['dessin']} | {'oui' if r['figure'] else '—'} | {r['voix'] or '—'} | {'oui' if r['visages'] else '—'} |")
        print(f"\n{sum(r['figure'] for r in R)} figures, {sum(bool(r['voix']) for r in R)} voix, {sum(r['visages'] for r in R)} bibliothèques de visages sur {len(R)} personnages")
