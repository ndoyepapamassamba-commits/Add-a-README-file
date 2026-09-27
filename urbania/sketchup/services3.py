# Services publics (3) : parcs, sport et monuments. Emprise [0, W] x [0, D], façade (route) en y = 0.
def bench(det, x, y, rot=0):
    if rot: box(det, x, y, .42, x + .5, y + 1.8, .5, 'wood'); box(det, x + .42, y, .5, x + .5, y + 1.8, .9, 'wood'); box(det, x + .1, y + .1, 0, x + .4, y + .2, .42, 'darkmetal'); box(det, x + .1, y + 1.6, 0, x + .4, y + 1.7, .42, 'darkmetal')
    else: box(det, x, y, .42, x + 1.8, y + .5, .5, 'wood'); box(det, x, y + .42, .5, x + 1.8, y + .5, .9, 'wood'); box(det, x + .1, y + .1, 0, x + .2, y + .4, .42, 'darkmetal'); box(det, x + 1.6, y + .1, 0, x + 1.7, y + .4, .42, 'darkmetal')
def lamp(det, x, y, h=4.2):
    box(det, x - .06, y - .06, 0, x + .06, y + .06, h, 'darkmetal', skip=('bot',)); box(det, x - .25, y - .25, h, x + .25, y + .25, h + .35, 'E_light')
def fountain(det, cx, cy, r, n=16):
    ring_solid(det, cx, cy, [(0, r), (.55, r)], 'stone', n=n, top=None); ring_solid(det, cx, cy, [(.55, r), (.55, r - .3)], 'stone', n=n)
    cyl(det, cx, cy, .02, .45, r - .3, 'water', n=n); cyl(det, cx, cy, .45, 1.6, .35, 'stone', n=10); cyl(det, cx, cy, 1.6, 1.8, 1.0, 'stone', n=12, top='water')
def svc_park(ents):
    W, D = 16.0, 16.0; body = MB(); det = MB()
    pad(body, W, D, 'grass', h=.05)
    box(body, 7.1, .2, 0, 8.9, 15.8, .08, 'paving', skip=('bot',)); box(body, .2, 7.1, 0, 15.8, 8.9, .08, 'paving', skip=('bot',))
    bench(det, 4.6, 5.0); bench(det, 9.6, 10.5); lamp(det, 6.6, 6.6); lamp(det, 9.4, 9.4)
    for (x, y) in [(.3, .3), (15.3, .3), (.3, 15.3), (15.3, 15.3)]: box(det, x, y, 0, x + .4, y + .4, .5, 'stone')
    return asset(ents, 'svc_park@16x16', [('body', body), ('details', det)])
def svc_playground(ents):
    W, D = 16.0, 16.0; body = MB(); det = MB()
    pad(body, W, D, 'grass', h=.05); box(body, 2, 2, 0, 14, 14, .09, 'sand', skip=('bot',))
    beam(det, (3, 4, 0), (3, 4, 2.4), .12, 'red'); beam(det, (3, 7, 0), (3, 7, 2.4), .12, 'red'); beam(det, (3, 4, 2.4), (3, 7, 2.4), .12, 'red')
    for y in (4.9, 6.1): box(det, 2.8, y - .25, .5, 3.2, y + .25, .56, 'darkmetal'); box(det, 2.97, y - .01, .56, 3.03, y + .01, 2.4, 'steel')
    box(det, 8, 3, 0, 10, 5, 1.6, 'blue', skip=('bot',)); box(det, 8, 2.2, 1.6, 10, 5.8, 2.5, 'yellow', skip=('bot',))
    poly(det, [(10, 3.4, 1.6), (13, 3.4, .1), (13, 4.6, .1), (10, 4.6, 1.6)], 'red', n=(1, 0, 2)); poly(det, [(10, 4.6, 1.6), (13, 4.6, .1), (13, 3.4, .1), (10, 3.4, 1.6)], 'red', n=(-1, 0, -2))
    for (x, y) in [(8.1, 2.3), (9.8, 2.3), (8.1, 5.6), (9.8, 5.6)]: box(det, x, y, 0, x + .12, y + .12, 3.2, 'steel', skip=('bot',))
    ring_solid(det, 10, 11, [(0, 1.8), (1.2, 1.8)], 'green', n=12, top=None); beam(det, (4, 10.5, .4), (7, 11.5, .7), .2, 'orange'); box(det, 5.3, 10.8, 0, 5.7, 11.2, .5, 'darkmetal')
    bench(det, 13.8, 7.0, 1); bench(det, .3, 12.0, 1)
    return asset(ents, 'svc_playground@16x16', [('body', body), ('details', det)])
