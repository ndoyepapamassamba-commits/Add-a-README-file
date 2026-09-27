# Immeubles (zone 2) et commerces de proximité (zone 3). Façade avant en y = 0.
def stoop(det, x0, x1, y, h, m='stone'):
    for i, dz in enumerate([h/3, 2*h/3, h]): box(det, x0, y - (3-i)*.3, 0, x1, y, dz, m, skip=('bot',))
def a_walkup(ents):
    W, D, zP, fh, nf = 16.0, 11.0, .6, 3.0, 3; zE = zP + nf*fh; body = MB(); det = MB()
    plinth(body, 0, 0, W, D, h=zP, m='stone')
    fo = face_ops(W, nf, fh, 1.2, 1.65, .85, n=6, door=None); fo = [o for o in fo if not (o[2] < fh and 6.5 < (o[0]+o[1])/2 < 9.5)]
    fo.append((W/2-.8, W/2+.8, .05, 2.6, 'A_door', .25))
    ops = {'F': fo, 'B': face_ops(W, nf, fh, 1.2, 1.5, .9, n=6), 'R': face_ops(D, nf, fh, 1.1, 1.5, .9, n=3), 'L': face_ops(D, nf, fh, 1.1, 1.5, .9, n=3)}
    flat_body(body, det, 0, 0, W, D, zP, zE, ops, top='roof_flat', lint=True)
    cornice(det, 0, 0, W, D, zE - .35, .35, .35, 'trim'); cornice(det, 0, 0, W, D, zP + fh - .1, .12, .06, 'stone')
    parapet(det, -.2, -.2, W + .2, D + .2, zE, h=.7, t=.3, m='W_wall')
    stoop(det, W/2-1.1, W/2+1.1, 0, zP)
    fr0 = frames(0, 0, W, D, 0)['F']; fbox(det, fr0, W/2-1.2, W/2+1.2, zP+2.75, zP+2.95, 0, .8, 'darkmetal')
    for x in (2.5, 7.0, 12.0): chimney(det, x, D*.6, zE, zE + 1.6)
    return asset(ents, 'a_walkup', [('body', body), ('details', det)])
def a_block(ents):
    W, D, zP, fh, nf = 18.0, 12.0, .45, 3.0, 4; zE = zP + nf*fh; body = MB(); det = MB()
    plinth(body, 0, 0, W, D, h=zP)
    fo = face_ops(W, nf, fh, 1.3, 1.5, .9, n=6); fo = [o for o in fo if not (o[2] < fh and 7 < (o[0]+o[1])/2 < 11)]
    fo.append((W/2-.9, W/2+.9, .05, 2.5, 'A_door', .3))
    ops = {'F': fo, 'B': face_ops(W, nf, fh, 1.3, 1.5, .9, n=6), 'R': face_ops(D, nf, fh, 1.2, 1.5, .9, n=4), 'L': face_ops(D, nf, fh, 1.2, 1.5, .9, n=4)}
    flat_body(body, det, 0, 0, W, D, zP, zE, ops, top='roof_flat')
    # oriels en façade avant (étages 1 à 3)
    frF = frames(0, 0, W, D, zP)['F']
    for a0 in (1.2, 12.8):
        box(det, a0, -1.0, zP + fh, a0 + 4.0, 0, zE - .05, 'W_wall2', top='concrete', skip=('B',))
        for f in range(1, nf):
            fbox(det, frF, a0 + .5, a0 + 3.5, f*fh + .9, f*fh + 2.4, 1.0, 1.02, 'G_glass', skip=('back',))
            fbox(det, frF, a0 + .45, a0 + 3.55, f*fh + .84, f*fh + .9, 1.0, 1.1, 'trim', skip=('back',))
    # balcons arrière
    frB = frames(0, 0, W, D, zP)['B']
    for f in range(1, nf):
        for a0 in (2.0, 8.0, 14.0):
            fbox(det, frB, a0 - 1.4, a0 + 1.4, f*fh - .18, f*fh, 0, 1.2, 'concrete'); fbox(det, frB, a0 - 1.4, a0 + 1.4, f*fh, f*fh + 1.0, 1.15, 1.2, 'darkmetal', skip=('back',))
    cornice(det, 0, 0, W, D, zE, .3, .3, 'trim'); parapet(det, -.3, -.3, W + .3, D + .3, zE + .3, h=.6, t=.25, m='W_wall2')
    stoop(det, W/2-1.2, W/2+1.2, 0, zP)
    frame0 = frames(0, 0, W, D, 0)['F']; fbox(det, frame0, W/2-1.4, W/2+1.4, zP+2.6, zP+2.78, 0, 1.2, 'trim')
    box(det, 7, 5, zE, 10, 8, zE + 2.4, 'concrete', top='roof_flat', skip=('bot',)); ac_unit(det, 3, 3, zE); ac_unit(det, 14, 7, zE)
    return asset(ents, 'a_block', [('body', body), ('details', det)])
