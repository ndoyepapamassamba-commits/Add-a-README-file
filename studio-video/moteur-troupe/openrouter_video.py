# PLANS ANIMÉS PAR LES GRANDS MODÈLES VIDÉO, EN TEMPS RECORD (17/10/2026). Consignes : « ce que Grok, Veo 3, Kling
# peuvent faire… » ; « j'exige de produire des vidéos en temps record, pas quelque chose qui va charger pendant des heures
# dans une plateforme que je ne sais pas » ; « tout est appuyé par le jugement de JEV ».
# Le conteneur n'a pas de carte graphique et les serveurs GPU gratuits sans compte sont épuisés (17/10 : « ZeroGPU runs
# limit ») : la greffe passe par OpenRouter, plateforme déjà au cœur de l'application de l'utilisateur, qui sert les
# modèles vidéo de premier rang (Grok Imagine 1.5, Veo 3.1, Kling 3.0, Wan 2.7, Seedance 2.0…). TOUS les plans partent
# EN MÊME TEMPS ; le temps de bout en bout et le coût réel (usage.cost) sont mesurés et écrits.
# Ce que nous gardons et que les modèles n'ont pas : l'histoire et ses chutes, la troupe (image de départ de chaque plan
# = nos personnages, nos décors), la consigne de jeu de chaque réplique (accuse, innocent, malice…), les réactions des
# autres personnages, l'arbitre JEV par plan (identité, déformation, mouvement calibré) et le repli sur notre moteur.
# VOIE PAYANTE DÉSACTIVÉE (consigne du 17/10/2026 : « Je veux rien de payant ») : elle ne part que si
# OR_PAYANT_AUTORISE=1 est posé à la main. La voie de production est gratuite : modal_troupe.py + troupe_gpu.py.
# Clé : OPENROUTER_API_KEY dans les réglages de l'environnement, ou injectée par le proxy (Network secrets) ; jamais
# écrite ni affichée. Plafond DUR : le devis du lot est calculé AVANT tout envoi ; au-delà de PLAFOND_USD, rien ne part.
import base64, concurrent.futures as cf, json, math, os, subprocess, time, urllib.error, urllib.request

API = os.environ.get('OPENROUTER_URL', 'https://openrouter.ai/api/v1')

from mise_en_scene import QUI, JEU, DECOR, NEGATIF, consigne   # mise en scène commune à toutes les voies

def appel(chemin, corps=None, brut=False, essais=3):
    h = {'Content-Type': 'application/json', 'User-Agent': 'massamba-studio-video'}
    cle = os.environ.get('OPENROUTER_API_KEY')
    if cle: h['Authorization'] = f'Bearer {cle}'          # sinon : injectée par le proxy de l'environnement
    for k in range(essais):
        try:
            req = urllib.request.Request(f'{API}{chemin}', data=json.dumps(corps).encode() if corps is not None else None, headers=h)
            with urllib.request.urlopen(req, timeout=180) as r:
                d = r.read(); return d if brut else json.loads(d)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and k < essais - 1: time.sleep(4 * (k + 1)); continue
            raise RuntimeError(f'HTTP {e.code} : {e.read().decode(errors="replace")[:300]}')
        except (urllib.error.URLError, TimeoutError) as e:
            if k < essais - 1: time.sleep(4 * (k + 1)); continue
            raise RuntimeError(f'réseau : {e}')


def catalogue():
    return {m['id']: m for m in appel('/videos/models')['data']}


def duree(m, sec):
    """durée demandée : la plus petite durée proposée par le modèle qui couvre le plan (le surplus est coupé au montage)."""
    D = sorted(m.get('supported_durations') or [])
    return next((d for d in D if d >= sec - 0.05), D[-1]) if D else max(1, math.ceil(sec))


def resolution(m, voulue):
    R = m.get('supported_resolutions') or [voulue]
    return voulue if voulue in R else R[0]


def prix(m, sec, res, son):
    """USD pour `sec` secondes facturées, lu dans les tarifs en direct (clés propres à chaque fournisseur)."""
    s = m.get('pricing_skus') or {}
    image = float(s.get('cents_per_image_input', 0)) / 100
    av = 'with_audio' if son else 'without_audio'
    for k, f in ((f'cents_per_video_output_second_{res}', .01), (f'duration_seconds_{av}_{res}', 1), (f'image_to_video_duration_seconds_{res}', 1),
                 (f'duration_seconds_{res}', 1), (f'duration_seconds_{av}', 1), (f'cents_per_second_output_{res}', .01),
                 ('cents_per_second_output', .01), ('duration_seconds', 1)):
        if k in s: return round(sec * float(s[k]) * f + image, 4)
    if 'video_tokens' in s:                             # ByteDance : jetons = largeur × hauteur × 24 i/s / 1024
        w, h = {'480p': (854, 480), '720p': (1280, 720), '1080p': (1920, 1080)}.get(res, (1280, 720))
        return round(sec * w * h * 24 / 1024 * float(s.get('video_tokens' if son else 'video_tokens_without_audio', s['video_tokens'])) + image, 4)
    return None


