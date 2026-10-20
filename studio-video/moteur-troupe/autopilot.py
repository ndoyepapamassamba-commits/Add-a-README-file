# AUTOPILOTE DE LA FABRIQUE (20/10/2026) — « Je veux une application de fabrique avec autopilot qui génère la vidéo de bout en
# bout, les 10000 vidéos. Je veux être indépendant pour ça. » ; « TikTok mise sur la constance pour te propulser ».
# CONSTANCE D'ABORD : chaque jour, CADENCE vidéos sont livrées à la page « Fabrique » (une par créneau de publication), et la
# fabrique garde une RÉSERVE de RESERVE_JOURS jours de vidéos prêtes : un jour de production raté ne laisse aucun créneau vide.
# Une journée, sans personne (tâche planifiée quotidienne) :
#   1. réserve : combien de vidéos « à publier » attendent déjà leur créneau ; objectif = CADENCE × (1 + RESERVE_JOURS) ;
#   2. distribution : épisodes ajoutés à la file (serie.plan, duos neufs d'abord) ; s'il n'y a plus de duo neuf, CASTING
#      D'AVANCE (bibliothèques de visages des personnages suivants de la rotation, par paires qui partagent un lieu), puis, une
#      fois la troupe entière au casting, duos récurrents avec histoires neuves (serie.plan reprises=True) ;
#   3. production : serie.marche (scènes → écriture → tournage → juge 9 portes → rangement), file reprenable ;
#   4. livraison : chaque épisode « à publier » reçoit sa VERSION TÉLÉPHONE (H.264 deux passes, ≤ CIBLE_MO Mo pour la page :
#      mesuré sur la V17, 75 s : 50,6 Mo → 13,97 Mo, SSIM 0,989 contre l'original), une affiche et sa fiche (livraison/<id>.json)
#      dans la file d'envoi ; la tâche planifiée verse ensuite fichier et fiche dans la page et marque l'envoi (envoye) ;
#   5. doublons (« possibilité en cas de doublon ou bien de cocher déjà publié ») : empreinte perceptuelle de chaque vidéo
#      (doublons.py, ImageHash BSD-2) comparée à toutes les vidéos déjà livrées ; au-delà du seuil mesuré, statut « doublon » :
#      la vidéo reste dans la page (rien n'est supprimé) mais sort de la réserve et des créneaux. Statuts : pret, publiee,
#      doublon, a_corriger. Téléchargement ≤ 15 Mo (consigne du 20/10/2026, « max 15 Mo »).
#   python3 autopilot.py jour [N]       → journée complète (N vidéos par jour, défaut CADENCE)
#   python3 autopilot.py livre ID [DOSSIER] → version téléphone + fiche d'un épisode terminé (DOSSIER : version hors série)
#   python3 autopilot.py a_envoyer      → fiches pas encore versées dans la page (JSON)
#   python3 autopilot.py envoye ID URL  → marque une fiche versée (URL de la vidéo dans la page)
#   python3 autopilot.py etat           → réserve, file, casting, cadence tenue (JSON)
import datetime, json, os, re, subprocess, sys, time

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import casting_troupe as CT, serie, doublons

CADENCE = int(os.environ.get('FABRIQUE_CADENCE') or 0) or None     # vidéos par jour : config.json (1 à 6), sauf variable FABRIQUE_CADENCE
RESERVE_JOURS = float(os.environ.get('FABRIQUE_RESERVE_JOURS', '1'))  # jours de vidéos prêtes gardés d'avance
CIBLE_MO = float(os.environ.get('FABRIQUE_CIBLE_MO', '14'))        # consigne « max 15 Mo » ; 14 visé (marge du débit variable)
PLAFOND_MO = 15.0
CASTING_PAR_JOUR = int(os.environ.get('FABRIQUE_CASTING', '2'))    # bibliothèques de visages faites d'avance chaque jour
LIV = os.path.join(CT.BIBLIO, 'livraison')


def _maintenant(): return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')