def a_mid(ents):
    W, D, zG, fh, nf = 20.0, 13.0, 4.2, 3.0, 4; zT = zG + fh*nf; body = MB(); det = MB()
    gF = []
    for i in range(6):
        a0 = .8 + i*3.15; a1 = a0 + 2.45
        if i == 2: gF.append((a0 + .5, a1 - .5, .05, 2.6, 'A_door', .5))
        else: gF.append((a0, a1, .45, 3.4, 'G_glass', .2))
    gS = row(D, 4, 1.6, 1.0, 3.2)
    bands = [(0, zG, 'A_base', {'F': gF, 'B': row(W, 6, 1.8, 1.0, 3.2), 'R': gS, 'L': gS})]
    for f in range(nf):
        b0 = .95; bF = []
        for i in range(8):
            c = 1.25 + i*2.5
            if i in (1, 2, 5, 6): bF.append((c - .7, c + .7, .05, 2.45, 'G_glass'))
            else: bF.append((c - .7, c + .7, b0, b0 + 1.5, 'G_glass'))
        bands.append((zG + f*fh, zG + (f+1)*fh, 'W_wall', {'F': bF, 'B': row(W, 8, 1.4, b0, b0 + 1.5), 'R': row(D, 5, 1.2, b0, b0 + 1.5), 'L': row(D, 5, 1.2, b0, b0 + 1.5)}))
    block(body, 0, 0, W, D, bands, top='roof_flat')
    for (z0, z1, m, ops) in bands:
        fr = frames(0, 0, W, D, z0)
        for k2 in 'FBRL': win_details(det, fr[k2], ops.get(k2, []), mull=(z0 > 0))
    frF = frames(0, 0, W, D, 0)['F']
    for f in range(nf):
        zb = zG + f*fh
        for (c0, c1) in [(2.5, 7.5), (12.5, 17.5)]:
            fbox(det, frF, c0 - .1, c1 + .1, zb - .2, zb, 0, 1.35, 'concrete')
            fbox(det, frF, c0 - .1, c1 + .1, zb, zb + 1.05, 1.3, 1.35, 'G_glass', skip=('back',))
            fbox(det, frF, c0 - .1, c1 + .1, zb + 1.05, zb + 1.1, 1.26, 1.39, 'metal')
    box(det, -.25, -.25, zG - .05, W + .25, D + .25, zG + .25, 'trim')
    box(det, -.3, -.3, zT - .05, W + .3, D + .3, zT + .2, 'trim')
    parapet(det, -.3, -.3, W + .3, D + .3, zT + .2, h=.8, t=.3, m='W_wall2')
    fbox(det, frF, 6.6, 10.3, 3.0, 3.18, 0, 1.6, 'darkmetal')
    for i in (0, 1, 3, 4, 5): fbox(det, frF, .8 + i*3.15 + .2, .8 + i*3.15 + 2.25, 3.55, 4.0, .02, .14, 'E_sign')
    box(det, 8, 6, zT, 12.5, 9.5, zT + 2.8, 'concrete', top='roof_flat', skip=('bot',))
    for (x, y) in [(3, 3), (5, 3), (15, 8.5)]: ac_unit(det, x, y, zT)
    cyl(det, 16.5, 4, zT, zT + 3.2, 1.2, 'metal', n=14)
    return asset(ents, 'a_mid', [('body', body), ('details', det)])
