#!/usr/bin/env python3
"""PORTE DE QUALITÉ — un film ne sort que s'il tient les standards :
  • technique : toutes les images, image = son (écart ≤ 40 ms), aucune image figée hors réaction, aucun saut de
    lumière hors coupe, volume au standard des plateformes (-14 LUFS ± 1, crête ≤ -0,5 dBFS) ;
  • rythme TikTok de la chaîne : chaque mesure (durée, plans/min, durée d'un plan, mouvement, part qui bouge, secondes
    figées, scintillement) dans la fourchette de VOS vidéos (tiktok_reference.json, même code de mesure) — secondes
    figées et scintillement n'ont qu'un plafond (moins = mieux), la part qui bouge peut dépasser la chaîne de 50 %
    (le monde vivant demandé) ;
  • accroche : premier mot dans la première demi-seconde, un texte d'accroche à l'écran.

  python3 scripts/blenderfilm/gate.py film1/film.mp4      →  film1/film.gate.json (+ verdict)
"""
import json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
# Measures where lower is better (a ceiling only) and the ones the living world is allowed to exceed (factor on the max).
ONE_SIDED = ('frozenS', 'flicker')
LIVING = {'coverage': 1.5}


def measure(mp4):
    npx = shutil.which('npx')
    if not npx:
        return None
    r = subprocess.run([npx, 'tsx', os.path.join(HERE, 'measure.ts'), mp4], capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(HERE)))
    line = next((l for l in r.stdout.splitlines() if l.startswith('{')), None)
    return json.loads(line) if line else None


def main():
    mp4 = os.path.abspath(sys.argv[1])
    base = os.path.splitext(mp4)[0]
    qa = json.load(open(base + '.qa.json'))
    plan_path = os.path.join(os.path.dirname(mp4), 'plan.json')
    plan = json.load(open(plan_path)) if os.path.isfile(plan_path) else {}
    ref = json.load(open(os.path.join(HERE, 'tiktok_reference.json')))
    checks = []

    def check(name, ok, value, want):
        checks.append({'check': name, 'ok': bool(ok), 'value': value, 'want': want})

    check('toutes les images', qa['frames_encoded'] == qa['frames_expected'], f"{qa['frames_encoded']}/{qa['frames_expected']}", 'toutes')
    check('image = son', qa['av_gap_ms'] <= 40, f"{qa['av_gap_ms']} ms", '≤ 40 ms')
    check('sauts de lumière hors coupe', qa['brightness_jumps_outside_cuts'] == 0, qa['brightness_jumps_outside_cuts'], '0')
    if qa.get('loudness_lufs') is not None:
        check('volume (LUFS intégré)', abs(qa['loudness_lufs'] + 14) <= 1.0, qa['loudness_lufs'], '-14 ± 1')
    if qa.get('true_peak_dbfs') is not None:
        check('crête', qa['true_peak_dbfs'] <= -0.5, qa['true_peak_dbfs'], '≤ -0,5 dBFS')
    if qa.get('first_word_s') is not None:
        check('accroche : premier mot', qa['first_word_s'] <= 0.5, f"{qa['first_word_s']} s", '≤ 0,5 s')
    check('accroche : texte à l’écran', bool(plan.get('hook')), plan.get('hook', ''), 'présent')
    # The 3D conformity of the scene (preflight QA, run before the render): passed and at least « validé avec réserves ».
    pf = os.path.join(os.path.dirname(mp4), 'preflight.json')
    if os.path.isfile(pf):
        q = json.load(open(pf, encoding='utf-8'))
        rate = q.get('taux_objectifs', 0)
        check('conformité 3D : objectifs atteints', q['passed'] and rate >= 80, f"{rate} % · qualité {q['score']}/100 · {q['verdict']}", 'aucun défaut critique, ≥ 80 % des objectifs')
        check('conformité 3D : conforme dès la génération', bool(q.get('conforme_des_la_generation')), 'oui' if q.get('conforme_des_la_generation') else f"non ({len(q.get('corrections', []))} correction(s))", 'oui')
    else:
        check('conformité 3D (preflight)', False, 'aucun rapport', 'rapport preflight.json présent')
    m = measure(mp4)
    if m:
        for k in ('seconds', 'shotsPerMin', 'shotMedianS', 'motion', 'coverage', 'frozenS', 'flicker'):
            r = ref[k]
            if k in ONE_SIDED:
                # Less is better: frozen seconds and flicker only have a ceiling (beating every reference is no fault).
                check(f'rythme TikTok : {k}', m[k] <= r['max'], m[k], f"≤ {r['max']} (médiane de la chaîne {r['median']})")
            elif k in LIVING:
                # The living world moves more of the picture than the channel's videos (asked for): floor + a 1.5× ceiling.
                check(f'rythme TikTok : {k}', r['min'] <= m[k] <= r['max'] * LIVING[k], m[k], f"{r['min']} – {round(r['max'] * LIVING[k], 3)} (chaîne ≤ {r['max']}, monde vivant)")
            else:
                check(f'rythme TikTok : {k}', r['min'] <= m[k] <= r['max'], m[k], f"{r['min']} – {r['max']} (médiane {r['median']})")
    passed = all(c['ok'] for c in checks)
    out = {'film': os.path.basename(mp4), 'passed': passed, 'checks': checks, 'measures': m}
    json.dump(out, open(base + '.gate.json', 'w'), ensure_ascii=False, indent=1)
    for c in checks:
        print(('✓' if c['ok'] else '✗'), c['check'], '→', c['value'], f"(attendu {c['want']})")
    print('PORTE DE QUALITÉ :', 'OUI' if passed else 'NON')
    return 0 if passed else 2


if __name__ == '__main__':
    sys.exit(main())
