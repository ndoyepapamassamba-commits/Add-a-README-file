# LIAISON MOTEUR ↔ CARTE GRAPHIQUE GRATUITE (Kaggle) — 16/10/2026.
# Consigne : « trouve un moyen de le lier au moteur. Je ne peux pas installer via PowerShell. » → rien n'est installé sur
# le PC : le moteur (ici) dépose les plans à animer dans un jeu de données PRIVÉ du compte Kaggle de l'utilisateur, lance
# noyau_kaggle.py sur une carte T4 gratuite (ComfyUI + Wan2.2-S2V ou InfiniteTalk, versions GGUF), attend la fin, rapatrie
# les plans animés dans <film>/ia/<cle>.mp4 avec les mesures réelles ; anime_ia.py insere les fait ensuite arbitrer par JEV.
# Jeton : KAGGLE_API_TOKEN (ou KAGGLE_USERNAME + KAGGLE_KEY), ajouté par l'utilisateur dans les réglages de
# l'environnement ; jamais écrit ni affiché ici. Client officiel `kaggle` (Apache-2.0) : pip install kaggle.
#
#   python3 kaggle_moteur.py a-blanc v16 [s2v|infinitetalk]   → construit le paquet et le carnet, n'envoie rien (contrôle)
#   python3 kaggle_moteur.py envoie  v16 [s2v|infinitetalk]   → publie le paquet (privé) et lance le carnet sur T4
#   python3 kaggle_moteur.py suit    v16                      → attend la fin, rapatrie v16/ia/<cle>.mp4 + kaggle_mesures.json
#   python3 kaggle_moteur.py tout    v16 [kit]                → envoie puis suit
#   python3 kaggle_moteur.py quota                            → heures de carte graphique restantes cette semaine
# Réglages facultatifs (variables d'environnement) : KAGGLE_QUANT (Q3_K_M, Q4_K_M, Q5_K_M, Q8_0), KAGGLE_PAS (pas de
# calcul), KAGGLE_CARTES (1 ou 2 serveurs si la machine a deux T4), COMFY_PROMPT (consigne de jeu).
import glob, json, os, re, shutil, sys, time

ICI = os.path.dirname(os.path.abspath(__file__))
cmd = sys.argv[1] if len(sys.argv) > 1 else 'aide'
D = sys.argv[2] if len(sys.argv) > 2 and cmd != 'quota' else None
KIT = sys.argv[3] if len(sys.argv) > 3 else os.environ.get('KAGGLE_KIT', 's2v')

def api():
    if not (os.environ.get('KAGGLE_API_TOKEN') or (os.environ.get('KAGGLE_USERNAME') and os.environ.get('KAGGLE_KEY'))
            or os.path.isfile(os.path.expanduser('~/.kaggle/access_token')) or os.path.isfile(os.path.expanduser('~/.kaggle/kaggle.json'))):
        raise SystemExit("Jeton Kaggle absent : l'ajouter dans les réglages de l'environnement sous KAGGLE_API_TOKEN, puis ouvrir une nouvelle session.")
    from kaggle.api.kaggle_api_extended import KaggleApi
    a = KaggleApi()
    try: a.authenticate()
    except (Exception, SystemExit): raise SystemExit("Jeton Kaggle refusé par Kaggle : en générer un nouveau (kaggle.com → Settings → API) et le remplacer dans les réglages de l'environnement.")
    return a

def nom_court(film):           # identifiants Kaggle : minuscules, chiffres, tirets, 6 à 50 caractères
    return re.sub(r'[^a-z0-9-]+', '-', os.path.basename(os.path.abspath(film)).lower()).strip('-')[:30] or 'film'