def svc_plaza(ents):
    W, D = 24.0, 24.0; body = MB(); det = MB()
    pad(body, W, D, 'paving', h=.1)
    for i in range(6):
        for j in range(6):
            if (i + j) % 2: box(det, 1 + i*3.67, 1 + j*3.67, .1, 1 + (i + 1)*3.67, 1 + (j + 1)*3.67, .12, 'stone', skip=('bot',))
    fountain(det, 12, 12, 3.2)
    for (x, y) in [(2, 2), (19, 2), (2, 19), (19, 19)]: box(det, x, y, .1, x + 3, y + 3, .8, 'stone', top='grass', skip=('bot',))
    for (x, y, r) in [(5.5, 11.1, 1), (17.9, 11.1, 1)]: bench(det, x, y, r)
    bench(det, 11.1, 5.8); bench(det, 11.1, 17.7); lamp(det, 7, 7); lamp(det, 17, 7); lamp(det, 7, 17); lamp(det, 17, 17)
    return asset(ents, 'svc_plaza@24x24', [('body', body), ('details', det)])
def svc_bigpark(ents):
    W, D = 48.0, 48.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'grass', h=.05)
    pond = [(26 + 10*math.cos(2*math.pi*k/16)*(1 + .15*math.sin(3*k)), 30 + 7*math.sin(2*math.pi*k/16), .09) for k in range(16)]
    poly(det, pond, 'water', n=(0,0,1)); poly(det, [(p[0], p[1], .07) for p in pond], 'stone', n=(0,0,1))
    box(body, 23, .2, 0, 25, 47.8, .08, 'paving', skip=('bot',)); box(body, .2, 12, 0, 47.8, 14, .08, 'paving', skip=('bot',))
    box(det, 21, 22, .1, 29, 24, .4, 'wood'); box(det, 21, 22, .4, 29, 22.12, 1.2, 'wood'); box(det, 21, 23.88, .4, 29, 24, 1.2, 'wood')
    for k in range(8):
        a = 2*math.pi*k/8; cyl(det, 10 + 3*math.cos(a), 34 + 3*math.sin(a), .3, 3.2, .15, 'white', n=8)
    cyl(det, 10, 34, 0, .3, 3.6, 'stone', n=8); ring_solid(roof, 10, 34, [(3.2, 3.9), (3.4, 3.9), (5.2, .1)], 'R_roof', n=8)
    for (x, y) in [(20, 8), (27, 8), (32, 15.2), (15, 15.2), (36, 42)]: bench(det, x, y)
    for (x, y) in [(22.4, 6), (25.6, 20), (22.4, 34), (25.6, 44), (8, 13), (40, 13)]: lamp(det, x, y)
    return asset(ents, 'svc_bigpark@48x48', [('body', body), ('roof', roof), ('details', det)])
