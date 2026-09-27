# Industrie (zone 5) et spécialisations (ferme, forêt, mine, pétrole). Façade avant en y = 0.
def ribs(det, fr, L, H, step=3.0, m='W_wall2', d=.18, w=.25):
    a = step
    while a < L - .5: fbox(det, fr, a - w/2, a + w/2, 0, H, 0, d, m, skip=('back', 'bot')); a += step
def low_gable(roof, x0, y0, x1, y1, ze, pitch=8, ov=.4, m='R_roof'):
    return gable_roof(roof, x0, y0, x1, y1, ze, pitch, ov=ov, gov=.3, t=.18, m=m, edge='metal', axis='x')
def tank(det, cx, cy, r, h, m='steel', cap=True):
    cyl(det, cx, cy, 0, h, r, m, n=16)
    if cap: cyl(det, cx, cy, h, h + r*.35, r, m, n=16, r1=r*.15)
def stack(det, cx, cy, r, h, m='concrete', band='red'):
    cyl(det, cx, cy, 0, h - 3, r*1.1, m, n=12, r1=r)
    cyl(det, cx, cy, h - 3, h - 1.5, r, band, n=12); cyl(det, cx, cy, h - 1.5, h, r, m, n=12)
def i_warehouse(ents):
    W, D, h = 26.0, 16.0, 8.0; body = MB(); det = MB(); roof = MB()
    ops = {'F': [(2 + i*5.2, 5.6 + i*5.2, .05, 4.4, 'garage', .15) for i in range(4)] + [(22.2, 23.4, .05, 2.3, 'A_door', .1)],
           'R': row(D, 4, 1.4, 5.0, 6.4), 'L': row(D, 4, 1.4, 5.0, 6.4), 'B': row(W, 6, 1.4, 5.0, 6.4)}
    flat_body(body, det, 0, 0, W, D, 0, h, ops, top='concrete', mull=False)
    fr = frames(0, 0, W, D, 0)
    for k, L in (('F', W), ('B', W), ('R', D), ('L', D)): ribs(det, fr[k], L, h)
    for i in range(4): a0 = 1.8 + i*5.2; fbox(det, fr['F'], a0, a0 + 4.0, 4.6, 4.8, 0, 1.6, 'darkmetal'); box(det, a0 + .1, -1.8, 0, a0 + 3.9, 0, 1.2, 'concrete', skip=('bot',))
    low_gable(roof, 0, 0, W, D, h)
    for x in (4, 10, 16, 22): box(roof, x, 3, h + .3, x + 2, D - 3, h + .9, 'glassroof', skip=('bot',))
    # bureau d'angle
    ox0, oy0, ox1, oy1 = W, 0, W + 6, 8
    oops = {'F': face_ops(6, 2, 3.2, 1.6, 1.4, .9, n=2), 'R': face_ops(8, 2, 3.2, 1.6, 1.4, .9, n=3), 'B': face_ops(6, 2, 3.2, 1.6, 1.4, .9, n=2), 'L': []}
    flat_body(body, det, ox0, oy0, ox1, oy1, 0, 6.4, oops, wall='A_base', top='roof_flat')
    return asset(ents, 'i_warehouse', [('body', body), ('roof', roof), ('details', det)])
def i_factory(ents):
    W, D, h = 24.0, 18.0, 9.0; body = MB(); det = MB(); roof = MB()
    ops = {'F': [(3, 8, .05, 5.0, 'garage', .15), (16, 21, .05, 5.0, 'garage', .15)] + row(W, 8, 1.6, 6.2, 7.8), 'B': row(W, 8, 1.6, 6.2, 7.8),
           'R': row(D, 6, 1.6, 6.2, 7.8), 'L': row(D, 6, 1.6, 6.2, 7.8)}
    flat_body(body, det, 0, 0, W, D, 0, h, ops, top='concrete', mull=False)
    fr = frames(0, 0, W, D, 0)
    for k, L in (('F', W), ('B', W), ('R', D), ('L', D)): ribs(det, fr[k], L, h, step=4.0)
    # toit en sheds : 4 dents vitrées au nord
    for i in range(4):
        y0 = i*4.5; y1 = y0 + 4.5
        prof = [(y0, h), (y1, h), (y1, h + 3.0)]
        a = [(0, p[0], p[1]) for p in prof]; b = [(W, p[0], p[1]) for p in prof]
        poly(roof, a, 'metal', n=(-1,0,0)); poly(roof, b, 'metal', n=(1,0,0))
        poly(roof, [a[0], b[0], b[2], a[2]], 'R_roof', n=(0, -1, 1.5)); poly(roof, [a[1], a[2], b[2], b[1]], 'G_glass', n=(0, 1, 0))
    ox0, oy0, ox1, oy1 = -8, -1, 0, 9
    oops = {'F': face_ops(8, 2, 3.4, 1.7, 1.5, .9, n=3, door=1, dw=1.6), 'L': face_ops(10, 2, 3.4, 1.7, 1.5, .9, n=3), 'B': face_ops(8, 2, 3.4, 1.7, 1.5, .9, n=3), 'R': []}
    flat_body(body, det, ox0, oy0, ox1, oy1, 0, 6.8, oops, wall='A_base', top='roof_flat', lint=True)
    parapet(det, ox0, oy0, ox1, oy1, 6.8, h=.6, t=.2, m='A_base')
    stack(det, W - 3, D + 3, 1.0, 24)
    tank(det, 4, D + 3.5, 2.4, 8); tank(det, 10, D + 3.5, 2.4, 8)
    box(det, 4, D + 1, 6.5, 10, D + 1.4, 6.9, 'metal'); box(det, 10, D - .1, 6.5, 10.4, D + 1.4, 6.9, 'metal')
    return asset(ents, 'i_factory', [('body', body), ('roof', roof), ('details', det)])
