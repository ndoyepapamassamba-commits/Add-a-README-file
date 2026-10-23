# MOTEUR V1 DANS AI MOTION STUDIO (22/10/2026) — « y intégrer le moteur de la V1 » ; « le moteur local doit être aussi sinon
# plus performant que la V1 … on va tout faire en local ».
# Pont entre le serveur local de l'application (serveur.mjs) et le moteur MASSAMBA de la troupe (studio-video/moteur-troupe) :
# le même code que la fabrique, donc la même qualité que la V1 (grille de ton.py appliquée par usine.episode, voix Piper,
# bouches synchronisées, rires, ambiance, visages LivePortrait, montage TikTok). Tout tourne sur cette machine.
#   python3 moteur_v1.py catalogue                     → scènes prêtes (duos) et sketchs de la réserve, en JSON
#   python3 moteur_v1.py controle  <demande.json>      → verdict de la grille de ton sans tourner
#   python3 moteur_v1.py tourne    <demande.json> <dossier>  → tourne, écrit <dossier>/resultat.json (chemin du MP4, durées)
#   python3 moteur_v1.py prechauffe                    → essai des visages de toutes les scènes prêtes (mémorisé), au démarrage
# Variables : MASSAMBA_BIBLIO (bibliothèque : prep/, stock/sketchs.json), PIPER_VOICES, MOTEUR_V1_DIR (code du moteur).
import json, os, re, subprocess, sys, time

# VITESSE (23/10/2026, « le tournage a pris 56 minutes pour ce seul sketch […] objectif : moins de 3 minutes par sketch ») :
# les réglages de la fabrique GitHub (.github/workflows/fabrique.yml l. 133-134) deviennent ceux de l'application. Sans
# OMP_NUM_THREADS, chaque processus de rendu ouvrait un fil par cœur (33 fils relevés pour 4 processus sur 4 cœurs) ; le même
# sketch est passé de 3 641 s (machine partagée, fils non bornés) à 306 s (machine libre, un fil par processus).
for _k in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'): os.environ.setdefault(_k, '1')
os.environ.setdefault('TOURNE_PROCS', str(os.cpu_count() or 4))

ICI = os.path.dirname(os.path.abspath(__file__))
MOTEUR = os.path.abspath(os.environ.get('MOTEUR_V1_DIR') or os.path.join(ICI, '..', '..', 'moteur-troupe'))
sys.path.insert(0, MOTEUR)


def _sv():
    import serie_v1 as SV
    return SV


def catalogue():
    SV = _sv(); pretes = SV.scenes_pretes(); R = SV.reserve() if os.path.isfile(os.path.join(SV.BIBLIO, 'stock', 'sketchs.json')) else []
    sk = [{'id': s['id'], 'titre': s.get('titre'), 'image': s['image'], 'acteurs': s.get('acteurs', []), 'mecanique': s.get('mecanique'),
           'repliques': [{'qui': r['qui'], 'texte': r['texte'], 'chute': bool(r.get('chute'))} for r in s.get('repliques', [])]}
          for s in R if s.get('image') in pretes]
    return {'bibliotheque': SV.BIBLIO, 'scenes': [{'nom': n, 'acteurs': a} for n, a in pretes.items()], 'sketchs': sk}


def _complete(s, pretes, reserve):
    """sketch de la réserve (par id) ou sketch écrit dans l'application, complété des champs que le moteur attend."""
    if isinstance(s, str) or (isinstance(s, dict) and set(s) <= {'id'}):
        sid = s if isinstance(s, str) else s['id']
        for r in reserve:
            if r['id'] == sid: return r
        raise ValueError(f'sketch inconnu dans la réserve : {sid}')
    img = s.get('image'); ac = pretes.get(img)
    if not ac: raise ValueError(f'scène non préparée : {img!r} (scènes prêtes : {", ".join(sorted(pretes))})')
    reps = [r for r in s.get('repliques', []) if str(r.get('texte', '')).strip()]
    if len(reps) < 2: raise ValueError('il faut au moins deux répliques')
    for r in reps:
        if r.get('qui') not in ac: raise ValueError(f"personnage {r.get('qui')!r} absent de la scène {img} ({', '.join(ac)})")
        r.setdefault('jeu', 'neutre'); r.setdefault('a', next(x for x in ac if x != r['qui']) if len(ac) > 1 else r['qui'])
    if not any(r.get('chute') for r in reps): reps[-1]['chute'] = True
    autre = next((x for x in ac if x != reps[-1]['qui']), ac[0])
    sid = s.get('id') or ('app-' + re.sub(r'[^a-z0-9]+', '-', (s.get('titre') or 'sketch').lower()).strip('-')[:40] + '-' + str(int(time.time())))
    return {'id': sid, 'titre': (s.get('titre') or 'SKETCH').upper(), 'lieu': s.get('lieu') or img.replace('-', ' '), 'image': img, 'acteurs': ac,
            'mecanique': s.get('mecanique') or 'pince-sans-rire', 'ressort': s.get('ressort') or {'qui': reps[-1]['qui'], 'trait': ''},
            'mise_en_scene': s.get('mise_en_scene') or f"{s.get('lieu') or img} ; {autre} figé après la chute", 'objets': s.get('objets') or [],
            'repliques': reps, 'reaction': s.get('reaction') or {'qui': autre, 'jeu': 'choc', 'duree_s': 3.0, 'plan': 'gros plan fixe', 'note': f'{autre} figé'},
            'source': 'écrit dans AI Motion Studio'}


