# SÉRIE DE 10 000 ÉPISODES (20/10/2026) — « reprends cette version [v14/v15], comme d'hab 3 sketchs […] implique toute la troupe
# dans le moteur (plus de 50 personnages) […] cette fois-ci règle tout pour mes 10 000 vidéos ».
# Une FILE D'ÉPISODES REPRENABLE (diskcache.Index, Apache-2.0, déjà installé : SQLite, écritures atomiques, survit à un arrêt
# du conteneur) fait avancer chaque épisode étape par étape ; un épisode interrompu repart de l'étape où il s'est arrêté :
#   distribue → 3 sketchs, 3 lieux de la bible, 2 ou 3 personnages chacun, toute la troupe en rotation équitable (le moins
#               employé d'abord, jamais deux fois le même duo dans le même lieu) ;
#   scenes    → une scène par sketch : décor de la bibliothèque mis à l'échelle du casting (380 px/m), figures posées par le
#               compositeur, visages LivePortrait repris du casting (casting_troupe.transfere) ; scène gardée en cache et
#               reprise par tout épisode qui rejoue ce duo dans ce décor ;
#   ecrit     → histoires.py (bible comique, juge, duel contre le champion de la série) avec CES personnages dans CE lieu ;
#   tourne    → usine.py tourne (moteur v14 : voix, bouches, rires, ambiance, visages, tournage, flou, montage, portes) ;
#   fini      → rapport (à publier / file de correction), fichier TikTok rangé, images intermédiaires effacées (les films restent).
#   python3 serie.py plan N         → N épisodes de plus dans la file
#   python3 serie.py marche [K]     → fait avancer K épisodes (tous si absent), reprend où chacun s'est arrêté
#   python3 serie.py etat           → épisodes par étape, emploi de la troupe, minutes par épisode, date de fin projetée
import json, os, random, shutil, sys, time, traceback
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import casting_troupe as CT

BIBLIO = CT.BIBLIO
TROUPE = os.path.realpath(os.path.expanduser(os.environ.get('MASSAMBA_TROUPE', os.path.join(ICI, '..', '..', 'workbench', '.private', 'troupe'))))
SERIE = os.path.join(BIBLIO, 'serie'); ETAPES = ('distribue', 'scenes', 'ecrit', 'tourne', 'fini')
PPM = CT.STUDIO['px_par_m']                    # échelle commune : celle où les visages du casting ont été dessinés
LARGEUR_MAX_M, HAUTEUR_M, SOL_HAUT = 4.2, 3.0, 0.92   # fenêtre du décor gardée (m), part de la hauteur au-dessus du sol
ECART_M = 0.8                                  # distance entre deux personnages voisins (cour-n1 : 0,79 m)


def file():
    import diskcache
    os.makedirs(SERIE, exist_ok=True)
    return diskcache.Index(os.path.join(SERIE, 'file'))


# ── DÉCORS À L'ÉCHELLE DU CASTING ─────────────────────────────────────────────────────────────────────────────────────────
def decors():
    """décors de la bibliothèque (manifest : fichier HD, « fit » = hauteur en mètres mH, ligne de sol, centre)."""
    return json.load(open(os.path.join(TROUPE, 'manifest.json'), encoding='utf-8'))['decors']


def decors_du_lieu(lieu):
    return [x for x in decors() if x['name'] == lieu or x['name'].startswith(lieu + ' —')]


