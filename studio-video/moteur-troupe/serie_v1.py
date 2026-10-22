# SÉRIE AU MOTEUR DE LA V1 (21/10/2026) — « si demain je ne suis pas autonome avec tout bouclé avec les 10000 vidéos
# j'arrêterai » ; « fabriqué d'avance à ma disposition » ; « je ne veux pas des personnages de l'ancienne troupe ».
# La fabrique GitHub produit SANS Claude, avec le moteur de la V1 publiée (usine.py tourne, juge unique, mesures contre la V1) :
#   RÉSERVE  stock/sketchs.json — sketchs écrits d'avance, chacun contrôlé par fabrique/ton.py, posés dans une scène préparée
#            (prep/<scène> : découpe, squelette, bibliothèques de visages) ; rechargée par l'écriture automatique (histoires.py) ;
#   ÉPISODE  3 sketchs jamais tournés, de scènes différentes quand la réserve le permet, au format de la V1 (≈ 62 s) ;
#   TOURNAGE usine.tourne (voix, bouches, rires, ambiance, visages, tournage, flou, montage, 9 portes du juge unique) ;
#   LIVRAISON autopilot.livre (version téléphone ≤ 15 Mo, affiche, doublons, mesures contre la V1) : statut « pret » seulement si
#            toutes les portes passent ET aucune mesure n'est sous la V1, sinon « a_corriger » avec ses motifs (jamais supprimé) ;
#   COMPTEUR journal.jsonl (début, fin, statut de chaque épisode) → débit mesuré, épisodes par jour, date projetée des 10 000.
#   python3 serie_v1.py etat                 → réserve, épisodes, débit mesuré, projection (JSON)
#   python3 serie_v1.py prochain [N] [--minutes M] → N épisodes de plus (arrêt propre avant M minutes)
#   python3 serie_v1.py verifie              → chaque sketch de la réserve passé à ton.py (sortie 1 si un défaut)
import datetime, json, os, random, re, subprocess, sys, time, unicodedata

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
BIBLIO = os.path.realpath(os.path.expanduser(os.environ.get('MASSAMBA_BIBLIO', '~/massamba-bibliotheque')))
STOCK = os.path.join(BIBLIO, 'stock', 'sketchs.json')
SERIE = os.path.join(BIBLIO, 'serie-v1')
JOURNAL = os.path.join(SERIE, 'journal.jsonl')
OBJECTIF = 10_000
VIDES = {'AVEC', 'DANS', 'POUR', 'MAIS', 'TOUT', 'TOUS', 'TOUTE', 'AUSSI', 'COMME', 'ELLE', 'ELLES', 'ILS', 'NOUS', 'VOUS', 'TOI',
         'MOI', 'LUI', 'SONT', 'EST', 'ÇA', 'CETTE', 'CELA', 'DONC', 'ALORS', 'ENCORE', 'DÉJÀ', 'HEIN', 'DÊH', 'QUOI', 'MÊME', 'BIEN',
         'PLUS', 'VOTRE', 'NOTRE', 'LEUR', 'LEURS', 'QUAND', 'AVANT', 'APRÈS', 'FAIT', 'FAIS', 'FAUT', 'VAIS', 'VEUX', 'PEUX'}


def _maintenant(): return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')


def reserve():
    return json.load(open(STOCK, encoding='utf-8'))['sketchs'] if os.path.isfile(STOCK) else []


def journal():
    if not os.path.isfile(JOURNAL): return []
    return [json.loads(l) for l in open(JOURNAL, encoding='utf-8') if l.strip()]


def _note(**e):
    os.makedirs(SERIE, exist_ok=True)
    with open(JOURNAL, 'a', encoding='utf-8') as f: f.write(json.dumps(e, ensure_ascii=False) + '\n')


def scenes_pretes():
    """scènes préparées dont CHAQUE personnage a sa bibliothèque de visages (meta.json) : seules jouables."""
    P = os.path.join(BIBLIO, 'prep'); ok = {}
    for n in sorted(os.listdir(P)) if os.path.isdir(P) else []:
        f = os.path.join(P, n, 'scene.json')
        if not os.path.isfile(f): continue
        S = json.load(open(f))
        if S.get('acteurs') and all(os.path.isfile(os.path.join(P, n, 'expressions', a['slug'], 'meta.json')) for a in S['acteurs']):
            ok[n] = [a['nom'] for a in S['acteurs']]
    return ok


def tournes():
    """sketchs déjà tournés jusqu'au bout (étape « fin », quel qu'en soit le statut) : jamais deux fois le même sketch.
    22/10/2026 (marche GitHub n° 18) : un épisode en échec technique (bibliothèque absente, machine coupée) rend ses sketchs à la
    réserve — 9 sketchs avaient été perdus pour une panne de la machine ; un sketch qui fait échouer le moteur deux fois est
    écarté, pour ne pas boucler sur lui."""
    J = journal(); fini = {s for e in J if e.get('etape') == 'fin' for s in e.get('sketchs', [])}
    ech = {}
    for e in J:
        if e.get('etape') == 'echec':
            for s in e.get('sketchs', []): ech[s] = ech.get(s, 0) + 1
    return fini | {s for s, n in ech.items() if n >= 2}


