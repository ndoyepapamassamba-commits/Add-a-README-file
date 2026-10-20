# DIFFUSION PARTOUT (18/10/2026, « que mes vidéos, mes publications passent en boucle partout »). Le même épisode, déjà
# « à publier », part aussi sur les autres plateformes de vidéos courtes, par leurs API OFFICIELLES et gratuites, avec le
# compte de l'utilisateur (autorisation donnée par lui, une fois, dans son navigateur ; jetons dans son dossier privé).
# Jamais de faux comptes, de robots, de vues ou de partages achetés : les plateformes les détectent et coupent la
# monétisation — l'audience vient de la vidéo, de la boucle sans coupure (compose.py) et de la légende (viral.py).
# REA D'ABORD (client officiel @googleapis/youtube 40.0.1, Apache-2.0, preuve ev_eb87c4b0…, build/v3.js : videos.insert
# = POST https://youtube.googleapis.com/upload/youtube/v3/videos, paramètre requis « part ») ; envoi « resumable » :
# une session (en-tête Location), puis les octets en PUT.
# PLATEFORMES :
#   · YouTube Shorts (vertical, ≤ 3 min) : envoi automatique. Règle YouTube : un projet d'API non vérifié ne publie qu'en
#     PRIVÉ — la vidéo arrive privée dans YouTube Studio, un clic la rend publique ; après l'audit (gratuit), « audite »
#     dans youtube/app.json et la vidéo part publique ;
#   · Instagram Reels et Facebook Reels (API Graph de Meta, compte professionnel relié à une page) : greffe en cours —
#     le kit « A PUBLIER » sert en attendant ;
# « contenu synthétique » : faux par défaut — YouTube ne le demande que pour un contenu réaliste, pas pour l'animation.
#   python3 diffuse.py connecte youtube      → autorisation Google (une fois, dans VOTRE navigateur)
#   python3 diffuse.py envoie <épisode>/<version> [--force]
import datetime, hashlib, http.server, json, os, secrets, sys, time, urllib.error, urllib.parse, urllib.request, base64

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import publie_tiktok as pt

PRIVE_YT = os.path.join(os.path.dirname(pt.PRIVE), 'youtube')
AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'; JETON = 'https://oauth2.googleapis.com/token'
ENVOI = 'https://youtube.googleapis.com/upload/youtube/v3/videos'
SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly']
PORT = int(os.environ.get('YOUTUBE_PORT', 8768))


def _lit(nom, d=None):
    try: return json.load(open(os.path.join(PRIVE_YT, nom), encoding='utf-8'))
    except (OSError, ValueError): return d


def _ecrit(nom, obj):
    os.makedirs(PRIVE_YT, exist_ok=True); f = os.path.join(PRIVE_YT, nom)
    json.dump(obj, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); os.chmod(f, 0o600)


def reglages():
    r = {'audite': False, 'synthetique': False, 'categorie': '23', 'plafond_jour': 3, **(_lit('app.json', {}) or {})}   # 23 = Comédie
    for k, e in (('client_id', 'YOUTUBE_CLIENT_ID'), ('client_secret', 'YOUTUBE_CLIENT_SECRET')):
        if os.environ.get(e): r[k] = os.environ[e]
    return r


def _form(url, champs):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(champs).encode(), method='POST',
                                 headers={'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')


def connecte():
    """OAuth 2 « application de bureau » de Google : rappel sur 127.0.0.1, PKCE S256 (base64url)."""
    R = reglages()
    if not R.get('client_id'):
        print(f"Il manque l'identifiant de votre projet Google (gratuit) : écrivez client_id et client_secret dans "
              f"{os.path.join(PRIVE_YT, 'app.json')} (ce fichier reste sur votre poste)."); return False
    verif = secrets.token_urlsafe(64); etat = secrets.token_urlsafe(16); rappel = f'http://127.0.0.1:{PORT}/'
    defi = base64.urlsafe_b64encode(hashlib.sha256(verif.encode()).digest()).rstrip(b'=').decode()
    url = AUTH + '?' + urllib.parse.urlencode({'client_id': R['client_id'], 'redirect_uri': rappel, 'response_type': 'code',
                                              'scope': ' '.join(SCOPES), 'state': etat, 'code_challenge': defi,
                                              'code_challenge_method': 'S256', 'access_type': 'offline', 'prompt': 'consent'})
    recu = {}

    class Rappel(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            recu.update({k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).items()})
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.end_headers()
            self.wfile.write('<h2>MASSAMBA : YouTube est connecté, vous pouvez fermer cet onglet.</h2>'.encode())

        def log_message(self, *a): pass
    print('Ouvrez ce lien dans votre navigateur (connecté à votre chaîne YouTube) et acceptez :\n' + url)
    try:
        import webbrowser; webbrowser.open(url)
    except Exception: pass
    srv = http.server.HTTPServer(('127.0.0.1', PORT), Rappel); srv.timeout = 300
    while 'code' not in recu and 'error' not in recu: srv.handle_request()
    if recu.get('state') != etat or 'code' not in recu: print('Autorisation refusée :', recu.get('error')); return False
    st, j = _form(JETON, {'client_id': R['client_id'], 'client_secret': R.get('client_secret', ''), 'code': recu['code'],
                          'code_verifier': verif, 'grant_type': 'authorization_code', 'redirect_uri': rappel})
    if st != 200 or 'access_token' not in j: print('Échange refusé :', j.get('error')); return False
    _ecrit('jetons.json', {'access_token': j['access_token'], 'refresh_token': j.get('refresh_token'),
                           'expire': time.time() + int(j.get('expires_in', 3600)) - 60})
    print('YouTube connecté.'); return True


