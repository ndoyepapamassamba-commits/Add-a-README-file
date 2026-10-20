# SYNCHRO LABIALE MESURÉE (20/10/2026) — utilisé par tourne.py (bouche du moteur) et vérifié par outils/verif_moteur.py.
import math
import numpy as np


def avance_levres(lines, lead=0.02, borne=0.12):
    """AVANCE DES LÈVRES MESURÉE (20/10/2026, juge unique de la v16 : bouche rendue EN RETARD de 53 ms en médiane sur le son,
    22 répliques, 7 voix — porte A hors de la règle UIT-R BT.1359, son en avance ≤ 45 ms). Les instants des phonèmes (Piper,
    puis lissage du montré) tombent après l'énergie réelle de la voix. Chaque épisode mesure ce décalage lui-même : pour chaque
    réplique, corrélation entre l'ouverture visée par ses phonèmes et l'énergie de SA voix (L['env'], 100 Hz) sur ±150 ms ;
    médiane des répliques nettes (corrélation > 0,25, hors bornes) ; puis 20 ms de plus pour que la bouche devance le son, comme
    dans la parole réelle (l'articulation précède la voix). Borné à [0 ; 120 ms]. Vaut pour tous les personnages et toutes les voix.
    AVANCE_LEVRES (s) l'impose.
    → (avance en s, mesure)"""
    lags = []
    for L in lines:
        env = np.asarray(L.get('env') or [], np.float32); n = len(env)
        if n < 60 or not L.get('phonemes') or env.std() < 1e-6: continue
        o = np.zeros(n, np.float32)
        for p in L['phonemes']: o[int(p['t0'] * 100):int(math.ceil(p['t1'] * 100))] = p['open'] / 4
        if o.std() < 1e-6: continue
        cc = {k: float(np.corrcoef(*((o[k:], env[:n - k]) if k >= 0 else (o[:n + k], env[-k:])))[0, 1]) for k in range(-15, 16)}
        k = max(cc, key=cc.get)
        if cc[k] > 0.25 and abs(k) < 15: lags.append(k)
    med = float(np.median(lags)) / 100 if lags else 0.0
    return float(np.clip(med + lead, 0.0, borne)), {'retard_mesure_ms': round(med * 1000), 'repliques': len(lags)}
