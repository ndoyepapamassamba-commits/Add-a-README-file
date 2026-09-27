# Services publics (1) : énergie, eau, déchets, santé, sécurité. Emprise [0, W] x [0, D], façade (route) en y = 0.
def svc_coal(ents):
    W, D = 48.0, 40.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'gravel')
    fr = frames(4, 10, 28, 30, 0)
    ops = {k: row(24 if k in 'FB' else 20, 6 if k in 'FB' else 5, 2.0, 9.0, 13.0) for k in 'FRBL'}
    flat_body(body, det, 4, 10, 28, 30, 0, 16, ops, wall='W_wall', top='concrete', mull=False)
    for k, L in (('F', 24), ('B', 24), ('R', 20), ('L', 20)):
        a = 4
        while a < L - 1: fbox(det, fr[k], a - .2, a + .2, 0, 16, 0, .25, 'W_wall2', skip=('back', 'bot')); a += 4
    low = 16
    box(body, 28, 15, 0, 38, 31, 26, 'W_wall2', top='concrete', skip=('bot',))
    for z in (5, 11, 17, 23): box(det, 27.9, 15.4, z, 38.1, 30.6, z + 1.2, 'G_glass', skip=('bot', 'top'))
    for x in (8, 15):
        ring_solid(det, x, 36, [(0, 2.4), (58, 1.4), (60, 1.5)], 'concrete', n=14, top='darkmetal'); ring_solid(det, x, 36, [(52, 1.62), (55, 1.58)], 'red', n=14)
    hyper(det, 41, 7.6, 6.4, 4.2, 5.0, 26, 'concrete')
    ring_solid(det, 10, 3.5, [(0, 5.5), (5, .3)], 'blackglass', n=14)
    beam(det, (13, 4.5, 1.0), (28, 15.5, 18), 1.2, 'metal')
    for x in (30, 34): box(det, x, 33, 0, x + 3, 37, 4, 'metal', top='darkmetal', skip=('bot',))
    return asset(ents, 'svc_coal', [('body', body), ('roof', roof), ('details', det)])
def svc_solar(ents):
    W, D = 40.0, 40.0; body = MB(); det = MB()
    pad(body, W, D, 'gravel')
    for j in range(6):
        for i in range(3):
            x0 = 2 + i*12.5; y0 = 6 + j*5.6
            tilted(det, x0, y0, 11.5, 3.2, .9, 28)
            for x in (x0 + .5, x0 + 11.0): box(det, x, y0 + 1.2, 0, x + .12, y0 + 1.32, 1.9, 'steel', skip=('bot',))
    flat_body(body, det, 30, 1, 38, 5, 0, 3.4, {'F': face_ops(8, 1, 3.4, 1.2, 1.2, 1.0, n=3, door=1)}, wall='white', top='roof_flat')
    box(det, 2, 1.5, 0, 8, 4.5, 2.6, 'metal', top='darkmetal', skip=('bot',))
    return asset(ents, 'svc_solar', [('body', body), ('details', det)])
def svc_pump(ents):
    W, D = 16.0, 24.0; body = MB(); det = MB()
    pad(body, W, D, 'concrete')
    ops = {'F': face_ops(10, 1, 6, 1.6, 2.4, 2.0, n=3, door=1, dw=2.2, dh=3.2), 'R': row(12, 3, 1.6, 2.0, 4.4), 'L': row(12, 3, 1.6, 2.0, 4.4), 'B': []}
    flat_body(body, det, 3, 2, 13, 14, 0, 6, ops, wall='W_wall', top='roof_flat', lint=True)
    cornice(det, 3, 2, 13, 14, 6, .3, .2, 'trim')
    for x in (5.5, 10.5):
        beam(det, (x, 14, 1.2), (x, 23.8, 1.2), 1.1, 'blue'); box(det, x - .9, 21.5, 0, x + .9, 23.9, 2.6, 'concrete', skip=('bot',))
    box(det, 2, 20, 0, 14, 23.9, .9, 'concrete', skip=('bot',))
    return asset(ents, 'svc_pump', [('body', body), ('details', det)])
