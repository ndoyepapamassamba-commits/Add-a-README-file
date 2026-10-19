# DICTIONNAIRE HUMAIN DES GESTES (19/10/2026). L'utilisateur : « tu ne peux pas apprendre à toute la troupe tous les gestes
# humains ? afin que tout soit fluide » ; « il n'y a pas un dictionnaire humain existant que tu pourrais leur injecter ? » ;
# « implique REA sur le dictionnaire humain ; on publiera dès que ce sera bon, prends ton temps pour une haute qualité ».
# Source : BEAT2 (Liu et al., EMAGE, CVPR 2024 ; jeu de données sous licence Apache-2.0 d'après sa fiche Hugging Face
# H-Liu1997/BEAT2) — gestes de conversation captés à 30 i/s (annoncé : 60 h ; publié et converti ici : 46,3 h), alignés mot par mot sur la parole
# (TextGrid) et ANNOTÉS : type de chaque geste (battement, iconique, métaphorique, déictique), force et mot porté (sem).
# Démontage par REA (inspect-artifact) : archive npz = poses (N × 165, angles-axes SMPL-X : bassin, 21 articulations du corps,
# mâchoire, yeux, 2 × 15 de mains), expressions (N × 100), trans, betas, mocap_frame_rate (30).
# Le modèle de corps SMPL-X (licence non commerciale) n'est PAS utilisé : seules les ROTATIONS captées le sont, appliquées à
# notre propre squelette (arbre articulaire public, longueurs d'os standard). Nos canaux sont des angles (lever et coude de
# chaque bras, roulis / tangage / lacet de la tête et du buste…) : les longueurs exactes n'y changent rien.
# Même mesure que la capture CMU (mocap_jeu.extraire) : caméra qui suit lentement le cap du sujet, mêmes canaux, mêmes signes.
# Les fichiers bruts ne sont jamais gardés ni redistribués : chaque enregistrement est téléchargé, converti en pistes (~100 Ko),
# puis effacé ; le dictionnaire (index des gestes typés, mots, apex) reste dans ~/.cache/massamba-models/beat2-pistes/
# (1 428 enregistrements, 46,3 h, 20 locuteurs, 4 langues : 141 Mo, converti en 540 s le 19/10/2026).
#   python3 dictionnaire_humain.py essai <fichier.npz>             → pistes d'un enregistrement local (contrôle des signes)
#   python3 dictionnaire_humain.py construit [n] [en,zh,ja,es]     → télécharge, convertit, indexe (reprise automatique)
#   python3 dictionnaire_humain.py inventaire                      → gestes par type, durée, activité des bras
import io, json, math, os, re, sys, time, urllib.error, urllib.request, zlib
import numpy as np

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
FPS = 30
CACHE = os.path.expanduser(os.environ.get('BEAT2_PISTES', '~/.cache/massamba-models/beat2-pistes'))
DEPOT = 'https://huggingface.co/datasets/H-Liu1997/BEAT2'
LANGUE = os.environ.get('BEAT2_LANGUE', 'beat_english_v2.0.0')
VERSION = 2   # v2 (19/10/2026) : bras dans le plan de l'écran (bras_f, coude_f, raccourci)
# arbre articulaire SMPL-X (22 articulations du corps) et os au repos (m ; y en haut, x = gauche du sujet, z = devant)
PARENTS = [-1, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 12, 13, 14, 16, 17, 18, 19]
OS = np.array([[0, 0, 0], [.06, -.09, 0], [-.06, -.09, 0], [0, .11, -.01], [.04, -.38, 0], [-.04, -.38, 0], [0, .13, .01],
               [0, -.40, -.04], [0, -.40, -.04], [0, .05, .02], [0, -.06, .12], [0, -.06, .12], [0, .21, -.03], [.08, .12, -.01],
               [-.08, .12, -.01], [0, .09, .05], [.12, .03, -.01], [-.12, .03, -.01], [.26, 0, -.02], [-.26, 0, -.02], [.25, 0, .01],
               [-.25, 0, .01]], np.float64)
J = dict(bassin=0, hanche_g=1, hanche_d=2, thorax=9, cou=12, clav_g=13, clav_d=14, tete=15, epaule_g=16, epaule_d=17,
         coude_g=18, coude_d=19, poignet_g=20, poignet_d=21)
