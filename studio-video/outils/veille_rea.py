# VEILLE PERMANENTE REA, SANS LIMITE (18/10/2026) — consignes de l'utilisateur : « veille permanente REA chaque minute » ;
# « ne donne pas de limite à REA, demande-lui de chercher tous les moteurs disponibles du monde ».
# Chaque minute, le veilleur parcourt la page suivante de chaque source, sur tous nos thèmes (animation, vidéo, 3D, visage,
# corps, voix, lèvres, physique, rendu, montage…) :
#   · npm (moteurs JavaScript) : versions nouvelles des moteurs suivis + recherche paginée jusqu'au bout de chaque thème ;
#   · GitHub (dépôts par sujet, triés par étoiles, licence lue dans la réponse) ;
#   · Hugging Face (modèles ouverts par tâche : image → vidéo, texte → vidéo, voix, profondeur, segmentation…).
# Tout ce que REA sait démonter (paquets JavaScript) passe par REA en continu, sur deux voies parallèles ; les dépôts et les
# modèles sont catalogués avec leur licence. Licences greffables chez nous : MIT, Apache-2.0, BSD (CLAUDE.md) ; les autres
# sont catalogués et marqués « non greffable ». Aucun appel de modèle : coût nul. Seul garde-fou : le disque du conteneur
# (pas d'analyse sous 300 Mo libres, elle reprend dès que la place revient).
#   python3 outils/veille_rea.py <dossier de travail> [--une-fois]
import json, os, re, shutil, subprocess, sys, tarfile, tempfile, threading, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

DOSSIER = sys.argv[1]
UNE_FOIS = '--une-fois' in sys.argv
os.makedirs(DOSSIER, exist_ok=True)
JOURNAL, ETAT, RESUME = (os.path.join(DOSSIER, f) for f in ('journal.jsonl', 'etat.json', 'veille.md'))
SUIVIS = ['pixi-dragonbones', 'lottie-web', '@mediapipe/tasks-vision', '@huggingface/transformers', '@theatre/core',
          '@rive-app/canvas', 'kalidokit', '@pixiv/three-vrm', 'wawa-lipsync', '@met4citizen/talkinghead', 'popmotion', 'three']
THEMES = [
    'animation engine', 'skeletal animation', 'skeletal animation 2d mesh', 'sprite animation', 'puppet warp arap', 'mesh deformation',
    'inverse kinematics', 'spring physics animation', 'secondary motion spring bone', 'physics engine', 'cloth simulation',
    'hair simulation', 'soft body', 'particles', 'fluid simulation', 'tweening', 'easing', 'keyframe animation', 'motion graphics',
    'character animation', 'avatar', 'vrm', 'talking head', 'talking head avatar', 'lipsync', 'lipsync viseme', 'viseme', 'face animation',
    'face animation blendshapes', 'facial expression', 'eye tracking gaze', 'pose estimation', 'pose retargeting mediapipe',
    'motion capture', 'motion capture bvh', 'retargeting', 'gesture', 'image to video', 'text to video', 'video generation',
    'video editing', 'video compositing', 'chroma key', 'background removal', 'segmentation', 'depth estimation', 'optical flow',
    'frame interpolation', 'super resolution', 'webgl renderer', 'webgpu renderer', 'gaussian splatting', 'nerf', '3d engine',
    'game engine 2d', 'game engine 3d', 'camera animation', 'timeline editor', 'subtitles', 'text to speech', 'speech synthesis',
    'voice cloning', 'audio visualizer', 'beat detection', 'music generation', 'sound effects', 'mp4 muxer', 'webcodecs',
]
SUJETS_GITHUB = [
    'animation', 'skeletal-animation', 'character-animation', 'motion-generation', 'motion-capture', 'pose-estimation',
    'inverse-kinematics', 'physics-engine', 'cloth-simulation', 'lip-sync', 'lipsync', 'talking-head', 'talking-face',
    'face-animation', 'facial-animation', 'avatar', 'image-to-video', 'video-generation', 'text-to-video', 'video-diffusion',
    'frame-interpolation', 'video-editing', 'segmentation', 'depth-estimation', 'gaussian-splatting', 'nerf', '3d-animation',
    'rendering-engine', 'game-engine', 'text-to-speech', 'voice-cloning', 'speech-synthesis', 'audio-driven', 'portrait-animation',
]
TACHES_HF = ['image-to-video', 'text-to-video', 'text-to-speech', 'depth-estimation', 'image-segmentation', 'mask-generation',
             'image-to-3d', 'text-to-3d', 'video-classification', 'keypoint-detection', 'audio-to-audio', 'image-to-image']
