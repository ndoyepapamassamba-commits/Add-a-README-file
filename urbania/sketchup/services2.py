# Services publics (2) : éducation et transports. Emprise [0, W] x [0, D], façade (route) en y = 0.
def svc_school(ents):
    W, D = 32.0, 32.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'grass', h=.04)
    ops = {'F': face_ops(20, 2, 3.6, 1.8, 1.7, .9, n=6, door=2, dw=2.4, dh=2.8), 'B': face_ops(20, 2, 3.6, 1.8, 1.7, .9, n=6), 'L': face_ops(16, 2, 3.6, 1.8, 1.7, .9, n=4), 'R': []}
    flat_body(body, det, 2, 14, 22, 30, 0, 7.2, ops, wall='brick', top='roof_flat', lint=True)
    hip_roof(roof, 2, 14, 22, 30, 7.2, 22, ov=.5)
    wops = {'F': face_ops(8, 1, 3.8, 1.8, 1.9, .8, n=3), 'R': face_ops(24, 1, 3.8, 1.8, 1.9, .8, n=7), 'B': face_ops(8, 1, 3.8, 1.8, 1.9, .8, n=3), 'L': face_ops(24, 1, 3.8, 1.8, 1.9, .8, n=7, skip=((0,4),(0,5),(0,6)))}
    flat_body(body, det, 22, 6, 30, 30, 0, 3.8, wops, wall='brick', top='roof_flat', lint=True)
    cornice(det, 22, 6, 30, 30, 3.8, .3, .2, 'trim')
    box(body, 3, 2, 0, 20, 12, .06, 'asphalt', skip=('bot',)); court_lines(det, 4, 3, 19, 11)
    for x in (4.3, 18.7): box(det, x, 6.9, 0, x + .12, 7.1, 3.2, 'steel', skip=('bot',)); box(det, x - .4 if x > 10 else x, 6.4, 3.0, x + .5 if x < 10 else x + .12, 7.6, 3.9, 'white')
    fbox(det, frames(2, 14, 22, 30, 0)['F'], 7.5, 12.5, 2.95, 3.15, 0, 1.6, 'darkmetal'); flagpole(det, 1.5, 12.5)
    return asset(ents, 'svc_school@32x32', [('body', body), ('roof', roof), ('details', det)])
def svc_lycee(ents):
    W, D = 48.0, 40.0; body = MB(); det = MB()
    pad(body, W, D, 'grass', h=.04)
    ops = {'F': face_ops(36, 3, 3.6, 1.8, 1.8, .9, n=12, door=5, dw=3.0, dh=3.0), 'B': face_ops(36, 3, 3.6, 1.8, 1.8, .9, n=12), 'R': face_ops(14, 3, 3.6, 1.8, 1.8, .9, n=4), 'L': face_ops(14, 3, 3.6, 1.8, 1.8, .9, n=4)}
    flat_body(body, det, 2, 22, 38, 36, 0, 10.8, ops, wall='W_wall', top='roof_flat')
    for z in (3.6, 7.2): box(det, 1.9, 21.9, z - .08, 38.1, 36.1, z + .12, 'W_wall2', skip=('top', 'bot'))
    parapet(det, 2, 22, 38, 36, 10.8, h=.8, t=.25, m='W_wall2')
    gops = {'F': [(2, 12, 6, 8.4, 'G_glass', .2)], 'R': row(20, 5, 2.4, 6, 8.4), 'B': [], 'L': row(20, 5, 2.4, 6, 8.4)}
    flat_body(body, det, 38.5, 16, 46, 36, 0, 9.5, gops, wall='A_accent', top='roof_flat', mull=False)
    box(body, 3, 2, 0, 28, 18, .06, 'asphalt', skip=('bot',)); court_lines(det, 4, 3, 16, 17); court_lines(det, 17, 3, 27, 17)
    box(body, 30, 2, 0, 46, 14, .07, 'asphalt', skip=('bot',))
    for x in range(31, 46, 3): box(det, x, 3, .07, x + .1, 8, .09, 'white', skip=('bot',))
    fbox(det, frames(2, 22, 38, 36, 0)['F'], 14.5, 21.5, 3.0, 3.2, 0, 2.0, 'darkmetal'); flagpole(det, 2, 19.5)
    return asset(ents, 'svc_lycee@48x40', [('body', body), ('details', det)])