TYPES = {'01_beat_align': 'battement', '02_deictic_l': 'deictique', '03_deictic_m': 'deictique', '04_deictic_h': 'deictique',
         '05_iconic_l': 'iconique', '06_iconic_m': 'iconique', '07_iconic_h': 'iconique', '08_metaphoric_l': 'metaphorique',
         '09_metaphoric_m': 'metaphorique', '10_metaphoric_h': 'metaphorique', '11_semantic': 'semantique', '12_nonsense': 'sans_sens'}


def _rot(rv):
    """angles-axes (N × 3) → matrices (N × 3 × 3), formule de Rodrigues."""
    th = np.linalg.norm(rv, axis=1)[:, None, None]; k = rv / np.maximum(np.linalg.norm(rv, axis=1, keepdims=True), 1e-12)
    K = np.zeros((len(rv), 3, 3)); K[:, 0, 1], K[:, 0, 2], K[:, 1, 2] = -k[:, 2], k[:, 1], -k[:, 0]
    K[:, 1, 0], K[:, 2, 0], K[:, 2, 1] = k[:, 2], -k[:, 1], k[:, 0]
    return np.eye(3)[None] + np.sin(th) * K + (1 - np.cos(th)) * (K @ K)


def fk(poses):
    """poses (N × 165) → rotations globales G (N × 22 × 3 × 3) et positions P (N × 22 × 3), bassin à l'origine."""
    n = len(poses); L = [_rot(poses[:, 3 * j:3 * j + 3].astype(np.float64)) for j in range(22)]
    G = np.zeros((n, 22, 3, 3)); P = np.zeros((n, 22, 3))
    for j, p in enumerate(PARENTS):
        if p < 0: G[:, j] = L[j]; continue
        G[:, j] = G[:, p] @ L[j]; P[:, j] = P[:, p] + np.einsum('nij,j->ni', G[:, p], OS[j])
    return G, P


def _u(v): return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)


def _lisse(a, k):
    if k <= 1: return np.asarray(a, np.float64)
    p = k // 2; return np.convolve(np.pad(np.asarray(a, np.float64), (p, k - 1 - p), mode='edge'), np.ones(k) / k, mode='valid')


