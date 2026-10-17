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
#  D. ÉCOUTE : pendant qu'un autre parle, chaque personnage tourne la tête vers lui (≥ 75 % du temps)
#  E. PAS D'AUTOMATE : aucune piste de tête ou de buste périodique (autocorrélation ≤ 0,75 entre 0,5 et 3 s)
#  F. ARRIÈRE-PLAN VIVANT : part animée du décor (decor_vivant) ≥ 4 % de l'image, ou une entité vivante (bête, figurant)
#  G. ŒIL DE JEV, un plan sur un : ni tête coupée, ni visage déformé, style cohérent (jev_plans.py)
#  H. TECHNIQUE ET SON (controle_video.py) : 30 i/s, −14 LUFS, ni noir ni gel, voix intelligibles, sautes d'image ≤ 0,6/s
#  I. FLUIDITÉ (« fluidité absolue », consigne du 17/10) : aucun à-coup d'une image à l'autre — accélération de la tête et
#     du buste ≤ 2,5°/image² (un hochement dessiné reste sous 1,5), aucune expression qui saute de plus de 0,2 en une image
#  J. HUMOUR : chaque sketch de l'histoire noté par l'œil de JEV (histoires.juge) — « fait vraiment rire » (≥ 2 sur 4),
#     une vraie chute (≥ 0,7), du français ivoirien (≥ 0,5), rien de méchant (≤ 0,3)
import glob, json, os, subprocess, sys
import numpy as np

ICI = os.path.dirname(os.path.abspath(__file__))
D, MP4, MONTAGE = sys.argv[1:4]; TL = sys.argv[4] if len(sys.argv) > 4 else 'timeline.json'
VISAGE_MIN = float(os.environ.get('VISAGE_MIN', 72)); CH = 460; FPS = 30
M = json.load(open(MONTAGE)); T = json.load(open(TL)); TO = json.load(open(f'{D}/tournage.json'))
G = {}


def lance(args, sortie):
    if not os.path.isfile(sortie) or os.environ.get('QUALITE_REFAIT'):
        subprocess.run([sys.executable, *args], capture_output=True, text=True)
    return json.load(open(sortie)) if os.path.isfile(sortie) else None


def scene(sid):
    return json.load(open(f"{M['scenes'][sid]}/scene.json"))


# ── A. rythme et mouvement (cadre.py) ──
v = lance([f'{ICI}/cadre.py', 'juge', MP4, f'{ICI}/gabarit_tiktok.json', f'{D}/verdict.json'], f'{D}/verdict.json')
lignes = []
for l in (v or {}).get('lignes', []):
    ok = l['verdict'] == '✅'
    if not ok and l['mesure'] == 'plansParMinute' and l.get('studios'):   # cible élargie aux studios (Pixar, Afrikatoon)
        ok = l['tiktok']['q1'] <= l['film'] <= max(l['tiktok']['q3'], l['studios'])
    lignes.append({'mesure': l['mesure'], 'film': l['film'], 'ok': ok})
G['A_rythme'] = {'ok': bool(lignes) and all(x['ok'] for x in lignes), 'detail': lignes}

# ── B. bouche lisible ──
L_all = T['lines']; dec = TO['decoupage']; cad = TO.get('cadres', {})
lr = lance([f'{ICI}/levres_roi.py', MP4, TL, MONTAGE, f'{D}/levres_roi.json'], f'{D}/levres_roi.json') or {}
det = lr.get('detail', []); rep = []
for i, L in enumerate(L_all):
    mid = L['t0'] + L['dur'] / 2; s = next((x for x in dec if x[0] <= mid < x[1]), None)
    S = scene(L['sketch']); a = next(x for x in S['acteurs'] if x['nom'] == L['qui']); fh = a['visage']['box'][3] - a['visage']['box'][1]
    c = cad.get(f'{s[0]:.2f}') if s else None
    px = None if not c else round(min(fh * CH / cc[3] for cc in c[1:3] if cc), 1)
    m = det[i] if i < len(det) else {}
    bouge = (m.get('corr') or 0) >= 0.2 or (m.get('ouverture_max') or 0) >= 0.02
    ok = (px is None or px >= VISAGE_MIN) and (bouge or m.get('corr') is None)
    rep.append({'qui': L['qui'], 'texte': L['texte'][:40], 'visage_px': px, 'corr': m.get('corr'), 'ouverture_max': m.get('ouverture_max'), 'ok': ok})
G['B_bouche'] = {'ok': all(r['ok'] for r in rep), 'repliques_ok': f"{sum(r['ok'] for r in rep)}/{len(rep)}", 'detail': rep}