GREFFABLE = re.compile(r'(?i)^(MIT|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|apache-2\.0|mit|bsd-3-clause|bsd-2-clause)$')
CAPACITES = re.compile(r'(?i)\b(viseme|lipsync|phoneme|spring|damping|stiffness|ikconstraint|ccd|bone|skin|weight|blend|mesh|'
                       r'pose|landmark|retarget|mouth|blink|gaze|easing|bezier|physics|cloth|collider|segment|depth|video)\w*')
DISQUE_MIN = 300e6
VOIES = 2
verrou = threading.Lock()
# PERTINENCE POUR L'ANIMATION (18/10/2026, « cherche les outils d'animation très rapidement ») : la recherche ramène surtout
# des lecteurs vidéo et des composants d'interface ; chaque moteur reçoit une note (mots de son nom et de sa description,
# pondérés par ce qui manque au moteur de la troupe) multipliée par sa popularité. REA démonte d'abord les mieux notés et
# le résumé les classe en tête ; une note sous SEUIL_REA ne va pas jusqu'à REA (catalogué seulement).
PERTINENT = [(r'lip.?sync|visem|phonem', 6), (r'talking.?(head|face|avatar)|audio.?driven', 6), (r'skeletal|skeleton.{0,12}(anim|rig|pose|track)|\bbones?\b|skinning|\brig(ging)?\b', 4),
             (r'inverse.?kinematic|\bik\b|\bccd\b|\bfabrik\b', 4), (r'spring|damping', 3), (r'mocap|motion.?capture|\bbvh\b|retarget', 5),
             (r'pose|landmark|holistic|blend.?shape', 3), (r'facial|face.?(mesh|anim|track)|(face|facial).{0,15}expression|blink|gaze', 4),
             (r'live2d|esotericsoftware|spine.?(runtime|anim|2d)|dragonbones|\brive\b|lottie|puppet|\barap\b|mesh.?deform', 4), (r'\bavatars?\b|\bvrm\b|character.{0,15}anim', 3),
             (r'tween|easing|bezier|keyframe', 2), (r'kinematic', 2), (r'\bface\b|\beyes?\b|\bmouth\b', 2), (r'physic|cloth|soft.?body|collision|ragdoll', 2), (r'animat', 2),
             (r'image.?to.?video|video.?(generat|diffusion)|frame.?interpol|optical.?flow', 4), (r'segment|matting|depth', 2)]
BRUIT = re.compile(r'(?i)player|viewer|upload|download|thumbnail|crop|ckeditor|wordpress|cms|cordova|theme|template|boilerplate|test-|'
                   r'\bcron|\bglob|\benv\b|loader|placeholder|storage|datastore|mysql|deployment|schema|validation|form state')
SEUIL_REA = 4
# MODÈLE TÉLÉCHARGÉ PAR LE PAQUET (18/10/2026) : audio2afan est sous MIT mais télécharge le modèle Audio2Face-3D de NVIDIA
# (« NVIDIA Open Model License ») — la licence du code ne vaut pas pour les poids ; ces paquets sont signalés « poids à vérifier »
POIDS = re.compile(r'https?://[^\s\'"`]+\.(?:onnx|safetensors|gguf|tflite|pt|pth|ckpt|bin)\b')


