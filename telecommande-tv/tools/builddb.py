import os, re, sys, collections, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from irparse import parse_ir, norm
ROOT = sys.argv[1] if len(sys.argv) > 1 else '../irdb'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'codes.txt'
TVRX = re.compile(r'(^|[/_\- ])(tv|lcd|led|plasma|television|monitor|oled|qled|hdtv|crt)([/_\- .0-9]|$)', re.I)
BUTTONS = ['POWER','MUTE','VOL_UP','VOL_DN','CH_UP','CH_DN','SOURCE','MENU','HOME','UP','DOWN','LEFT','RIGHT','OK',
           'BACK','EXIT','INFO'] + ['N%d' % i for i in range(10)]
FREQ = {'RC5': 36000, 'RC5X': 36000, 'RC6': 36000, 'SIRC': 40000, 'SIRC15': 40000, 'SIRC20': 40000, 'Pioneer': 40000}
SUPPORTED = {'NEC','NECext','NEC42','NEC42ext','Samsung32','RC5','RC5X','RC6','SIRC','SIRC15','SIRC20','Kaseikyo','RCA','Pioneer'}
# Brands frequently sold in West Africa / generic Chinese chassis: tried first.
PRIORITY = ['hisense','tcl','samsung','lg','haier','skyworth','changhong','konka','sharp','sony','philips','panasonic',
            'toshiba','xiaomi','akai','midea','nasco','syinix','vitron','innovex','bruhm','aiwa','daewoo','jvc','hitachi',
            'sanyo','grundig','thomson','telefunken','sansui','kogan','element','insignia','vizio','roku','onn']

def brand_of(rel):
    p = rel.split('/')
    if p[0] == 'TVs': b = p[1]
    elif p[0] == 'Universal_TV_Remotes': b = 'Universelle'
    elif p[0] == '_Converted_':
        b = p[3] if p[1] in ('CSV', 'IR_Plus', 'Pronto') else p[2]
    else: b = p[0]
    b = b.replace('_', ' ').strip()
    return b.upper() if len(b) <= 3 else b.title()

def canon(s, conv_csv):
    """Canonical tuple for a parsed signal; fixes CSV-converted NECext and folds NECext->NEC."""
    proto, a, c = s['protocol'], s['addr'], s['cmd']
    if proto not in SUPPORTED: return None
    if proto == 'NECext':
        lo, hi = c & 0xff, (c >> 8) & 0xff
        if conv_csv and hi == 0 and lo != 0xff: c = lo | ((~lo & 0xff) << 8); hi = (~lo) & 0xff
        alo, ahi = a & 0xff, (a >> 8) & 0xff
        if ahi == (~alo & 0xff) and hi == (~lo & 0xff): proto, a, c = 'NEC', alo, lo
    return ('P', proto, a, c)

def decode_pdm(d, pm, ps, pm_tol, ps_tol):
    """Decode a 32-bit pulse-distance frame (NEC / Samsung32 style), LSB first."""
    if len(d) < 67 or abs(d[0] - pm) > pm_tol or abs(d[1] - ps) > ps_tol: return None
    v = 0
    for i in range(32):
        m, sp = d[2 + 2 * i], d[3 + 2 * i]
        if not (250 <= m <= 900): return None
        if 250 <= sp <= 900: bit = 0
        elif 1250 <= sp <= 2100: bit = 1
        else: return None
        v |= bit << i
    if not (250 <= d[66] <= 900): return None
    return [(v >> (8 * k)) & 0xff for k in range(4)]

def raw_decode(d):
    b = decode_pdm(d, 9000, 4500, 1200, 800)
    if b:
        if b[1] == (~b[0] & 0xff) and b[3] == (~b[2] & 0xff): return ('P', 'NEC', b[0], b[2])
        return ('P', 'NECext', b[0] | b[1] << 8, b[2] | b[3] << 8)
    b = decode_pdm(d, 4500, 4500, 700, 700)
    if b and b[0] == b[1] and b[3] == (~b[2] & 0xff): return ('P', 'Samsung32', b[0], b[2])
    return None

def raw_key(s):
    d = s['raw']
    dk = raw_decode(d)
    if dk: return dk
    out = [max(1, min(v, 65000)) for v in d]
    if len(out) % 2 == 0: out = out[:-1]
    if sum(out) > 1500000: return None
    q = tuple(out)
    return ('R', s['freq'] or 38000, q)

