# ŒIL DE JEV — juge de cohérence d'une scène générée (TypeSafe System One, Jev 1.14, images) : chaque personnage
# est-il bien celui de sa fiche, à la bonne taille, entier ; le lieu est-il celui de l'histoire ; pas de texte parasite,
# pas de figurant en trop. La clé d'API n'est jamais dans ce fichier : le mandataire du conteneur l'injecte.
import base64, io, json, sys, uuid, urllib.request
from PIL import Image
API = 'https://api.typesafe.ai/v1/systemone'
def asset(path, side=768):
    im = Image.open(path).convert('RGB'); im.thumbnail((side, side)); b = io.BytesIO(); im.save(b, 'JPEG', quality=88)
    return {'type': 'image', 'format': 'jpg', 'data_base64': base64.b64encode(b.getvalue()).decode()}
POS = {1: ['in the image'], 2: ['on the left', 'on the right'], 3: ['on the left', 'in the center', 'on the right']}
def juge(scene, acteurs, lieu, fiches_dir='fiches'):
    ref_s = 'scene-' + uuid.uuid4().hex[:12]; assets = {ref_s: asset(scene)}; Q = {}
    pos = POS[len(acteurs)]
    for k, (nom, desc) in enumerate(acteurs):
        r = 'fiche-' + uuid.uuid4().hex[:12]; assets[r] = asset(f"{fiches_dir}/{nom.lower().replace(' ', '-')}.png", 512)
        Q[f'id_{k}'] = {'type': 'noul', 'instructions': f'Is the character {pos[k]} of `scene` the same character as in this reference character sheet: {r} ? Compare face, age, body shape, outfit and colors.'}
        Q[f'age_{k}'] = {'type': 'noul', 'instructions': f'Does the character {pos[k]} of `scene` look like this description, including age and size: {desc}?'}
    Q['entiers'] = {'type': 'noul', 'instructions': 'Are all the main characters of `scene` fully inside the frame, with no head, hand or foot cut off by the image border?'}
    Q['tailles'] = {'type': 'score', 'instructions': 'How coherent are the relative sizes of the characters in `scene` with their ages and with the furniture and buildings?',
                    'criteria': ['Incoherent: a child is as tall as an adult, or a person is a giant or tiny compared to doors and chairs.', 'Doubtful: some size looks a bit off.', 'Coherent: all sizes are natural for their ages and the surroundings.']}
    Q['texte'] = {'type': 'noul', 'instructions': 'Does `scene` contain readable written words or letters (signs, labels, captions)?'}
    Q['nombre'] = {'type': 'noul', 'instructions': f'Does `scene` show exactly {len(acteurs)} people, with no extra person anywhere?'}
    Q['lieu'] = {'type': 'choice', 'instructions': 'Which place does `scene` show?', 'criteria': {
        'Cour': 'the outdoor courtyard of a family house', 'Maquis': 'an open-air restaurant or bar with tables', 'Marché': 'a market with stalls',
        'Salon': 'an indoor living room', 'Rue': 'a street or road', 'Village': 'a rural village with huts', 'Autre': 'another place'}}
    Q['style'] = {'type': 'noul', 'instructions': '`scene` looks like a still from a 3D animated feature film (Pixar style), with consistent lighting and one coherent style for characters and background.'}
    body = {'model': 'jev-1.14.0', 'state': {'scene': ref_s}, 'assets': assets, 'questions': Q}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
    a = json.loads(urllib.request.urlopen(req, timeout=120).read())['answers']
    g = lambda k: a[k].get('noul', 0)
    res = {'identite': [round(g(f'id_{k}'), 2) for k in range(len(acteurs))], 'description': [round(g(f'age_{k}'), 2) for k in range(len(acteurs))],
           'entiers': round(g('entiers'), 2), 'texte': round(g('texte'), 2), 'nombre_exact': round(g('nombre'), 2), 'style': round(g('style'), 2),
           'tailles': a['tailles'].get('score'), 'lieu': a['lieu'].get('choice'), 'lieu_attendu': lieu}
    ok = min(res['identite']) >= 0.5 and min(res['description']) >= 0.5 and res['entiers'] >= 0.5 and res['nombre_exact'] >= 0.5 and res['lieu'] == lieu
    res['note'] = round(sum(res['identite']) / len(acteurs) + sum(res['description']) / len(acteurs) + res['entiers'] + res['nombre_exact'] + res['style'] - res['texte'] + (1 if res['lieu'] == lieu else 0), 2)
    res['valide'] = ok
    return res
if __name__ == '__main__':
    sys.path.insert(0, 'outils'); from adn import ADN
    cfg = json.loads(sys.argv[1])
    for scene in sys.argv[2:]:
        try: print(scene, json.dumps(juge(scene, [(n, ADN[n]) for n in cfg['acteurs']], cfg['lieu']), ensure_ascii=False))
        except Exception as e: print(scene, 'ERREUR', e)
