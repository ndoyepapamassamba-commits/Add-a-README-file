# NOYAU ECHOMIMICV3 FLASH (16/10/2026) — second moteur d'animation, même contrat que noyau_kaggle.py : il lit le paquet
# de plans (plans.json + <cle>.png + <cle>.wav) dans NOYAU_ENTREE et écrit <cle>.mp4 + mesures.json + journal.txt dans
# NOYAU_SORTIE. EchoMimicV3 (Ant Group, code et poids Apache-2.0) sur Wan2.1-Fun-V1.1-1.3B-InP (Apache-2.0), encodeur
# audio chinese-wav2vec2-base (MIT) : environ dix fois plus petit que Wan2.2-S2V 14B.
# Adapté à la carte T4 gratuite de Colab (15 Go, pas de bf16) et à ses 12 Go de mémoire vive :
#   - l'encodeur de texte (umt5-xxl, 11 Go) n'est chargé qu'UNE fois, en lecture directe du disque (mmap), dans un
#     processus séparé : la consigne de jeu est la même pour tous les plans, ses vecteurs sont gardés puis il est libéré ;
#   - l'animation tourne en demi-précision (fp16) ; si une vidéo sort noire (débordement fp16), bascule en fp32.
import gc, glob, json, math, os, subprocess, sys, threading, time

ENTREE = os.environ.get('NOYAU_ENTREE', '/content/paquet')
SORTIE = os.environ.get('NOYAU_SORTIE', '/content/sortie'); os.makedirs(SORTIE, exist_ok=True)
R = '/tmp/emv3'; CODE = f'{R}/code'; BASE = f'{R}/Wan2.1-Fun-V1.1-1.3B-InP'
FLASH = f'{R}/flash/echomimicv3-flash-pro/diffusion_pytorch_model.safetensors'; W2V = f'{R}/chinese-wav2vec2-base'
COMMIT = '7e89489ca51c0d008fc1963ec6c03fc5bd0b9397'           # antgroup/echomimic_v3, lu chez nous le 16/10/2026
TEXTE = os.environ.get('EMV3_TEXTE', 'An African cartoon character in a 3D animated film is speaking naturally, with expressive face, head and hand gestures; the others listen. The background stays the same.')
NEG = os.environ.get('EMV3_NEG', 'blurry, deformed face, distorted hands, extra limbs, text, watermark, static image, flicker')
PAS, CFG_TEXTE, CFG_AUDIO, FPS, MAXI = 8, 6.0, 3.0, 25, 101
JOURNAL = open(f'{SORTIE}/journal.txt', 'a', encoding='utf-8')
M = {'moteur': 'echomimicv3-flash', 'debut': time.strftime('%Y-%m-%d %H:%M:%S'), 'etapes': {}, 'plans': {}, 'vram_max_mio': 0, 'ram_min_libre_go': None}

def dit(*a):
    t = time.strftime('%H:%M:%S') + ' ' + ' '.join(str(x) for x in a); print(t, flush=True); JOURNAL.write(t + '\n'); JOURNAL.flush()
def sauve(): json.dump(M, open(f'{SORTIE}/mesures.json', 'w'), ensure_ascii=False, indent=1)
def lance(cmd, **kw):
    dit('$', ' '.join(cmd)); r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode: dit('  code', r.returncode, (r.stdout + r.stderr)[-2000:])
    return r
def etape(nom, fn):
    t = time.time(); r = fn(); M['etapes'][nom] = round(time.time() - t, 1); sauve(); dit(f'étape {nom} : {M["etapes"][nom]} s'); return r
def surveille():
    while True:
        try:
            u = subprocess.run(['nvidia-smi', '--query-gpu=memory.used', '--format=csv,noheader,nounits'], capture_output=True, text=True).stdout.split()
            if u: M['vram_max_mio'] = max([M['vram_max_mio']] + [int(x) for x in u])
            libre = int([l for l in open('/proc/meminfo') if l.startswith('MemAvailable')][0].split()[1]) / 2 ** 20
            M['ram_min_libre_go'] = round(libre if M['ram_min_libre_go'] is None else min(M['ram_min_libre_go'], libre), 2)
        except Exception: pass
        time.sleep(5)

pj = sorted(glob.glob(f'{ENTREE}/**/plans.json', recursive=True))
if not pj: dit('paquet introuvable dans', ENTREE); sys.exit(1)
PAQ = os.path.dirname(pj[0]); PLANS = json.load(open(pj[0]))
M.update(nb_plans=len(PLANS), secondes_a_animer=round(sum(p['t1'] - p['t0'] for p in PLANS), 2)); sauve()
threading.Thread(target=surveille, daemon=True).start()

