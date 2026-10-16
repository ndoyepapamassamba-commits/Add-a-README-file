# MESURE DU CIRCUIT GROK PAR OPENROUTER (16/10/2026) — consigne : « faire des mesures avec Grok via OpenRouter pour voir
# si les nouvelles branches fonctionnent ». OpenRouter sert depuis mai 2026 les modèles vidéo de SpaceXAI (Grok Imagine
# Video, 1.5 et 1.5 Lite) par une API vidéo asynchrone : POST /api/v1/videos → tâche → GET /api/v1/videos/{id} → contenu.
#   python3 mesure_grok_openrouter.py catalogue v16          → modèles Grok en service, prix lus en direct, coût du film
#   python3 mesure_grok_openrouter.py catalogue-tout v16     → les 30 modèles vidéo : image, voix, prix, coût du film
#   python3 mesure_grok_openrouter.py essai v16 [cle,...] [modele,...] → anime les plans (image de départ du plan) avec
#                                                              chaque modèle (Grok par défaut), mesure temps / statut / coût réel, puis JEV
# Clé : variable d'environnement OPENROUTER_API_KEY (ajoutée par l'utilisateur dans les réglages de l'environnement ;
# jamais écrite ni affichée). Plafond DUR : la dépense estimée d'un essai ne peut pas dépasser PLAFOND_USD (1,00 $ par
# défaut) — le script refuse de lancer au-delà.
import base64, json, math, os, re, subprocess, sys, time, urllib.error, urllib.request

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

RES = ['480p', '720p', '768p', '1080p']
def usd_par_seconde(m):
    """prix par seconde à la plus petite définition proposée (USD), lu dans les clés de prix d'OpenRouter ; les modèles
    au jeton (Seedance) sont convertis par la formule de ByteDance jetons = largeur × hauteur × 24 i/s / 1024 (calcul)."""
    s = m.get('pricing_skus') or {}
    for r in RES:
        for k, f in ((f'cents_per_video_output_second_{r}', .01), (f'cents_per_second_output_{r}', .01), (f'duration_seconds_{r}', 1),
                     (f'image_to_video_duration_seconds_{r}', 1), (f'duration_seconds_with_audio_{r}', 1), (f'duration_seconds_without_audio_{r}', 1)):
            if k in s: return float(s[k]) * f, r
    for k, f in (('cents_per_second_output', .01), ('duration_seconds', 1), ('duration_seconds_without_audio', 1)):
        if k in s: return float(s[k]) * f, (m.get('supported_resolutions') or ['?'])[0]
    for r in ('2K', '2k', '4K', '4k'):
        for k, f in ((f'cents_per_second_output_{r}', .01), (f'duration_seconds_{r}', 1), (f'duration_seconds_without_audio_{r}', 1)):
            if k in s: return float(s[k]) * f, r
    if 'video_tokens' in s or 'video_tokens_without_audio' in s:
        jt = float(s.get('video_tokens_without_audio', s.get('video_tokens'))); return 854 * 480 * 24 / 1024 * jt, '480p (calcul jetons)'
    return None, None

def secondes_facturees(m, sec):
    D = sorted(m.get('supported_durations') or [])
    if not D: return math.ceil(sec)
    return next((d for d in D if d >= sec), D[-1])

if cmd == 'catalogue-tout':                     # les 30 modèles vidéo : capacités, prix lus en direct, coût du film
    M = appel('/videos/models')['data']; L = []
    for m in M:
        prix, res = usd_par_seconde(m); fact = sum(secondes_facturees(m, p['t1'] - p['t0']) for p in P)
        img = '+'.join(x.replace('_frame', '') for x in (m.get('supported_frame_images') or [])) or '—'
        L.append((m['id'], img, res or '—', prix, fact, round(prix * fact, 2) if prix is not None else None))
    L.sort(key=lambda x: (x[5] is None, x[5] or 0))
    lignes = ['| modèle | image de départ | définition | $/s | s facturées (film v16) | coût film (calcul) |', '|---|---|---|---|---|---|']
    lignes += [f'| {i} | {im} | {r} | {"—" if p is None else f"{p:.3f}"} | {f} | {"—" if c is None else f"{c:.2f} $"} |' for i, im, r, p, f, c in L]
    os.makedirs(f'{film}/openrouter', exist_ok=True); open(f'{film}/openrouter/catalogue_video.md', 'w').write('\n'.join(lignes) + '\n')
    print('\n'.join(lignes)); sys.exit(0)

if cmd == 'essai':
    cle = os.environ.get('OPENROUTER_API_KEY')
    if not cle: raise SystemExit("OPENROUTER_API_KEY absente : l'ajouter dans les réglages de l'environnement (jamais dans la discussion)")
    cles = sys.argv[3].split(',') if len(sys.argv) > 3 else ['003.14']
    voulus = sys.argv[4].split(',') if len(sys.argv) > 4 else GROK
    tous = {m['id']: m for m in appel('/videos/models')['data']}; C = {k: tous[k] for k in voulus if k in tous}
    inconnus = [k for k in voulus if k not in tous]
    if inconnus: print('modèles absents du catalogue :', inconnus)
    plans = [p for p in P if p['cle'] in cles]
    def prix_plan(m, p): u, _ = usd_par_seconde(m); return round((u or 0) * secondes_facturees(m, p['t1'] - p['t0']) + float((m.get('pricing_skus') or {}).get('cents_per_image_input', 0)) / 100, 4)
    devis = sum(prix_plan(m, p) for m in C.values() for p in plans)
    print(f'devis : {devis:.2f} $ pour {len(plans)} plan(s) × {len(C)} modèle(s) en {RESOLUTION} (plafond {PLAFOND:.2f} $)')
    if devis > PLAFOND: raise SystemExit(f'refusé : devis {devis:.2f} $ au-dessus du plafond {PLAFOND:.2f} $ (PLAFOND_USD)')
    R = {}
    for k, m in C.items():
        dos = f'{SORTIE}/{k.split("/")[-1]}'; os.makedirs(dos, exist_ok=True)
        for p in plans:
            img = base64.b64encode(open(f'{IA}/{p["cle"]}.png', 'rb').read()).decode()
            res = RESOLUTION if RESOLUTION in (m.get('supported_resolutions') or [RESOLUTION]) else (m.get('supported_resolutions') or [None])[0]
            corps = {'model': k, 'duration': secondes_facturees(m, p['t1'] - p['t0']), 'resolution': res, 'aspect_ratio': '4:3',
                     'prompt': f'3D animated African cartoon film. {p["qui"].title()} is talking with natural lip movement, '
                               'head and hand gestures; the other characters listen and react; same characters, same place, '
                               'camera stays still.',
                     'frame_images': [{'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{img}'}, 'frame_type': 'first_frame'}]}
            if not m.get('supported_frame_images'): print(k, ': pas d\'image de départ, sauté'); continue
            corps = {x: v for x, v in corps.items() if v is not None}
            t0 = time.time(); rec = {'modele': k, 'plan': p['cle'], 'qui': p['qui'], 'duree_demandee': corps['duration'], 'devis_usd': prix_plan(m, p)}
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