def svc_sports(ents):
    W, D = 40.0, 24.0; body = MB(); det = MB()
    pad(body, W, D, 'grass', h=.05); box(body, 2, 2, 0, 38, 22, .07, 'green', skip=('bot',))
    court_lines(det, 3, 3, 37, 21); ring_solid(det, 20, 12, [(.07, 3), (.09, 3)], 'white', n=20)
    for x in (2.2, 37.3):
        box(det, x, 10.2, 0, x + .12, 10.32, 2.4, 'white', skip=('bot',)); box(det, x, 13.68, 0, x + .12, 13.8, 2.4, 'white', skip=('bot',)); box(det, x, 10.2, 2.3, x + .12, 13.8, 2.44, 'white')
    for i in range(3): box(det, 6, 22.2 + i*.6, 0, 34, 22.8 + i*.6, .45 + i*.45, 'concrete')
    for x in range(1, 40, 3): box(det, x, .5, 0, x + .08, .58, 3, 'steel', skip=('bot',))
    box(det, 1, .52, 2.9, 39, .56, 3.0, 'steel')
    return asset(ents, 'svc_sports@40x24', [('body', body), ('details', det)])
def svc_stadium(ents):
    W, D = 96.0, 80.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'paving'); cx, cy = 48, 40
    box(body, 18, 16, 0, 78, 64, .1, 'green', skip=('bot',)); court_lines(det, 20, 18, 76, 62)
    n = 32
    def E(a, b, t): return (cx + a*math.cos(t), cy + b*math.sin(t))
    for k in range(n):
        t0 = 2*math.pi*k/n; t1 = 2*math.pi*(k + 1)/n; P = []
        for (a, b, z) in [(33, 27, 1.2), (37, 31, 5), (41, 35, 9), (45, 38.5, 14)]:
            P.append((E(a, b, t0), E(a, b, t1), z))
        for i in range(3):
            (p0, p1, z0), (q0, q1, z1) = P[i], P[i + 1]
            poly(body, [(p0[0], p0[1], z0), (p1[0], p1[1], z0), (q1[0], q1[1], z1), (q0[0], q0[1], z1)], 'concrete' if i != 1 else 'A_accent', n=(cx - p0[0] + cx - p1[0], cy - p0[1] + cy - p1[1], 40))
        (a0, a1, zt) = P[3]
        poly(body, [(a0[0], a0[1], 0), (a1[0], a1[1], 0), (a1[0], a1[1], zt), (a0[0], a0[1], zt)], 'W_wall', n=(a0[0] - cx + a1[0] - cx, a0[1] - cy + a1[1] - cy, 0))
        (b0, b1, zb) = P[0]
        poly(body, [(b0[0], b0[1], 0), (b1[0], b1[1], 0), (b1[0], b1[1], zb), (b0[0], b0[1], zb)], 'W_wall2', n=(cx - b0[0] + cx - b1[0], cy - b0[1] + cy - b1[1], 0))
        r0, r1 = E(45.5, 39, t0), E(45.5, 39, t1); s0, s1 = E(38, 32, t0), E(38, 32, t1)
        poly(roof, [(r0[0], r0[1], 20), (r1[0], r1[1], 20), (s1[0], s1[1], 18.5), (s0[0], s0[1], 18.5)], 'white', n=(0, 0, 1)); poly(roof, [(s0[0], s0[1], 18.4), (s1[0], s1[1], 18.4), (r1[0], r1[1], 19.9), (r0[0], r0[1], 19.9)], 'steel', n=(0, 0, -1))
        if k % 4 == 0: beam(det, (r0[0], r0[1], 14), (r0[0], r0[1], 20), .6, 'steel')
    for (x, y) in [(6, 6), (90, 6), (6, 74), (90, 74)]:
        box(det, x - .5, y - .5, 0, x + .5, y + .5, 34, 'steel', skip=('bot',)); box(det, x - 2.5, y - .4, 34, x + 2.5, y + .4, 36.5, 'E_light')
    return asset(ents, 'svc_stadium@96x80', [('body', body), ('roof', roof), ('details', det)])