# ---- tours modulaires : socle / étage courant / couronnement ----
def a4_base(ents):
    W, D, h = 18.0, 16.0, 4.5; body = MB(); det = MB()
    ops = {'F': [(1.0, 6.5, .4, 3.6, 'G_glass', .2), (7.4, 10.6, .05, 3.2, 'G_glass', .6), (11.5, 17.0, .4, 3.6, 'G_glass', .2)],
           'B': row(W, 5, 2.2, 1.0, 3.2), 'R': row(D, 4, 2.2, 1.0, 3.2), 'L': row(D, 4, 2.2, 1.0, 3.2)}
    flat_body(body, det, 0, 0, W, D, 0, h, ops, wall='A_base', top='concrete', mull=False)
    fr0 = frames(0, 0, W, D, 0)['F']; fbox(det, fr0, 6.8, 11.2, 3.4, 3.6, 0, 2.2, 'darkmetal')
    for a in (7.0, 11.0): fbox(det, fr0, a - .08, a + .08, 0, 3.4, 2.0, 2.16, 'steel')
    box(det, -.2, -.2, h - .3, W + .2, D + .2, h, 'trim')
    return asset(ents, 'a4_base', [('body', body), ('details', det)])
def a4_mid(ents):
    W, D, fh = 18.0, 16.0, 3.0; body = MB(); det = MB(); fr = frames(0, 0, W, D, 0)
    ops = {'F': row(W, 6, 1.5, .9, 2.4), 'B': row(W, 6, 1.5, .9, 2.4), 'R': row(D, 5, 1.4, .9, 2.4), 'L': row(D, 5, 1.4, .9, 2.4)}
    for k, L in (('F', W), ('R', D), ('B', W), ('L', D)):
        panel(body, fr[k], L, fh, ops[k], 'W_wall'); win_details(det, fr[k], ops[k])
    # balcons d'angle
    for (x0, y0, x1, y1) in [(-1.3, -1.3, 4.0, 0), (W - 4.0, -1.3, W + 1.3, 0), (-1.3, 0, 0, 3.0), (W, 0, W + 1.3, 3.0)]:
        box(det, x0, y0, -.18, x1, y1, 0, 'concrete')
    for (x0, y0, x1, y1) in [(-1.3, -1.3, 4.0, -1.24), (W - 4.0, -1.3, W + 1.3, -1.24), (-1.3, -1.24, -1.24, 3.0), (W + 1.24, -1.24, W + 1.3, 3.0)]:
        box(det, x0, y0, 0, x1, y1, 1.05, 'G_glass', skip=('bot',))
    box(det, -.08, -.08, fh - .12, W + .08, D + .08, fh, 'W_wall2', skip=('top', 'bot'))
    return asset(ents, 'a4_mid', [('body', body), ('details', det)])
def a4_top(ents):
    W, D = 18.0, 16.0; body = MB(); det = MB()
    poly(body, [(0,0,0),(W,0,0),(W,D,0),(0,D,0)], 'roof_flat', n=(0,0,1))
    cornice(det, 0, 0, W, D, 0, .45, .35, 'trim'); parapet(det, -.35, -.35, W + .35, D + .35, .45, h=.8, t=.3, m='W_wall2')
    box(det, 6, 5, 0, 12, 11, 3.2, 'W_wall2', top='roof_flat', skip=('bot',)); box(det, 7, 11, 0, 9.5, 13, 2.4, 'concrete', skip=('bot',))
    cyl(det, 14.5, 12.5, 0, 3.4, 1.3, 'metal', n=14); ac_unit(det, 2, 2, 0); ac_unit(det, 3.6, 2, 0); ac_unit(det, 14, 3, 0)
    for x in (2.5, 4.0): box(det, x, 12, 0, x + .1, 12.1, 4.5, 'metal', skip=('bot',))
    return asset(ents, 'a4_top', [('body', body), ('details', det)])