def pistes(poses, trans=None):
    """mêmes canaux que mocap_jeu.extraire (capture CMU), même repère (caméra qui suit le cap du sujet en 1,5 s)."""
    import mocap_jeu as mj
    G, P = fk(poses); n = len(poses); U = np.array([0.0, 1.0, 0.0]); R0 = np.array([1.0, 0.0, 0.0])
    cap = np.unwrap(np.arctan2((G[:, 0] @ R0)[:, 2], (G[:, 0] @ R0)[:, 0])); cap_s = _lisse(cap, int(1.5 * FPS) | 1)
    Rs = np.stack([np.cos(cap_s), np.zeros(n), np.sin(cap_s)], 1); Fs = np.stack([-np.sin(cap_s), np.zeros(n), np.cos(cap_s)], 1)
    dot = lambda a, b: np.einsum('ni,ni->n', a, b)
    ang = lambda v, a, b: np.degrees(np.arctan2(dot(v, a), dot(v, b)))
    Un = np.repeat(U[None], n, 0)
    tU = _u(G[:, J['thorax']] @ U); hU = _u(G[:, J['tete']] @ U); hL = _u(G[:, J['tete']] @ R0); tL = _u(G[:, J['thorax']] @ R0)
    v = P[:, J['thorax']] - P[:, J['bassin']]
    out = {'buste': ang(v, Rs, Un), 'buste_tangage': ang(v, Fs, Un), 'buste_lacet': -ang(tL, Fs, Rs),
           'tete': ang(hU, Rs, Un) - ang(tU, Rs, Un), 'tete_tangage': ang(hU, Fs, Un) - ang(tU, Fs, Un), 'tete_lacet': -ang(hL, Fs, Rs),
           # haussement : hauteur des ÉPAULES (bout des clavicules, comme P['lclavicle'] de la CMU) le long du buste
           'epaules': 0.5 * (dot(P[:, J['epaule_g']] - P[:, J['thorax']], tU) + dot(P[:, J['epaule_d']] - P[:, J['thorax']], tU))}
    tr = np.zeros((n, 3)) if trans is None else np.asarray(trans, np.float64)
    out['bassin_x'] = dot(tr, Rs); out['bassin_y'] = -tr[:, 1] + tr[0, 1]; out['bassin_z'] = dot(tr, Fs)
    poignet = {}
    for s, c in (('l', 'g'), ('r', 'd')):
        ep, co, po = P[:, J['epaule_' + c]], P[:, J['coude_' + c]], P[:, J['poignet_' + c]]
        f = _u(po - co); a = _u(co - ep)
        out[f'lever_{s}'] = np.degrees(np.arccos(np.clip(dot(f, -tU), -1, 1)))
        out[f'avance_{s}'] = dot(f, Fs)
        out[f'coude_{s}'] = np.degrees(np.arccos(np.clip(dot(a, -tU), -1, 1)))
        w = po - P[:, J['thorax']]; poignet[s] = np.stack([dot(w, Rs), -w[:, 1], dot(w, Fs)], 1)
        # BRAS DANS LE PLAN DE L'ÉCRAN (v2, 19/10/2026 : bras à deux segments du dessin) : angle du bras depuis la verticale
        # (0 = pendant, + = écarté du corps), angle du coude (avant-bras par rapport au bras, même sens) et raccourci de
        # l'avant-bras (longueur projetée / longueur vraie : < 1 quand la main vient vers la caméra)
        sg = 1.0 if s == 'l' else -1.0; Un_ = np.repeat(U[None], n, 0)
        ba = np.degrees(np.unwrap(np.arctan2(sg * dot(co - ep, Rs), -dot(co - ep, Un_))))
        fa = np.degrees(np.unwrap(np.arctan2(sg * dot(po - co, Rs), -dot(po - co, Un_))))
        out[f'bras_f_{s}'] = ba; out[f'coude_f_{s}'] = fa - ba
        out[f'raccourci_{s}'] = np.hypot(dot(po - co, Rs), dot(po - co, Un_)) / np.maximum(np.linalg.norm(po - co, axis=1), 1e-6)
    for k in ('buste', 'buste_tangage', 'buste_lacet', 'tete', 'tete_tangage', 'tete_lacet'):
        out[k] = np.degrees(np.unwrap(np.radians(out[k])))
    vb = np.r_[0, np.hypot(np.diff(out['bassin_x']), np.diff(out['bassin_z']))] * FPS
    out['marche'] = _lisse(vb, 15)
    apx, force = mj._apex(poignet, out['tete_tangage'])
    out['apex'] = np.asarray(apx, np.float64); out['apex_force'] = np.asarray(force, np.float64); out['n'] = np.array(n)
    return {k: np.asarray(v_, np.float32) for k, v_ in out.items()}


def lit_sem(texte):
    """annotations sémantiques BEAT2 → [{type, t0, t1, force, mot}] (gestes porteurs de sens seulement)."""
    out = []
    for l in texte.splitlines():
        c = l.strip().split('\t')
        if len(c) < 5: continue
        ty = TYPES.get(c[0], c[0])
        try: t0, t1, f = float(c[1]), float(c[2]), float(c[4])
        except ValueError: continue
        out.append({'type': ty, 't0': round(t0, 3), 't1': round(t1, 3), 'force': f, 'mot': c[5].strip() if len(c) > 5 else ''})
    return out


def lit_textgrid(texte):
    """palier « words » d'un TextGrid → [[t0, t1, mot]]."""
    out = []; blocs = re.split(r'item \[\d+\]:', texte)
    for b in blocs:
        if 'name = "words"' not in b: continue
        for m in re.finditer(r'xmin = ([\d.]+)\s*xmax = ([\d.]+)\s*text = "([^"]*)"', b):
            if m.group(3).strip(): out.append([round(float(m.group(1)), 3), round(float(m.group(2)), 3), m.group(3).strip()])
    return out


LANGUES = {'en': 'beat_english_v2.0.0', 'zh': 'beat_chinese_v2.0.0', 'ja': 'beat_japanese_v2.0.0', 'es': 'beat_spanish_v2.0.0'}


