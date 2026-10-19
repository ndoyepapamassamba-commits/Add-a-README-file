# JUGE QUALITÉ DU FILM (17/10/2026) — « augmente le juge de la qualité de la vidéo… il faut regarder tous ces détails » :
# un film n'est livré qu'à 100 % (toutes les portes passées). Tout est mesuré sur le FICHIER livré et sur les mesures du
# tournage (ETIREMENT=1), jamais sur une intention du moteur.
#   python3 qualite.py <dossier_tournage> <film.mp4> <montage.json> [timeline.json]   → <dossier>/qualite.json + tableau
# PORTES
#  A. Rythme et mouvement : les 9 mesures de cadre.py contre vos TikTok ; le découpage peut monter jusqu'à la médiane des
#     studios (consigne du 17/10 : qualité Pixar / Minions, Afrikatoon coupe 12,6 à 23,6 fois par minute)
#  B. BOUCHE LISIBLE, réplique par réplique : le visage de celui qui parle fait au moins VISAGE_MIN px dans le cadre ET sa
#     bouche, retrouvée sur l'image rendue, bouge avec sa voix (levres_roi.py)
#  C. Corps sans étirement : médiane du 99e centile ≤ 5 %, 95e centile ≤ 8 %, pour chaque personnage
#  D. ÉCOUTE : pendant qu'un autre parle, chaque personnage tourne la tête vers lui (≥ 75 % du temps) ; D bis (v36) : JEV voit
#     chacun REGARDER celui qui lui parle et celui à qui il parle (jev_regard.py)
#  E. PAS D'AUTOMATE : aucune piste de tête ou de buste périodique (autocorrélation ≤ 0,75 entre 0,5 et 3 s)
#  F. ARRIÈRE-PLAN VIVANT : part animée du décor (decor_vivant) ≥ 4 % de l'image, ou une entité vivante (bête, figurant)
#  G. ŒIL DE JEV, un plan sur un : ni tête coupée, ni visage déformé, style cohérent (jev_plans.py)
#  H. TECHNIQUE ET SON (controle_video.py) : 30 i/s, −14 LUFS, ni noir ni gel, voix intelligibles, sautes d'image ≤ 0,6/s
#  I. FLUIDITÉ (« fluidité absolue », consigne du 17/10) : aucun à-coup d'une image à l'autre — accélération de la tête et
#     du buste ≤ 2,5°/image² (un hochement dessiné reste sous 1,5), aucune expression qui saute de plus de 0,2 en une image
#  J. HUMOUR : chaque sketch de l'histoire noté par l'œil de JEV (histoires.juge) — « fait vraiment rire » (≥ 2 sur 4),
#     une vraie chute (≥ 0,7), du français ivoirien (≥ 0,5), rien de méchant (≤ 0,3)
#  K. PHYSIQUE ET NATURE : l'ombre de chaque bête se voit au sol (mesurée au tournage), aucune espèce hors de son milieu,
#     et la batterie physique de JEV (flotte, ombre manquante, échelle, lumière, hors contexte, physique impossible) ne
#     trouve aucun défaut AJOUTÉ par l'animation (plan comparé à son image source)
import glob, json, os, subprocess, sys
import numpy as np

ICI = os.path.dirname(os.path.abspath(__file__))
D, MP4, MONTAGE = sys.argv[1:4]; TL = sys.argv[4] if len(sys.argv) > 4 else 'timeline.json'
# PORTES SANS MODÈLE D'IMAGES NON VALIDÉ (18/10/2026) : JEV coupé, SmolVLM répondait 8 questions en 10 minutes sur le
# processeur et son accord avec JEV n'a jamais été mesuré ; en production, une question sans tête apprise validée rend sa
# porte « non jugée » avec sa raison (JUGE_VLM_MAX > 0 pour rouvrir la voie de secours sur une machine plus rapide)
os.environ.setdefault('JUGE_VLM_MAX', '0')
VISAGE_MIN = float(os.environ.get('VISAGE_MIN', 72)); CH = 460
FPS = 30   # cadence des MESURES du tournage (grille des 30 i/s, même quand le film est tourné à 60 i/s : tourne.mesure_ici)
M = json.load(open(MONTAGE)); T = json.load(open(TL)); TO = json.load(open(f'{D}/tournage.json'))
G = {}


