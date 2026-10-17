# NOYAU « VUES À 360° » (17/10/2026) — tourne sur une carte graphique GRATUITE (Colab ou Kaggle), rien sur le PC :
#   1. installe ComfyUI (programme séparé, version figée) + ComfyUI-GGUF (Apache-2.0, version figée) dans /tmp ;
#   2. télécharge le kit de vues360.KIT (Apache-2.0) dans la version que la mémoire de la carte permet ;
#   3. tourne chaque fiche vers chaque azimut demandé (vues.json) et range chaque vue AUSSITÔT dans la sortie
#      (<sortie>/<personnage>/<azimut>.png) : une séance coupée reprend après la dernière vue finie ;
#   4. écrit mesures.json au fil de l'eau (carte, mémoire, secondes par vue, erreurs).
import json, os, subprocess, sys, time, urllib.request

E = os.environ.get('NOYAU_ENTREE', '/content/paquet'); S = os.environ.get('NOYAU_SORTIE', '/content/sortie-vues')
sys.path.insert(0, E)
import vues360 as V

COMFY_COMMIT = 'fc04da91b2ab12f99e4716371a7e4f98ac982597'   # ComfyUI 0.41.0 : nœuds Qwen-Image-Edit présents (vérifié le 17/10/2026)
GGUF_COMMIT = '6ea2651e7df66d7585f6ffee804b20e92fb38b8a'    # ComfyUI-GGUF : chargeur GGUF + partie vision (mmproj) de Qwen2.5-VL
CU = '/tmp/ComfyUI'; PORT = 8188; URL = f'http://127.0.0.1:{PORT}'
os.makedirs(S, exist_ok=True); MES = f'{S}/mesures.json'
M = json.load(open(MES)) if os.path.isfile(MES) else {'vues': {}, 'erreurs': []}


def ecrit():
    tmp = MES + '.tmp'; json.dump(M, open(tmp, 'w'), ensure_ascii=False, indent=1); os.replace(tmp, MES)


def lance(cmd, **kw):
    print('$', ' '.join(cmd)[:160], flush=True); return subprocess.run(cmd, **kw)


def installe():
    t0 = time.time()
    if not os.path.isdir(CU):
        lance(['git', 'clone', '-q', '--filter=blob:none', 'https://github.com/comfyanonymous/ComfyUI', CU])
    if lance(['git', '-C', CU, 'fetch', '-q', '--depth', '1', 'origin', COMFY_COMMIT]).returncode == 0: lance(['git', '-C', CU, 'checkout', '-q', 'FETCH_HEAD'])
    req = [l for l in open(f'{CU}/requirements.txt').read().splitlines() if l.strip() and not l.startswith(('torch', '#'))]   # PyTorch de la carte gardé
    lance([sys.executable, '-m', 'pip', 'install', '-q', *req])
    g = f'{CU}/custom_nodes/ComfyUI-GGUF'
    if not os.path.isdir(g): lance(['git', 'clone', '-q', 'https://github.com/city96/ComfyUI-GGUF', g])
    if lance(['git', '-C', g, 'fetch', '-q', '--depth', '1', 'origin', GGUF_COMMIT]).returncode == 0: lance(['git', '-C', g, 'checkout', '-q', 'FETCH_HEAD'])
    lance([sys.executable, '-m', 'pip', 'install', '-q', 'gguf>=0.10'])
    M['installation_s'] = round(time.time() - t0, 1); ecrit()


def memoire_go():
    try:
        r = subprocess.run(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], capture_output=True, text=True).stdout.strip().splitlines()[0]
        nom, mo = [x.strip() for x in r.split(',')]; M['carte'] = nom; return float(mo) / 1024
    except Exception:
        M['carte'] = 'inconnue'; return 0.0


def telecharge(cles):
    """téléchargements en parallèle, reprise possible (curl -C -), tailles vérifiées contre l'en-tête du serveur."""
    t0 = time.time(); procs = []
    for k in cles:
        depot, fichier, dossier, nom = V.KIT[k]; d = f'{CU}/models/{dossier}'; os.makedirs(d, exist_ok=True); dest = f'{d}/{nom}'
        url = f'{V.HF}/{depot}/resolve/main/{fichier}'
        procs.append((k, dest, subprocess.Popen(['curl', '-sSL', '--retry', '6', '--retry-delay', '5', '-C', '-', '-o', dest, url])))
    for k, dest, p in procs:
        p.wait(); taille = os.path.getsize(dest) if os.path.isfile(dest) else 0
        print(f'  {k} : {taille / 1e9:.2f} Go', flush=True)
        if taille < 1e6: M['erreurs'].append(f'téléchargement incomplet : {k}'); ecrit(); raise SystemExit(f'téléchargement incomplet : {k}')
    M['telechargement_s'] = round(time.time() - t0, 1); ecrit()