def _get(chemin, langue=LANGUE, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(f'{DEPOT}/resolve/main/{langue}/{chemin}', timeout=180) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404 or k == tries - 1: raise
            time.sleep(2 ** (k + 1))
        except Exception:
            if k == tries - 1: raise
            time.sleep(2 ** (k + 1))


def liste(langue=LANGUE, sous='smplxflame_30'):
    with urllib.request.urlopen(f'https://huggingface.co/api/datasets/H-Liu1997/BEAT2/tree/main/{langue}/{sous}', timeout=120) as r:
        return sorted(os.path.basename(x['path']) for x in json.load(r) if x['type'] == 'file')


def _index():
    f = os.path.join(CACHE, 'dictionnaire.json')
    return json.load(open(f, encoding='utf-8')) if os.path.isfile(f) else {'source': f'{DEPOT} (anglais, chinois, japonais, espagnol), Apache-2.0', 'clips': {}}


def _convertit(lg, nom):
    """un enregistrement : téléchargé en mémoire, converti en pistes + mots alignés, rien de brut gardé sur disque."""
    langue = LANGUES[lg]; cle = f'{lg}_{nom}'; sortie = os.path.join(CACHE, f'{cle}-v{VERSION}.npz')
    z = np.load(io.BytesIO(_get(f'smplxflame_30/{nom}.npz', langue)), allow_pickle=False)
    fr = int(z['mocap_frame_rate']) if 'mocap_frame_rate' in z.files else FPS; pas = max(1, round(fr / FPS))
    c = pistes(z['poses'][::pas], z['trans'][::pas] if 'trans' in z.files else None); del z
    try: mots = lit_textgrid(_get(f'textgrid/{nom}.TextGrid', langue).decode('utf-8', 'replace'))
    except Exception: mots = []
    try: sem = lit_sem(_get(f'sem/{nom}.txt', langue).decode('utf-8', 'replace'))   # annotations : anglais seulement
    except Exception: sem = []
    tmp = sortie + '.part.npz'
    np.savez_compressed(tmp, mots_t=np.asarray([m[:2] for m in mots], np.float32).reshape(-1, 2),
                        mots=np.asarray([m[2] for m in mots], dtype='U32'),
                        **{k: (v.astype(np.float16) if v.ndim and k not in ('apex', 'apex_force') else v) for k, v in c.items()})
    os.replace(tmp, sortie)
    n = int(c['n']); p = nom.split('_')
    return cle, {'langue': lg, 'locuteur': p[1], 'sorte': int(p[2]) if p[2].isdigit() else None,
                 'numero': int(p[3]) if len(p) > 3 and p[3].isdigit() else None, 'duree': round(n / FPS, 2),
                 'apex_par_s': round(len(c['apex']) / max(1.0, n / FPS), 2),
                 'bras_ptp': [round(float(np.ptp(c['lever_l'])), 1), round(float(np.ptp(c['lever_r'])), 1)],
                 'gestes': sem, 'n_mots': len(mots)}


def construit(n_max=None, langues=tuple(LANGUES), locuteurs=None, ouvriers=6, journal=print):
    """toute la bibliothèque, téléchargée et convertie en parallèle (reprise automatique : ce qui est fait n'est pas refait)."""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    os.makedirs(CACHE, exist_ok=True); I = _index(); t0 = time.time(); faits = 0; erreurs = []
    a_faire = []
    for lg in langues:
        for f in liste(LANGUES[lg]):
            nom = f[:-4]
            if not f.endswith('.npz') or (locuteurs and nom.split('_')[1] not in locuteurs): continue
            if f'{lg}_{nom}' in I['clips'] and os.path.isfile(os.path.join(CACHE, f'{lg}_{nom}-v{VERSION}.npz')): continue
            a_faire.append((lg, nom))
    a_faire = a_faire[:n_max] if n_max else a_faire
    journal(f'{len(a_faire)} enregistrements à convertir ({len(I["clips"])} déjà faits)')
    with ThreadPoolExecutor(ouvriers) as ex:
        fut = {ex.submit(_convertit, lg, nom): (lg, nom) for lg, nom in a_faire}
        for f in as_completed(fut):
            try:
                cle, info = f.result(); I['clips'][cle] = info; faits += 1
            except Exception as e:
                erreurs.append(f'{fut[f][0]}_{fut[f][1]} : {e}'); journal(erreurs[-1])
            if faits and faits % 25 == 0:
                _ecrit_index(I); journal(f'{faits}/{len(a_faire)} convertis ({time.time() - t0:.0f} s)')
    _ecrit_index(I)
    return {'convertis': faits, 'erreurs': len(erreurs), 'total': len(I['clips']), 'secondes': round(time.time() - t0)}


def _ecrit_index(I):
    f = os.path.join(CACHE, 'dictionnaire.json'); json.dump(I, open(f + '.part', 'w', encoding='utf-8'), ensure_ascii=False); os.replace(f + '.part', f)


# émotions de BEAT (readme officiel, PantoMatrix scripts/BEAT_2022/readme_beat.md) : partie « discours » (sorte paire)
# numérotée 1-118 — 0-64 neutre, 65-72 joie, 73-80 colère, 81-86 tristesse, 87-94 mépris, 95-102 surprise, 103-110 peur,
# 111-118 dégoût ; partie « conversation » (sorte impaire) : neutre, avec les temps où le locuteur ÉCOUTE son partenaire
EMOTION_BORNES = ((64, 'neutre'), (72, 'joie'), (80, 'colere'), (86, 'tristesse'), (94, 'mepris'), (102, 'surprise'),
                  (110, 'peur'), (118, 'degout'))
# jeu de la réplique → émotions jouées par les locuteurs BEAT, par préférence
JEU_EMOTION = {'accuse': ('colere', 'mepris'), 'soupcon': ('mepris', 'neutre'), 'colere': ('colere',), 'marchande': ('neutre', 'joie'),
               'rappel': ('neutre', 'colere'), 'malice': ('joie', 'mepris'), 'frime': ('joie', 'mepris'), 'camera': ('joie', 'neutre'),
               'choc': ('surprise', 'peur'), 'panique': ('peur', 'surprise'), 'rire': ('joie',), 'excuse': ('tristesse', 'neutre'),
               'innocent': ('neutre', 'surprise'), 'tristesse': ('tristesse',), 'emu': ('tristesse', 'joie'), 'joie': ('joie',),
               'boude': ('tristesse', 'mepris', 'degout'), '': ('neutre',)}
# jeu → types de gestes annotés à préférer (anglais : annotations sémantiques de BEAT2)
JEU_TYPE = {'accuse': ('deictique',), 'soupcon': ('deictique', 'metaphorique'), 'colere': ('deictique', 'battement'),
            'marchande': ('metaphorique', 'iconique'), 'rappel': ('metaphorique', 'deictique'), 'camera': ('deictique', 'iconique'),
            'frime': ('iconique', 'metaphorique'), 'malice': ('iconique', 'metaphorique'), '': ('iconique', 'metaphorique')}
CODE_TYPE = {'battement': 1, 'deictique': 2, 'iconique': 3, 'metaphorique': 4, 'semantique': 5}
_I = None; _C = {}


def emotion(info):
    if info.get('sorte') is None or info['sorte'] % 2 == 1 or info.get('numero') is None: return 'neutre'
    for b, e in EMOTION_BORNES:
        if info['numero'] <= b: return e
    return 'neutre'


def index():
    global _I
    if _I is None: _I = _index()['clips']
    return _I


def est_cle(trial): return isinstance(trial, str) and trial[:3] in ('en_', 'zh_', 'ja_', 'es_')


# PAQUET UNIQUE (19/10/2026, « produire un film entier en 1 minute pour accélérer les tests ») : un tournage lisait ~800
# fichiers d'enregistrements (52,8 s sur 261 s de préparation, profil cProfile). Les 1 428 enregistrements sont rangés une
# fois pour toutes dans un seul paquet ouvert en mémoire projetée (aucune copie) : séries image par image en float16 bout à
# bout, mots et apex à part, index des débuts ; même contenu, octet pour octet (vérifié au montage du paquet).
PAQUET = os.path.join(CACHE, f'paquet-v{VERSION}')
_P = None


def monte_paquet():
    fs = sorted(f for f in os.listdir(CACHE) if f.endswith(f'-v{VERSION}.npz'))
    cles, series, idx, mots_t, apex = [], None, {}, [], []
    blocs = []; n_tot = m_tot = a_tot = 0
    for f in fs:
        z = np.load(os.path.join(CACHE, f), allow_pickle=False); cle = f[:-len(f'-v{VERSION}.npz')]
        noms = sorted(k for k in z.files if z[k].dtype == np.float16)
        series = series or noms
        if noms != series: continue   # forme inattendue : lue à part (charge retombe sur le fichier)
        n = int(z['n']); blocs.append(np.stack([z[k] for k in series]))
        idx[cle] = [n_tot, n, m_tot, len(z['mots_t']), a_tot, len(z['apex'])]
        mots_t.append(z['mots_t'].astype(np.float32)); apex.append(np.stack([z['apex'], z['apex_force']], 1).astype(np.float32))
        n_tot += n; m_tot += len(z['mots_t']); a_tot += len(z['apex'])
    np.save(PAQUET + '-series.npy', np.concatenate(blocs, 1).astype(np.float16))
    np.save(PAQUET + '-mots.npy', np.concatenate(mots_t, 0)); np.save(PAQUET + '-apex.npy', np.concatenate(apex, 0))
    json.dump({'series': series, 'index': idx}, open(PAQUET + '.json', 'w'))
    return len(idx)


def _paquet():
    global _P
    if _P is None:
        if not os.path.isfile(PAQUET + '.json'):
            try: monte_paquet()
            except Exception as e_: print('paquet du dictionnaire non monté :', e_, flush=True); _P = False; return _P
        m = json.load(open(PAQUET + '.json'))
        _P = {'series': m['series'], 'index': m['index'], 's': np.load(PAQUET + '-series.npy', mmap_mode='r'),
              'mots': np.load(PAQUET + '-mots.npy', mmap_mode='r'), 'apex': np.load(PAQUET + '-apex.npy', mmap_mode='r')}
    return _P


def _brut(cle):
    """(séries en float32 + apex + n, mots_t) d'un enregistrement : depuis le paquet, sinon depuis son fichier."""
    P = _paquet()
    if P and cle in P['index']:
        a, n, m0, nm, a0, na = P['index'][cle]; S = P['s'][:, a:a + n]
        c = {k: np.asarray(S[i], np.float32) for i, k in enumerate(P['series'])}
        ap = np.asarray(P['apex'][a0:a0 + na]); c['apex'] = ap[:, 0].copy(); c['apex_force'] = ap[:, 1].copy(); c['n'] = np.float32(n)
        return c, np.asarray(P['mots'][m0:m0 + nm])
    z = np.load(os.path.join(CACHE, f'{cle}-v{VERSION}.npz'), allow_pickle=False)
    return {k: (z[k].astype(np.float32) if z[k].dtype == np.float16 else z[k]) for k in z.files if k not in ('mots', 'mots_t')}, z['mots_t']


def charge(cle):
    """pistes d'un enregistrement (float32) + « parole » (vrai quand le locuteur prononce un mot) + « sem_type » /
    « sem_force » (geste annoté couvrant chaque image : type, force)."""
    if cle in _C: return _C[cle]
    c, mots_t = _brut(cle)
    n = int(c['n']); t = np.arange(n) / FPS; parole = np.zeros(n, bool)
    for a, b in mots_t: parole[int(a * FPS):int(np.ceil(b * FPS))] = True
    st = np.zeros(n, np.int8); sf = np.zeros(n, np.float32)
    for g in index().get(cle, {}).get('gestes', []):
        m = (t >= g['t0']) & (t <= g['t1']) & (sf < g['force']); st[m] = CODE_TYPE.get(g['type'], 0); sf[m] = g['force']
    c['parole'] = parole; c['sem_type'] = st; c['sem_force'] = sf
    if len(_C) > 2000: _C.clear()
    _C[cle] = c
    return c


def energie_locuteurs():
    """énergie gestuelle mesurée de chaque locuteur (médianes de ses enregistrements) : apex par seconde, amplitude des bras."""
    L = {}
    for c in index().values(): L.setdefault(c['locuteur'], []).append((c['apex_par_s'], max(c['bras_ptp'])))
    return {k: {'apex_par_s': float(np.median([a for a, _ in v])), 'bras_ptp': float(np.median([b for _, b in v])), 'n': len(v)}
            for k, v in L.items()}


def doublures(nom, age=None, n=2):
    """« doublures » d'un personnage : n locuteurs BEAT2 dont il reprend le style gestuel d'un bout à l'autre de la série
    (idiolecte constant, comme un comédien), choisis de façon stable (nom) dans le tiers d'énergie MESURÉE qui convient au
    casting : enfant → les plus vifs, aîné (≥ 55 ans) → les plus posés, adulte → tiers moyen et vif."""
    E = energie_locuteurs(); ok = sorted((k for k, v in E.items() if v['n'] >= 10), key=lambda k: E[k]['apex_par_s'] * E[k]['bras_ptp'])
    if not ok: return None
    t = len(ok)
    zone = (ok[2 * t // 3:] if age is not None and age < 13 else ok[:t // 3] if age is not None and age >= 55
            else ok[t // 3:]) or ok
    h = zlib.crc32(nom.encode('utf-8')); return [zone[(h + i) % len(zone)] for i in range(min(n, len(zone)))]


def candidats(jeu='', ecoute=False, graine=0, n=40, locuteurs=None):
    """enregistrements à examiner pour une réplique : émotion du jeu (ou conversations pour l'écoute), locuteurs « doublures »
    d'abord quand ils sont donnés, tirage reproductible."""
    I = {k: c for k, c in index().items() if c.get('n_mots', 1) > 0}   # sans mots alignés, parole et silence sont inconnus
    if not I: return []
    if ecoute: pool = sorted(k for k, c in I.items() if c.get('sorte') is not None and c['sorte'] % 2 == 1)
    else:
        emos = JEU_EMOTION.get(jeu, JEU_EMOTION['']); pool = sorted(k for k, c in I.items() if emotion(c) in emos)
        if len(pool) < n: pool = sorted(I)
    rng = np.random.default_rng(graine)
    if locuteurs:
        a = [k for k in pool if I[k]['locuteur'] in locuteurs]; b = [k for k in pool if I[k]['locuteur'] not in locuteurs]
        na = min(len(a), int(round(0.75 * n)))
        tir = list(rng.choice(a, na, replace=False)) + list(rng.choice(b, min(len(b), n - na), replace=False)) if a else \
            list(rng.choice(pool, min(n, len(pool)), replace=False))
    else: tir = list(rng.choice(pool, min(n, len(pool)), replace=False))
    return [str(k) for k in tir]


def inventaire():
    I = _index(); C = I['clips']; ty = {}
    for c in C.values():
        for g in c['gestes']: ty[g['type']] = ty.get(g['type'], 0) + 1
    emo = {}
    for c in C.values(): e = emotion(c); emo[e] = emo.get(e, 0) + 1
    return {'enregistrements': len(C), 'heures': round(sum(c['duree'] for c in C.values()) / 3600, 2),
            'par_langue': {lg: sum(1 for c in C.values() if c['langue'] == lg) for lg in LANGUES},
            'locuteurs': sorted({c['locuteur'] for c in C.values()}), 'gestes_par_type': ty, 'emotions': emo,
            'apex_par_s_median': float(np.median([c['apex_par_s'] for c in C.values()])) if C else None}


if __name__ == '__main__':
    c = sys.argv[1]
    if c == 'essai':
        z = np.load(sys.argv[2], allow_pickle=False); p = pistes(z['poses'], z['trans'] if 'trans' in z.files else None)
        print({k: (round(float(np.median(v)), 2), round(float(np.ptp(v)), 1)) for k, v in p.items() if v.ndim and k not in ('apex', 'apex_force')},
              'apex', len(p['apex']))
    elif c == 'construit':
        print(json.dumps(construit(int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] != '0' else None,
                                   tuple(sys.argv[3].split(',')) if len(sys.argv) > 3 else tuple(LANGUES),
                                   journal=lambda m: print(time.strftime('%H:%M:%S'), m, flush=True)), ensure_ascii=False))
    elif c == 'inventaire': print(json.dumps(inventaire(), ensure_ascii=False, indent=1))