def svc_univ(ents):
    W, D = 72.0, 56.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'grass', h=.04)
    box(body, 33, .3, 0, 39, 30, .07, 'paving', skip=('bot',)); box(body, 6, 22, 0, 66, 26, .07, 'paving', skip=('bot',))
    mops = {'F': face_ops(30, 3, 4.0, 1.6, 2.2, .9, n=9, door=4, dw=3.2, dh=3.6), 'B': face_ops(30, 3, 4.0, 1.6, 2.2, .9, n=9), 'R': face_ops(16, 3, 4.0, 1.6, 2.2, .9, n=5), 'L': face_ops(16, 3, 4.0, 1.6, 2.2, .9, n=5)}
    flat_body(body, det, 21, 30, 51, 46, 0, 12, mops, wall='W_wall', top='roof_flat', lint=True)
    cornice(det, 21, 30, 51, 46, 12, .5, .35, 'trim')
    fr = frames(21, 30, 51, 46, 0)['F']
    fbox(det, fr, 9, 21, 0, .5, 0, 5, 'stone'); fbox(det, fr, 9, 21, 9.5, 10.3, 0, 4.4, 'trim')
    poly(det, [fpt(fr, 9, 10.3, 4.4), fpt(fr, 21, 10.3, 4.4), fpt(fr, 15, 13.3, 4.4)], 'trim', n=(0,-1,0))
    for i in range(6): a = 9.8 + i*2.08; cyl(det, 21 + a, 30 - 3.6, .5, 9.5, .38, 'trim', n=12)
    ring_solid(det, 36, 38, [(12, 6.2), (15, 6.2)], 'W_wall2', n=24)
    ring_solid(det, 36, 38, [(15, 6.4), (17, 6.0), (18.6, 5.0), (19.8, 3.6), (20.6, 1.8), (21.0, .2)], 'glassroof', n=24)
    wops = {'F': face_ops(14, 3, 3.6, 1.6, 1.8, .9, n=4), 'R': face_ops(22, 3, 3.6, 1.6, 1.8, .9, n=6), 'B': face_ops(14, 3, 3.6, 1.6, 1.8, .9, n=4), 'L': face_ops(22, 3, 3.6, 1.6, 1.8, .9, n=6)}
    for x0 in (3, 55):
        flat_body(body, det, x0, 28, x0 + 14, 50, 0, 10.8, wops, wall='W_wall', top='roof_flat', lint=True)
        hip_roof(roof, x0, 28, x0 + 14, 50, 10.8, 24, ov=.5)
    lops = {k: [(.5, (16 if k in 'FB' else 14) - .5, .5, 7.0, 'G_glass', .2)] for k in 'FRBL'}
    flat_body(body, det, 50, 4, 66, 18, 0, 8, lops, wall='darkmetal', top='roof_flat', mull=False)
    for x in (8, 14, 58, 64): box(det, x - .5, 8, 0, x + .5, 9, 1.0, 'stone')
    return asset(ents, 'svc_univ@72x56', [('body', body), ('roof', roof), ('details', det)])
def svc_depot(ents):
    W, D = 40.0, 32.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'concrete'); box(body, 1, 1, 0, 39, 10, .07, 'asphalt', skip=('bot',))
    ops = {'F': [(1.5 + i*6.2, 6.3 + i*6.2, .05, 5.0, 'garage', .2) for i in range(4)], 'R': row(20, 5, 2.0, 5.6, 7.0), 'L': row(20, 5, 2.0, 5.6, 7.0), 'B': row(26, 6, 2.0, 5.6, 7.0)}
    flat_body(body, det, 2, 10, 28, 30, 0, 8, ops, wall='W_wall', top='concrete', mull=False)
    fr = frames(2, 10, 28, 30, 0)
    for k, L in (('F', 26), ('B', 26), ('R', 20), ('L', 20)):
        a = 3.1
        while a < L - 1: fbox(det, fr[k], a - .15, a + .15, 0, 8, 0, .2, 'W_wall2', skip=('back', 'bot')); a += 6.2
    gable_roof(roof, 2, 10, 28, 30, 8, 10, ov=.4, gov=.3, edge='metal')
    fbox(det, fr['F'], 0, 26, 5.5, 6.4, 0, .15, 'A_accent', skip=('back',))
    flat_body(body, det, 30, 12, 38, 22, 0, 6.4, {'F': face_ops(8, 2, 3.2, 1.5, 1.4, .9, n=3, door=1), 'R': face_ops(10, 2, 3.2, 1.5, 1.4, .9, n=3), 'B': face_ops(8, 2, 3.2, 1.5, 1.4, .9, n=3), 'L': []}, wall='white', top='roof_flat')
    for i in range(5): x = 3 + i*7; box(det, x, 2, .07, x + .12, 9, .09, 'white', skip=('bot',))
    return asset(ents, 'svc_depot@40x32', [('body', body), ('roof', roof), ('details', det)])