_NOTES = {}


def renoter(e):
    """file héritée d'avant la notation : chaque moteur est noté sur la description gardée au journal ; le bruit sort de la file
    (il reste catalogué)."""
    desc = {}
    try:
        for l in open(JOURNAL):
            x = json.loads(l)
            if x.get('evenement') == 'nouveau moteur': desc[x.get('paquet')] = x.get('description') or ''
    except Exception:
        pass
    garde = []
    for nom in dict.fromkeys(e['file']):
        if nom in SUIVIS: e['notes'][nom] = 1e6; garde.append(nom); continue
        if nom not in e['notes']:
            p = pertinence(nom, desc.get(nom, ''))
            if p < SEUIL_REA: continue
            e['notes'][nom] = note_finale(p, 0)
        garde.append(nom)
    print(f'file renotée : {len(e["file"])} → {len(garde)} moteurs (seuil {SEUIL_REA})', flush=True)
    e['file'] = garde


def pertinence(nom, description=''):
    t = f'{nom} {description}'.lower()
    note = sum(p for motif, p in PERTINENT if re.search(motif, t))
    return max(0, note - (3 if BRUIT.search(t) else 0))


def note_finale(pert, populaire):
    import math
    return round(pert * (1 + math.log10(1 + max(0, populaire or 0))), 1)


def get_json(url, timeout=25):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'Accept': 'application/json', 'User-Agent': 'massamba-veille'}), timeout=timeout) as r:
        return json.load(r)


def lire_etat():
    try:
        e = json.load(open(ETAT))
    except Exception:
        e = {}
    for k, v in (('versions', {}), ('analyses', {}), ('file', []), ('connus', []), ('catalogue', {}), ('curseurs', {}), ('notes', {})):
        e.setdefault(k, v)
    return e


def ecrire(e):
    with verrou:
        json.dump(e, open(ETAT, 'w'), ensure_ascii=False, indent=1)


def noter(ev):
    ev['t'] = time.strftime('%Y-%m-%d %H:%M:%S')
    with verrou, open(JOURNAL, 'a') as f:
        f.write(json.dumps(ev, ensure_ascii=False) + '\n')
    print(ev['t'], ev.get('evenement'), ev.get('source', 'npm'), ev.get('paquet'), ev.get('version', ''), flush=True)


def resume(e):
    try:
        lignes = [json.loads(l) for l in open(JOURNAL)]
    except Exception:
        return
    par_source = {}
    for x in lignes:
        par_source[x.get('source', 'npm')] = par_source.get(x.get('source', 'npm'), 0) + 1
    rea = [x for x in lignes if x.get('evenement') == 'analyse REA' and x.get('preuve')]
    # classement « animation » : note de pertinence × popularité (recalculée une fois par moteur pour l'ancien journal)
    infos = {}
    for x in lignes:
        if x.get('evenement') != 'nouveau moteur': continue
        nom = x.get('paquet') or ''
        if nom not in _NOTES:
            ctx = x.get('description') or ''
            if x.get('source') != 'npm': ctx += ' ' + str(x.get('theme', '')).replace('-', ' ')
            _NOTES[nom] = x['note'] if x.get('note') is not None else note_finale(pertinence(nom, ctx), x.get('etoiles') or x.get('telechargements') or x.get('telechargements_mois') or 0)
        if _NOTES[nom] > 0: infos[nom] = x
    preuves = {x.get('paquet'): x for x in rea}
    top = sorted(infos.values(), key=lambda x: -_NOTES[x.get('paquet') or ''])[:40]
    out = ['# Veille permanente REA, sans limite', '',
           f"Événements : {len(lignes)} ({', '.join(f'{k} {v}' for k, v in sorted(par_source.items()))}) · moteurs connus : "
           f"{len(e['connus']) + len(e['catalogue'])} · analysés par REA : {len(rea)} · en file : {len(e['file'])}", '',
           '## Classement animation (les mieux notés d\'abord : pertinence pour la troupe × popularité)', '',
           '| Rang | Moteur | Source | Licence | Greffable | Note | Popularité | Preuve REA | Description |', '|---|---|---|---|---|---|---|---|---|']
    for i, x in enumerate(top, 1):
        nom = x.get('paquet'); pop = x.get('etoiles') or x.get('telechargements') or x.get('telechargements_mois') or ''
        out.append(f"| {i} | {nom} | {x.get('source', 'npm')} | {x.get('licence', '')} | {'oui' if GREFFABLE.match(str(x.get('licence', ''))) else 'non'} | "
                   f"{_NOTES[nom]} | {pop} | {((preuves.get(nom) or {}).get('preuve') or '')[:14]} | {(x.get('description') or '')[:90].replace('|', '/')} |")
    out += ['', '## Derniers événements', '',
            '| Heure | Événement | Source | Moteur | Version | Licence | Greffable | Preuve REA | Capacités vues |', '|---|---|---|---|---|---|---|---|---|']
    for x in reversed(lignes[-25:]):
        caps = ', '.join(m['mot'] for m in (x.get('motifs') or [])[:6])
        out.append(f"| {x['t']} | {x.get('evenement')} | {x.get('source', 'npm')} | {x.get('paquet')} | {x.get('version', '')} | "
                   f"{x.get('licence', '')} | {'oui' if GREFFABLE.match(str(x.get('licence', ''))) else 'non'} | {(x.get('preuve') or '')[:14]} | {caps} |")
    open(RESUME, 'w').write('\n'.join(out) + '\n')