def corps(mid, m, p, img, res, son):
    c = {'model': mid, 'prompt': consigne(p, son), 'duration': duree(m, p['t1'] - p['t0']), 'resolution': resolution(m, res),
         'aspect_ratio': '4:3', 'frame_images': [{'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' +
                                                  base64.b64encode(open(img, 'rb').read()).decode()}, 'frame_type': 'first_frame'}]}
    if m.get('generate_audio') is not None: c['generate_audio'] = bool(son and m.get('generate_audio'))
    passe = set(m.get('allowed_passthrough_parameters') or [])
    for nom in ('negativePrompt', 'negative_prompt'):
        if nom in passe:
            fournisseur = mid.split('/')[0].replace('google', 'google-vertex')
            c['provider'] = {'options': {fournisseur: {'parameters': {nom: NEGATIF}}}}
    return c


def un_plan(mid, m, p, IA, res, son, dos):
    out = f'{dos}/{p["cle"]}.mp4'; rec = {'modele': mid, 'plan': p['cle'], 'qui': p['qui']}
    if os.path.isfile(out): rec['statut'] = 'déjà là'; return rec
    c = corps(mid, m, p, f'{IA}/{p["cle"]}.png', res, son); rec['duree_demandee'] = c['duration']; rec['resolution'] = c['resolution']
    t0 = time.time()
    try:
        job = appel('/videos', c); rec['soumis_s'] = round(time.time() - t0, 1)
        while True:
            time.sleep(4); j = appel(f'/videos/{job["id"]}')
            if j['status'] not in ('pending', 'in_progress', 'queued'): break
            if time.time() - t0 > 900: j = {'status': 'trop long (15 min)'}; break
        rec.update(statut=j['status'], total_s=round(time.time() - t0, 1), cout_usd=(j.get('usage') or {}).get('cost'))
        if j['status'] == 'completed':
            open(out, 'wb').write(appel(f'/videos/{job["id"]}/content?index=0', brut=True))
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', out, '-vn', '-ac', '1', '-ar', '24000', out[:-4] + '.wav'])
        else: rec['erreur'] = str(j.get('error'))[:300]
    except RuntimeError as e:
        rec.update(statut='échec', erreur=str(e)[:300], total_s=round(time.time() - t0, 1))
    return rec


def lot(P, IA, modeles, res='720p', son=True, plafond=3.0, seche=False):
    """tous les plans × tous les modèles EN MÊME TEMPS ; devis vérifié avant envoi (plafond DUR) ; mesures écrites."""
    if os.environ.get('OR_PAYANT_AUTORISE') != '1' and not seche:
        raise SystemExit('voie payante désactivée (consigne : rien de payant) — utiliser la voie gratuite « modal »')
    C = catalogue(); absents = [k for k in modeles if k not in C]
    if absents: print('absents du catalogue :', absents)
    modeles = [k for k in modeles if k in C and 'first_frame' in (C[k].get('supported_frame_images') or [])]
    devis = {(k, p['cle']): prix(C[k], duree(C[k], p['t1'] - p['t0']), resolution(C[k], res), son) for k in modeles for p in P}
    total = round(sum(v or 0 for v in devis.values()), 2)
    print(f'devis : {total:.2f} $ pour {len(P)} plan(s) × {len(modeles)} modèle(s) en {res}, son {"modèle" if son else "coupé"} '
          f'(plafond DUR {plafond:.2f} $)', flush=True)
    for (k, c), v in sorted(devis.items()): print(f'   {k:36s} plan {c} : {v} $')
    if any(v is None for v in devis.values()): raise SystemExit('refusé : tarif introuvable pour un modèle (aucun envoi)')
    if total > plafond: raise SystemExit(f'refusé : devis {total:.2f} $ au-dessus du plafond {plafond:.2f} $ (PLAFOND_USD) — aucun envoi')
    if seche:
        ex = corps(modeles[0], C[modeles[0]], P[0], f'{IA}/{P[0]["cle"]}.png', res, son)
        ex['frame_images'][0]['image_url']['url'] = ex['frame_images'][0]['image_url']['url'][:48] + '…'
        print('À SEC — exemple de requête :', json.dumps(ex, ensure_ascii=False, indent=1)); return {'devis_usd': total}
    t0 = time.time(); taches = []
    for k in modeles:
        dos = f'{IA}/openrouter/{k.split("/")[-1]}'; os.makedirs(dos, exist_ok=True)
        taches += [(k, p, dos) for p in P]
    with cf.ThreadPoolExecutor(min(32, len(taches))) as ex:
        R = list(ex.map(lambda t: un_plan(t[0], C[t[0]], t[1], IA, res, son, t[2]), taches))
    for r in R: print(r, flush=True)
    bilan = {'devis_usd': total, 'cout_reel_usd': round(sum(r.get('cout_usd') or 0 for r in R), 4),
             'secondes_bout_en_bout': round(time.time() - t0, 1), 'plans': R}
    os.makedirs(f'{IA}/openrouter', exist_ok=True)
    json.dump(bilan, open(f'{IA}/openrouter/mesures.json', 'w'), ensure_ascii=False, indent=1)
    print(f'LOT TERMINÉ en {bilan["secondes_bout_en_bout"]} s, coût réel {bilan["cout_reel_usd"]} $', flush=True)
    return bilan