def svc_metro(ents):
    W, D = 16.0, 16.0; body = MB(); det = MB()
    pad(body, W, D, 'paving')
    box(det, 5, 4, 0, 11, 12, .3, 'darkmetal', skip=('bot',))
    for (x0, x1) in ((5, 5.25), (10.75, 11)): box(det, x0, 4, .3, x1, 12, 1.1, 'G_glass', skip=('bot',))
    box(det, 4.6, 3.6, 3.4, 11.4, 12.4, 3.6, 'G_glass'); box(det, 4.5, 3.5, 3.6, 11.5, 12.5, 3.75, 'steel')
    for (x, y) in [(4.7, 3.7), (11.1, 3.7), (4.7, 12.1), (11.1, 12.1)]: box(det, x, y, 0, x + .2, y + .2, 3.4, 'steel', skip=('bot',))
    box(det, 2.0, 2.0, 0, 2.3, 2.3, 4.2, 'steel', skip=('bot',)); box(det, 1.5, 1.9, 4.2, 2.8, 2.4, 5.5, 'yellow'); box(det, 1.55, 1.88, 4.3, 2.75, 1.9, 5.4, 'E_sign')
    return asset(ents, 'svc_metro@16x16', [('body', body), ('details', det)])
def svc_tramdepot(ents):
    W, D = 48.0, 32.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'concrete')
    ops = {'F': [(1.5 + i*7.0, 7.0 + i*7.0, .05, 5.8, 'garage', .3) for i in range(5)], 'R': row(16, 4, 2.0, 6.4, 7.8), 'L': row(16, 4, 2.0, 6.4, 7.8), 'B': row(38, 8, 2.0, 6.4, 7.8)}
    flat_body(body, det, 2, 14, 40, 30, 0, 9, ops, wall='brick', top='concrete', mull=False)
    for i in range(5):
        x0 = 3.5 + i*7.0 - .25 + 1.5
        extrude_y(roof, [(x0 - 1.5, 9), (x0 + 5.0, 9), (x0 + 1.75, 11.2)], 14, 30, lambda k: 'R_roof', 'brick')
    for i in range(5):
        xc = 2 + 1.5 + i*7.0 + 2.75
        for dx in (-.75, .75): box(det, xc + dx - .05, 0, .06, xc + dx + .05, 14, .14, 'steel', skip=('bot',))
    flat_body(body, det, 41, 16, 47, 26, 0, 6.4, {'F': face_ops(6, 2, 3.2, 1.3, 1.3, .9, n=2, door=0), 'R': face_ops(10, 2, 3.2, 1.3, 1.3, .9, n=3)}, wall='white', top='roof_flat')
    return asset(ents, 'svc_tramdepot@48x32', [('body', body), ('roof', roof), ('details', det)])
def svc_monost(ents):
    W, D = 24.0, 16.0; body = MB(); det = MB()
    pad(body, W, D, 'paving')
    for (x, y) in [(2, 3), (21.2, 3), (2, 12.2), (21.2, 12.2)]: box(det, x, y, 0, x + .8, y + .8, 11.9, 'concrete', skip=('bot',))
    box(det, 0, 1.5, 11.9, 24, 6.4, 12.3, 'concrete'); box(det, 0, 9.6, 11.9, 24, 14.5, 12.3, 'concrete')
    for (y0, y1) in ((1.5, 1.6), (14.4, 14.5)): box(det, 0, y0, 12.3, 24, y1, 13.4, 'G_glass', skip=('bot',))
    box(det, -.2, 1.3, 16.2, 24.2, 14.7, 16.5, 'white'); box(det, -.1, 1.4, 16.5, 24.1, 14.6, 16.7, 'glassroof')
    for x in (3, 12, 21): box(det, x, 1.6, 12.3, x + .2, 1.8, 16.2, 'steel', skip=('bot',)); box(det, x, 14.2, 12.3, x + .2, 14.4, 16.2, 'steel', skip=('bot',))
    flat_body(body, det, 9, 0.6, 15, 4.6, 0, 11.9, {'F': [(1.5, 4.5, .05, 2.6, 'G_glass', .2)], 'L': row(4, 1, 1.2, 3, 10), 'R': row(4, 1, 1.2, 3, 10)}, wall='W_wall', top='concrete', mull=False)
    box(det, 9.5, .45, 8.8, 14.5, .6, 10.2, 'E_sign')
    return asset(ents, 'svc_monost@24x16', [('body', body), ('details', det)])
