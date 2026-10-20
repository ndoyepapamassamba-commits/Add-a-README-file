# CACHE DISQUE DES PRÉPARATIONS (18/10/2026) — « réduire drastiquement le temps de production pour aller vite ». Profil du
# tournage (120 images de la cour, un processus) : 52 s de rendu mais 87 s de PRÉPARATION refaite à chaque version alors que
# ses entrées ne changent pas (enveloppes du squelette 21 s, bibliothèques de visages 15 s, ombres peintes 15 s, linge par
# SAM 12,5 s, greffe des visages 9,6 s…). Chaque étape lourde est mémorisée sur disque, clé = contenu EXACT de ses entrées
# (octets des images, points, réglages) + source du module qui la calcule (+ modules déclarés) : une image, un réglage ou
# une ligne de code changés → recalcul ; rien d'approximé. Une entrée qu'on ne sait pas hacher de façon sûre (objet opaque)
# → pas de cache, calcul direct. MEMO=0 désactive tout.
#   import memo ; r = memo.memo(fonction, *args, _deps=('autre_module.py',), **kw)
import hashlib, os, pickle, sys, time

RACINE = os.path.expanduser(os.environ.get('MEMO_CACHE', '~/.cache/massamba-memo'))
ICI = os.path.dirname(os.path.abspath(__file__))
_SRC = {}
STATS = {'touche': 0, 'calcule': 0, 'gagne_s': 0.0}


class Opaque(Exception):
    pass


def _hache(x, h):
    import numpy as np
    if x is None or isinstance(x, (bool, int, float, str, bytes)):
        h.update(type(x).__name__.encode()); h.update(repr(x).encode() if not isinstance(x, bytes) else x)
    elif isinstance(x, np.ndarray):
        h.update(f'nd{x.dtype}{x.shape}'.encode()); h.update(np.ascontiguousarray(x).tobytes())
    elif isinstance(x, (np.generic,)):
        h.update(repr(x.item()).encode())
    elif isinstance(x, dict):
        h.update(b'{')
        for k in sorted(x, key=repr): _hache(k, h); _hache(x[k], h)
        h.update(b'}')
    elif isinstance(x, (list, tuple)):
        h.update(b'[' if isinstance(x, list) else b'(')
        for v in x: _hache(v, h)
        h.update(b']')
    else:
        raise Opaque(type(x).__name__)


def _source(f):
    p = f if os.path.isabs(f) else os.path.join(ICI, f)
    if p not in _SRC: _SRC[p] = hashlib.sha1(open(p, 'rb').read()).hexdigest() if os.path.isfile(p) else 'absent'
    return _SRC[p]


def dossier(d):
    """empreinte d'un dossier d'entrée (noms, tailles, dates) — pour les étapes qui lisent des fichiers."""
    L = []
    for r, _, fs in os.walk(d):
        for f in sorted(fs):
            st = os.stat(os.path.join(r, f)); L.append((os.path.relpath(os.path.join(r, f), d), st.st_size, st.st_mtime_ns))
    return sorted(L)


def memo(fn, *args, _deps=(), _cle=None, _fonction_seule=False, **kw):
    if os.environ.get('MEMO') == '0': return fn(*args, **kw)
    h = hashlib.sha1()
    try:
        h.update(fn.__qualname__.encode())
        if _fonction_seule:   # fonction d'un gros module souvent modifié (tourne.py) : sa seule source
            import inspect
            h.update(hashlib.sha1(inspect.getsource(fn).encode()).hexdigest().encode())
        else:
            h.update(_source(sys.modules[fn.__module__].__file__).encode())
        for d_ in _deps: h.update(_source(d_).encode())
        _hache(_cle if _cle is not None else (args, kw), h)
    except (Opaque, KeyError, AttributeError, TypeError):
        return fn(*args, **kw)
    f = f'{RACINE}/{fn.__qualname__}-{h.hexdigest()[:24]}.pkl'
    if os.path.isfile(f):
        try:
            with open(f, 'rb') as fh: r, duree = pickle.load(fh)
            STATS['touche'] += 1; STATS['gagne_s'] += duree; os.utime(f)
            return r
        except Exception:
            pass
    t0 = time.time(); r = fn(*args, **kw); duree = time.time() - t0; STATS['calcule'] += 1
    try:
        os.makedirs(RACINE, exist_ok=True); tmp = f'{f}.{os.getpid()}.tmp'
        with open(tmp, 'wb') as fh: pickle.dump((r, duree), fh, protocol=5)
        os.replace(tmp, f)
        _borne()
    except Exception:
        try: os.remove(tmp)
        except Exception: pass
    return r


def _borne(go=float(os.environ.get('MEMO_GO', 1.5))):
    """cache borné : au-delà de MEMO_GO Go, les entrées les moins récemment servies partent d'abord."""
    E = [(os.path.getmtime(p), os.path.getsize(p), p) for p in (os.path.join(RACINE, f) for f in os.listdir(RACINE)) if p.endswith('.pkl')]
    tot = sum(e[1] for e in E)
    for _, s, p in sorted(E):
        if tot <= go * 1e9: break
        os.remove(p); tot -= s
