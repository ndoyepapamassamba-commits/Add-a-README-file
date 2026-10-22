# SCÈNES CRÉÉES PAR LA FABRIQUE ELLE-MÊME (22/10/2026) — « donc je serai toujours dépendant ? » ; « qu'est-ce que je serai
# indépendant ? ». Quand les duos prêts manquent (règle de variété de serie_v1 : aucun personnage ni décor des épisodes voisins),
# la machine GitHub pioche le lieu suivant du catalogue (catalogue_lieux.py), sans Claude ni geste de l'utilisateur :
#   1. dessin : AI Horde (Z-Image-Turbo, Apache-2.0, gratuit, sans compte), quatre graines, style de la V1 (scene_generee) ;
#   2. tri : visages lus et tournés vers la caméra, teint dans la gamme de la V1, exactement deux personnes au premier plan ;
#      deux essais ratés → le lieu est mis de côté (journal) ;
#   3. préparation : découpe, squelette, bibliothèques de visages (scene_generee.prepare) ;
#   4. coffre : la scène préparée (prep/, image, fiches) est scellée avec la clé publique de la fabrique et versée dans la
#      release fabrique-coffre, que chaque marche ouvre au départ (le dossier prep/ n'est pas dans l'état scellé) ;
#   5. sketchs : recharge.py écrit pour ce duo (ressort et métier tirés du catalogue), contrôle ton.py, juge d'humour contre la V1.
# Véto de l'utilisateur, après coup : studio-video/fabrique/config.json « duos_refuses » (noms de scènes) — jamais rejoués,
# jamais recréés.
#   python3 scenes_auto.py etat              → duos prêts, besoin, prochain lieu du catalogue
#   python3 scenes_auto.py cree [NOM]        → crée la scène (le prochain lieu si NOM absent)
import json, os, re, shutil, subprocess, sys, tempfile, time

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import serie_v1 as SV, catalogue_lieux as CL

SEUIL = int(os.environ.get('SCENES_SEUIL', str(4 * SV.FENETRE)))   # duos prêts visés : 12 (3 épisodes voisins × 3 sketchs + marge)
ESSAIS_MAX = 2
GRAINES = ([101, 102, 103, 104], [201, 202, 203, 204])
DEUX = 'Exactly two adults in the foreground, nobody else in the foreground, both with adult body proportions. '
CONFIG = os.path.join(ICI, '..', 'fabrique', 'config.json')
FICHES = os.path.join(ICI, '..', 'blender', 'film', 'characters.json')


def _journal_f(): return os.path.join(SV.BIBLIO, 'scenes-auto', 'journal.json')


def journal_sc():
    f = _journal_f()
    return json.load(open(f, encoding='utf-8')) if os.path.isfile(f) else {}