def a5_base(ents):
    W, D, h = 20.0, 20.0, 6.6; body = MB(); det = MB()
    ops = {k: [(.8, W - .8, .3, h - .6, 'G_glass', .15)] for k in 'FRBL'}
    flat_body(body, det, 0, 0, W, D, 0, h, ops, wall='darkmetal', top='concrete', mull=False)
    fr = frames(0, 0, W, D, 0)
    for k in 'FRBL':
        for i in range(1, 12): a = .8 + i*(W - 1.6)/12; fbox(det, fr[k], a - .05, a + .05, .3, h - .6, -.12, -.02, 'darkmetal', skip=('back',))
        fbox(det, fr[k], .8, W - .8, 3.2, 3.3, -.12, -.02, 'darkmetal', skip=('back',))
    fbox(det, fr['F'], 5, 15, h - .5, h - .2, 0, 3.0, 'W_wall2')
    for a in (5.3, 14.7): cyl(det, a, -2.7, 0, h - .5, .22, 'steel', n=10)
    return asset(ents, 'a5_base', [('body', body), ('details', det)])
def a5_mid(ents):
    W, D, fh = 20.0, 20.0, 3.2; body = MB(); det = MB(); fr = frames(0, 0, W, D, 0)
    for k in 'FRBL':
        panel(body, fr[k], W, fh, [(.4, W - .4, .1, fh - .5, 'G_glass', .1)], 'W_wall')
        for i in range(1, 10): a = .4 + i*(W - .8)/10; fbox(det, fr[k], a - .04, a + .04, .1, fh - .5, -.08, -.01, 'darkmetal', skip=('back', 'top', 'bot'))
    # balcons filants sur deux côtés
    box(det, -1.6, -1.6, -.2, W + 1.6, 0, 0, 'white'); box(det, W, 0, -.2, W + 1.6, D, 0, 'white')
    box(det, -1.6, -1.6, 0, W + 1.6, -1.52, 1.05, 'G_glass', skip=('bot',)); box(det, W + 1.52, -1.52, 0, W + 1.6, D, 1.05, 'G_glass', skip=('bot',))
    box(det, -1.62, -1.62, 1.05, W + 1.62, -1.5, 1.1, 'steel'); box(det, W + 1.5, -1.5, 1.05, W + 1.62, D, 1.1, 'steel')
    return asset(ents, 'a5_mid', [('body', body), ('details', det)])
def a5_top(ents):
    W, D = 20.0, 20.0; body = MB(); det = MB()
    box(body, 2, 2, 0, W - 2, D - 2, 3.4, 'W_wall', top='roof_flat', skip=('bot',))
    poly(body, [(0,0,0),(W,0,0),(W,2,0),(0,2,0)], 'wood', n=(0,0,1)); poly(body, [(0,D-2,0),(W,D-2,0),(W,D,0),(0,D,0)], 'wood', n=(0,0,1))
    poly(body, [(0,2,0),(2,2,0),(2,D-2,0),(0,D-2,0)], 'wood', n=(0,0,1)); poly(body, [(W-2,2,0),(W,2,0),(W,D-2,0),(W-2,D-2,0)], 'wood', n=(0,0,1))
    for (x0, y0, x1, y1) in [(0, 0, W, .08), (0, D - .08, W, D), (0, 0, .08, D), (W - .08, 0, W, D)]: box(det, x0, y0, 0, x1, y1, 1.1, 'G_glass', skip=('bot',))
    box(det, -.2, -.2, 3.4, W + .2, D + .2, 3.9, 'white'); box(det, 7, 7, 3.9, 13, 13, 6.5, 'darkmetal', top='roof_flat')
    box(det, 9.8, 9.8, 6.5, 10.2, 10.2, 14, 'steel', skip=('bot',))
    for (x, y) in [(3, 3), (W - 4, D - 4)]: box(det, x, y, 0, x + 1.4, y + 1.4, .6, 'green', skip=('bot',))
    return asset(ents, 'a5_top', [('body', body), ('details', det)])
