# JUGE UNIQUE (20/10/2026, « je veux un seul juge pour tout pour aller vite ») : un seul passage sur l'épisode tourné en
# marionnettes, un seul verdict (« à publier » / « à corriger ») et ses raisons, chiffre à l'appui. Il remplace la batterie
# de portes et les appels JEV pour ce mode : la plupart des anciens défauts (bouche déformée, personnage qui ne colle pas au
# décor, échelle, lumière) sont réglés PAR CONSTRUCTION (bouches dessinées, même pinceau et même lumière que le décor) ; il
# reste à vérifier ce que la construction ne garantit pas :
#   A. synchro labiale : décalage bouche ↔ voix mesuré par corrélation croisée, dans la tolérance de la radiodiffusion
#      (UIT-R BT.1359 : son en avance de plus de 45 ms ou en retard de plus de 125 ms = détectable) ;
#   B. parleur lisible : la bouche de celui qui parle est dans l'image et assez grande pour se lire sur un téléphone ;
#   C. cadre : têtes entières (ni par le haut ni par les côtés) et aucun BOUT de personnage au bord (bras, demi-visage) ;
#   D. vie : aucune image figée plus d'une seconde ;
#   E. fluidité : sauts, à-coups, secousses (fluidite.juge, seuils calibrés sur les références) ;
#   F. rythme : plans par minute et durée médiane des plans dans la plage mesurée sur vos TikTok ;
#   G. lieu : chaque sketch tourné dans un lieu que son texte appelle ;
#   H. son : −14 LUFS ± 1 et crête vraie ≤ −1 dBTP (normes des plateformes), limiteur sur ≤ 5 % de la parole (voix non écrasée) ;
#   I. fichier : 1080 × 1920, 30 i/s, H.264 + AAC 48 kHz, durée > 60 s (programme de rémunération TikTok).
# python3 juge_unique.py DOSSIER_VERSION   (dans le dossier de l'épisode : timeline.json, voix/mix.wav)
import json, os, re, subprocess, sys, time
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import marionnette as M

CW, CH = 576, 460
RYTHME = (10.4, 18.4, 3.04)   # plans/min et médiane (s) mesurés sur les TikTok de l'utilisateur (grammaire_plans.py)
BOUCHE_MIN_PX = 12            # largeur de bouche dans le clip 576 px ≈ 22 px sur l'écran 1080 : lisible sur un téléphone


def _sonie(mp4):
    e = subprocess.run(['ffmpeg', '-nostats', '-i', mp4, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', e)[-1]), float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', e)[-1])


def _sonde(mp4):
    r = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', mp4], capture_output=True, text=True).stdout)
    v = next(s for s in r['streams'] if s['codec_type'] == 'video'); a = next((s for s in r['streams'] if s['codec_type'] == 'audio'), {})
    n, d = map(int, v['r_frame_rate'].split('/'))
    return dict(w=v['width'], h=v['height'], fps=n / d, vcodec=v['codec_name'], acodec=a.get('codec_name'), sr=int(a.get('sample_rate', 0)),
                duree=float(r['format']['duration']))


def _enveloppe(wav, fps, nf):
    import wave
    with wave.open(wav) as w:
        sr, n, c = w.getframerate(), w.getnframes(), w.getnchannels(); y = np.frombuffer(w.readframes(n), np.int16).astype(np.float32) / 32768
    y = y.reshape(-1, c).mean(1) if c > 1 else y; hop = sr / fps
    return np.array([np.sqrt(np.mean(y[int(i * hop):int((i + 1) * hop)] ** 2) + 1e-12) if int(i * hop) < len(y) else 0.0 for i in range(nf)])


