# Assemble un appel build_model qui ajoute une ou plusieurs rangées au catalogue (sans effacer ni exporter).
# Usage : python3 mkcat.py full|reuse fichier1.py,fichier2.py "rang1 ; rang2" ; éléments « nom » ou « T:clé:socle:étage:n:dx:dy » (tour empilée)
import sys, ast
lib = open('lib.py').read()
names = [n.name for n in ast.parse(lib).body if isinstance(n, ast.FunctionDef)] + ['MATS', 'PALETTE', 'IN']
def strip(s): return '\n'.join(l for l in s.split('\n') if l.strip() and not l.strip().startswith('#'))
mode, files, rows = sys.argv[1], sys.argv[2].split(','), [r.split() for r in sys.argv[3].split(';')]
out = [strip(lib), '\n'.join(f"session_state['{n}'] = {n}" for n in names)] if mode == 'full' else ['\n'.join(f"{n} = session_state['{n}']" for n in names)]
for f in files: out.append(strip(open(f).read()))
fns = [n.name for f in files for n in ast.parse(open(f).read()).body if isinstance(n, ast.FunctionDef)]
out.append("""_e = model.get_entities()
_F = FNS
def _mk(k):
    g = _F[k](_e); bb = g.get_bounding_box(); return g, bb.min_point[0], bb.min_point[1], bb.max_point[0], bb.max_point[1]
def _mv(g, x, y, z): g.set_transform(SUTransformation([1,0,0,0, 0,1,0,0, 0,0,1,0, x, y, z, 1]))
def _item(it, x, y):
    if it.startswith('T:'):
        _, k, b, fh, n, dx, dy = it.split(':'); b = float(b); fh = float(fh); n = int(n); dx = float(dx)*IN; dy = float(dy)*IN
        tg = Group(); _e.add_group(tg); tg.set_name('tour_' + k); te = tg.get_entities()
        g = _F[k + '_base'](te); bb = g.get_bounding_box(); x0, y0, x1, y1 = bb.min_point[0], bb.min_point[1], bb.max_point[0], bb.max_point[1]
        for i in range(n):
            m = _F[k + '_mid'](te); _mv(m, dx, dy, (b + i*fh)*IN)
        t = _F[k + '_top'](te); _mv(t, dx, dy, (b + n*fh)*IN)
        _mv(tg, x - x0, y - y0, 0)
        return x1 - x0, y1 - y0
    g, x0, y0, x1, y1 = _mk(it); _mv(g, x - x0, y - y0, 0); return x1 - x0, y1 - y0
_y = session_state.get('_cat_y', 0.0); _done = []
for _row in ROWS:
    _x = 0.0; _d = 0.0
    for _it in _row:
        _w, _dd = _item(_it, _x, _y); _x += _w + 8*IN; _d = max(_d, _dd); _done.append(_it)
    _y += _d + 20*IN
session_state['_cat_y'] = _y
result = {'placed': _done, 'y_m': round(_y/IN, 1), 'groups': len(list(_e.get_groups()))}""".replace('ROWS', repr(rows)).replace('FNS', '{' + ', '.join(f"'{n}': {n}" for n in fns) + '}'))
print('\n'.join(out))