def installe():
    os.makedirs(R, exist_ok=True)
    if not os.path.isdir(f'{CODE}/.git'):
        lance(['git', 'init', '-q', CODE]); lance(['git', '-C', CODE, 'remote', 'add', 'origin', 'https://github.com/antgroup/echomimic_v3.git'])
        if lance(['git', '-C', CODE, 'fetch', '-q', '--depth', '1', 'origin', COMMIT]).returncode: lance(['git', '-C', CODE, 'fetch', '-q', '--depth', '1', 'origin', 'HEAD'])
        lance(['git', '-C', CODE, 'checkout', '-q', 'FETCH_HEAD'])
    # seulement ce que l'inférence Flash importe (pas tensorflow / retina-face / decord du fichier requirements)
    lance([sys.executable, '-m', 'pip', 'install', '-q', 'diffusers>=0.30.1,<1', 'transformers>=4.46.2,<5', 'accelerate>=0.25.0', 'omegaconf',
           'einops', 'imageio[ffmpeg]', 'librosa', 'pyloudnorm', 'ftfy', 'sentencepiece', 'opencv-python-headless', 'scipy', 'safetensors', 'huggingface_hub'])

def telecharge():
    from huggingface_hub import hf_hub_download, snapshot_download
    snapshot_download('alibaba-pai/Wan2.1-Fun-V1.1-1.3B-InP', local_dir=BASE, max_workers=8)
    hf_hub_download('BadToBest/EchoMimicV3', 'echomimicv3-flash-pro/diffusion_pytorch_model.safetensors', local_dir=f'{R}/flash')
    snapshot_download('TencentGameMate/chinese-wav2vec2-base', local_dir=W2V, allow_patterns=['config.json', 'preprocessor_config.json', 'pytorch_model.bin'])
    M['go_telecharges'] = round(sum(os.path.getsize(f) for f in glob.glob(f'{R}/**/*', recursive=True) if os.path.isfile(f)) / 1e9, 2)

TEXTE_PY = r'''
import sys, inspect, torch, accelerate
from omegaconf import OmegaConf
sys.path.insert(0, sys.argv[1])
from src.wan_text_encoder import WanT5EncoderModel
from transformers import AutoTokenizer
code, base, sortie, texte, neg = sys.argv[1:6]
cfg = OmegaConf.to_container(OmegaConf.load(f"{code}/config/config.yaml")["text_encoder_kwargs"])
ok = set(inspect.signature(WanT5EncoderModel.__init__).parameters) - {"self", "cls"}
with accelerate.init_empty_weights():
    m = WanT5EncoderModel(**{k: v for k, v in cfg.items() if k in ok})
try: sd = torch.load(f"{base}/{cfg['text_encoder_subpath']}", map_location="cpu", mmap=True, weights_only=True)   # lecture directe du disque
except Exception: sd = torch.load(f"{base}/{cfg['text_encoder_subpath']}", map_location="cpu", weights_only=False)
manque, inattendu = m.load_state_dict(sd, strict=False, assign=True)
print("encodeur de texte : clés manquantes", len(manque), "inattendues", len(inattendu), flush=True)
m = m.to(torch.bfloat16).eval()
try: tok = AutoTokenizer.from_pretrained(f"{base}/{cfg['tokenizer_subpath']}")
except Exception: tok = AutoTokenizer.from_pretrained("google/umt5-xxl")
out = []
with torch.no_grad():
    for p in (texte, neg):
        t = tok([p], padding="max_length", max_length=512, truncation=True, add_special_tokens=True, return_tensors="pt")
        n = int(t.attention_mask.gt(0).sum())
        e = m(t.input_ids, attention_mask=t.attention_mask)[0][0, :n].float()
        print("vecteurs", tuple(e.shape), "fini" if torch.isfinite(e).all() else "NON FINI", flush=True)
        out.append(e)
torch.save(out, sortie)
'''
def texte():
    open(f'{R}/texte.py', 'w').write(TEXTE_PY)
    r = lance([sys.executable, f'{R}/texte.py', CODE, BASE, f'{R}/texte.pt', TEXTE, NEG])
    dit((r.stdout or '')[-600:])
    if r.returncode or not os.path.isfile(f'{R}/texte.pt'): raise SystemExit('encodage du texte impossible : voir journal.txt')

if not os.environ.get('NOYAU_ESSAI'):
    etape('installation', installe); etape('telechargement', telecharge); etape('texte', texte)

# ---------- animation ----------
sys.path.insert(0, CODE)
import numpy as np, torch, librosa, pyloudnorm as pyln
from omegaconf import OmegaConf
from PIL import Image
from einops import rearrange
from safetensors.torch import load_file
from transformers import Wav2Vec2FeatureExtractor
from src.wan_vae import AutoencoderKLWan
from src.wan_image_encoder import CLIPModel
from src.wan_transformer3d_audio_2512 import WanTransformerAudioMask3DModel as WanTransformer
from src.pipeline_wan_fun_inpaint_audio_2512 import WanFunInpaintAudioPipeline
from src.utils import filter_kwargs, get_image_to_video_latent2, color_transfer
from src.fm_solvers_unipc import FlowUniPCMultistepScheduler
from src.cache_utils import get_teacache_coefficients
from src.wav2vec2 import Wav2Vec2Model

