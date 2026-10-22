# Fiches de la nouvelle troupe pour la bibliothèque de personnages d'AI Motion Studio (22/10/2026, « peux tu utiliser après
# notre nouvelle troupe à l'application »).
#   python3 outils/troupe.py [choix.json …]
# → js/troupe-donnees.js : fiches (texte seulement, versionné) — 41 duos du catalogue (métier, ressort comique) + duos déjà
#   dessinés (allure lue dans la consigne de dessin) ;
# → prive/troupe-images.js : vignettes JPEG des scènes dessinées (images AI Horde, Z-Image-Turbo Apache-2.0), JAMAIS dans
#   le dépôt public (dossier prive/ ignoré par git) ; l'assembleur les embarque dans le HTML livré s'il les trouve.
import base64, io, json, os, re, sys
ICI = os.path.dirname(os.path.abspath(__file__)); APP = os.path.dirname(ICI)
sys.path.insert(0, os.path.join(APP, '..', 'moteur-troupe'))
import catalogue_lieux as CL


def perso(t, cote, lieu, scene):
    nom, genre, age = t[0], t[1], int(t[2])
    d = {'id': re.sub(r'[^a-z0-9]+', '-', nom.lower().encode('ascii', 'ignore').decode()).strip('-') or nom.lower(),
         'nom': nom, 'genre': genre, 'age': age, 'lieu': lieu, 'scene': scene, 'cote': cote}
    if len(t) >= 6: d.update({'allure': t[3], 'metier': t[4], 'ressort': t[5]})
    return d


def allure(desc, cote):
    m = re.search(r'%s: (.*?)(?:\. (?:LEFT|RIGHT):|\.$)' % cote, desc)
    return m.group(1).strip() if m else ''


def principal():
    duos = []
    for L in CL.LIEUX:
        duos.append({'scene': L['nom'], 'lieu': L['lieu'], 'decor': L['decor'], 'dessine': False,
                     'personnages': [perso(L['a'], 'gauche', L['lieu'], L['nom']), perso(L['b'], 'droite', L['lieu'], L['nom'])]})
    images = {}
    for f in sys.argv[1:]:
        for nom, v in json.load(open(f, encoding='utf-8')).items():
            if any(d['scene'] == nom for d in duos): continue
            desc = v.get('description', ''); ac = v.get('acteurs', [])
            decor = re.sub(r'^Exactly two adults[^.]*\.\s*', '', desc).split(' LEFT:')[0].strip()
            ps = []
            for i, a in enumerate(ac[:2]):
                p = perso(a, 'gauche' if i == 0 else 'droite', nom.replace('-', ' '), nom)
                p['allure'] = allure(desc, 'LEFT' if i == 0 else 'RIGHT'); ps.append(p)
            duos.append({'scene': nom, 'lieu': nom.replace('-', ' '), 'decor': decor, 'dessine': bool(v.get('image')), 'personnages': ps})
            if v.get('image') and os.path.isfile(v['image']):
                from PIL import Image
                im = Image.open(v['image']).convert('RGB'); im.thumbnail((480, 480))
                b = io.BytesIO(); im.save(b, 'JPEG', quality=74, optimize=True)
                images[nom] = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
    noms = [p['nom'] for d in duos for p in d['personnages']]
    assert len(noms) == len(set(noms)), 'noms en double dans la troupe'
    entete = '/* MASSAMBA AI MOTION STUDIO — nouvelle troupe (généré par outils/troupe.py, ne pas modifier à la main). */\n'
    open(os.path.join(APP, 'js', 'troupe-donnees.js'), 'w', encoding='utf-8').write(
        entete + '(function (r) { r.MAMS = r.MAMS || {}; r.MAMS.TROUPE = ' + json.dumps(duos, ensure_ascii=False) + '; })(typeof self !== "undefined" ? self : this);\n')
    os.makedirs(os.path.join(APP, 'prive'), exist_ok=True)
    open(os.path.join(APP, 'prive', 'troupe-images.js'), 'w', encoding='utf-8').write(
        entete + '(function (r) { r.MAMS = r.MAMS || {}; r.MAMS.TROUPE_IMAGES = ' + json.dumps(images) + '; })(typeof self !== "undefined" ? self : this);\n')
    print(json.dumps({'duos': len(duos), 'personnages': len(noms), 'dessines': sum(d['dessine'] for d in duos), 'images': len(images),
                      'octets_images': sum(len(v) for v in images.values())}))


if __name__ == '__main__':
    principal()