def decor_casting(x):
    """décor mis à PPM px/m (Swin2SR ×4 du compositeur s'il faut agrandir de plus de 15 %, sinon réduction INTER_AREA), fenêtre
    de LARGEUR_MAX_M × HAUTEUR_M m autour de son centre, sol à SOL_HAUT de la hauteur (sol peint sous le cadre : pieds posés à
    97 % de la hauteur). En cache : decors-casting/<nom>.png + .json. → (chemin, px_par_m, sol_y)"""
    nom = CT.slug_de(x['name']); out = os.path.join(BIBLIO, 'decors-casting', nom)
    if os.path.isfile(out + '.json'): J = json.load(open(out + '.json')); return out + '.png', J['px_par_m'], J['sol_y']
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im = cv2.cvtColor(cv2.imread(os.path.join(TROUPE, x.get('hd') or x['file'])), cv2.COLOR_BGR2RGB); H, W = im.shape[:2]
    ppm = H / x['fit']['mH']; k = PPM / ppm; sol = min(float(x['fit']['floor']), 0.97) * H
    if k > 1.15:
        import compositeur
        im = compositeur.agrandit(im).astype(np.uint8)
        im = cv2.resize(im, (int(round(W * k)), int(round(H * k))), interpolation=cv2.INTER_AREA if 4 > k else cv2.INTER_CUBIC)
    else:
        im = cv2.resize(im, (int(round(W * k)), int(round(H * k))), interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_CUBIC)
    sol *= k; H, W = im.shape[:2]
    hz = int(HAUTEUR_M * PPM); y1 = int(min(H, sol + (1 - SOL_HAUT) * hz)); y0 = max(0, y1 - hz)
    wz = int(LARGEUR_MAX_M * PPM); cx = float(x['fit'].get('cx', 0.5)) * W; x0 = int(np.clip(cx - wz / 2, 0, max(0, W - wz))); x1 = min(W, x0 + wz)
    im = im[y0:y1, x0:x1]; sol -= y0
    cv2.imwrite(out + '.png', cv2.cvtColor(im, cv2.COLOR_RGB2BGR))
    J = {'decor': x['name'], 'source': x.get('hd') or x['file'], 'px_par_m': PPM, 'sol_y': round(sol, 1), 'echelle': round(k, 3),
         'fenetre': [x0, y0, x1, y1], 'taille': [im.shape[1], im.shape[0]]}
    json.dump(J, open(out + '.json', 'w'), ensure_ascii=False, indent=1)
    return out + '.png', PPM, J['sol_y']


# ── DISTRIBUTION ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def jouables():
    """personnages jouables : figure ET visages au casting ; avec leurs lieux (bible)."""
    return {r['nom']: r['lieux'] for r in CT.etat() if r['figure'] and r['visages']}


def plan(n, graine=None, journal=print):
    F = file(); J = jouables(); B = CT.bible(); rnd = random.Random(graine if graine is not None else len(F))
    if len(J) < 2: raise RuntimeError(f'{len(J)} personnage(s) jouable(s) : bibliothèques de visages à dessiner (casting_troupe.py visages)')
    emploi = {n_: 0 for n_ in J}; duos = set()
    for e in F.values():
        for s in e['sketchs']:
            for a in s['acteurs']: emploi[a] = emploi.get(a, 0) + 1
            duos.add((s['lieu'], tuple(sorted(s['acteurs']))))
    lieux = sorted({l for ls in J.values() for l in ls if decors_du_lieu(l)})
    neufs = []
    for _ in range(n):
        sk, pris = [], set()
        for lieu in sorted(lieux, key=lambda l: (sum(emploi[a] for a in J if l in J[a]) / max(1, sum(1 for a in J if l in J[a])), rnd.random())):
            cands = sorted([a for a in J if lieu in J[a] and a not in pris], key=lambda a: (emploi[a], rnd.random()))
            if len(cands) < 2: continue
            k = 3 if len(cands) >= 3 and rnd.random() < 0.25 else 2; acteurs = None
            for i in range(len(cands) - 1):
                for j in range(i + 1, len(cands)):
                    t = [cands[i], cands[j]] + ([c for c in cands if c not in (cands[i], cands[j])][:1] if k == 3 else [])
                    if (lieu, tuple(sorted(t))) not in duos: acteurs = t; break
                if acteurs: break
            if not acteurs: continue
            dec = rnd.choice(decors_du_lieu(lieu))
            sk.append({'lieu': lieu, 'decor': dec['name'], 'acteurs': acteurs}); duos.add((lieu, tuple(sorted(acteurs))))
            for a in acteurs: emploi[a] += 1; pris.add(a)
            if len(sk) == 3: break
        if len(sk) < 3: journal('distribution épuisée : plus de duos neufs avec les personnages jouables'); break
        i = f'S{len(F) + 1:05d}'
        F[i] = {'id': i, 'etape': 'scenes', 'sketchs': sk, 'durees_s': {}, 'erreurs': [], 'cree': time.strftime('%Y-%m-%d %H:%M')}
        neufs.append(i)
    journal(f"{len(neufs)} épisode(s) ajoutés ({len(F)} dans la file) — {len(J)} personnages jouables, {len(lieux)} lieux")
    return neufs


