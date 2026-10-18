# VIE RÉELLE PAR LA SOURCE (18/10/2026, « qu'on ait l'air de regarder la vie réelle »). Au lieu de repeindre les 4 000
# images d'un film (scintillement, GPU, heures), on rend photo-réelles les SOURCES que le moteur anime — la scène peinte de
# chaque lieu (image.png), d'où viennent le décor et les personnages — puis le moteur tourne le film comme d'habitude, sur
# notre processeur, avec les mêmes squelettes : la cohérence d'une image à l'autre est garantie par construction.
# Référence : RealMaster (arXiv 2603.23462, 2026) retouche des images-clés de rendus puis propage leur aspect ; ici, la
# propagation est faite par le moteur lui-même (squelette, déformations, visages), à coût nul.
# Voie gratuite : AI Horde (GPU communautaires, sans compte, clé anonyme), img2img guidé par les contours (ControlNet canny)
# pour garder la composition au pixel près. Aucun appel payant.
#   python3 vie_reelle.py essai <scene.png> <sortie.png> [modèle] [force] [controle]
#   python3 vie_reelle.py mesure <origine.png> <photo.png>      → alignement des contours (la condition pour réutiliser le rig)
import base64, io, json, os, sys, time, urllib.request
import numpy as np, cv2

HORDE = 'https://aihorde.net/api/v2'
CLE = os.environ.get('AIHORDE_KEY', '0000000000')   # anonyme par défaut (gratuit) ; une clé personnelle ne s'affiche jamais
AGENT = 'massamba-studio:1.0:troupe'
POSITIF = ('a real candid photograph, documentary photo, real people with natural skin texture, pores, real hair, real fabric '
           'with folds and weave, real wood, real metal, real ground, natural light, physically correct shadows, shot on a full-frame '
           'camera, 35 mm lens, fine film grain, Abidjan, Ivory Coast')
NEGATIF = ('cartoon, 3d render, pixar, disney, cgi, animation, illustration, painting, drawing, anime, doll, plastic skin, '
           'smooth skin, big eyes, toy, figurine, blurry, deformed, extra fingers, text, watermark')


def _req(methode, url, corps=None):
    r = urllib.request.Request(url, data=None if corps is None else json.dumps(corps).encode(), method=methode,
                               headers={'apikey': CLE, 'Client-Agent': AGENT, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(r, timeout=60) as f: return json.loads(f.read())


def taille_sd(w, h, cote=832):
    """dimensions multiples de 64 au plus près du rapport d'origine, plus grand côté = cote."""
    s = cote / max(w, h); return int(round(w * s / 64)) * 64, int(round(h * s / 64)) * 64


def essai(src, out, modele="ICBINP - I Can't Believe It's Not Photography", force=0.55, controle='canny', scene='', attente=900):
    # ACCORD EXPLICITE (18/10/2026) : AI Horde fait calculer l'image par des volontaires inconnus — l'image de la troupe sort
    # du conteneur. Rien ne part sans VIE_REELLE_ENVOI_AUTORISE=1, posé à la demande de l'utilisateur.
    if os.environ.get('VIE_REELLE_ENVOI_AUTORISE') != '1':
        raise SystemExit("envoi vers AI Horde refusé : l'image sortirait du conteneur ; accord de l'utilisateur requis (VIE_REELLE_ENVOI_AUTORISE=1)")
    im = cv2.imread(src, cv2.IMREAD_COLOR); h, w = im.shape[:2]; W, H = taille_sd(w, h)
    ok, buf = cv2.imencode('.webp', cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_WEBP_QUALITY, 95])
    params = {'sampler_name': 'k_dpmpp_2m', 'karras': True, 'cfg_scale': 6.0, 'denoising_strength': float(force), 'steps': 28,
              'width': W, 'height': H, 'seed': '1871', 'n': 1}
    if controle: params.update(control_type=controle, image_is_control=False, return_control_map=False)
    corps = {'prompt': f'{POSITIF}, {scene} ### {NEGATIF}', 'params': params, 'models': [modele], 'nsfw': False, 'censor_nsfw': True,
             'source_image': base64.b64encode(buf.tobytes()).decode(), 'source_processing': 'img2img', 'r2': True, 'shared': False}
    t0 = time.time(); j = _req('POST', f'{HORDE}/generate/async', corps); gid = j['id']
    while time.time() - t0 < attente:
        c = _req('GET', f'{HORDE}/generate/check/{gid}')
        if c.get('done'): break
        if c.get('faulted') or not c.get('is_possible', True): raise RuntimeError(f'AI Horde : demande impossible ({c})')
        time.sleep(6)
    st = _req('GET', f'{HORDE}/generate/status/{gid}')
    g = (st.get('generations') or [None])[0]
    if not g: raise RuntimeError(f'AI Horde : aucune image en {time.time() - t0:.0f} s ({st.get("faulted")})')
    data = urllib.request.urlopen(g['img'], timeout=120).read() if g['img'].startswith('http') else base64.b64decode(g['img'])
    ph = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    cv2.imwrite(out, cv2.resize(ph, (w, h), interpolation=cv2.INTER_CUBIC))
    return {'modele': modele, 'force': force, 'controle': controle, 'secondes': round(time.time() - t0, 1), 'travailleur': g.get('worker_name')}


def mesure(a, b):
    """part des contours de l'origine retrouvés (à 3 px près) dans la photo : la silhouette doit rester pour que le squelette,
    les masques et les visages déjà calculés s'appliquent tels quels."""
    A = cv2.imread(a, 0); B = cv2.resize(cv2.imread(b, 0), A.shape[::-1])
    ea, eb = cv2.Canny(cv2.GaussianBlur(A, (5, 5), 0), 60, 140), cv2.Canny(cv2.GaussianBlur(B, (5, 5), 0), 60, 140)
    db = cv2.dilate(eb, np.ones((7, 7), np.uint8)); rappel = float((ea & db).sum() / max(1, ea.sum()))
    return {'contours_retrouves': round(rappel, 3)}


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'essai':
        print(json.dumps(essai(a[1], a[2], *(a[3:4] or ["ICBINP - I Can't Believe It's Not Photography"]),
                               *( [float(a[4])] if len(a) > 4 else []), *([a[5] if a[5] != '-' else None] if len(a) > 5 else [])), ensure_ascii=False))
    elif a[0] == 'mesure': print(json.dumps(mesure(a[1], a[2])))
