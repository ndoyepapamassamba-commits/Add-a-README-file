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
  POST /film                    → { id }   corps : { story, voices?: {index: wav base64}, troupe?: {chemin: base64} }
  GET  /jobs/<id>/cover|srt|post|gate  → couverture TikTok, sous-titres .srt, texte de publication, verdict qualité
  GET  /jobs/<id>/preflight     → rapport HTML du contrôle de conformité 3D (obligatoire, avant le rendu)
                                  tourne un FILM complet (scripts/blenderfilm/film.py) : planches de la troupe, voix,
                                  bouche, jeu, plans, rendu continu, montage façon TikTok, contrôle qualité.
Un seul rendu à la fois par défaut (--parallel N pour plus). Aucune donnée n'est envoyée ailleurs que sur votre machine.
"""
import argparse, base64, json, os, re, shutil, subprocess, sys, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
RENDER = os.path.join(HERE, 'blender-render.py')
FILM = os.path.join(HERE, 'blenderfilm', 'film.py')
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


def run_film(job: dict) -> None:
    out = job['dir']
    cmd = [sys.executable, FILM, '--story', job['story'], '--troupe', job['troupe'], '--out', out, '--samples', str(job.get('samples', 10))]
    if ARGS.blender:
        cmd += ['--blender', ARGS.blender]
    if ARGS.voices:
        cmd += ['--voices', ARGS.voices]
    job['status'] = 'running'
    job['started'] = time.time()
    with open(os.path.join(out, 'log.txt'), 'w', encoding='utf-8') as log:
        try:
            code = subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, timeout=ARGS.timeout * 4).returncode
        except subprocess.TimeoutExpired:
            code = -1
            log.write('\n[bridge] délai dépassé\n')
    qa = os.path.join(out, 'film.qa.json')
    if code == 0 and os.path.isfile(qa):
        job['report'] = json.load(open(qa, encoding='utf-8'))
        job['report']['frames'] = job['report'].get('frames_encoded', 0)
        gate = os.path.join(out, 'film.gate.json')
        if os.path.isfile(gate):
            g = json.load(open(gate, encoding='utf-8'))
            job['report']['gate'] = {'passed': g.get('passed'), 'failed': [c['check'] for c in g.get('checks', []) if not c.get('ok')]}
        pf = preflight_summary(out)
        if pf:
            job['report']['preflight'] = pf
        job['status'] = 'done'
    else:
        job['status'] = 'error'
        pf = preflight_summary(out)
        if pf and not pf['passed']:
            # Stopped by the mandatory 3D conformity check: say exactly why.
            job['error'] = 'bloqué par le contrôle de conformité 3D : ' + ' ; '.join(pf['critiques'][:5])
            job['report'] = {'preflight': pf}
        else:
            job['error'] = f'film terminé avec le code {code}'
    job['finished'] = time.time()


def preflight_summary(out: str):
    """The preflight QA of the film (scene checked before the render): score, verdict, blocking faults."""
    p = os.path.join(out, 'preflight.json')
    if not os.path.isfile(p):
        return None
    q = json.load(open(p, encoding='utf-8'))
    return {'score': q['score'], 'verdict': q['verdict'], 'passed': q['passed'], 'issues': len(q['issues']), 'fixes': len(q.get('corrections', q.get('fixes', []))),
            'taux_objectifs': q.get('taux_objectifs'), 'conforme_des_la_generation': q.get('conforme_des_la_generation'), 'dimensions': q.get('dimensions', {}),
            'critiques': [i['message'] + (f" ({i['objet']})" if i.get('objet') else '') for i in q['issues'] if i['severite'] == 'critique'],
            'categories': q['categories']}


def run_job(job: dict) -> None:
    if job.get('kind') == 'film':
        return run_film(job)
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
        m = re.match(r'^/jobs/([a-f0-9]{32})(/(video|verify|log|cover|srt|post|gate|preflight))?$', self.path)
        if not m:
            return self._json(404, {'error': 'route inconnue'})
        job = JOBS.get(m.group(1))
        if not job:
            return self._json(404, {'error': 'tâche inconnue'})
        film = job.get('kind') == 'film'
        if m.group(3) == 'video':
            return self._file(os.path.join(job['dir'], 'film.mp4' if film else 'video.mp4'), 'video/mp4')
        if film and m.group(3) in ('cover', 'srt', 'post', 'gate'):
            # The creator's kit of the film: TikTok cover, captions file, post text, quality-gate verdict.
            ext, mime = {'cover': ('cover.jpg', 'image/jpeg'), 'srt': ('srt', 'application/x-subrip'), 'post': ('post.txt', 'text/plain; charset=utf-8'), 'gate': ('gate.json', 'application/json')}[m.group(3)]
            return self._file(os.path.join(job['dir'], f'film.{ext}'), mime)
        if film and m.group(3) == 'preflight':
            # The HTML report of the 3D conformity check (geometry … narrative), readable as is.
            return self._file(os.path.join(job['dir'], 'preflight.html'), 'text/html; charset=utf-8')
        if m.group(3) == 'verify':
            return self._file(os.path.join(job['dir'], 'frames', 'f00001.png') if film else os.path.join(job['dir'], 'verify.png'), 'image/png')
        log_path = os.path.join(job['dir'], 'log.txt')
        log = open(log_path, encoding='utf-8', errors='replace').read()[-4000:] if os.path.isfile(log_path) else ''
        if m.group(3) == 'log':
            return self._json(200, {'log': log})
        frames_dir = os.path.join(job['dir'], 'frames')
        frames = len(os.listdir(frames_dir)) if os.path.isdir(frames_dir) else 0
        if job.get('kind') == 'film' and not job['total']:
            plan = os.path.join(job['dir'], 'plan.json')
            if os.path.isfile(plan):
                try:
                    job['total'] = int(json.load(open(plan, encoding='utf-8'))['frames'])
                except Exception:  # noqa: BLE001
                    pass
        return self._json(200, {'id': job['id'], 'status': job['status'], 'frames': frames, 'total': job['total'], 'report': job.get('report'), 'error': job.get('error'), 'log': log[-1200:], 'elapsed_s': round(time.time() - job.get('started', time.time()), 1)})

    def do_POST(self):
        if not self._auth():
            return
        if self.path not in ('/render', '/film'):
            return self._json(404, {'error': 'route inconnue'})
        n = int(self.headers.get('Content-Length') or 0)
        if n > 200 * 1024 * 1024:
            return self._json(413, {'error': 'corps trop grand (200 Mo max)'})
        try:
            body = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception as e:  # noqa: BLE001
            return self._json(400, {'error': f'JSON invalide : {e}'})
        if self.path == '/film':
            return self._film(body)
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


def _film(self, body: dict):
    story = body.get('story')
    if not isinstance(story, dict) or not story.get('beats'):
        return self._json(400, {'error': 'histoire (story.beats) requise'})
    jid = uuid.uuid4().hex
    d = os.path.join(ARGS.out, jid)
    os.makedirs(d, exist_ok=True)
    # Voices sent by the app (its own voice models): one wav per line.
    for k, b64 in (body.get('voices') or {}).items():
        try:
            i = int(k)
            path = os.path.join(d, f'voice-{i:02d}.wav')
            open(path, 'wb').write(base64.b64decode(b64))
            if 0 <= i < len(story['beats']):
                story['beats'][i]['audio'] = path
        except Exception:  # noqa: BLE001
            continue
    # The troupe kit sent by the app (sheets, sets, manifest), else the bridge's own kit folder.
    troupe = ARGS.troupe
    files = body.get('troupe') or {}
    if files:
        troupe = os.path.join(d, 'kit')
        for rel, b64 in files.items():
            safe = os.path.normpath(rel).lstrip('/\\')
            if safe.startswith('..'):
                continue
            p = os.path.join(troupe, safe)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, 'wb').write(base64.b64decode(b64))
    if not troupe or not os.path.isfile(os.path.join(troupe, 'manifest.json')):
        return self._json(400, {'error': 'kit troupe introuvable : lancez le pont avec --troupe DOSSIER ou envoyez les planches'})
    sp = os.path.join(d, 'story.json')
    json.dump(story, open(sp, 'w', encoding='utf-8'), ensure_ascii=False)
    job = {'id': jid, 'kind': 'film', 'dir': d, 'story': sp, 'troupe': troupe, 'status': 'queued', 'name': 'film', 'total': 0, 'samples': int(body.get('samples') or 10)}
    with LOCK:
        JOBS[jid] = job
    return self._json(202, {'id': jid, 'status': 'queued'})


H._film = _film


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
    ap.add_argument('--troupe', default=os.environ.get('MASSAMBA_TROUPE', ''), help='kit troupe (manifest.json + planches) pour /film')
    ap.add_argument('--voices', default=os.environ.get('PIPER_VOICES', ''), help='voix Piper locales (si l’app n’envoie pas les siennes)')
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