def svc_cityhall(ents):
    W, D = 40.0, 32.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'paving')
    ops = {'F': face_ops(30, 2, 5.0, 1.6, 3.0, 1.0, n=9, door=4, dw=2.6, dh=4.0), 'B': face_ops(30, 2, 5.0, 1.6, 3.0, 1.0, n=9), 'R': face_ops(16, 2, 5.0, 1.6, 3.0, 1.0, n=5), 'L': face_ops(16, 2, 5.0, 1.6, 3.0, 1.0, n=5)}
    plinth(body, 5, 12, 35, 28, h=1.0, m='stone', o=.3)
    flat_body(body, det, 5, 12, 35, 28, 1.0, 11.0, ops, wall='W_wall', top='concrete', lint=True)
    cornice(det, 5, 12, 35, 28, 11.0, .6, .45, 'trim'); cornice(det, 5, 12, 35, 28, 5.9, .2, .15, 'trim')
    hip_roof(roof, 5, 12, 35, 28, 11.6, 20, ov=.5)
    fr = frames(5, 12, 35, 28, 0)['F']
    for i in range(6): cyl(det, 5 + 9 + i*2.4, 12 - 3.4, 1.0, 10.2, .45, 'trim', n=14)
    fbox(det, fr, 8.2, 21.8, 0, 1.0, 0, 4.6, 'stone'); fbox(det, fr, 8.2, 21.8, 10.2, 11.2, 0, 4.2, 'trim')
    poly(det, [fpt(fr, 8.2, 11.2, 4.2), fpt(fr, 21.8, 11.2, 4.2), fpt(fr, 15, 14.2, 4.2)], 'trim', n=(0, -1, 0))
    extrude_y(roof, [(8.2 + 5, 11.2), (21.8 + 5, 11.2), (15 + 5, 14.2)], 12 - 4.3, 12, lambda i: 'R_roof', 'trim')
    box(det, 17, 17, 11.6, 23, 23, 20, 'W_wall', top='concrete', skip=('bot',))
    box(det, 18.8, 16.9, 15.6, 21.2, 17.0, 18.0, 'white')
    ring_solid(det, 20, 20, [(20, 3.4), (21.4, 3.2), (22.6, 2.6), (23.6, 1.6), (24.2, .1)], 'glassroof', n=16)
    box(det, 19.95, 19.95, 24.2, 20.05, 20.05, 27, 'steel', skip=('bot',))
    for x in (13, 27): box(det, x, 2, 0, x + .14, 2.14, 12, 'steel', skip=('bot',)); box(det, x + .14, 2.05, 10, x + 2.2, 2.1, 11.4, 'blue' if x < 20 else 'red')
    return asset(ents, 'svc_cityhall@40x32', [('body', body), ('roof', roof), ('details', det)])
def svc_tower(ents):
    W, D = 24.0, 24.0; body = MB(); det = MB()
    pad(body, W, D, 'paving')
    ring_solid(body, 12, 12, [(0, 9.5), (5, 9.5)], 'G_glass', n=20, top='concrete'); ring_solid(det, 12, 12, [(5, 9.8), (5.6, 9.8)], 'white', n=20, top='white')
    ring_solid(body, 12, 12, [(5.6, 3.6), (60, 2.9), (140, 2.1)], 'concrete', n=16)
    ring_solid(det, 12, 12, [(140, 2.1), (142, 6.5), (146, 8.2), (150, 8.2), (153, 6.0), (155, 3.0), (157, 2.0)], 'white', n=24, top='concrete')
    ring_solid(det, 12, 12, [(145.6, 8.25), (149.4, 8.25)], 'G_glass', n=24)
    ring_solid(det, 12, 12, [(157, 1.2), (190, .5), (200, .15)], 'steel', n=8)
    for z in (165, 175, 185): ring_solid(det, 12, 12, [(z, 1.4), (z + .6, 1.4)], 'red', n=8, top='red')
    return asset(ents, 'svc_tower@24x24', [('body', body), ('details', det)])
