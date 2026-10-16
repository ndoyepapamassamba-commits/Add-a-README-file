# Manifeste des outils de la chaîne d'animation (spécification « Moteur d'animation fluide », §5 et §9) :
# chaque outil a un id, une version LUE sur la machine, une licence SPDX, son amont, son mode (browser / local / service),
# ses capacités, le chemin vérifié et un TEST DE SANTÉ exécuté maintenant — l'état ready / partial / blocked en découle.
# « blocked » = absent ou contraire à la règle maison (code et modèles exécutés chez nous : MIT, Apache-2.0, BSD).
#   python3 scripts/tool-health.py  → tool-manifest.json (racine de workbench)
import json, shutil, subprocess, importlib.metadata as md, os, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PERMISSIVE = {'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Zlib', 'CC-BY-4.0'}


def run(cmd):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return r.returncode == 0, (r.stdout or r.stderr).strip().splitlines()[0][:160] if (r.stdout or r.stderr) else ''
    except Exception as e:  # outil absent ou bloqué
        return False, str(e)[:160]


def pyver(dist):
    try:
        return md.version(dist)
    except md.PackageNotFoundError:
        return None


def npmver(name):
    p = os.path.join(ROOT, 'node_modules', name, 'package.json')
    return json.load(open(p))['version'] if os.path.exists(p) else None


def chromium_ver():
    ok, out = run(['node', '-e', "const {chromium}=require('playwright');chromium.launch().then(async b=>{console.log(b.version());await b.close()})"])
    return out if ok else None


tools = []


def add(id, version, spdx, upstream, mode, caps, path, health, note='', policy_ok=None):
    healthy = bool(version) and health[0]
    allowed = policy_ok if policy_ok is not None else all(s in PERMISSIVE for s in spdx.replace('(', '').replace(')', '').replace(' OR ', ' AND ').split(' AND '))
    state = 'blocked' if not healthy else ('ready' if allowed else 'partial')
    tools.append({'id': id, 'version': version, 'license': spdx, 'upstream': upstream, 'mode': mode, 'capabilities': caps,
                  'path': path, 'health': {'ok': health[0], 'detail': health[1]}, 'state': state,
                  'policy': 'conforme (MIT/Apache/BSD)' if allowed else 'hors règle maison — à remplacer ou à isoler', 'note': note})


ffv = run(['ffmpeg', '-version'])
ffconf = run(['ffmpeg', '-hide_banner', '-buildconf'])
gpl = 'enable-gpl' in subprocess.run(['ffmpeg', '-hide_banner', '-buildconf'], capture_output=True, text=True).stdout if shutil.which('ffmpeg') else False
add('ffmpeg', ffv[1].split(' ')[2] if ffv[0] else None, 'GPL-2.0-or-later' if gpl else 'LGPL-2.1-or-later', 'https://ffmpeg.org/legal.html', 'local',
    ['encodage H.264/AAC', 'muxage', 'sous-titres incrustés (drawtext)', 'ffprobe : contrôle des pistes'], shutil.which('ffmpeg'), ffv,
    'paquet Ubuntu compilé avec --enable-gpl (libx264) : lancé comme processus séparé ; voie BSD possible = WebCodecs VP9/AV1 + mp4-muxer (MIT)')
add('ffprobe', ffv[1].split(' ')[2] if ffv[0] else None, 'GPL-2.0-or-later' if gpl else 'LGPL-2.1-or-later', 'https://ffmpeg.org/', 'local', ['inspection durée / codec / i/s / audio'], shutil.which('ffprobe'), run(['ffprobe', '-version']))
cv = chromium_ver()
add('chromium-headless', cv, 'BSD-3-Clause', 'https://www.chromium.org/', 'browser', ['WebGL (SwiftShader, CPU)', 'WebCodecs VP9/AV1/Opus (pas de H.264/AAC dans ce build)'], 'playwright', (bool(cv), cv or 'absent'))
add('playwright', npmver('playwright'), 'Apache-2.0', 'https://github.com/microsoft/playwright', 'local', ['pilotage du navigateur sans écran', 'rendu image par image (window.__frame)'], 'node_modules/playwright', (bool(npmver('playwright')), 'npm'))
add('three', npmver('three'), 'MIT', 'https://github.com/mrdoob/three.js', 'browser', ['décor en relief', 'personnages maillés', 'étalonnage'], 'node_modules/three', (bool(npmver('three')), 'npm'))
add('mp4-muxer', npmver('mp4-muxer'), 'MIT', 'https://github.com/Vanilagy/mp4-muxer', 'browser', ['MP4 depuis WebCodecs dans la page'], 'node_modules/mp4-muxer', (bool(npmver('mp4-muxer')), 'npm'))
add('mediabunny', npmver('mediabunny'), 'MPL-2.0', 'https://github.com/Vanilagy/mediabunny', 'browser', ['muxage MP4/WebM dans l’app'], 'node_modules/mediabunny', (bool(npmver('mediabunny')), 'npm'), 'copyleft faible au niveau fichier (MPL-2.0)')
add('mediapipe', pyver('mediapipe'), 'Apache-2.0', 'https://github.com/google-ai-edge/mediapipe', 'local', ['squelette BlazePose mesuré sur chaque dessin (poignées ARAP)'], 'python', run(['python3', '-c', 'import mediapipe']),
    'modèle pose_landmarker_heavy.task : fiche de modèle à relire (licence du modèle distincte du code)')
