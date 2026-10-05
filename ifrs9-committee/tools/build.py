#!/usr/bin/env python3
"""Assemble l'application IFRS9 Committee Intelligence en un fichier HTML unique, 100 % offline.

Usage :
  python tools/build.py                      -> dist/ECOBANK_IFRS9_Committee_Intelligence.html (sans données : écran de dépôt)
  python tools/build.py --data embed.js out  -> version avec données préchargées (embed.js produit par extract_data.py)

Le kit d'exports « GOD 3D » est re-colorisé à l'assemblage dans la charte demandée par le Comité :
ECOBANK BLUE #003DA5, ECOBANK DARK BLUE #001B4D, ECOBANK GOLD #C8A951.
"""
import sys, re, pathlib

R = pathlib.Path(__file__).resolve().parent.parent
V = R / 'vendor'

# kit d'origine (BLUE ECOBANK #005C83 / lime) -> charte Comité IFRS9 (bleu #003DA5 / or #C8A951)
RETHEME = {
    '00415E': '001B4D', '00344B': '00122F', '005C83': '003DA5', '1A86B3': '2F6FD6', '2B9AD6': '4C7FD9',
    '8CC63F': 'C8A951', 'A6D867': 'E6D7A6', '6BA23A': 'A88B3A', 'E6F2D0': 'F4EEDC',
    '12333F': '0F1E3D', '3E5C6B': '5A6785', 'CFE0E7': 'DDE3EE', 'EEF4F7': 'F3F5F9', 'DFE9F2': 'E3E9F4',
    'B7CDD8': 'C9D2E3', '3F8FB5': '3D6FC2', 'DCEBF1': 'E3EAF7', 'F4F9FB': 'F7F8FC', 'F6FAFC': 'F8F9FC',
    'C0392B': 'B3261E', 'D4A13A': 'D18B1F', 'B67D1C': 'B7860B', '4E8A2E': '1F7A5A',
    '1C6F9E': '2457C0', '0A5680': '0A3F9E', '063F60': '062C74', '002444': '00143A', '0A4F76': '0A3A8F',
    '00305A': '001B4D', '0673A2': '003DA5', '54708A': '5A6785',
}

def retheme(s):
    def rep(m):
        h = m.group(2).upper()
        if h not in RETHEME: return m.group(0)
        n = RETHEME[h]
        return m.group(1) + (n.lower() if m.group(2).islower() else n)
    return re.sub(r'(#|rgb:\'|rgb:"|\'|"|K|FF)([0-9A-Fa-f]{6})(?![0-9A-Fa-f])', rep, s)

def main():
    args = sys.argv[1:]
    data = ''
    out = R / 'dist' / 'ECOBANK_IFRS9_Committee_Intelligence.html'
    if args and args[0] == '--data':
        data = pathlib.Path(args[1]).read_text(encoding='utf-8')
        out = pathlib.Path(args[2])
    s = (R / 'src' / 'shell.html').read_text(encoding='utf-8')
    kit = retheme((V / 'g3_xlsx_kit.js').read_text(encoding='utf-8') + '\n' + (V / 'pipeline_word_mail_ppt_kit.js').read_text(encoding='utf-8'))
    rep = {
        '/*@@VXLSX@@*/': (V / 'xlsx-js-style.min.js').read_text(encoding='utf-8'),
        '/*@@VCHART@@*/': (V / 'chart.umd.min.js').read_text(encoding='utf-8'),
        '/*@@VZIP@@*/': (V / 'jszip-pptxgen.min.js').read_text(encoding='utf-8'),
        '/*@@DATA@@*/': data,
        '/*@@LOGO@@*/': (V / 'logo_ecobank_png.b64').read_text().strip(),
        '/*@@KIT@@*/': kit,
        '/*@@APP@@*/': '\n'.join(f.read_text(encoding='utf-8') for f in sorted((R / 'src').glob('*.js'))),
    }
    for k, v in rep.items():
        s = s.replace(k, v)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(s, encoding='utf-8')
    print('OK', out, len(s), 'octets')

if __name__ == '__main__':
    main()
