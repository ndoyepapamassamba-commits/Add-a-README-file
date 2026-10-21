# RELAIS BIBLE → BANQUE (20/10/2026) — « on doit tourner 10 000 [vidéos] » : dès que la bible V1 a dessiné la planche d'un
# nouveau personnage, il entre dans la banque de mouvements, sans attendre les autres.
#  1. lit les branches bible-sortie-* et ouvre chaque planche « perso-* » avec la clé de Claude ;
#  2. CONTRÔLE : fond vert franc (≥ 30 % de l'image), 1 à 8 silhouettes, chacune en pied (≥ 50 % de la hauteur) — sinon elle est
#     écartée et signalée (à redessiner), jamais animée. (Exiger 5 silhouettes séparées écartait les planches V1 elles-mêmes :
#     Baye 1, Coumba 3, leurs poses se touchent ; banque.poses les coupe alors en 5 parts égales, clips réussis — mesuré le 20/10.)
#  3. la scelle avec la clé publique de la fabrique dans images/troupe/<personnage>-planche.msb (les machines l'ouvrent en mémoire) ;
#     Une planche dont la version est plus basse que celle de la bible (image à refaire, bible.REFAIRE) n'est pas relayée.
#  4. inscrit le personnage dans banque/troupe.json (avec son fond, vert ou bleu) et écrit dans banque/demandes/demande.json les SEULS clips qui manquent
#     (ceux déjà présents sur une branche banque-sortie-* ne sont jamais refaits).
#   python3 relais.py CLE_CLAUDE.priv.pem CLE_FABRIQUE.pub.pem DOSSIER_DE_TRAVAIL   → résumé JSON (acceptés, écartés, clips demandés)
import json, os, subprocess, sys

ICI = os.path.dirname(os.path.abspath(__file__)); DEPOT = os.path.abspath(os.path.join(ICI, '..', '..'))
sys.path.insert(0, ICI); sys.path.insert(0, os.path.join(ICI, '..', 'fabrique'))
import banque, coffre


def _git(*a, **k):
    return subprocess.run(['git', '-C', DEPOT, *a], capture_output=True, **k)


def branches(prefixe):
    sortie = _git('ls-remote', 'origin', f'refs/heads/{prefixe}*', text=True).stdout.split()
    return [r.split('refs/heads/')[1] for r in sortie if r.startswith('refs/heads/')]


def fichiers(br):
    _git('fetch', '-q', 'origin', f'+refs/heads/{br}:refs/remotes/origin/{br}')
    return _git('ls-tree', '--name-only', f'origin/{br}', text=True).stdout.split()


def controle(planche, dossier):
    """Fond franc (vert, ou bleu pour les personnages habillés de vert : banque.masque_fond, 21/10), 1 à 8 silhouettes en pied."""
    import cv2, numpy as np
    im = cv2.imread(planche); vert, _ = banque.masque_fond(im)
    col = (~vert).sum(0) > 3; segs, x, W = [], 0, len(col)
    while x < W:
        if col[x]:
            s = x
            while x < W and col[x]: x += 1
            segs.append((s, x))
        x += 1
    segs = [s for s in segs if s[1] - s[0] > 25]
    hauts = [int(np.ptp(np.nonzero((~vert)[:, a:b].sum(1) > 2)[0])) for a, b in segs] if segs else []
    trous = trous_tete(vert, segs)
    ok = bool(1 <= len(segs) <= 8 and min(hauts) >= 0.5 * im.shape[0] and vert.mean() >= 0.30 and not trous)
    tn = teint_planche(im); ok = ok and tn['dans_la_gamme_v1']
    return ok, {'silhouettes': len(segs), 'fond': round(float(vert.mean()), 3),
                'hauteur_min': round(min(hauts) / im.shape[0], 3) if hauts else 0, **({'trous_tete': trous} if trous else {}), 'teint': tn}


def teint_planche(im):
    """21/10/2026, consigne : « même le teint des personnages, nous sommes en Afrique de l'Ouest ». Peau des figures de la planche
    (niveau_v1.teint, segmenteur MediaPipe) : médianes L* et b* au plus celles du personnage le plus clair de la V1, mesuré de la même
    façon sur les dessins d'origine (Coumba : L* 52,5, b* 48). Mesuré le 21/10 : 11 fiches de la bible au-dessus (Le Banquier 69,8)."""
    import numpy as np
    sys.path.insert(0, os.path.join(ICI, '..', 'moteur-troupe')); import niveau_v1
    global _SEG
    if '_SEG' not in globals(): _SEG = niveau_v1._outils()
    mp, seg, _ = _SEG; t = niveau_v1.teint(im, seg=seg, mp=mp); b = niveau_v1.reference()['teint_dessins_v1']
    if not t: return {'L': None, 'b': None, 'dans_la_gamme_v1': False}
    L, bb = float(np.median([x[0] for x in t])), float(np.median([x[1] for x in t]))
    return {'L': round(L, 1), 'b': round(bb, 1), 'dans_la_gamme_v1': bool(L <= b['L'] and bb <= b['b'])}