def svc_pier(ents):
    W, D = 24.0, 24.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, 12, 'paving')
    flat_body(body, det, 4, 2, 20, 9, 0, 4.2, {'F': [(1, 7, .4, 3.4, 'G_glass', .2), (8, 10, .05, 2.8, 'A_door', .2), (11, 15, .4, 3.4, 'G_glass', .2)], 'B': [(6, 10, .05, 3.0, 'G_glass', .2)], 'R': row(7, 2, 1.4, 1.0, 3.0), 'L': row(7, 2, 1.4, 1.0, 3.0)}, wall='white', top='roof_flat')
    gable_roof(roof, 4, 2, 20, 9, 4.2, 18, ov=.8, gov=.6, m='R_roof', edge='white')
    box(det, 9, 9, -.3, 15, 23.8, .1, 'wood')
    for y in (10, 14, 18, 22):
        for x in (9.2, 14.4): box(det, x, y, -3.5, x + .4, y + .4, .6, 'wood', skip=('bot',))
    for (x, y) in [(9.3, 23.3), (14.3, 23.3), (9.3, 16), (14.3, 16)]: cyl(det, x + .15, y, .1, .7, .18, 'darkmetal', n=8)
    for y in (12, 15, 18, 21): box(det, 8.9, y, .1, 9.0, y + .05, 1.1, 'steel'); box(det, 15.0, y, .1, 15.1, y + .05, 1.1, 'steel')
    box(det, 8.9, 11, 1.05, 9.0, 23.8, 1.12, 'steel'); box(det, 15.0, 11, 1.05, 15.1, 23.8, 1.12, 'steel')
    return asset(ents, 'svc_pier@24x24', [('body', body), ('roof', roof), ('details', det)])
def svc_station(ents):
    # les voies longent la façade avant (y = 0) : quai et marquise devant, entrée côté ville à l'arrière
    W, D = 64.0, 24.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'paving')
    box(body, 1, .3, 0, 63, 6.5, .9, 'concrete', skip=('bot',)); box(det, 1, .3, .9, 63, .6, .92, 'yellow', skip=('bot',))
    for x in range(2, 63, 6): box(det, x, 3.3, .9, x + .25, 3.55, 5.0, 'steel', skip=('bot',))
    box(det, 1, .3, 5.0, 63, 6.6, 5.3, 'darkmetal')
    for x in range(4, 62, 12): box(det, x, 4.4, .9, x + 1.8, 4.9, 1.4, 'wood')
    ops = {'B': [(2, 6, .6, 5.5, 'G_glass', .25), (8, 12, .6, 5.5, 'G_glass', .25), (13.5, 16.5, .05, 5.0, 'G_glass', .6), (18, 22, .6, 5.5, 'G_glass', .25), (24, 28, .6, 5.5, 'G_glass', .25)],
           'F': [(4, 26, .95, 4.5, 'G_glass', .3)], 'R': row(12, 3, 1.6, 1.5, 5), 'L': row(12, 3, 1.6, 1.5, 5)}
    flat_body(body, det, 17, 8, 47, 20, 0, 8, ops, wall='W_wall', top='concrete', mull=False)
    extrude_x(roof, [(7.6, 8), (20.4, 8), (19.2, 10.6), (14, 12.2), (8.8, 10.6)], 16.6, 47.4, lambda i: 'R_roof', 'W_wall')
    box(det, 30, 20, 0, 34, 21, 15, 'W_wall', top='concrete', skip=('bot',)); box(det, 30.9, 21, 12, 33.1, 21.05, 14.2, 'white')
    box(body, 18, 20.5, 0, 46, 23.8, .08, 'asphalt', skip=('bot',))
    return asset(ents, 'svc_station@64x24', [('body', body), ('roof', roof), ('details', det)])
def sts_crane(det, x, y0, y1, h=34, m='orange'):
    for (dx, yy) in [(0, y0), (9, y0), (0, y1), (9, y1)]: box(det, x + dx, yy, 0, x + dx + .8, yy + .8, h, m, skip=('bot',))
    box(det, x, y0, h - 1, x + 9.8, y1 + .8, h, m); box(det, x + 3.8, y0 - 6, h, x + 6, y1 + 30, h + 1.6, m); box(det, x + 3.4, y1 - 2, h + 1.6, x + 6.4, y1 + 2, h + 4.5, 'white')
    beam(det, (x + 4.9, y0 - 6, h + 1.6), (x + 4.9, y1, h + 10), .5, m); beam(det, (x + 4.9, y1 + 30, h + 1.6), (x + 4.9, y1, h + 10), .5, m)
