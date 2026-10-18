# PUBLICATION TIKTOK OFFICIELLE, GRATUITE, SANS RISQUE POUR LE COMPTE (18/10/2026). Consignes : « je veux que tu fasses
# automatiquement la voie retenue, sans risque et gratuite » ; « si je mets mon compte en privé, je perds ma monétisation » ;
# « en publiant, ne mets pas contenu généré par IA » ; « protège toujours mes données ».
# RÈGLE TIKTOK (Content Sharing Guidelines, Direct Post) : un client API NON AUDITÉ ne publie que sur un compte PRIVÉ et en
# SELF_ONLY. Ce module ne le tente donc JAMAIS sur un compte public : la publication directe n'est essayée que si l'app de
# l'utilisateur est déclarée auditée, et toute réponse « unaudited_client… » fait passer à la voie suivante.
# VOIES, essayées dans l'ordre (chaîne de secours, aucune ne touche à la visibilité du compte) :
#   1. « direct »    : Direct Post (scope video.publish), app auditée — publication publique, sans geste ;
#   2. « brouillon » : Upload vers la boîte de réception TikTok (scope video.upload) — l'épisode arrive en brouillon avec une
#                      notification, l'utilisateur le publie d'un geste dans l'app TikTok ; le compte reste public ;
#   3. « kit »       : dossier « A PUBLIER » (vidéo 1080 × 1920, légende, couverture, fiche) + lien TikTok Studio.
# GARDE-FOUS : seul un épisode « à publier » (toutes les portes, aucune régression) part, sauf --force ; plafond quotidien
# (TikTok : ≈ 15 publications/jour/compte ; défaut 3) ; jamais deux fois la même vidéo (empreinte SHA-1, journal) ;
# étiquette « généré par IA » désactivée par défaut (choix de l'utilisateur, réglable dans app.json : "aigc": true) ;
# clés et jetons seulement dans le dossier privé (workbench/.private/tiktok/, droits 600) ou dans les variables
# d'environnement TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / TIKTOK_REFRESH_TOKEN — jamais affichés ni journalisés.
#   python3 publie_tiktok.py etat                      → voie disponible, plafond du jour, publications passées
#   python3 publie_tiktok.py connecte                  → autorisation TikTok (une fois, dans VOTRE navigateur)
#   python3 publie_tiktok.py publie <épisode>/<version> [--force] [--voie kit|brouillon|direct] [--maintenant]
#   python3 publie_tiktok.py file                      → envoie les épisodes en attente dont le créneau est arrivé
#   python3 publie_tiktok.py apprend                   → relève vues, partages, commentaires (API Display) pour les créneaux
# Légende, couverture et créneau : viral.py (techniques de viralité, JEV choisit la légende, créneaux appris).
import datetime, hashlib, http.server, json, os, re, secrets, shutil, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
# dossier privé : celui du dépôt (ignoré par git) s'il existe, sinon ~/.massamba-prive sur le poste de l'utilisateur
_DEPOT = os.path.join(ICI, '..', '..', 'workbench', '.private')
PRIVE = os.path.expanduser(os.environ.get('MASSAMBA_PRIVE_TIKTOK', os.path.join(_DEPOT if os.path.isdir(_DEPOT) else '~/.massamba-prive', 'tiktok')))
API = 'https://open.tiktokapis.com'
AUTORISE = 'https://www.tiktok.com/v2/auth/authorize/'
STUDIO = 'https://www.tiktok.com/tiktokstudio/upload'
PORT_RAPPEL = int(os.environ.get('TIKTOK_PORT', 8767))
DEFAUTS = {'redirect_uri': f'http://127.0.0.1:{PORT_RAPPEL}/tiktok/rappel/', 'audite': False, 'aigc': False, 'plafond_jour': 3,
           'couverture_ms': 1200, 'commentaires': True, 'duo': True, 'collage': True}


def _lit(nom, defaut=None):
    try: return json.load(open(os.path.join(PRIVE, nom), encoding='utf-8'))
    except (OSError, ValueError): return defaut


def _ecrit(nom, obj):
    os.makedirs(PRIVE, exist_ok=True); f = os.path.join(PRIVE, nom)
    with open(f, 'w', encoding='utf-8') as h: json.dump(obj, h, ensure_ascii=False, indent=1)
    os.chmod(f, 0o600)


