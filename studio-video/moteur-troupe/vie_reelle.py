# VIE RÉELLE PAR LA SOURCE (18/10/2026, « qu'on ait l'air de regarder la vie réelle »). Au lieu de repeindre les 4 000
# images d'un film (scintillement, GPU, heures), on rend photo-réelles les SOURCES que le moteur anime — la scène peinte de
# chaque lieu (image.png), d'où viennent le décor et les personnages — puis le moteur tourne le film comme d'habitude, sur
# notre processeur, avec les mêmes squelettes : la cohérence d'une image à l'autre est garantie par construction.
# Référence : RealMaster (arXiv 2603.23462, 2026) retouche des images-clés de rendus puis propage leur aspect ; ici, la
# propagation est faite par le moteur lui-même (squelette, déformations, visages), à coût nul.
# VOIE 1, par défaut (18/10/2026 soir, « je ne veux pas quelque chose où j'ai quelque chose à faire ») : NOTRE processeur.
# Rien ne sort du conteneur, aucun compte, aucun jeton, rien de payant. stable-diffusion.cpp (MIT, compilé ici) +
# FLUX.2 [klein] 4B (Apache-2.0, GGUF Q4_0) + Qwen3-4B (Apache-2.0, encodeur de texte) + VAE FLUX.2 (Apache-2.0).
# Édition par référence : la scène peinte entre en image de référence, la consigne demande la même composition en photo.
# Voie 2, secours : AI Horde (GPU de volontaires) — l'image sortirait du conteneur, donc seulement avec accord explicite.
#   python3 vie_reelle.py installe                               → modèles + moteur (une fois ; ≈ 1 min de téléchargement)
#   python3 vie_reelle.py photo <scene.png> <sortie.png> [largeur] [graine] [identité…]   → voie 1
#   python3 vie_reelle.py lieu <dossier prep> <lieu> [identité…]  → prep/<lieu>-reel prêt à tourner (photo + préparation)
#   python3 vie_reelle.py essai <scene.png> <sortie.png> [modèle] [force] [controle]    → voie 2 (accord requis)
#   python3 vie_reelle.py mesure <origine.png> <photo.png>      → alignement des contours (la condition pour réutiliser le rig)
import base64, io, json, os, shutil, subprocess, sys, time, urllib.request
import numpy as np, cv2

PHOTO = os.path.expanduser(os.environ.get('VIE_REELLE_MODELES', '~/.cache/massamba-models/photo'))
TEXTE = os.environ.get('VIE_REELLE_TEXTE', '/dev/shm/massamba')   # encodeur de texte en mémoire vive : 2,5 Go de disque épargnés
HF = 'https://huggingface.co'
FICHIERS = {   # nom local → (dossier, adresse) ; licences vérifiées sur les fiches des dépôts (Apache-2.0, sans accès restreint)
    'flux-2-klein-4b-Q4_0.gguf': (PHOTO, f'{HF}/leejet/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q4_0.gguf'),
    'flux2-vae-diffusers.safetensors': (PHOTO, f'{HF}/black-forest-labs/FLUX.2-klein-4B/resolve/main/vae/diffusion_pytorch_model.safetensors'),
    'Qwen3-4B-Q4_K_M.gguf': (TEXTE, f'{HF}/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf'),
}
SDCPP = ('https://github.com/leejet/stable-diffusion.cpp', 'b13a48219d5cdf408edcb93da6cd69b612ed03d3')   # version mesurée
CONSIGNE = ('Make this a real photograph of real people. Same composition and framing, the same people at the same places '
            'with the same poses, gestures and clothes, the same buildings, objects and ground. Each person keeps exactly the '
            'same age, hair color and beard as in the image{identite}. Real human faces with realistic adult and child '
            'proportions and normal-sized eyes, real skin texture with pores, not a cartoon, not a 3D render. Natural light '
            'in Abidjan, Ivory Coast, documentary photo shot on a 35 mm lens, fine film grain.')


def _chemin(nom):
    return os.path.join(FICHIERS[nom][0], nom)