def svc_port(ents):
    W, D = 64.0, 48.0; body = MB(); det = MB()
    pad(body, W, D, 'concrete'); box(body, .2, 40, 0, 63.8, 47.8, .3, 'asphalt', skip=('bot',))
    cols = ['red', 'blue', 'green', 'orange', 'white', 'rust', 'yellow', 'darkmetal']
    for i in range(6):
        for j in range(4):
            for k in range(1 + (i*3 + j) % 3):
                x = 3 + i*6.6; y = 6 + j*3.0; c = cols[(i*5 + j*3 + k) % len(cols)]
                box(det, x, y, k*2.6, x + 6.0, y + 2.4, k*2.6 + 2.55, c)
    sts_crane(det, 44, 34, 44); sts_crane(det, 53, 34, 44)
    flat_body(body, det, 44, 4, 60, 16, 0, 8, {'F': [(2, 6, .05, 5, 'garage', .15), (8, 12, .05, 5, 'garage', .15)], 'R': row(12, 3, 1.6, 5.5, 7), 'B': row(16, 4, 1.6, 5.5, 7), 'L': row(12, 3, 1.6, 5.5, 7)}, wall='W_wall', top='roof_flat', mull=False)
    flat_body(body, det, 2, 22, 12, 30, 0, 9.6, {'F': face_ops(10, 3, 3.2, 1.4, 1.4, .9, n=3, door=1), 'R': face_ops(8, 3, 3.2, 1.4, 1.4, .9, n=2), 'B': face_ops(10, 3, 3.2, 1.4, 1.4, .9, n=3), 'L': face_ops(8, 3, 3.2, 1.4, 1.4, .9, n=2)}, wall='white', top='roof_flat')
    for x in range(1, 63, 4): cyl(det, x + .5, 47.4, .3, .9, .25, 'darkmetal', n=8)
    return asset(ents, 'svc_port@64x48', [('body', body), ('details', det)])
def svc_airport(ents):
    W, D = 320.0, 110.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'grass', h=.03)
    box(body, 10, 70, 0, 310, 100, .08, 'asphalt', skip=('bot',))
    for x in range(16, 306, 12): box(det, x, 84.8, .08, x + 6, 85.2, .1, 'white', skip=('bot',))
    for s in (12, 302):
        for k in range(8): box(det, s, 73 + k*3.2, .08, s + 6, 74.2 + k*3.2, .1, 'white', skip=('bot',))
    box(body, 30, 55, 0, 290, 70, .07, 'asphalt', skip=('bot',)); box(body, 60, 22, 0, 200, 55, .07, 'concrete', skip=('bot',))
    tops = {'F': [(2, 118, .5, 12, 'G_glass', .3)], 'B': [(2, 118, .5, 12, 'G_glass', .3)], 'R': row(18, 3, 4, 2, 11), 'L': row(18, 3, 4, 2, 11)}
    flat_body(body, det, 60, 2, 180, 20, 0, 14, tops, wall='white', top='roof_flat', mull=False)
    fr = frames(60, 2, 180, 20, 0)
    for k in 'FB':
        a = 4.0
        while a < 117: fbox(det, fr[k], a - .06, a + .06, .5, 12, -.29, -.01, 'darkmetal', skip=('back', 'top', 'bot')); a += 3.0
    extrude_x(roof, [(1.0, 14), (21.0, 14), (19.0, 17.0), (3.0, 17.0)], 58, 182, lambda i: 'steel', 'white')
    for x in (80, 110, 140, 170): beam(det, (x, 20, 5), (x, 34, 5), 3.0, 'steel'); box(det, x - 2.5, 32, 0, x + 2.5, 36, 6.5, 'steel', skip=('bot',))
    ring_solid(det, 240, 15, [(0, 3.2), (32, 2.2)], 'white', n=16); ring_solid(det, 240, 15, [(32, 4.2), (36, 5.0), (38.5, 5.0)], 'G_glass', n=16, top='darkmetal')
    box(det, 239.8, 14.8, 38.5, 240.2, 15.2, 44, 'steel', skip=('bot',))
    flat_body(body, det, 212, 30, 262, 52, 0, 16, {'F': [(4, 46, .05, 13, 'garage', .4)], 'B': [], 'R': [], 'L': []}, wall='W_wall', top='concrete', mull=False)
    extrude_x(roof, [(30, 16), (52, 16), (41, 21)], 212, 262, lambda i: 'steel', 'W_wall')
    return asset(ents, 'svc_airport@320x110', [('body', body), ('roof', roof), ('details', det)])