# ── ÉTAPES ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def nom_scene(s): return CT.slug_de(s['decor']) + '--' + '--'.join(CT.slug_de(a) for a in s['acteurs'])


def scenes(e, journal=print):
    import scene_nouvelle
    dec = {x['name']: x for x in decors()}
    for s in e['sketchs']:
        s['scene'] = nom_scene(s); d = os.path.join(BIBLIO, 'prep', s['scene'])
        if os.path.isfile(f'{d}/scene.json') and os.path.isdir(f'{d}/rig'): continue   # duo déjà posé dans ce décor
        plaque, ppm, sol = decor_casting(dec[s['decor']]); W = cv2.imread(plaque).shape[1]
        n = len(s['acteurs']); xs = [0.5 + (i - (n - 1) / 2) * ECART_M * ppm / W for i in range(n)]
        act = [(a, CT.lit_figure(f'{CT.dossier(a)}/figure.png'), float(CT.fiche(a)['taille_m']), x) for a, x in zip(s['acteurs'], xs)]
        scene_nouvelle.prepare(BIBLIO, s['scene'], plaque, ppm, sol, act, journal=journal)
        manque = [a['nom'] for a in json.load(open(f'{d}/scene.json'))['acteurs'] if not os.path.isfile(f"{d}/expressions/{a['slug']}/meta.json")]
        if manque: raise RuntimeError(f'visages absents du casting : {manque}')


def ecrit(e, journal=print):
    import histoires, usine
    d = os.path.join(SERIE, e['id']); reg = os.path.join(SERIE, 'histoires'); os.makedirs(reg, exist_ok=True); os.makedirs(d, exist_ok=True)
    ids = []
    for s in e['sketchs']:
        histoires.LIEUX[s['scene']] = {'nom': f"{s['decor']} ({s['lieu'].lower()})", 'acteurs': list(s['acteurs'])}
        i = s.get('histoire') or histoires.une(reg, s['scene'], journal=journal)
        if not i:   # aucun brouillon ne bat le champion de la série : le meilleur brouillon propre de ce duo est pris
            os.makedirs(os.path.join(d, 'brouillons', s['scene']), exist_ok=True)
            i = histoires.une(os.path.join(d, 'brouillons', s['scene']), s['scene'], journal=journal)
            if i: shutil.copy(os.path.join(d, 'brouillons', s['scene'], f'{i}.json'), os.path.join(reg, f'{i}.json'))
        if not i: raise RuntimeError(f"aucune histoire écrite pour {s['scene']}")
        s['histoire'] = i; ids.append(i)
    histoires.episode(reg, os.path.join(d, 'histoire.json'), ids)
    os.environ['MASSAMBA_BIBLIO'] = BIBLIO; usine.BIBLIO = BIBLIO
    try: usine.episode(d)
    except RuntimeError:   # ton.py refuse : ces histoires ne sont pas reprises au prochain essai
        for s in e['sketchs']: s.pop('histoire', None)
        raise


def tourne(e, journal=print):
    import usine
    d = os.path.join(SERIE, e['id'])
    os.environ.setdefault('USINE_PORTES_FOND', '0')   # les portes dans la foulée : le rapport décide « à publier » ou « à corriger »
    usine.tourne(d, 'v1')


