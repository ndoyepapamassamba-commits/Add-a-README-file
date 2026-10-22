# HUMOUR CONTRE LA V1, JUGÉ À CHAQUE SKETCH DE LA FABRIQUE (22/10/2026) — consigne : « toutes les vidéos devront avoir ou dépasser
# les mesures de la V1. Même l'humour ». Les 55 sketchs de la réserve n'avaient aucun duel contre la V1 et la livraison des épisodes
# de la série (E…) ne lisait pas ce score : chaque épisode restait « humour non jugé ». Juge : le modèle texte gratuit et sans clé
# déjà calibré du moteur (histoires.llm(juge=True), Pollinations) — JEV (payant) n'est pas appelé. Règle des petits modèles (« jouer
# leurs coups à l'avance ») : le juge n'est cru qu'après une question PIÈGE à réponse connue — chaque sketch de la V1 contre le même
# sketch privé de sa chute, dans les deux ordres — passée au moins 5 fois sur 6 (22/10 : 6/6 en 47 s) ; sinon « non jugé ».
# Score : part des duels gagnés contre les trois sketchs de la V1, chacun dans les deux ordres (6 duels) ; > 0,5 = plus drôle que la V1.
import threading
import histoires as H

PUBLIC = 'un public TikTok d’Abidjan (Côte d’Ivoire)'
CONSIGNE = ("Voici deux sketchs comiques, A et B, pour {pub}.\n\nSKETCH A :\n{a}\n\nSKETCH B :\n{b}\n\n"
            "Lequel fait le plus rire ce public ? Réponds par une seule lettre : A ou B.")
_PIEGE = {}; _VERROU = threading.Lock()


def _vote(a, b):
    t = H.llm(CONSIGNE.format(pub=PUBLIC, a=H.script(a), b=H.script(b)), temp=0.0, juge=True).strip().upper()
    return 'A' if t.startswith('A') else 'B' if t.startswith('B') else None


def sans_chute(v):
    """le même sketch, sa (dernière) réplique de chute remplacée par une réponse neutre : la réponse connue du piège."""
    r = [dict(x) for x in v['repliques']]
    k = max((i for i, x in enumerate(r) if x.get('chute')), default=len(r) - 1)
    r[k] = {'qui': r[k]['qui'], 'texte': "D'accord, on verra demain."}
    return {'titre': v.get('titre', ''), 'repliques': r}


def juge_fiable():
    """le juge préfère-t-il la V1 à la V1 sans chute (≥ 5 fois sur 6) ? Une fois par processus."""
    with _VERROU:
        if 'ok' not in _PIEGE:
            bons = 0
            for v in H.V17:
                try:
                    p = sans_chute(v); bons += (_vote(v, p) == 'A') + (_vote(p, v) == 'B')
                except Exception: pass
            _PIEGE.update(ok=bons >= 5, bons=bons)
        return _PIEGE['ok']


def plancher(sk):
    """part des duels gagnés contre la V1 (0–1) ou None si le juge n'est pas fiable ou injoignable (« non jugé »)."""
    if not juge_fiable(): return None
    gagnes = sur = 0
    for v in H.V17:
        for a, b, moi in ((sk, v, 'A'), (v, sk, 'B')):
            try:
                r = _vote(a, b)
            except Exception:
                continue
            if r is None: continue
            sur += 1; gagnes += r == moi
    return round(gagnes / sur, 3) if sur >= 4 else None
