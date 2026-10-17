# PERSONNAGES À 360° (17/10/2026) — « tu dois pouvoir avoir ces personnages sous 360 degrés afin de les faire bouger,
# tourner dans les scènes ». Le moteur 2D anime un DESSIN ; pour qu'un personnage se tourne vraiment (profil, dos), il lui
# faut ses autres vues, dans le même style. Greffe : Qwen-Image-Edit-2511 (Apache-2.0) + LoRA « Multiple Angles » de fal
# (Apache-2.0, 8 azimuts × 4 élévations × 3 distances, entraînée sur des rendus de Gaussian Splatting) + LoRA Lightning
# 4 pas (lightx2v, Apache-2.0), en GGUF (unsloth, Apache-2.0) dans ComfyUI (programme séparé) sur une carte gratuite.
# Chaque vue est ensuite jugée par l'œil de JEV (même personnage que la fiche ? vue abîmée ?) avant d'entrer au casting.
#   python3 vues360.py paquet fiches/ paquet-vues.zip         → paquet pour le carnet (fiches + noyau + graphe)
#   python3 vues360.py valide http://127.0.0.1:8188           → le graphe accepté par un ComfyUI (fichiers factices)
#   python3 vues360.py juge sortie-vues/ fiches/ choix.json   → vues gardées (identité, défauts) par JEV
import json, os, sys, zipfile

AZIMUTS = {'face': 'front view', 'trois_quarts_droite': 'front-right quarter view', 'profil_droit': 'right side view',
           'dos_droit': 'back-right quarter view', 'dos': 'back view', 'dos_gauche': 'back-left quarter view',
           'profil_gauche': 'left side view', 'trois_quarts_gauche': 'front-left quarter view'}
ANGLE = {'face': 0, 'trois_quarts_droite': 45, 'profil_droit': 90, 'dos_droit': 135, 'dos': 180, 'dos_gauche': 225,
         'profil_gauche': 270, 'trois_quarts_gauche': 315}
HF = 'https://huggingface.co'
KIT = {   # (dépôt, fichier dans le dépôt, dossier ComfyUI, nom local) — licences lues le 17/10/2026 : toutes Apache-2.0
    'unet_q3': ('unsloth/Qwen-Image-Edit-2511-GGUF', 'qwen-image-edit-2511-Q3_K_M.gguf', 'unet', 'qwen-image-edit-2511-Q3_K_M.gguf'),
    'unet_q4': ('unsloth/Qwen-Image-Edit-2511-GGUF', 'qwen-image-edit-2511-Q4_K_S.gguf', 'unet', 'qwen-image-edit-2511-Q4_K_S.gguf'),
    'unet_q8': ('unsloth/Qwen-Image-Edit-2511-GGUF', 'qwen-image-edit-2511-Q8_0.gguf', 'unet', 'qwen-image-edit-2511-Q8_0.gguf'),
    'te': ('unsloth/Qwen2.5-VL-7B-Instruct-GGUF', 'Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf', 'text_encoders', 'Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf'),
    # ComfyUI-GGUF retrouve la partie « vision » à côté de l'encodeur si son nom contient celui de l'encodeur
    'mmproj': ('unsloth/Qwen2.5-VL-7B-Instruct-GGUF', 'mmproj-F16.gguf', 'text_encoders', 'Qwen2.5-VL-7B-Instruct-mmproj-F16.gguf'),
    'vae': ('Comfy-Org/Qwen-Image_ComfyUI', 'split_files/vae/qwen_image_vae.safetensors', 'vae', 'qwen_image_vae.safetensors'),
    'angles': ('fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA', 'qwen-image-edit-2511-multiple-angles-lora.safetensors', 'loras', 'qwen-image-edit-2511-multiple-angles-lora.safetensors'),
    'eclair': ('lightx2v/Qwen-Image-Edit-2511-Lightning', 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors', 'loras', 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors'),
}


def unet_pour(memoire_go):
    """version du modèle d'après la mémoire de la carte (T4 16 Go → Q3_K_M ; L4 24 Go → Q4_K_S ; A100/H100 → Q8_0)."""
    return 'unet_q8' if memoire_go >= 40 else ('unet_q4' if memoire_go >= 20 else 'unet_q3')


def consigne(azimut, elevation='eye-level shot', distance='medium shot'):
    return f'<sks> {AZIMUTS[azimut]} {elevation} {distance}'