def _note_sc(nom, **kw):
    J = journal_sc(); e = J.setdefault(nom, {'essais': 0}); e.update(kw); e['maj'] = SV._maintenant()
    os.makedirs(os.path.dirname(_journal_f()), exist_ok=True)
    json.dump(J, open(_journal_f(), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def refuses():
    try: return set(json.load(open(CONFIG, encoding='utf-8')).get('duos_refuses', []))
    except Exception: return set()


def pretes():
    return {k: v for k, v in SV.scenes_pretes().items() if k not in refuses()}


def besoin():
    return max(0, SEUIL - len(pretes()))


def prochain():
    """lieu suivant du catalogue : ni prêt, ni refusé, ni interdit, ni déjà raté deux fois."""
    P = os.path.join(SV.BIBLIO, 'prep'); J = journal_sc(); non = refuses() | SV.INTERDITES
    for L in CL.LIEUX:
        n = L['nom']
        if n in non or os.path.isdir(os.path.join(P, n)) or J.get(n, {}).get('essais', 0) >= ESSAIS_MAX: continue
        return L
    return None


def description(L):
    a, b = L['a'], L['b']
    return f"{DEUX}{L['decor']} LEFT: {a[3]}. RIGHT: {b[3]}."


def acteurs(L): return [(L[k][0], L[k][1], L[k][2]) for k in 'ab']


def fiches(L):
    """fiches des deux personnages (genre, âge, métier, ressort) : characters.json pour les voix et l'écriture, et une copie
    dans la bibliothèque (fiches/<lieu>.json) qui voyage avec la scène dans le coffre."""
    c = json.load(open(FICHES, encoding='utf-8')); f = {}
    for k in 'ab':
        nom, genre, age, _, metier, ressort = L[k]
        e = c.get(nom) or {'height': 1.75 if genre == 'homme' else 1.64, 'voice': 'siwis', 'pitch': 1.0, 'dessin': 'scene', 'lieux': []}
        e.update({'genre': genre, 'age': int(age), 'activite': metier, 'ressort': ressort, 'lieu': L['lieu']}); c[nom] = f[nom] = e
    json.dump(c, open(FICHES, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    d = os.path.join(SV.BIBLIO, 'fiches'); os.makedirs(d, exist_ok=True)
    json.dump({'scene': L['nom'], 'lieu': L['lieu'], 'personnages': f}, open(os.path.join(d, L['nom'] + '.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)


def charge_fiches():
    """fiches des scènes créées par la fabrique (bibliothèque) remises dans characters.json au début de chaque marche : la copie
    du code sur la machine GitHub est neuve à chaque fois."""
    d = os.path.join(SV.BIBLIO, 'fiches')
    if not os.path.isdir(d): return 0
    c = json.load(open(FICHES, encoding='utf-8')); n = 0
    for f in sorted(os.listdir(d)):
        if not f.endswith('.json'): continue
        for nom, e in json.load(open(os.path.join(d, f), encoding='utf-8')).get('personnages', {}).items():
            if c.get(nom) != e: c[nom] = e; n += 1
    if n: json.dump(c, open(FICHES, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return n


def cle_publique():
    for p in (os.environ.get('FABRIQUE_PUB'), os.path.join(os.environ.get('GITHUB_WORKSPACE', ICI), '..', 'site', 'cle.pub.pem')):
        if p and os.path.isfile(p): return p
    return None


def range_coffre(nom, journal=print):
    """scène préparée scellée (clé publique de la fabrique) et versée dans la release fabrique-coffre : ouverte au début de
    chaque marche suivante comme le reste du coffre. Sans clé ou hors GitHub : rien n'est versé (la scène reste locale)."""
    pub = cle_publique()
    if not pub or not shutil.which('gh') or not os.environ.get('GITHUB_ACTIONS'):
        journal(f'{nom} : scène gardée sur place (coffre non joignable)'); return False
    sys.path.insert(0, os.path.join(ICI, '..', 'fabrique')); import coffre
    with tempfile.TemporaryDirectory() as t:
        src = os.path.join(t, 'src')
        shutil.copytree(os.path.join(SV.BIBLIO, 'prep', nom), os.path.join(src, 'prep', nom))
        for sous, ext in (('scenes', '.png'), ('fiches', '.json')):
            f = os.path.join(SV.BIBLIO, sous, nom + ext)
            if os.path.isfile(f): os.makedirs(os.path.join(src, sous), exist_ok=True); shutil.copy(f, os.path.join(src, sous))
        out = os.path.join(t, 'out'); os.makedirs(out)
        coffre.scelle_dossier(src, out, f'scene-{nom}', coffre._pub(pub))
        fs = [os.path.join(out, f) for f in sorted(os.listdir(out))]
        r = subprocess.run(['gh', 'release', 'upload', 'fabrique-coffre', *fs, '--clobber'], capture_output=True, text=True)
    journal(f"{nom} : {'versée dans le coffre' if r.returncode == 0 else 'versement refusé : ' + r.stderr[-200:]}")
    return r.returncode == 0


def cree(L=None, journal=print):
    """crée UNE scène du catalogue, de bout en bout ; renvoie son nom si elle est prête, sinon None."""
    import scene_generee as G
    L = L or prochain()
    if not L: journal('catalogue épuisé : aucun lieu neuf à créer'); return None
    nom = L['nom']; essai = journal_sc().get(nom, {}).get('essais', 0); t0 = time.time()
    _note_sc(nom, essais=essai + 1, etape='dessin')
    vs = G.dessine(nom, description(L), GRAINES[min(essai, len(GRAINES) - 1)])
    v = G.choisit(vs, 2) if vs else None
    if not v:
        _note_sc(nom, etape='refus du tri', variantes=len(vs)); journal(f'{nom} : aucune variante lisible ({len(vs)} dessins)'); return None
    fiches(L); _note_sc(nom, etape='préparation', image=os.path.basename(v))
    faits = G.prepare(nom, v, acteurs(L), journal=lambda m: journal(f'{nom} : {m}'))
    if len(faits) < 2:
        _note_sc(nom, etape='préparation incomplète'); journal(f'{nom} : préparation incomplète ({faits})'); return None
    range_coffre(nom, journal)
    _note_sc(nom, etape='prête', secondes=round(time.time() - t0))
    journal(f'{nom} : scène neuve prête en {time.time() - t0:.0f} s ({L["a"][0]}, {L["b"][0]})')
    return nom


def marche(minutes, journal=print, sketchs=8):
    """tant que les duos prêts manquent et que le temps le permet : une scène neuve, puis ses sketchs."""
    t0 = time.time(); faites = []
    while besoin() and (time.time() - t0) < minutes * 60 - 50 * 60:   # une scène ≈ 40-50 min sur 4 cœurs
        L = prochain()
        if not L: break
        nom = cree(L, journal)
        if nom:
            faites.append(nom)
            try:
                import recharge; recharge.recharge(nom, sketchs, journal)
            except Exception as e: journal(f'{nom} : sketchs non écrits ({str(e)[:160]})')
    return faites


if __name__ == '__main__':
    a = sys.argv[1:] or ['etat']
    if a[0] == 'etat':
        L = prochain()
        print(json.dumps({'duos_prets': len(pretes()), 'seuil': SEUIL, 'besoin': besoin(), 'refuses': sorted(refuses()),
                          'prochain': L and L['nom'], 'catalogue': len(CL.LIEUX), 'journal': journal_sc()}, ensure_ascii=False, indent=1))
    elif a[0] == 'cree':
        L = next((x for x in CL.LIEUX if x['nom'] == a[1]), None) if len(a) > 1 else None
        print(cree(L))