def principal(racine, pj):
    for cle in ('module', 'main', 'browser'):
        v = pj.get(cle)
        if isinstance(v, str):
            for cand in (v, v + '.js', os.path.join(v, 'index.js')):
                if os.path.isfile(os.path.join(racine, cand)) and cand.endswith(('.js', '.mjs', '.cjs')):
                    return os.path.normpath(cand)
    best = None
    for d, _, fs in os.walk(racine):
        for f in fs:
            if f.endswith(('.js', '.mjs', '.cjs')) and '.min.' not in f and 'node_modules' not in d:
                p = os.path.join(d, f); s = os.path.getsize(p)
                if best is None or s > best[0]: best = (s, os.path.relpath(p, racine))
    return best[1] if best else None


def analyser(nom, version):
    """npm pack → REA → statistiques + capacités vues ; tout est supprimé ensuite."""
    if shutil.disk_usage(DOSSIER).free < DISQUE_MIN:
        return {'erreur': 'disque sous 300 Mo : analyse remise'}
    tmp = tempfile.mkdtemp(prefix='rea-', dir=DOSSIER); t0 = time.time()
    try:
        p = subprocess.run(['npm', 'pack', f'{nom}@{version}', '--silent'], cwd=tmp, capture_output=True, text=True, timeout=180)
        tgz = [f for f in os.listdir(tmp) if f.endswith('.tgz')]
        if not tgz: return {'erreur': 'npm pack : ' + p.stderr[-200:]}
        with tarfile.open(os.path.join(tmp, tgz[0])) as t:
            t.extractall(tmp, members=[m for m in t.getmembers() if m.isfile() and not m.name.endswith(
                ('.wasm', '.map', '.glb', '.gltf', '.png', '.jpg', '.mp4', '.onnx', '.bin', '.tflite', '.data'))], filter='data')
        racine = os.path.join(tmp, 'package'); pj = json.load(open(os.path.join(racine, 'package.json')))
        src = principal(racine, pj)
        if not src: return {'erreur': 'aucun fichier JavaScript'}
        sortie = os.path.join(tmp, 'ev.json')
        with open(sortie, 'w') as f:
            subprocess.run(['rea', 'analyze-javascript-application', racine, '--source-path', src, '--format', 'json'],
                           stdout=f, stderr=subprocess.DEVNULL, timeout=900)
        ev = json.load(open(sortie)); nr = ev.get('normalized_result') or {}; st = nr.get('statistics') or {}
        compte = {}
        for nd in (nr.get('semantic_graph') or {}).get('nodes', []):
            for m in CAPACITES.finditer(json.dumps(nd.get('identity', {}), ensure_ascii=False)):
                k = m.group(0).lower(); compte[k] = compte.get(k, 0) + 1
        poids = sorted({m.group(0)[:160] for d, _, fs in os.walk(racine) for f in fs if f.endswith(('.js', '.mjs', '.cjs'))
                        for m in POIDS.finditer(open(os.path.join(d, f), errors='ignore').read())})[:5]
        return {'preuve': ev.get('evidence_id'), 'source_js': src, 'duree_s': round(time.time() - t0, 1), 'poids_telecharges': poids,
                'stats': {k: st.get(k) for k in ('visited_ast_nodes', 'findings', 'parsed_javascript_files')},
                'motifs': [{'mot': k, 'n': n} for k, n in sorted(compte.items(), key=lambda kv: -kv[1])[:12]]}
    except Exception as ex:
        return {'erreur': str(ex)[:200]}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def page_suivante(e, cle, total):
    c = e['curseurs'].get(cle, 0)
    if total is not None and c >= total: c = 0          # fin du thème : on recommence (nouveautés)
    return c