def fiches():
    os.makedirs(LIV, exist_ok=True)
    return [json.load(open(os.path.join(LIV, f), encoding='utf-8')) for f in sorted(os.listdir(LIV)) if f.endswith('.json') and not f.endswith('.emp.json')]


# CRÉNEAUX (fabrique indépendante, 20/10/2026) : chaque vidéo « à publier » reçoit à la livraison le prochain créneau libre
# (cadence et heures de config.json) ; la réserve = vidéos dont le créneau n'est pas encore passé. Ainsi la fabrique tient sa
# cadence sans savoir ce que l'utilisateur coche sur son téléphone (l'application GitHub garde ses coches chez lui).
CONFIG = os.path.join(ICI, '..', 'fabrique', 'config.json')


def config():
    C = {'cadence': 6, 'creneaux': ['08:00', '11:00', '13:30', '17:00', '19:30', '22:00'], 'fuseau': 'Africa/Abidjan'}
    if os.path.isfile(CONFIG): C.update(json.load(open(CONFIG, encoding='utf-8')))
    if CADENCE: C['cadence'] = CADENCE
    return C


def prochain_creneau(pris, maintenant=None):
    """premier créneau (date + heure de config) postérieur à maintenant et non pris ; heures en UTC (Abidjan = UTC)."""
    C = config(); h = sorted(C['creneaux'])[:max(1, int(C['cadence']))]
    t = maintenant or datetime.datetime.now(datetime.timezone.utc); j = t.date()
    for _ in range(4000):
        for x in h:
            c = datetime.datetime.combine(j, datetime.time(*map(int, x.split(':'))), datetime.timezone.utc)
            if c > t and c.isoformat(timespec='minutes') not in pris: return c.isoformat(timespec='minutes')
        j += datetime.timedelta(days=1)


def reserve():
    """vidéos « à publier » encore à venir : pas marquées publiées, et (fabrique GitHub) créneau pas encore passé."""
    t = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='minutes')
    return [f for f in fiches() if f.get('statut', 'pret' if f.get('a_publier') else 'a_corriger') == 'pret' and not f.get('publiee')
            and (not f.get('creneau') or f['creneau'] > t)]