DUREES = {}   # temps de chaque juge (vitesse : savoir où vont les secondes du contrôle)
# JUGES EN PARALLÈLE (18/10/2026, « réduis encore le temps de traitement ») : les huit juges ne lisent que le film, la
# chronologie, l'histoire et le tournage, jamais le verdict d'un autre ; lancés l'un après l'autre ils prenaient 269 s sur
# l'épisode 1 (controle_video 102 s, jev_film 77 s, cadre 42 s, jev_levres 18 s…). Ils partent tous ensemble au début ;
# chaque porte attend le sien (`lance`), le contrôle dure autant que le plus long.
HI_ = M.get('histoire', 'histoire.json')
mus_ = 'voix/mix-musique.wav' if os.path.isfile('voix/mix-musique.wav') else 'voix/mix.wav'
JUGES = {'cadre': ([f'{ICI}/cadre.py', 'juge', MP4, f'{ICI}/gabarit_tiktok.json', f'{D}/verdict.json'], f'{D}/verdict.json'),
         'levres': ([f'{ICI}/jev_levres.py', MP4, TL, MONTAGE, f'{D}/jev_levres.json'], f'{D}/jev_levres.json'),
         'regard': ([f'{ICI}/jev_regard.py', MP4, TL, MONTAGE, f'{D}/jev_regard.json'], f'{D}/jev_regard.json'),
         'film': ([f'{ICI}/jev_film.py', MP4, f'{D}/tournage.json', TL, f'{D}/jev_film.json'], f'{D}/jev_film.json'),
         'controle': ([f'{ICI}/controle_video.py', MP4, TL, f'{D}/tournage.json', f'{D}/controle.json'], f'{D}/controle.json'),
         'texte': ([f'{ICI}/jev_texte.py', MP4, TL, HI_, f'{D}/jev_texte.json'], f'{D}/jev_texte.json'),
         'mouvement': ([f'{ICI}/jev_mouvement.py', MP4, f'{D}/tournage.json', TL, f'{D}/jev_mouvement.json'], f'{D}/jev_mouvement.json'),
         'son': ([f'{ICI}/jev_son.py', TL, 'voix/mix.wav', mus_, f'{D}/bande.wav', f'{D}/jev_son.json'], f'{D}/jev_son.json'),
         'choc': ([f'{ICI}/jev_choc.py', MP4, f'{D}/tournage.json', TL, f'{D}/jev_choc.json'], f'{D}/jev_choc.json')}
import time
EN_COURS = {}
for _a, _s in JUGES.values():
    if not os.path.isfile(_s) or os.environ.get('QUALITE_REFAIT'):
        # erreurs gardées (18/10/2026) : JEV coupé, un juge dont une question n'a pas encore de tête locale s'arrête sur
        # « NonJuge » — la porte est alors déclarée NON JUGÉE avec sa raison, au lieu d'un échec muet
        os.makedirs(f'{D}/juges', exist_ok=True)
        EN_COURS[_a[0]] = (subprocess.Popen([sys.executable, *_a], stdout=subprocess.DEVNULL, stderr=open(f"{D}/juges/{os.path.basename(_a[0])}.err", 'w')), time.time())


def lance(args, sortie):
    t0 = time.time(); p = EN_COURS.pop(args[0], None); tue = False
    if p:
        p[0].wait(); t0 = p[1]
        # JUGE TUÉ (19/10/2026, v12) : controle_video et jev_mouvement (3 à 7 Go chacun, en parallèle) tués par le noyau faute
        # de mémoire, sans une ligne d'erreur → portes H et L muettes. Un juge tué par un signal est relancé SEUL, ici
        tue = p[0].returncode is not None and p[0].returncode < 0 and not os.path.isfile(sortie)
        if tue: print(f'{os.path.basename(args[0])} tué (signal {-p[0].returncode}) : relancé seul', flush=True)
    if (not p or tue) and (tue or not os.path.isfile(sortie) or os.environ.get('QUALITE_REFAIT')):
        r_ = subprocess.run([sys.executable, *args], capture_output=True, text=True); os.makedirs(f'{D}/juges', exist_ok=True)
        open(f"{D}/juges/{os.path.basename(args[0])}.err", 'w').write(r_.stderr or '')
    DUREES[os.path.basename(args[0])] = round(time.time() - t0, 1)
    if not os.path.isfile(sortie):
        e_ = f"{D}/juges/{os.path.basename(args[0])}.err"; t_ = open(e_).read() if os.path.isfile(e_) else ''
        m_ = [l for l in t_.splitlines() if 'NonJuge' in l]
        NON_JUGES[os.path.basename(args[0])] = m_[-1].split('NonJuge:', 1)[-1].strip() if m_ else (t_.strip().splitlines() or ['sortie absente'])[-1][:200]
    return json.load(open(sortie)) if os.path.isfile(sortie) else None


