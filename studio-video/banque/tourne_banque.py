# TOURNAGE D'UNE PART DE LA BANQUE DE MOUVEMENTS (20/10/2026) — exécuté par une machine GitHub (banque-mouvements.yml).
# Pour chaque clip de sa part : pose de départ découpée dans la planche (ouverte du coffre), Wan 2.2 TI2V-5B + LoRA FastWan
# (Apache-2.0) par stable-diffusion.cpp sur processeur, mp4, scellé avec la clé de Claude, mesuré (secondes, mémoire).
# La LoRA est d'abord fusionnée au chargement (« immediately » : mesuré le 20/10, l'appliquer à la volée doublait le temps
# par étape, 110 s contre 55 s) ; si la fusion échoue, le clip est refait avec l'application à la volée.
# Mémoire (20/10 22:06, machine Turbo : 610 Mo libres seulement pendant le décodage VAE par tranches de temps) : poids lus en
# mémoire projetée (--mmap, pages rendues au système quand le décodage en a besoin) et décodage aussi par tuiles (--vae-tiling).
#   python3 tourne_banque.py TACHES.json PART NB POIDS SORTIE BINAIRE CLE_FABRIQUE.priv.json CLE_CLAUDE.pub.pem
import json, os, re, subprocess, sys, time

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(ICI, '..', 'fabrique')); sys.path.insert(0, ICI)
import coffre, banque

NEGATIF = ('色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，'
           '残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿')


def main(taches, part, nb, M, sortie, binaire, priv_fabrique, pub_claude):
    T = [t for i, t in enumerate(json.load(open(taches, encoding='utf-8'))) if i % int(nb) == int(part)]
    clair = os.path.join(sortie, 'clair'); os.makedirs(clair, exist_ok=True)
    priv = coffre._priv(priv_fabrique, coffre._phrase()); pub = coffre._pub(pub_claude); poses = {}; res = []
    journal = os.path.join(sortie, 'journal.txt')
    for t in T:
        p = t['personnage']
        if p not in poses:   # planche ouverte en mémoire de la machine, poses découpées une fois par personnage
            pl = os.path.join(clair, p + '.jpg')
            open(pl, 'wb').write(coffre.ouvre_octets(open(os.path.join(ICI, '..', 'images', 'troupe', p + '-planche.msb'), 'rb').read(), priv))
            poses[p] = banque.poses(pl, os.path.join(clair, p))
        avi = os.path.join(clair, t['id'] + '.avi'); mp4 = os.path.join(clair, t['id'] + '.mp4'); t0 = time.time(); mode = None
        for mode in ('immediately', 'at_runtime'):
            cmd = ['/usr/bin/time', '-v', '-o', os.path.join(sortie, 'time.txt'), binaire, '-M', 'vid_gen',
                   '--diffusion-model', f'{M}/base.gguf', '--vae', f'{M}/vae.safetensors', '--t5xxl', f'{M}/umt5.gguf',
                   '--lora-model-dir', f'{M}/lora', '--lora-apply-mode', mode, '-i', poses[p][t['pose']],
                   '-p', t['prompt'] + '<lora:fastwan:1>', '-n', NEGATIF, '--cfg-scale', '1', '--sampling-method', 'euler',
                   '--steps', '4', '-W', '384', '-H', '640', '--video-frames', '33', '--flow-shift', '5.0', '--seed', '42',
                   '-t', '4', '--temporal-tiling', '--vae-tiling', '--mmap', '-o', avi, '-v']
            with open(journal, 'a') as j:
                j.write(f"=== {t['id']} ({mode})\n"); j.flush()
                rc = subprocess.run(cmd, stdout=j, stderr=subprocess.STDOUT).returncode
            if rc == 0 and os.path.isfile(avi): break
        ok = rc == 0 and os.path.isfile(avi)
        if ok:
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', avi, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', mp4])
            ok = os.path.isfile(mp4)
            if ok: open(os.path.join(sortie, t['id'] + '.msb'), 'wb').write(coffre.scelle_octets(open(mp4, 'rb').read(), pub))
        tps = open(os.path.join(sortie, 'time.txt')).read() if os.path.isfile(os.path.join(sortie, 'time.txt')) else ''
        rss = re.search(r'Maximum resident set size \(kbytes\): (\d+)', tps)
        res.append({'clip': t['id'], 'ok': ok, 'lora': mode, 'secondes': round(time.time() - t0),
                    'memoire_max_go': round(int(rss.group(1)) / 1e6, 2) if rss else None})
        print(json.dumps(res[-1], ensure_ascii=False), flush=True)
        json.dump({'part': int(part), 'clips': res, 'run': os.environ.get('GITHUB_RUN_ID')}, open(os.path.join(sortie, 'mesure.json'), 'w'), indent=1)


if __name__ == '__main__':
    main(*sys.argv[1:9])