def mots_chute(sk):
    """mots mis en valeur dans les sous-titres (comme « TÊTE, MISS, OPTION » de l'épisode 4) : mots pleins de la chute."""
    ch = [r for r in sk['repliques'] if r.get('chute')]
    out = []
    for r in ch:
        for m in re.findall(r"[\w’']+", r['texte'].upper()):
            m = m.split("'")[-1].split('’')[-1]
            if len(m) >= 4 and m not in VIDES and m not in out: out.append(m)
    return out


def choisit(k=3, graine=None):
    """k sketchs jamais tournés, de scènes prêtes, en variant les scènes (jamais deux fois la même d'affilée si possible)."""
    pretes = scenes_pretes(); deja = tournes(); rng = random.Random(graine)
    libres = [s for s in reserve() if s['id'] not in deja and s.get('image') in pretes
              and set(s['acteurs']) <= set(pretes[s['image']])]
    rng.shuffle(libres); pris = []
    while len(pris) < k and libres:
        vues = [s['image'] for s in pris]
        c = sorted(libres, key=lambda s: (vues.count(s['image']), s['image'] == (vues[-1] if vues else None)))[0]
        pris.append(c); libres.remove(c)
    return pris


def numero():
    n = [int(e['id'][1:]) for e in journal() if re.fullmatch(r'E\d+', e.get('id', ''))]
    return max(n, default=0) + 1


