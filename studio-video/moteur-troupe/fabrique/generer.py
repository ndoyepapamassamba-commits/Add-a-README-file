# ÉTAGE E2 — PLANCHES : lance tout le catalogue de l'univers (univers.catalogue) avec une CHAÎNE DE SECOURS de générateurs
# gratuits (consigne du 18/10/2026 : « toujours chercher 100 voies, ne pas être figé sur une voie »). Chaque planche essaie
# les voies dans l'ordre et passe à la suivante sur échec ou lenteur :
#   1. Pollinations + clé de l'utilisateur (POLLINATIONS_TOKEN) : Z-Image-Turbo, 60 images/min, quelques secondes chacune ;
#   2. Cloudflare Workers AI (CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID) : FLUX.1 schnell (Apache-2.0), quota gratuit quotidien ;
#   3. Hugging Face ZeroGPU (Space officiel Z-Image-Turbo) : quota anonyme quotidien, 5 min/jour avec HF_TOKEN ;
#   4. AI Horde anonyme : Z-Image-Turbo, file communautaire (lente aux heures chargées) — délai borné, puis voie suivante.
#   5. OpenRouter (PAYANT, clé de l'utilisateur) : seulement si OR_PAYANT_AUTORISE=1 ET FABRIQUE_PLAFOND_USD > 0, plafond DUR
#      appliqué par le code (réservation avant chaque appel, coût réel relevé ensuite, journal couts.jsonl).
# Écartée après mesure (18/10) : génération locale sur le processeur (Z-Image 6 Md de paramètres : 35 à 70 min par image).
# Reprise : une planche faite n'est jamais refaite ; nombre borné de demandes en vol ; journal par planche (voie, graine, durée).
#   python3 generer.py <dossier_sortie> [filtre] [en_vol]      filtre : préfixe d'identifiant (perso/mamadou, decor/, objet/…)
import base64, json, os, sys, time, threading, urllib.request
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import horde
import univers, pollinations