def reglages():
    """app.json (rempli par l'utilisateur : client_key, client_secret de SON app TikTok) complété par l'environnement."""
    r = dict(DEFAUTS, **(_lit('app.json', {}) or {}))
    for k, e in (('client_key', 'TIKTOK_CLIENT_KEY'), ('client_secret', 'TIKTOK_CLIENT_SECRET')):
        if os.environ.get(e): r[k] = os.environ[e]
    return r


def _http(methode, url, donnees=None, entetes=None, corps=None, delai=120):
    h = dict(entetes or {})
    if donnees is not None: corps = json.dumps(donnees).encode(); h.setdefault('Content-Type', 'application/json; charset=UTF-8')
    req = urllib.request.Request(url, data=corps, method=methode, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=delai) as r:
            t = r.read(); return r.status, (json.loads(t) if t[:1] in (b'{', b'[') else t)
    except urllib.error.HTTPError as e:
        t = e.read()
        try: return e.code, json.loads(t)
        except ValueError: return e.code, {'error': {'code': f'http_{e.code}', 'message': t[:200].decode('utf-8', 'replace')}}


def _jeton_post(champs):
    corps = urllib.parse.urlencode(champs).encode()
    return _http('POST', f'{API}/v2/oauth/token/', corps=corps, entetes={'Content-Type': 'application/x-www-form-urlencoded'})


# ── 1. AUTORISATION (OAuth 2 + PKCE S256, Login Kit for Desktop : rappel sur 127.0.0.1 avec port) : une fois, sur SON poste ──
def connecte(scopes=None):
    R = reglages()
    if not R.get('client_key') or not R.get('client_secret'):
        print(f"Il manque la clé de votre app TikTok : créez-la (gratuit) sur developers.tiktok.com, puis écrivez client_key et "
              f"client_secret dans {os.path.join(PRIVE, 'app.json')} (ce fichier reste sur votre poste)."); return False
    scopes = scopes or ['user.info.basic', 'user.info.stats', 'video.list', 'video.upload'] + (['video.publish'] if R['audite'] else [])
    verif = secrets.token_urlsafe(48); etat = secrets.token_urlsafe(16)
    defi = hashlib.sha256(verif.encode()).hexdigest()   # Login Kit for Desktop : défi = SHA-256 du vérificateur, en HEXADÉCIMAL (doc TikTok)
    url = AUTORISE + '?' + urllib.parse.urlencode({'client_key': R['client_key'], 'scope': ','.join(scopes), 'response_type': 'code',
                                                  'redirect_uri': R['redirect_uri'], 'state': etat, 'code_challenge': defi,
                                                  'code_challenge_method': 'S256'})
    recu = {}

    class Rappel(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query); recu.update({k: v[0] for k, v in q.items()})
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.end_headers()
            self.wfile.write('<h2>MASSAMBA : TikTok est connecté, vous pouvez fermer cet onglet.</h2>'.encode())

        def log_message(self, *a): pass
    print('Ouvrez ce lien dans votre navigateur (connecté à TikTok) et acceptez :\n' + url)
    try:
        import webbrowser; webbrowser.open(url)
    except Exception: pass
    srv = http.server.HTTPServer(('127.0.0.1', PORT_RAPPEL), Rappel); srv.timeout = 300
    while 'code' not in recu and 'error' not in recu: srv.handle_request()
    if recu.get('state') != etat or 'code' not in recu:
        print('Autorisation refusée ou interrompue :', recu.get('error_description') or recu.get('error')); return False
    st, j = _jeton_post({'client_key': R['client_key'], 'client_secret': R['client_secret'], 'code': recu['code'],
                         'grant_type': 'authorization_code', 'redirect_uri': R['redirect_uri'], 'code_verifier': verif})
    if st != 200 or 'access_token' not in j:
        print('Échange du code refusé :', (j.get('error_description') or j.get('error') if isinstance(j, dict) else st)); return False
    _garde_jetons(j); print('TikTok connecté. Portées accordées :', j.get('scope')); return True


def _garde_jetons(j):
    _ecrit('jetons.json', {'access_token': j['access_token'], 'refresh_token': j.get('refresh_token'), 'open_id': j.get('open_id'),
                           'scope': j.get('scope', ''), 'expire': time.time() + int(j.get('expires_in', 86400)) - 120,
                           'expire_refresh': time.time() + int(j.get('refresh_expires_in', 365 * 86400)) - 120})