def serveur():
    log = open('/tmp/comfy.log', 'a')
    p = subprocess.Popen([sys.executable, 'main.py', '--listen', '127.0.0.1', '--port', str(PORT), '--disable-auto-launch'], cwd=CU, stdout=log, stderr=log)
    for _ in range(240):
        try:
            urllib.request.urlopen(URL + '/system_stats', timeout=5); return p
        except Exception:
            time.sleep(2)
            if p.poll() is not None: break
    raise SystemExit('ComfyUI ne démarre pas : voir /tmp/comfy.log')


def tourne(fiche, az, unet):
    nom = os.path.basename(fiche); os.makedirs(f'{CU}/input', exist_ok=True)
    if not os.path.isfile(f'{CU}/input/{nom}'):
        import shutil; shutil.copy(fiche, f'{CU}/input/{nom}')
    g = V.graphe(nom, az, unet)
    req = urllib.request.Request(URL + '/prompt', data=json.dumps({'prompt': g}).encode(), headers={'Content-Type': 'application/json'})
    t0 = time.time(); r = json.loads(urllib.request.urlopen(req, timeout=60).read())
    if r.get('node_errors'): raise RuntimeError(json.dumps(r['node_errors'])[:500])
    pid = r['prompt_id']
    while True:
        time.sleep(2)
        h = json.loads(urllib.request.urlopen(f'{URL}/history/{pid}', timeout=30).read())
        if pid in h:
            st = h[pid].get('status', {})
            if st.get('status_str') == 'error': raise RuntimeError(json.dumps(st)[:500])
            imgs = [i for o in h[pid].get('outputs', {}).values() for i in o.get('images', [])]
            if imgs: return f"{CU}/output/{imgs[0].get('subfolder', '')}/{imgs[0]['filename']}".replace('//', '/'), time.time() - t0
        if time.time() - t0 > 1800: raise RuntimeError('plus de 30 min pour une vue')


ESSAI = os.environ.get('VUES_ESSAI') == '1'   # essai à blanc hors carte : la boucle, la reprise et les mesures, sans rien télécharger


if __name__ == '__main__':
    cfg = json.load(open(f'{E}/vues.json'))
    if not ESSAI: installe()
    mem = memoire_go()
    unet = os.environ.get('VUES_UNET') or V.unet_pour(mem); M['unet'] = V.KIT[unet][3]; M['memoire_go'] = round(mem, 1); ecrit()
    print(f"carte {M['carte']} ({mem:.0f} Go) → {M['unet']}", flush=True)
    if not ESSAI: telecharge([unet, 'te', 'mmproj', 'vae', 'angles', 'eclair'])
    p = serveur() if not ESSAI else subprocess.Popen(['sleep', '1'])
    try:
        for f in cfg['fiches']:
            slug = os.path.splitext(f)[0]; os.makedirs(f'{S}/{slug}', exist_ok=True)
            for az in cfg['azimuts']:
                dest = f'{S}/{slug}/{az}.png'
                if os.path.isfile(dest): continue
                try:
                    if ESSAI:
                        import shutil; src = f'/tmp/essai-{slug}-{az}.png'; shutil.copy(f'{E}/fiches/{f}', src); dt = 0.01
                    else: src, dt = tourne(f'{E}/fiches/{f}', az, unet)
                    os.replace(src, dest); M['vues'][f'{slug}/{az}'] = round(dt, 1); ecrit()
                    print(f'{slug} {az} : {dt:.0f} s', flush=True)
                except Exception as ex:
                    M['erreurs'].append(f'{slug}/{az} : {str(ex)[:300]}'); ecrit(); print('ERREUR', slug, az, str(ex)[:300], flush=True)
    finally:
        p.terminate()
    n = len(M['vues']); M['secondes_par_vue'] = round(sum(M['vues'].values()) / max(1, n), 1); ecrit()
    print(f"{n} vues faites, {M['secondes_par_vue']} s par vue, {len(M['erreurs'])} erreurs", flush=True)