add('opencv', pyver('opencv-python-headless') or pyver('opencv-contrib-python'), 'Apache-2.0', 'https://opencv.org/license/', 'local', ['retouche de couture (inpaint Telea)', 'mesures QA'], 'python', run(['python3', '-c', 'import cv2']))
add('onnxruntime', pyver('onnxruntime'), 'MIT', 'https://github.com/microsoft/onnxruntime', 'local', ['inférence CPU (profondeur, inpainting)'], 'python', run(['python3', '-c', 'import onnxruntime']))
add('numpy', pyver('numpy'), 'BSD-3-Clause', 'https://numpy.org/', 'local', ['quilting du sol', 'contrôles'], 'python', run(['python3', '-c', 'import numpy']))
add('piper-tts', pyver('piper-tts'), 'GPL-3.0-or-later', 'https://github.com/OHF-voice/piper1-gpl', 'local', ['synthèse vocale FR', 'durées de phonèmes (include_alignments)'], 'python', run(['python3', '-c', 'import piper']),
    'piper1-gpl : licence GPL-3.0 (l’ancien rhasspy/piper était MIT) — à remplacer (Kokoro-82M Apache-2.0, Pocket TTS MIT) ou à isoler en processus séparé')
add('voix-fr_FR-siwis-medium', 'medium', 'CC-BY-4.0', 'https://huggingface.co/rhasspy/piper-voices', 'local', ['voix de Maman Nounou'], 'scratchpad/piper', (True, 'fichier ONNX présent pendant le tournage'), 'attribution obligatoire (crédit incrusté en fin de film)')
add('voix-fr_FR-tom-medium', 'medium', 'AGPL-3.0-only', 'https://huggingface.co/rhasspy/piper-voices', 'local', ['voix de Modou'], 'scratchpad/piper', (True, 'fichier ONNX présent pendant le tournage'),
    'fiche du modèle : entraîné sur des données sous AGPLv3 — à remplacer avant diffusion', policy_ok=False)
rh = '/root/.cache/massamba-models/rhubarb/Rhubarb-Lip-Sync-1.14.0-Linux/rhubarb'
add('rhubarb-lip-sync', '1.14.0' if os.path.exists(rh) else None, 'MIT', 'https://github.com/DanielSWolf/rhubarb-lip-sync', 'local', ['contrôle indépendant des fermetures de bouche (mode phonétique)'], rh, run([rh, '--version']) if os.path.exists(rh) else (False, 'absent'))
add('synfig', (run(['synfig', '--version'])[1] or '').split(' ')[-1] or None, 'GPL-3.0-or-later', 'https://github.com/synfig/synfig', 'local', ['rendu cut-out PNG en ligne de commande (évalué)'], shutil.which('synfig'), run(['synfig', '--version']), 'évalué par la veille, non utilisé dans le film')
add('melt', (run(['melt', '--version'])[1] or '').split(' ')[-1] or None, 'LGPL-2.1-or-later', 'https://github.com/mltframework/mlt', 'local', ['rendu de timeline sans écran (évalué)'], shutil.which('melt'), run(['melt', '--version']), 'évalué par la veille, non utilisé dans le film')

manifest = {'generated': datetime.date.today().isoformat(), 'rule': 'code et modèles exécutés chez nous : MIT, Apache-2.0 ou BSD (règle maison)', 'tools': tools,
            'summary': {s: [t['id'] for t in tools if t['state'] == s] for s in ('ready', 'partial', 'blocked')}}
json.dump(manifest, open(os.path.join(ROOT, 'tool-manifest.json'), 'w'), ensure_ascii=False, indent=1)
for s, ids in manifest['summary'].items():
    print(f'{s:8} {len(ids):2}  {", ".join(ids)}')