# ---- commerces de proximité ----
def c_shop1(ents):
    W, D, h = 9.0, 11.0, 4.6; body = MB(); det = MB()
    ops = {'F': [(.6, 5.8, .45, 3.1, 'G_glass', .25), (6.4, 8.2, .05, 2.8, 'A_door', .25)], 'R': row(D, 2, 1.4, 1.2, 2.6), 'L': [], 'B': [(1.0, 2.1, .05, 2.2, 'A_door', .1)]}
    flat_body(body, det, 0, 0, W, D, 0, h, ops, top='roof_flat', mull=False)
    frF = frames(0, 0, W, D, 0)['F']
    fbox(det, frF, .3, W - .3, 3.35, 4.2, .02, .2, 'E_sign', skip=('back',))
    # store en toile incliné
    for i in range(6):
        a0 = .5 + i*(W - 1.0)/6; a1 = a0 + (W - 1.0)/6 - .02
        poly(det, [fpt(frF, a0, 3.25, 0), fpt(frF, a1, 3.25, 0), fpt(frF, a1, 2.7, 1.4), fpt(frF, a0, 2.7, 1.4)], 'A_accent', n=_add(frF[3], (0,0,1)))
        poly(det, [fpt(frF, a0, 3.19, 0), fpt(frF, a1, 3.19, 0), fpt(frF, a1, 2.64, 1.4), fpt(frF, a0, 2.64, 1.4)], 'A_accent', n=_mul(_add(frF[3], (0,0,1)), -1))
        poly(det, [fpt(frF, a0, 2.4, 1.4), fpt(frF, a1, 2.4, 1.4), fpt(frF, a1, 2.7, 1.4), fpt(frF, a0, 2.7, 1.4)], 'A_accent', n=frF[3])
    parapet(det, 0, 0, W, D, h, h=.6, t=.2, m='W_wall2'); ac_unit(det, 3, 6, h); ac_unit(det, 5.5, 7, h)
    box(det, .2, -2.2, 0, W - .2, 0, .08, 'paving', skip=('bot',))
    for x in (1.0, 8.0): cyl(det, x, -1.8, .08, .9, .25, 'darkmetal', n=8)
    return asset(ents, 'c_shop1', [('body', body), ('details', det)])
def c_shop2(ents):
    W, D, zG, fh = 9.5, 12.0, 4.0, 3.0; zE = zG + fh; body = MB(); det = MB()
    ops0 = {'F': [(.5, 6.2, .5, 3.2, 'G_glass', .25), (6.9, 8.8, .05, 2.8, 'A_door', .25)], 'R': row(D, 3, 1.3, 1.2, 2.8), 'L': [], 'B': [(1, 2.1, .05, 2.2, 'A_door', .1)]}
    ops1 = {'F': face_ops(W, 1, fh, 1.3, 1.6, .8, n=3), 'R': face_ops(D, 1, fh, 1.2, 1.5, .9, n=3), 'L': face_ops(D, 1, fh, 1.2, 1.5, .9, n=2), 'B': face_ops(W, 1, fh, 1.2, 1.5, .9, n=3)}
    block(body, 0, 0, W, D, [(0, zG, 'A_base', ops0), (zG, zE, 'W_wall', ops1)], top='roof_flat')
    for k in 'FRBL':
        win_details(det, frames(0, 0, W, D, 0)[k], ops0[k], mull=False); win_details(det, frames(0, 0, W, D, zG)[k], ops1[k]); lintels(det, frames(0, 0, W, D, zG)[k], ops1[k])
    frF = frames(0, 0, W, D, 0)['F']; fbox(det, frF, .3, W - .3, 3.35, 3.9, .02, .16, 'E_sign', skip=('back',))
    fbox(det, frF, .4, 6.3, 3.2, 3.3, 0, 1.3, 'A_accent'); cornice(det, 0, 0, W, D, zE - .1, .3, .3, 'trim')
    hip_roof(det, 0, 0, W, D, zE + .2, 22, ov=.35, t=.15)
    return asset(ents, 'c_shop2', [('body', body), ('details', det)])