def installe(journal=print):
    """modèles manquants téléchargés en parallèle, moteur compilé pour ce processeur (une fois) ; idempotent."""
    t0 = time.time(); procs = []
    for nom, (d, url) in FICHIERS.items():
        if os.path.isfile(_chemin(nom)): continue
        os.makedirs(d, exist_ok=True)
        procs.append((nom, subprocess.Popen(['curl', '-sSLf', '--retry', '4', '-o', _chemin(nom) + '.part', url])))
    sd = os.path.join(PHOTO, 'bin', 'sd-cli')
    if not os.path.isfile(sd):
        src = os.path.join(PHOTO, 'sdcpp-src'); shutil.rmtree(src, ignore_errors=True)
        subprocess.run(['git', 'clone', '--recursive', '--shallow-submodules', SDCPP[0], src], check=True, capture_output=True)
        subprocess.run(['git', '-C', src, 'checkout', '--recurse-submodules', SDCPP[1]], check=True, capture_output=True)
        subprocess.run(['cmake', '-B', 'build', '-DCMAKE_BUILD_TYPE=Release', '-DSD_WEBP=OFF', '-DSD_WEBM=OFF'], cwd=src, check=True, capture_output=True)
        subprocess.run(['cmake', '--build', 'build', '--config', 'Release', '-j', str(os.cpu_count() or 4), '--target', 'sd-cli'], cwd=src, check=True, capture_output=True)
        os.makedirs(os.path.dirname(sd), exist_ok=True); shutil.copy2(os.path.join(src, 'build', 'bin', 'sd-cli'), sd)
        shutil.rmtree(src, ignore_errors=True)   # 700 Mo de compilation rendus au disque
    for nom, p in procs:
        if p.wait() != 0: raise RuntimeError(f'téléchargement de {nom} en échec (code {p.returncode})')
        os.replace(_chemin(nom) + '.part', _chemin(nom))
    journal(f'vie réelle : moteur et modèles prêts en {time.time() - t0:.0f} s')
    return sd


def photo(src, out, largeur=None, graine=1871, pas=4, identite='', consigne=None, fils=None, ref_largeur=768, journal=print):
    """VOIE 1 : la scène peinte devient une photo, même cadre, sur notre processeur. Dimensions multiples de 16 au plus
    près de l'origine (largeur = côté horizontal visé ; défaut : celui de l'origine) ; la photo est remise à la taille
    exacte de l'origine pour que tout le moteur (masques, squelettes, visages) s'y applique. La référence est réduite à
    ref_largeur : le coût d'un pas suit le nombre total de jetons (image + référence) ; mesuré sur la cour avec une
    référence de 768 px : 1152×896 en 2 685 s, contours 0,852, identité gardée."""
    sd = installe(journal=lambda *a: None)
    im = cv2.imread(src, cv2.IMREAD_COLOR); h, w = im.shape[:2]; L = int(largeur or w)
    W, H = int(round(L / 16)) * 16, int(round(L * h / w / 16)) * 16
    os.makedirs(os.path.dirname(os.path.abspath(out)) or '.', exist_ok=True)
    RW = min(W, int(round(ref_largeur / 16)) * 16); RH = int(round(RW * h / w / 16)) * 16
    ref = os.path.splitext(out)[0] + '-reference.png'; cv2.imwrite(ref, cv2.resize(im, (RW, RH), interpolation=cv2.INTER_AREA))
    p = (consigne or CONSIGNE).format(identite=f': {identite}' if identite else '')
    cmd = [sd, '--diffusion-model', _chemin('flux-2-klein-4b-Q4_0.gguf'), '--vae', _chemin('flux2-vae-diffusers.safetensors'),
           '--llm', _chemin('Qwen3-4B-Q4_K_M.gguf'), '--mmap', '-r', ref, '-p', p, '--cfg-scale', '1.0', '--sampling-method', 'euler',
           '--steps', str(pas), '-W', str(W), '-H', str(H), '--seed', str(graine), '-t', str(fils or os.cpu_count() or 4), '-o', out + '.brut.png']
    t0 = time.time(); r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.isfile(out + '.brut.png'):
        raise RuntimeError(f'vie réelle (voie 1) en échec : {(r.stderr or r.stdout)[-600:]}')
    ph = cv2.imread(out + '.brut.png', cv2.IMREAD_COLOR); os.remove(out + '.brut.png'); os.remove(ref)
    cv2.imwrite(out, cv2.resize(ph, (w, h), interpolation=cv2.INTER_LANCZOS4))
    res = {'voie': 'local · FLUX.2 klein 4B', 'taille_calcul': [W, H], 'reference': [RW, RH], 'graine': graine, 'pas': pas, 'secondes': round(time.time() - t0, 1),
           **mesure(src, out)}
    journal(f'vie réelle : {os.path.basename(src)} → {os.path.basename(out)} en {res["secondes"]} s, contours {res["contours_retrouves"]}')
    return res


