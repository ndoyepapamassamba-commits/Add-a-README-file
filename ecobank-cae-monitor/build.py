#!/usr/bin/env python3
"""Assemble l'application offline mono-fichier « Créances à Échoir » — BLUE ECOBANK.

Usage :
  python build.py [sortie.html] [--data donnees.html]

  --data : bloc <script> optionnel définissant window.__CAE__ / window.__PF__
           (données pré-embarquées). Sans lui, l'application s'ouvre sur l'écran
           de chargement du fichier Excel.
"""
import sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'

args = sys.argv[1:]
data = ''
if '--data' in args:
    i = args.index('--data')
    data = pathlib.Path(args[i + 1]).read_text(encoding='utf-8')
    del args[i:i + 2]
out = pathlib.Path(args[0]) if args else ROOT / 'ECOBANK_CAE_MONITOR_BLUE.html'

read = lambda p: (SRC / p).read_text(encoding='utf-8')
logo = read('kit/logo_ecobank_png.b64').strip()
kit = (f'const LOGO_B64="{logo}";\n' + read('kit/g3_xlsx_kit.js') + '\n'
       + read('kit/pipeline_word_mail_ppt_kit.js'))

html = read('shell.html')
for marker, value in {
    '/*@@LOGO_KIT@@*/': kit,
    '/*@@VENDOR@@*/': read('vendor_libs.html'),
    '/*@@DATA@@*/': data,
    '/*@@APP@@*/': read('app.js'),
}.items():
    assert marker in html, marker
    html = html.replace(marker, value, 1)

out.write_text(html, encoding='utf-8')
print('OK', out, f'{len(html.encode("utf-8")):,}'.replace(',', ' '), 'octets')
