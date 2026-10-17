# LE CADRE « À LA MESURE DE VOS TIKTOK » (17/10/2026) — le moteur se mesure toujours contre les vidéos de l'utilisateur
# (réalisées avec Grok) et contre l'animation 3D des studios (Pixar, Illumination), avec les MÊMES instruments :
# blender/film/measure.ts (rythme, mouvement, part de l'image qui bouge, secondes figées — le code de « Analyser une
# vidéo » dans l'app) et mesure2.py (caméra séparée du jeu des personnages, sautes, régularité).
#   python3 cadre.py gabarit gabarit_tiktok.json vos_tiktok/*.mp4 -- studios/*.mp4   → fourchettes de référence (chiffres seuls)
#   python3 cadre.py juge film.mp4 [gabarit_tiktok.json] [verdict.json]              → tableau film / TikTok / studios
# Le gabarit ne contient que des nombres (aucune image), il peut vivre dans le dépôt.
import json, os, subprocess, sys
import numpy as np

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
# sens : 'bande' = viser la fourchette de vos TikTok ; 'haut' = au moins votre quart bas ; 'bas' = au plus votre quart haut
METRIQUES = [
    ('plansParMinute', 'Plans par minute', 'bande', '{:.1f}'),
    ('planMedianS', "Durée médiane d'un plan (s)", 'bande', '{:.1f}'),
    ('mouvement', "Mouvement de l'image", 'haut', '{:.4f}'),
    ('couverture', "Part de l'image qui bouge", 'haut', '{:.0%}'),
    ('figeesParMinute', 'Secondes figées par minute', 'bas', '{:.1f}'),
    ('camera', 'Mouvement de caméra (px/image)', 'haut', '{:.2f}'),
    ('jeuVivant', 'Jeu vivant (% de l’image)', 'haut', '{:.1f}'),
    ('jeu', 'Amplitude du jeu (px/image)', 'haut', '{:.2f}'),
    ('sautes', 'Sautes par seconde', 'bas', '{:.2f}'),
]


def mesurer(fichiers):
    """Les deux instruments sur chaque vidéo → {nom: {métrique: valeur}}."""
    fichiers = [os.path.abspath(f) for f in fichiers]   # measure.ts tourne depuis la racine : chemins absolus
    out = subprocess.run(['npx', 'tsx', os.path.join(RACINE, 'blender/film/measure.ts'), *fichiers], cwd=RACINE,
                         capture_output=True, text=True, check=True).stdout
    res = {}
    for ln in out.splitlines():
        if not ln.startswith('{'): continue
        m = json.loads(ln); s = max(1e-6, m['seconds'])
        res[m['file']] = {'secondes': m['seconds'], 'plansParMinute': m['shotsPerMin'], 'planMedianS': m['shotMedianS'],
                          'mouvement': m['motion'], 'couverture': m['coverage'], 'figeesParMinute': m['frozenS'] * 60 / s}
    for f in fichiers:
        j = subprocess.run([sys.executable, os.path.join(ICI, 'mesure2.py'), f, '0', '1', 'json'], capture_output=True,
                           text=True, check=True).stdout.strip().splitlines()[-1]
        m = json.loads(j); res.setdefault(os.path.basename(f), {}).update({k: m[k] for k in ('camera', 'jeuVivant', 'jeu', 'sautes')})
    return res


def fourchettes(mesures):
    v = list(mesures.values()); g = {}
    for k, *_ in METRIQUES:
        a = np.array([x[k] for x in v if k in x], float)
        g[k] = {'q1': round(float(np.percentile(a, 25)), 5), 'mediane': round(float(np.median(a)), 5), 'q3': round(float(np.percentile(a, 75)), 5)}
    return g


def verdict(val, ref, sens):
    if sens == 'bande': return '✅' if ref['q1'] <= val <= ref['q3'] else ('⬇ trop' if val > ref['q3'] else '⬆ trop peu')
    if sens == 'haut': return '✅' if val >= ref['q1'] else '⬆ trop peu'
    return '✅' if val <= ref['q3'] else '⬇ trop'


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'gabarit':
        dest = sys.argv[2]; rest = sys.argv[3:]
        tik, stu = (rest[:rest.index('--')], rest[rest.index('--') + 1:]) if '--' in rest else (rest, [])
        mt = mesurer(tik); ms = mesurer(stu) if stu else {}
        G = {'date': '17/10/2026', 'source': f'{len(mt)} TikTok de l’utilisateur (Grok) ; {len(ms)} extraits de studios 3D',
             'tiktok': fourchettes(mt), 'studios': fourchettes(ms) if ms else None, 'detail': {'tiktok': mt, 'studios': ms}}
        json.dump(G, open(dest, 'w'), ensure_ascii=False, indent=1)
        print(f'gabarit écrit : {dest}')
    elif cmd == 'juge':
        film = sys.argv[2]; gab = sys.argv[3] if len(sys.argv) > 3 else os.path.join(ICI, 'gabarit_tiktok.json')
        G = json.load(open(gab)); m = list(mesurer([film]).values())[0]; lignes = []; ok = 0
        print(f"| Mesure | Ce film | Vos TikTok (quart bas – médiane – quart haut) | Studios 3D (médiane) | Verdict |\n|---|---|---|---|---|")
        for k, nom, sens, fmt in METRIQUES:
            r = G['tiktok'][k]; s = G['studios'][k]['mediane'] if G.get('studios') else None; v = verdict(m[k], r, sens); ok += v == '✅'
            lignes.append({'mesure': k, 'film': m[k], 'tiktok': r, 'studios': s, 'verdict': v})
            print(f"| {nom} | {fmt.format(m[k])} | {fmt.format(r['q1'])} – {fmt.format(r['mediane'])} – {fmt.format(r['q3'])} | {fmt.format(s) if s is not None else '—'} | {v} |")
        print(f'\n{ok}/{len(METRIQUES)} mesures à la mesure de vos TikTok')
        if len(sys.argv) > 4: json.dump({'film': os.path.basename(film), 'mesures': m, 'lignes': lignes, 'reussies': ok, 'total': len(METRIQUES)}, open(sys.argv[4], 'w'), ensure_ascii=False, indent=1)