def juge(D):
    t_dep = time.time(); T = json.load(open('timeline.json')); TG = json.load(open(f'{D}/tournage.json')); BX = json.load(open(f'{D}/boites.json'))
    fps = TG['fps']; nf = TG['images']; R = {}
    # qui parle à chaque image, et quel visème
    parle = [None] * nf; vis = np.zeros(nf)
    for L in T['lines']:
        for f in range(int(L['t0'] * fps), min(nf, int((L['t0'] + L['dur']) * fps))):
            t = f / fps - L['t0']; v = next((x['v'] for x in L.get('visemes') or [] if x['t0'] <= t < x['t1']), 'X')
            parle[f] = (L['qui'], L['sketch']); vis[f] = M.VISEMES.get(v, M.VISEMES['X'])[0]
    # la bouche RÉELLEMENT dessinée (marionnettes peintes : visème rendu, avance comprise) quand le tournage la note
    for f in range(nf):
        b = BX.get(str(f), {})
        if parle[f] is not None and parle[f][0] in b and 'ouv' in b[parle[f][0]]: vis[f] = b[parle[f][0]]['ouv']   # ouverture dessinée
        elif parle[f] is not None and parle[f][0] in b and 'vis' in b[parle[f][0]]:
            vis[f] = M.VISEMES.get(b[parle[f][0]]['vis'], M.VISEMES['X'])[0]
    # A. synchro labiale : décalage qui maximise la corrélation ouverture de bouche ↔ énergie de la voix
    env = _enveloppe('voix/mix.wav', fps, nf); m = np.array([p is not None for p in parle])
    o = (vis - vis[m].mean()) / (vis[m].std() + 1e-9); e = (env - env[m].mean()) / (env[m].std() + 1e-9)
    lags = range(-6, 7); cc = {}
    for k in lags:   # k > 0 : la bouche suit le son de k images
        a, b = (o[k:], e[:nf - k]) if k >= 0 else (o[:nf + k], e[-k:]); mm = (m[k:] if k >= 0 else m[:nf + k])
        cc[k] = float(np.corrcoef(a[mm], b[mm])[0, 1])
    kb = max(cc, key=cc.get); dec_ms = kb * 1000 / fps
    R['A_synchro_labiale'] = dict(ok=bool(-45 <= -dec_ms <= 125 and cc[kb] > cc.get(6, 0) and cc[kb] > cc.get(-6, 0)),
                                  decalage_ms=round(dec_ms, 1), correlation=round(cc[kb], 3), correlation_a_0=round(cc[0], 3),
                                  regle='UIT-R BT.1359 : son en avance ≤ 45 ms, en retard ≤ 125 ms')
    # B. parleur lisible / C. têtes entières
    vus, lisibles, n_par = 0, 0, 0; coupees = []; petites = []; bouts = []; bouts_n = {}
    decoup = TG['decoupage']
    for f in range(nf):
        b = BX.get(str(f), {}); t = f / fps
        sh = next((s for s in decoup if s[0] <= t < s[1]), decoup[-1])
        if parle[f] is not None and parle[f][0] in b:
            n_par += 1; x0, y0, x1, y1 = b[parle[f][0]]['bouche']
            dans = x0 >= 0 and x1 <= CW and y0 >= 0 and y1 <= CH; vus += dans
            if dans and (x1 - x0) >= BOUCHE_MIN_PX: lisibles += 1
            elif dans: petites.append(round(t, 2))
        sujets = [sh[4]] if isinstance(sh[4], str) else (sh[4] or [])
        for n in sujets:   # tous les plans, ouverture comprise ; par le haut ET par les côtés (ep01 p5, 12 s : Koffi coupé à gauche)
            if n in b and (b[n]['tete'][1] < 0 or b[n]['tete'][0] < 0 or b[n]['tete'][2] > CW): coupees.append(round(t, 2))
        for n, v in b.items():   # BOUT d'un voisin au bord (ep01 p5 : bras de Maman à 41 s, moitié du visage de Modou à 66,5 s)
            if n not in sujets and v.get('aire', 0) > 0.01 and not (v['tete'][0] >= 0 and v['tete'][2] <= CW and v['tete'][1] >= 0 and v['tete'][3] <= CH):
                bouts.append(round(t, 2)); bouts_n.setdefault(n, []).append(f)
    # SORTIE DE CHAMP PENDANT UN MOUVEMENT DE CAMÉRA (20/10/2026, v16 à 20,63 s : travelling avant d'ouverture, la tête de Baye
    # traverse le bord en 7 images) : au cinéma, un personnage qui quitte le cadre pendant que la caméra bouge n'est pas un
    # défaut de cadrage. Une suite d'images d'un même personnage au bord est une SORTIE si elle dure au plus 0,4 s et que sa
    # tête défile à l'écran d'au moins 4 px par image (médiane) ; tout le reste (bout immobile au bord) reste un défaut.
    sorties = []
    for n, fs in bouts_n.items():
        suites, cur = [], [fs[0]]
        for f in fs[1:]:
            if f == cur[-1] + 1: cur.append(f)
            else: suites.append(cur); cur = [f]
        suites.append(cur)
        for su in suites:
            xs = [BX[str(f)][n]['tete'] for f in su]
            v_ = float(np.median([max(abs(a[0] - b_[0]), abs(a[1] - b_[1])) for a, b_ in zip(xs, xs[1:])])) if len(xs) > 1 else 0.0
            if len(su) <= int(0.4 * fps) and v_ >= 4.0:
                sorties.append((round(su[0] / fps, 2), n, len(su)))
                for f in su: bouts.remove(round(f / fps, 2))
    R['B_parleur_lisible'] = dict(ok=bool(n_par and vus / n_par >= 0.98 and lisibles / n_par >= 0.85), dans_l_image=round(vus / max(1, n_par), 3),
                                  bouche_lisible=round(lisibles / max(1, n_par), 3), seuil_px=BOUCHE_MIN_PX,
                                  trop_petite_s=[petites[0], petites[-1]] if petites else [])
    R['C_tetes_entieres'] = dict(ok=not coupees and not bouts, images_coupees=len(coupees), premiers_s=coupees[:5],
                                 bouts_de_personnage=len(bouts), bouts_premiers_s=bouts[:5], sorties_de_champ_en_mouvement=sorties)
    # D. vie : plus longue suite d'images identiques dans le clip
    prev, run, pire, t_pire = None, 0, 0, 0.0
    for f in range(0, nf):
        g = cv2.imread(f'{D}/clip/f{f:05d}.jpg', cv2.IMREAD_REDUCED_GRAYSCALE_4)
        if g is None: continue
        g = g.astype(np.int16)
        if prev is not None and np.abs(g - prev).mean() < 0.25: run += 1
        else: run = 0
        if run > pire: pire, t_pire = run, f / fps
        prev = g
    R['D_vie'] = dict(ok=pire < fps, plus_longue_immobilite_s=round(pire / fps, 2), a_s=round(t_pire, 2))
    # E. fluidité (juge calibré du moteur)
    import fluidite as FL
    coupes = FL.coupes_du_moteur(f'{D}/tournage.json', 'timeline.json')
    # changements de pose (marionnettes peintes) : coupes voulues de l'animation à remplacement, comme les plans
    poses_ch = []
    for f in range(1, nf):
        a_, b_ = BX.get(str(f - 1), {}), BX.get(str(f), {})
        if any(n in a_ and a_[n].get('pose') != b_[n].get('pose') for n in b_ if 'pose' in b_[n]): poses_ch.append(f / fps)
    fl = FL.juge(f'{D}/film.mp4', bande=(282, 742), coupes=sorted(coupes + poses_ch))   # l'image du clip (les sous-titres karaoké changent par groupes : voulu)
    R['E_fluidite'] = dict(ok=bool(fl['ok']), defauts=fl['defauts'], changements_de_pose=len(poses_ch))
    # F. rythme
    du = np.array([s[1] - s[0] for s in decoup]); ppm_ = len(du) / (T['total'] / 60)
    R['F_rythme'] = dict(ok=bool(RYTHME[0] <= ppm_ <= RYTHME[1] and np.median(du) >= RYTHME[2]), plans_par_minute=round(ppm_, 1),
                         mediane_plan_s=round(float(np.median(du)), 2), plage=RYTHME)
    # G. lieu
    L_ = TG.get('lieux', {}); faibles = {s: v['lieu'] for s, v in L_.items() if v.get('scores') and v['scores'].get(v['lieu'], 0) <= 0}
    R['G_lieu'] = dict(ok=not faibles, lieux={s: v['lieu'] for s, v in L_.items()}, sans_appui=faibles)
    # H. son / I. fichier
    tk = f'{D}/tiktok-1080x1920.mp4'; mp = tk if os.path.isfile(tk) else f'{D}/film.mp4'
    lufs, tp = _sonie(mp); sd = _sonde(mp)
    # travail du limiteur (20/10/2026) : sonie et crête justes ne suffisent pas, une voix écrasée par le limiteur s'entend
    import sonie; so = json.load(open(f'{D}/son.json')) if os.path.isfile(f'{D}/son.json') else {}
    lim = so.get('limiteur_part_pct')
    R['H_son'] = dict(ok=bool(abs(lufs + 14) <= 1.0 and tp <= -1.0 and lim is not None and lim <= sonie.LIMITEUR_MAX_PCT), lufs=lufs, crete_dbtp=tp,
                      limiteur_part_pct=lim, limiteur_max_pct=sonie.LIMITEUR_MAX_PCT, compresseur_seuil_dbfs=so.get('compresseur_seuil_dbfs'))
    R['I_fichier'] = dict(ok=bool(sd['w'] == 1080 and sd['h'] == 1920 and abs(sd['fps'] - 30) < 0.01 and sd['vcodec'] == 'h264' and sd['acodec'] == 'aac'
                                  and sd['sr'] == 48000 and sd['duree'] > 60), **sd)
    raisons = [k for k, v in R.items() if not v['ok']]
    V = dict(verdict='à publier' if not raisons else 'à corriger', raisons=raisons, portes=R, secondes=round(time.time() - t_dep, 1))
    json.dump(V, open(f'{D}/juge-unique.json', 'w'), ensure_ascii=False, indent=1)
    return V


if __name__ == '__main__':
    print(json.dumps(juge(sys.argv[1]), ensure_ascii=False, indent=1))