def chercher_npm(e, th):
    cle = f'npm:{th}'; debut = page_suivante(e, cle, e['curseurs'].get(cle + ':total'))
    r = get_json('https://registry.npmjs.org/-/v1/search?' + urllib.parse.urlencode({'text': th, 'size': 250, 'from': debut}))
    e['curseurs'][cle] = debut + 250; e['curseurs'][cle + ':total'] = r.get('total', 0)
    for o in r.get('objects', []):
        pk = o['package']; nom = pk['name']; lic = str(pk.get('license', ''))
        if nom in e['connus'] or nom in SUIVIS: continue
        e['connus'].append(nom); e['versions'][nom] = pk.get('version')
        dl = (o.get('downloads') or {}).get('monthly') or 0
        pert = pertinence(nom, pk.get('description') or ''); note = note_finale(pert, dl)
        e['notes'][nom] = note
        noter({'evenement': 'nouveau moteur', 'source': 'npm', 'paquet': nom, 'version': pk.get('version'), 'licence': lic,
               'theme': th, 'description': (pk.get('description') or '')[:160], 'telechargements_mois': dl, 'note': note})
        if GREFFABLE.match(lic) and pert >= SEUIL_REA: e['file'].append(nom)


def chercher_github(e, sujet):
    cle = f'gh:{sujet}'; page = e['curseurs'].get(cle, 0) % 10 + 1          # l'API de recherche s'arrête à 1 000 résultats
    q = f'topic:{sujet}'
    r = get_json('https://api.github.com/search/repositories?' + urllib.parse.urlencode({'q': q, 'sort': 'stars', 'order': 'desc', 'per_page': 100, 'page': page}))
    e['curseurs'][cle] = page
    for it in r.get('items', []):
        nom = it['full_name']
        if nom in e['catalogue']: continue
        lic = (it.get('license') or {}).get('spdx_id') or ''
        note = note_finale(pertinence(nom, f"{it.get('description') or ''} {' '.join(it.get('topics') or [])}"), it.get('stargazers_count'))
        e['catalogue'][nom] = {'source': 'github', 'licence': lic, 'etoiles': it.get('stargazers_count'), 'sujet': sujet, 'note': note,
                               'description': (it.get('description') or '')[:160]}
        noter({'evenement': 'nouveau moteur', 'source': 'github', 'paquet': nom, 'licence': lic, 'etoiles': it.get('stargazers_count'),
               'theme': sujet, 'description': (it.get('description') or '')[:160], 'langage': it.get('language'), 'note': note})


