# CLIENT COMFYUI POUR WAN (16/10/2026) — ComfyUI (GPL-3.0) tourne comme SERVEUR SÉPARÉ (chez nous en essai, ou sur le
# PC de l'utilisateur, ou sur une carte gratuite Kaggle via noyau_kaggle.py) ; ce client ne fait que lui parler par son API HTTP (/upload/image,
# /prompt, /history, /view). Graphes construits nœud par nœud d'après les modèles officiels de ComfyUI
# (video_wan2_2_14B_s2v.json, video_wan2_1_infinitetalk.json) et validés par le serveur lui-même.
#   Wan2.2-S2V   : une image + la voix → le personnage parle et bouge (bouche, tête, buste, gestes).
#   InfiniteTalk : une image + deux voix + un masque par personnage → DEUX personnages se répondent dans le même plan.
import json, os, time, uuid, urllib.request, urllib.parse

URL = os.environ.get('COMFY_URL', 'http://127.0.0.1:8188').rstrip('/')
NEG = ('couleurs saturées, surexposé, statique, flou, sous-titres, texte, filigrane, mauvaise qualité, JPEG, laid, '
       'mains déformées, visage déformé, membres en trop, doigts collés, image figée, fond qui bouge, personnes en trop')
S2V_FICHIERS = {  # dossiers ComfyUI/models/… — Comfy-Org/Wan_2.2_ComfyUI_Repackaged et Wan_2.1_ComfyUI_repackaged
    'diffusion_models': 'wan2.2_s2v_14B_fp8_scaled.safetensors', 'loras': 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors',
    'text_encoders': 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'vae': 'wan_2.1_vae.safetensors',
    'audio_encoders': 'wav2vec2_large_english_fp16.safetensors'}
