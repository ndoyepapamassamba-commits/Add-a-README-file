"""Faux serveur IPTV pour tester la bascule automatique de TelecommandeTV.html.

/live/<nom>.m3u8   flux en direct (fenêtre glissante sur des segments VP9/Opus fMP4)
                   nom contenant « dies »   : le flux meurt 12 s après le premier segment demandé
                   nom contenant « nocors » : pas d'en-tête CORS (le navigateur refuse)
                   nom contenant « ref »    : 403 sans l'en-tête Referer attendu
                   nom contenant « ac3 »    : son AC-3 (illisible par le navigateur : il faut le décodeur)
/dash/manifest.mpd flux DASH (le navigateur ne sait pas le lire seul : il faut le décodeur)
/geo403.m3u8       chaîne interdite dans le pays
/dead404.m3u8      lien mort
/clip.webm         vidéo simple (lecteur natif)
/list.m3u          liste de test
Usage : python3 streams.py PORT DOSSIER_MEDIA
"""
import os
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1])
MEDIA = sys.argv[2]
SEGS = sorted(f for f in os.listdir(MEDIA) if f.endswith('.m4s'))
START = {}
WINDOW = 5
REFERER = 'https://chaine.example/'

LIST = """#EXTM3U
#EXTINF:-1 tvg-id="Alpha.sn@SD" tvg-logo="" group-title="News",Alpha TV (720p)
{b}/dead404.m3u8
#EXTINF:-1 tvg-id="Alpha.sn@SD" group-title="News",Alpha TV (720p)
{b}/live/alpha.m3u8
#EXTINF:-1 tvg-id="Bravo.sn@SD" group-title="Music",Bravo
http://127.0.0.1:1/bravo.m3u8
#EXTINF:-1 tvg-id="Bravo.sn@SD" group-title="Music",Bravo
{b}/dead404.m3u8?b
#EXTINF:-1 tvg-id="Charlie.sn@SD" group-title="General",Charlie
{b}/live/charlie.m3u8
#EXTINF:-1 tvg-id="Delta.sn@SD" group-title="General",Delta [Not 24/7]
{b}/live/delta-dies.m3u8
#EXTINF:-1 tvg-id="India.sn@SD" group-title="News",India
{b}/live/india-dies.m3u8
#EXTINF:-1 tvg-id="India.sn@SD" group-title="News",India
{b}/live/india2.m3u8
#EXTINF:-1 tvg-id="Echo.sn@SD" group-title="General",Echo [Geo-blocked]
{b}/live/echo-nocors.m3u8
#EXTINF:-1 tvg-id="Fox.sn@SD" group-title="Kids",Foxtrot
{b}/live/fox.m3u8
#EXTINF:-1 tvg-id="Golf.sn@SD" group-title="Culture" http-referrer="{ref}",Golf
#EXTVLCOPT:http-referrer={ref}
{b}/live/golf-ref.m3u8
#EXTINF:-1 tvg-id="Hotel.sn@SD" group-title="Movies",Hotel (vidéo)
{b}/clip.webm
#EXTINF:-1 tvg-id="Kilo.sn@SD" group-title="Sports",Kilo (son AC-3)
{b}/live/kilo-ac3.m3u8
#EXTINF:-1 tvg-id="Lima.sn@SD" group-title="General",Lima (DASH)
{b}/dash/manifest.mpd
#EXTINF:-1 tvg-id="Mike.sn@SD" group-title="General",Mike
{b}/geo403.m3u8
"""


class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def send(self, code, body, ctype, cors=True):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        if cors:
            self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    do_HEAD = lambda self: self.do_GET()

    def do_GET(self):
        path = self.path.split('?')[0]
        base = 'http://127.0.0.1:%d' % PORT
        if path == '/list.m3u':
            return self.send(200, LIST.format(b=base, ref=REFERER).encode(), 'audio/x-mpegurl')
        if path == '/clip.webm':
            with open(os.path.join(MEDIA, 'clip.webm'), 'rb') as f:
                return self.send(200, f.read(), 'video/webm')
        if path == '/geo403.m3u8':
            return self.send(403, b'pas dans ton pays', 'text/plain')
        d = re.match(r'^/dash/([\w.-]+)$', path)
        if d and os.path.exists(os.path.join(MEDIA, 'dash', d.group(1))):
            with open(os.path.join(MEDIA, 'dash', d.group(1)), 'rb') as f:
                return self.send(200, f.read(), 'application/dash+xml' if path.endswith('.mpd') else 'video/webm')
        m = re.match(r'^/live/([\w-]+)(\.m3u8|/(init\.mp4|seg\d+\.m4s))$', path)
        if not m:
            return self.send(404, b'introuvable', 'text/plain')
        name = m.group(1)
        cors = 'nocors' not in name
        if 'ref' in name and self.headers.get('Referer') != REFERER:
            return self.send(403, b'referer', 'text/plain', cors)
        # Le direct « démarre » au premier segment demandé (un simple test de la liste ne compte pas)
        t0 = START.setdefault(name, time.time()) if m.group(3) else START.get(name, time.time())
        if 'dies' in name and time.time() - t0 > 12:
            return self.send(404, b'flux coupe', 'text/plain', cors)
        if m.group(2) == '.m3u8':
            k = min(len(SEGS) - 1, WINDOW + int((time.time() - t0) / 2))
            first = max(0, k - WINDOW + 1)
            lines = ['#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-TARGETDURATION:2', '#EXT-X-MEDIA-SEQUENCE:%d' % first,
                     '#EXT-X-MAP:URI="%s/init.mp4"' % name]
            for i in range(first, k + 1):
                lines += ['#EXTINF:2.000000,', '%s/%s' % (name, SEGS[i])]
            return self.send(200, ('\n'.join(lines) + '\n').encode(), 'application/vnd.apple.mpegurl', cors)
        f = os.path.join(MEDIA, 'ac3' if 'ac3' in name else '', m.group(3))
        if not os.path.exists(f):
            return self.send(404, b'', 'text/plain', cors)
        with open(f, 'rb') as fh:
            return self.send(200, fh.read(), 'video/mp4', cors)


class Server(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        pass  # le navigateur coupe souvent les requêtes (tests de chaînes) : sans importance


Server(('127.0.0.1', PORT), H).serve_forever()
