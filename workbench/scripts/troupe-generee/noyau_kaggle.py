# NOYAU KAGGLE (16/10/2026) — tourne sur une carte graphique GRATUITE de Kaggle (T4 de 16 Go, quota hebdomadaire du
# compte de l'utilisateur). Il est publié, lancé et rapatrié par kaggle_moteur.py : rien n'est installé sur le PC de
# l'utilisateur (consigne : « Je ne peux pas installer via PowerShell »).
#   1. trouve le paquet de plans (config.json, plans.json, <cle>.png, <cle>.wav, comfy_wan.py) dans /kaggle/input ;
#   2. installe ComfyUI (GPL-3.0, programme séparé, version figée) + ComfyUI-GGUF (Apache-2.0) dans /tmp (hors sortie) ;
#   3. télécharge le kit (Wan2.2-S2V ou InfiniteTalk) en version GGUF choisie d'après la mémoire de la carte ;
#   4. démarre un serveur par carte, anime chaque plan, écrit /kaggle/working/<cle>.mp4 + mesures.json (temps MESURÉS,
#      carte, mémoire maximale, erreurs) au fil de l'eau : un arrêt en cours de route garde les plans déjà faits.
# Essai hors Kaggle : NOYAU_ESSAI=1 NOYAU_ENTREE=<dossier> NOYAU_SORTIE=<dossier> COMFY_URL=<serveur déjà lancé>
import glob, json, os, subprocess, sys, threading, time, urllib.request, wave

ESSAI = os.environ.get('NOYAU_ESSAI') == '1'
ENTREE = os.environ.get('NOYAU_ENTREE', '/kaggle/input')
SORTIE = os.environ.get('NOYAU_SORTIE', '/kaggle/working'); os.makedirs(SORTIE, exist_ok=True)
RACINE = '/tmp/troupe'                     # installation et modèles : jamais dans /kaggle/working (sinon copiés en sortie)
COMFY_COMMIT = 'fc04da91b2ab12f99e4716371a7e4f98ac982597'      # ComfyUI 0.41.0, validé chez nous le 16/10/2026
GGUF_COMMIT = '6ea2651e7df66d7585f6ffee804b20e92fb38b8a'        # city96/ComfyUI-GGUF, validé chez nous le 16/10/2026
JOURNAL = open(f'{SORTIE}/journal.txt', 'a', encoding='utf-8')
M = {'debut': time.strftime('%Y-%m-%d %H:%M:%S'), 'etapes': {}, 'plans': {}, 'cartes': [], 'vram_max_mio': 0, 'ram_min_libre_go': None}

def dit(*a):
    t = time.strftime('%H:%M:%S') + ' ' + ' '.join(str(x) for x in a); print(t, flush=True); JOURNAL.write(t + '\n'); JOURNAL.flush()

def sauve():
    json.dump(M, open(f'{SORTIE}/mesures.json', 'w'), ensure_ascii=False, indent=1)

def lance(cmd, **kw):
    dit('$', ' '.join(cmd) if isinstance(cmd, list) else cmd)
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode: dit('  code', r.returncode, (r.stdout + r.stderr)[-1500:])
    return r

def etape(nom, fn):
    t = time.time(); r = fn(); M['etapes'][nom] = round(time.time() - t, 1); sauve(); dit(f'étape {nom} : {M["etapes"][nom]} s'); return r

# ---------- 1. le paquet ----------
pj = sorted(glob.glob(f'{ENTREE}/**/plans.json', recursive=True))
if not pj: dit('paquet introuvable dans', ENTREE); sys.exit(1)
PAQ = os.path.dirname(pj[0]); dit('paquet :', PAQ)
CFG = json.load(open(f'{PAQ}/config.json')) if os.path.isfile(f'{PAQ}/config.json') else {}
cw = sorted(glob.glob(f'{ENTREE}/**/comfy_wan.py', recursive=True)); sys.path.insert(0, os.path.dirname(cw[0]) if cw else PAQ)
import comfy_wan as C
KIT = CFG.get('kit', 's2v'); PLANS = json.load(open(pj[0]))
M.update(kit=KIT, nb_plans=len(PLANS), secondes_a_animer=round(sum(p['t1'] - p['t0'] for p in PLANS), 2)); sauve()

# ---------- 2. les cartes ----------
def smi(q):
    try: r = subprocess.run(['nvidia-smi', f'--query-gpu={q}', '--format=csv,noheader,nounits'], capture_output=True, text=True)
    except FileNotFoundError: return []
    return r.stdout.strip().splitlines() if r.returncode == 0 else []
def cartes():
    return [(l.split(',')[0].strip(), int(l.split(',')[1])) for l in smi('name,memory.total')]
GPU = cartes(); M['cartes'] = [{'nom': n, 'mio': m} for n, m in GPU]; dit('cartes :', GPU or 'aucune')
if not GPU and not ESSAI: dit('aucune carte graphique : activer l’accélérateur GPU T4 du carnet'); sauve(); sys.exit(1)