def svc_wtower(ents):
    W, D = 16.0, 16.0; body = MB(); det = MB()
    pad(body, W, D, 'grass')
    ring_solid(det, 8, 8, [(0, 1.8), (17, 1.3), (20, 5.2), (24, 5.4), (25.2, 3.0), (25.8, .6)], 'concrete', n=20, top='concrete')
    ring_solid(det, 8, 8, [(21.2, 5.33), (22.4, 5.38)], 'blue', n=20)
    flat_body(body, det, 6, 4.2, 10, 6.8, 0, 2.6, {'F': [(1.4, 2.6, .05, 2.2, 'A_door', .1)]}, wall='concrete', top='roof_flat')
    return asset(ents, 'svc_wtower', [('body', body), ('details', det)])
def svc_sewage(ents):
    W, D = 16.0, 16.0; body = MB(); det = MB()
    pad(body, W, D, 'concrete')
    flat_body(body, det, 2, 2, 9, 7, 0, 3.4, {'F': face_ops(7, 1, 3.4, 1.2, 1.1, 1.4, n=2, door=0)}, wall='W_wall', top='roof_flat')
    beam(det, (11, 3, 1.0), (11, 15.9, .4), 1.6, 'rust')
    box(det, 9.5, 13.5, 0, 12.5, 15.9, 1.6, 'concrete', skip=('bot',)); box(det, 10, 8, .06, 12, 12, .12, 'darkmetal', skip=('bot',))
    return asset(ents, 'svc_sewage', [('body', body), ('details', det)])
def svc_treat(ents):
    W, D = 40.0, 32.0; body = MB(); det = MB()
    pad(body, W, D, 'concrete')
    for (x, y) in [(8, 20), (20, 20), (32, 20)]:
        ring_solid(det, x, y, [(0, 5.2), (1.6, 5.2)], 'concrete', n=24, top=None); ring_solid(det, x, y, [(1.3, 4.9)], 'concrete', n=24)
        cyl(det, x, y, .06, 1.35, 4.9, 'water', n=24); box(det, x - 4.8, y - .15, 1.35, x + 4.8, y + .15, 1.9, 'steel')
    for x in (4, 22): box(det, x, 4, 0, x + 14, 10, 1.5, 'concrete', top='water', skip=('bot',))
    flat_body(body, det, 2, 11.5, 10, 14.5, 0, 3.6, {'F': face_ops(8, 1, 3.6, 1.4, 1.3, 1.2, n=3, door=1)}, wall='W_wall', top='roof_flat')
    beam(det, (13, 20, 1.2), (15, 20, 1.2), .6, 'metal'); beam(det, (25, 20, 1.2), (27, 20, 1.2), .6, 'metal')
    return asset(ents, 'svc_treat', [('body', body), ('details', det)])
def svc_landfill(ents):
    W, D = 48.0, 48.0; body = MB(); det = MB()
    pad(body, W, D, 'sand', h=.05)
    for i in range(24):
        a = i/24
        for (x, y) in [(1 + a*46, 1), (1 + a*46, 47), (1, 1 + a*46), (47, 1 + a*46)]: box(det, x, y, 0, x + .12, y + .12, 2.2, 'metal', skip=('bot',))
    for (x0, y0, x1, y1) in [(1, 1, 47, 1.05), (1, 46.95, 47, 47), (1, 1, 1.05, 47), (46.95, 1, 47, 47)]: box(det, x0, y0, 1.0, x1, y1, 2.1, 'rust', skip=('bot',))
    flat_body(body, det, 36, 3, 44, 7, 0, 3.0, {'F': face_ops(8, 1, 3.0, 1.2, 1.0, 1.0, n=3, door=1)}, wall='white', top='roof_flat')
    box(det, 26, 2, 0, 33, 5, .3, 'darkmetal', skip=('bot',))
    return asset(ents, 'svc_landfill', [('body', body), ('details', det)])
