# DICTIONNAIRE HUMAIN DU VISAGE (19/10/2026). L'utilisateur : « les expressions du visage et les doigts de BEAT2 ne sont pas
# encore exploités […] continue sur tout le reste ». Démontage d'une archive BEAT2 : la mâchoire et les yeux y sont presque
# immobiles (écart-type ≈ 0,5°) et le visage n'y est donné qu'en 100 coefficients FLAME, illisibles sans le modèle FLAME
# (versions 2017–2023 réservées à la recherche non commerciale ; seule FLAME 2023 Open est sous CC-BY-4.0, derrière une
# inscription). BEAT (v1, même équipe, Apache-2.0 d'après sa fiche Hugging Face H-Liu1997/BEAT) a capté le visage en
# 52 coefficients ARKit NOMMÉS à 60 i/s (sourcils, sourire, regard, mâchoire, paupières), alignés mot par mot (TextGrid) :
# lisibles tels quels, aucun modèle de visage nécessaire. Chaque enregistrement est téléchargé en mémoire, réduit à quelques
# pistes à 30 i/s, puis effacé ; seules les pistes restent (~50 Ko) dans ~/.cache/massamba-models/beat1-visage/.
#   python3 visage_humain.py construit [n] → télécharge et convertit (reprise automatique)
#   python3 visage_humain.py normes        → normes humaines du visage pendant la parole et l'écoute
import io, json, os, re, sys, time, urllib.error, urllib.request
import numpy as np

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
FPS = 30
CACHE = os.path.expanduser(os.environ.get('BEAT1_VISAGE', '~/.cache/massamba-models/beat1-visage'))
DEPOT = 'https://huggingface.co/datasets/H-Liu1997/BEAT/resolve/main/beat_english_v0.2.1/beat_english_v0.2.1'
API = 'https://huggingface.co/api/datasets/H-Liu1997/BEAT/tree/main/beat_english_v0.2.1/beat_english_v0.2.1'
VERSION = 1
# pistes gardées (moyenne gauche / droite) : ce que le visage dessiné peut jouer
PISTES = {'sourcils_haut': ['browInnerUp', 'browOuterUpLeft', 'browOuterUpRight'], 'sourcils_bas': ['browDownLeft', 'browDownRight'],
          'sourire': ['mouthSmileLeft', 'mouthSmileRight'], 'machoire': ['jawOpen'], 'cligne': ['eyeBlinkLeft', 'eyeBlinkRight'],
          'plisse': ['eyeSquintLeft', 'eyeSquintRight'], 'ecarquille': ['eyeWideLeft', 'eyeWideRight']}


def _get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=180) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404 or k == tries - 1: raise
            time.sleep(2 ** (k + 1))
        except Exception:
            if k == tries - 1: raise
            time.sleep(2 ** (k + 1))


def pistes(d):
    """JSON ARKit de BEAT (noms + images à 60 i/s) → pistes à 30 i/s, plus le regard (x : + vers la droite du sujet,
    y : + vers le haut), en coefficients 0..1."""
    noms = d['names']; W = np.array([f['weights'] for f in d['frames']], np.float32); t = np.array([f['time'] for f in d['frames']], np.float64)
    tt = np.arange(0, t[-1], 1.0 / FPS); col = lambda n: W[:, noms.index(n)] if n in noms else np.zeros(len(W), np.float32)
    out = {k: np.interp(tt, t, np.mean([col(n) for n in v], 0)) for k, v in PISTES.items()}
    # regard : œil gauche du sujet vers l'extérieur = sa gauche ; œil droit vers l'intérieur = sa gauche aussi
    gx = 0.5 * ((col('eyeLookOutLeft') - col('eyeLookInLeft')) + (col('eyeLookInRight') - col('eyeLookOutRight')))
    gy = 0.5 * ((col('eyeLookUpLeft') + col('eyeLookUpRight')) - (col('eyeLookDownLeft') + col('eyeLookDownRight')))
    out['regard_x'] = np.interp(tt, t, -gx); out['regard_y'] = np.interp(tt, t, gy)
    return {k: np.asarray(v, np.float32) for k, v in out.items()}