def i_plant(ents):
    W, D, h = 22.0, 14.0, 12.0; body = MB(); det = MB(); roof = MB()
    ops = {'F': [(2, 8, .05, 6.0, 'garage', .15)] + row(W, 7, 1.8, 8, 10.4), 'B': row(W, 7, 1.8, 8, 10.4), 'R': row(D, 4, 1.8, 8, 10.4), 'L': row(D, 4, 1.8, 8, 10.4)}
    flat_body(body, det, 0, 0, W, D, 0, h, ops, top='concrete', mull=False)
    fr = frames(0, 0, W, D, 0)
    for k, L in (('F', W), ('B', W), ('R', D), ('L', D)): ribs(det, fr[k], L, h, step=3.5)
    low_gable(roof, 0, 0, W, D, h, pitch=6)
    for i, x in enumerate((3.5, 10.5, 17.5)): tank(det, x, D + 5, 3.0, 13)
    stack(det, W + 4, D - 2, 1.4, 34); stack(det, W + 4, 4, 1.1, 28)
    box(det, 0, D + 1.6, 9, W + 4, D + 2.0, 9.4, 'metal'); box(det, 0, D + 8.4, 9, W, D + 8.8, 9.4, 'metal')
    for x in (1, 7, 14, 21): box(det, x, D + 1.6, 0, x + .3, D + 1.9, 9, 'metal', skip=('bot',))
    for (x, y) in [(W + 1, D + 3), (W + 4.5, D + 3)]: box(det, x, y, 0, x + 2.6, y + 3.4, 3.6, 'metal', top='darkmetal', skip=('bot',))
    cyl(det, 11, D + 12.5, 0, 6, 3.6, 'W_wall2', n=16, top='concrete')
    return asset(ents, 'i_plant', [('body', body), ('roof', roof), ('details', det)])
def f_farm(ents):
    body = MB(); det = MB(); roof = MB()
    W, D, h = 12.0, 8.0, 5.0
    ops = {'F': [(4, 8, .05, 4.2, 'wood', .2)], 'B': [(5, 7, .05, 2.4, 'wood', .1)], 'R': row(D, 2, 1.0, 2.8, 3.8), 'L': row(D, 2, 1.0, 2.8, 3.8)}
    fr = frames(0, 0, W, D, 0)
    for k, L in (('F', W), ('R', D), ('B', W), ('L', D)): panel(body, fr[k], L, h, ops[k], 'W_wall', rev='white')
    k = math.tan(math.radians(38)); zr = h + W/2*k
    for (y, n) in ((0, (0,-1,0)), (D, (0,1,0))): poly(body, [(0, y, h), (W, y, h), (W/2, y, zr - .02)], 'W_wall', n=n)
    gable_roof(roof, 0, 0, W, D, h, 38, ov=.4, gov=.4, axis='y', m='R_roof', edge='white')
    frF = frames(0, 0, W, D, 0)['F']
    fbox(det, frF, 3.8, 8.2, 4.2, 4.4, 0, .1, 'white', skip=('back',)); fbox(det, frF, 3.8, 4.0, 0, 4.4, 0, .1, 'white', skip=('back',)); fbox(det, frF, 8.0, 8.2, 0, 4.4, 0, .1, 'white', skip=('back',))
    fbox(det, frF, 4.0, 8.0, 0, 4.2, -.18, -.12, 'white', skip=('back',))
    cyl(det, W + 3.2, D - 2.5, 0, 12, 2.2, 'steel', n=16); cyl(det, W + 3.2, D - 2.5, 12, 13.6, 2.25, 'steel', n=16, r1=.2)
    cyl(det, W + 3.2, 2.0, 0, 9, 1.6, 'metal', n=14); cyl(det, W + 3.2, 2.0, 9, 10.2, 1.62, 'metal', n=14, r1=.2)
    box(det, -6, 1, 0, -1, 5, 2.2, 'wood', top='R_roof', skip=('bot',))
    return asset(ents, 'f_farm', [('body', body), ('roof', roof), ('details', det)])
