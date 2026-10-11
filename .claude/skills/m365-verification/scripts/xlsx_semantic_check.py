import sys, re, zipfile, posixpath
from xml.etree import ElementTree as ET
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def col(s):
    n = 0
    for ch in s: n = n * 26 + ord(ch) - 64
    return n
def resolve(base, t):
    if t.startswith('/'): return t[1:]
    return posixpath.normpath(posixpath.join(posixpath.dirname(base), t))
for path in sys.argv[1:]:
    z = zipfile.ZipFile(path); names = set(z.namelist()); errs = []
    print('==', path.split('/')[-1])
    st = ET.fromstring(z.read('xl/styles.xml'))
    cnt = lambda tag: len(st.find(f'm:{tag}', NS) or [])
    nf, nfi, nb = cnt('fonts'), cnt('fills'), cnt('borders')
    xfs = list(st.find('m:cellXfs', NS)); nx = len(xfs)
    for tag in ['fonts', 'fills', 'borders', 'cellXfs', 'cellStyleXfs', 'dxfs', 'numFmts']:
        e = st.find(f'm:{tag}', NS)
        if e is not None and e.get('count') is not None and int(e.get('count')) != len(e): errs.append(f'styles {tag} count={e.get("count")} actual={len(e)}')
    nsx = cnt('cellStyleXfs')
    numfmts = {int(e.get('numFmtId')) for e in (st.find('m:numFmts', NS) or [])}
    for i, x in enumerate(xfs):
        if int(x.get('fontId', 0)) >= nf: errs.append(f'xf{i} fontId {x.get("fontId")} >= {nf}')
        if int(x.get('fillId', 0)) >= nfi: errs.append(f'xf{i} fillId {x.get("fillId")} >= {nfi}')
        if int(x.get('borderId', 0)) >= nb: errs.append(f'xf{i} borderId {x.get("borderId")} >= {nb}')
        if int(x.get('xfId', 0)) >= max(nsx, 1): errs.append(f'xf{i} xfId {x.get("xfId")} >= {nsx}')
        nid = int(x.get('numFmtId', 0))
        if nid >= 164 and nid not in numfmts: errs.append(f'xf{i} numFmtId {nid} undefined')
    wb = z.read('xl/workbook.xml').decode()
    rels = z.read('xl/_rels/workbook.xml.rels').decode()
    ids = re.findall(r'Id="([^"]+)"', rels)
    if len(ids) != len(set(ids)): errs.append('duplicate workbook rel ids')
    sheets = re.findall(r'<sheet\b[^>]*?name="([^"]*)"[^>]*?sheetId="(\d+)"[^>]*?r:id="([^"]+)"', wb) + re.findall(r'<sheet\b[^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"[^>]*?sheetId="(\d+)"', wb)
    sids = [s[1] for s in sheets]
    if len(sids) != len(set(sids)): errs.append('duplicate sheetId')
    sheetnames = [s[0].replace('&amp;', '&') for s in sheets]
    for name, sid, rid in sheets:
        m = re.search(rf'<Relationship\b[^>]*Id="{rid}"[^>]*/>', rels)
        t = re.search(r'Target="([^"]+)"', m.group(0)).group(1)
        part = resolve('xl/workbook.xml', t)
        if part not in names: errs.append(f'sheet {name} part missing {part}'); continue
        x = z.read(part).decode()
        # rows / cells order and style indices
        lastr = 0
        for rm in re.finditer(r'<row\b([^>]*?)(?:/>|>(.*?)</row>)', x, re.S):
            ra = rm.group(1); r = int(re.search(r'\br="(\d+)"', ra).group(1)) if re.search(r'\br="(\d+)"', ra) else lastr + 1
            if r <= lastr: errs.append(f'{name}: row {r} after {lastr}')
            lastr = r
            sm = re.search(r'\bs="(\d+)"', ra)
            if sm and int(sm.group(1)) >= nx: errs.append(f'{name}: row {r} style {sm.group(1)} >= {nx}')
            lastc = 0
            for cm in re.finditer(r'<c\b([^>]*?)(/>|>)', rm.group(2) or ''):
                ca = cm.group(1); ref = re.search(r'\br="([A-Z]+)(\d+)"', ca)
                if ref:
                    c = col(ref.group(1))
                    if int(ref.group(2)) != r: errs.append(f'{name}: cell {ref.group(0)} in row {r}')
                    if c <= lastc: errs.append(f'{name}: cell {ref.group(1)}{ref.group(2)} out of order')
                    lastc = c
                s = re.search(r'\bs="(\d+)"', ca)
                if s and int(s.group(1)) >= nx: errs.append(f'{name}: cell style {s.group(1)} >= {nx}')
        cols = re.findall(r'<col\b[^>]*?min="(\d+)"[^>]*?max="(\d+)"[^>]*?/>', x)
        prev = 0
        for a, b in cols:
            if int(a) <= prev or int(b) < int(a): errs.append(f'{name}: cols overlap {a}-{b}')
            prev = int(b)
        for s in re.findall(r'<col\b[^>]*?\bstyle="(\d+)"', x):
            if int(s) >= nx: errs.append(f'{name}: col style {s} >= {nx}')
        merges = re.findall(r'<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"', x)
        boxes = [(col(a), int(b), col(c), int(d)) for a, b, c, d in merges]
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                A, B = boxes[i], boxes[j]
                if not (A[2] < B[0] or B[2] < A[0] or A[3] < B[1] or B[3] < A[1]): errs.append(f'{name}: merges overlap {merges[i]} {merges[j]}')
        # element order of worksheet children
        order = ['sheetPr','dimension','sheetViews','sheetFormatPr','cols','sheetData','sheetCalcPr','sheetProtection','protectedRanges','scenarios','autoFilter','sortState','dataConsolidate','customSheetViews','mergeCells','phoneticPr','conditionalFormatting','dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','customProperties','cellWatches','ignoredErrors','smartTags','drawing','legacyDrawing','legacyDrawingHF','drawingHF','picture','oleObjects','controls','webPublishItems','tableParts','extLst']
        root = ET.fromstring(x); seq = [ch.tag.split('}')[1] for ch in root]
        idx = [order.index(t) if t in order else -1 for t in seq]
        if idx != sorted(idx) or -1 in idx: errs.append(f'{name}: worksheet child order {seq}')
        if len(seq) != len(set(seq)): errs.append(f'{name}: duplicate worksheet children {seq}')
        # sheet rels targets exist
        rp = posixpath.join(posixpath.dirname(part), '_rels', posixpath.basename(part) + '.rels')
        if rp in names:
            for t in [m.group(1) for m in re.finditer(r"<Relationship\b[^>]*>", z.read(rp).decode()) for m in [re.search(r"Target=\"([^\"]+)\"", m.group(0))] if "External" not in m.string[m.start():m.end()]] if False else [mm.group(1) for mm in (re.search(r"Target=\"([^\"]+)\"", r0) for r0 in re.findall(r"<Relationship\b[^>]*>", z.read(rp).decode()) if "TargetMode=\"External\"" not in r0) if mm]:
                p = resolve(part, t)
                if p not in names: errs.append(f'{name}: rel target missing {p}')
                if 'drawings/' in p and p in names:
                    d = z.read(p).decode()
                    cids = re.findall(r'<xdr:cNvPr id="(\d+)"', d)
                    if len(cids) != len(set(cids)): errs.append(f'{p}: duplicate cNvPr ids')
                    drp = posixpath.join(posixpath.dirname(p), '_rels', posixpath.basename(p) + '.rels')
                    drel = z.read(drp).decode() if drp in names else ''
                    for rid2 in re.findall(r'r:(?:embed|id)="([^"]+)"', d):
                        if f'Id="{rid2}"' not in drel: errs.append(f'{p}: rid {rid2} not in rels')
                    for t2 in re.findall(r'Target="([^"]+)"', drel):
                        p2 = resolve(p, t2)
                        if p2 not in names: errs.append(f'{p}: target missing {p2}')
                        elif 'charts/' in p2:
                            c = z.read(p2).decode()
                            ALLOWED = {'barChart': {'outEnd','inEnd','inBase','ctr'}, 'bar3DChart': set(), 'lineChart': {'t','b','l','r','ctr'}, 'line3DChart': set(), 'areaChart': set(), 'area3DChart': set(), 'doughnutChart': set(), 'pieChart': {'bestFit','ctr','inEnd','outEnd'}, 'pie3DChart': set()}
                            types = re.findall(r'<c:(\w+Chart)>', c)
                            for ty in types:
                                body = re.search(rf'<c:{ty}>(.*?)</c:{ty}>', c, re.S).group(1)
                                if 'stacked' in re.findall(r'<c:grouping val="(\w+)"', body) or 'percentStacked' in re.findall(r'<c:grouping val="(\w+)"', body):
                                    ok = ALLOWED.get(ty, set()) - {'outEnd'}
                                else: ok = ALLOWED.get(ty, set())
                                for pos in re.findall(r'<c:dLblPos val="(\w+)"/>', body):
                                    if pos not in ok: errs.append(f'{p2}: {ty} dLblPos {pos} not allowed')
                            for f in re.findall(r'<c:f>([^<]*)</c:f>', c):
                                sn = re.match(r"^'?(.*?)'?!", f.replace('&apos;', "'"))
                                if sn and sn.group(1).replace("''", "'") not in sheetnames: errs.append(f'{p2}: ref to unknown sheet {f}')
    ct = z.read('[Content_Types].xml').decode()
    for p in names:
        ext = p.rsplit('.', 1)[-1]
        if f'PartName="/{p}"' not in ct and f'Extension="{ext}"' not in ct and f'Extension="{ext.upper()}"' not in ct: errs.append(f'no content type for {p}')
    for p in re.findall(r'PartName="/([^"]+)"', ct):
        if p not in names: errs.append(f'CT override for missing {p}')
    exts = re.findall(r'Default Extension="([^"]+)"', ct)
    if len(exts) != len(set(e.lower() for e in exts)): errs.append(f'duplicate Default extensions {exts}')
    print('  sheets', sheetnames, 'xfs', nx, 'fonts', nf, 'fills', nfi, 'borders', nb)
    for e in errs[:40]: print('  !', e)
    print(f'  {len(errs)} issue(s)')
