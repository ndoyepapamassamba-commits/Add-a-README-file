# VIRALITÉ MESURÉE APRÈS PUBLICATION (20/10/2026, « mesure la viralité de la vidéo sur TikTok après, il faut amener l'humour à
# son extrême avec ces échanges avec chute qui oblige les gens à aimer et commenter »).
# CE QUE DIT TIKTOK (« How TikTok recommends videos #ForYou », newsroom officielle, repris dans viral.py) : les signaux forts sont
# finir la vidéo, partager, commenter, s'abonner. On mesure donc, pour chaque vidéo publiée, ce que le public FAIT :
#   · taux de commentaire = commentaires / vues ; taux de partage = partages / vues ; j'aime / vues ;
#   · engagement = (j'aime + commentaires + partages) / vues ; vitesse = vues par heure depuis la mise en ligne ;
#   · chaque relevé est daté : la courbe d'une vidéo (1 h, 24 h, 72 h) se lit dans l'historique ;
#   · chaque vidéo est rattachée à son épisode (journal de publie_tiktok.py) et aux MÉCANIQUES de ses chutes (histoire.json) :
#     au-delà de 6 vidéos mesurées, le rapport compare les mécaniques (taux de commentaire et de partage moyens), pour que
#     l'écriture garde ce qui fait réagir CE public. Aucun seuil « viral » inventé : tout est relatif aux vidéos du compte.
# SOURCES, dans l'ordre (aucune ne publie rien, aucune ne touche au compte) :
#   1. API Display de TikTok (scope video.list, lecture seule, connexion de l'utilisateur : publie_tiktok.py connecte) ;
#   2. relevé à la main des chiffres de TikTok Studio : viralite.py note <vidéo> vues=… jaime=… commentaires=… partages=… ;
#   3. export de TikTok Studio (CSV) déposé dans le dossier privé : colonnes reconnues par leur nom (vues/views, j'aime/likes,
#      commentaires/comments, partages/shares, titre/title).
# Tout reste dans le dossier privé (workbench/.private/tiktok/, ignoré par git) : ce sont les chiffres du compte de l'utilisateur.
#   python3 viralite.py releve | note <vidéo> vues=N jaime=N commentaires=N partages=N [publiee=AAAA-MM-JJTHH:MM] | importe f.csv | rapport
import csv, datetime, json, os, re, sys, unicodedata

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import publie_tiktok as PT

HIST = 'viralite-historique.jsonl'
CHAMPS = {'vues': ('vue', 'view', 'lecture', 'play'), 'jaime': ('aime', 'like'), 'commentaires': ('comment',),
          'partages': ('partag', 'share'), 'titre': ('titre', 'title', 'descr', 'legende')}


def _sans(s):
    return unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode().lower()


def _ajoute(entrees):
    os.makedirs(PT.PRIVE, exist_ok=True); f = os.path.join(PT.PRIVE, HIST)
    with open(f, 'a', encoding='utf-8') as h:
        for e in entrees: h.write(json.dumps(e, ensure_ascii=False) + '\n')
    os.chmod(f, 0o600)


def historique():
    f = os.path.join(PT.PRIVE, HIST)
    return [json.loads(l) for l in open(f, encoding='utf-8') if l.strip()] if os.path.isfile(f) else []


def releve():
    """relevé par l'API Display (si l'utilisateur a connecté son compte) ; chaque vidéo datée dans l'historique."""
    r = PT.apprend()
    if 'videos' not in r: return r
    st = PT._lit('stats.json', {}) or {}; maintenant = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    _ajoute([{'video': vid, 'source': 'api', 'releve': maintenant, 'vues': s.get('view_count', 0), 'jaime': s.get('like_count', 0),
              'commentaires': s.get('comment_count', 0), 'partages': s.get('share_count', 0)} for vid, s in st.items()])
    return {**r, 'releves': len(st)}


