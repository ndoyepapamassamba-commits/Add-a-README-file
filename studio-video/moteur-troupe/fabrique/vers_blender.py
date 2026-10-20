# VERS LE FILM BLENDER (18/10/2026) — « les personnages et scènes BLENDER doivent ressembler à notre vraie troupe » :
# chaque sketch écrit pour la troupe (histoires/*.json, contrôlé par ton.py) devient une histoire du film Blender
# (studio-video/blender/film : acteurs = les planches peintes de la troupe découpées et montées sur squelette, décor peint
# posé sur son relief, objets et animaux 3D, caméra par réplique). Le témoin de la chute est donné au plan (« react ») :
# le plan insère alors le gros plan de réaction sur lui, comme le veut la veille (2,2 à 4,5 s figé).
#   python3 vers_blender.py histoires/saison1-ep01.json <dossier_sortie>   → <dossier>/<id>.json, une histoire par sketch
import json, os, sys

# distribution du film Blender (voix Piper, taille, hauteur de voix) : celle des histoires déjà tournées
CAST = {'MAMAN NOUNOU': dict(id='nounou', voice='siwis', height=1.6, pitch=0.95),
        'BAYE NDIAYE': dict(id='baye', voice='gilles', height=1.72),
        'PETIT MAMADOU': dict(id='mamadou', voice='jessica', height=1.15, pitch=1.22),
        'TANTIE AWA': dict(id='awa', voice='siwis', height=1.62), 'MODOU': dict(id='modou', voice='tom', height=1.76),
        'COUMBA': dict(id='coumba', voice='jessica', height=1.7), 'KOFFI': dict(id='koffi', voice='pierre', height=1.78)}
# jeu de la réplique → une des 5 poses dessinées de chaque planche
POSE = {'accuse': 'accuse', 'innocent': 'haussement', 'soupcon': 'neutre', 'malice': 'rire', 'frime': 'rire', 'camera': 'neutre',
        'choc': 'choc', 'panique': 'choc', 'marchande': 'haussement', 'joie': 'rire', 'neutre': 'neutre', 'colere': 'accuse', 'rire': 'rire'}
DECOR = {'cour': 'Cour', 'salon': 'Salon', 'maquis': 'Maquis', 'chambre': 'Chambre', 'marche': 'Marché', 'ecole': 'École', 'classe': 'École'}
PLACES = (-0.5, 0.45, 0.02, -0.15, 0.7)


def convertit(s):
    acteurs = s.get('acteurs') or list(dict.fromkeys(r['qui'] for r in s['repliques']))
    cast = []
    for k, nom in enumerate(acteurs):
        c = dict(CAST[nom]); c['name'] = nom; c['x'] = PLACES[k % len(PLACES)]; cast.append(c)
    ids = {c['name']: c['id'] for c in cast}; beats = []
    for i, r in enumerate(s['repliques']):
        b = {'who': ids[r['qui']], 'pose': POSE.get(r.get('jeu'), 'neutre'), 'text': r['texte']}
        if i == 0: b['shot'] = 'two'
        if r.get('chute') and s.get('reaction'):
            b['react'] = {ids[s['reaction']['qui']]: 'choc'}
        beats.append(b)
    return {'title': s.get('titre', s['id']), 'hook': s['repliques'][0]['texte'], 'decor': DECOR.get(s.get('lieu', 'cour'), 'Cour'),
            'fps': 25, 'size': [576, 1024], 'music': False, 'cast': cast, 'beats': beats,
            'reaction_s': (s.get('reaction') or {}).get('duree_s'), 'source': {'sketch': s['id'], 'mecanique': s.get('mecanique')},
            # objets de l'action posés près de leur propriétaire dès la première image (atelier.py : formes et tailles réelles)
            'props': [{'kind': o['quoi'], 'near': ids[o['a']]} for o in s.get('objets', []) if isinstance(o, dict) and o.get('a') in ids]}


if __name__ == '__main__':
    H = json.load(open(sys.argv[1], encoding='utf-8')); os.makedirs(sys.argv[2], exist_ok=True)
    for s in H['sketchs']:
        json.dump(convertit(s), open(f"{sys.argv[2]}/{s['id']}.json", 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(s['id'], '→', f"{sys.argv[2]}/{s['id']}.json")