class TexteFixe(torch.nn.Module):
    """tient la place de l'encodeur de texte (11 Go) : la chaîne lui donne les jetons de la consigne (ou de la consigne
    négative) et reçoit les vecteurs déjà calculés une fois pour toutes, complétés par des zéros jusqu'à 512 jetons."""
    def __init__(self, dt, tok, vecteurs):
        super().__init__(); self.register_buffer('z', torch.zeros(1, dtype=dt)); self.table = {}
        for texte, v in vecteurs.items():
            ids = tok([texte], padding='max_length', max_length=512, truncation=True, add_special_tokens=True, return_tensors='pt').input_ids[0]
            self.table[tuple(ids.tolist())] = v
    @property
    def dtype(self): return self.z.dtype
    @property
    def device(self): return self.z.device                # la chaîne déduit son appareil du premier module
    def forward(self, input_ids, attention_mask=None):
        sortie = []
        for ids in input_ids:
            v = self.table.get(tuple(ids.tolist()))
            if v is None: raise KeyError('consigne inconnue : encodez-la d\'abord (étape texte)')
            x = torch.zeros(512, v.shape[-1], dtype=self.dtype, device=input_ids.device); x[:v.shape[0]] = v.to(x.device, self.dtype); sortie.append(x)
        return (torch.stack(sortie),)

def tokeniseur():
    from transformers import AutoTokenizer
    try: return AutoTokenizer.from_pretrained(f'{BASE}/google/umt5-xxl')
    except Exception: return AutoTokenizer.from_pretrained('google/umt5-xxl')

def charge(dt):
    t0 = time.time(); cfg = OmegaConf.load(f'{CODE}/config/config.yaml')
    tr = WanTransformer.from_pretrained(os.path.join(BASE, cfg['transformer_additional_kwargs'].get('transformer_subpath', 'transformer')),
                                        transformer_additional_kwargs=OmegaConf.to_container(cfg['transformer_additional_kwargs']), low_cpu_mem_usage=True, torch_dtype=dt)
    sd = load_file(FLASH); sd = sd.get('state_dict', sd); m, u = tr.load_state_dict(sd, strict=False); del sd; gc.collect()
    dit(f'poids Flash : {len(m)} clés manquantes, {len(u)} inattendues'); tr = tr.to('cuda', dt)
    vae = AutoencoderKLWan.from_pretrained(os.path.join(BASE, cfg['vae_kwargs'].get('vae_subpath', 'vae')), additional_kwargs=OmegaConf.to_container(cfg['vae_kwargs'])).to('cuda', dt)
    clip = CLIPModel.from_pretrained(os.path.join(BASE, cfg['image_encoder_kwargs'].get('image_encoder_subpath', 'image_encoder'))).to(dt).eval().to('cuda'); gc.collect()
    sk = OmegaConf.to_container(cfg['scheduler_kwargs']); sk['shift'] = 1
    pe, ne = torch.load(f'{R}/texte.pt'); tok = tokeniseur()
    pipe = WanFunInpaintAudioPipeline(transformer=tr, vae=vae, tokenizer=tok, text_encoder=TexteFixe(dt, tok, {TEXTE: pe, NEG: ne}), scheduler=FlowUniPCMultistepScheduler(**filter_kwargs(FlowUniPCMultistepScheduler, sk)), clip_image_encoder=clip)
    pipe.to('cuda')
    coef = get_teacache_coefficients(BASE)
    if coef is not None: tr.enable_teacache(coef, PAS, 0.1, num_skip_start_steps=5, offload=False)
    dit(f'modèles chargés en {time.time() - t0:.0f} s ({dt})'); return pipe

def ecrit(s, n, wav, out):
    """images de la chaîne (valeurs 0-1) → couleurs recalées sur la première image (comme l'original) → MP4 + voix en un seul
    passage ffmpeg (sans imageio, dont les versions récentes refusent les images PIL)."""
    fr = (s[0, :, :n].permute(1, 2, 3, 0).float().clamp(0, 1).cpu().numpy() * 255).astype(np.uint8)
    fr = [fr[0]] + [np.uint8(color_transfer(np.uint8(f), np.uint8(fr[0]))) for f in fr[1:]]
    h, w = fr[0].shape[:2]
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', str(FPS), '-i', '-',
                          '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', '-shortest', out], stdin=subprocess.PIPE)
    for f in fr: p.stdin.write(np.ascontiguousarray(f).tobytes())
    p.stdin.close()
    if p.wait(): raise RuntimeError('écriture de la vidéo impossible (ffmpeg)')

