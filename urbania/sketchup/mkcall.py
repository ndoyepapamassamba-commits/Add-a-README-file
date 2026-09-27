# Assemble le code envoyé à build_model : bibliothèque (ou réutilisation via session_state) + lot de modèles + export.
import sys, re, ast
lib = open('lib.py').read()
names = [n.name for n in ast.parse(lib).body if isinstance(n, ast.FunctionDef)] + ['MATS', 'PALETTE', 'IN']
def strip(s): return '\n'.join(l for l in s.split('\n') if l.strip() and not l.strip().startswith('#'))
mode, files, fns = sys.argv[1], sys.argv[2].split(','), sys.argv[3]
out = []
if mode == 'full':
    out.append(strip(lib)); out.append('\n'.join(f"session_state['{n}'] = {n}" for n in names))
else:
    out.append('\n'.join(f"{n} = session_state['{n}']" for n in names))
for f in files: out.append(strip(open(f).read()))
out.append(f"""_e = model.get_entities()
_e.erase_entities(list(_e.get_groups()))
_x = 0.0
_names = []
for _f in [{fns}]:
    _g = _f(_e); _names.append(_g.get_name())
    _bb = _g.get_bounding_box(); _w = (_bb.max_point[0] - _bb.min_point[0])
    _g.set_transform(SUTransformation([1,0,0,0, 0,1,0,0, 0,0,1,0, _x - _bb.min_point[0], 0, 0, 1])); _x += _w + 6*IN
_data = export_assets(_names)
result = {{"stats": {{a['name']: len(a['faces']) for a in _data['assets']}}, "data": _data}}""")
print('\n'.join(out))
