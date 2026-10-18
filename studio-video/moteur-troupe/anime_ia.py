# ANIMATION PAR OUTIL (16/10/2026) — consigne : « cherche l'outil d'animation de la scène et des personnages ».
# Veille : Wan2.2-S2V (Alibaba, Apache-2.0) anime une image + une voix (bouche, tête, buste, gestes), dessin animé et
# plusieurs personnages compris ; InfiniteTalk / MultiTalk (MeiGen, Apache-2.0) font de même en plusieurs personnes.
# Ce script branche ces outils sur NOTRE film : chaque plan qui contient une réplique est envoyé tel quel (le cadre du
# plan pris dans l'image générée + le son exact du plan, silences compris) ; le plan animé remplace nos images, le reste
# du film (montage, sous-titres, cartes, son) ne change pas. Si l'outil ne répond pas, le plan du moteur maison reste.
#
#   python3 anime_ia.py prepare  v16 timeline.json            → v16/ia/<t0>.png + <t0>.wav (+ plans.json)
#   python3 anime_ia.py genere   v16 [dashscope|hf|comfy|kaggle] [N max]   → v16/ia/<t0>.mp4
#   python3 anime_ia.py insere   v16                          → remplace les images des plans animés dans v16/clip
#   python3 anime_ia.py juge     v16 <dossier de .mp4>        → verdicts JEV (3 moments par plan) sans rien insérer
#
# Fournisseurs :
#   dashscope : Alibaba Model Studio, modèle « wan2.2-s2v » (protocole lu dans le code du Space officiel Wan-AI) ;
#               clé lue dans la variable d'environnement DASHSCOPE_API_KEY (jamais écrite ni affichée) ;
#               DASHSCOPE_REGION=intl (Singapour) ou cn (Pékin, défaut du Space officiel).
#   hf        : le Space public Wan-AI/Wan2.2-S2V (gratuit, sans compte) — refusé d'office si sa file dépasse HF_FILE_MAX.
#   comfy     : un serveur ComfyUI (COMFY_URL, défaut http://127.0.0.1:8188) avec les fichiers Wan2.2-S2V — sans abonnement ni coût par génération.
#   kaggle    : la même chaîne ComfyUI + Wan sur une carte T4 GRATUITE du compte Kaggle de l'utilisateur, pilotée d'ici
#               (kaggle_moteur.py + noyau_kaggle.py) : rien à installer sur le PC ; jeton KAGGLE_API_TOKEN dans l'environnement.
import json, os, subprocess, sys, time, wave
import jev_api   # garde JEV (18/10/2026) : coupé par défaut, le juge local répond
import numpy as np, cv2

CW, CH, FPS = 576, 460, 30
cmd, D = sys.argv[1], sys.argv[2]
IA = f'{D}/ia'; os.makedirs(IA, exist_ok=True)

def plans_parlants(T, SH):
    """plans qui contiennent au moins une réplique (le locuteur y est cadré) ; les plans larges muets restent au moteur."""
    out = []
    for s in SH:
        t0, t1 = s[0], s[1]
        if s[4] is None: continue
        if any(L['t0'] < t1 and L['t0'] + L['dur'] > t0 for L in T['lines']): out.append(s)
    return out