NON_JUGES = {}


def scene(sid):
    return json.load(open(f"{M['scenes'][sid]}/scene.json"))


# ── A. rythme et mouvement (cadre.py) ──
v = lance(*JUGES['cadre'])
lignes = []
for l in (v or {}).get('lignes', []):
    ok = l['verdict'] == '✅'
    if not ok and l['mesure'] == 'plansParMinute' and l.get('studios'):   # cible élargie aux studios (Pixar, Afrikatoon)
        ok = l['tiktok']['q1'] <= l['film'] <= max(l['tiktok']['q3'], l['studios'])
    lignes.append({'mesure': l['mesure'], 'film': l['film'], 'ok': ok})
G['A_rythme'] = {'ok': bool(lignes) and all(x['ok'] for x in lignes), 'detail': lignes}

# ── B. bouche lisible ──
L_all = T['lines']; dec = TO['decoupage']; cad = TO.get('cadres', {})
# BOUCHE JUGÉE PAR JEV (17/10/2026, « tout appuyé par le jugement de JEV », aucune tolérance) : aux trois instants les plus
# ouverts de la piste de bouche JEV voit la bouche ouverte, aux trois instants fermés (m, b, p, silences) il la voit fermée
# (jev_levres.py ; témoin négatif v24 : 0/18). La mesure par pixels sombres (levres_roi, 255 s) n'est plus le juge.
jl = lance(*JUGES['levres']) or {}
det = jl.get('detail', []); rep = []
for i, L in enumerate(L_all):
    mid = L['t0'] + L['dur'] / 2; s = next((x for x in dec if x[0] <= mid < x[1]), None)
    S = scene(L['sketch']); a = next(x for x in S['acteurs'] if x['nom'] == L['qui']); fh = a['visage']['box'][3] - a['visage']['box'][1]
    c = cad.get(f'{s[0]:.2f}') if s else None
    px = None if not c else round(min(fh * CH / cc[3] for cc in c[1:3] if cc), 1)
    m = det[i] if i < len(det) else {}
    juge_ = m.get('ok')   # None : réplique trop courte pour trois instants ouverts et trois fermés
    ok = (px is None or px >= VISAGE_MIN) and juge_ is not False and bool(jl)
    rep.append({'qui': L['qui'], 'texte': L['texte'][:40], 'visage_px': px, 'ouverte_aux_voyelles': m.get('ouverte_aux_voyelles'),
                'fermee_aux_consonnes': m.get('fermee_aux_consonnes'), 'ok': ok})
G['B_bouche'] = {'ok': all(r['ok'] for r in rep), 'repliques_ok': f"{sum(r['ok'] for r in rep)}/{len(rep)}", 'detail': rep}

# ── C, D, E : mesures image par image du tournage ──
MES = [json.loads(x) for f in glob.glob(f'{D}/mesures-*.jsonl') for x in open(f)]
ENT = [m for m in MES if m.get('qui') == 'entite']; MES = [m for m in MES if m.get('qui') != 'entite']   # bêtes : porte K
par = {}
for m in MES: par.setdefault(m['qui'], []).append(m)
for k in par: par[k].sort(key=lambda m: m['t'])
etir = {}
for n, ms in par.items():
    e = np.array([m['etirement'][0] for m in ms]); etir[n] = {'mediane': round(float(np.median(e)), 3), 'p95': round(float(np.percentile(e, 95)), 3)}
G['C_etirement'] = {'ok': bool(etir) and all(x['mediane'] <= 0.05 and x['p95'] <= 0.08 for x in etir.values()), 'detail': etir}

pos = {}
for sid in M['scenes']:
    try:
        for a in scene(sid)['acteurs']: b = a['bbox']; pos[a['nom']] = (sid, (b[0] + b[2]) / 2)
    except Exception: pass