def _cloudflare(txt, f, w, h, g):
    a, t = os.environ['CLOUDFLARE_ACCOUNT_ID'], os.environ['CLOUDFLARE_API_TOKEN']
    req = urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{a}/ai/run/@cf/black-forest-labs/flux-1-schnell',
                                 data=json.dumps({'prompt': txt[:2000], 'steps': 8, 'seed': int(g) % 2**31}).encode(), method='POST',
                                 headers={'Authorization': f'Bearer {t}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as r: d = json.loads(r.read())
    open(f, 'wb').write(base64.b64decode(d['result']['image']))
    return {'modele': 'flux-1-schnell'}


RES_HF = {(1408, 704): '1280x720 ( 16:9 )', (832, 1216): '832x1248 ( 2:3 )', (768, 1344): '720x1280 ( 9:16 )', (1024, 1024): '1024x1024 ( 1:1 )'}


def _hf(txt, f, w, h, g):
    """Space officiel Z-Image-Turbo (Hugging Face ZeroGPU) : quota anonyme quotidien, 5 min/jour avec HF_TOKEN de l'utilisateur."""
    import shutil
    from gradio_client import Client
    c = Client('Tongyi-MAI/Z-Image-Turbo', verbose=False, **({'token': os.environ['HF_TOKEN']} if os.environ.get('HF_TOKEN') else {}))
    r = c.predict(txt, resolution=RES_HF.get((w, h), '1024x1024 ( 1:1 )'), seed=int(g) % 2**31, steps=8, shift=3.0, random_seed=False,
                  gallery_images=[], api_name='/generate')
    x = r[0] if isinstance(r, (list, tuple)) else r
    x = x[0] if isinstance(x, list) else x
    x = x.get('image', x) if isinstance(x, dict) else x
    x = x.get('path') if isinstance(x, dict) else x
    shutil.copy(x, f)
    return {'modele': 'Z-Image-Turbo (Space HF)'}


PLAFOND = float(os.environ.get('FABRIQUE_PLAFOND_USD', '0'))   # PLAFOND DUR des voies payantes (0 = aucune dépense)
_depense = {'usd': 0.0}; _verrou_cout = threading.Lock()
OR_MODELE = os.environ.get('FABRIQUE_OR_MODELE', 'google/gemini-2.5-flash-image')
OR_ESTIME = {'openai/gpt-5-image-mini': 0.012, 'google/gemini-2.5-flash-image': 0.045, 'google/gemini-3.1-flash-lite-image': 0.045, 'google/gemini-nano-banana-2.1': 0.045, 'google/gemini-3.1-flash-image': 0.09}


def _openrouter(txt, f, w, h, g):
    """voie PAYANTE (clé OpenRouter de l'utilisateur) : désactivée sauf OR_PAYANT_AUTORISE=1 posé par l'utilisateur ; chaque
    appel est refusé s'il ferait dépasser FABRIQUE_PLAFOND_USD (coût réel relevé dans la réponse, journal des coûts)."""
    if os.environ.get('OR_PAYANT_AUTORISE') != '1': raise SystemExit('clé : voie payante non autorisée')
    with _verrou_cout:
        if _depense['usd'] + OR_ESTIME.get(OR_MODELE, 0.05) > PLAFOND: raise SystemExit(f"clé : plafond {PLAFOND} $ atteint ({_depense['usd']:.3f} $)")
        _depense['usd'] += OR_ESTIME.get(OR_MODELE, 0.05)   # réservé avant l'appel, corrigé après
    ar = '16:9' if w > 1.5 * h else ('9:16' if h > 1.5 * w else ('2:3' if h > w else '1:1'))
    corps = {'model': OR_MODELE, 'messages': [{'role': 'user', 'content': txt}], 'modalities': ['image', 'text'],
             'image_config': {'aspect_ratio': ar}, 'usage': {'include': True}, 'seed': int(g) % 2**31}
    req = urllib.request.Request('https://openrouter.ai/api/v1/chat/completions', data=json.dumps(corps).encode(), method='POST',
                                 headers={'Authorization': f"Bearer {os.environ['OPENROUTER_API_KEY']}", 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=300) as r: d = json.loads(r.read())
    cout = float((d.get('usage') or {}).get('cost') or OR_ESTIME.get(OR_MODELE, 0.05))
    with _verrou_cout: _depense['usd'] += cout - OR_ESTIME.get(OR_MODELE, 0.05)
    url = d['choices'][0]['message']['images'][0]['image_url']['url']
    open(f, 'wb').write(base64.b64decode(url.split(',', 1)[1]) if url.startswith('data:') else urllib.request.urlopen(url, timeout=120).read())
    with open(os.path.join(os.path.dirname(os.path.dirname(f)) if '/' in f else '.', 'couts.jsonl'), 'a') as fc:
        fc.write(json.dumps({'fichier': f, 'modele': OR_MODELE, 'usd': round(cout, 5), 'cumul': round(_depense['usd'], 4)}) + '\n')
    return {'modele': OR_MODELE, 'usd': cout}


VOIES = [   # (nom, disponible ?, appel)
    ('pollinations', lambda: bool(os.environ.get('POLLINATIONS_TOKEN') or os.environ.get('POLLINATIONS_API_KEY')),
     lambda txt, f, w, h, g: pollinations.genere(txt, f, w, h, os.environ.get('FABRIQUE_MODELE', 'z'), g)),
    ('cloudflare', lambda: bool(os.environ.get('CLOUDFLARE_API_TOKEN') and os.environ.get('CLOUDFLARE_ACCOUNT_ID')), _cloudflare),
    ('huggingface', lambda: True, _hf),
    ('horde', lambda: True, lambda txt, f, w, h, g: horde.generate(txt, f, w, h, horde.meilleur_modele(), g)),
    ('openrouter', lambda: bool(os.environ.get('OPENROUTER_API_KEY')) and os.environ.get('OR_PAYANT_AUTORISE') == '1' and PLAFOND > 0, _openrouter),
]


def chaine():
    ordre = os.environ.get('FABRIQUE_VOIES')   # ex. « horde,pollinations » pour imposer un ordre
    v = [x for x in VOIES if x[1]()]
    return sorted(v, key=lambda x: ordre.split(',').index(x[0]) if ordre and x[0] in ordre.split(',') else 99) if ordre else v


def lance(sortie, filtre='', en_vol=8):
    J = [j for j in univers.catalogue() if j[0].startswith(filtre)]
    reste = [j for j in J if not os.path.isfile(f'{sortie}/{j[0]}.png')]; C = chaine()
    print(f"{len(J)} planches, {len(J) - len(reste)} déjà faites, {len(reste)} à faire ({en_vol} en vol) ; voies : {' → '.join(c[0] for c in C)}", flush=True)
    sem = threading.Semaphore(en_vol); verrou = threading.Lock(); t0 = time.time()

    def un(j):
        i, txt, w, h, g = j; f = f'{sortie}/{i}.png'; os.makedirs(os.path.dirname(f), exist_ok=True)
        import glob as _g; g = g + 7919 * len(_g.glob(f"{sortie}/rejets/{i.replace('/', '__')}*"))   # planche rejetée par l'analyse : autre graine
        with sem:
            for k, (nom, _, appel) in enumerate(C):
                for e in range(2):
                    t1 = time.time()
                    try:
                        r = appel(txt, f, w, h, g + 1009 * e) or {}
                        with verrou, open(f'{sortie}/journal.jsonl', 'a') as fj:
                            fj.write(json.dumps({'id': i, 'voie': nom, 'graine': g + 1009 * e, 'modele': r.get('modele') or r.get('model'),
                                                 'duree': round(time.time() - t1, 1), 't': round(time.time() - t0)}, ensure_ascii=False) + '\n')
                        return True
                    except BaseException as ex:
                        print(f'  {i} : {nom}, essai {e + 1} échoué ({repr(ex)[:100]})', flush=True)
                        if (isinstance(ex, SystemExit) and 'clé' in str(ex)) or 'quota' in str(ex).lower(): break   # voie épuisée : la suivante
                        time.sleep(5)
            return False

    T = [threading.Thread(target=un, args=(j,)) for j in reste]
    [t.start() for t in T]; [t.join() for t in T]
    fait = sum(os.path.isfile(f'{sortie}/{j[0]}.png') for j in J)
    print(f'FIN : {fait}/{len(J)} planches en {time.time() - t0:.0f} s', flush=True)


if __name__ == '__main__':
    lance(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else '', int(sys.argv[3]) if len(sys.argv) > 3 else 8)
