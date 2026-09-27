# Bibliothèque de modélisation SketchUp pour Urbania (exécutée dans build_model).
# Unités : mètres (converties en pouces). Repère SketchUp : X droite, Y profondeur, Z haut.
# La façade avant d'un bâtiment est en y = 0 et regarde vers -Y.
IN = 39.37007874
def _sub(a, b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def _add(a, b): return (a[0]+b[0], a[1]+b[1], a[2]+b[2])
def _mul(a, s): return (a[0]*s, a[1]*s, a[2]*s)
def _dot(a, b): return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
def _cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def _newell(pts):
    nx = ny = nz = 0.0
    for i in range(len(pts)):
        a = pts[i]; b = pts[(i+1) % len(pts)]
        nx += (a[1]-b[1])*(a[2]+b[2]); ny += (a[2]-b[2])*(a[0]+b[0]); nz += (a[0]-b[0])*(a[1]+b[1])
    return (nx, ny, nz)

MATS = {}
def mat(name, rgb, a=255):
    if name in MATS: return MATS[name]
    for m in model.get_materials():
        if m.get_name() == name: MATS[name] = m; return m
    m = Material(); m.set_name(name); m.set_color(SUColor(rgb[0], rgb[1], rgb[2], a)); model.add_materials([m]); MATS[name] = m; return m
PALETTE = {'W_wall':(226,216,198), 'W_wall2':(205,196,180), 'R_roof':(128,64,50), 'A_accent':(58,92,72), 'A_door':(92,58,40),
  'trim':(240,238,232), 'frame':(236,236,232), 'G_glass':(58,78,92), 'stone':(146,140,130), 'brick':(142,74,54), 'metal':(126,130,134),
  'darkmetal':(62,66,70), 'concrete':(168,165,158), 'roof_flat':(88,88,90), 'wood':(120,84,56), 'grass':(92,128,64), 'E_sign':(255,210,120),
  'asphalt':(70,72,75), 'paving':(176,170,160), 'water':(40,110,140), 'rail':(90,92,95), 'white':(242,242,240), 'red':(178,52,44), 'blue':(46,92,160), 'yellow':(222,178,52), 'A_base':(150,140,128), 'garage':(196,196,190), 'R_tile':(150,78,58), 'glassroof':(120,150,170), 'green':(70,120,60), 'orange':(220,120,40), 'E_light':(255,236,200), 'canvas':(236,232,220), 'gravel':(140,134,122), 'sand':(196,178,140), 'pool':(60,150,190), 'rust':(140,82,52), 'steel':(160,166,172), 'blackglass':(30,36,44)}
def M(name):
    if name not in MATS: mat(name, PALETTE.get(name, (200,200,200)))
    return name

def MB():
    # Accumulateur de faces planes (avec trous) : dict v/idx/faces.
    return {'v': [], 'idx': {}, 'faces': []}
def vi(mb, p):
    k = (round(p[0], 4), round(p[1], 4), round(p[2], 4)); i = mb['idx'].get(k)
    if i is None: i = len(mb['v']); mb['idx'][k] = i; mb['v'].append(k)
    return i
def poly(mb, pts, m, holes=(), n=None):
    if n is not None and _dot(_newell(pts), n) < 0: pts = pts[::-1]
    nn = _newell(pts); hs = []
    for h in holes:
        if _dot(_newell(h), nn) > 0: h = h[::-1]
        hs.append([vi(mb, p) for p in h])
    mb['faces'].append(([vi(mb, p) for p in pts], hs, M(m)))
def box(mb, x0, y0, z0, x1, y1, z1, m, top=None, bot=None, side=None, skip=()):
    s = side or m
    P = [(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
    for key, f, n, mm in [('bot',[0,3,2,1],(0,0,-1),bot or m), ('top',[4,5,6,7],(0,0,1),top or m), ('F',[0,1,5,4],(0,-1,0),s),
                          ('B',[2,3,7,6],(0,1,0),s), ('L',[3,0,4,7],(-1,0,0),s), ('R',[1,2,6,5],(1,0,0),s)]:
        if key in skip: continue
        poly(mb, [P[i] for i in f], mm, n=n)
def fpt(fr, a, b, c=0.0):
    o, u, v, n = fr
    return (o[0]+u[0]*a+v[0]*b+n[0]*c, o[1]+u[1]*a+v[1]*b+n[1]*c, o[2]+u[2]*a+v[2]*b+n[2]*c)
def fbox(mb, fr, a0, a1, b0, b1, c0, c1, m, skip=()):
    # Boîte alignée sur un repère de façade fr = (o, u, v, n) : a le long de u, b vers le haut, c vers l'extérieur.
    o, u, v, n = fr
    P = [fpt(fr,a0,b0,c0),fpt(fr,a1,b0,c0),fpt(fr,a1,b0,c1),fpt(fr,a0,b0,c1),fpt(fr,a0,b1,c0),fpt(fr,a1,b1,c0),fpt(fr,a1,b1,c1),fpt(fr,a0,b1,c1)]
    mv = _mul(v, -1); mu = _mul(u, -1); mn = _mul(n, -1)
    for key, f, nn in [('bot',[0,1,2,3],mv), ('top',[4,5,6,7],v), ('back',[0,1,5,4],mn), ('front',[3,2,6,7],n), ('l',[0,3,7,4],mu), ('r',[1,2,6,5],u)]:
        if key in skip: continue
        poly(mb, [P[i] for i in f], m, n=nn)
def prism(mb, pts, z0, z1, m, top=None, bot=None):
    # Extrusion verticale d'un polygone (x, y).
    lo = [(p[0], p[1], z0) for p in pts]; hi = [(p[0], p[1], z1) for p in pts]
    poly(mb, lo, bot or m, n=(0,0,-1)); poly(mb, hi, top or m, n=(0,0,1))
    c = (sum(p[0] for p in pts)/len(pts), sum(p[1] for p in pts)/len(pts))
    for i in range(len(pts)):
        j = (i+1) % len(pts); a, b = pts[i], pts[j]; out = ((a[0]+b[0])/2 - c[0], (a[1]+b[1])/2 - c[1], 0)
        poly(mb, [lo[i], lo[j], hi[j], hi[i]], m, n=out)
def extrude_x(mb, prof, x0, x1, side_m, cap_m):
    # Extrusion le long de X d'un profil (y, z) ; side_m(i) donne la matière du côté i.
    a = [(x0, p[0], p[1]) for p in prof]; b = [(x1, p[0], p[1]) for p in prof]
    poly(mb, a, cap_m, n=(-1,0,0)); poly(mb, b, cap_m, n=(1,0,0))
    cy = sum(p[0] for p in prof)/len(prof); cz = sum(p[1] for p in prof)/len(prof)
    for i in range(len(prof)):
        j = (i+1) % len(prof); out = (0, (prof[i][0]+prof[j][0])/2 - cy, (prof[i][1]+prof[j][1])/2 - cz)
        poly(mb, [a[i], a[j], b[j], b[i]], side_m(i), n=out)
def cyl(mb, cx, cy, z0, z1, r, m, n=12, top=None, r1=None):
    r1 = r if r1 is None else r1
    lo = [(cx + r*math.cos(2*math.pi*k/n), cy + r*math.sin(2*math.pi*k/n), z0) for k in range(n)]
    hi = [(cx + r1*math.cos(2*math.pi*k/n), cy + r1*math.sin(2*math.pi*k/n), z1) for k in range(n)]
    poly(mb, lo, m, n=(0,0,-1))
    if r1 > 0.001: poly(mb, hi, top or m, n=(0,0,1))
    for k in range(n):
        j = (k+1) % n; a = 2*math.pi*(k+.5)/n; out = (math.cos(a), math.sin(a), 0)
        if r1 > 0.001: poly(mb, [lo[k], lo[j], hi[j], hi[k]], m, n=out)
        else: poly(mb, [lo[k], lo[j], (cx, cy, z1)], m, n=out)
def panel(mb, fr, W, H, ops, m, rec=0.14, rev='frame'):
    # Pan de mur rectangulaire (repère fr, largeur W, hauteur H) percé d'ouvertures en creux.
    #    ops : (a0, a1, b0, b1, matière de remplissage[, profondeur]).
    o, u, v, n = fr
    holes = []
    for op in ops:
        a0, a1, b0, b1, fm = op[:5]; d = op[5] if len(op) > 5 else rec
        holes.append([fpt(fr,a0,b0), fpt(fr,a0,b1), fpt(fr,a1,b1), fpt(fr,a1,b0)])
        poly(mb, [fpt(fr,a0,b0), fpt(fr,a1,b0), fpt(fr,a1,b0,-d), fpt(fr,a0,b0,-d)], rev, n=v)
        poly(mb, [fpt(fr,a0,b1), fpt(fr,a1,b1), fpt(fr,a1,b1,-d), fpt(fr,a0,b1,-d)], rev, n=_mul(v,-1))
        poly(mb, [fpt(fr,a0,b0), fpt(fr,a0,b1), fpt(fr,a0,b1,-d), fpt(fr,a0,b0,-d)], rev, n=u)
        poly(mb, [fpt(fr,a1,b0), fpt(fr,a1,b1), fpt(fr,a1,b1,-d), fpt(fr,a1,b0,-d)], rev, n=_mul(u,-1))
        poly(mb, [fpt(fr,a0,b0,-d), fpt(fr,a1,b0,-d), fpt(fr,a1,b1,-d), fpt(fr,a0,b1,-d)], fm, n=n)
    poly(mb, [fpt(fr,0,0), fpt(fr,W,0), fpt(fr,W,H), fpt(fr,0,H)], m, holes=holes, n=n)
def build(mb, ents, name):
    g = Group(); ents.add_group(g); g.set_name(name)
    if not mb['faces']: return g
    gi = GeometryInput(); gi.set_vertices([SUPoint3D(x*IN, y*IN, z*IN) for (x, y, z) in mb['v']])
    for (o, hs, m) in mb['faces']:
        lp = LoopInput()
        for i in o: lp.add_vertex_index(i)
        fi, gi = gi.add_face(lp)
        for h in hs:
            il = LoopInput()
            for i in h: il.add_vertex_index(i)
            gi = gi.face_add_inner_loop(fi, il)
        gi = gi.face_set_front_material(fi, [], MATS[m]); gi = gi.face_set_back_material(fi, [], MATS[m])
    g.get_entities().fill(gi, weld_vertices=True)
    return g

def frames(x0, y0, x1, y1, z0):
    # Repères des 4 façades d'un volume rectangulaire : avant (y0), droite (x1), arrière (y1), gauche (x0).
    return {'F': ((x0,y0,z0), (1,0,0), (0,0,1), (0,-1,0)), 'R': ((x1,y0,z0), (0,1,0), (0,0,1), (1,0,0)),
            'B': ((x1,y1,z0), (-1,0,0), (0,0,1), (0,1,0)), 'L': ((x0,y1,z0), (0,-1,0), (0,0,1), (-1,0,0))}
def block(mb, x0, y0, x1, y1, bands, top='roof_flat', bot='concrete', rec=0.14, rev='frame'):
    # Volume fermé : bands = [(z0, z1, matière, {'F': ops, 'R': ops, 'B': ops, 'L': ops})].
    W = {'F': x1-x0, 'B': x1-x0, 'R': y1-y0, 'L': y1-y0}
    for (z0, z1, m, ops) in bands:
        fr = frames(x0, y0, x1, y1, z0)
        for k in 'FRBL': panel(mb, fr[k], W[k], z1-z0, ops.get(k, []), m, rec, rev)
    zb = bands[0][0]; zt = bands[-1][1]
    poly(mb, [(x0,y0,zb),(x0,y1,zb),(x1,y1,zb),(x1,y0,zb)], bot, n=(0,0,-1))
    poly(mb, [(x0,y0,zt),(x1,y0,zt),(x1,y1,zt),(x0,y1,zt)], top, n=(0,0,1))
def row(W, n, w, b0, b1, fm='G_glass', margin=None, skip=()):
    # n ouvertures de largeur w régulièrement réparties sur une largeur W.
    step = W/n; out = []
    for i in range(n):
        if i in skip: continue
        c = step*(i+.5); out.append((c-w/2, c+w/2, b0, b1, fm))
    return out
def win_details(det, fr, ops, sill=True, mull=True, rec=0.14, sill_m='trim', mull_m='frame'):
    # Appuis de fenêtre et meneaux pour une liste d'ouvertures.
    for op in ops:
        a0, a1, b0, b1, fm = op[:5]
        if fm != 'G_glass': continue
        if sill: fbox(det, fr, a0-.07, a1+.07, b0-.07, b0+.01, .005, .09, sill_m)
        if mull:
            d = op[5] if len(op) > 5 else rec
            c0, c1 = -d + .012, -d + .05; am = (a0+a1)/2; bm = b0 + (b1-b0)*.62
            fbox(det, fr, am-.03, am+.03, b0, b1, c0, c1, mull_m)
            fbox(det, fr, a0, a1, bm-.03, bm+.03, c0, c1, mull_m)

def export_assets(names=None):
    # Extrait la géométrie des groupes de premier niveau (repère du jeu : x, y = z SU, z = -y SU ; en cm).
    def mat4(tr):
        try: v = list(tr.values())
        except Exception: v = list(tr.values)
        return v
    def apply(m, p):
        x, y, z = p
        return (m[0]*x + m[4]*y + m[8]*z + m[12], m[1]*x + m[5]*y + m[9]*z + m[13], m[2]*x + m[6]*y + m[10]*z + m[14])
    def rot(m, n):
        x, y, z = n
        return (m[0]*x + m[4]*y + m[8]*z, m[1]*x + m[5]*y + m[9]*z, m[2]*x + m[6]*y + m[10]*z)
    def mulm(a, b):
        r = [0.0]*16
        for c in range(4):
            for rr in range(4):
                r[c*4+rr] = sum(a[k*4+rr]*b[c*4+k] for k in range(4))
        return r
    I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
    mats = []; mi = {}
    def midx(mm):
        nm = mm.get_name() if mm else 'default'
        if nm not in mi:
            c = mm.get_color() if mm else None
            mi[nm] = len(mats); mats.append([nm, c.red if c else 200, c.green if c else 200, c.blue if c else 200, c.alpha if c else 255])
        return mi[nm]
    K = 100.0/IN
    def gp(p): return [int(round(p[0]*K)), int(round(p[2]*K)), int(round(-p[1]*K))]
    def walk(ents, m, inherit, out, det=0):
        for f in ents.get_faces():
            mm = f.get_front_material() or f.get_back_material() or inherit
            n = rot(m, (f.get_normal().x, f.get_normal().y, f.get_normal().z)); L = math.sqrt(_dot(n, n)) or 1
            rec = [midx(mm), int(round(n[0]/L*1000)), int(round(n[2]/L*1000)), int(round(-n[1]/L*1000))]
            loops = [f.get_outer_loop()] + list(f.get_inner_loops())
            for lp in loops:
                flat = []
                for vx in lp.get_vertices():
                    q = vx.get_position(); flat += gp(apply(m, (q.x, q.y, q.z)))
                rec.append(flat)
            if det: rec.append(1)
            out.append(rec)
        for g in ents.get_groups():
            walk(g.get_entities(), mulm(m, mat4(g.get_transform())), g.get_material() or inherit, out, det or (1 if g.get_name().startswith('det') else 0))
        for inst in ents.get_instances():
            walk(inst.get_definition().get_entities(), mulm(m, mat4(inst.get_transform())), inst.get_material() or inherit, out, det)
    assets = []
    for g in model.get_entities().get_groups():
        nm = g.get_name()
        if names and nm not in names: continue
        faces = []; walk(g.get_entities(), I, None, faces)
        assets.append({'name': nm, 'faces': faces})
    return {'mats': mats, 'assets': assets}

# ---------------------------------------------------------------- générateurs d'ensembles
def extrude_y(mb, prof, y0, y1, side_m, cap_m):
    # extrusion le long de Y d'un profil (x, z)
    a = [(p[0], y0, p[1]) for p in prof]; b = [(p[0], y1, p[1]) for p in prof]
    poly(mb, a, cap_m, n=(0,-1,0)); poly(mb, b, cap_m, n=(0,1,0))
    cx = sum(p[0] for p in prof)/len(prof); cz = sum(p[1] for p in prof)/len(prof)
    for i in range(len(prof)):
        j = (i+1) % len(prof); out = ((prof[i][0]+prof[j][0])/2 - cx, 0, (prof[i][1]+prof[j][1])/2 - cz)
        poly(mb, [a[i], a[j], b[j], b[i]], side_m(i), n=out)
def gable_roof(mb, x0, y0, x1, y1, ze, pitch, ov=.45, gov=.3, t=.2, m='R_roof', edge='trim', axis='x'):
    # toit à deux pans (faîtage selon axis), dalle épaisse avec débords ; renvoie la hauteur du faîtage
    k = math.tan(math.radians(pitch)); tt = t/math.cos(math.radians(pitch))
    if axis == 'x':
        D = y1 - y0; zr = ze + D/2*k; zb = ze - ov*k
        rp = [(y0-ov, zb), (y0-ov, zb+tt), (y0+D/2, zr+tt), (y1+ov, zb+tt), (y1+ov, zb), (y0+D/2, zr)]
        extrude_x(mb, rp, x0-gov, x1+gov, lambda i: m if i in (1, 2) else edge, edge)
    else:
        W = x1 - x0; zr = ze + W/2*k; zb = ze - ov*k
        rp = [(x0-ov, zb), (x0-ov, zb+tt), (x0+W/2, zr+tt), (x1+ov, zb+tt), (x1+ov, zb), (x0+W/2, zr)]
        extrude_y(mb, rp, y0-gov, y1+gov, lambda i: m if i in (1, 2) else edge, edge)
    return zr
def hip_roof(mb, x0, y0, x1, y1, ze, pitch, ov=.45, t=.18, m='R_roof', edge='trim'):
    # toit à quatre pans avec bandeau et sous-face ; renvoie la hauteur du faîtage
    X0, Y0, X1, Y1 = x0-ov, y0-ov, x1+ov, y1+ov; k = math.tan(math.radians(pitch)); W = X1-X0; D = Y1-Y0
    zb = ze - ov*k; E = [(X0,Y0,zb),(X1,Y0,zb),(X1,Y1,zb),(X0,Y1,zb)]; cx = (X0+X1)/2; cy = (Y0+Y1)/2
    if abs(W - D) < .05:
        zr = zb + W/2*k; A = (cx, cy, zr)
        for i, n in enumerate([(0,-1,1),(1,0,1),(0,1,1),(-1,0,1)]): poly(mb, [E[i], E[(i+1)%4], A], m, n=n)
    elif W > D:
        zr = zb + D/2*k; R0 = (X0 + D/2, cy, zr); R1 = (X1 - D/2, cy, zr)
        poly(mb, [E[0],E[1],R1,R0], m, n=(0,-1,1)); poly(mb, [E[2],E[3],R0,R1], m, n=(0,1,1))
        poly(mb, [E[3],E[0],R0], m, n=(-1,0,1)); poly(mb, [E[1],E[2],R1], m, n=(1,0,1))
    else:
        zr = zb + W/2*k; R0 = (cx, Y0 + W/2, zr); R1 = (cx, Y1 - W/2, zr)
        poly(mb, [E[0],E[1],R0], m, n=(0,-1,1)); poly(mb, [E[2],E[3],R1], m, n=(0,1,1))
        poly(mb, [E[3],E[0],R0,R1], m, n=(-1,0,1)); poly(mb, [E[1],E[2],R1,R0], m, n=(1,0,1))
    Eb = [(p[0], p[1], zb - t) for p in E]
    for i in range(4):
        j = (i+1) % 4; poly(mb, [Eb[i], Eb[j], E[j], E[i]], edge, n=((E[i][0]+E[j][0])/2 - cx, (E[i][1]+E[j][1])/2 - cy, 0))
    poly(mb, Eb, edge, n=(0,0,-1))
    return zr
def face_ops(W, floors, fh, ww, wh, sill, n=None, door=None, dw=1.0, dh=2.25, dm='A_door', skip=(), glass='G_glass', z0=0.0, wide=None):
    # ouvertures d'une façade : n fenêtres par étage, porte éventuelle au rez-de-chaussée (indice door)
    n = n or max(1, int(round(W/2.8))); out = []
    for f in range(floors):
        for i in range(n):
            if (f, i) in skip: continue
            c = W*(i+.5)/n
            if f == 0 and door is not None and i == door: out.append((c-dw/2, c+dw/2, z0+.05, z0+dh, dm, .1)); continue
            w = wide if (wide and f == 0) else ww
            out.append((c-w/2, c+w/2, z0 + f*fh + sill, z0 + f*fh + sill + wh, glass))
    return out
def lintels(det, fr, ops, m='trim', h=.14):
    for op in ops:
        a0, a1, b0, b1 = op[:4]
        fbox(det, fr, a0-.08, a1+.08, b1, b1+h, .005, .06, m, skip=('back',))
def shutters(det, fr, ops, m='A_accent'):
    for op in ops:
        a0, a1, b0, b1, fm = op[:5]
        if fm != 'G_glass' or b1 - b0 < .9: continue
        w = min(.6, (a1-a0)/2)
        fbox(det, fr, a0-w-.03, a0-.03, b0, b1, .01, .05, m, skip=('back',)); fbox(det, fr, a1+.03, a1+w+.03, b0, b1, .01, .05, m, skip=('back',))
def parapet(det, x0, y0, x1, y1, z, h=.9, t=.25, m='W_wall2', cap='concrete'):
    for (a0, b0, a1, b1) in [(x0, y0, x1, y0+t), (x0, y1-t, x1, y1), (x0, y0+t, x0+t, y1-t), (x1-t, y0+t, x1, y1-t)]:
        box(det, a0, b0, z, a1, b1, z+h, m, top=cap, skip=('bot',))
def cornice(det, x0, y0, x1, y1, z, h=.25, o=.25, m='trim'):
    box(det, x0-o, y0-o, z, x1+o, y1+o, z+h, m)
def porch(det, fr, a0, a1, depth, h, zfloor, m='trim', posts=True, roof=None):
    fbox(det, fr, a0, a1, h, h+.16, 0, depth, roof or m)
    if posts:
        for a in (a0+.12, a1-.12): fbox(det, fr, a-.07, a+.07, zfloor, h, depth-.2, depth-.06, m)
def ac_unit(det, x, y, z, m='metal'):
    box(det, x, y, z, x+1.1, y+.8, z+.9, m, skip=('bot',)); box(det, x+.15, y-.01, z+.15, x+.95, y+.01, z+.75, 'darkmetal', skip=('bot',))
def garage_door(ops, a0, a1, h=2.3):
    ops.append((a0, a1, .05, h, 'garage', .12)); return ops
def gable_body(body, det, x0, y0, x1, y1, zP, zE, pitch, axis, ops, wall='W_wall', attic=True, details=True, lint=True):
    # corps de maison à pignons : 4 façades percées jusqu'à zE + triangles de pignon (avec œil-de-bœuf) + pans sous la toiture
    W = x1 - x0; D = y1 - y0; fr = frames(x0, y0, x1, y1, zP); L = {'F': W, 'B': W, 'R': D, 'L': D}
    for k in 'FRBL':
        panel(body, fr[k], L[k], zE - zP, ops.get(k, []), wall)
        if details:
            win_details(det, fr[k], ops.get(k, []))
            if lint: lintels(det, fr[k], [o for o in ops.get(k, []) if o[4] == 'G_glass'])
    k2 = math.tan(math.radians(pitch))
    sides = ['L', 'R'] if axis == 'x' else ['F', 'B']
    span = D if axis == 'x' else W; zr = zE + span/2*k2 - .02
    for s in sides:
        o, u, v, n = frames(x0, y0, x1, y1, zE)[s]
        tri = [fpt((o,u,v,n), 0, 0), fpt((o,u,v,n), span, 0), fpt((o,u,v,n), span/2, zr - zE)]
        holes = []
        if attic and zr - zE > 1.8:
            a0, a1, b0, b1 = span/2 - .35, span/2 + .35, .5, 1.3
            fr2 = (o, u, v, n); holes = [[fpt(fr2,a0,b0), fpt(fr2,a0,b1), fpt(fr2,a1,b1), fpt(fr2,a1,b0)]]
            for (p, q, nn) in [((a0,b0),(a1,b0),v), ((a0,b1),(a1,b1),_mul(v,-1)), ((a0,b0),(a0,b1),u), ((a1,b0),(a1,b1),_mul(u,-1))]:
                poly(body, [fpt(fr2,*p), fpt(fr2,*q), fpt(fr2,q[0],q[1],-.14), fpt(fr2,p[0],p[1],-.14)], 'frame', n=nn)
            poly(body, [fpt(fr2,a0,b0,-.14), fpt(fr2,a1,b0,-.14), fpt(fr2,a1,b1,-.14), fpt(fr2,a0,b1,-.14)], 'G_glass', n=n)
            if details: fbox(det, fr2, a0-.07, a1+.07, b0-.07, b0+.01, .005, .09, 'trim')
        poly(body, tri, wall, holes=holes, n=n)
    if axis == 'x':
        poly(body, [(x0,y0,zE),(x1,y0,zE),(x1,(y0+y1)/2,zr),(x0,(y0+y1)/2,zr)], wall, n=(0,-1,1))
        poly(body, [(x0,y1,zE),(x0,(y0+y1)/2,zr),(x1,(y0+y1)/2,zr),(x1,y1,zE)], wall, n=(0,1,1))
    else:
        poly(body, [(x0,y0,zE),((x0+x1)/2,y0,zr),((x0+x1)/2,y1,zr),(x0,y1,zE)], wall, n=(-1,0,1))
        poly(body, [(x1,y0,zE),(x1,y1,zE),((x0+x1)/2,y1,zr),((x0+x1)/2,y0,zr)], wall, n=(1,0,1))
    return zr
def flat_body(body, det, x0, y0, x1, y1, zP, zE, ops, wall='W_wall', top='roof_flat', details=True, lint=False, mull=True):
    W = x1 - x0; D = y1 - y0; fr = frames(x0, y0, x1, y1, zP); L = {'F': W, 'B': W, 'R': D, 'L': D}
    for k in 'FRBL':
        panel(body, fr[k], L[k], zE - zP, ops.get(k, []), wall)
        if details:
            win_details(det, fr[k], ops.get(k, []), mull=mull)
            if lint: lintels(det, fr[k], [o for o in ops.get(k, []) if o[4] == 'G_glass'])
    poly(body, [(x0,y0,zE),(x1,y0,zE),(x1,y1,zE),(x0,y1,zE)], top, n=(0,0,1))
def plinth(body, x0, y0, x1, y1, h=.35, m='stone', o=.1):
    box(body, x0-o, y0-o, 0, x1+o, y1+o, h, m, skip=('bot',))
def chimney(roof, x, y, z0, z1, m='brick'):
    box(roof, x, y, z0, x+.6, y+.6, z1, m, top='concrete', skip=('bot',))
    box(roof, x-.06, y-.06, z1, x+.66, y+.66, z1+.08, 'concrete')
def gutters(det, x0, y0, x1, y1, ze, ov, pitch, gov=.3, axis='x', zP=.35):
    zb = ze - ov*math.tan(math.radians(pitch))
    if axis == 'x':
        for y in (y0 - ov - .08, y1 + ov - .04): box(det, x0 - gov, y, zb - .14, x1 + gov, y + .12, zb - .02, 'metal')
        for (x, y) in [(x0 - gov + .05, y0 - ov - .02), (x1 + gov - .13, y1 + ov - .06)]: box(det, x, y, zP, x + .08, y + .08, zb - .14, 'metal', skip=('bot',))
    else:
        for x in (x0 - ov - .08, x1 + ov - .04): box(det, x, y0 - gov, zb - .14, x + .12, y1 + gov, zb - .02, 'metal')
        for (x, y) in [(x0 - ov - .02, y0 - gov + .05), (x1 + ov - .06, y1 + gov - .13)]: box(det, x, y, zP, x + .08, y + .08, zb - .14, 'metal', skip=('bot',))
def asset(ents, name, parts):
    # regroupe les accumulateurs (nom de sous-groupe -> mb) dans un groupe nommé
    g = Group(); ents.add_group(g); g.set_name(name)
    for sub, mb in parts: build(mb, g.get_entities(), sub)
    return g