def construit(film, kit, utilisateur='UTILISATEUR'):
    """paquet (jeu de données privé) + carnet (script lancé sur T4), dans <film>/kaggle/."""
    ia = f'{film}/ia'; P = json.load(open(f'{ia}/plans.json'))
    base = f'{film}/kaggle'; shutil.rmtree(base, ignore_errors=True)
    paq, nb = f'{base}/paquet', f'{base}/carnet'; os.makedirs(paq); os.makedirs(nb)
    for p in P:
        for ext in ('png', 'wav'): shutil.copy(f'{ia}/{p["cle"]}.{ext}', paq)
    shutil.copy(f'{ia}/plans.json', paq); shutil.copy(f'{ICI}/comfy_wan.py', paq)
    gardes = sorted(glob.glob(f'{ICI}/../v*/ia*/texte.pt'), key=os.path.getmtime)   # vecteurs du texte d'EchoMimic déjà calculés
    if gardes and os.path.isfile(gardes[-1][:-2] + 'txt'):
        shutil.copy(gardes[-1], paq); shutil.copy(gardes[-1][:-2] + 'txt', paq)
    cfg = {'kit': kit, 'cartes': int(os.environ.get('KAGGLE_CARTES', '1'))}
    if os.environ.get('KAGGLE_QUANT'): cfg['quant'] = os.environ['KAGGLE_QUANT']
    if os.environ.get('KAGGLE_PAS'): cfg['pas'] = int(os.environ['KAGGLE_PAS'])
    if os.environ.get('COMFY_PROMPT'): cfg['texte'] = os.environ['COMFY_PROMPT']
    json.dump(cfg, open(f'{paq}/config.json', 'w'), ensure_ascii=False, indent=1)
    slug = nom_court(film)
    ds, ker = f'troupe-plans-{slug}', f'troupe-anime-{slug}'
    json.dump({'title': ds, 'id': f'{utilisateur}/{ds}', 'licenses': [{'name': 'other'}]}, open(f'{paq}/dataset-metadata.json', 'w'), indent=1)
    shutil.copy(f'{ICI}/noyau_kaggle.py', nb)
    json.dump({'id': f'{utilisateur}/{ker}', 'title': ker, 'code_file': 'noyau_kaggle.py', 'language': 'python', 'kernel_type': 'script',
               'is_private': 'true', 'enable_gpu': 'true', 'enable_tpu': 'false', 'enable_internet': 'true', 'machine_shape': 'NvidiaTeslaT4',
               'dataset_sources': [f'{utilisateur}/{ds}'], 'competition_sources': [], 'kernel_sources': [], 'model_sources': []},
              open(f'{nb}/kernel-metadata.json', 'w'), indent=1)
    taille = sum(os.path.getsize(f'{paq}/{f}') for f in os.listdir(paq)) / 1e6
    print(f'paquet : {len(P)} plans, {sum(p["t1"] - p["t0"] for p in P):.1f} s à animer, {taille:.1f} Mo → {paq}')
    print(f'carnet : {nb} (carte T4, Internet activé, privé), kit {kit}, réglages {cfg}')
    return paq, nb, f'{utilisateur}/{ds}', f'{utilisateur}/{ker}'

def envoie(film, kit):
    a = api(); u = a.config_values[a.CONFIG_NAME_USER]
    paq, nb, ds, ker = construit(film, kit, u)
    try: a.dataset_status(ds); existe = True
    except Exception: existe = False
    r = a.dataset_create_version(paq, version_notes=time.strftime('plans du %d/%m/%Y %H:%M'), quiet=True, dir_mode='zip') if existe else \
        a.dataset_create_new(paq, public=False, quiet=True, convert_to_csv=False, dir_mode='zip')
    if getattr(r, 'error', None): raise SystemExit(f'dépôt du paquet refusé : {r.error}')
    print('paquet déposé (privé) :', ds)
    for _ in range(120):                        # le carnet ne doit partir qu'une fois le paquet prêt chez Kaggle
        st = str(a.dataset_status(ds)).lower()
        if 'ready' in st: break
        if 'error' in st: raise SystemExit(f'paquet en erreur chez Kaggle : {st}')
        time.sleep(5)
    r = a.kernels_push(nb, acc='NvidiaTeslaT4')
    if getattr(r, 'error', None): raise SystemExit(f'lancement refusé : {r.error}')
    json.dump({'carnet': ker, 'paquet': ds, 'kit': kit, 'lance': time.strftime('%Y-%m-%d %H:%M:%S'), 'version': getattr(r, 'version_number', None)},
              open(f'{film}/kaggle/lancement.json', 'w'), ensure_ascii=False, indent=1)
    print('carnet lancé sur carte T4 :', ker, getattr(r, 'url', ''))

def suit(film, attente=12 * 3600):
    a = api(); L = json.load(open(f'{film}/kaggle/lancement.json')); ker = L['carnet']; t0 = time.time(); dernier = None
    while time.time() - t0 < attente:
        s = a.kernels_status(ker); st = str(getattr(s, 'status', s)).lower()
        if st != dernier: print(time.strftime('%H:%M:%S'), 'état :', st, flush=True); dernier = st
        if 'complete' in st or 'error' in st or 'cancel' in st: break
        time.sleep(60)
    out = f'{film}/kaggle/sortie'; shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    a.kernels_output(ker, out, force=True, quiet=True)          # rapatrié même en cas d'erreur : journal + plans déjà faits
    n = 0
    for f in os.listdir(out):
        if f.endswith('.mp4'): shutil.copy(f'{out}/{f}', f'{film}/ia/{f}'); n += 1
    if os.path.isfile(f'{out}/mesures.json'): shutil.copy(f'{out}/mesures.json', f'{film}/ia/kaggle_mesures.json')
    if 'error' in (dernier or ''): print('le carnet s’est arrêté en erreur :', getattr(s, 'failure_message', '') or 'voir', f'{out}/journal.txt')
    print(f'{n} plans animés rapatriés dans {film}/ia (mesures : {film}/ia/kaggle_mesures.json)')

if cmd == 'a-blanc': construit(D, KIT)
elif cmd == 'envoie': envoie(D, KIT)
elif cmd == 'suit': suit(D)
elif cmd == 'tout': envoie(D, KIT); suit(D)
elif cmd == 'quota':
    q = api().quota_view(); print('quota GPU de la semaine :', getattr(q, 'gpu_quota', q), '| renouvellement :', getattr(q, 'quota_refresh_time', ''))
else: print(open(__file__, encoding='utf-8').read().split('import json')[0])
