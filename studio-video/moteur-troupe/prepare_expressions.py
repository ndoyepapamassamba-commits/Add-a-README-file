# BIBLIOTHÈQUES D'EXPRESSIONS DESSINÉES D'UNE SCÈNE (17/10/2026) : pour chaque personnage, une fois, toutes les émotions
# (expressions_lp.EMO) × 4 ouvertures de bouche + yeux clos, par LivePortrait (MIT) en ONNX sur le processeur ; la recette
# de chaque émotion est cherchée pour CE visage par l'œil de JEV (expressions_lp.cherche_recette).
# Réutilisées par tous les épisodes tournés dans la scène ; tourne.py les prend si elles existent.
#   python3 prepare_expressions.py prep/cour [slug …]   (seulement ces personnages)
import json, os, sys, time
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import expressions_lp as XL

# RECETTES REPRISES (18/10/2026, vie réelle) : un lieu réel (prep/<lieu>-reel, vie_reelle.lieu) montre les MÊMES personnages
# que le lieu dessiné ; avec EXPRESSIONS_RECETTES_DE=<lieu dessiné>, les recettes déjà jugées pour chacun sont reprises au
# lieu d'être recherchées de nouveau par le juge (Baye avec la recherche locale : 46 images sur 79 en 21 min, soit ≈ 35 min
# projetées par personnage ; avec les recettes reprises : 3 personnages en 1 431 s, fin de Baye comprise) ;
# la bibliothèque ne fait plus que dessiner. Provenance notée dans expressions/<slug>/recettes-reprises.json.
import lp_onnx as LP


def reprend(dossier, slug, img, v3, src_dir):
    old = f'{src_dir}/expressions/{slug}/meta.json'
    if not os.path.isfile(old) or os.path.isfile(f'{dossier}/meta.json'): return 0
    O = json.load(open(old)); s_ = LP.recadre(img, v3)[2]; taille = int(round(min(512, max(96, s_))))
    fp = f'{dossier}/partiel.json'; P = json.load(open(fp)) if os.path.isfile(fp) else {}
    if not (P.get('taille') == taille and P.get('version') == XL.VERSION and P.get('bouche') == XL.bouches(slug)):
        P = {'taille': taille, 'version': XL.VERSION, 'bouche': XL.bouches(slug), 'emotions': [], 'commandes': {}, 'recettes': {}, 'jev': {}}
    pris = []
    for e in O.get('emotions', []):
        if e in P['emotions'] or O['commandes'].get(e) != XL.EMO.get(e): continue
        P['emotions'].append(e); P['commandes'][e] = O['commandes'][e]; P['recettes'][e] = O['recettes'][e]; pris.append(e)
        if e in O.get('jev', {}): P['jev'][e] = O['jev'][e]
    if 'neutre' in O.get('jev', {}): P['jev'].setdefault('neutre', O['jev']['neutre'])
    os.makedirs(dossier, exist_ok=True); json.dump(P, open(fp, 'w'))
    json.dump({'source': old, 'emotions': pris}, open(f'{dossier}/recettes-reprises.json', 'w'), ensure_ascii=False)
    return len(pris)


# PARRAIN DE RECETTES (19/10/2026, toute la troupe) : un personnage NOUVEAU (casting du compositeur) n'a pas de recettes ;
# chacune serait cherchée de zéro par le juge (Maître Koné : colère en 5 essais, 3 min 12 s). Le moteur prend celles du
# personnage déjà préparé le plus proche — même sexe, âge voisin (bible blender/film/characters.json) — et les essaie EN
# PREMIER sur CE visage (expressions_lp.cherche_recette, paramètre parrain) : gardées si le juge les dit propres et
# lisibles (un seul jugement), sinon la recherche complète reprend. EXPRESSIONS_PARRAIN=0 coupe le parrainage.
def _fiche(nom):
    try:
        c = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'blender', 'film', 'characters.json'), encoding='utf-8')).get(nom) or {}
        return {'sexe': 'F' if str(c.get('genre', '')).startswith(('femme', 'fille')) else 'M', 'age': float(c.get('age') or 35)}
    except Exception: return None


def parrain(d, nom):
    """recettes du personnage préparé le plus proche de nom (autres scènes de la même bibliothèque) → (dict, provenance)."""
    f = _fiche(nom)
    if f is None: return None, None
    B = os.path.dirname(os.path.abspath(d)); best = None
    for lieu in sorted(os.listdir(B)):
        sj = f'{B}/{lieu}/scene.json'
        if os.path.abspath(f'{B}/{lieu}') == os.path.abspath(d) or not os.path.isfile(sj): continue
        for a in json.load(open(sj)).get('acteurs', []):
            m = f"{B}/{lieu}/expressions/{a['slug']}/meta.json"; g = _fiche(a['nom'])
            if a['nom'] == nom or g is None or not os.path.isfile(m): continue
            M = json.load(open(m))
            if M.get('version') != XL.VERSION: continue
            dist = abs(g['age'] - f['age']) + (100 if g['sexe'] != f['sexe'] else 0) + (40 if (g['age'] < 14) != (f['age'] < 14) else 0) + (0.5 if lieu.endswith('-reel') else 0)
            if best is None or dist < best[0]: best = (dist, M['recettes'], f"{lieu}/{a['slug']} ({a['nom']})")
    return (best[1], best[2]) if best else (None, None)


d = sys.argv[1]; S = json.load(open(f'{d}/scene.json')); img = cv2.cvtColor(cv2.imread(f'{d}/image.png'), cv2.COLOR_BGR2RGB)
seuls = set(sys.argv[2:]); RDE = os.environ.get('EXPRESSIONS_RECETTES_DE')
for a in S['acteurs']:
    if seuls and a['slug'] not in seuls: continue
    f3 = f"{d}/rig/visage3d-{a['slug']}.npy"
    if not os.path.isfile(f3): print(a['nom'], ': visage non lu (préparer la scène avec prepare_rig.py)'); continue
    fa = f"{d}/rig/alpha-{a['slug']}.png"   # garde de silhouette (18/10/2026) : la mâchoire ne sort pas de la découpe dessinée
    al = cv2.imread(fa, cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535 if os.path.isfile(fa) else None
    if RDE: print(a['nom'], ': recettes reprises de', RDE, '→', reprend(f"{d}/expressions/{a['slug']}", a['slug'], img, np.load(f3), RDE), flush=True)
    par = None
    if not RDE and os.environ.get('EXPRESSIONS_PARRAIN', '1') != '0' and not os.path.isfile(f"{d}/expressions/{a['slug']}/meta.json"):
        par, prov = parrain(d, a['nom'])
        if par: print(a['nom'], ': recettes parrainées par', prov, flush=True)
    t0 = time.time(); meta = XL.bibliotheque(img, np.load(f3), f"{d}/expressions/{a['slug']}", journal=lambda m: print(a['nom'], m.strip(), flush=True) if 'garde' in m else None, alpha=al, parrain=par)
    J = meta['jev']; autre = [e for e in meta['emotions'] if e != 'neutre' and meta['recettes'][e] != XL.EMO[e]]
    print(a['nom'], len(meta['emotions']), 'émotions ×', len(meta['bouche']), 'bouches,', round(time.time() - t0), 's ; lisibilité',
          {e: J[e]['lisible'] for e in meta['emotions'] if 'lisible' in J.get(e, {})}, '; recette changée :', autre, flush=True)