def version_tel(src, dst, cible_mo=CIBLE_MO):
    """deux passes x264 « slow » au débit qui tient dans cible_mo (son AAC 128 k) ; → {taille_mo, ssim, secondes}."""
    t0 = time.time(); dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]))
    kv = max(600, int(cible_mo * 8 * 1000 * 0.96 / dur) - 128); log = dst + '.passe'
    commun = ['-c:v', 'libx264', '-preset', 'slow', '-b:v', f'{kv}k', '-passlogfile', log]
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, *commun, '-pass', '1', '-an', '-f', 'mp4', os.devnull], check=True)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, *commun, '-maxrate', f'{2 * kv}k', '-bufsize', f'{3 * kv}k', '-pass', '2',
                    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k', dst], check=True)
    for f in os.listdir(os.path.dirname(dst)):
        if f.startswith(os.path.basename(log)): os.remove(os.path.join(os.path.dirname(dst), f))
    r = subprocess.run(['ffmpeg', '-i', dst, '-i', src, '-lavfi', '[0:v][1:v]ssim', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'All:([0-9.]+)', r.stderr)
    return {'taille_mo': round(os.path.getsize(dst) / 1e6, 2), 'ssim': float(m.group(1)) if m else None, 'secondes': round(time.time() - t0)}


def livre(i, D=None, journal=print):
    """fiche + version téléphone + affiche d'un épisode terminé (série : SERIE/<id>/v1 ; sinon le dossier de version donné)."""
    D = D or os.path.join(serie.SERIE, i, 'v1'); os.makedirs(LIV, exist_ok=True)
    src = os.path.join(D, 'tiktok-1080x1920.mp4'); rap = json.load(open(os.path.join(D, 'rapport.json'))) if os.path.isfile(os.path.join(D, 'rapport.json')) else {}
    leg = open(os.path.join(D, 'legende.txt'), encoding='utf-8').read().strip() if os.path.isfile(os.path.join(D, 'legende.txt')) else ''
    tel = os.path.join(LIV, f'{i}.mp4'); aff = os.path.join(LIV, f'{i}.jpg')
    mesure = version_tel(src, tel)
    if mesure['taille_mo'] > PLAFOND_MO:   # débit variable au-dessus de la cible : second essai, 12 % plus bas
        mesure = version_tel(src, tel, CIBLE_MO * 0.88)
    if mesure['taille_mo'] > PLAFOND_MO: raise RuntimeError(f"{i} : version téléphone {mesure['taille_mo']} Mo > {PLAFOND_MO} Mo")
    emp = doublons.empreinte(tel); json.dump(emp, open(os.path.join(LIV, f'{i}.emp.json'), 'w'))
    autres = {f['id']: json.load(open(os.path.join(LIV, f"{f['id']}.emp.json"))) for f in fiches()
              if f['id'] != i and os.path.isfile(os.path.join(LIV, f"{f['id']}.emp.json"))}
    proche, r = doublons.cherche(emp, autres)
    # affiche : l'image du titre (2 s), 540 × 960
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', '2', '-i', src, '-frames:v', '1', '-vf', 'scale=540:960', '-q:v', '4', aff], check=True)
    e = (serie.file().get(i) or {}) if i.startswith('S') else {}
    F = {'id': i, 'titre': leg.split('\n')[0] if leg else i, 'legende': leg, 'a_publier': bool(rap.get('a_publier', True)),
         'portes': rap.get('portes'), 'echecs': rap.get('echecs'), 'sketchs': e.get('sketchs'), 'video': tel, 'affiche': aff,
         'duree_s': round(float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tel])), 1),
         'version_tel': mesure, 'livree': _maintenant(), 'envoyee': None, 'publiee': None,
         'doublon_de': proche if r >= doublons.SEUIL_PROCHE else None, 'ressemblance': r}
    F['statut'] = 'doublon' if r >= doublons.SEUIL_DOUBLON else ('pret' if F['a_publier'] else 'a_corriger')
    if F['statut'] == 'pret': F['creneau'] = prochain_creneau({f.get('creneau') for f in fiches() if f.get('creneau')})
    json.dump(F, open(os.path.join(LIV, f'{i}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    journal(f"{i} : version téléphone {mesure['taille_mo']} Mo, SSIM {mesure['ssim']} ({mesure['secondes']} s) — {F['statut']}"
            + (f" (ressemble à {proche} : {r:.2f})" if F['doublon_de'] else ''))
    return F


def a_envoyer():
    return [f for f in fiches() if not f.get('envoyee')]


def _maj(i, **champs):
    p = os.path.join(LIV, f'{i}.json'); F = json.load(open(p, encoding='utf-8')); F.update(champs)
    json.dump(F, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); return F


def envoye(i, url): return _maj(i, envoyee=_maintenant(), url=url)
def marque_publiee(i, quand=None): return _maj(i, publiee=quand or _maintenant(), statut='publiee')
def marque(i, statut): return _maj(i, statut=statut, publiee=None if statut != 'publiee' else _maintenant())


def prochains_castings(k):
    """personnages à mettre au casting d'avance : figure prête, visages absents, par paires qui partagent un lieu meublé (un duo
    neuf jouable dès que la paire est faite)."""
    R = {r['nom']: r for r in CT.etat()}; J = serie.jouables()
    cand = [n for n, r in R.items() if r['figure'] and not r['visages']]
    lieux = {l for r in R.values() for l in r['lieux'] if serie.decors_du_lieu(l)}
    choix = []
    for l in sorted(lieux, key=lambda l: sum(1 for a in J if l in J[a])):   # lieux les moins garnis d'abord
        ici = [n for n in cand if l in R[n]['lieux'] and n not in choix]
        besoin = max(0, 2 - sum(1 for a in J if l in J[a]))
        choix += ici[:max(besoin, 2 if besoin else 0)]
        if len(choix) >= k: break
    return choix[:k]


def jour(n=None, journal=print):
    n = int(n or os.environ.get('FABRIQUE_CADENCE') or config()['cadence'])   # 1 à 6 vidéos par jour (config.json)
    t0 = time.time(); F = serie.file()
    pret = len(reserve()); en_file = sum(1 for e in F.values() if e['etape'] not in ('termine',) and len(e['erreurs']) < 3)
    objectif = int(round(n * (1 + RESERVE_JOURS)))
    manque = max(0, objectif - pret - en_file)
    journal(f'réserve {pret} prête(s), {en_file} en file, objectif {objectif} → {manque} épisode(s) à distribuer')
    if manque:
        neufs = serie.plan(manque, journal=journal)
        if len(neufs) < manque:
            noms = prochains_castings(max(2, 2 * (manque - len(neufs))))
            if noms:
                journal(f'casting d’avance : {noms}'); CT.visages(noms, journal=journal)
                neufs += serie.plan(manque - len(neufs), journal=journal)
        if len(neufs) < manque: neufs += serie.plan(manque - len(neufs), journal=journal, reprises=True)
    serie.marche(None, journal)
    for i, e in serie.file().items():
        if e['etape'] == 'termine' and not os.path.isfile(os.path.join(LIV, f'{i}.json')):
            try: livre(i, journal=journal)
            except Exception as ex: journal(f'{i} : livraison impossible ({str(ex)[:160]})')
    # le temps qui reste sert la troupe : bibliothèques de visages d'avance (la distribution de demain aura des duos neufs)
    noms = prochains_castings(CASTING_PAR_JOUR)
    if noms: journal(f'casting d’avance : {noms}'); CT.visages(noms, journal=journal)
    r = etat(); r['minutes'] = round((time.time() - t0) / 60, 1); journal(json.dumps(r, ensure_ascii=False)); return r


def etat():
    F = serie.file(); fi = fiches(); J = serie.jouables()
    c = int(os.environ.get('FABRIQUE_CADENCE') or config()['cadence'])
    return {'cadence_par_jour': c, 'reserve_pretes': len(reserve()), 'jours_d_avance': round(len(reserve()) / max(1, c), 1),
            'livrees': len(fi), 'a_envoyer': len(a_envoyer()), 'publiees': sum(1 for f in fi if f.get('publiee')),
            'doublons': sum(1 for f in fi if f.get('statut') == 'doublon'), 'a_corriger': sum(1 for f in fi if f.get('statut') == 'a_corriger'),
            'file': {k: sum(1 for e in F.values() if e['etape'] == k) for k in (*serie.ETAPES, 'termine')},
            'en_echec': sum(1 for e in F.values() if len(e['erreurs']) >= 3),
            'personnages_jouables': len(J), 'personnages_bible': len(CT.bible()),
            'jours_pour_10000_a_cette_cadence': round(max(0, 10000 - len(fi)) / max(1, c))}


if __name__ == '__main__':
    a = sys.argv[1:] or ['etat']
    if a[0] == 'jour': jour(int(a[1]) if len(a) > 1 and a[1] else None)
    elif a[0] == 'livre': print(json.dumps(livre(a[1], a[2] if len(a) > 2 else None), ensure_ascii=False, indent=1))
    elif a[0] == 'a_envoyer': print(json.dumps(a_envoyer(), ensure_ascii=False, indent=1))
    elif a[0] == 'envoye': print(json.dumps(envoye(a[1], a[2]), ensure_ascii=False, indent=1))
    elif a[0] == 'publiee': print(json.dumps(marque_publiee(a[1], a[2] if len(a) > 2 else None), ensure_ascii=False, indent=1))
    elif a[0] == 'statut': print(json.dumps(marque(a[1], a[2]), ensure_ascii=False, indent=1))
    else: print(json.dumps(etat(), ensure_ascii=False, indent=1))
