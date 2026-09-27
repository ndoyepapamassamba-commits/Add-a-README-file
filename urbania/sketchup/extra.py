# Aides supplémentaires communes (poutres).
def beam(det, p0, p1, w, m):
    # poutre de section carrée entre deux points
    d = _sub(p1, p0); L = math.sqrt(_dot(d, d)); d = _mul(d, 1/L)
    ref = (0, 0, 1) if abs(d[2]) < .9 else (1, 0, 0)
    u = _cross(d, ref); lu = math.sqrt(_dot(u, u)); u = _mul(u, w/2/lu); v = _cross(d, u)
    c = [_add(_add(p, _mul(u, su)), _mul(v, sv)) for p in (p0, p1) for (su, sv) in ((-1,-1), (1,-1), (1,1), (-1,1))]
    for i in range(4):
        j = (i+1) % 4
        n = _sub(_mul(_add(c[i], c[j]), .5), p0); n = _sub(n, _mul(d, _dot(n, d)))
        poly(det, [c[i], c[j], c[j+4], c[i+4]], m, n=n)
    poly(det, c[0:4], m, n=_mul(d, -1)); poly(det, c[4:8], m, n=d)
def pad(body, W, D, m='paving', h=.06, i=.2):
    box(body, i, i, 0, W - i, D - i, h, m, skip=('bot',))
def ring_solid(det, cx, cy, prof, m, n=20, top=None):
    # solide de révolution : prof = [(z, r), ...] du bas vers le haut
    rings = [[(cx + r*math.cos(2*math.pi*k/n), cy + r*math.sin(2*math.pi*k/n), z) for k in range(n)] for (z, r) in prof]
    for a, b in zip(rings, rings[1:]):
        for k in range(n):
            j = (k+1) % n; ang = 2*math.pi*(k+.5)/n
            poly(det, [a[k], a[j], b[j], b[k]], m, n=(math.cos(ang), math.sin(ang), 0))
    if top: poly(det, rings[-1], top, n=(0,0,1))
def hyper(det, cx, cy, r0, rmin, r1, h, m='concrete', n=24):
    zt = h*.72; prof = []
    for i in range(9):
        z = h*i/8; r = rmin + (r0 - rmin)*((zt - z)/zt)**2 if z < zt else rmin + (r1 - rmin)*((z - zt)/(h - zt))**2
        prof.append((z, r))
    ring_solid(det, cx, cy, prof, m, n=n)
def tilted(det, x0, y0, w, d, z, ang, m='blackglass'):
    c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    P = [(x0, y0, z), (x0 + w, y0, z), (x0 + w, y0 + d*c, z + d*s), (x0, y0 + d*c, z + d*s)]
    poly(det, P, m, n=(0, -s, c)); poly(det, P[::-1], 'steel', n=(0, s, -c))
def red_cross(det, fr, a, b, s, c=.15):
    fbox(det, fr, a - s/2, a + s/2, b - s/6, b + s/6, .02, c, 'red', skip=('back',)); fbox(det, fr, a - s/6, a + s/6, b - s/2, b + s/2, .02, c, 'red', skip=('back',))
def court_lines(det, x0, y0, x1, y1, m='white', w=.1):
    for (a0, b0, a1, b1) in [(x0, y0, x1, y0 + w), (x0, y1 - w, x1, y1), (x0, y0, x0 + w, y1), (x1 - w, y0, x1, y1), (x0, (y0+y1)/2 - w/2, x1, (y0+y1)/2 + w/2)]:
        box(det, a0, b0, .06, a1, b1, .08, m, skip=('bot',))
def flagpole(det, x, y, h=9, m='blue'):
    box(det, x, y, 0, x + .12, y + .12, h, 'steel', skip=('bot',)); box(det, x + .12, y + .04, h - 1.6, x + 1.9, y + .08, h - .4, m)