def surveille():                            # mémoire réellement utilisée (carte et machine), relevée toutes les 5 s
    while True:
        u = smi('memory.used')
        if u: M['vram_max_mio'] = max([M['vram_max_mio']] + [int(x) for x in u])
        try:
            libre = int([l for l in open('/proc/meminfo') if l.startswith('MemAvailable')][0].split()[1]) / 2 ** 20
            M['ram_min_libre_go'] = round(libre if M['ram_min_libre_go'] is None else min(M['ram_min_libre_go'], libre), 2)
        except Exception: pass
        time.sleep(5)
threading.Thread(target=surveille, daemon=True).start()

# version GGUF : la plus fine qui tient en entier dans la carte (2 Go laissés au calcul), sinon Q3_K_M ; forçable par config
depot, motif, tailles = C.GGUF[KIT]
vram_go = (min(m for _, m in GPU) / 1024) if GPU else 16
Q = CFG.get('quant') or max([q for q, g in tailles.items() if g <= vram_go - 2.0] or ['Q3_K_M'], key=lambda q: tailles[q])
UNET = motif.format(q=Q); M.update(quant=Q, unet=UNET); dit(f'kit {KIT} : {UNET} ({tailles[Q]} Go) pour {vram_go:.1f} Go de carte')

# ---------- 3. installation (figée) ----------
CU = f'{RACINE}/ComfyUI'
def installe():
    os.makedirs(RACINE, exist_ok=True)
    if not os.path.isdir(f'{CU}/.git'):
        lance(['git', 'init', '-q', CU]); lance(['git', '-C', CU, 'remote', 'add', 'origin', 'https://github.com/comfyanonymous/ComfyUI.git'])
        if lance(['git', '-C', CU, 'fetch', '-q', '--depth', '1', 'origin', COMFY_COMMIT]).returncode == 0: lance(['git', '-C', CU, 'checkout', '-q', 'FETCH_HEAD'])
        else: dit('version figée indisponible : dernière version'); lance(['git', '-C', CU, 'fetch', '-q', '--depth', '1', 'origin', 'HEAD']); lance(['git', '-C', CU, 'checkout', '-q', 'FETCH_HEAD'])
        G = f'{CU}/custom_nodes/ComfyUI-GGUF'
        lance(['git', 'init', '-q', G]); lance(['git', '-C', G, 'remote', 'add', 'origin', 'https://github.com/city96/ComfyUI-GGUF.git'])
        if lance(['git', '-C', G, 'fetch', '-q', '--depth', '1', 'origin', GGUF_COMMIT]).returncode: lance(['git', '-C', G, 'fetch', '-q', '--depth', '1', 'origin', 'HEAD'])
        lance(['git', '-C', G, 'checkout', '-q', 'FETCH_HEAD'])
    req = [l.strip() for l in open(f'{CU}/requirements.txt') if l.strip() and not l.startswith('#') and not l.split('=')[0].split('>')[0].split('<')[0].strip().startswith(('torch', 'torchvision', 'torchaudio'))]
    lance([sys.executable, '-m', 'pip', 'install', '-q'] + req + ['gguf>=0.13.0', 'sentencepiece', 'protobuf'])
    if lance([sys.executable, 'main.py', '--quick-test-for-ci'], cwd=CU).returncode:       # torch trop ancien pour ComfyUI : mise à niveau
        dit('ComfyUI ne démarre pas avec le torch fourni : mise à niveau de torch (CUDA 12.8)')
        lance([sys.executable, '-m', 'pip', 'install', '-q', '-U', 'torch', 'torchvision', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu128'])
        if lance([sys.executable, 'main.py', '--quick-test-for-ci'], cwd=CU).returncode: raise SystemExit('ComfyUI ne démarre pas')
    import torch; M['torch'] = torch.__version__; dit('torch', torch.__version__)

def telecharge():
    fichiers = [(d, c, f) for d, c, f, _ in C.TELECHARGEMENTS[KIT] if f != 'diffusion_models'] + [(depot, UNET, 'diffusion_models')]
    procs = []
    for d, c, f in fichiers:                                    # en parallèle, reprise automatique
        os.makedirs(f'{CU}/models/{f}', exist_ok=True); out = f'{CU}/models/{f}/{os.path.basename(c)}'
        procs.append((out, subprocess.Popen(['curl', '-s', '-L', '--retry', '5', '-C', '-', '-o', out, f'https://huggingface.co/{d}/resolve/main/{c}'])))
    for out, p in procs:
        p.wait(); dit(f'  {os.path.basename(out)} : {os.path.getsize(out) / 1e9:.2f} Go' if os.path.isfile(out) else f'  {out} MANQUANT')
    M['go_telecharges'] = round(sum(os.path.getsize(o) for o, _ in procs if os.path.isfile(o)) / 1e9, 2)

if not ESSAI:
    etape('installation', installe); etape('telechargement', telecharge)

# ---------- 4. serveurs (un par carte) ----------
SERVEURS, PROCS = [], []
def demarre(i, extra=()):
    port = 8188 + i; env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(i))
    log = open(f'{RACINE}/serveur{i}.log', 'a')
    p = subprocess.Popen([sys.executable, 'main.py', '--listen', '127.0.0.1', '--port', str(port), '--disable-auto-launch', *extra], cwd=CU, env=env, stdout=log, stderr=log)
    url = f'http://127.0.0.1:{port}'
    for _ in range(180):
        try: urllib.request.urlopen(f'{url}/system_stats', timeout=5); return url, p
        except Exception: time.sleep(2)
    raise SystemExit(f'serveur {i} muet (voir journal)')
if ESSAI: SERVEURS = [C.URL]
else:
    n = min(len(GPU), int(CFG.get('cartes', 1)))
    for i in range(n):
        u, p = etape(f'demarrage_serveur{i}', lambda i=i: demarre(i)); SERVEURS.append(u); PROCS.append(p)

def noire(mp4):                         # contrôle : vidéo noire ou figée (calcul en fp16 qui déborde, par exemple)
    try:
        import cv2, numpy as np
        cap = cv2.VideoCapture(mp4); fr = []
        while True:
            ok, f = cap.read()
            if not ok: break
            fr.append(f)
        if not fr: return True
        a = np.stack(fr[::max(1, len(fr) // 8)]).astype(np.float32)
        return bool(a.mean() < 6 or a.std() < 2)
    except Exception as e:
        dit('contrôle impossible', e); return False

TEXTE = CFG.get('texte', "Personnages africains d'un film d'animation 3D ; celui qui est au centre parle avec des gestes naturels, les autres écoutent et réagissent ; le décor reste identique")
PAS = int(CFG.get('pas', 4 if KIT == 's2v' else 6))
def anime(p, url):
    import cv2
    k = p['cle']; img, wav = f'{PAQ}/{k}.png', f'{PAQ}/{k}.wav'; out = f'{SORTIE}/{k}.mp4'
    if os.path.isfile(out): return
    im = cv2.imread(img); h, w = im.shape[:2]; W, H = (w // 16) * 16, (h // 16) * 16
    with wave.open(wav) as f: sec = f.getnframes() / f.getframerate()
    t = time.time(); rec = {'qui': p.get('qui'), 'secondes_video': round(sec, 2), 'serveur': url, 'w': W, 'h': H}
    try:
        ni, na = C.envoie(img, url), C.envoie(wav, url)
        g = C.graphe_s2v(ni, na, W, H, sec, TEXTE, graine=int(CFG.get('graine', 1)), pas=PAS, unet=None if ESSAI and not CFG.get('quant') else UNET) if KIT == 's2v' else \
            C.graphe_infinitetalk(ni, na, W, H, sec, TEXTE, graine=int(CFG.get('graine', 1)), pas=PAS, unet=UNET)
        r = C.soumet(g, url)
        if 'prompt_id' not in r: raise RuntimeError(json.dumps(r.get('node_errors') or r.get('error'), ensure_ascii=False)[:600])
        C.attend_video(r['prompt_id'], out, url=url)
        rec.update(statut='noire' if noire(out) else 'ok')
    except Exception as e:
        rec.update(statut='erreur', erreur=str(e)[:600])
    rec['secondes_calcul'] = round(time.time() - t, 1)
    if rec['statut'] == 'ok' and sec > 0: rec['secondes_calcul_par_seconde'] = round(rec['secondes_calcul'] / sec, 1)
    M['plans'][k] = rec; sauve(); dit(k, rec)

def file(url, lot):
    for p in lot: anime(p, url)

t0 = time.time()
lots = [PLANS[i::len(SERVEURS)] for i in range(len(SERVEURS))]
th = [threading.Thread(target=file, args=(u, l)) for u, l in zip(SERVEURS, lots)]
[x.start() for x in th]; [x.join() for x in th]
ok = [k for k, r in M['plans'].items() if r['statut'] == 'ok']
M.update(fin=time.strftime('%Y-%m-%d %H:%M:%S'), secondes_animation=round(time.time() - t0, 1), plans_ok=len(ok),
         secondes_video_ok=round(sum(M['plans'][k]['secondes_video'] for k in ok), 2)); sauve()
dit(f'{len(ok)}/{len(PLANS)} plans animés en {M["secondes_animation"]} s')
for i, p in enumerate(PROCS):
    try: JOURNAL.write(f'--- fin du journal du serveur {i} ---\n' + open(f'{RACINE}/serveur{i}.log').read()[-6000:] + '\n')
    except Exception: pass
    p.terminate()
JOURNAL.close()
