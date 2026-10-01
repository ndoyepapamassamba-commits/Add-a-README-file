#!/usr/bin/env python3
"""Construit TelecommandeTV.html (page autonome) et TelecommandeTV-Web.zip.

app.html est la page source ; on y intègre hls.js (lecteur des flux IPTV, licence Apache-2.0)
pour qu'un seul fichier suffise, sur téléphone comme sur ordinateur.
Usage : python3 build_web.py   (télécharge hls.js une fois depuis le registre npm)
"""
import io
import os
import re
import sys
import tarfile
import urllib.request
import zipfile

HLS_VERSION = '1.7.3'
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.environ.get('TOOLS_DIR') or os.path.join(HERE, '..', '.build-tools')


def hls_js():
    path = os.path.join(CACHE, 'hls-%s.min.js' % HLS_VERSION)
    if not os.path.exists(path):
        url = 'https://registry.npmjs.org/hls.js/-/hls.js-%s.tgz' % HLS_VERSION
        print('Téléchargement de', url)
        data = urllib.request.urlopen(url, timeout=120).read()
        with tarfile.open(fileobj=io.BytesIO(data)) as t:
            js = t.extractfile('package/dist/hls.min.js').read()
        os.makedirs(CACHE, exist_ok=True)
        with open(path, 'wb') as f:
            f.write(js)
    with open(path, encoding='utf-8') as f:
        return f.read()


def main():
    with open(os.path.join(HERE, 'app.html'), encoding='utf-8') as f:
        page = f.read()
    js = hls_js()
    if re.search(r'</script|<!--|<script', js, re.I):
        sys.exit('hls.js contient une séquence qui casserait la balise <script>')
    tag = '<script>/*! hls.js v%s | Apache-2.0 | (c) Dailymotion | https://github.com/video-dev/hls.js */\n%s\n</script>' % (HLS_VERSION, js)
    assert page.count('<!--HLSJS-->') == 1
    out = page.replace('<!--HLSJS-->', tag)
    html = os.path.join(HERE, 'TelecommandeTV.html')
    with open(html, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('OK', html, len(out.encode()) // 1024, 'Ko')

    z = os.path.join(HERE, '..', 'TelecommandeTV-Web.zip')
    with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
        for name in ('TelecommandeTV.html', 'passerelle_tv.py', 'Lancer-passerelle-Windows.bat', 'LISEZMOI.txt'):
            info = zipfile.ZipInfo('TelecommandeTV-Web/' + name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if name.endswith('.py') else 0o644) << 16
            with open(os.path.join(HERE, name), 'rb') as f:
                zf.writestr(info, f.read())
    print('OK', os.path.normpath(z), os.path.getsize(z) // 1024, 'Ko')


if __name__ == '__main__':
    main()
