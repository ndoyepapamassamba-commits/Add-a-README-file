# CONCOURS D'IMAGES DE LA TROUPE (20/10/2026) — « cherche des générateurs d'images capables de te générer les personnages et
# les scènes pour les 10 000 vidéos avec le même style de personnages » (après le cadre virtuel Wan 2.2 sur GitHub).
# Même cadre : machines GitHub gratuites, processeur seul, moteur stable-diffusion.cpp (MIT) déjà compilé pour Wan.
# Concurrents (licences vérifiées à la source le 20/10/2026, toutes compatibles avec un usage monétisé) :
#   klein4b  : FLUX.2 [klein] 4B (Apache-2.0), GGUF leejet, encodeur Qwen3-4B (Apache-2.0), VAE FLUX.2 small decoder
#              (Apache-2.0) — édition à PLUSIEURS images de référence (preset flux2 de sd.cpp, docs/edit.md), 4 étapes ;
#   qwen2511 : Qwen-Image-Edit-2511 (Apache-2.0), GGUF unsloth Q3_K_M, + LoRA Lightning 4 étapes (lightx2v, Apache-2.0),
#              encodeur Qwen2.5-VL-7B (Apache-2.0) avec sa vision (mmproj) — référence de l'édition à identité gardée ;
#   zimage   : Z-Image-Turbo (Apache-2.0), 8 étapes, SANS référence (texte seul) : témoin, et générateur de décors.
# Chaque tâche de demandes/demande.json est rendue, mesurée (secondes, mémoire) et scellée avec la clé de Claude.
#   python3 concours.py MODELE DEMANDES POIDS SORTIE CLE_CLAUDE.pub.pem CLE_FABRIQUE.priv.json BINAIRE JOURNAL
import json, os, re, subprocess, sys, time

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(ICI, '..', 'fabrique'))
import coffre

MODELES = {
    'klein4b': {'args': ['--diffusion-model', '{M}/klein.gguf', '--vae', '{M}/vae.safetensors', '--llm', '{M}/llm.gguf',
                         '--cfg-scale', '1.0', '--steps', '4', '--sampling-method', 'euler'], 'refs': True,
                'licence': 'Apache-2.0 : FLUX.2 klein 4B, Qwen3-4B, FLUX.2 small decoder'},
    'qwen2511': {'args': ['--diffusion-model', '{M}/qwen.gguf', '--vae', '{M}/vae.safetensors', '--llm', '{M}/llm.gguf',
                          '--llm_vision', '{M}/mmproj.gguf', '--lora-model-dir', '{M}/lora', '--lora-apply-mode', 'at_runtime',
                          '--cfg-scale', '1.0', '--steps', '4', '--flow-shift', '3', '--sampling-method', 'euler',
                          '--model-args', 'qwen_image_zero_cond_t=true', '--mmap'], 'refs': True, 'suffixe': '<lora:lightning:1>',
                 'licence': 'Apache-2.0 : Qwen-Image-Edit-2511, Lightning (lightx2v), Qwen2.5-VL-7B'},
    'zimage': {'args': ['--diffusion-model', '{M}/zimage.gguf', '--vae', '{M}/vae.safetensors', '--llm', '{M}/llm.gguf',
                        '--cfg-scale', '1.0', '--steps', '8', '--sampling-method', 'euler'], 'refs': False,
               'licence': 'Apache-2.0 : Z-Image-Turbo, Qwen3-4B-Instruct-2507, VAE FLUX.1'},
}


def main(nom, demandes, M, sortie, pub_claude, priv_fabrique, binaire, journal):
    D = json.load(open(os.path.join(demandes, 'demande.json'), encoding='utf-8')); m = MODELES[nom]
    clair = os.path.join(sortie, 'clair'); os.makedirs(clair, exist_ok=True)
    priv = coffre._priv(priv_fabrique, coffre._phrase()); refs = {}
    for f in D['references']:                     # références ouvertes sur la machine seulement, jamais poussées en clair
        refs[f] = os.path.join(clair, f[:-4] + '.png')
        open(refs[f], 'wb').write(coffre.ouvre_octets(open(os.path.join(demandes, f), 'rb').read(), priv))
    pub = coffre._pub(pub_claude); res = []
    for t in D['taches']:
        out = os.path.join(clair, t['id'] + '.png'); tps = os.path.join(sortie, f"time-{t['id']}.txt")
        cmd = [binaire] + [a.format(M=M) for a in m['args']] + [
            '-p', (t['prompt'] if m['refs'] else t['prompt_sans_ref']) + m.get('suffixe', ''),
            '-W', str(t['w']), '-H', str(t['h']), '--seed', '42', '-t', '4', '-o', out, '-v']
        for r in (t['refs'] if m['refs'] else []): cmd += ['-r', refs[r]]
        t0 = time.time()
        with open(journal, 'a') as j:
            j.write(f"=== {t['id']}\n"); j.flush()
            rc = subprocess.run(['/usr/bin/time', '-v', '-o', tps] + cmd, stdout=j, stderr=subprocess.STDOUT).returncode
        rss = re.search(r'Maximum resident set size \(kbytes\): (\d+)', open(tps).read()) if os.path.isfile(tps) else None
        ok = rc == 0 and os.path.isfile(out)
        if ok: open(os.path.join(sortie, t['id'] + '.msb'), 'wb').write(coffre.scelle_octets(open(out, 'rb').read(), pub))
        res.append({'tache': t['id'], 'ok': ok, 'code': rc, 'secondes': round(time.time() - t0),
                    'memoire_max_go': round(int(rss.group(1)) / 1e6, 2) if rss else None, 'references': m['refs']})
        print(json.dumps(res[-1], ensure_ascii=False), flush=True)
    json.dump({'modele': nom, 'licence': m['licence'], 'sd_cpp': os.environ.get('SD_CPP'), 'run': os.environ.get('GITHUB_RUN_ID'),
               'taches': res}, open(os.path.join(sortie, 'mesure.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main(*sys.argv[1:9])
