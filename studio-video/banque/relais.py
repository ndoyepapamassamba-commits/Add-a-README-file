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
    """Fond vert franc, 1 à 8 silhouettes en pied."""
    import cv2, numpy as np
    im = cv2.imread(planche); hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    vert = (hsv[..., 0] > 35) & (hsv[..., 0] < 85) & (hsv[..., 1] > 120) & (hsv[..., 2] > 80)
    col = (~vert).sum(0) > 3; segs, x, W = [], 0, len(col)
    while x < W:
        if col[x]:
            s = x
            while x < W and col[x]: x += 1
            segs.append((s, x))
        x += 1
    segs = [s for s in segs if s[1] - s[0] > 25]
    hauts = [int(np.ptp(np.nonzero((~vert)[:, a:b].sum(1) > 2)[0])) for a, b in segs] if segs else []
    ok = bool(1 <= len(segs) <= 8 and min(hauts) >= 0.5 * im.shape[0] and vert.mean() >= 0.30)
    return ok, {'silhouettes': len(segs), 'fond_vert': round(float(vert.mean()), 3),
                'hauteur_min': round(min(hauts) / im.shape[0], 3) if hauts else 0}


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