ecoute = {}
for n, ms in par.items():
    bon = tot = 0
    for m in ms:
        L = next((x for x in L_all if x['t0'] <= m['t'] <= x['t0'] + x['dur'] and x['qui'] != n and pos.get(x['qui'], (None,))[0] == pos.get(n, (0,))[0]), None)
        if not L or n not in pos or L['qui'] not in pos: continue
        attendu = np.sign(pos[L['qui']][1] - pos[n][1]); y = (m.get('pose') or {}).get('tete_lacet', 0.0)
        tot += 1; bon += int(y * attendu > 2.0)
    if tot: ecoute[n] = round(bon / tot, 3)
G['D_ecoute'] = {'ok': bool(ecoute) and all(x >= 0.75 for x in ecoute.values()), 'detail': ecoute}
# ── D bis. REGARDS JUGÉS PAR JEV (v36, « Mamie ne regarde pas Baye ») : chacun regarde celui qui lui parle, et celui qui parle
# regarde celui à qui il s'adresse, réplique par réplique, quand les deux sont à l'image (jev_regard.py) ──
jr = lance(*JUGES['regard']) or {}
G['D_regard'] = {'ok': bool(jr) and jr.get('synthese', {}).get('paires_jugees', 0) > 0 and not jr.get('synthese', {}).get('fautes'),
                 'detail': {k: v for k, v in jr.get('synthese', {}).items() if k != 'cout'}}