def chercher_hf(e, tache):
    cle = f'hf:{tache}'
    r = get_json('https://huggingface.co/api/models?' + urllib.parse.urlencode({'pipeline_tag': tache, 'sort': 'downloads', 'limit': 100, 'full': 'true'}))
    for m in r:
        nom = m.get('id') or m.get('modelId')
        if not nom or nom in e['catalogue']: continue
        lic = next((t.split(':', 1)[1] for t in m.get('tags', []) if t.startswith('license:')), '')
        note = note_finale(pertinence(nom, tache.replace('-', ' ')), m.get('downloads'))
        e['catalogue'][nom] = {'source': 'huggingface', 'licence': lic, 'telechargements': m.get('downloads'), 'tache': tache, 'note': note}
        noter({'evenement': 'nouveau moteur', 'source': 'huggingface', 'paquet': nom, 'licence': lic, 'theme': tache,
               'telechargements': m.get('downloads'), 'note': note})
    e['curseurs'][cle] = time.time()


def travailleur(e, nom):
    v = e['versions'].get(nom)
    if not v or f'{nom}@{v}' in e['analyses']: return
    r = analyser(nom, v)
    with verrou: e['analyses'][f'{nom}@{v}'] = r.get('preuve') or r.get('erreur')
    noter({'evenement': 'analyse REA', 'source': 'npm', 'paquet': nom, 'version': v, **r})


def cycle(e, pool, en_cours):
    # 1. versions nouvelles des moteurs suivis et des moteurs connus greffables (un passage complet par cycle)
    for nom in SUIVIS:
        try:
            d = get_json(f'https://registry.npmjs.org/{urllib.parse.quote(nom, safe="@")}/latest')
        except Exception:
            continue
        v = d.get('version')
        if v and e['versions'].get(nom) != v:
            if nom in e['versions']:
                noter({'evenement': 'nouvelle version', 'source': 'npm', 'paquet': nom, 'version': v, 'avant': e['versions'][nom], 'licence': d.get('license')})
            e['versions'][nom] = v
            if f'{nom}@{v}' not in e['analyses'] and nom not in e['file']: e['file'].insert(0, nom); e['notes'][nom] = 1e6
    # 2. recherches : page suivante de chaque thème npm, 8 sujets GitHub (quota sans compte : 10 recherches / min), 2 tâches HF
    k = int(e['curseurs'].get('tour', 0)); e['curseurs']['tour'] = k + 1
    for th in THEMES:
        try: chercher_npm(e, th)
        except Exception: pass
    for sujet in [SUJETS_GITHUB[(k * 8 + i) % len(SUJETS_GITHUB)] for i in range(8)]:
        try: chercher_github(e, sujet)
        except Exception: pass
    for tache in [TACHES_HF[(k * 2 + i) % len(TACHES_HF)] for i in range(2)]:
        try: chercher_hf(e, tache)
        except Exception: pass
    # 3. REA en continu : les voies libres prennent les moteurs les mieux notés
    with verrou: e['file'].sort(key=lambda n: -e['notes'].get(n, 0))
    en_cours[:] = [f for f in en_cours if not f.done()]
    while e['file'] and len(en_cours) < VOIES:
        en_cours.append(pool.submit(travailleur, e, e['file'].pop(0)))
    ecrire(e); resume(e)


if __name__ == '__main__':
    etat = lire_etat(); renoter(etat); en_cours = []
    with ThreadPoolExecutor(VOIES) as pool:
        while True:
            debut = time.time()
            try:
                cycle(etat, pool, en_cours)
            except Exception as ex:
                print('cycle :', ex, flush=True)
            if UNE_FOIS:
                for f in en_cours: f.result()
                break
            # entre deux cycles, les voies REA continuent ; on les relance dès qu'une se libère
            while time.time() - debut < 60:
                time.sleep(2)
                en_cours[:] = [f for f in en_cours if not f.done()]
                while etat['file'] and len(en_cours) < VOIES:
                    en_cours.append(pool.submit(travailleur, etat, etat['file'].pop(0)))
