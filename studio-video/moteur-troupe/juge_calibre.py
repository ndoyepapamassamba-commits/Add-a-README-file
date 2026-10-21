# CALIBRAGE DU JUGE HÉBERGÉ (21/10/2026) — le juge calibré passe par Pollinations, qui refuse des appels (402, quota), y compris
# depuis les machines GitHub : à 10 000 vidéos, c'est un point de rupture. Le même modèle (GPT-OSS 20B, Apache-2.0) servi par
# llama-server sur la machine est-il le même juge ? Mêmes épreuves que le calibrage d'origine (histoires.llm, 21/10) :
#  · chaque sketch de la V17 contre lui-même → 0,5 attendu (aucun biais de position une fois les deux ordres joués) ;
#  · chaque sketch de la V17 contre sa version sans chute → Pollinations : 0,625 en moyenne (le juge voit la chute).
#   HISTOIRES_JUGE_URL=http://127.0.0.1:8080/v1/chat/completions python3 juge_calibre.py SORTIE.json
import copy, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import histoires as H


def sans_chute(h):
    h2 = copy.deepcopy(h); h2['repliques'] = [r for r in h2['repliques'] if not r.get('chute')]; return h2


def main(sortie):
    R = {'juge': os.environ.get('HISTOIRES_JUGE_URL', H.LLM_URL), 'meme': [], 'avec_sans_chute': [], 'echecs': 0,
         'reference_pollinations': {'meme': 0.5, 'avec_sans_chute': 0.625}}
    t0 = time.time()
    for v in H.V17:
        for cle, b in (('meme', v), ('avec_sans_chute', sans_chute(v))):
            try: R[cle].append(H.duel(v, b))
            except Exception as e: R['echecs'] += 1; print('échec :', str(e)[:200], flush=True)
            R['moyennes'] = {k: round(sum(R[k]) / len(R[k]), 3) if R[k] else None for k in ('meme', 'avec_sans_chute')}
            R['secondes_par_duel'] = round((time.time() - t0) / max(1, len(R['meme']) + len(R['avec_sans_chute']) + R['echecs']), 1)
            json.dump(R, open(sortie, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); print(json.dumps(R['moyennes']), flush=True)
    return R


if __name__ == '__main__':
    main(sys.argv[1])
