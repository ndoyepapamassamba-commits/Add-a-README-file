# MESURE DU CIRCUIT GROK PAR OPENROUTER (16/10/2026) — consigne : « faire des mesures avec Grok via OpenRouter pour voir
# si les nouvelles branches fonctionnent ». OpenRouter sert depuis mai 2026 les modèles vidéo de SpaceXAI (Grok Imagine
# Video, 1.5 et 1.5 Lite) par une API vidéo asynchrone : POST /api/v1/videos → tâche → GET /api/v1/videos/{id} → contenu.
#   python3 mesure_grok_openrouter.py catalogue v16          → modèles Grok en service, prix lus en direct, coût du film
#   python3 mesure_grok_openrouter.py essai v16 [cle,...]     → anime les plans (image de départ du plan) avec chaque
#                                                              modèle Grok, mesure temps / statut / coût réel, puis JEV
# Clé : variable d'environnement OPENROUTER_API_KEY (ajoutée par l'utilisateur dans les réglages de l'environnement ;
# jamais écrite ni affichée). Plafond DUR : la dépense estimée d'un essai ne peut pas dépasser PLAFOND_USD (1,00 $ par
# défaut) — le script refuse de lancer au-delà.
import base64, json, math, os, subprocess, sys, time, urllib.error, urllib.request

API = os.environ.get('OPENROUTER_URL', 'https://openrouter.ai/api/v1')
GROK = ['x-ai/grok-imagine-video-1.5-lite', 'x-ai/grok-imagine-video', 'x-ai/grok-imagine-video-1.5']
RESOLUTION = os.environ.get('GROK_RESOLUTION', '480p')
PLAFOND = float(os.environ.get('PLAFOND_USD', '1.00'))
ICI = os.path.dirname(os.path.abspath(__file__))
cmd, film = sys.argv[1], sys.argv[2]
IA = f'{film}/ia'; SORTIE = f'{film}/grok_openrouter'

def appel(chemin, corps=None, cle=None, brut=False):
    h = {'Content-Type': 'application/json'}
    if cle: h['Authorization'] = f'Bearer {cle}'
    req = urllib.request.Request(f'{API}{chemin}', data=json.dumps(corps).encode() if corps is not None else None, headers=h)
    with urllib.request.urlopen(req, timeout=120) as r:
        d = r.read()
        return d if brut else json.loads(d)

def catalogue():
    M = {m['id']: m for m in appel('/videos/models')['data']}
    return {k: M[k] for k in GROK if k in M}

def cout(m, secondes, images=1):
    p = m.get('pricing_skus') or {}
    s = float(p.get(f'cents_per_video_output_second_{RESOLUTION}', 0)) / 100
    return round(secondes * s + images * float(p.get('cents_per_image_input', 0)) / 100, 4)

P = json.load(open(f'{IA}/plans.json'))
duree = lambda p: max(1, min(15, math.ceil(p['t1'] - p['t0'] - 1e-6)))    # Grok : durées entières de 1 à 15 s

if cmd == 'catalogue':
    C = catalogue(); total = sum(duree(p) for p in P)
    print(f'{len(C)}/{len(GROK)} modèles Grok en service sur OpenRouter ; film {film} : {len(P)} plans, {total} s facturées en {RESOLUTION}')
    for k, m in C.items():
        print(f'  {k} : {m["supported_durations"][0]}-{m["supported_durations"][-1]} s, {"/".join(m["supported_resolutions"])}, '
              f'images {m["supported_frame_images"]}, prix {m["pricing_skus"]} → film complet ≈ {cout(m, total, len(P)):.2f} $')
    sys.exit(0)

if cmd == 'essai':
    cle = os.environ.get('OPENROUTER_API_KEY')
    if not cle: raise SystemExit("OPENROUTER_API_KEY absente : l'ajouter dans les réglages de l'environnement (jamais dans la discussion)")
    cles = sys.argv[3].split(',') if len(sys.argv) > 3 else ['003.14']
    C = catalogue(); plans = [p for p in P if p['cle'] in cles]
    devis = sum(cout(m, duree(p)) for m in C.values() for p in plans)
    print(f'devis : {devis:.2f} $ pour {len(plans)} plan(s) × {len(C)} modèle(s) en {RESOLUTION} (plafond {PLAFOND:.2f} $)')
    if devis > PLAFOND: raise SystemExit(f'refusé : devis {devis:.2f} $ au-dessus du plafond {PLAFOND:.2f} $ (PLAFOND_USD)')
    R = {}
    for k, m in C.items():
        dos = f'{SORTIE}/{k.split("/")[-1]}'; os.makedirs(dos, exist_ok=True)
        for p in plans:
            img = base64.b64encode(open(f'{IA}/{p["cle"]}.png', 'rb').read()).decode()
            corps = {'model': k, 'duration': duree(p), 'resolution': RESOLUTION, 'aspect_ratio': '4:3',
                     'prompt': f'3D animated African cartoon film. {p["qui"].title()} is talking with natural lip movement, '
                               'head and hand gestures; the other characters listen and react; same characters, same place, '
                               'camera stays still.',
                     'frame_images': [{'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{img}'}, 'frame_type': 'first_frame'}]}
            t0 = time.time(); rec = {'modele': k, 'plan': p['cle'], 'qui': p['qui'], 'duree_demandee': duree(p), 'devis_usd': cout(m, duree(p))}
            try:
                job = appel('/videos', corps, cle); rec['secondes_soumission'] = round(time.time() - t0, 1)
                while True:
                    time.sleep(5); j = appel(f'/videos/{job["id"]}', cle=cle)
                    if j['status'] not in ('pending', 'in_progress'): break
                rec.update(statut=j['status'], secondes_total=round(time.time() - t0, 1), cout_usd=(j.get('usage') or {}).get('cost'))
                if j['status'] == 'completed':
                    open(f'{dos}/{p["cle"]}.mp4', 'wb').write(appel(f'/videos/{job["id"]}/content', cle=cle, brut=True))
                else: rec['erreur'] = str(j.get('error'))[:400]
            except urllib.error.HTTPError as e:
                rec.update(statut=f'HTTP {e.code}', erreur=e.read().decode(errors='replace')[:400])
            R[f'{k}|{p["cle"]}'] = rec; print(rec, flush=True)
        if os.environ.get('SANS_JEV') != '1' and any(f.endswith('.mp4') for f in os.listdir(dos)):   # même arbitre que Wan / EchoMimic
            subprocess.run([sys.executable, f'{ICI}/anime_ia.py', 'juge', film, dos])
    os.makedirs(SORTIE, exist_ok=True); json.dump(R, open(f'{SORTIE}/mesures.json', 'w'), ensure_ascii=False, indent=1)