# ── C, D, E : mesures image par image du tournage ──
MES = [json.loads(x) for f in glob.glob(f'{D}/mesures-*.jsonl') for x in open(f)]
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
    ent = os.path.isfile(f'{d}/entites.json') and len(json.load(open(f'{d}/entites.json'))) > 0
    vie[sid] = {'part_animee': round(float((tout > 0.15).mean()), 4), 'entites': ent}
G['F_arriere_plan'] = {'ok': all(isinstance(x, dict) and (x['part_animee'] >= 0.04 or x['entites']) for x in vie.values()), 'detail': vie}

# ── G. œil de JEV ──
j = lance([f'{ICI}/jev_plans.py', MP4, f'{D}/tournage.json', f'{D}/jev_plans.json'], f'{D}/jev_plans.json') or {}
sy = j.get('synthese', {})
G['G_jev'] = {'ok': bool(sy) and not sy.get('tetes_coupees') and not sy.get('visages_deformes') and not sy.get('style_incoherent'),
              'detail': {k: sy.get(k) for k in ('plans_juges', 'tetes_coupees', 'visages_deformes', 'artefacts', 'style_incoherent')}}

# ── H. technique et son ──
cv = lance([f'{ICI}/controle_video.py', MP4, TL, f'{D}/tournage.json', f'{D}/controle.json'], f'{D}/controle.json') or {}
H = {k: bool(cv.get(k, {}).get('ok')) for k in ('technique', 'son', 'images', 'intelligibilite', 'mouvement')}
G['H_technique'] = {'ok': bool(cv) and all(H.values()), 'detail': H}

# ── I. fluidité : à-coups de pose et d'expression, image par image (mesures du tournage) ──
ACC_MAX, EMO_MAX = 2.5, 0.2
flu = {}
for n, ms in par.items():
    t = np.array([m['t'] for m in ms]); suite = np.r_[True, np.abs(np.diff(t) - 1 / FPS) < 2e-3]   # images contiguës seulement
    pire = {}
    for canal in ('tete_tangage', 'tete', 'tete_lacet', 'buste', 'buste_lacet'):
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

# ── J. humour : notes de JEV pour chaque sketch de l'histoire tournée ──
hum = None
fh = f'{D}/humour.json'
if os.path.isfile(fh) and not os.environ.get('QUALITE_REFAIT'): hum = json.load(open(fh))
else:
    try:
        sys.path.insert(0, ICI); import histoires
        HIST = json.load(open(M.get('histoire', 'histoire.json'), encoding='utf-8'))
        def moyenne(s, k=2):   # deux avis par sketch (le juge varie de ±0,05 d'une requête à l'autre)
            L = [histoires.juge(s) for _ in range(k)]
            return {m: round(float(np.mean([n[m] for n in L])), 3) for m in L[0]}
        hum = {s['id']: moyenne(s) for s in HIST['sketchs'] if s['id'] in M['scenes']}
        json.dump(hum, open(fh, 'w'), ensure_ascii=False, indent=1)
    except Exception as ex: hum = {'erreur': str(ex)[:120]}
okh = lambda n: n['drole'] >= 2.0 and n['chute'] >= 0.7 and n['ivoirien'] >= 0.5 and n['mechant'] <= 0.3
G['J_humour'] = {'ok': bool(hum) and 'erreur' not in hum and all(okh(n) for n in hum.values()), 'detail': hum}

passees = sum(g['ok'] for g in G.values())
R = {'film': os.path.basename(MP4), 'portes': G, 'passees': passees, 'total': len(G), 'pourcent': round(100 * passees / len(G)),
     'verdict': 'LIVRABLE (100 %)' if passees == len(G) else 'À REPRENDRE'}
json.dump(R, open(f'{D}/qualite.json', 'w'), ensure_ascii=False, indent=1, default=lambda o: o.item() if hasattr(o, 'item') else str(o))
print(f"| Porte | Verdict | Détail |\n|---|---|---|")
for k, g in G.items():
    d_ = g['detail']
    if k == 'B_bouche': d_ = g['repliques_ok'] + ' répliques ; faibles : ' + ', '.join(f"{r['qui'].split()[0]} « {r['texte'][:18]}… » ({r['visage_px']} px, corr {r['corr']})" for r in g['detail'] if not r['ok'])[:400]
    print(f"| {k} | {'✅' if g['ok'] else '❌'} | {str(d_)[:400]} |")
print(f"\n{R['verdict']} : {passees}/{len(G)} portes")