def trous_tete(fond, segs):
    """21/10 03:55 — DJ Kévin dessiné avec des lunettes vert fluo sur le fond vert : à l'incrustation, ses verres deviennent
    transparents. Une zone couleur de fond ENFERMÉE dans le haut d'une silhouette (tête : 15 % de sa hauteur) et grande comme
    un verre de lunettes est un défaut ; plus bas, un bras sur la hanche enferme du fond légitimement. Mesuré sur 33 planches :
    verres de DJ Kévin 1,09 à 1,61 ‰ de h², anses de la bassine de Maman Brigitte 0,46 à 0,51 ‰ (le fond doit s'y voir),
    points de 0,07 à 0,25 ‰ → seuil 0,8 ‰. → nombre de silhouettes touchées."""
    import cv2, numpy as np
    n, lab, st, _ = cv2.connectedComponentsWithStats(fond.astype(np.uint8), 8)
    H, W = fond.shape; bord = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    touchees = 0
    for a, b in segs:
        col = (~fond)[:, a:b].sum(1) > 2; ys = np.nonzero(col)[0]
        if not len(ys): continue
        y0, y1 = ys[0], ys[0] + int(0.15 * (ys[-1] - ys[0]))
        ids = [i for i in np.unique(lab[y0:y1, a:b]) if i and i not in bord and st[i, 4] >= 0.0008 * (ys[-1] - ys[0]) ** 2]
        if any(st[i, 1] >= y0 and st[i, 1] + st[i, 3] <= y1 + 4 for i in ids): touchees += 1
    return touchees


def main(priv_claude, pub_fabrique, travail):
    from cryptography.hazmat.primitives import serialization
    os.makedirs(travail, exist_ok=True)
    priv = serialization.load_pem_private_key(open(priv_claude, 'rb').read(), None); pub = coffre._pub(pub_fabrique)
    sys.path.insert(0, os.path.join(ICI, '..', 'images')); import bible
    taches = {t['id']: t for t in bible.taches()}   # versions et fonds à jour (une planche périmée n'est jamais relayée)
    troupe = json.load(open(banque.TROUPE, encoding='utf-8')) if os.path.isfile(banque.TROUPE) else {'personnages': list(banque.V1), 'noms': {}}
    acceptes, ecartes = [], {}
    for br in branches('bible-sortie-'):
        noms = fichiers(br)
        mes = json.loads(_git('show', f'origin/{br}:mesure.json', text=True).stdout or '{}').get('taches', []) if 'mesure.json' in noms else []
        version = {e['tache']: e.get('version', 1) for e in mes if e.get('ok')}
        for f in noms:
            if not (f.startswith('perso-') and f.endswith('.msb')): continue
            nom = f[len('perso-'):-4]
            if nom in troupe['personnages']: continue
            if version.get(f[:-4], 1) < taches.get(f[:-4], {}).get('version', 1):
                ecartes[nom] = {'raison': 'version périmée, planche à refaire'}; continue
            png = os.path.join(travail, nom + '.png')
            open(png, 'wb').write(coffre.ouvre_octets(_git('show', f'origin/{br}:{f}').stdout, priv))
            ok, mesure = controle(png, travail)
            if not ok: ecartes[nom] = mesure; continue
            open(os.path.join(ICI, '..', 'images', 'troupe', f'{nom}-planche.msb'), 'wb').write(coffre.scelle_octets(open(png, 'rb').read(), pub))
            if f'fiche-{nom}.msb' in noms:   # 21/10 : fiche de face (bible en deux étapes) = pose neutre de la banque
                fiche = coffre.ouvre_octets(_git('show', f'origin/{br}:fiche-{nom}.msb').stdout, priv)
                open(os.path.join(ICI, '..', 'images', 'troupe', f'{nom}-fiche.msb'), 'wb').write(coffre.scelle_octets(fiche, pub))
            troupe['personnages'].append(nom); troupe['noms'][nom] = taches.get(f'perso-{nom}', {}).get('nom', nom.upper()); acceptes.append(nom)
            if taches.get(f'perso-{nom}', {}).get('fond') == 'bleu': troupe.setdefault('fonds', {})[nom] = 'bleu'
    json.dump(troupe, open(banque.TROUPE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    faits = {f[:-4] for br in branches('banque-sortie-') for f in fichiers(br) if f.endswith('.msb')}
    demande = [t for t in banque.taches() if t['id'] not in faits]
    json.dump(demande, open(os.path.join(ICI, 'demandes', 'demande.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return {'acceptes': acceptes, 'ecartes': ecartes, 'troupe': len(troupe['personnages']), 'clips_deja_tournes': len(faits),
            'clips_demandes': len(demande)}


if __name__ == '__main__':
    print(json.dumps(main(*sys.argv[1:4]), ensure_ascii=False, indent=1))
