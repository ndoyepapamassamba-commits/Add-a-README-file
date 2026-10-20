# BILAN DE MONÉTISATION (18/10/2026) — lit, par les API OFFICIELLES et avec les autorisations que l'utilisateur a données,
# les chiffres de ses comptes et écrit un bilan à importer dans la rubrique « Monétisation » de l'app. Le bilan ne contient
# AUCUN jeton ni aucune clé (l'app le refuse sinon) ; il reste sur le poste de l'utilisateur.
#   TikTok (Display API) : abonnés, mentions j'aime, vidéos (user.info.stats) ; vues des vidéos publiées depuis 30 jours
#     (video.list) — c'est une approximation des « vues sur 30 jours » du programme, signalée comme telle ;
#   YouTube (Data API v3, channels?mine=true) : abonnés, vues totales, vidéos. Les vues de Shorts sur 90 jours et les
#     heures de visionnage viennent de YouTube Analytics (portée yt-analytics.readonly) : greffe en cours.
#   python3 monetisation.py bilan > bilan.json
import datetime, json, os, sys, time, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import publie_tiktok as pt


def _get(url, jeton, donnees=None):
    req = urllib.request.Request(url, data=json.dumps(donnees).encode() if donnees is not None else None,
                                 method='POST' if donnees is not None else 'GET',
                                 headers={'Authorization': f'Bearer {jeton}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())


def tiktok():
    J = pt.jeton(); out = {'connecte': bool(J)}
    if not J: return out
    try:
        u = _get(f'{pt.API}/v2/user/info/?fields=follower_count,likes_count,video_count', J['access_token']).get('data', {}).get('user', {})
        out.update(abonnes=u.get('follower_count'), mentions=u.get('likes_count'), videos=u.get('video_count'))
    except Exception as e:
        out['erreur_profil'] = str(e)[:120]
    try:
        limite = time.time() - 30 * 86400; vues = 0; curseur = None
        for _ in range(10):   # au plus 200 vidéos récentes
            corps = {'max_count': 20, **({'cursor': curseur} if curseur else {})}
            d = _get(f'{pt.API}/v2/video/list/?fields=id,create_time,view_count', J['access_token'], corps).get('data', {})
            vs = d.get('videos') or []
            vues += sum(int(v.get('view_count', 0)) for v in vs if int(v.get('create_time', 0)) >= limite)
            if not d.get('has_more') or (vs and int(vs[-1].get('create_time', 0)) < limite): break
            curseur = d.get('cursor')
        out['vues_30j'] = vues; out['vues_30j_note'] = 'vues des vidéos publiées depuis 30 jours (approximation)'
    except Exception as e:
        out['erreur_videos'] = str(e)[:120]
    return out


def youtube():
    try:
        import diffuse
        J = diffuse.jeton()
    except Exception:
        J = None
    out = {'connecte': bool(J)}
    if not J: return out
    try:
        it = _get('https://youtube.googleapis.com/youtube/v3/channels?part=statistics&mine=true', J['access_token']).get('items') or []
        s = (it[0] if it else {}).get('statistics', {})
        out.update(abonnes=int(s.get('subscriberCount', 0)), vues_total=int(s.get('viewCount', 0)), videos=int(s.get('videoCount', 0)))
    except Exception as e:
        out['erreur'] = str(e)[:120]
    return out


def bilan():
    return {'date': datetime.date.today().isoformat(),
            'plateformes': {'tiktok': tiktok(), 'youtube': youtube(), 'facebook': {'connecte': False}, 'instagram': {'connecte': False}}}


if __name__ == '__main__':
    if sys.argv[1:2] == ['bilan']: print(json.dumps(bilan(), ensure_ascii=False, indent=1))
    else: print(open(__file__, encoding='utf-8').read().split('import ')[0])