def svc_inciner(ents):
    W, D = 40.0, 32.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'concrete')
    ops = {'F': [(2, 6, .05, 5, 'garage', .15), (8, 12, .05, 5, 'garage', .15)] + row(24, 6, 2.2, 8, 12), 'B': row(24, 6, 2.2, 8, 12), 'R': row(18, 4, 2.2, 8, 12), 'L': row(18, 4, 2.2, 8, 12)}
    flat_body(body, det, 4, 4, 28, 22, 0, 14, ops, wall='W_wall', top='concrete', mull=False)
    fr = frames(4, 4, 28, 22, 0)
    for k, L in (('F', 24), ('B', 24), ('R', 18), ('L', 18)):
        a = 3
        while a < L - 1: fbox(det, fr[k], a - .15, a + .15, 0, 14, 0, .2, 'W_wall2', skip=('back', 'bot')); a += 3
    gable_roof(roof, 4, 4, 28, 22, 14, 10, ov=.4, gov=.3, t=.2, edge='metal')
    ring_solid(det, 33, 26, [(0, 2.2), (44, 1.2), (46, 1.3)], 'concrete', n=14, top='darkmetal'); ring_solid(det, 33, 26, [(38, 1.36), (40, 1.33)], 'red', n=14)
    box(det, 28, 8, 0, 36, 16, 8, 'W_wall2', top='roof_flat', skip=('bot',)); beam(det, (32, 16, 6), (33, 24.5, 8), 1.0, 'metal')
    return asset(ents, 'svc_inciner', [('body', body), ('roof', roof), ('details', det)])