def jeton():
    """jeton d'accès valide (rafraîchi au besoin) ou None ; jamais affiché."""
    R = reglages(); J = _lit('jetons.json') or {}
    if os.environ.get('TIKTOK_REFRESH_TOKEN') and not J.get('refresh_token'): J = {'refresh_token': os.environ['TIKTOK_REFRESH_TOKEN'], 'expire': 0}
    if J.get('access_token') and J.get('expire', 0) > time.time(): return J
    if not (J.get('refresh_token') and R.get('client_key') and R.get('client_secret')): return None
    st, j = _jeton_post({'client_key': R['client_key'], 'client_secret': R['client_secret'], 'grant_type': 'refresh_token',
                         'refresh_token': J['refresh_token']})
    if st != 200 or 'access_token' not in j: return None
    _garde_jetons(j); return _lit('jetons.json')


# ── 2. DÉPÔT DE LA VIDÉO (Media Transfer Guide : morceaux de 5 à 64 Mo, dernier ≤ 128 Mo, un seul morceau < 64 Mo) ──
def decoupe(n):
    if n <= 64 * 2 ** 20: return n, 1
    cs = 32 * 2 ** 20; return cs, n // cs


def _envoie(url_depot, chemin):
    n = os.path.getsize(chemin); cs, k = decoupe(n)
    with open(chemin, 'rb') as f:
        for i in range(k):
            a = i * cs; b = n - 1 if i == k - 1 else a + cs - 1; f.seek(a); morceau = f.read(b - a + 1)
            st, r = _http('PUT', url_depot, corps=morceau, entetes={'Content-Type': 'video/mp4', 'Content-Length': str(len(morceau)),
                                                                     'Content-Range': f'bytes {a}-{b}/{n}'}, delai=600)
            if st not in (200, 201, 206): raise RuntimeError(f'envoi du morceau {i + 1}/{k} refusé ({st})')


def _statut(J, publish_id, attente=180):
    t0 = time.time(); s = {}
    while time.time() - t0 < attente:
        st, r = _http('POST', f'{API}/v2/post/publish/status/fetch/', {'publish_id': publish_id}, {'Authorization': f"Bearer {J['access_token']}"})
        s = (r or {}).get('data', {}) if isinstance(r, dict) else {}
        if s.get('status') in ('SEND_TO_USER_INBOX', 'PUBLISH_COMPLETE', 'FAILED'): return s
        time.sleep(5)
    return s or {'status': 'EN_ATTENTE'}


def brouillon(chemin, J):
    n = os.path.getsize(chemin); cs, k = decoupe(n)
    st, r = _http('POST', f'{API}/v2/post/publish/inbox/video/init/',
                  {'source_info': {'source': 'FILE_UPLOAD', 'video_size': n, 'chunk_size': cs, 'total_chunk_count': k}},
                  {'Authorization': f"Bearer {J['access_token']}"})
    err = (r or {}).get('error', {}) if isinstance(r, dict) else {}
    if st != 200 or err.get('code') not in (None, 'ok'): raise RuntimeError(f"brouillon refusé : {err.get('code')} {err.get('message', '')[:120]}")
    d = r['data']; _envoie(d['upload_url'], chemin); s = _statut(J, d['publish_id'])
    return {'publish_id': d['publish_id'], 'statut': s.get('status'), 'raison': s.get('fail_reason')}


def direct(chemin, J, legende, R):
    h = {'Authorization': f"Bearer {J['access_token']}"}
    st, ci = _http('POST', f'{API}/v2/post/publish/creator_info/query/', {}, h)
    opts = ((ci or {}).get('data') or {}).get('privacy_level_options') or []
    if 'PUBLIC_TO_EVERYONE' not in opts: raise RuntimeError('publication publique non proposée par TikTok pour ce compte')
    n = os.path.getsize(chemin); cs, k = decoupe(n)
    post = {'title': legende[:2200], 'privacy_level': 'PUBLIC_TO_EVERYONE', 'disable_comment': not R['commentaires'],
            'disable_duet': not R['duo'], 'disable_stitch': not R['collage'], 'video_cover_timestamp_ms': int(R['couverture_ms']),
            'brand_content_toggle': False, 'brand_organic_toggle': False, 'is_aigc': bool(R['aigc'])}
    st, r = _http('POST', f'{API}/v2/post/publish/video/init/',
                  {'post_info': post, 'source_info': {'source': 'FILE_UPLOAD', 'video_size': n, 'chunk_size': cs, 'total_chunk_count': k}}, h)
    err = (r or {}).get('error', {}) if isinstance(r, dict) else {}
    if st != 200 or err.get('code') not in (None, 'ok'): raise RuntimeError(f"publication directe refusée : {err.get('code')}")
    d = r['data']; _envoie(d['upload_url'], chemin); s = _statut(J, d['publish_id'], attente=300)
    return {'publish_id': d['publish_id'], 'statut': s.get('status'), 'raison': s.get('fail_reason')}