if cmd == 'prepare':
    T = json.load(open(sys.argv[3])); SH = json.load(open(f'{D}/tournage.json'))['decoupage']
    with wave.open('voix/mix.wav') as w: sr = w.getframerate(); mix = np.frombuffer(w.readframes(w.getnframes()), np.int16)
    P = []
    for s in plans_parlants(T, SH):
        k = f'{s[0]:06.2f}'
        src = f'{D}/source/{k}.jpg'
        if not os.path.isfile(src): continue
        cv2.imwrite(f'{IA}/{k}.png', cv2.imread(src))
        seg = mix[int(s[0] * sr):int(s[1] * sr)]
        with wave.open(f'{IA}/{k}.wav', 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(seg.tobytes())
        rep = [{x: L.get(x) for x in ('qui', 'texte', 'jeu', 'role')} for L in T['lines'] if L['t0'] < s[1] and L['t0'] + L['dur'] > s[0]]
        P.append({'cle': k, 't0': s[0], 't1': s[1], 'plan': s[3], 'qui': s[4], 'sketch': s[2], 'repliques': rep})
    json.dump(P, open(f'{IA}/plans.json', 'w'), ensure_ascii=False, indent=1)
    print(f'{len(P)} plans parlants préparés ({sum(p["t1"] - p["t0"] for p in P):.1f} s à animer sur {T["total"]:.1f} s)')

elif cmd == 'genere':
    prov = sys.argv[3] if len(sys.argv) > 3 else 'dashscope'; NMAX = int(sys.argv[4]) if len(sys.argv) > 4 else 999
    P = json.load(open(f'{IA}/plans.json'))[:NMAX]
    def dashscope_s2v(img, wav):
        import dashscope, requests
        from dashscope.utils.oss_utils import check_and_upload_local
        key = os.environ.get('DASHSCOPE_API_KEY')
        if not key: raise RuntimeError('DASHSCOPE_API_KEY absente de l’environnement')
        base = 'https://dashscope-intl.aliyuncs.com/api/v1' if os.environ.get('DASHSCOPE_REGION', 'cn') == 'intl' else 'https://dashscope.aliyuncs.com/api/v1'
        dashscope.base_http_api_url = base; dashscope.api_key = key
        _, iu = check_and_upload_local('wan2.2-s2v', img, key); _, au = check_and_upload_local('wan2.2-s2v', wav, key)
        h = {'X-DashScope-Async': 'enable', 'X-DashScope-OssResourceResolve': 'enable', 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
        r = requests.post(f'{base}/services/aigc/image2video/video-synthesis/', headers=h, timeout=60,
                          json={'model': 'wan2.2-s2v', 'input': {'image_url': iu, 'audio_url': au}, 'parameters': {'style': 'speech', 'resolution': '480P'}})
        r.raise_for_status(); tid = r.json()['output']['task_id']
        while True:
            time.sleep(5); g = requests.get(f'{base}/tasks/{tid}', headers={'Authorization': f'Bearer {key}'}, timeout=60).json()['output']
            if g['task_status'] == 'SUCCEEDED': return g['results']['video_url']
            if g['task_status'] in ('FAILED', 'CANCELED', 'UNKNOWN'): raise RuntimeError(g.get('message', g['task_status']))
    def hf_s2v(img, wav):
        import urllib.request
        from gradio_client import Client, handle_file
        q = json.loads(urllib.request.urlopen('https://wan-ai-wan2-2-s2v.hf.space/gradio_api/queue/status', timeout=30).read())
        if q.get('queue_size', 0) > int(os.environ.get('HF_FILE_MAX', '30')): raise RuntimeError(f"file publique trop longue : {q.get('queue_size')}")
        r = Client('Wan-AI/Wan2.2-S2V', verbose=False).predict(ref_img=handle_file(img), audio=handle_file(wav), resolution='480P', api_name='/predict')
        return r['video'] if isinstance(r, dict) else r
    def comfy_s2v(img, wav):
        """ComfyUI local (ou sur le PC de l'utilisateur, COMFY_URL) avec Wan2.2-S2V : aucun abonnement, aucun coût par génération."""
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import comfy_wan as C
        im = cv2.imread(img); h, w = im.shape[:2]
        W, H = (w // 16) * 16, (h // 16) * 16            # Wan travaille par blocs de 16 px
        with wave.open(wav) as f: sec = f.getnframes() / f.getframerate()
        texte = os.environ.get('COMFY_PROMPT', "Personnages africains d'un film d'animation 3D ; celui qui est au centre parle avec des gestes naturels, les autres écoutent et réagissent ; le décor reste identique")
        r = C.soumet(C.graphe_s2v(C.envoie(img), C.envoie(wav), W, H, sec, texte, graine=int(time.time()) % 100000))
        if 'prompt_id' not in r: raise RuntimeError(json.dumps(r.get('node_errors') or r.get('error'), ensure_ascii=False)[:400])
        return C.attend_video(r['prompt_id'], img.replace('.png', '.comfy.mp4'))
    if prov == 'openrouter':   # TEMPS RECORD : tous les plans en même temps sur les grands modèles vidéo (openrouter_video.py)
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import openrouter_video as OV
        OV.lot(P, IA, os.environ.get('OR_MODELES', 'google/veo-3.1-lite').split(','), os.environ.get('OR_RESOLUTION', '720p'),
               os.environ.get('OR_SON', '1') == '1', float(os.environ.get('PLAFOND_USD', '3.00')), os.environ.get('OR_SECHE') == '1')
        sys.exit(0)
    if prov == 'kaggle':       # tout le lot part d'un coup sur la carte gratuite, puis revient dans IA/<cle>.mp4
        r = subprocess.run([os.environ.get('KAGGLE_PY', sys.executable), os.path.join(os.path.dirname(os.path.abspath(__file__)), 'kaggle_moteur.py'), 'tout', D])
        sys.exit(r.returncode)
    fn = {'dashscope': dashscope_s2v, 'hf': hf_s2v, 'comfy': comfy_s2v}[prov]
    for p in P:
        out = f'{IA}/{p["cle"]}.mp4'
        if os.path.isfile(out): continue
        t = time.time()
        try:
            res = fn(f'{IA}/{p["cle"]}.png', f'{IA}/{p["cle"]}.wav')
            if str(res).startswith('http'): subprocess.run(['curl', '-s', '-L', '-o', out, res], check=True)
            else: subprocess.run(['cp', res, out], check=True)
            print(f'{p["cle"]} {p["qui"]} animé en {time.time() - t:.0f} s', flush=True)
        except Exception as e:
            print(f'{p["cle"]} {p["qui"]} : outil indisponible ({e}) → le plan du moteur reste', flush=True)

def arbitre_jev(outil, moteur, reference):
    """L'ŒIL DE JEV tranche chaque plan : le plan de l'outil n'entre dans le film que s'il garde le personnage (visage,
    coiffure, tenue, couleurs de la scène d'origine), sans déformation, et s'il est jugé plus vivant que le plan maison."""
    import base64, uuid, urllib.request
    enc = lambda im: base64.b64encode(cv2.imencode('.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 90])[1].tobytes()).decode()
    r = {n: f'{n}-' + uuid.uuid4().hex[:10] for n in ('outil', 'moteur', 'reference')}
    Q = {'identite': {'type': 'noul', 'instructions': 'Are the characters in `outil` the same characters as in `reference` (same faces, hair, outfits, colors and place)?'},
         'deforme': {'type': 'noul', 'instructions': 'In `outil`, does any face or body look deformed, melted, stretched or anatomically wrong?'},
         'vivant': {'type': 'choice', 'instructions': 'Which frame looks more alive and natural, like a frame from a 3D animated feature film where the character is speaking and moving: `outil` or `moteur`?',
                    'criteria': {'outil': 'the frame named outil', 'moteur': 'the frame named moteur'}}}
    body = {'model': 'jev-1.14.0', 'state': {k: v for k, v in r.items()},
            'assets': {r[k]: {'type': 'image', 'format': 'jpg', 'data_base64': enc(im)} for k, im in (('outil', outil), ('moteur', moteur), ('reference', reference))}, 'questions': Q}
    req = urllib.request.Request('https://api.typesafe.ai/v1/systemone', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
    a = json.loads(jev_api.ouvre(req, outil='anime_ia', timeout=120).read())['answers']
    v = {'identite': round(a['identite']['noul'], 2), 'deforme': round(a['deforme']['noul'], 2), 'vivant': a['vivant'].get('choice')}
    v['garde_outil'] = v['identite'] >= 0.6 and v['deforme'] < 0.5 and v['vivant'] == 'outil'
    return v

def lit_video(mp4):
    cap = cv2.VideoCapture(mp4); fps = cap.get(cv2.CAP_PROP_FPS) or 25; fr = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fr.append(f)
    return fr, fps

def cadre(f):                                   # même cadre que le plan d'origine : recadrage au centre, sans étirer
    h, w = f.shape[:2]; s = max(CW / w, CH / h); im = cv2.resize(f, (int(round(w * s)), int(round(h * s))), interpolation=cv2.INTER_AREA)
    y0, x0 = (im.shape[0] - CH) // 2, (im.shape[1] - CW) // 2; return im[y0:y0 + CH, x0:x0 + CW]

def verdict(fr, p):
    """JEV regarde TROIS moments du plan (25 %, 50 %, 75 %) et non le seul milieu : une déformation passagère (visage
    qui fond une seconde chez un personnage secondaire) suffit à refuser le plan. Identité = la plus faible des trois,
    déformation = la plus forte, « plus vivant » = majorité."""
    f0, f1 = int(round(p['t0'] * FPS)), int(round(p['t1'] * FPS)); vs = []
    for q in (0.25, 0.5, 0.75):
        vs.append(arbitre_jev(cadre(fr[min(len(fr) - 1, int(q * len(fr)))]), cv2.imread(f'{D}/clip/f{int(f0 + q * (f1 - f0)):05d}.jpg'), cv2.imread(f'{IA}/{p["cle"]}.png')))
    v = {'identite': min(x['identite'] for x in vs), 'deforme': max(x['deforme'] for x in vs),
         'vivant': 'outil' if sum(x['vivant'] == 'outil' for x in vs) >= 2 else 'moteur', 'detail': vs}
    v['garde_outil'] = v['identite'] >= 0.6 and v['deforme'] < 0.5 and v['vivant'] == 'outil'
    return v

if cmd == 'juge':                               # juger les plans d'un moteur sans rien insérer (comparaison Wan / EchoMimic)
    P = {p['cle']: p for p in json.load(open(f'{IA}/plans.json'))}; dos = sys.argv[3]; R = {}
    for mp4 in sorted(f for f in os.listdir(dos) if f.endswith('.mp4')):
        k = mp4[:-4]
        if k not in P: continue
        fr, _ = lit_video(f'{dos}/{mp4}'); R[k] = verdict(fr, P[k])
        print(k, P[k]['qui'], {x: R[k][x] for x in ('identite', 'deforme', 'vivant', 'garde_outil')}, flush=True)
    json.dump(R, open(f'{dos}/jev.json', 'w'), ensure_ascii=False, indent=1)

if cmd == 'insere':
    P = json.load(open(f'{IA}/plans.json')); n = 0
    for p in P:
        mp4 = f'{IA}/{p["cle"]}.mp4'
        if not os.path.isfile(mp4): continue
        fr, fps = lit_video(mp4)
        if not fr: continue
        h, w = fr[0].shape[:2]; s = max(CW / w, CH / h)   # même cadre que le plan d'origine : on recadre au centre, sans étirer
        f0, f1 = int(round(p['t0'] * FPS)), int(round(p['t1'] * FPS))
        if os.environ.get('ARBITRE', '1') == '1':
            v = verdict(fr, p)
            print(f'{p["cle"]} {p["qui"]} : JEV', {x: v[x] for x in ('identite', 'deforme', 'vivant', 'garde_outil')}, flush=True)
            if not v['garde_outil']: continue
        # FLUIDE (fluide.py) : couleur recalée sur l'image de départ du plan, chaque image du film interpolée à son instant
        # exact (RIFE, ou flux optique DIS sans PyTorch) — plus aucune image dupliquée (saccade à 25 → 30 i/s)
        import fluide
        imgs, mes = fluide.plan_fluide(mp4, f'{IA}/{p["cle"]}.png', f1 - f0)
        for k in range(f0, f1): cv2.imwrite(f'{D}/clip/f{k:05d}.jpg', imgs[k - f0], [cv2.IMWRITE_JPEG_QUALITY, 94])
        n += 1; print(f'{p["cle"]} {p["qui"]} : {len(fr)} images de l’outil ({fps:.0f} i/s) → {f1 - f0} images du film, {mes["interpolation"]}, figées {mes["avant"]["images_figees_%"]} % → {mes["apres"]["images_figees_%"]} %')
    print(f'{n} plans remplacés par l’outil d’animation')