files = []
for d, _, fs in os.walk(ROOT):
    if '/.git' in d: continue
    for f in fs:
        if not f.endswith('.ir'): continue
        rel = os.path.relpath(os.path.join(d, f), ROOT)
        top = rel.split('/')[0]
        if top in ('TVs', 'Universal_TV_Remotes'): files.append(rel)
        elif top == '_Converted_' and TVRX.search('/' + '/'.join(rel.split('/')[3:])): files.append(rel)
files.sort()

def groups():
    for rel in files:
        yield rel, brand_of(rel), rel.startswith('_Converted_/CSV'), parse_ir(os.path.join(ROOT, rel))
    # Flipper Zero universal TV list: one device per "Power" block
    if UNIVERSAL and os.path.exists(UNIVERSAL):
        cur = []
        for s in parse_ir(UNIVERSAL) + [{'name': 'Power', 'type': 'end'}]:
            if s['name'] == 'Power' and cur:
                yield 'universal', 'Universelle', False, cur
                cur = []
            if s['type'] != 'end': cur.append(s)

UNIVERSAL = sys.argv[3] if len(sys.argv) > 3 else None
profiles = collections.OrderedDict()  # power key -> {'files':n,'brands':Counter,'btn':{name:Counter}}
for rel, brand, conv_csv, sigs in groups():
    btn = {}
    for s in sigs:
        n = norm(s['name'])
        if n is None: continue
        k = canon(s, conv_csv) if s['type'] == 'parsed' else raw_key(s)
        if k is None: continue
        if n == 'OK2':
            n = 'OK'
            if n in btn: continue
        if n not in btn: btn[n] = k
    if 'POWER' not in btn: continue
    pk = btn['POWER']
    pr = profiles.setdefault(pk, {'files': 0, 'brands': collections.Counter(), 'btn': collections.defaultdict(collections.Counter)})
    pr['files'] += 1
    pr['brands'][brand] += 1
    for n, k in btn.items(): pr['btn'][n][k] += 1

def score(pk, pr):
    s = pr['files'] * 10 + len(pr['btn'])
    for b in pr['brands']:
        bl = b.lower()
        if bl in PRIORITY: s += 200 - PRIORITY.index(bl) * 4
    if pk[0] == 'R': s -= 5
    return s

order = sorted(profiles.items(), key=lambda kv: -score(*kv))

def with_inverse(k):
    if k[0] == 'P' and k[1] == 'NECext' and (k[3] >> 8) == 0 and k[3] != 0xff:
        return ('P', 'NECext', k[2], k[3] | ((~k[3] & 0xff) << 8))
    return k

final = []
for pk, pr in order:
    final.append((pk, pr))
    tk = with_inverse(pk)
    if tk != pk and tk not in profiles:
        twin = {'files': pr['files'], 'brands': pr['brands'], 'btn': {}}
        for n, cnt in pr['btn'].items():
            twin['btn'][n] = collections.Counter({with_inverse(cnt.most_common(1)[0][0]): 1})
        final.append((tk, twin))
order = final
lines = ['# Base de codes IR pour TV - générée depuis Flipper-IRDB (CC0) par tools/builddb.py',
         '# P<TAB>label<TAB>nb_fichiers | B<TAB>bouton<TAB>proto<TAB>adresse_hex<TAB>commande_hex | R<TAB>bouton<TAB>freq<TAB>durées']
stats = collections.Counter()
for pk, pr in order:
    label = ' / '.join(b for b, _ in pr['brands'].most_common(3))
    lines.append('P\t%s\t%d' % (label, pr['files']))
    stats[pk[1] if pk[0] == 'P' else 'RAW'] += 1
    for n in BUTTONS:
        if n not in pr['btn']: continue
        k = pr['btn'][n].most_common(1)[0][0] if n != 'POWER' else pk
        if k[0] == 'P': lines.append('B\t%s\t%s\t%X\t%X' % (n, k[1], k[2], k[3]))
        else: lines.append('R\t%s\t%d\t%s' % (n, k[1], ','.join(map(str, k[2]))))
open(OUT, 'w').write('\n'.join(lines) + '\n')
print('profiles', len(order), 'bytes', os.path.getsize(OUT))
print(stats.most_common())
for pk, pr in order[:40]:
    print(score(pk, pr), pr['files'], pk if pk[0]=='P' else ('RAW', pk[1], len(pk[2])), dict(pr['brands'].most_common(4)), len(pr['btn']))