def noire(mp4):
    import cv2
    cap = cv2.VideoCapture(mp4); fr = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fr.append(f)
    if not fr: return True
    a = np.stack(fr[::max(1, len(fr) // 8)]).astype(np.float32); return bool(a.mean() < 6 or a.std() < 2)

t0 = time.time()
gpu = subprocess.run(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader'], capture_output=True, text=True).stdout.strip()
M['carte'] = gpu; dit('carte :', gpu or 'aucune')
if not gpu: dit('aucune carte graphique : Exécution → Modifier le type d’exécution → GPU T4'); sauve(); sys.exit(1)
DT = torch.float16
pipe = etape('chargement', lambda: charge(DT))
enc = Wav2Vec2Model.from_pretrained(W2V, local_files_only=True).to('cpu'); enc.feature_extractor._freeze_parameters()
fx = Wav2Vec2FeatureExtractor.from_pretrained(W2V, local_files_only=True)

def anime(p):
    global pipe, DT
    k = p['cle']; img, wav = f'{PAQ}/{k}.png', f'{PAQ}/{k}.wav'; out = f'{SORTIE}/{k}.mp4'
    if os.path.isfile(out): return
    t = time.time(); im = Image.open(img).convert('RGB')
    dur = librosa.get_duration(path=wav); n = min(int(dur * FPS), MAXI); n = int((n - 1) // 4 * 4) + 1
    rec = {'qui': p.get('qui'), 'secondes_video': round(n / FPS, 2), 'images': n}
    try:
        a, sr = librosa.load(wav, sr=16000)
        lu = pyln.Meter(sr).integrated_loudness(a)
        if abs(lu) <= 100: a = pyln.normalize.loudness(a, lu, -23)
        a = a[:int(n / 25 * sr)]
        feat = torch.from_numpy(np.squeeze(fx(a, sampling_rate=sr).input_values)).float().unsqueeze(0)
        with torch.no_grad(): h = enc(feat, seq_len=int(n), output_hidden_states=True)
        emb = rearrange(torch.stack(h.hidden_states[1:], dim=1).squeeze(0), 'b s d -> s b d').cpu().to('cuda', DT)
        idx = torch.clamp(torch.arange(0, n).unsqueeze(1) + (torch.arange(5) - 2).unsqueeze(0), 0, emb.shape[0] - 1)
        emb = emb[idx].unsqueeze(0)
        w, hh = im.size; H, W = hh // 16 * 16, w // 16 * 16
        vid, mask, clip_img = get_image_to_video_latent2(im, None, video_length=n, sample_size=[H, W])
        with torch.no_grad():
            s = pipe(TEXTE, num_frames=n, negative_prompt=NEG,
                     audio_embeds=emb, audio_scale=1.0, ip_mask=None, use_un_ip_mask=False, height=H, width=W,
                     generator=torch.Generator(device='cuda').manual_seed(43), neg_scale=1.0, neg_steps=0, use_dynamic_cfg=False, use_dynamic_acfg=False,
                     guidance_scale=CFG_TEXTE, audio_guidance_scale=CFG_AUDIO, num_inference_steps=PAS, video=vid, mask_video=mask,
                     clip_image=clip_img, cfg_skip_ratio=0, shift=5.0).videos
        ecrit(s, n, wav, out)
        if noire(out):
            rec['statut'] = 'noire'
            if DT == torch.float16:            # débordement fp16 : on recharge en fp32 (plus lent) et on refait ce plan
                dit('vidéo noire en fp16 : bascule en fp32'); os.remove(out); del pipe; gc.collect(); torch.cuda.empty_cache()
                DT = torch.float32; pipe = charge(DT); M['bascule_fp32'] = True; return anime(p)
        else: rec['statut'] = 'ok'
    except Exception as e:
        rec.update(statut='erreur', erreur=str(e)[-600:])
    rec['secondes_calcul'] = round(time.time() - t, 1)
    if rec.get('statut') == 'ok': rec['secondes_calcul_par_seconde'] = round(rec['secondes_calcul'] / rec['secondes_video'], 1)
    M['plans'][k] = rec; sauve(); dit(k, rec)

for p in PLANS: anime(p)
ok = [k for k, r in M['plans'].items() if r.get('statut') == 'ok']
M.update(fin=time.strftime('%Y-%m-%d %H:%M:%S'), secondes_animation=round(time.time() - t0, 1), plans_ok=len(ok)); sauve()
dit(f'{len(ok)}/{len(PLANS)} plans animés par EchoMimicV3 Flash en {M["secondes_animation"]} s')
JOURNAL.close()