def note(video, **chiffres):
    """chiffres lus dans TikTok Studio, notés à la main (aucune valeur supposée : seules celles données sont écrites)."""
    e = {'video': video, 'source': 'main', 'releve': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')}
    for k, v in chiffres.items():
        if k in ('vues', 'jaime', 'commentaires', 'partages'): e[k] = int(v)
        elif k == 'publiee': e['publiee'] = v
    _ajoute([e]); return e


def importe(fichier):
    """export CSV de TikTok Studio : colonnes reconnues par leur nom ; une ligne par vidéo."""
    with open(fichier, encoding='utf-8-sig', newline='') as h: lignes = list(csv.DictReader(h))
    if not lignes: return {'lignes': 0}
    col = {k: next((c for c in lignes[0] if any(m in _sans(c) for m in mots)), None) for k, mots in CHAMPS.items()}
    num = lambda x: int(re.sub(r'[^\d]', '', str(x)) or 0)
    maintenant = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'); E = []
    for i, L in enumerate(lignes):
        e = {'video': (L.get(col['titre']) or f'ligne {i + 1}')[:80] if col['titre'] else f'ligne {i + 1}', 'source': 'export', 'releve': maintenant}
        e.update({k: num(L[col[k]]) for k in ('vues', 'jaime', 'commentaires', 'partages') if col[k]}); E.append(e)
    _ajoute(E); return {'lignes': len(E), 'colonnes': {k: v for k, v in col.items() if v}}


def _mecaniques(entree):
    """mécaniques des chutes de l'épisode publié : journal de publie_tiktok.py (nom de l'épisode) → histoire.json, cherché dans
    les dossiers d'épisodes (MASSAMBA_EPISODES, chemins séparés par « : »)."""
    ep = (entree or {}).get('episode')
    for base in filter(None, os.environ.get('MASSAMBA_EPISODES', '').split(':')):
        f = os.path.join(base, ep or '', 'histoire.json')
        if ep and os.path.isfile(f): return [s.get('mecanique') for s in json.load(open(f, encoding='utf-8')).get('sketchs', [])]
    return []


def rapport(H=None):
    """dernier relevé de chaque vidéo, taux, rang, et — dès 6 vidéos — comparaison des mécaniques de chute."""
    H = historique() if H is None else H; der = {}
    for e in H: der[e['video']] = {**der.get(e['video'], {}), **e}   # le relevé le plus récent complète les précédents
    jr = {e.get('video_id'): e for e in PT.journal() if e.get('video_id')}
    V = []
    for vid, e in der.items():
        v = max(1, int(e.get('vues', 0))); j, c, p = int(e.get('jaime', 0)), int(e.get('commentaires', 0)), int(e.get('partages', 0))
        x = {'video': vid, 'vues': e.get('vues', 0), 'jaime': j, 'commentaires': c, 'partages': p,
             'taux_commentaire_pct': round(100 * c / v, 2), 'taux_partage_pct': round(100 * p / v, 2), 'jaime_par_vue_pct': round(100 * j / v, 2),
             'engagement_pct': round(100 * (j + c + p) / v, 2), 'releve': e.get('releve')}
        j_ = jr.get(vid) or {}; pub = e.get('publiee') or (f"{j_['jour']}T{j_.get('heure', '12:00:00')}" if j_.get('jour') else None)
        if pub:
            try:
                t0 = datetime.datetime.fromisoformat(str(pub).replace('Z', '+00:00'))
                t0 = t0 if t0.tzinfo else t0.replace(tzinfo=datetime.timezone.utc)
                hres = max(0.1, (datetime.datetime.fromisoformat(e['releve']) - t0).total_seconds() / 3600)
                x['heures_en_ligne'] = round(hres, 1); x['vues_par_heure'] = round(e.get('vues', 0) / hres, 1)
            except (ValueError, TypeError, KeyError): pass
        x['mecaniques'] = _mecaniques(j_); x['episode'] = j_.get('episode')
        V.append(x)
    V.sort(key=lambda x: (x['taux_commentaire_pct'] + x['taux_partage_pct'], x['vues']), reverse=True)
    R = {'videos': V, 'mesurees': len(V)}
    if len(V) >= 6:   # assez de vidéos pour comparer les mécaniques
        par = {}
        for x in V:
            for m in set(x['mecaniques']): par.setdefault(m, []).append(x)
        R['mecaniques'] = {m: {'videos': len(xs), 'commentaire_pct': round(sum(x['taux_commentaire_pct'] for x in xs) / len(xs), 2),
                               'partage_pct': round(sum(x['taux_partage_pct'] for x in xs) / len(xs), 2)} for m, xs in par.items() if m}
    else:
        R['mecaniques'] = f'comparaison des mécaniques dès 6 vidéos mesurées ({len(V)} pour l’instant)'
    if os.path.isdir(PT.PRIVE) or V: PT._ecrit('viralite.json', R)
    return R


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a or a[0] == 'rapport': print(json.dumps(rapport(), ensure_ascii=False, indent=1))
    elif a[0] == 'releve': print(json.dumps(releve(), ensure_ascii=False, indent=1))
    elif a[0] == 'note': print(json.dumps(note(a[1], **dict(x.split('=', 1) for x in a[2:])), ensure_ascii=False, indent=1))
    elif a[0] == 'importe': print(json.dumps(importe(a[1]), ensure_ascii=False, indent=1))
    else: print(open(__file__, encoding='utf-8').read().split('import csv')[0])