def svc_recycle(ents):
    W, D = 40.0, 32.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'concrete')
    ops = {'F': [(2, 6, .05, 5, 'garage', .15), (8, 12, .05, 5, 'garage', .15), (14, 18, .05, 5, 'garage', .15)] + row(26, 6, 2.0, 6.8, 8.6), 'B': row(26, 6, 2.0, 6.8, 8.6), 'R': row(16, 4, 2.0, 6.8, 8.6), 'L': row(16, 4, 2.0, 6.8, 8.6)}
    flat_body(body, det, 3, 3, 29, 19, 0, 10, ops, wall='A_accent', top='concrete', mull=False)
    gable_roof(roof, 3, 3, 29, 19, 10, 12, ov=.4, gov=.3, edge='metal')
    for i, c in enumerate(['blue', 'green', 'yellow', 'red', 'white', 'rust']):
        x = 3 + (i % 3)*4.2; y = 23 + (i//3)*4.2
        for z in range(3): box(det, x, y, z*1.3, x + 3.6, y + 3.6, z*1.3 + 1.25, c)
    for i, c in enumerate(['green', 'blue', 'yellow']): box(det, 20 + i*6, 23, 0, 25 + i*6, 28.5, 2.4, c, top='darkmetal', skip=('bot',))
    return asset(ents, 'svc_recycle', [('body', body), ('roof', roof), ('details', det)])
def svc_clinic(ents):
    W, D = 24.0, 24.0; body = MB(); det = MB()
    pad(body, W, D, 'grass', h=.04); box(body, 2, .5, 0, 22, 7, .07, 'asphalt', skip=('bot',))
    ops = {'F': face_ops(16, 2, 3.6, 1.8, 1.6, 1.0, n=5, door=2, dw=2.4, dh=2.8), 'B': face_ops(16, 2, 3.6, 1.8, 1.6, 1.0, n=5), 'R': face_ops(12, 2, 3.6, 1.8, 1.6, 1.0, n=4), 'L': face_ops(12, 2, 3.6, 1.8, 1.6, 1.0, n=4)}
    flat_body(body, det, 4, 8, 20, 20, 0, 7.2, ops, wall='white', top='roof_flat')
    parapet(det, 4, 8, 20, 20, 7.2, h=.6, t=.2, m='white')
    fr = frames(4, 8, 20, 20, 0)['F']; fbox(det, fr, 5.8, 10.2, 3.0, 3.25, 0, 2.6, 'white'); red_cross(det, fr, 8, 6.1, 1.4)
    for x in range(3, 21, 3): box(det, x, 1, .07, x + .1, 5.5, .09, 'white', skip=('bot',))
    return asset(ents, 'svc_clinic', [('body', body), ('details', det)])
def svc_hospital(ents):
    W, D = 48.0, 40.0; body = MB(); det = MB()
    pad(body, W, D, 'paving')
    ops = {'F': face_ops(30, 5, 3.6, 1.8, 1.7, .9, n=10, door=4, dw=3.0, dh=3.0), 'B': face_ops(30, 5, 3.6, 1.8, 1.7, .9, n=10), 'R': face_ops(16, 5, 3.6, 1.8, 1.7, .9, n=5), 'L': face_ops(16, 5, 3.6, 1.8, 1.7, .9, n=5)}
    flat_body(body, det, 4, 8, 34, 24, 0, 18, ops, wall='white', top='roof_flat')
    wops = {'F': face_ops(10, 3, 3.6, 1.8, 1.7, .9, n=3), 'R': face_ops(22, 3, 3.6, 1.8, 1.7, .9, n=6), 'B': face_ops(10, 3, 3.6, 1.8, 1.7, .9, n=3), 'L': []}
    flat_body(body, det, 34, 10, 44, 32, 0, 10.8, wops, wall='W_wall', top='roof_flat')
    for z in (3.6, 7.2, 10.8, 14.4): box(det, 3.8, 7.8, z - .1, 34.2, 24.2, z + .15, 'W_wall2', skip=('top', 'bot'))
    parapet(det, 4, 8, 34, 24, 18, h=.9, t=.3, m='white')
    cyl(det, 19, 16, 18, 18.3, 5.5, 'darkmetal', n=24); box(det, 17.2, 15.6, 18.3, 20.8, 16.4, 18.35, 'white'); box(det, 17.2, 14, 18.3, 17.9, 18, 18.35, 'white'); box(det, 20.1, 14, 18.3, 20.8, 18, 18.35, 'white')
    fr = frames(4, 8, 34, 24, 0)['F']; fbox(det, fr, 10, 20, 3.4, 3.7, 0, 5.0, 'white'); red_cross(det, fr, 15, 12.5, 3.2, .3)
    fbox(det, frames(34, 10, 44, 32, 0)['F'], 1, 9, 3.4, 3.7, 0, 5.0, 'red')
    box(det, 5, .5, 0, 30, 6.5, .08, 'asphalt', skip=('bot',))
    return asset(ents, 'svc_hospital', [('body', body), ('details', det)])
def svc_cemetery(ents):
    W, D = 40.0, 40.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'grass', h=.04)
    for (x0, y0, x1, y1) in [(.4, .4, 17, .9), (23, .4, 39.6, .9), (.4, 39.1, 39.6, 39.6), (.4, .4, .9, 39.6), (39.1, .4, 39.6, 39.6)]: box(det, x0, y0, 0, x1, y1, 1.4, 'stone', top='concrete', skip=('bot',))
    for x in (17, 22.5): box(det, x, .2, 0, x + .6, 1.1, 2.4, 'stone', top='concrete', skip=('bot',))
    box(body, 18.5, .9, 0, 21.5, 39, .07, 'paving', skip=('bot',)); box(body, .9, 19, 0, 39, 21, .07, 'paving', skip=('bot',))
    flat_body(body, det, 16, 29, 24, 37, 0, 5.5, {'F': [(3, 5, .05, 3.2, 'A_door', .15)], 'R': row(8, 2, .8, 2.0, 4.2), 'L': row(8, 2, .8, 2.0, 4.2)}, wall='stone', top='concrete')
    gable_roof(roof, 16, 29, 24, 37, 5.5, 45, ov=.3, gov=.3, axis='y', edge='stone')
    for (y, n) in ((29, (0,-1,0)), (37, (0,1,0))): poly(body, [(16, y, 5.5), (24, y, 5.5), (20, y, 5.5 + 4*math.tan(math.radians(45)) - .02)], 'stone', n=n)
    box(det, 19.2, 26.6, 0, 20.8, 28.4, 12, 'stone', skip=('bot',)); ring_solid(det, 20, 27.5, [(12, 1.1), (15, .05)], 'R_roof', n=4)
    return asset(ents, 'svc_cemetery', [('body', body), ('roof', roof), ('details', det)])
