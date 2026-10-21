# TOURNAGE D'UNE PART DE LA BIBLE V1 (20/10/2026) — exécuté par une machine GitHub (bible-v1.yml), toutes les parts en même temps.
# Générateur : FLUX.2 [klein] 4B (Apache-2.0), vainqueur du concours (concours.py, 20/10 23:02) : Koffi et Coumba refaits depuis
# leurs planches restent reconnaissables, le maquis vide a le rendu V1 ; 884 s par image à 1 référence, 1 340 s à 2 (mesuré).
# Accélération lue dans stable-diffusion.cpp (commit épinglé) : chaque référence est d'abord ramenée à la SURFACE de l'image
# demandée (src/pipeline/image.cpp l. 283-296), elle double donc les jetons du transformeur ; l'option prévue par l'auteur
# « --ref-image-args vae_input_max_pixels=N » (src/pipeline/diffusion_engine.cpp l. 3288) la plafonne. Référence au quart de la
# surface : le style passe, le calcul de la référence est divisé par quatre.
# Reprenable : la machine part de ce qui est déjà sur bible-sortie-<part> (jamais refait, sauf si la tâche a pris une version
# plus haute : image corrigée) et chaque image scellée y est poussée
# dès qu'elle est prête (boucle du workflow), si bien qu'une machine arrêtée ne perd que l'image en cours.
#   python3 bible_tourne.py TACHES.json PART NB POIDS SORTIE BINAIRE CLE_FABRIQUE.priv.json CLE_CLAUDE.pub.pem [MINUTES]
# SORTIE est la copie de travail de la branche : rien n'y est écrit en clair (images claires dans SORTIE-clair).
import json, os, re, subprocess, sys, time

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(ICI, '..', 'fabrique'))
import coffre

KLEIN = ['--diffusion-model', '{M}/klein.gguf', '--vae', '{M}/vae.safetensors', '--llm', '{M}/llm.gguf',
         '--cfg-scale', '1.0', '--steps', '4', '--sampling-method', 'euler']


def _ref(nom):
    for d in ('troupe', 'demandes'):
        f = os.path.join(ICI, d, nom)
        if os.path.isfile(f): return f
    raise FileNotFoundError(nom)


def main(taches, part, nb, M, sortie, binaire, priv_fabrique, pub_claude, minutes='320'):
    T = [t for i, t in enumerate(json.load(open(taches, encoding='utf-8'))) if i % int(nb) == int(part)]
    fin = time.time() + float(minutes) * 60
    clair = sortie.rstrip('/') + '-clair'; os.makedirs(clair, exist_ok=True)
    journal = os.path.join(clair, 'journal.txt'); mesure = os.path.join(sortie, 'mesure.json')
    res = json.load(open(mesure, encoding='utf-8'))['taches'] if os.path.isfile(mesure) else []
    presents = {f[:-4] for f in os.listdir(sortie) if f.endswith('.msb')}
    versions = {}   # version faite de chaque image (1 si non notée) : une tâche dont la version a monté est refaite
    for e in res:
        if e.get('ok'): versions[e['tache']] = e.get('version', 1)
    faits = {i for i in presents if versions.get(i, 1) == next((t.get('version', 1) for t in T if t['id'] == i), 1)}
    priv = coffre._priv(priv_fabrique, coffre._phrase()); pub = coffre._pub(pub_claude); refs = {}
    duree = {}   # type de tâche → plus longue durée vue, pour ne pas commencer une image qui dépasserait le temps de la machine
    print(json.dumps({'part': int(part), 'taches': len(T), 'deja_faites': len(faits & {t['id'] for t in T})}), flush=True)
    for t in T:
        if t['id'] in faits: continue
        if time.time() + duree.get(t['type'], 0) > fin:
            print(json.dumps({'arret': 'temps de la machine', 'reste': sum(x['id'] not in faits for x in T)}), flush=True); break
        for r in t['refs']:
            if r not in refs:   # référence ouverte sur la machine seulement, jamais poussée en clair
                refs[r] = os.path.join(clair, r[:-4] + '.img')
                open(refs[r], 'wb').write(coffre.ouvre_octets(open(_ref(r), 'rb').read(), priv))
        out = os.path.join(clair, t['id'] + '.png'); tps = os.path.join(clair, 'time.txt'); t0 = time.time(); rc = None
        for tuiles in ([], ['--vae-tiling']):   # secours : décodage par tuiles si la mémoire manque
            cmd = [binaire] + [a.format(M=M) for a in KLEIN] + [
                '-p', t['prompt'], '-W', str(t['w']), '-H', str(t['h']), '--seed', str(t.get('graine', 42)), '-t', '4',
                '--ref-image-args', f"vae_input_max_pixels={t['w'] * t['h'] // 4}", '-o', out, '-v'] + tuiles
            for r in t['refs']: cmd += ['-r', refs[r]]
            with open(journal, 'a') as j:
                j.write(f"=== {t['id']}{' (tuiles)' if tuiles else ''}\n"); j.flush()
                rc = subprocess.run(['/usr/bin/time', '-v', '-o', tps] + cmd, stdout=j, stderr=subprocess.STDOUT).returncode
            if rc == 0 and os.path.isfile(out): break
        if rc in (132, -4):   # instruction illégale : moteur compilé pour un autre processeur — on s'arrête sans griller la part
            print(json.dumps({'arret': 'instruction illégale (moteur d\'un autre processeur)', 'tache': t['id']}), flush=True); sys.exit(3)
        ok = rc == 0 and os.path.isfile(out)
        if ok:   # écrit sous un autre nom puis renommé : la boucle de poussée ne voit jamais une image à moitié écrite
            open(os.path.join(sortie, t['id'] + '.msb.part'), 'wb').write(coffre.scelle_octets(open(out, 'rb').read(), pub))
            os.replace(os.path.join(sortie, t['id'] + '.msb.part'), os.path.join(sortie, t['id'] + '.msb')); os.remove(out); faits.add(t['id'])
        s = round(time.time() - t0); duree[t['type']] = max(duree.get(t['type'], 0), s)
        rss = re.search(r'Maximum resident set size \(kbytes\): (\d+)', open(tps).read()) if os.path.isfile(tps) else None
        res.append({'tache': t['id'], 'version': t.get('version', 1), 'type': t['type'], 'ok': ok, 'code': rc, 'secondes': s, 'w': t['w'], 'h': t['h'],
                    'memoire_max_go': round(int(rss.group(1)) / 1e6, 2) if rss else None, 'run': os.environ.get('GITHUB_RUN_ID')})
        print(json.dumps(res[-1], ensure_ascii=False), flush=True)
        json.dump({'part': int(part), 'modele': 'FLUX.2 klein 4B (Apache-2.0)', 'sd_cpp': os.environ.get('SD_CPP'), 'taches': res},
                  open(mesure + '.part', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        os.replace(mesure + '.part', mesure)


if __name__ == '__main__':
    main(*sys.argv[1:10])
