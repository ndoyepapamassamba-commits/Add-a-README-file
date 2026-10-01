"""Tests unitaires de la passerelle : installation du décodeur par téléchargement partiel d'un zip.

Un petit serveur local imite GitHub (requêtes Range) avec un faux « ffmpeg.exe » de 3 Mo au milieu
d'une archive : on vérifie que seul ce fichier est téléchargé, intact, et qu'une archive abîmée est refusée.
"""
import io
import os
import random
import sys
import tempfile
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import passerelle_tv as p  # noqa: E402

rnd = random.Random(42)
EXE = bytes(rnd.getrandbits(8) for _ in range(1_000_000)) + b'MZ' * 1_000_000  # en partie compressible
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('ffmpeg-x/doc/ffmpeg.html', 'x' * 200_000)
    z.writestr('ffmpeg-x/bin/ffmpeg.exe', EXE)
    z.writestr('ffmpeg-x/bin/ffprobe.exe', os.urandom(500_000))
ZIP = buf.getvalue()
served = []


class Range(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        data = BROKEN if self.path == '/abime.zip' else ZIP
        a, b = self.headers['Range'].split('=')[1].split('-')
        a, b = int(a), min(int(b), len(data) - 1)
        served.append(b - a + 1)
        self.send_response(206)
        self.send_header('Content-Range', 'bytes %d-%d/%d' % (a, b, len(data)))
        self.send_header('Content-Length', str(b - a + 1))
        self.end_headers()
        self.wfile.write(data[a:b + 1])


# Archive abîmée : un octet du fichier compressé est modifié
info = zipfile.ZipFile(io.BytesIO(ZIP)).getinfo('ffmpeg-x/bin/ffmpeg.exe')
pos = info.header_offset + 30 + len(info.filename) + 1000
BROKEN = ZIP[:pos] + bytes([ZIP[pos] ^ 0xFF]) + ZIP[pos + 1:]

srv = ThreadingHTTPServer(('127.0.0.1', 0), Range)
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d' % srv.server_address[1]
os.environ['NO_PROXY'] = '127.0.0.1'
fails = 0


def check(ok, msg):
    global fails
    print(('OK    ' if ok else 'ÉCHEC ') + msg)
    fails += not ok


with tempfile.TemporaryDirectory() as d:
    out = os.path.join(d, 'ffmpeg.exe')
    steps = []
    p.extract_from_remote_zip(base + '/ffmpeg.zip', '/bin/ffmpeg.exe', out, steps.append)
    with open(out, 'rb') as f:
        check(f.read() == EXE, 'décodeur : ffmpeg.exe extrait intact de l\'archive distante')
    check(sum(served) < info.compress_size + 100_000, 'décodeur : seul ffmpeg.exe est téléchargé (%d octets sur %d)' % (sum(served), len(ZIP)))
    check(steps and steps[-1] >= 90, 'décodeur : progression signalée (%s %%)' % (steps[-1] if steps else '?'))
    try:
        p.extract_from_remote_zip(base + '/abime.zip', '/bin/ffmpeg.exe', os.path.join(d, 'x.exe'))
        check(False, 'archive abîmée refusée')
    except (IOError, OSError, Exception) as e:  # noqa: BLE001 — zlib peut aussi lever son erreur
        check(not os.path.exists(os.path.join(d, 'x.exe')), 'archive abîmée refusée (%s)' % (str(e)[:50] or e.__class__.__name__))
    try:
        p.extract_from_remote_zip(base + '/ffmpeg.zip', '/bin/absent.exe', os.path.join(d, 'y.exe'))
        check(False, 'fichier absent signalé')
    except IOError as e:
        check('introuvable' in str(e), 'fichier absent signalé')

# Adresses que le relais et le décodeur refusent (réseau local, fichiers)
p.PROXY_LOCAL = False
check(not p.public_url('file:///etc/passwd', ('http', 'https') + p.TX_SCHEMES), 'décodeur : fichier local refusé')
check(not p.public_url('http://192.168.1.1/x.m3u8'), 'relais : réseau local refusé')
check(not p.public_url('http://127.0.0.1:8765/api/state'), 'relais : la passerelle elle-même refusée')
check(p.public_url('rtmp://8.8.8.8/live', ('http', 'https') + p.TX_SCHEMES), 'décodeur : RTMP public accepté')
sys.exit(1 if fails else 0)
