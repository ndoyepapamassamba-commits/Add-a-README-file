#!/usr/bin/env python3
"""PONT « app → Blender local » : un petit serveur HTTP sur VOTRE machine (127.0.0.1 seulement) que l'app MASSAMBA
Workbench appelle pour rendre ses scènes 3D avec VOTRE Blender (GPU, EEVEE) — gratuit, sans cloud.

Démarrage (Blender installé) :
  python3 scripts/blender-bridge.py --blender "C:/Program Files/Blender Foundation/Blender 4.5/blender.exe"
  python3 scripts/blender-bridge.py --blender /Applications/Blender.app/Contents/MacOS/Blender
Sans Blender installé mais avec le module Python `bpy` (pip install bpy) : lancer sans --blender (rendu CPU, plus lent).

Options : --port 8765 (défaut) · --token SECRET (exigé dans l'en-tête X-Bridge-Token) · --out DOSSIER des rendus.
Dans l'app : Réglages → « Pont Blender local » = http://127.0.0.1:8765 ; Studio 3D Pro → « Rendre dans Blender local » ;
outil `blender.render` pour l'agent.

API (JSON, CORS ouvert car le serveur n'écoute qu'en local) :
  GET  /health                  → { ok, mode: "blender" | "bpy", blender, jobs }
  POST /render                  → { id }   corps : { script? | glb_base64?, name?, seconds, fps, width, height, engine, orbit, still_only }
  GET  /jobs/<id>               → { status: running | done | error, frames, report?, log }
  GET  /jobs/<id>/video         → video/mp4      GET /jobs/<id>/verify → image/png
Un seul rendu à la fois par défaut (--parallel N pour plus). Aucune donnée n'est envoyée ailleurs que sur votre machine.
"""
import argparse, base64, json, os, re, shutil, subprocess, sys, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
RENDER = os.path.join(HERE, 'blender-render.py')
JOBS: dict[str, dict] = {}
LOCK = threading.Lock()
ARGS = None


def blender_version(blender: str | None) -> str:
    if blender:
        try:
            out = subprocess.run([blender, '--version'], capture_output=True, text=True, timeout=30).stdout
            return out.splitlines()[0].strip() if out else 'Blender (version inconnue)'
        except Exception as e:  # noqa: BLE001
            return f'Blender injoignable : {e}'
    try:
        out = subprocess.run([sys.executable, '-c', 'import bpy; print(bpy.app.version_string)'], capture_output=True, text=True, timeout=120).stdout
        return f'bpy {out.strip()}' if out.strip() else 'module bpy absent'
    except Exception as e:  # noqa: BLE001
        return f'module bpy absent ({e})'


def run_job(job: dict) -> None:
    out = job['dir']
    cmd_tail = [job['input'], '--out', out, '--seconds', str(job['seconds']), '--fps', str(job['fps']), '--width', str(job['width']), '--height', str(job['height']), '--engine', job['engine']]
    if job.get('orbit'):
        cmd_tail.append('--orbit')
    if job.get('still_only'):
        cmd_tail.append('--still-only')
    if job.get('glb'):
        cmd_tail = ['--glb'] + cmd_tail
    cmd = [ARGS.blender, '-b', '--python', RENDER, '--'] + cmd_tail if ARGS.blender else [sys.executable, RENDER] + cmd_tail
    job['status'] = 'running'
    job['started'] = time.time()
    with open(os.path.join(out, 'log.txt'), 'w', encoding='utf-8') as log:
        try:
            p = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, timeout=ARGS.timeout)
            code = p.returncode
        except subprocess.TimeoutExpired:
            code = -1
            log.write(f'\n[bridge] délai dépassé ({ARGS.timeout} s)\n')
    rep = os.path.join(out, 'report.json')
    if code == 0 and os.path.isfile(rep):
        job['report'] = json.load(open(rep, encoding='utf-8'))
        job['status'] = 'done'
    else:
        job['status'] = 'error'
        job['error'] = f'rendu terminé avec le code {code}'
    job['finished'] = time.time()


def worker() -> None:
    while True:
        with LOCK:
            running = sum(1 for j in JOBS.values() if j['status'] == 'running')
            nxt = next((j for j in JOBS.values() if j['status'] == 'queued'), None) if running < ARGS.parallel else None
            if nxt:
                nxt['status'] = 'running'
        if nxt:
            run_job(nxt)
        else:
            time.sleep(0.3)