def graphe(image, azimut, unet, graine=7, force_angles=0.9, pas=4):
    """graphe ComfyUI (format API) : la fiche tournée vers l'azimut demandé, même personnage, même style."""
    k = KIT
    return {
        '1': {'class_type': 'UnetLoaderGGUF', 'inputs': {'unet_name': k[unet][3]}},
        '2': {'class_type': 'CLIPLoaderGGUF', 'inputs': {'clip_name': k['te'][3], 'type': 'qwen_image'}},
        '3': {'class_type': 'VAELoader', 'inputs': {'vae_name': k['vae'][3]}},
        '4': {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': ['1', 0], 'lora_name': k['angles'][3], 'strength_model': force_angles}},
        '5': {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': ['4', 0], 'lora_name': k['eclair'][3], 'strength_model': 1.0}},
        '6': {'class_type': 'ModelSamplingAuraFlow', 'inputs': {'model': ['5', 0], 'shift': 3.1}},
        '7': {'class_type': 'CFGNorm', 'inputs': {'model': ['6', 0], 'strength': 1.0}},
        '8': {'class_type': 'LoadImage', 'inputs': {'image': image}},
        '9': {'class_type': 'ImageScaleToTotalPixels', 'inputs': {'image': ['8', 0], 'upscale_method': 'lanczos', 'megapixels': 1.0, 'resolution_steps': 8}},
        '10': {'class_type': 'TextEncodeQwenImageEditPlus', 'inputs': {'clip': ['2', 0], 'prompt': consigne(azimut), 'vae': ['3', 0], 'image1': ['9', 0]}},
        '11': {'class_type': 'TextEncodeQwenImageEditPlus', 'inputs': {'clip': ['2', 0], 'prompt': '', 'vae': ['3', 0], 'image1': ['9', 0]}},
        '12': {'class_type': 'VAEEncode', 'inputs': {'pixels': ['9', 0], 'vae': ['3', 0]}},
        '13': {'class_type': 'KSampler', 'inputs': {'model': ['7', 0], 'positive': ['10', 0], 'negative': ['11', 0], 'latent_image': ['12', 0],
                                                   'seed': graine, 'steps': pas, 'cfg': 1.0, 'sampler_name': 'euler', 'scheduler': 'simple', 'denoise': 1.0}},
        '14': {'class_type': 'VAEDecode', 'inputs': {'samples': ['13', 0], 'vae': ['3', 0]}},
        '15': {'class_type': 'SaveImage', 'inputs': {'images': ['14', 0], 'filename_prefix': f'vue_{os.path.splitext(image)[0]}_{azimut}'}},
    }


def paquet(fiches, sortie, azimuts=None):
    """paquet pour le carnet : les fiches (PNG), la liste des vues voulues, ce module et le noyau qui tourne sur la carte."""
    ici = os.path.dirname(os.path.abspath(__file__)); az = azimuts or [a for a in AZIMUTS if a != 'face']
    noms = sorted(f for f in os.listdir(fiches) if f.lower().endswith('.png'))
    with zipfile.ZipFile(sortie, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in noms: z.write(os.path.join(fiches, f), f'fiches/{f}')
        z.writestr('vues.json', json.dumps({'fiches': noms, 'azimuts': az}, ensure_ascii=False, indent=1))
        z.write(os.path.join(ici, 'vues360.py'), 'vues360.py'); z.write(os.path.join(ici, 'noyau_vues.py'), 'noyau_vues.py')
    print(f'{sortie} : {len(noms)} fiches × {len(az)} vues = {len(noms) * len(az)} images à produire')


def valide(serveur):
    """envoie le graphe à un ComfyUI : il est accepté si le serveur ne renvoie aucune erreur de nœud."""
    import urllib.request
    g = graphe('fiche_essai.png', 'profil_gauche', 'unet_q3')
    req = urllib.request.Request(serveur + '/prompt', data=json.dumps({'prompt': g}).encode(), headers={'Content-Type': 'application/json'})
    try:
        r = json.loads(urllib.request.urlopen(req, timeout=60).read()); print('accepté :', r)
    except urllib.error.HTTPError as e:
        print('refusé :', e.code, e.read().decode()[:3000])


GGUF_NOEUDS = {   # ComfyUI-GGUF (city96, Apache-2.0) au commit figé du noyau : entrées lues dans nodes.py
    'UnetLoaderGGUF': {'input': {'required': {'unet_name': [['*']]}}, 'output': ['MODEL']},
    'CLIPLoaderGGUF': {'input': {'required': {'clip_name': [['*']], 'type': [['qwen_image']]}}, 'output': ['CLIP']},
}


def valide_a_sec(object_info, g=None):
    """validation sans carte ni PyTorch : chaque nœud existe dans la description du serveur (object_info), chaque entrée
    est déclarée, toutes les entrées obligatoires sont fournies, chaque lien part d'une sortie existante d'un type accepté."""
    info = dict(json.load(open(object_info))); info.update(GGUF_NOEUDS); g = g or graphe('fiche_essai.png', 'profil_gauche', 'unet_q3')
    err = []
    for nid, n in g.items():
        d = info.get(n['class_type'])
        if d is None: err.append(f'{nid} : nœud inconnu {n["class_type"]}'); continue
        decl = {**d['input'].get('required', {}), **d['input'].get('optional', {})}
        for k in d['input'].get('required', {}):
            if k not in n['inputs']: err.append(f'{nid} {n["class_type"]} : entrée obligatoire « {k} » manquante')
        for k, v in n['inputs'].items():
            if k not in decl: err.append(f'{nid} {n["class_type"]} : entrée « {k} » inconnue'); continue
            attendu = decl[k][0]
            if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str):
                src = g.get(v[0])
                if src is None: err.append(f'{nid}.{k} : lien vers un nœud absent {v[0]}'); continue
                sd = info.get(src['class_type'], {}); outs = sd.get('output', [])
                if v[1] >= len(outs): err.append(f'{nid}.{k} : sortie {v[1]} absente de {src["class_type"]}'); continue
                if isinstance(attendu, str) and attendu != '*' and outs[v[1]] != attendu:
                    err.append(f'{nid}.{k} : type {outs[v[1]]} reçu, {attendu} attendu')
            elif isinstance(attendu, list) and attendu and attendu != ['*'] and k not in ('unet_name', 'clip_name', 'vae_name', 'lora_name', 'image'):
                if v not in attendu: err.append(f'{nid}.{k} : valeur {v!r} hors de la liste {attendu[:6]}…')
    return err


Q_IDENTITE = ('The first image is the reference sheet of a cartoon character. Is the second image the SAME character (same face, '
              'skin, hair, clothes and colors), only seen from another angle?')
Q_ABIME = ('Is the character in this image deformed, broken or incomplete (extra or missing limbs, melted face, cut-off body, '
           'mixed with another character), rather than a clean full-body view?')


def juge(dossier, fiches, sortie, seuil_id=0.6, seuil_abime=0.5):
    """chaque vue produite passe l'œil de JEV : même personnage que la fiche, et pas abîmée. → choix.json"""
    import base64, uuid, urllib.request
    API = 'https://api.typesafe.ai/v1/systemone'
    b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
    res = {}
    for slug in sorted(os.listdir(dossier)):
        ref = os.path.join(fiches, slug + '.png')
        if not os.path.isfile(ref): continue
        for f in sorted(os.listdir(os.path.join(dossier, slug))):
            if not f.endswith('.png'): continue
            p = os.path.join(dossier, slug, f); a, b = f'ref-{uuid.uuid4().hex[:6]}', f'vue-{uuid.uuid4().hex[:6]}'
            body = {'model': 'jev-1.14.0', 'state': {'reference': a, 'view': b},
                    'questions': {'identite': {'type': 'noul', 'instructions': Q_IDENTITE.replace('first image', '`reference` image').replace('second image', '`view` image')},
                                  'abime': {'type': 'noul', 'instructions': '`view` is an image. ' + Q_ABIME}},
                    'assets': {a: {'type': 'image', 'format': 'png', 'data_base64': b64(ref)}, b: {'type': 'image', 'format': 'png', 'data_base64': b64(p)}}}
            req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'})
            try:
                ans = json.loads(urllib.request.urlopen(req, timeout=180).read())['answers']
                v = {k: round(float(x['noul'] if isinstance(x, dict) else x), 3) for k, x in ans.items()}
            except Exception as e:
                v = {'erreur': str(e)[:120]}
            v['gardee'] = v.get('identite', 0) >= seuil_id and v.get('abime', 1) < seuil_abime
            res.setdefault(slug, {})[os.path.splitext(f)[0]] = v; print(slug, f, v, flush=True)
    json.dump(res, open(sortie, 'w'), ensure_ascii=False, indent=1)
    return res


if __name__ == '__main__':
    c = sys.argv[1]
    if c == 'paquet': paquet(sys.argv[2], sys.argv[3])
    elif c == 'valide': valide(sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8188')
    elif c == 'juge': juge(sys.argv[2], sys.argv[3], sys.argv[4])
    elif c == 'a-sec':
        e = valide_a_sec(sys.argv[2]); print('graphe valide (0 erreur)' if not e else '\n'.join(e))
