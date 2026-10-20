# VITRINE DE LA FABRIQUE (20/10/2026) — l'application et ses données, servies par GitHub Pages depuis le dépôt de
# l'utilisateur, sans Claude. Tout ce qui est privé y est SCELLÉ (coffre.py) : la page publique ne montre rien sans la phrase.
#   index.html          application (vidéothèque, téléchargement ≤ 15 Mo, légende, « Déjà publiée », doublons, chiffres)
#   cle.pub.pem         clé publique (sceller sans la phrase) ; cle.priv.json : clé privée chiffrée par la phrase
#   catalogue.msb       toutes les fiches (titre, légende, statut, créneau, doublons) — jusqu'à 10 000
#   videos/<id>.msb     les FENETRE vidéos les plus récentes ; affiches/<id>.msb : leur image
#   archives.json       vidéos sorties de la fenêtre (Pages : 1 Go au plus), rangées dans une « release » GitHub
# GitHub Pages limite un site à 1 Go : FENETRE (config.json) vidéos de 15 Mo au plus restent en ligne, les plus anciennes
# partent en archive (release « fabrique-archives », fichiers .msb ouverts par l'application depuis le téléphone).
#   python3 vitrine.py construit BIBLIO SITE CLES     (CLES : dossier de cle.pub.pem et cle.priv.json)
import json, os, shutil, sys

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import coffre


def construit(biblio, site, cles):
    C = json.load(open(os.path.join(ICI, 'config.json'), encoding='utf-8')); fen = int(C.get('fenetre_videos', 45))
    liv = os.path.join(biblio, 'livraison'); pub = coffre._pub(os.path.join(cles, 'cle.pub.pem'))
    os.makedirs(os.path.join(site, 'videos'), exist_ok=True); os.makedirs(os.path.join(site, 'affiches'), exist_ok=True)
    for f in ('cle.pub.pem', 'cle.priv.json'):
        if os.path.abspath(cles) != os.path.abspath(site): shutil.copy(os.path.join(cles, f), os.path.join(site, f))
    shutil.copy(os.path.join(ICI, 'index.html'), os.path.join(site, 'index.html'))
    open(os.path.join(site, '.nojekyll'), 'w').close()
    F = [json.load(open(os.path.join(liv, f), encoding='utf-8')) for f in sorted(os.listdir(liv))
         if f.endswith('.json') and not f.endswith('.emp.json')] if os.path.isdir(liv) else []
    F.sort(key=lambda x: str(x.get('livree')))
    en_ligne = {x['id'] for x in F[-fen:]}
    archives = json.load(open(os.path.join(site, 'archives.json'))) if os.path.isfile(os.path.join(site, 'archives.json')) else {}
    cat = []
    for k, x in enumerate(F):
        i = x['id']; v, a = f'videos/{i}.msb', f'affiches/{i}.msb'
        if i in en_ligne:
            for src, dst in ((x.get('video'), v), (x.get('affiche'), a)):
                if src and os.path.isfile(src) and not os.path.isfile(os.path.join(site, dst)):
                    open(os.path.join(site, dst), 'wb').write(coffre.scelle_octets(open(src, 'rb').read(), pub))
        else:   # sortie de la fenêtre : les fichiers scellés passent dans « archiver/ », que le flux GitHub verse en release
            arch = os.path.join(os.path.dirname(os.path.abspath(site)), 'archiver'); os.makedirs(arch, exist_ok=True)
            for dst, nom in ((v, f'{i}.msb'), (a, f'{i}-affiche.msb')):
                if os.path.isfile(os.path.join(site, dst)):
                    os.replace(os.path.join(site, dst), os.path.join(arch, nom))
                    archives.setdefault(i, {})['video' if dst == v else 'affiche'] = nom
        cat.append({k_: x.get(k_) for k_ in ('id', 'titre', 'legende', 'statut', 'creneau', 'doublon_de', 'ressemblance', 'duree_s',
                                              'portes', 'a_publier', 'livree', 'publiee', 'sketchs', 'motifs')}
                   | {'taille_mo': (x.get('version_tel') or {}).get('taille_mo'), 'ssim': (x.get('version_tel') or {}).get('ssim'), 'ordre': k + 1,
                      'video': v if i in en_ligne else None, 'affiche': a if i in en_ligne else None, 'archive': archives.get(i)})
    corps = json.dumps({'maj': coffre_maj(), 'config': {k_: C[k_] for k_ in ('cadence', 'creneaux', 'fuseau', 'fenetre_videos')}, 'videos': cat},
                       ensure_ascii=False).encode()
    open(os.path.join(site, 'catalogue.msb'), 'wb').write(coffre.scelle_octets(corps, pub))
    json.dump(archives, open(os.path.join(site, 'archives.json'), 'w'), indent=1)
    # état PUBLIC (rien de privé : des heures de créneaux et des nombres) — la tâche horaire de GitHub y lit s'il faut produire
    json.dump({'maj': coffre_maj(), 'videos': len(cat), 'creneaux_a_venir': sorted(x['creneau'] for x in F if x.get('statut') == 'pret' and x.get('creneau'))},
              open(os.path.join(site, 'etat-public.json'), 'w'), indent=1)
    return {'videos': len(cat), 'en_ligne': len(en_ligne), 'archives': len(archives)}


def coffre_maj():
    import datetime
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='minutes')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == 'construit': print(json.dumps(construit(a[1], a[2], a[3]), ensure_ascii=False))
    else: print(open(__file__, encoding='utf-8').read().split('import json')[0])
