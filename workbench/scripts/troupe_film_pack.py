# Builds dist/massamba-troupe-film.js, the new troupe's scenes for the Workbench film circuit (23/10/2026):
# every prep/<scene>/ of the moteur V1 library that has image.png + scene.json → { id, titre, acteurs, image (JPEG) }.
# The file lands in dist/ (ignored by git: the repository is public) and is delivered next to the app.
#   python3 scripts/troupe_film_pack.py [library]   (default: $MASSAMBA_BIBLIO, else ~/massamba-bibliotheque)
import base64, io, json, os, sys
from PIL import Image

LIB = os.path.realpath(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else os.environ.get('MASSAMBA_BIBLIO', '~/massamba-bibliotheque')))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist', 'massamba-troupe-film.js')
LIMIT = 27 * 1024 * 1024  # under the 30 MiB a delivered file may weigh
WORDS = {'reel': 'réaliste', 'v2': 'version 2', 'n1': 'nouvelle'}


def titre(nom):
    parts = [p for p in nom.replace('--', ' — ').split('-') if p]
    t = ' '.join(WORDS.get(p, p) for p in parts)
    return t[:1].upper() + t[1:]


def main():
    prep = os.path.join(LIB, 'prep')
    if not os.path.isdir(prep):
        sys.exit(f'bibliothèque introuvable : {prep}')
    scenes = []
    for nom in sorted(os.listdir(prep)):
        d = os.path.join(prep, nom)
        img, meta = os.path.join(d, 'image.png'), os.path.join(d, 'scene.json')
        if not (os.path.isfile(img) and os.path.isfile(meta)):
            continue
        acteurs = [a if isinstance(a, str) else a.get('nom', '') for a in json.load(open(meta, encoding='utf-8')).get('acteurs', [])]
        im = Image.open(img).convert('RGB')
        im.thumbnail((1280, 1280))
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=88, optimize=True)
        scenes.append({'id': nom, 'titre': titre(nom), 'acteurs': [a for a in acteurs if a],
                       'image': 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()})
    js = 'window.MASSAMBA_TROUPE_FILM=' + json.dumps({'version': '2026-10-23', 'scenes': scenes}, ensure_ascii=False) + ';\n'
    if len(js.encode()) > LIMIT:
        sys.exit(f'paquet trop lourd ({len(js.encode()) / 1048576:.1f} Mio)')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(js)
    print(f'{len(scenes)} scènes → {os.path.relpath(OUT)} ({len(js.encode()) / 1048576:.1f} Mio)')


if __name__ == '__main__':
    main()