def _histoire(d, i, sks):
    SV = _sv(); os.makedirs(d, exist_ok=True)
    H = {'titre': f'AI Motion Studio — {i}', 'univers': 'Africa Toon Troll', 'duree_cible_s': 22 * len(sks), 'reference': 'TON.md ; format de la V1 (ep01 v17)',
         'ecriture': 'AI Motion Studio (sketchs choisis ou écrits par l’utilisateur)', 'sketchs': [{k: v for k, v in s.items() if k not in ('source', 'ecrit_le')} for s in sks],
         'mots_chute': [m for s in sks for m in SV.mots_chute(s)]}
    json.dump(H, open(os.path.join(d, 'histoire.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return H


def _sketchs(demande):
    SV = _sv(); pretes = SV.scenes_pretes()
    reserve = SV.reserve() if os.path.isfile(os.path.join(SV.BIBLIO, 'stock', 'sketchs.json')) else []
    sks = [_complete(s, pretes, reserve) for s in demande.get('sketchs', [])]
    if not sks: raise ValueError('aucun sketch demandé')
    return sks


def controle(demande):
    """grille de ton (fabrique/ton.py) sur les sketchs demandés, sans tourner."""
    import tempfile
    sks = _sketchs(demande)
    with tempfile.TemporaryDirectory() as t:
        _histoire(t, 'controle', sks)
        r = subprocess.run([sys.executable, os.path.join(MOTEUR, 'fabrique', 'ton.py'), os.path.join(t, 'histoire.json')], capture_output=True, text=True)
    return {'ok': r.returncode == 0, 'rapport': (r.stdout or '')[-2500:], 'sketchs': [s['id'] for s in sks]}


def tourne(demande, d):
    SV = _sv(); import usine
    sks = _sketchs(demande); i = demande.get('id') or ('APP-' + time.strftime('%Y%m%d-%H%M%S'))
    d = os.path.abspath(d); _histoire(d, i, sks); t0 = time.time()
    os.environ.setdefault('USINE_PORTES_FOND', '1')        # les 17 portes en arrière-plan : la vidéo est rendue dès qu'elle est prête
    os.environ.setdefault('PIPER_VOICES', os.path.join(os.path.expanduser('~'), '.cache', 'massamba-models', 'piper') + '/')
    r = usine.tourne(d, 'v1')
    D = os.path.join(d, 'v1'); tk = os.path.join(D, 'tiktok-1080x1920.mp4'); film = os.path.join(D, 'film.mp4')
    video = tk if os.path.isfile(tk) else film
    if not os.path.isfile(video): raise RuntimeError('le moteur n’a pas produit de vidéo')
    res = {'video': video, 'film': film if os.path.isfile(film) else None, 'secondes': round(time.time() - t0), 'etapes_s': r.get('durees_s') if isinstance(r, dict) else None,
           'sketchs': [{'id': s['id'], 'titre': s['titre'], 'scene': s['image'], 'acteurs': s['acteurs'],
                        'repliques': [{'qui': x['qui'], 'texte': x['texte']} for x in s['repliques']]} for s in sks],
           'portes': (r or {}).get('portes') if isinstance(r, dict) else None, 'rapport_portes': os.path.join(D, 'rapport.json'),
           'legende': open(os.path.join(D, 'legende.txt'), encoding='utf-8').read() if os.path.isfile(os.path.join(D, 'legende.txt')) else None}
    json.dump(res, open(os.path.join(d, 'resultat.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return res


def _decor_pret(SV, scene):
    """caches de préparation d'un décor écrits par tourne.py au premier sketch : décor vivant (vie.npz), linge (linge.npz),
    profondeur et squelettes (rig/)."""
    p = os.path.join(SV.BIBLIO, 'prep', scene)
    return all(os.path.exists(os.path.join(p, f)) for f in ('vie.npz', 'linge.npz', 'profondeur.png', 'rig'))


def prechauffe():
    """PRÉCHAUFFAGE (23/10/2026) : tout ce qui se calcule une fois par décor est fait au démarrage du serveur, pas pendant un
    sketch. (1) l'essai des visages de chaque scène prête (fume_visages.py : 33,8 s au premier sketch d'une scène, mémorisé
    ensuite) ; (2) la préparation du décor (décor vivant étiqueté par le juge visuel local, linge, profondeur, squelettes) :
    py-spy l'a trouvée dans tourne.py au premier sketch du marché, juge Idefics3 sur UN cœur (OMP_NUM_THREADS=1, réglage du
    rendu parallèle) — ici un seul processus, donc tous les cœurs, et un tournage « sans rendu » d'un sketch de la réserve."""
    SV = _sv(); import usine; pretes = SV.scenes_pretes(); t0 = time.time()
    import tempfile
    with tempfile.TemporaryDirectory() as t:
        r = subprocess.run([sys.executable, os.path.join(MOTEUR, 'fume_visages.py'), os.path.join(SV.BIBLIO, 'prep'), os.path.join(t, 'visages.jpg'), ','.join(sorted(pretes))],
                           capture_output=True, text=True, cwd=t)
    lignes = (r.stdout or '').strip().splitlines()
    res = {'ok': r.returncode == 0, 'scenes': sorted(pretes), 'deja_verifies': sum('déjà vérifié' in l for l in lignes), 'verifies': sum(l.endswith(' ok') for l in lignes),
           'fin': lignes[-1] if lignes else '', 'decors': {}}
    reserve = SV.reserve() if os.path.isfile(os.path.join(SV.BIBLIO, 'stock', 'sketchs.json')) else []
    tous = {k: str(os.cpu_count() or 4) for k in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS')}
    for sc in sorted(pretes):
        if _decor_pret(SV, sc): res['decors'][sc] = 'déjà prêt'; continue
        sk = next((x for x in reserve if x.get('image') == sc), None)
        if not sk: res['decors'][sc] = 'aucun sketch de la réserve pour le préparer'; continue
        t1 = time.time()
        try:
            with tempfile.TemporaryDirectory(dir=os.environ.get('PRECHAUFFE_DIR') or None) as d:
                _histoire(d, 'prechauffe-' + sc, [sk]); usine.episode(d)
                env = dict(PIPER_VOICES=os.environ.get('PIPER_VOICES', ''), **tous)
                for a in ([os.path.join(MOTEUR, 'voix.py')], [os.path.join(MOTEUR, 'levres.py'), 'timeline.json']):
                    usine._py(*a, env=env, cwd=d)
                usine._py(os.path.join(MOTEUR, 'tourne.py'), 'montage.json', os.path.join(d, 'v1'), env=dict(env, ETIREMENT='1', TOURNE_SANS_RENDU='1', TOURNE_PROCS='1'), cwd=d)
            res['decors'][sc] = f'préparé en {round(time.time() - t1)} s' if _decor_pret(SV, sc) else 'préparation incomplète'
        except Exception as e:
            res['decors'][sc] = 'échec : ' + str(e)[:200]
    res['secondes'] = round(time.time() - t0, 1)
    return res

if __name__ == '__main__':
    a = sys.argv[1:] or ['catalogue']
    try:
        if a[0] == 'catalogue': print(json.dumps(catalogue(), ensure_ascii=False))
        elif a[0] == 'prechauffe': print(json.dumps(prechauffe(), ensure_ascii=False))
        elif a[0] == 'controle': print(json.dumps(controle(json.load(open(a[1], encoding='utf-8'))), ensure_ascii=False))
        elif a[0] == 'tourne': print(json.dumps(tourne(json.load(open(a[1], encoding='utf-8')), a[2]), ensure_ascii=False))
        else: raise SystemExit('commande inconnue : ' + a[0])
    except (ValueError, RuntimeError) as e:
        print(json.dumps({'erreur': str(e)}, ensure_ascii=False)); sys.exit(2)