def periodicite(x, fps=FPS):
    """plus fort pic d'autocorrélation entre 0,5 et 3 s, sur des fenêtres de 4 s (médiane des fenêtres)."""
    x = np.asarray(x, np.float32); W = 4 * fps; pics = []
    for a in range(0, len(x) - W, W // 2):
        w = x[a:a + W] - x[a:a + W].mean()
        if float(w.std()) < 0.15: continue   # immobile : rien à juger (une pose tenue n'est pas un automate)
        r = np.correlate(w, w, 'full')[W - 1:]; r = r / max(1e-9, r[0])
        pics.append(float(r[int(0.5 * fps):int(3 * fps)].max()))
    return float(np.median(pics)) if pics else 0.0


auto = {}
for n, ms in par.items():
    for canal in ('tete_tangage', 'tete', 'buste'):
        p = periodicite([(m.get('pose') or {}).get(canal, 0.0) for m in ms])
        auto[f'{n} / {canal}'] = round(p, 3)
G['E_automate'] = {'ok': all(v_ <= 0.75 for v_ in auto.values()), 'detail': auto}

# ── F. arrière-plan vivant ──
vie = {}
for sid, d in M['scenes'].items():
    f = f'{d}/vie.npz'
    if not os.path.isfile(f): vie[sid] = 0.0; continue
    z = np.load(f); tout = sum(z[k] for k in ('feuil', 'tissu', 'fumee', 'bete', 'ampoules') if k in z.files)
    sys.path.insert(0, ICI); import decor_vivant
    pan = decor_vivant.couverture_panache({k: z[k] for k in z.files}, *tout.shape)   # fumée qui monte (panache physique)
    ent = any(m.get('sketch') == sid for m in ENT)   # bêtes réellement tournées dans ce sketch (mesures du tournage)
    vie[sid] = {'part_animee': round(float(((tout > 0.15) | pan).mean()), 4), 'panache': round(float(pan.mean()), 4), 'entites': ent}
G['F_arriere_plan'] = {'ok': all(isinstance(x, dict) and (x['part_animee'] >= 0.04 or x['entites']) for x in vie.values()), 'detail': vie}

# ── G. œil de JEV ──
# toute la vidéo, image par image (jev_film.py v2 : questions recalibrées, cascade, cache par plan), aucune tolérance
j = lance(*JUGES['film']) or {}
sy = j.get('synthese', {})
G['G_jev'] = {'ok': bool(sy) and not any(sy.get(k) for k in ('tetes_coupees', 'visages_deformes', 'artefacts', 'style_incoherent', 'titres_illisibles')),
              'detail': {k: sy.get(k) for k in ('images_jugees', 'images_fautives', 'plans_fautifs', 'tetes_coupees', 'visages_deformes', 'artefacts', 'style_incoherent', 'titres_illisibles')}}

# ── H. technique et son ──
cv = lance(*JUGES['controle']) or {}
H = {k: bool(cv.get(k, {}).get('ok')) for k in ('technique', 'son', 'images', 'intelligibilite', 'mouvement')}
G['H_technique'] = {'ok': bool(cv) and all(H.values()), 'detail': H}

# ── I. fluidité : à-coups de pose et d'expression, image par image (mesures du tournage) ──
ACC_MAX, EMO_MAX = 2.5, 0.2
flu = {}
for n, ms in par.items():
    # images contiguës D'UNE MÊME SCÈNE seulement (18/10/2026) : l'épisode 1 enchaîne trois sketchs ; au changement de sketch
    # (coupe franche sous la carte de titre, 19,87 s) la pose de Maman passait de −0,3° à −6° d'une image à l'autre et
    # comptait comme un à-coup de 5,65 alors que c'est un autre plan, dans une autre scène
    t = np.array([m['t'] for m in ms]); sk_ = np.array([next((x[2] for x in TO['decoupage'] if x[0] <= tt < x[1]), '') for tt in t])
    suite = np.r_[True, (np.abs(np.diff(t) - 1 / FPS) < 2e-3) & (sk_[1:] == sk_[:-1])]
    pire = {}
    for canal in ('tete_tangage', 'tete', 'tete_lacet', 'lacet_visage', 'buste', 'buste_lacet'):
        x = np.array([(m.get('pose') or {}).get(canal, 0.0) for m in ms], np.float32)
        if len(x) < 3: continue
        a = np.abs(x[2:] - 2 * x[1:-1] + x[:-2])[suite[1:-1] & suite[2:]]
        if len(a): pire[canal] = round(float(a.max()), 2)
    E = sorted({e for m in ms for e in (m.get('emotions') or {})})
    if E and len(ms) > 1:
        X = np.array([[(m.get('emotions') or {}).get(e, 0.0) for e in E] for m in ms], np.float32)
        d = np.abs(np.diff(X, axis=0))[suite[1:]]
        if len(d): pire['expression'] = round(float(d.max()), 3)
    flu[n] = dict(pire, ok=all(v <= ACC_MAX for k, v in pire.items() if k != 'expression') and pire.get('expression', 0.0) <= EMO_MAX)
G['I_fluidite'] = {'ok': bool(flu) and all(x['ok'] for x in flu.values()), 'detail': flu}

# ── J. humour et écriture : décisions de JEV sur le texte de chaque sketch (jev_texte.py, aucune tolérance) ──
jt = lance(*JUGES['texte']) or {}
G['J_humour'] = {'ok': bool(jt) and not jt.get('synthese', {}).get('sketchs_fautifs'), 'detail': {r['sketch']: {k: r[k] for k in r if k != 'sketch'} for r in jt.get('sketchs', [])}}

# ── K. PHYSIQUE ET NATURE (17/10/2026 : « l'ombre de la poule ne devait pas passer le contrôle ») ──
#   mesuré au tournage : l'ombre de chaque bête assombrit vraiment le sol (≥ 8 % sur TOUTES ses images) ;
#   aucune espèce hors de son milieu (pas de poule au maquis) ; JEV : batterie physique, pire image de chaque plan, sans
#   marge relative à la source (aucune tolérance, consigne du 17/10/2026)
sys.path.insert(0, ICI); import entites
ombres = {}
for sid in sorted({m['sketch'] for m in ENT}):
    c_ = [m['contraste_ombre'] for m in ENT if m['sketch'] == sid]
    ombres[sid] = {'images': len(c_), 'part_ombre_visible': round(float(np.mean([x >= 0.08 for x in c_])), 3), 'contraste_median': round(float(np.median(c_)), 3)}
lieux = {s_['id']: s_.get('lieu') for s_ in T['sketchs']}
hors_milieu = sorted({sid for sid in {m['sketch'] for m in ENT} if not entites.permise('poule', lieux.get(sid))})
phy = (j.get('synthese') or {}).get('physique', {})
G['K_physique'] = {'ok': all(o['part_ombre_visible'] >= 1.0 for o in ombres.values()) and not hors_milieu and bool(j) and not any(phy.values()),
                   'detail': {'ombres_des_betes': ombres, 'especes_hors_milieu': hors_milieu, 'jev_physique': phy}}

# ── L. MOUVEMENT, SECONDE PAR SECONDE (jev_mouvement.py) : à-coups, personnages figés, décor mort, naturel, raccords ──
jm = lance(*JUGES['mouvement']) or {}
G['L_mouvement'] = {'ok': bool(jm) and not jm.get('synthese', {}).get('secondes_fautives'), 'detail': {k: v for k, v in jm.get('synthese', {}).items() if k != 'cout'}}
# ── M. RÉALISATION, PLAN PAR PLAN : cadre de chaque plan choisi par JEV réalisateur (sans tête coupée, visage lisible) ──
rj = TO.get('realisateur_jev', {})
G['M_realisation'] = {'ok': bool(rj) and all(v.get('conforme', False) for v in rj.values()),
                      'detail': {k: {'choix': v.get('choix'), 'conforme': v.get('conforme'), 'proposes': v.get('proposes')} for k, v in rj.items()}}
# ── N. SON ET MUSIQUE jugés par JEV sur la feuille de son mesurée et le spectrogramme (jev_son.py) ──
js = lance(*JUGES['son']) or {}
G['N_son'] = {'ok': bool(js) and js.get('synthese', {}).get('ok', False), 'detail': js.get('synthese')}
# ── O. SOUS-TITRES ET TITRES tels qu'affichés, jugés par JEV (jev_texte.py) ──
G['O_textes'] = {'ok': bool(jt) and not jt.get('synthese', {}).get('sous_titres_fautifs') and not jt.get('synthese', {}).get('titres_fautifs'),
                 'detail': {k: jt.get('synthese', {}).get(k) for k in ('sous_titres_fautifs', 'titres_fautifs')}}

# ── P. PRISE DE CHOC DE FIN DE SKETCH (18/10/2026, « revoir le visage du choc de la fin ») : JEV juge chaque gros plan de
#    réaction — choquée > 0,5 et visage non abîmé sur chaque image (jev_choc.py) ──
jc = lance(*JUGES['choc']) or {}
G['P_choc'] = {'ok': bool(jc) and jc.get('synthese', {}).get('ok', False), 'detail': jc.get('synthese')}

# ── Q. FLUIDITÉ ET SOUPLESSE MESURÉES (18/10/2026, « la vidéo doit respecter tous les critères de fluidité, de mouvement et
#    d'animation à 100 % ») — fluidite.py : (1) pixels du film, raccords du moteur exclus : aucune image figée en plein
#    mouvement, aucun saut, aucun à-coup ni secousse de caméra au-delà de ce que les animations 3D pro de référence ne
#    dépassent que 0,5 % du temps ; (2) souplesse SPARC de chaque articulation au moins égale à celle de vrais corps (CMU) ──
try:
    import fluidite as FL_
    fq_ = FL_.juge(MP4, f'{D}/fluidite.json', bande=(282, 742), coupes=FL_.coupes_du_moteur(f'{D}/tournage.json', TL))
    sq_ = FL_.souplesse(D)
    G['Q_fluidite'] = {'ok': fq_['ok'] and sq_['ok'], 'detail': {'pixels': fq_['defauts'], 'souplesse': {k: (v.get('mediane'), v.get('p10'), v['ok']) for k, v in sq_['par_articulation'].items()}}}
except Exception as ex_:
    G['Q_fluidite'] = {'ok': False, 'detail': f'non mesurée : {str(ex_)[:160]}'}

passees = sum(g['ok'] for g in G.values())
R = {'film': os.path.basename(MP4), 'portes': G, 'passees': passees, 'total': len(G), 'pourcent': round(100 * passees / len(G)), 'durees_s': DUREES,
     'juges_non_disponibles': NON_JUGES,   # JEV coupé : juges dont une question attend sa tête locale (greffe en cours)
     'verdict': 'LIVRABLE (100 %)' if passees == len(G) else 'À REPRENDRE'}
json.dump(R, open(f'{D}/qualite.json', 'w'), ensure_ascii=False, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
print(f"| Porte | Verdict | Détail |\n|---|---|---|")
for k, g in G.items():
    d_ = g['detail']
    if k == 'B_bouche':   # avis de JEV (jev_levres) : ouverte aux voyelles, fermée aux consonnes ; l'ancienne corrélation n'existe plus
        d_ = g['repliques_ok'] + ' répliques ; faibles : ' + ', '.join(
            f"{r['qui'].split()[0]} « {r['texte'][:18]}… » ({r['visage_px']} px, ouverte {min(r.get('ouverte_aux_voyelles') or [0]):.2f}, "
            f"fermée {min(r.get('fermee_aux_consonnes') or [0]):.2f})" for r in g['detail'] if not r['ok'])[:400]
    print(f"| {k} | {'✅' if g['ok'] else '❌'} | {str(d_)[:400]} |")
print(f"\n{R['verdict']} : {passees}/{len(G)} portes")
print("durées des juges (s) :", DUREES)