# ── 3. KIT « A PUBLIER » (toujours écrit : c'est aussi la trace de ce qui est parti) ──
def kit(D, legende, R, sortie=None):
    ep = os.path.basename(os.path.dirname(os.path.abspath(D))); v = os.path.basename(os.path.abspath(D))
    K = sortie or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(D))), 'A PUBLIER', f'{ep}-{v}')
    os.makedirs(K, exist_ok=True)
    shutil.copy2(os.path.join(D, 'tiktok-1080x1920.mp4'), os.path.join(K, f'{ep}-{v}.mp4'))
    open(os.path.join(K, 'legende.txt'), 'w', encoding='utf-8').write(legende)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f"{R['couverture_ms'] / 1000:.2f}", '-i', os.path.join(D, 'tiktok-1080x1920.mp4'),
                    '-frames:v', '1', '-q:v', '2', os.path.join(K, 'couverture.jpg')], check=False, capture_output=True)
    open(os.path.join(K, 'LISEZ-MOI.txt'), 'w', encoding='utf-8').write(
        f"Épisode prêt à publier (contrôles passés).\n1. Ouvrez TikTok Studio : {STUDIO}\n2. Déposez {ep}-{v}.mp4, collez legende.txt.\n"
        f"3. Visibilité : Tout le monde. Étiquette « généré par IA » : {'activée' if R['aigc'] else 'désactivée (votre choix)'}.\n"
        f"4. Couverture : l'image à {R['couverture_ms'] / 1000:.1f} s (premier choc), fournie dans couverture.jpg.\n")
    return K


def _legende(D):
    f = os.path.join(D, 'legende.txt'); t = open(f, encoding='utf-8').read().strip() if os.path.isfile(f) else ''
    return t


def journal():
    f = os.path.join(PRIVE, 'journal.jsonl')
    return [json.loads(l) for l in open(f, encoding='utf-8')] if os.path.isfile(f) else []


def _note(e):
    os.makedirs(PRIVE, exist_ok=True); f = os.path.join(PRIVE, 'journal.jsonl')
    with open(f, 'a', encoding='utf-8') as h: h.write(json.dumps(e, ensure_ascii=False) + '\n')
    os.chmod(f, 0o600)