def jeton():
    R = reglages(); J = _lit('jetons.json') or {}
    if os.environ.get('YOUTUBE_REFRESH_TOKEN') and not J.get('refresh_token'): J = {'refresh_token': os.environ['YOUTUBE_REFRESH_TOKEN'], 'expire': 0}
    if J.get('access_token') and J.get('expire', 0) > time.time(): return J
    if not (J.get('refresh_token') and R.get('client_id')): return None
    st, j = _form(JETON, {'client_id': R['client_id'], 'client_secret': R.get('client_secret', ''), 'grant_type': 'refresh_token',
                          'refresh_token': J['refresh_token']})
    if st != 200 or 'access_token' not in j: return None
    J.update(access_token=j['access_token'], expire=time.time() + int(j.get('expires_in', 3600)) - 60); _ecrit('jetons.json', J); return J


def titre_short(legende):
    """titre YouTube (≤ 100 caractères) : la première ligne de la légende + #Shorts."""
    t = legende.split('\n')[0].strip()
    return (t[:100 - 9].rstrip(' ·') + ' #Shorts')[:100]


def envoie_youtube(mp4, legende, R, J):
    n = os.path.getsize(mp4)
    meta = {'snippet': {'title': titre_short(legende), 'description': legende[:4900], 'categoryId': R['categorie'],
                        'tags': [t.lstrip('#') for t in legende.split() if t.startswith('#')][:15], 'defaultLanguage': 'fr'},
            'status': {'privacyStatus': 'public' if R['audite'] else 'private', 'selfDeclaredMadeForKids': False,
                       'containsSyntheticMedia': bool(R['synthetique'])}}
    req = urllib.request.Request(ENVOI + '?uploadType=resumable&part=snippet,status', data=json.dumps(meta).encode(), method='POST',
                                 headers={'Authorization': f"Bearer {J['access_token']}", 'Content-Type': 'application/json; charset=UTF-8',
                                          'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': str(n)})
    with urllib.request.urlopen(req, timeout=60) as r: session = r.headers['Location']
    req = urllib.request.Request(session, data=open(mp4, 'rb').read(), method='PUT', headers={'Content-Type': 'video/mp4', 'Content-Length': str(n)})
    with urllib.request.urlopen(req, timeout=900) as r: v = json.loads(r.read())
    return {'plateforme': 'youtube', 'video_id': v.get('id'), 'statut': (v.get('status') or {}).get('privacyStatus'),
            'a_faire': None if R['audite'] else 'YouTube Studio → la vidéo est privée : un clic sur « Public » (ou programmez-la)'}


def envoie(D, force=False):
    """diffuse la version D sur les plateformes connectées ; → liste de résultats (une ligne par plateforme)."""
    D = os.path.abspath(D); mp4 = os.path.join(D, 'tiktok-1080x1920.mp4')
    rap = json.load(open(os.path.join(D, 'rapport.json'))) if os.path.isfile(os.path.join(D, 'rapport.json')) else {}
    if not os.path.isfile(mp4): return [{'statut': 'pas de fichier vidéo'}]
    if not force and not rap.get('a_publier'): return [{'statut': 'retenu : épisode pas « à publier »'}]
    P = json.load(open(os.path.join(D, 'publication.json'), encoding='utf-8')) if os.path.isfile(os.path.join(D, 'publication.json')) else {}
    leg = P.get('legende') or pt._legende(D); emp = hashlib.sha1(open(mp4, 'rb').read()).hexdigest(); out = []
    deja = {e.get('plateforme') for e in (_lit('journal.json', []) or []) if e.get('empreinte') == emp and e.get('video_id')}
    R = reglages(); J = jeton()
    if 'youtube' in deja: out.append({'plateforme': 'youtube', 'statut': 'déjà envoyé'})
    elif J:
        try: out.append(envoie_youtube(mp4, leg, R, J))
        except Exception as ex: out.append({'plateforme': 'youtube', 'statut': 'erreur : ' + str(ex)[:160]})
    else: out.append({'plateforme': 'youtube', 'statut': 'non connecté (python3 diffuse.py connecte youtube)'})
    out.append({'plateforme': 'instagram/facebook', 'statut': 'greffe en cours (API Graph de Meta) — kit « A PUBLIER » en attendant'})
    if any(o.get('video_id') for o in out):
        Jn = _lit('journal.json', []) or []
        Jn += [dict(o, empreinte=emp, jour=datetime.date.today().isoformat(), episode=os.path.basename(os.path.dirname(D))) for o in out if o.get('video_id')]
        _ecrit('journal.json', Jn)
    return out


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['connecte']: sys.exit(0 if connecte() else 1)
    elif a[:1] == ['envoie']: print(json.dumps(envoie(a[1], force='--force' in a), ensure_ascii=False, indent=1))
    else: print(open(__file__, encoding='utf-8').read().split('import ')[0])
