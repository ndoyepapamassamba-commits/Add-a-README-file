# SKETCH → VIDÉO (21/10/2026) — « Tu te focalises trop sur 7 personnages alors qu'on doit tourner 10 000 » : un sketch de la
# machine à histoires (moteur-troupe/histoires.py, toute la troupe, tous les lieux de la bible V1) devient un plan de montage pour
# assemble.py, sans réglage à la main :
#  · voix de chaque réplique par voix.py (voix de la troupe calculée depuis la fiche de chaque personnage) ;
#  · geste de la banque tiré du « jeu » de la réplique (accuse → montrer, innocent → hausser, panique → choc…) ;
#  · acteurs répartis selon leur nombre, les enfants plus petits (âge de la fiche) ;
#  · après la chute, tous les autres restent figés de choc pendant que l'auteur de la chute rit (2 s) ;
#  · ambiance réelle du lieu (moteur-troupe/ambiance.py).
#   python3 scene.py SKETCH.json DECOR.png CLIPS_BANQUE DOSSIER [SORTIE.mp4]   → plan.json (+ vidéo si SORTIE)
import json, os, re, sys, unicodedata
import numpy as np

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI); sys.path.insert(0, os.path.join(ICI, '..', 'moteur-troupe')); sys.path.insert(0, os.path.join(ICI, '..', 'images'))
GESTE_DU_JEU = {'accuse': 'montrer', 'soupcon': 'montrer', 'innocent': 'hausser', 'malice': 'mentir', 'panique': 'choc',
                'choc': 'choc', 'rire': 'rire', 'marchande': 'parler', 'frime': 'parler', 'camera': 'parler', 'neutre': 'parler'}
TENUE_CHOC = 2.0   # secondes de réaction figée après la chute


def slug(t):
    return re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().lower()).strip('-')


def places(noms):
    """x de chaque acteur : 2 → 0,27 / 0,73 ; 3 → 0,2 / 0,5 / 0,8 ; au-delà, régulier."""
    n = len(noms)
    xs = [0.5] if n == 1 else [0.27, 0.73] if n == 2 else list(np.linspace(0.2, 0.8, n))
    return dict(zip(noms, xs))


def plan(h, decor, banque, dossier, lieu=None):
    import voix, bible
    from scipy.io import wavfile
    os.makedirs(dossier, exist_ok=True)
    fiches = {p['name']: p for p in json.load(open(bible.PERSONNAGES, encoding='utf-8'))['personnages']}
    noms = list(dict.fromkeys(r['qui'] for r in h['repliques']))
    acteurs = {}
    for nom, x in places(noms).items():
        age = bible.age_de(fiches.get(nom, {}))
        acteurs[slug(nom)] = {'x': round(float(x), 3), 'sol': 0.97, 'taille': 0.64 if age < 13 else 0.9, 'regarde': 'droite'}
    R = []
    for k, r in enumerate(h['repliques']):
        y, _ = voix.synth(r['qui'], r['texte']); f = os.path.join(dossier, f'r{k}.wav'); wavfile.write(f, voix.SR, y)
        R.append({'qui': slug(r['qui']), 'geste': GESTE_DU_JEU.get(r.get('jeu'), 'parler'), 'voix': f, 'texte': r['texte'],
                  'reagit': {}, 'chute': bool(r.get('chute') or r.get('role') == 'chute')})
    for k, r in enumerate(R[:-1]):   # la réplique qui suit une accusation : l'accusé encaisse (choc) avant de répondre
        if r['geste'] == 'montrer' and R[k + 1]['qui'] != r['qui']: r['reagit'] = {R[k + 1]['qui']: 'choc'}
    ch = next((r for r in R if r['chute']), R[-1])
    R.append({'duree': TENUE_CHOC, 'reagit': {a: ('rire' if a == ch['qui'] else 'choc') for a in acteurs}})
    P = {'decor': decor, 'titre': h.get('titre', ''), 'banque': banque, 'acteurs': acteurs, 'repliques': R,
         **({'lieu': lieu} if lieu else {})}
    json.dump(P, open(os.path.join(dossier, 'plan.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return os.path.join(dossier, 'plan.json')


if __name__ == '__main__':
    h = json.load(open(sys.argv[1], encoding='utf-8'))
    lieu = os.environ.get('SCENE_LIEU') or h.get('lieu_bible')
    p = plan(h, sys.argv[2], sys.argv[3], sys.argv[4], lieu)
    print(p)
    if len(sys.argv) > 5:
        import assemble
        print(json.dumps(assemble.assemble(p, sys.argv[5]), ensure_ascii=False))