# NORMES DE PUBLICATION (18/10/2026, « s'assurer avant la publication que toutes les vidéos respectent toutes les normes ») :
# contrôle du FICHIER juste avant l'envoi, en plus des 17 portes et de la non-régression (rapport « à publier ») —
# Media Transfer Guide TikTok (MP4 H.264, 23–60 i/s, côtés 360–4096 px, ≤ 10 min) ; rémunération TikTok : plus d'une
# minute ; YouTube Shorts : 3 min au plus ; vertical 1080 × 1920 ; son AAC ; sonie −14 LUFS ± 1,5 (compose.py) ;
# légende ≤ 2 200 caractères et 5 mots-dièse au plus. Une seule norme manquée : rien ne part.
def normes(D, legende=''):
    mp4 = os.path.join(D, 'tiktok-1080x1920.mp4'); f = []
    try:
        j = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,avg_frame_rate',
                                       '-of', 'json', mp4], capture_output=True, text=True, check=True).stdout)
    except Exception as e:
        return [f'fichier illisible ({str(e)[:60]})']
    v = next((x for x in j.get('streams', []) if x.get('codec_type') == 'video'), {}); a = next((x for x in j.get('streams', []) if x.get('codec_type') == 'audio'), {})
    d = float(j.get('format', {}).get('duration', 0)); n, q = (v.get('avg_frame_rate') or '0/1').split('/'); fps = float(n) / max(1.0, float(q))
    if v.get('codec_name') != 'h264': f.append(f"codec vidéo {v.get('codec_name')} (H.264 attendu)")
    if (v.get('width'), v.get('height')) != (1080, 1920): f.append(f"format {v.get('width')}×{v.get('height')} (1080×1920 attendu)")
    if not 23 <= fps <= 60: f.append(f'cadence {fps:.1f} i/s (23 à 60)')
    if not 61.0 <= d <= 180.0: f.append(f'durée {d:.1f} s (plus d’une minute pour la rémunération, 3 min au plus pour les Shorts)')
    if a.get('codec_name') != 'aac': f.append(f"son {a.get('codec_name')} (AAC attendu)")
    if int(j.get('format', {}).get('size', 0)) > 4 * 2 ** 30: f.append('fichier de plus de 4 Go')
    try:
        r = subprocess.run(['ffmpeg', '-v', 'info', '-i', mp4, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
        I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r)[-1])
        if abs(I + 14.0) > 1.5: f.append(f'sonie {I:.1f} LUFS (−14 ± 1,5 attendu)')
    except Exception:
        f.append('sonie non mesurée')
    if len(legende) > 2200: f.append(f'légende de {len(legende)} caractères (2 200 au plus)')
    if len(re.findall(r'(?<!\S)#\w', legende)) > 5: f.append('plus de 5 mots-dièse')
    return f


def publie(D, force=False, voie=None, maintenant=False):
    """→ {'voie', 'statut', …}. D = dossier de version (rapport.json, tiktok-1080x1920.mp4, legende.txt)."""
    D = os.path.abspath(D); R = reglages(); mp4 = os.path.join(D, 'tiktok-1080x1920.mp4')
    rap = json.load(open(os.path.join(D, 'rapport.json'))) if os.path.isfile(os.path.join(D, 'rapport.json')) else {}
    if not os.path.isfile(mp4): return {'voie': None, 'statut': 'pas de fichier TikTok'}
    if not force and not rap.get('a_publier'):
        return {'voie': None, 'statut': 'retenu : épisode pas « à publier »', 'echecs': rap.get('echecs'), 'regressions': (rap.get('non_regression') or {}).get('regressions')}
    emp = hashlib.sha1(open(mp4, 'rb').read()).hexdigest(); J_ = journal()
    deja = next((e for e in J_ if e.get('empreinte') == emp and e.get('voie') in ('direct', 'brouillon') and e.get('statut') != 'FAILED'), None)
    if deja: return dict(deja, statut='déjà envoyé')
    jour = datetime.date.today().isoformat()
    if sum(1 for e in J_ if e.get('jour') == jour and e.get('voie') in ('direct', 'brouillon')) >= int(R['plafond_jour']) and voie != 'kit':
        voie = 'kit'   # plafond du jour atteint : le kit est prêt, l'envoi part au prochain lancement
    try:
        import viral; P = viral.prepare(D); leg = P['legende']; R['couverture_ms'] = P['couverture_ms']; style = P['style']
        cren, pourquoi = viral.creneau(J_, _lit('stats.json', {}) or {}, graine=len(J_))
    except Exception as ex:
        leg, style, cren, pourquoi = _legende(D), 'legende.txt', None, f'viral indisponible ({str(ex)[:60]})'
    manque = normes(D, leg)
    if manque and not force: return {'voie': None, 'statut': 'retenu : normes de publication non respectées', 'normes': manque}
    K = kit(D, leg, R); J = jeton() if voie != 'kit' else None
    if J and R['audite'] and cren and not maintenant and not _dans_creneau(cren):   # publication directe : au créneau choisi
        _attente_ajoute(D, cren); return {'voie': 'direct', 'statut': f'en attente du créneau {cren} ({pourquoi})', 'kit': K}
    essais = [v for v in (['direct'] if R['audite'] else []) + ['brouillon'] if voie in (None, v) and J]
    res = {'voie': 'kit', 'statut': 'prêt dans « A PUBLIER »', 'kit': K}
    for v in essais:
        try: res = dict(direct(mp4, J, leg, R) if v == 'direct' else brouillon(mp4, J), voie=v, kit=K); break
        except Exception as ex: res['erreur_' + v] = str(ex)[:200]   # voie suivante, sans attendre
    res.update(style=style, creneau=cren, creneau_pourquoi=pourquoi)
    _note({'jour': jour, 'heure': datetime.datetime.now().strftime('%H:%M:%S'), 'episode': os.path.basename(os.path.dirname(D)),
           'version': os.path.basename(D), 'empreinte': emp, 'debut_legende': leg.split('\n')[0][:60],
           **{k: res.get(k) for k in ('voie', 'statut', 'publish_id', 'raison', 'style', 'creneau')}})
    return res