def f_sawmill(ents):
    body = MB(); det = MB(); roof = MB()
    W, D, h = 18.0, 10.0, 6.0
    ops = {'F': [(1, 17, .05, 4.8, 'wood', .8)], 'B': row(W, 5, 1.6, 3.4, 4.6), 'R': [(2, 8, .05, 4.5, 'garage', .15)], 'L': [(3, 7, .05, 4.5, 'garage', .15)]}
    flat_body(body, det, 0, 0, W, D, 0, h, ops, wall='W_wall', top='concrete', mull=False)
    ribs(det, frames(0, 0, W, D, 0)['B'], W, h, step=2.0, m='wood')
    gable_roof(roof, 0, 0, W, D, h, 18, ov=.8, gov=.6)
    box(det, 5, -8, 0, 7, 0, 1.0, 'metal', skip=('bot',)); box(det, 5, -8, 1.0, 7, 0, 1.15, 'darkmetal')
    for i in range(4): box(det, 4.8, -7.5 + i*2.2, 0, 5, -7.3 + i*2.2, 1.0, 'metal')
    ox0, oy0 = W + 1, 1
    flat_body(body, det, ox0, oy0, ox0 + 5, oy0 + 6, 0, 3.2, {'F': face_ops(5, 1, 3.2, 1.2, 1.3, .9, n=2, door=0), 'R': row(6, 2, 1.2, .9, 2.2)}, wall='wood', top='roof_flat')
    hip_roof(roof, ox0, oy0, ox0 + 5, oy0 + 6, 3.2, 25, ov=.3)
    return asset(ents, 'f_sawmill', [('body', body), ('roof', roof), ('details', det)])
def f_mine(ents):
    body = MB(); det = MB(); roof = MB()
    W, D, h = 16.0, 10.0, 9.0
    ops = {'F': [(2, 6, .05, 5, 'garage', .15)] + row(W, 5, 1.6, 6.2, 7.8), 'B': row(W, 5, 1.6, 6.2, 7.8), 'R': row(D, 3, 1.6, 6.2, 7.8), 'L': row(D, 3, 1.6, 6.2, 7.8)}
    flat_body(body, det, 0, 0, W, D, 0, h, ops, top='concrete', mull=False)
    ribs(det, frames(0, 0, W, D, 0)['F'], W, h, step=3.0)
    low_gable(roof, 0, 0, W, D, h, pitch=14)
    # chevalement : 4 poteaux inclinés, entretoises, molette
    cx, cy, H = W + 5, 5, 24
    for (dx, dy) in [(-2.2, -2.2), (2.2, -2.2), (2.2, 2.2), (-2.2, 2.2)]:
        beam(det, (cx + dx, cy + dy, 0), (cx + dx*.45, cy + dy*.45, H), .4, 'red')
    for z in (6, 12, 18):
        k = 1 - z/H*.55
        for (x0, y0, x1, y1) in [(-2.2*k, -2.2*k, 2.2*k, -2.2*k + .2), (-2.2*k, 2.2*k - .2, 2.2*k, 2.2*k), (-2.2*k, -2.2*k, -2.2*k + .2, 2.2*k), (2.2*k - .2, -2.2*k, 2.2*k, 2.2*k)]:
            box(det, cx + x0, cy + y0, z - .15, cx + x1, cy + y1, z + .15, 'red')
    box(det, cx - 1.4, cy - 1.4, H, cx + 1.4, cy + 1.4, H + .4, 'darkmetal')
    cyl(det, cx, cy, H + .4, H + .9, 2.0, 'darkmetal', n=16)
    box(det, cx - .3, -6, 0, cx + .3, cy - 2.5, 1.0, 'metal', skip=('bot',))
    return asset(ents, 'f_mine', [('body', body), ('roof', roof), ('details', det)])
def f_oil(ents):
    body = MB(); det = MB(); roof = MB()
    flat_body(body, det, 0, 0, 8, 6, 0, 3.4, {'F': face_ops(8, 1, 3.4, 1.4, 1.3, 1.0, n=3, door=1), 'R': row(6, 2, 1.2, 1.0, 2.3)}, wall='W_wall', top='roof_flat')
    parapet(det, 0, 0, 8, 6, 3.4, h=.4, t=.15, m='W_wall')
    for i, x in enumerate((11, 19)): tank(det, x, 4, 3.5, 7.5, m='white'); box(det, x - 3.6, 3.9, 7.5, x + 3.6, 4.1, 8.4, 'metal')
    box(det, 8, 3.8, 1.0, 22.5, 4.2, 1.4, 'metal')
    for x in (9, 15, 22): box(det, x, 3.8, 0, x + .3, 4.2, 1.0, 'metal', skip=('bot',))
    cyl(det, 26, 2, 0, 14, .35, 'steel', n=8); cyl(det, 26, 2, 14, 15, .6, 'red', n=8)
    return asset(ents, 'f_oil', [('body', body), ('roof', roof), ('details', det)])