def identite_auto(scene_json, W):
    """identité de chaque acteur pour la consigne, tirée des cartes d'adn.py et placée par sa position dans l'image : l'âge
    (1re proposition de la carte) et la pilosité (barbe, bouc, moustache, cheveux gris). Le reste de la carte (coiffure,
    tenue) n'est pas repris : la scène dessinée fait foi. Défaut corrigé (18/10/2026, maquis) : sans elle, Coumba (26 ans)
    sortait adolescente et Koffi (petit bouc) avec une barbe pleine."""
    import re, adn
    S = json.load(open(scene_json)); A = sorted(S['acteurs'], key=lambda a: a['bbox'][0]); out = []
    for i, a in enumerate(A):
        carte = adn.ADN.get(a['nom'], '')
        if not carte: continue
        bouts = [b.strip() for b in carte.split(',')]
        poils = [b for b in bouts[1:] if re.search(r'beard|goatee|moustache|grey hair|white hair|bald', b)]
        cx = (a['bbox'][0] + a['bbox'][2]) / 2 / W
        ou = 'on the left' if cx < 0.38 else ('on the right' if cx > 0.62 else 'in the middle')
        if len(A) > 1 and sum(1 for b in A if abs((b['bbox'][0] + b['bbox'][2]) / 2 / W - cx) < 0.12) > 1: ou = f'person {i + 1} from the left'
        out.append(f"{ou}: {', '.join([bouts[1]] + poils)}")
    return '; '.join(out)


def lieu(prep, nom, identite='', journal=print, **kw):
    """lieu préparé `prep/<nom>` → `prep/<nom>-reel` : photo de la scène (voie 1), puis la chaîne habituelle du moteur sur la
    photo — acteurs et masques (prepare_scene), squelettes et visages (prepare_rig), expressions (prepare_expressions).
    Les acteurs gardent leurs noms, de gauche à droite comme dans la scène peinte ; un film prend ce lieu en changeant
    seulement son dossier dans montage.json. Chaque étape est sautée si son résultat existe (reprise après arrêt)."""
    # calcul allégé par défaut (18/10/2026, « c'est trop long ») : 864 px, 3 pas, référence 576 px — mesuré 1 026 à 1 071 s par
    # lieu (contours 0,938 maquis, 0,975 chambre) contre 2 685 s en pleine taille (cour, 0,852) ; VIE_REELLE_PLEINE=1 pour 1152 px
    if os.environ.get('VIE_REELLE_PLEINE') != '1':
        kw.setdefault('largeur', 864); kw.setdefault('pas', 3); kw.setdefault('ref_largeur', 576)
    src, dst = os.path.join(prep, nom), os.path.join(prep, f'{nom}-reel'); os.makedirs(dst, exist_ok=True)
    S = json.load(open(f'{src}/scene.json')); noms = [a['nom'] for a in sorted(S['acteurs'], key=lambda a: a['bbox'][0])]
    ph, T = f'{dst}/photo.png', {}
    if not identite:
        identite = identite_auto(f'{src}/scene.json', cv2.imread(f'{src}/image.png').shape[1]); journal(f'identité : {identite}')
    if not os.path.isfile(ph):
        json.dump(photo(f'{src}/image.png', ph, identite=identite, journal=journal, **kw), open(f'{dst}/photo.json', 'w'), ensure_ascii=False)
    ici = os.path.dirname(os.path.abspath(__file__))
    slugs = lambda: [a['slug'] for a in json.load(open(f'{dst}/scene.json'))['acteurs']]
    for script, args, fait in (('prepare_scene.py', [ph, dst, ','.join(noms)], lambda: os.path.isfile(f'{dst}/scene.json')),
                               ('prepare_rig.py', [dst], lambda: os.path.isfile(f'{dst}/rig/scene_rig.json')),   # écrit en dernier
                               ('prepare_expressions.py', [dst], lambda: all(os.path.isfile(f'{dst}/expressions/{s}/meta.json') for s in slugs()))):
        if fait(): continue
        env = dict(os.environ, EXPRESSIONS_RECETTES_DE=src)   # mêmes personnages : recettes du lieu dessiné reprises
        t0 = time.time(); r = subprocess.run([sys.executable, os.path.join(ici, script), *args], capture_output=True, text=True, cwd=ici, env=env)
        if r.returncode: raise RuntimeError(f'{script} en échec sur {dst} :\n{(r.stderr or r.stdout)[-1200:]}')
        T[script] = round(time.time() - t0); journal(f'{script} : {T[script]} s · {r.stdout.strip()[-300:]}')
    return {'lieu': dst, 'acteurs': noms, 'durees_s': T}

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
    if a[0] == 'installe': installe()
    elif a[0] == 'lieu': print(json.dumps(lieu(a[1], a[2], identite=' '.join(a[3:])), ensure_ascii=False))
    elif a[0] == 'photo':
        print(json.dumps(photo(a[1], a[2], *([int(a[3])] if len(a) > 3 else []), *([int(a[4])] if len(a) > 4 else []),
                               identite=' '.join(a[5:])), ensure_ascii=False))
    elif a[0] == 'essai':
        print(json.dumps(essai(a[1], a[2], *(a[3:4] or ["ICBINP - I Can't Believe It's Not Photography"]),
                               *( [float(a[4])] if len(a) > 4 else []), *([a[5] if a[5] != '-' else None] if len(a) > 5 else [])), ensure_ascii=False))
    elif a[0] == 'mesure': print(json.dumps(mesure(a[1], a[2])))