def _dans_creneau(c, marge_min=45):
    h, m = map(int, c.split(':')); now = datetime.datetime.now(datetime.timezone.utc)   # Abidjan = UTC+0
    return abs((now.hour * 60 + now.minute) - (h * 60 + m)) <= marge_min


def _attente_ajoute(D, c):
    A = _lit('attente.json', []) or []
    if not any(x['D'] == D for x in A): A.append({'D': D, 'creneau': c}); _ecrit('attente.json', A)


def file():
    """envoie les épisodes en attente dont le créneau est arrivé (à lancer chaque heure par la tâche planifiée)."""
    A = _lit('attente.json', []) or []; reste, faits = [], []
    for x in A:
        if _dans_creneau(x['creneau']): faits.append(publie(x['D'], maintenant=True))
        else: reste.append(x)
    _ecrit('attente.json', reste); return faits


def apprend():
    """relève les chiffres des vidéos du compte (API Display, scope video.list) et les rattache au journal (début de
    légende) : c'est la mesure qui remplace les créneaux d'hypothèse par ceux qui marchent sur CE public."""
    J = jeton()
    if not J or 'video.list' not in (J.get('scope') or ''): return {'statut': 'connexion TikTok sans video.list'}
    st, r = _http('POST', f'{API}/v2/video/list/?fields=id,create_time,title,view_count,like_count,comment_count,share_count',
                  {'max_count': 20}, {'Authorization': f"Bearer {J['access_token']}"})
    vids = ((r or {}).get('data') or {}).get('videos') or [] if isinstance(r, dict) else []
    P = journal(); stats = {}
    for v in vids:
        stats[v['id']] = {k: v.get(k, 0) for k in ('view_count', 'like_count', 'comment_count', 'share_count')}
        for e in P:
            if not e.get('video_id') and e.get('debut_legende') and (v.get('title') or '').startswith(e['debut_legende'][:30]): e['video_id'] = v['id']
    f = os.path.join(PRIVE, 'journal.jsonl')
    with open(f, 'w', encoding='utf-8') as h: h.write(''.join(json.dumps(e, ensure_ascii=False) + '\n' for e in P))
    _ecrit('stats.json', stats); return {'videos': len(vids), 'rattachees': sum(1 for e in P if e.get('video_id'))}


def etat():
    R = reglages(); J = _lit('jetons.json') or {}; jour = datetime.date.today().isoformat(); P = journal()
    voie = 'direct' if R['audite'] and 'video.publish' in J.get('scope', '') else ('brouillon' if J.get('refresh_token') or os.environ.get('TIKTOK_REFRESH_TOKEN') else 'kit')
    return {'voie': voie, 'app_tiktok': bool(R.get('client_key')), 'connecte': bool(J.get('refresh_token')), 'aigc': R['aigc'],
            'plafond_jour': R['plafond_jour'], 'envoyes_aujourdhui': sum(1 for e in P if e.get('jour') == jour and e.get('voie') in ('direct', 'brouillon')),
            'publications': len(P)}


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] == 'etat': print(json.dumps(etat(), ensure_ascii=False, indent=1))
    elif a[0] == 'connecte': sys.exit(0 if connecte() else 1)
    elif a[0] == 'publie':
        voie = a[a.index('--voie') + 1] if '--voie' in a else None
        print(json.dumps(publie(a[1], force='--force' in a, voie=voie, maintenant='--maintenant' in a), ensure_ascii=False, indent=1))
    elif a[0] == 'file': print(json.dumps(file(), ensure_ascii=False, indent=1))
    elif a[0] == 'apprend': print(json.dumps(apprend(), ensure_ascii=False, indent=1))
    else: print(__doc__ or open(__file__, encoding='utf-8').read().split('import ')[0])