def fini(e, journal=print):
    d = os.path.join(SERIE, e['id']); D = os.path.join(d, 'v1'); rap = json.load(open(f'{D}/rapport.json'))
    e['a_publier'] = bool(rap.get('a_publier')); e['portes'] = rap.get('portes'); e['echecs'] = rap.get('echecs')
    sortie = os.path.join(BIBLIO, 'A PUBLIER', 'serie' if e['a_publier'] else 'serie-a-corriger'); os.makedirs(sortie, exist_ok=True)
    for f, g in (('tiktok-1080x1920.mp4', f"{e['id']}.mp4"), ('legende.txt', f"{e['id']}-legende.txt")):
        if os.path.isfile(f'{D}/{f}'): shutil.copy(f'{D}/{f}', os.path.join(sortie, g))
    # RÉTENTION (règle « aucune vidéo supprimée ») : seules les images intermédiaires partent ; film, TikTok et rapport restent
    for x in ('clip', 'clip-net', 'compose', 'source'):
        shutil.rmtree(os.path.join(D, x), ignore_errors=True)


FAIRE = {'scenes': scenes, 'ecrit': ecrit, 'tourne': tourne, 'fini': fini}


def avance(i, journal=print):
    F = file(); e = F[i]
    while e['etape'] in FAIRE:
        et = e['etape']; t0 = time.time(); journal(f"{i} : {et}…")
        try: FAIRE[et](e, journal)
        except Exception as ex:
            e['erreurs'].append({'etape': et, 'date': time.strftime('%Y-%m-%d %H:%M'), 'erreur': str(ex)[:400],
                                 'trace': traceback.format_exc()[-1500:]}); F[i] = e
            journal(f'{i} : {et} a échoué — {str(ex)[:200]}'); return False
        e['durees_s'][et] = round(time.time() - t0, 1); e['etape'] = ETAPES[ETAPES.index(et) + 1] if et != 'fini' else 'termine'
        F[i] = e   # sauvé après chaque étape : un arrêt reprend ici
    return True


_RELEVE = [0.0]
def releve_viralite(journal=print, toutes_les_s=3600):
    """VIRALITÉ EN MARCHANT (20/10/2026, « mesure la viralité de la vidéo sur TikTok après ») : au plus une fois par heure, entre
    deux épisodes, les chiffres des vidéos publiées sont relevés (API Display, lecture seule, si le compte est connecté) et le
    rapport refait (viralite.py) ; sans connexion, rien n'est tenté."""
    if time.time() - _RELEVE[0] < toutes_les_s: return None
    _RELEVE[0] = time.time()
    try:
        import viralite
        r = viralite.releve()
        if 'videos' in r: viralite.rapport(); journal(f"viralité : {r.get('releves', 0)} vidéos relevées")
        return r
    except Exception as ex:   # la mesure ne bloque jamais la production
        journal(f'viralité : relevé impossible ({str(ex)[:120]})'); return None


def marche(k=None, journal=print):
    F = file(); n = 0
    for i in sorted(F.keys()):
        e = F[i]
        if e['etape'] == 'termine' or len(e['erreurs']) >= 3: continue
        releve_viralite(journal)
        avance(i, journal); n += 1
        if k and n >= k: break


def etat():
    F = file(); par = {}; tps = []; J = CT.etat(); emploi = {}
    for e in F.values():
        par[e['etape']] = par.get(e['etape'], 0) + 1
        for s in e['sketchs']:
            for a in s['acteurs']: emploi[a] = emploi.get(a, 0) + 1
        if e['etape'] == 'termine': tps.append(sum(e['durees_s'].values()))
    m = float(np.median(tps)) / 60 if tps else None
    return {'episodes': len(F), 'par_etape': par, 'termines': len(tps), 'minutes_par_episode_mediane': round(m, 1) if m else None,
            'jours_pour_10000_sur_cette_machine': round(10000 * m / 60 / 24, 1) if m else None,
            'personnages_jouables': sum(1 for r in J if r['figure'] and r['visages']), 'personnages_employes': len(emploi),
            'emploi': dict(sorted(emploi.items(), key=lambda kv: -kv[1]))}


if __name__ == '__main__':
    c = sys.argv[1] if len(sys.argv) > 1 else 'etat'
    if c == 'plan': plan(int(sys.argv[2]))
    elif c == 'marche': marche(int(sys.argv[2]) if len(sys.argv) > 2 else None)
    elif c == 'avance': avance(sys.argv[2])
    else: print(json.dumps(etat(), ensure_ascii=False, indent=1))
