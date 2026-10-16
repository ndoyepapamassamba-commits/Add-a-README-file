# ANIMATION DE LA TROUPE SUR UNE CARTE MODAL (16/10/2026) — consigne : « C'est trop long… cherche les alternatives ».
# Même noyau que sur Kaggle / Colab (noyau_kaggle.py : ComfyUI figé + Wan2.2-S2V GGUF), mais sur une carte bien plus
# rapide que la T4 (H100, A100 ou L4), facturée à la seconde sur les crédits gratuits mensuels du compte Modal de
# l'utilisateur. Lancé depuis Colab (aucune installation sur le PC) : `GPU=H100 modal run troupe_modal.py`.
# Les modèles sont gardés dans un volume Modal (« troupe-modeles ») : seuls le premier film les télécharge.
# Client Modal : Apache-2.0. ComfyUI (GPL-3.0) tourne comme programme séparé dans le conteneur de calcul.
import io, os, subprocess, sys, zipfile
import modal

GPU = 'H100'            # remplacé par le carnet : H100 (le plus rapide), A100-80GB, L4 (le moins cher)
ENTREE = '/content/paquet'
SORTIE_LOCALE = '/content/troupe-sortie.zip'

app = modal.App('troupe-anime')
modeles = modal.Volume.from_name('troupe-modeles', create_if_missing=True)
image = (modal.Image.debian_slim(python_version='3.12')
         .apt_install('git', 'curl', 'ffmpeg', 'libgl1', 'libglib2.0-0')
         .pip_install('torch', 'torchvision', 'torchaudio', index_url='https://download.pytorch.org/whl/cu128')
         .pip_install('opencv-python-headless', 'numpy'))

@app.function(gpu=GPU, image=image, volumes={'/cache': modeles}, timeout=6 * 3600)
def anime(paquet: bytes) -> bytes:
    os.makedirs('/cache/troupe', exist_ok=True)            # ComfyUI + modèles gardés d'un film à l'autre
    if not os.path.exists('/tmp/troupe'): os.symlink('/cache/troupe', '/tmp/troupe')
    zipfile.ZipFile(io.BytesIO(paquet)).extractall('/work/paquet')
    env = dict(os.environ, NOYAU_ENTREE='/work/paquet', NOYAU_SORTIE='/work/sortie')
    subprocess.run([sys.executable, '-u', '/work/paquet/noyau_kaggle.py'], env=env)
    modeles.commit()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        for f in sorted(os.listdir('/work/sortie')): z.write(f'/work/sortie/{f}', f)
    return buf.getvalue()

@app.local_entrypoint()
def main():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        for f in sorted(os.listdir(ENTREE)): z.write(f'{ENTREE}/{f}', f)
    print(f'paquet envoyé à la carte {GPU} : {len(buf.getvalue()) / 1e6:.1f} Mo')
    out = anime.remote(buf.getvalue())
    open(SORTIE_LOCALE, 'wb').write(out)
    n = sum(1 for x in zipfile.ZipFile(SORTIE_LOCALE).namelist() if x.endswith('.mp4'))
    print(f'{n} plans animés récupérés dans {SORTIE_LOCALE}')
