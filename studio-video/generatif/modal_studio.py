# STUDIO GÉNÉRATIF SUR CARTE MODAL (20/10/2026) — étape 2 de la chaîne générative (plan_generatif.py → ICI → assemble_generatif.py).
# Chaque plan (image clé + voix de chaque personne + consigne de jeu) est animé par InfiniteTalk sur une carte H100 du compte
# Modal de l'utilisateur, payée sur les 30 $ de crédits GRATUITS du mois (offre Starter, modal.com/pricing relevé le 20/10/2026 :
# H100 0,001097 $/s, A100-80GB 0,000694 $/s). « Rien de payant » : PLAFOND DUR appliqué par le code ci-dessous (refus AVANT
# tout lancement si le cumul du mois + l'estimation dépassent STUDIO_PLAFOND_USD, 25 $ par défaut), dépense mesurée tenue dans
# un dictionnaire Modal. Tous les plans d'un épisode partent EN PARALLÈLE (STUDIO_CARTES cartes, 10 au plus sur l'offre gratuite).
# Modèles (licences lues à la source, 20/10/2026) :
#   · InfiniteTalk (MeiGen-AI) : code Apache-2.0 (LICENSE.txt), poids Apache-2.0 — commit 50aa0a9 figé ;
#   · Wan2.1-I2V-14B-480P (Wan-AI) : Apache-2.0, 82,3 Go ;  · chinese-wav2vec2-base (TencentGameMate) : MIT ;
#   · LoRA de distillation 4 pas (lightx2v/Wan2.1-I2V-14B-480P-StepDistill-CfgDistill-Lightx2v, loras/…rank64) : Apache-2.0.
#     La LoRA citée par le README d'InfiniteTalk (Kijai/WanVideo_comfy) n'a PAS de licence : écartée.
# Réglages lus dans le README d'InfiniteTalk (§ « Run with FusioniX or Lightx2v ») : guidage texte 1, audio 2, décalage 2,
# streaming, 9 images de mouvement ; 4 pas avec lightx2v. EXPERTISE (dépôt sans licence lu pour apprendre, consigne du
# 20/10/2026) : l'exemple I2V InfiniteTalk de Kijai (ComfyUI-WanVideoWrapper, code Apache-2.0,
# example_workflows/wanvideo_2_1_14B_I2V_InfiniteTalk_example_03.json) prend la MÊME LoRA lightx2v I2V 480p rang 64 à 1,0,
# mais 6 pas et un décalage de 11 (dpm++_sde) : les deux réglages sont des paramètres (--pas, --decalage), départagés
# par la mesure sur le premier plan.
#   modal run modal_studio.py::telecharge                  (une fois : poids dans le volume, sans carte graphique)
#   modal run modal_studio.py --plans DOSSIER [--seulement plan-01,plan-03]
# Jetons MODAL_TOKEN_ID / MODAL_TOKEN_SECRET : secrets de l'environnement (jamais dans le dépôt ni dans le chat).
import io, json, os, subprocess, sys, time, zipfile
import modal

GPU = os.environ.get('STUDIO_GPU', 'H100')
PRIX_S = {'H100': 0.001097, 'A100-80GB': 0.000694}
PLAFOND_USD = float(os.environ.get('STUDIO_PLAFOND_USD', '25'))
ESTIME_S = 300          # estimation prudente par plan (chargement du modèle + génération) tant qu'aucune mesure n'existe
MARGE_S = 60            # démarrage du conteneur, compté en plus de la durée mesurée dans la fonction
COMMIT = '50aa0a94184315407a991ae804d9b58d6d311ba8'
LORA = 'loras/Wan21_I2V_14B_lightx2v_cfg_step_distill_lora_rank64.safetensors'

app = modal.App('massamba-studio')
poids = modal.Volume.from_name('massamba-studio-poids', create_if_missing=True)
compte = modal.Dict.from_name('massamba-studio-budget', create_if_missing=True)
image = (modal.Image.from_registry('nvidia/cuda:12.1.1-cudnn8-devel-ubuntu22.04', add_python='3.10')
         .apt_install('git', 'ffmpeg', 'libgl1', 'libglib2.0-0', 'libsndfile1')
         .pip_install('torch==2.4.1', 'torchvision==0.19.1', 'torchaudio==2.4.1', index_url='https://download.pytorch.org/whl/cu121')
         .pip_install('xformers==0.0.28', index_url='https://download.pytorch.org/whl/cu121')
         .pip_install('https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/'
                      'flash_attn-2.7.4.post1+cu12torch2.4cxx11abiFALSE-cp310-cp310-linux_x86_64.whl')
         .run_commands(f'git clone https://github.com/MeiGen-AI/InfiniteTalk /opt/it && cd /opt/it && git checkout {COMMIT}',
                       'pip install -r /opt/it/requirements.txt librosa "misaki[en]" "huggingface_hub[hf_transfer]"'))