def c_shop3(ents):
    W, D, zG, fh, nf = 15.0, 12.5, 4.4, 3.2, 2; zE = zG + nf*fh; body = MB(); det = MB()
    ops0 = {'F': [(.5, 4.5, .5, 3.6, 'G_glass', .25), (5.2, 9.8, .5, 3.6, 'G_glass', .25), (10.5, 12.6, .05, 3.0, 'A_door', .3), (13.0, 14.5, .5, 3.6, 'G_glass', .25)],
            'R': [(.6, 4.8, .5, 3.6, 'G_glass', .25), (5.4, 9.6, .5, 3.6, 'G_glass', .25)], 'L': [], 'B': [(1, 2.2, .05, 2.3, 'A_door', .1)]}
    up = {'F': face_ops(W, nf, fh, 1.6, 1.8, .7, n=5), 'R': face_ops(D, nf, fh, 1.6, 1.8, .7, n=4), 'B': face_ops(W, nf, fh, 1.4, 1.6, .8, n=5), 'L': face_ops(D, nf, fh, 1.4, 1.6, .8, n=3)}
    block(body, 0, 0, W, D, [(0, zG, 'A_base', ops0), (zG, zE, 'W_wall', up)], top='roof_flat')
    for k in 'FRBL':
        win_details(det, frames(0, 0, W, D, 0)[k], ops0[k], mull=False); win_details(det, frames(0, 0, W, D, zG)[k], up[k])
    fr = frames(0, 0, W, D, 0)
    fbox(det, fr['F'], .3, W - .3, 3.75, 4.3, .02, .18, 'E_sign', skip=('back',)); fbox(det, fr['R'], .3, D - 2.5, 3.75, 4.3, .02, .18, 'E_sign', skip=('back',))
    box(det, -.2, -.2, zG - .1, W + .2, D + .2, zG + .1, 'trim'); cornice(det, 0, 0, W, D, zE, .35, .3, 'trim'); parapet(det, -.3, -.3, W + .3, D + .3, zE + .35, h=.7, t=.25, m='W_wall2')
    box(det, 5, 4, zE + .35, 5.2, 4.2, zE + 4.2, 'metal'); box(det, 9, 4, zE + .35, 9.2, 4.2, zE + 4.2, 'metal'); box(det, 4.6, 3.95, zE + 2.2, 9.6, 4.15, zE + 4.0, 'E_sign')
    ac_unit(det, 11, 8, zE + .35); ac_unit(det, 2, 8, zE + .35)
    return asset(ents, 'c_shop3', [('body', body), ('details', det)])
def c_gas(ents):
    body = MB(); det = MB()
    box(body, 0, 0, 0, 16, 16, .08, 'asphalt', skip=('bot',))
    # kiosque
    kx0, ky0, kx1, ky1, kh = 3, 10, 13, 15.2, 3.8
    ops = {'F': [(.6, 6.5, .4, 2.8, 'G_glass', .2), (7.2, 9.0, .05, 2.6, 'A_door', .2)], 'R': [], 'L': [], 'B': []}
    flat_body(body, det, kx0, ky0, kx1, ky1, .08, kh, ops, wall='white', top='roof_flat', mull=False)
    fbox(det, frames(kx0, ky0, kx1, ky1, 0)['F'], 0, kx1 - kx0, 3.0, kh, 0, .2, 'A_accent', skip=('back',))
    # auvent sur quatre poteaux
    box(det, 1.5, 1.5, 4.6, 14.5, 8.5, 5.4, 'white', top='roof_flat'); box(det, 1.48, 1.48, 4.8, 14.52, 8.52, 5.2, 'A_accent', skip=('top', 'bot'))
    for (x, y) in [(3.5, 5), (12.5, 5)]:
        box(det, x - .2, y - .2, .08, x + .2, y + .2, 4.6, 'steel', skip=('bot',))
    for (x, y) in [(5.5, 5), (10.5, 5)]:
        box(det, x - 1.6, y - .5, .08, x + 1.6, y + .5, .3, 'concrete', skip=('bot',))
        for dx in (-.8, .8): box(det, x + dx - .3, y - .25, .3, x + dx + .3, y + .25, 1.8, 'white', top='A_accent', skip=('bot',))
    box(det, .5, .5, .08, 1.1, 1.1, 6.5, 'steel', skip=('bot',)); box(det, .1, .3, 5.0, 1.5, 1.3, 7.2, 'A_accent'); box(det, .15, .28, 5.3, 1.45, .3, 6.9, 'E_sign')
    return asset(ents, 'c_gas', [('body', body), ('details', det)])