IT_FICHIERS = {  # InfiniteTalk (MeiGen) sur Wan 2.1 I2V 14B 480p — fichiers Comfy-Org, sauf LoRA rapide et wav2vec2 chinois (Kijai)
    'diffusion_models': 'wan2.1_i2v_480p_14B_fp8_scaled.safetensors', 'model_patches': 'wan2.1_infiniteTalk_multi_fp16.safetensors',
    'loras': 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors', 'text_encoders': 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    'vae': 'wan_2.1_vae.safetensors', 'audio_encoders': 'wav2vec2-chinese-base_fp16.safetensors'}
# où télécharger chaque fichier (dépôt Hugging Face, chemin, dossier ComfyUI/models, taille relevée le 16/10/2026)
TELECHARGEMENTS = {
    's2v': [('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors', 'diffusion_models', 16.39),
            ('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors', 'loras', 1.23),
            ('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'text_encoders', 6.74),
            ('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/vae/wan_2.1_vae.safetensors', 'vae', 0.25),
            ('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/audio_encoders/wav2vec2_large_english_fp16.safetensors', 'audio_encoders', 0.63)],
    'infinitetalk': [('Comfy-Org/Wan_2.1_ComfyUI_repackaged', 'split_files/diffusion_models/wan2.1_i2v_480p_14B_fp8_scaled.safetensors', 'diffusion_models', 16.4),
                     ('Comfy-Org/Wan_2.1_ComfyUI_repackaged', 'split_files/model_patches/wan2.1_infiniteTalk_multi_fp16.safetensors', 'model_patches', 5.12),
                     ('Kijai/WanVideo_comfy', 'Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors', 'loras', 0.74),
                     ('Comfy-Org/Wan_2.1_ComfyUI_repackaged', 'split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'text_encoders', 6.74),
                     ('Comfy-Org/Wan_2.1_ComfyUI_repackaged', 'split_files/vae/wan_2.1_vae.safetensors', 'vae', 0.25),
                     ('Kijai/wav2vec2_safetensors', 'wav2vec2-chinese-base_fp16.safetensors', 'audio_encoders', 0.19)]}

# versions allégées GGUF (Apache-2.0) pour les cartes de 12 à 16 Go (T4 gratuite de Kaggle, RTX grand public) :
# même graphe, seul le chargeur change (nœud UnetLoaderGGUF de city96/ComfyUI-GGUF, Apache-2.0). Tailles relevées le 16/10/2026.
GGUF = {'s2v': ('QuantStack/Wan2.2-S2V-14B-GGUF', 'Wan2.2-S2V-14B-{q}.gguf', {'Q3_K_M': 11.39, 'Q4_K_M': 13.86, 'Q5_K_M': 15.0, 'Q8_0': 19.62}),
        'infinitetalk': ('city96/Wan2.1-I2V-14B-480P-gguf', 'wan2.1-i2v-14b-480p-{q}.gguf', {'Q3_K_M': 8.59, 'Q4_K_M': 11.34, 'Q5_K_M': 12.74, 'Q8_0': 18.14})}

def chargeur(defaut, unet=None):
    """nœud de chargement du modèle de diffusion : fichier fp8 d'origine, ou version GGUF si `unet` finit par .gguf."""
    if unet and unet.endswith('.gguf'): return {'class_type': 'UnetLoaderGGUF', 'inputs': {'unet_name': unet}}
    return {'class_type': 'UNETLoader', 'inputs': {'unet_name': unet or defaut, 'weight_dtype': 'default'}}

def longueur(sec, fps):  # Wan : nombre d'images 4k+1
    n = int(round(sec * fps)); return max(5, (n // 4) * 4 + 1)

def graphe_s2v(image, audio, w, h, sec, texte, graine=1, pas=4, cfg=1.0, prefixe='troupe/s2v', unet=None):
    L = longueur(sec, 16)
    return {
        '37': chargeur(S2V_FICHIERS['diffusion_models'], unet),
        '107': {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': ['37', 0], 'lora_name': S2V_FICHIERS['loras'], 'strength_model': 1.0}},
        '54': {'class_type': 'ModelSamplingSD3', 'inputs': {'model': ['107', 0], 'shift': 8.0}},
        '38': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': S2V_FICHIERS['text_encoders'], 'type': 'wan', 'device': 'default'}},
        '6': {'class_type': 'CLIPTextEncode', 'inputs': {'text': texte, 'clip': ['38', 0]}},
        '7': {'class_type': 'CLIPTextEncode', 'inputs': {'text': NEG, 'clip': ['38', 0]}},
        '39': {'class_type': 'VAELoader', 'inputs': {'vae_name': S2V_FICHIERS['vae']}},
        '57': {'class_type': 'AudioEncoderLoader', 'inputs': {'audio_encoder_name': S2V_FICHIERS['audio_encoders']}},
        '58': {'class_type': 'LoadAudio', 'inputs': {'audio': audio}},
        '56': {'class_type': 'AudioEncoderEncode', 'inputs': {'audio_encoder': ['57', 0], 'audio': ['58', 0]}},
        '52': {'class_type': 'LoadImage', 'inputs': {'image': image}},
        '93': {'class_type': 'WanSoundImageToVideo', 'inputs': {'positive': ['6', 0], 'negative': ['7', 0], 'vae': ['39', 0], 'width': w, 'height': h,
                                                                'length': L, 'batch_size': 1, 'audio_encoder_output': ['56', 0], 'ref_image': ['52', 0]}},
        '3': {'class_type': 'KSampler', 'inputs': {'model': ['54', 0], 'seed': graine, 'steps': pas, 'cfg': cfg, 'sampler_name': 'uni_pc', 'scheduler': 'simple',
                                                   'positive': ['93', 0], 'negative': ['93', 1], 'latent_image': ['93', 2], 'denoise': 1.0}},
        '80': {'class_type': 'VAEDecode', 'inputs': {'samples': ['3', 0], 'vae': ['39', 0]}},
        '82': {'class_type': 'CreateVideo', 'inputs': {'images': ['80', 0], 'fps': 16.0, 'audio': ['58', 0]}},
        '113': {'class_type': 'SaveVideo', 'inputs': {'video': ['82', 0], 'filename_prefix': prefixe, 'format': 'auto', 'format.codec': 'auto'}},
    }

def graphe_infinitetalk(image, audio1, w, h, sec, texte, audio2=None, masque1=None, masque2=None, graine=1, pas=6, prefixe='troupe/it', unet=None):
    L = longueur(sec, 25); deux = audio2 is not None
    g = {
        '13': chargeur(IT_FICHIERS['diffusion_models'], unet),
        '179': {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': ['13', 0], 'lora_name': IT_FICHIERS['loras'], 'strength_model': 1.0}},
        '112': {'class_type': 'ModelPatchLoader', 'inputs': {'name': IT_FICHIERS['model_patches']}},
        '16': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': IT_FICHIERS['text_encoders'], 'type': 'wan', 'device': 'default'}},
        '14': {'class_type': 'CLIPTextEncode', 'inputs': {'text': texte, 'clip': ['16', 0]}},
        '306': {'class_type': 'ConditioningZeroOut', 'inputs': {'conditioning': ['14', 0]}},
        '29': {'class_type': 'VAELoader', 'inputs': {'vae_name': IT_FICHIERS['vae']}},
        '26': {'class_type': 'AudioEncoderLoader', 'inputs': {'audio_encoder_name': IT_FICHIERS['audio_encoders']}},
        '24': {'class_type': 'LoadAudio', 'inputs': {'audio': audio1}},
        '25': {'class_type': 'AudioEncoderEncode', 'inputs': {'audio_encoder': ['26', 0], 'audio': ['24', 0]}},
        '32': {'class_type': 'LoadImage', 'inputs': {'image': image}},
        '129': {'class_type': 'WanInfiniteTalkToVideo', 'inputs': {
            'mode': 'two_speakers' if deux else 'single_speaker', 'model': ['179', 0], 'model_patch': ['112', 0], 'positive': ['14', 0], 'negative': ['306', 0],
            'vae': ['29', 0], 'width': w, 'height': h, 'length': L, 'audio_encoder_output_1': ['25', 0], 'motion_frame_count': 9, 'audio_scale': 1.0,
            'start_image': ['32', 0]}},
        '190': {'class_type': 'KSamplerSelect', 'inputs': {'sampler_name': 'euler'}},
        '191': {'class_type': 'CFGGuider', 'inputs': {'model': ['129', 0], 'positive': ['129', 1], 'negative': ['129', 2], 'cfg': 1.0}},
        '192': {'class_type': 'BasicScheduler', 'inputs': {'model': ['129', 0], 'scheduler': 'normal', 'steps': pas, 'denoise': 1.0}},
        '193': {'class_type': 'RandomNoise', 'inputs': {'noise_seed': graine}},
        '194': {'class_type': 'SamplerCustomAdvanced', 'inputs': {'noise': ['193', 0], 'guider': ['191', 0], 'sampler': ['190', 0], 'sigmas': ['192', 0], 'latent_image': ['129', 3]}},
        '119': {'class_type': 'VAEDecode', 'inputs': {'samples': ['194', 0], 'vae': ['29', 0]}},
        '140': {'class_type': 'CreateVideo', 'inputs': {'images': ['119', 0], 'fps': 25.0, 'audio': ['24', 0]}},
        '141': {'class_type': 'SaveVideo', 'inputs': {'video': ['140', 0], 'filename_prefix': prefixe, 'format': 'auto', 'format.codec': 'auto'}},
    }
    if deux:
        g['90'] = {'class_type': 'LoadAudio', 'inputs': {'audio': audio2}}
        g['93'] = {'class_type': 'AudioEncoderEncode', 'inputs': {'audio_encoder': ['26', 0], 'audio': ['90', 0]}}
        g['m1'] = {'class_type': 'LoadImageMask', 'inputs': {'image': masque1, 'channel': 'red'}}
        g['m2'] = {'class_type': 'LoadImageMask', 'inputs': {'image': masque2, 'channel': 'red'}}
        g['129']['inputs'].update({'mode.audio_encoder_output_2': ['93', 0], 'mode.mask_1': ['m1', 0], 'mode.mask_2': ['m2', 0]})
    return g

def envoie(chemin, url=None):
    """dépose un fichier (image, son, masque) dans le dossier d'entrée du serveur ; rend le nom à utiliser dans le graphe."""
    b = uuid.uuid4().hex; nom = os.path.basename(chemin); data = open(chemin, 'rb').read()
    corps = (f'--{b}\r\nContent-Disposition: form-data; name="image"; filename="{nom}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode() + data + \
            (f'\r\n--{b}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{b}--\r\n').encode()
    r = urllib.request.Request(f'{url or URL}/upload/image', data=corps, headers={'Content-Type': f'multipart/form-data; boundary={b}'})
    return json.loads(urllib.request.urlopen(r, timeout=120).read())['name']

def soumet(graphe, url=None):
    r = urllib.request.Request(f'{url or URL}/prompt', data=json.dumps({'prompt': graphe, 'client_id': 'troupe'}).encode(), headers={'Content-Type': 'application/json'})
    try: return json.loads(urllib.request.urlopen(r, timeout=60).read())
    except urllib.error.HTTPError as e: return json.loads(e.read())

def attend_video(pid, sortie, delai=7200, url=None):
    U = url or URL
    t0 = time.time()
    while time.time() - t0 < delai:
        h = json.loads(urllib.request.urlopen(f'{U}/history/{pid}', timeout=60).read())
        if pid in h:
            st = h[pid].get('status', {})
            if st.get('status_str') == 'error': raise RuntimeError(json.dumps(st.get('messages', [])[-1:], ensure_ascii=False)[:600])
            for nid, out in h[pid].get('outputs', {}).items():
                for k in ('videos', 'images', 'gifs'):
                    for f in out.get(k, []):
                        q = urllib.parse.urlencode({'filename': f['filename'], 'subfolder': f.get('subfolder', ''), 'type': f.get('type', 'output')})
                        open(sortie, 'wb').write(urllib.request.urlopen(f'{U}/view?{q}', timeout=300).read()); return sortie
        time.sleep(5)
    raise TimeoutError('vidéo non rendue dans le délai')

if __name__ == '__main__':   # python3 comfy_wan.py manifeste → liste des fichiers à télécharger (pour l'installateur)
    import sys
    if sys.argv[1:] == ['manifeste']:
        print(json.dumps({k: [{'depot': d, 'chemin': c, 'dossier': f, 'go': g, 'url': f'https://huggingface.co/{d}/resolve/main/{c}'} for d, c, f, g in v] for k, v in TELECHARGEMENTS.items()}, ensure_ascii=False, indent=1))