class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):  # quieter log
        sys.stderr.write('[bridge] ' + (fmt % a) + '\n')

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Bridge-Token')

    def _json(self, code: int, obj: dict):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path: str, mime: str):
        if not os.path.isfile(path):
            return self._json(404, {'error': 'fichier absent'})
        data = open(path, 'rb').read()
        self.send_response(200)
        self._cors()
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _auth(self) -> bool:
        if not ARGS.token:
            return True
        if self.headers.get('X-Bridge-Token') == ARGS.token:
            return True
        self._json(401, {'error': 'jeton X-Bridge-Token invalide'})
        return False

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if not self._auth():
            return
        if self.path == '/health':
            return self._json(200, {'ok': True, 'mode': 'blender' if ARGS.blender else 'bpy', 'blender': ARGS.version, 'jobs': len(JOBS), 'parallel': ARGS.parallel})
        m = re.match(r'^/jobs/([a-f0-9]{32})(/(video|verify|log))?$', self.path)
        if not m:
            return self._json(404, {'error': 'route inconnue'})
        job = JOBS.get(m.group(1))
        if not job:
            return self._json(404, {'error': 'tâche inconnue'})
        if m.group(3) == 'video':
            return self._file(os.path.join(job['dir'], 'video.mp4'), 'video/mp4')
        if m.group(3) == 'verify':
            return self._file(os.path.join(job['dir'], 'verify.png'), 'image/png')
        log_path = os.path.join(job['dir'], 'log.txt')
        log = open(log_path, encoding='utf-8', errors='replace').read()[-4000:] if os.path.isfile(log_path) else ''
        if m.group(3) == 'log':
            return self._json(200, {'log': log})
        frames_dir = os.path.join(job['dir'], 'frames')
        frames = len(os.listdir(frames_dir)) if os.path.isdir(frames_dir) else 0
        return self._json(200, {'id': job['id'], 'status': job['status'], 'frames': frames, 'total': job['total'], 'report': job.get('report'), 'error': job.get('error'), 'log': log[-1200:], 'elapsed_s': round(time.time() - job.get('started', time.time()), 1)})

    def do_POST(self):
        if not self._auth():
            return
        if self.path != '/render':
            return self._json(404, {'error': 'route inconnue'})
        n = int(self.headers.get('Content-Length') or 0)
        if n > 200 * 1024 * 1024:
            return self._json(413, {'error': 'corps trop grand (200 Mo max)'})
        try:
            body = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception as e:  # noqa: BLE001
            return self._json(400, {'error': f'JSON invalide : {e}'})
        script, glb = body.get('script'), body.get('glb_base64')
        if not script and not glb:
            return self._json(400, {'error': 'script (bpy) ou glb_base64 requis'})
        jid = uuid.uuid4().hex
        d = os.path.join(ARGS.out, jid)
        os.makedirs(d, exist_ok=True)
        if glb:
            inp = os.path.join(d, 'scene.glb')
            open(inp, 'wb').write(base64.b64decode(glb))
        else:
            inp = os.path.join(d, 'scene.py')
            open(inp, 'w', encoding='utf-8').write(str(script))
        seconds = float(body.get('seconds') or 4)
        fps = int(body.get('fps') or 24)
        job = {
            'id': jid, 'dir': d, 'input': inp, 'glb': bool(glb), 'status': 'queued', 'name': re.sub(r'[^\w.-]+', '-', str(body.get('name') or 'scene'))[:60],
            'seconds': seconds, 'fps': fps, 'width': int(body.get('width') or 720), 'height': int(body.get('height') or 1280),
            'engine': str(body.get('engine') or ('EEVEE' if ARGS.blender else 'CYCLES')), 'orbit': bool(body.get('orbit')), 'still_only': bool(body.get('still_only')),
            'total': 0 if body.get('still_only') else max(1, int(round(seconds * fps))),
        }
        with LOCK:
            JOBS[jid] = job
        return self._json(202, {'id': jid, 'status': 'queued'})


def main() -> int:
    global ARGS
    ap = argparse.ArgumentParser(description='Pont app → Blender local (MASSAMBA Workbench)')
    ap.add_argument('--blender', default=os.environ.get('BLENDER') or shutil.which('blender'), help='chemin de l’exécutable Blender (sinon : module bpy)')
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--token', default=os.environ.get('BRIDGE_TOKEN') or '')
    ap.add_argument('--out', default=os.path.join(os.path.expanduser('~'), 'massamba-blender'))
    ap.add_argument('--parallel', type=int, default=1)
    ap.add_argument('--timeout', type=int, default=3600, help='durée max d’un rendu (s)')
    ARGS = ap.parse_args()
    os.makedirs(ARGS.out, exist_ok=True)
    ARGS.version = 'détection en cours…'

    def detect():
        ARGS.version = blender_version(ARGS.blender)
        print(f'[bridge] moteur : {ARGS.version}', flush=True)

    threading.Thread(target=detect, daemon=True).start()
    threading.Thread(target=worker, daemon=True).start()
    srv = ThreadingHTTPServer((ARGS.host, ARGS.port), H)
    print(f'[bridge] mode {"blender" if ARGS.blender else "bpy"} · http://{ARGS.host}:{ARGS.port} · rendus dans {ARGS.out}', flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == '__main__':
    sys.exit(main())