@app.function(image=image, volumes={'/poids': poids}, timeout=3 * 3600, cpu=4)
def telecharge():
    """poids dans le volume, une seule fois (conteneur SANS carte graphique)."""
    from huggingface_hub import snapshot_download, hf_hub_download
    os.environ['HF_HUB_ENABLE_HF_TRANSFER'] = '1'
    snapshot_download('Wan-AI/Wan2.1-I2V-14B-480P', local_dir='/poids/Wan2.1-I2V-14B-480P')
    snapshot_download('TencentGameMate/chinese-wav2vec2-base', local_dir='/poids/chinese-wav2vec2-base')
    hf_hub_download('TencentGameMate/chinese-wav2vec2-base', 'model.safetensors', revision='refs/pr/1', local_dir='/poids/chinese-wav2vec2-base')
    snapshot_download('MeiGen-AI/InfiniteTalk', local_dir='/poids/InfiniteTalk', allow_patterns=['single/infinitetalk.safetensors', 'multi/infinitetalk.safetensors'])
    hf_hub_download('lightx2v/Wan2.1-I2V-14B-480P-StepDistill-CfgDistill-Lightx2v', LORA, local_dir='/poids/lightx2v')
    poids.commit()
    return sorted(os.listdir('/poids'))


@app.function(image=image, gpu=GPU, volumes={'/poids': poids}, timeout=1800, max_containers=int(os.environ.get('STUDIO_CARTES', '5')))
def anime(nom: str, paquet: bytes, modele: str, pas: int = 4, decalage: float = 2.0) -> dict:
    t0 = time.time(); w = f'/work/{nom}'; os.makedirs(w, exist_ok=True)
    zipfile.ZipFile(io.BytesIO(paquet)).extractall(w)
    E = json.load(open(f'{w}/entree.json'))   # chemins relatifs du plan → absolus (le script tourne depuis /opt/it)
    E['cond_video'] = f"{w}/{E['cond_video']}"; E['cond_audio'] = {k: f'{w}/{v}' for k, v in E['cond_audio'].items()}
    json.dump(E, open(f'{w}/entree.json', 'w'))
    cmd = [sys.executable, 'generate_infinitetalk.py', '--ckpt_dir', '/poids/Wan2.1-I2V-14B-480P',
           '--wav2vec_dir', '/poids/chinese-wav2vec2-base', '--infinitetalk_dir', f'/poids/InfiniteTalk/{modele}/infinitetalk.safetensors',
           '--lora_dir', f'/poids/lightx2v/{LORA}', '--lora_scale', '1.0', '--input_json', f'{w}/entree.json',
           '--size', 'infinitetalk-480', '--sample_steps', str(pas), '--sample_shift', str(decalage), '--sample_text_guide_scale', '1.0',
           '--sample_audio_guide_scale', '2.0', '--mode', 'streaming', '--motion_frame', '9', '--save_file', f'{w}/genere']
    r = subprocess.run(cmd, cwd='/opt/it', capture_output=True, text=True)
    sortie = f'{w}/genere.mp4'
    return {'nom': nom, 'ok': r.returncode == 0 and os.path.isfile(sortie), 'secondes': round(time.time() - t0, 1),
            'video': open(sortie, 'rb').read() if os.path.isfile(sortie) else b'', 'journal': (r.stdout + r.stderr)[-3000:]}


@app.local_entrypoint()
def main(plans: str, seulement: str = '', pas: int = 4, decalage: float = 2.0):
    noms = sorted(n for n in os.listdir(f'{plans}/plans') if not seulement or n in seulement.split(','))
    mois = time.strftime('%Y-%m'); deja = float(compte.get(mois, 0.0)); prix = PRIX_S[GPU]
    mes = [m for m in (compte.get('mesures') or []) if m > 0]; par_plan = (sum(mes) / len(mes) if mes else ESTIME_S) + MARGE_S
    estime = len(noms) * par_plan * prix
    print(f'{len(noms)} plans sur {GPU} : estimation {estime:.2f} $ ; déjà dépensé ce mois {deja:.2f} $ ; plafond {PLAFOND_USD:.2f} $')
    if deja + estime > PLAFOND_USD:   # PLAFOND DUR : rien ne part
        raise SystemExit(f'refusé : {deja:.2f} + {estime:.2f} $ dépasseraient le plafond de {PLAFOND_USD:.2f} $ du mois')
    args = []
    for n in noms:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            for f in os.listdir(f'{plans}/plans/{n}'):
                if f != 'genere.mp4': z.write(f'{plans}/plans/{n}/{f}', f)
        args.append((n, buf.getvalue(), json.load(open(f'{plans}/plans/{n}/meta.json'))['modele'], pas, decalage))
    t_dep, journal = time.time(), []
    for res in anime.starmap(args, return_exceptions=True):
        if isinstance(res, Exception):
            journal.append({'erreur': repr(res)[:500]}); continue
        d = f"{plans}/plans/{res['nom']}"
        if res['ok']: open(f'{d}/genere.mp4', 'wb').write(res['video'])
        cout = (res['secondes'] + MARGE_S) * prix
        compte[mois] = float(compte.get(mois, 0.0)) + cout; compte['mesures'] = ((compte.get('mesures') or []) + [res['secondes']])[-50:]
        journal.append({k: v for k, v in res.items() if k != 'video'} | {'cout_usd': round(cout, 3)})
        print(res['nom'], 'ok' if res['ok'] else 'ÉCHEC', f"{res['secondes']} s", f'{cout:.3f} $')
    R = {'gpu': GPU, 'plans': len(noms), 'secondes_murales': round(time.time() - t_dep, 1),
         'cout_usd': round(sum(j.get('cout_usd', 0) for j in journal), 3), 'depense_du_mois_usd': round(float(compte.get(mois, 0.0)), 3), 'detail': journal}
    json.dump(R, open(f'{plans}/modal-journal.json', 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in R.items() if k != 'detail'}, ensure_ascii=False))