def svc_cremat(ents):
    W, D = 32.0, 24.0; body = MB(); det = MB(); roof = MB()
    pad(body, W, D, 'grass', h=.04); box(body, 12, .3, 0, 20, 8, .07, 'paving', skip=('bot',))
    ops = {'F': [(8, 12, .05, 3.6, 'A_door', .3)] + [(1.5, 3.5, 1, 5, 'G_glass'), (16.5, 18.5, 1, 5, 'G_glass')], 'R': row(12, 4, 1.2, 1.2, 5), 'L': row(12, 4, 1.2, 1.2, 5), 'B': []}
    flat_body(body, det, 6, 8, 26, 20, 0, 7, ops, wall='stone', top='concrete')
    hip_roof(roof, 6, 8, 26, 20, 7, 30, ov=.5)
    fbox(det, frames(6, 8, 26, 20, 0)['F'], 7, 13, 4.0, 4.3, 0, 3.0, 'stone')
    for a in (7.4, 12.6): fbox(det, frames(6, 8, 26, 20, 0)['F'], a - .2, a + .2, 0, 4.0, 2.6, 3.0, 'stone')
    box(det, 23, 16, 0, 24.2, 17.2, 16, 'brick', top='darkmetal', skip=('bot',))
    return asset(ents, 'svc_cremat', [('body', body), ('roof', roof), ('details', det)])
def svc_fire(ents):
    W, D = 24.0, 24.0; body = MB(); det = MB()
    pad(body, W, D, 'concrete'); box(body, 2, .3, 0, 17, 9, .09, 'asphalt', skip=('bot',))
    ops = {'F': [(1.0 + i*5.0, 5.0 + i*5.0, .05, 4.6, 'garage', .2) for i in range(3)], 'R': face_ops(12, 2, 3.8, 1.4, 1.5, 1.0, n=4), 'L': face_ops(12, 2, 3.8, 1.4, 1.5, 1.0, n=4), 'B': face_ops(16, 2, 3.8, 1.4, 1.5, 1.0, n=5)}
    flat_body(body, det, 1.5, 9, 17.5, 21, 0, 7.6, ops, wall='brick', top='roof_flat', lint=True)
    parapet(det, 1.5, 9, 17.5, 21, 7.6, h=.6, t=.25, m='brick')
    fbox(det, frames(1.5, 9, 17.5, 21, 0)['F'], 0, 16, 5.0, 6.0, 0, .2, 'red', skip=('back',)); fbox(det, frames(1.5, 9, 17.5, 21, 0)['F'], 4, 12, 5.15, 5.85, .2, .25, 'E_sign', skip=('back',))
    tops = {'F': row(4, 1, .8, 2, 13), 'R': row(4, 1, .8, 2, 13), 'B': [], 'L': []}
    flat_body(body, det, 18.5, 14, 22.5, 18, 0, 17, tops, wall='brick', top='roof_flat', mull=False)
    parapet(det, 18.5, 14, 22.5, 18, 17, h=.5, t=.2, m='red')
    return asset(ents, 'svc_fire', [('body', body), ('details', det)])
def svc_police(ents):
    W, D = 24.0, 24.0; body = MB(); det = MB()
    pad(body, W, D, 'paving'); box(body, 1, .3, 0, 23, 7, .08, 'asphalt', skip=('bot',))
    ops = {'F': face_ops(18, 2, 3.8, 1.6, 1.6, 1.0, n=6, door=2, dw=2.2, dh=2.8), 'B': face_ops(18, 2, 3.8, 1.6, 1.6, 1.0, n=6), 'R': face_ops(12, 2, 3.8, 1.6, 1.6, 1.0, n=4), 'L': face_ops(12, 2, 3.8, 1.6, 1.6, 1.0, n=4)}
    flat_body(body, det, 3, 8, 21, 20, 0, 7.6, ops, wall='W_wall', top='roof_flat')
    fr = frames(3, 8, 21, 20, 0)['F']
    fbox(det, fr, 0, 18, 7.0, 7.6, 0, .25, 'blue', skip=('back',)); fbox(det, fr, 5.5, 12.5, 7.05, 7.55, .25, .3, 'E_sign', skip=('back',))
    fbox(det, fr, 5.2, 9.2, 2.9, 3.1, 0, 2.2, 'blue'); parapet(det, 3, 8, 21, 20, 7.6, h=.5, t=.2, m='W_wall2')
    box(det, 22, 3, 0, 22.15, 3.15, 10, 'steel', skip=('bot',)); box(det, 22.15, 3.05, 8.4, 23.6, 3.1, 9.6, 'blue')
    for x in range(2, 22, 3): box(det, x, 1, .08, x + .1, 5.5, .1, 'white', skip=('bot',))
    return asset(ents, 'svc_police', [('body', body), ('details', det)])