def _convertit(locuteur, nom):
    os.makedirs(CACHE, exist_ok=True); sortie = os.path.join(CACHE, f'{nom}-v{VERSION}.npz')
    d = json.loads(_get(f'{DEPOT}/{locuteur}/{nom}.json')); c = pistes(d); del d
    try:
        import dictionnaire_humain as dh
        mots = dh.lit_textgrid(_get(f'{DEPOT}/{locuteur}/{nom}.TextGrid').decode('utf-8', 'replace'))
    except Exception: mots = []
    tmp = sortie + '.part.npz'
    np.savez_compressed(tmp, mots_t=np.asarray([m[:2] for m in mots], np.float32).reshape(-1, 2), mots=np.asarray([m[2] for m in mots], dtype='U32'),
                        **{k: v.astype(np.float16) for k, v in c.items()})
    os.replace(tmp, sortie)
    n = len(c['sourire']); p = nom.split('_')
    return nom, {'locuteur': p[1], 'sorte': int(p[2]) if p[2].isdigit() else None, 'numero': int(p[3]) if len(p) > 3 and p[3].isdigit() else None,
                 'duree': round(n / FPS, 2), 'n_mots': len(mots)}


def construit(n_max=360, ouvriers=6, journal=print):
    """n_max lectures réparties sur les 30 locuteurs + toutes leurs conversations (reprise automatique)."""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    os.makedirs(CACHE, exist_ok=True); fi = os.path.join(CACHE, 'index.json')
    I = json.load(open(fi)) if os.path.isfile(fi) else {'source': 'BEAT v1 (H-Liu1997/BEAT, anglais), Apache-2.0', 'clips': {}}
    with urllib.request.urlopen(API, timeout=120) as r: locs = sorted(os.path.basename(x['path']) for x in json.load(r) if x['type'] == 'directory')
    par = max(1, n_max // len(locs)); taches = []
    for l in locs:
        with urllib.request.urlopen(f'{API}/{l}', timeout=120) as r:
            noms = sorted(os.path.basename(x['path'])[:-5] for x in json.load(r) if x['path'].endswith('.json'))
        # lectures (sorte 0) échantillonnées ; TOUTES les conversations (sorte 1) : seules à montrer une vraie écoute
        lect = [n for n in noms if n.split('_')[2] != '1']; conv = [n for n in noms if n.split('_')[2] == '1']
        pas = max(1, len(lect) // par)
        taches += [(l, n) for n in lect[::pas][:par] + conv if n not in I['clips'] or not os.path.isfile(os.path.join(CACHE, f'{n}-v{VERSION}.npz'))]
    journal(f'{len(taches)} enregistrements à convertir ({len(I["clips"])} déjà faits)'); t0 = time.time(); err = 0
    with ThreadPoolExecutor(ouvriers) as ex:
        fs = [ex.submit(_convertit, l, n) for l, n in taches]
        for k, f in enumerate(as_completed(fs)):
            try: n, info = f.result(); I['clips'][n] = info
            except Exception as e: err += 1; journal(f'  erreur : {str(e)[:120]}')
            if (k + 1) % 25 == 0:
                json.dump(I, open(fi, 'w')); journal(f'{k + 1}/{len(taches)} convertis ({time.time() - t0:.0f} s)')
    json.dump(I, open(fi, 'w'))
    return {'convertis': len(I['clips']), 'erreurs': err, 'secondes': round(time.time() - t0)}


_C = {}


def index():
    fi = os.path.join(CACHE, 'index.json')
    return json.load(open(fi))['clips'] if os.path.isfile(fi) else {}


def charge(nom):
    if nom in _C: return _C[nom]
    z = np.load(os.path.join(CACHE, f'{nom}-v{VERSION}.npz'), allow_pickle=False)
    c = {k: z[k].astype(np.float32) for k in z.files if k not in ('mots', 'mots_t')}
    n = len(c['sourire']); parole = np.zeros(n, bool)
    for a, b in z['mots_t']: parole[int(a * FPS):int(np.ceil(b * FPS))] = True
    c['parole'] = parole
    # haussements de sourcils : pics de la piste au-dessus de sa ligne de base glissante (2 s), d'au moins SEUIL_HAUSSE
    s = c['sourcils_haut']; c['hausse'] = np.clip(s - _base_glissante(s, 2 * FPS + 1), 0, None)   # vectorisé (0,3 s → 0,01 s par minute)
    h_ = c['hausse']; pics = (np.flatnonzero((h_[1:-1] >= SEUIL_HAUSSE) & (h_[1:-1] >= h_[:-2]) & (h_[1:-1] > h_[2:])) + 1).tolist()
    fus = []
    for i in pics:   # un haussement = un pic ; deux pics à moins de 0,4 s n'en font qu'un
        if fus and i - fus[-1] < int(0.4 * FPS):
            if c['hausse'][i] > c['hausse'][fus[-1]]: fus[-1] = i
        else: fus.append(i)
    c['apex'] = np.asarray(fus, np.float64)
    if len(_C) > 300: _C.clear()
    _C[nom] = c
    return c


SEUIL_HAUSSE = 0.12   # coefficient ARKit au-dessus de la ligne de base : haussement visible (mesuré sur la normes())


# ── LE JEU DU VISAGE DU MÊME ACTEUR, AU MÊME INSTANT (19/10/2026) — référence de jeu seulement : le personnage reste dessiné
# (sa propre bibliothèque d'expressions dessinées) ; l'acteur capté ne donne que l'instant et la force des mouvements. Mesure : un enregistrement BEAT2 « en_<id> » et l'enregistrement
# BEAT v1 « <id> » partagent la même horloge (6 enregistrements sur 6 : décalage 0 image, parole et silences identiques à
# 100 %). Quand le corps d'une réplique vient d'une prise BEAT2 recalée sur nos syllabes (mocap_jeu.couche, rangs), le
# visage est lu dans la MÊME prise aux MÊMES rangs : sourcils et sourire du même humain que les gestes et la tête.
PLEIN_HAUSSE = 0.5    # haussement ARKit (au-dessus de la base glissante) joué à pleine commande « haussement » du dessin ; un haussement
                      # net (0,2 à 0,3 ARKit) donne 0,4 à 0,6 : le dessin animé exagère un peu (comme MARGE_DESSIN de la tête)
PLEIN_SOURIRE = 0.6   # sourire ARKit au-dessus du sourire médian de la prise, joué à pleine « joie »


def _base_glissante(x, k, q=20):
    """centile q sur une fenêtre glissante de k images (ligne de base des sourcils)."""
    n = len(x); h = k // 2; xp = np.pad(x, (h, h), mode='edge')
    from numpy.lib.stride_tricks import sliding_window_view
    return np.percentile(sliding_window_view(xp, k)[:n], q, axis=1).astype(np.float32)


def assure(cle):
    """enregistrement BEAT v1 converti (téléchargé à la demande) ; cle BEAT2 « en_<id> » ou BEAT v1 « <id> »."""
    nom = cle[3:] if cle.startswith('en_') else cle
    if os.path.isfile(os.path.join(CACHE, f'{nom}-v{VERSION}.npz')): return nom
    if cle.startswith(('zh_', 'ja_', 'es_')): return None   # visage capté pour l'anglais seulement (BEAT v1 anglais)
    try: _convertit(nom.split('_')[0], nom); return nom
    except Exception: return None


def pistes_visage(c):
    """→ (haussement 0..1, sourire 0..1) par image de la prise entière."""
    if 'jeu_h' not in c:
        s = c['sourcils_haut']; c['jeu_h'] = np.clip((s - _base_glissante(s, 2 * FPS + 1)) / PLEIN_HAUSSE, 0, 1).astype(np.float32)
        m = c['sourire']; c['jeu_s'] = np.clip((m - float(np.median(m)) - 0.1) / PLEIN_SOURIRE, 0, 1).astype(np.float32)
    return c['jeu_h'], c['jeu_s']


def fenetre(cle, rangs):
    """visage de la prise cle aux rangs (images à 30 i/s, fractionnaires) → {'haussement', 'sourire'} ou None."""
    nom = assure(cle)
    if nom is None: return None
    c = charge(nom); h, s = pistes_visage(c); r = np.clip(np.asarray(rangs, np.float64), 0, len(h) - 1.001)
    i = np.floor(r).astype(int); f = r - i; j = np.minimum(i + 1, len(h) - 1)
    return {'haussement': (h[i] * (1 - f) + h[j] * f).astype(np.float32), 'sourire': (s[i] * (1 - f) + s[j] * f).astype(np.float32)}


def segment(locuteurs, nf, graine=0, parole=False):
    """visage d'un humain qui ÉCOUTE (parole=False : silences) ou qui PARLE (parole=True) pendant nf images, pris dans les
    conversations BEAT v1 d'un des locuteurs donnés (doublures du personnage), sinon de n'importe qui ; segments d'au
    moins 2 s recousus bout à bout, fondus sur 0,3 s."""
    I = index(); rng = np.random.default_rng(graine)
    conv = sorted(k for k, i in I.items() if i.get('sorte') == 1 and (not locuteurs or i['locuteur'] in locuteurs)) or \
        sorted(k for k, i in I.items() if i.get('sorte') == 1)
    if not conv: return None
    out = {'haussement': np.zeros(nf, np.float32), 'sourire': np.zeros(nf, np.float32)}; i = 0; essais = 0; fond = int(0.3 * FPS)
    while i < nf and essais < 50:
        essais += 1; c = charge(conv[int(rng.integers(len(conv)))]); h, s = pistes_visage(c); sil = c['parole'].copy() if parole else ~c['parole']
        if parole:   # la parole d'un orateur : les blancs entre deux mots (< 0,4 s) n'interrompent pas le segment
            g_ = np.flatnonzero(np.diff(np.r_[0, sil.astype(np.int8), 0]))
            for a_, b_ in zip(g_[1::2][:-1], g_[2::2]):
                if b_ - a_ < int(0.4 * FPS): sil[a_:b_] = True
        seg = []; k = 0
        while k < len(sil):   # segments d'au moins 2 s
            if sil[k]:
                j = k
                while j < len(sil) and sil[j]: j += 1
                if j - k >= 2 * FPS: seg.append((k, j))
                k = j
            else: k += 1
        if not seg: continue
        a, b = seg[int(rng.integers(len(seg)))]; n = min(b - a, nf - i)
        w = np.ones(n, np.float32)
        if i > 0: w[:min(fond, n)] = np.linspace(0, 1, min(fond, n))
        out['haussement'][i:i + n] = np.maximum(out['haussement'][i:i + n] * (1 - w), h[a:a + n] * w)
        out['sourire'][i:i + n] = np.maximum(out['sourire'][i:i + n] * (1 - w), s[a:a + n] * w)
        i += n
    return out


def haussements(h, seuil=0.2 / PLEIN_HAUSSE, ecart=0.4):
    """apex des haussements d'une piste « haussement » (0..1) au-dessus de seuil (≈ 0,2 ARKit), fusionnés à moins de ecart s."""
    pics = [i for i in range(1, len(h) - 1) if h[i] >= seuil and h[i] >= h[i - 1] and h[i] > h[i + 1]]; fus = []
    for i in pics:
        if fus and i - fus[-1] < int(ecart * FPS):
            if h[i] > h[fus[-1]]: fus[-1] = i
        else: fus.append(i)
    return fus


def normes(n=None):
    """normes humaines du visage, parole et écoute séparées : haussements de sourcils par minute, sourire, regard détourné."""
    I = index(); cles = sorted(I)[:n] if n else sorted(I); R = {'parole': {'s': 0, 'hausses': 0, 'sourire': [], 'regard': [], 'clignes': 0},
                                                                    'ecoute': {'s': 0, 'hausses': 0, 'sourire': [], 'regard': [], 'clignes': 0}}
    for k in cles:
        c = charge(k); p = c['parole']
        for nom_, m in (('parole', p), ('ecoute', ~p)):
            r = R[nom_]; r['s'] += m.sum() / FPS; r['hausses'] += sum(1 for a in c['apex'] if m[int(a)])
            r['sourire'] += list(c['sourire'][m]); r['regard'] += list(np.hypot(c['regard_x'][m], c['regard_y'][m]))
            cl = c['cligne'] > 0.5; r['clignes'] += int(((cl[1:] & ~cl[:-1]) & m[1:]).sum())
    out = {}
    for nom_, r in R.items():
        mn = max(1e-6, r['s'] / 60)
        out[nom_] = {'minutes': round(mn, 1), 'haussements_par_min': round(r['hausses'] / mn, 1), 'clignements_par_min': round(r['clignes'] / mn, 1),
                     'sourire_median': round(float(np.median(r['sourire'])), 3), 'sourire_p90': round(float(np.percentile(r['sourire'], 90)), 3),
                     'regard_median': round(float(np.median(r['regard'])), 3), 'regard_p90': round(float(np.percentile(r['regard'], 90)), 3)}
    return out


if __name__ == '__main__':
    c = sys.argv[1] if len(sys.argv) > 1 else 'normes'
    if c == 'construit': print(json.dumps(construit(int(sys.argv[2]) if len(sys.argv) > 2 else 360), ensure_ascii=False))
    elif c == 'normes': print(json.dumps(normes(), ensure_ascii=False, indent=1))
