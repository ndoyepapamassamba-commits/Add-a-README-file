#!/usr/bin/env python3
"""Extrait du classeur IFRS9 les colonnes utiles, SANS calcul ni modification,
au format colonnaire JSON embarquable dans l'application (mode « données préchargées »).

Usage : python extract_data.py <classeur.xlsx> <sortie.js>

- Toutes les lignes de toutes les feuilles sont conservées (aucune suppression).
- Les valeurs sont recopiées telles quelles ; les dates sont écrites en ISO (AAAA-MM-JJ).
- La détection des feuilles et des colonnes reste faite par l'application (même moteur
  que pour un fichier chargé à la main) : ce script ne fait qu'alléger le volume.
"""
import sys, json, re, unicodedata, datetime, io, zipfile, base64
import openpyxl

KEEP = [  # motifs d'en-têtes conservés (texte normalisé sans accents, minuscules)
    r'^contract_id$', r'^account_no$', r'^customer_no$', r'^segment$', r'^product_type$', r'^sector$',
    r'^stage$', r'^stage_override$', r'^outstanding balance$', r'^impairment-pre$', r'^rpt_date$', r'^affiliate_nm$',
    r'^impairment \(model output\)$', r'^impairment \(manual overrides\)$',
    r'^contracts/accounts$', r'^code client$', r'^relationship$', r'^group name$', r'^account officer$',
    r'^facility currency$', r'^classification$', r'^frr$', r'^product code$', r'^segment code$', r'^business_segment$',
    r'^status \(p/np\)$', r'^pdo amount in local currency$', r'^date in pdo$', r'^ototal including pdo in local currency$',
    r'^stage ifrs9 model$', r'^collateral value in local currency$', r'^credit program$', r'^description$',
    r'^maturity date$', r'^booking date$', r'^reporting date$', r'^gl_code$',
]

def norm(s):
    s = unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip().lower()

def cell(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%Y-%m-%d')
    return v

def main(src, out):
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    sheets = []
    for ws in wb.worksheets:
        rows = ws.iter_rows(values_only=True)
        header = list(next(rows))
        keep = []
        for i, h in enumerate(header):
            if h is None: continue
            if any(re.match(p, norm(h)) for p in KEEP) and norm(h) not in [norm(header[j]) for j in keep]:
                keep.append(i)
        cols = [[] for _ in keep]
        n = 0
        for r in rows:
            if r is None or all(v is None or v == '' for v in r):
                continue
            n += 1
            for c, i in enumerate(keep):
                cols[c].append(cell(r[i]) if i < len(r) else None)
        sheets.append({'name': ws.title, 'header': [header[i] for i in keep], 'cols': cols, 'n': n})
        print(f'{ws.title}: {n} lignes, {len(keep)} colonnes conservées / {len(header)}')
    payload = {'source': src.split('/')[-1], 'extracted': datetime.datetime.now().isoformat(timespec='seconds'), 'sheets': sheets}
    raw = json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False, default=str).encode('utf-8')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr('data.json', raw)
    # archive zip en base64, décompressée dans le navigateur par JSZip (déjà embarqué)
    js = "window.__IFRS9_EMBED_ZIP__='" + base64.b64encode(buf.getvalue()).decode() + "';"
    open(out, 'w', encoding='utf-8').write(js)
    print('OK', out, len(js), 'octets')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