def ecrit(i, sks):
    d = os.path.join(SERIE, i); os.makedirs(d, exist_ok=True)
    H = {'titre': f'Saison 2 — épisode {i}', 'univers': 'Africa Toon Troll', 'duree_cible_s': 62,
         'reference': 'TON.md ; format de la V1 (ep01 v17)', 'ecriture': 'réserve de sketchs (stock/sketchs.json), fabrique sans intervention',
         'sketchs': [{k: v for k, v in s.items() if k not in ('source', 'ecrit_le')} for s in sks],
         'mots_chute': [m for s in sks for m in mots_chute(s)]}
    json.dump(H, open(os.path.join(d, 'histoire.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return d


def un_episode(journal_=print):
    import usine, autopilot
    sks = choisit(3, graine=numero())
    if len(sks) < 3: journal_(f'réserve épuisée : {len(sks)} sketch(s) jouable(s)'); return None
    i = f'E{numero():05d}'; t0 = time.time(); d = ecrit(i, sks)
    _note(id=i, etape='debut', sketchs=[s['id'] for s in sks], scenes=[s['image'] for s in sks], t0=_maintenant())
    # HUMOUR CONTRE LA V1 (22/10/2026, humour_v1.py) : duel de chaque sketch contre la V1 par le juge texte gratuit, pendant le
    # tournage (fil à part : aucune minute ajoutée), inscrit dans histoire.json avant la livraison qui le lit
    # 22/10/2026 : le juge gratuit peut être lent (≈ 45 s par vote) — l'épisode ne l'attend que 2 min après le tournage ; un score
    # qui arrive plus tard est quand même gardé dans la réserve (garde_humour), jamais perdu
    import threading, humour_v1
    hum = {}
    def _juge_sketchs():
        for s_ in sks:
            hum[s_['id']] = s_['plancher_v17'] if s_.get('plancher_v17') is not None else _essai_plancher(humour_v1, s_)
            garde_humour({s_['id']: hum[s_['id']]})
    fil = threading.Thread(target=_juge_sketchs, daemon=True)
    fil.start()
    try:
        os.environ.pop('USINE_PORTES_FOND', None)   # le juge rend son verdict avant la livraison
        usine.tourne(d, 'v1'); D = os.path.join(d, 'v1')
        fil.join(timeout=float(os.environ.get('HUMOUR_ATTENTE_S', '120'))); note_humour(d, dict(hum))
        F = autopilot.livre(i, D, journal=journal_)
        F['sketchs'] = [{'id': s['id'], 'titre': s['titre'], 'lieu': s.get('lieu'), 'scene': s['image'], 'acteurs': s['acteurs'],
                         'mecanique': s.get('mecanique'), 'repliques': [{'qui': r['qui'], 'texte': r['texte'], 'chute': bool(r.get('chute'))}
                                                                         for r in s['repliques']]} for s in sks]
        F['episode'] = i
        json.dump(F, open(os.path.join(autopilot.LIV, f'{i}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        menage(d)
        _note(id=i, etape='fin', sketchs=[s['id'] for s in sks], statut=F['statut'], motifs=F.get('motifs'),
              secondes=round(time.time() - t0), t1=_maintenant())
        journal_(f"{i} : {F['statut']} en {time.time() - t0:.0f} s — {', '.join(s['titre'] for s in sks)}")
        return F
    except Exception as e:
        _note(id=i, etape='echec', sketchs=[s['id'] for s in sks], erreur=str(e)[-600:], secondes=round(time.time() - t0), t1=_maintenant())
        journal_(f'{i} : échec technique — {str(e)[-300:]}'); return None


def _essai_plancher(module, sk):
    try: return module.plancher(sk)
    except Exception: return None


_VERROU_STOCK = __import__('threading').Lock()


def garde_humour(hum):
    """scores d'humour gardés dans la réserve : un sketch n'est jugé qu'une fois."""
    if not os.path.isfile(STOCK) or not any(v is not None for v in hum.values()): return
    with _VERROU_STOCK:
        St = json.load(open(STOCK, encoding='utf-8'))
        for s_ in St['sketchs']:
            if hum.get(s_['id']) is not None: s_['plancher_v17'] = hum[s_['id']]
        tmp = STOCK + '.tmp'; json.dump(St, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); os.replace(tmp, STOCK)


def note_humour(d, hum):
    """scores d'humour contre la V1 inscrits dans histoire.json de l'épisode (et gardés dans la réserve)."""
    f = os.path.join(d, 'histoire.json'); H = json.load(open(f, encoding='utf-8'))
    for s_ in H['sketchs']:
        if hum.get(s_['id']) is not None: s_['plancher_v17'] = hum[s_['id']]
    json.dump(H, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    garde_humour(hum)


def menage(d):
    """après livraison, seul ce qui sert à rejouer ou à juger reste (histoire, rapports, mesures) : images de tournage, sons
    intermédiaires et films bruts partent — la version téléphone est déjà dans livraison/ (la machine GitHub garde son disque,
    l'état scellé reste petit)."""
    import shutil
    for r, ds, fs in os.walk(d, topdown=False):
        for x in ds:
            if x in ('clip', 'clip-net', 'compose', 'source', 'voix'): shutil.rmtree(os.path.join(r, x), ignore_errors=True)
        for f in fs:
            if f.endswith(('.mp4', '.wav', '.png', '.jpg', '.npz', '.npy', '.jsonl')) and f != 'planche.jpg':
                try: os.remove(os.path.join(r, f))
                except OSError: pass


def etat():
    J = journal(); fins = [e for e in J if e.get('etape') == 'fin']; ech = [e for e in J if e.get('etape') == 'echec']
    st = {}
    for e in fins: st[e['statut']] = st.get(e['statut'], 0) + 1
    sec = [e['secondes'] for e in fins + ech if e.get('secondes')]
    moy = sum(sec) / len(sec) if sec else None
    pretes = scenes_pretes(); deja = tournes()
    libres = [s for s in reserve() if s['id'] not in deja and s.get('image') in pretes]
    par_jour = round(86400 / moy, 1) if moy else None   # une machine qui tourne sans arrêt
    reste = OBJECTIF - len(fins)
    return {'maj': _maintenant(), 'episodes': len(fins), 'statuts': st, 'echecs_techniques': len(ech),
            'minutes_par_episode': round(moy / 60, 1) if moy else None, 'episodes_par_jour_par_machine': par_jour,
            'jours_pour_10000_une_machine': round(reste / par_jour) if par_jour else None,
            'reserve': {'sketchs': len(reserve()), 'jouables_libres': len(libres), 'episodes_possibles': len(libres) // 3},
            'scenes_pretes': pretes}


def verifie():
    import tempfile
    S = reserve(); nd = 0
    with tempfile.TemporaryDirectory() as t:
        for s in S:
            f = os.path.join(t, 'h.json'); json.dump({'sketchs': [s]}, open(f, 'w', encoding='utf-8'), ensure_ascii=False)
            r = subprocess.run([sys.executable, os.path.join(ICI, 'fabrique', 'ton.py'), f], capture_output=True, text=True)
            if r.returncode: nd += 1; print(r.stdout.strip())
    print(f'{len(S) - nd}/{len(S)} sketchs conformes'); return nd


if __name__ == '__main__':
    a = sys.argv[1:] or ['etat']
    if a[0] == 'etat': print(json.dumps(etat(), ensure_ascii=False, indent=1))
    elif a[0] == 'verifie': sys.exit(1 if verifie() else 0)
    elif a[0] == 'prochain':
        n = int(a[1]) if len(a) > 1 and a[1].isdigit() else 1
        lim = float(a[a.index('--minutes') + 1]) * 60 if '--minutes' in a else None; t0 = time.time(); faits = []
        for _ in range(n):
            moy = (etat()['minutes_par_episode'] or 20) * 60
            if lim and time.time() - t0 + 1.2 * moy > lim: print('temps de la machine bientôt écoulé : arrêt propre'); break
            F = un_episode()
            if F is None and len(choisit(3)) < 3: break
            faits.append(F and F['id'])
        print(json.dumps({'faits': faits, 'etat': etat()}, ensure_ascii=False, indent=1))
