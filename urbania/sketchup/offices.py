# Grands commerces (zone 4) et bureaux (zone 6). Façade avant en y = 0.
def curtain(body, det, fr, W, H, fm='G_glass', step=1.5, sill=.1, head=.5, rec=.1, fin=0.0, wall='W_wall', mm='darkmetal', hbar=None):
    # mur-rideau : grande baie + meneaux verticaux (et ailettes extérieures si fin > 0)
    panel(body, fr, W, H, [(.3, W - .3, sill, H - head, fm, rec)], wall)
    n = max(1, int(round((W - .6)/step)))
    for i in range(1, n):
        a = .3 + i*(W - .6)/n
        fbox(det, fr, a - .035, a + .035, sill, H - head, -rec + .01, -.01, mm, skip=('back', 'top', 'bot'))
        if fin > 0: fbox(det, fr, a - .06, a + .06, 0, H, 0, fin, mm, skip=('back', 'top', 'bot'))
    if hbar: fbox(det, fr, .3, W - .3, hbar - .03, hbar + .03, -rec + .01, -.01, mm, skip=('back',))
def c_market(ents):
    W, D, h, py = 28.0, 16.0, 7.5, 10.0; body = MB(); det = MB()
    y0 = py
    ops = {'F': [(9.0, 19.0, .05, 4.2, 'G_glass', .6)], 'B': [(3, 6.5, .05, 4.2, 'garage', .15), (8, 11.5, .05, 4.2, 'garage', .15), (13, 16.5, .05, 4.2, 'garage', .15)],
           'R': row(D, 4, 2.5, 4.8, 6.0), 'L': row(D, 4, 2.5, 4.8, 6.0)}
    flat_body(body, det, 0, y0, W, y0 + D, 0, h, ops, wall='W_wall', top='roof_flat', mull=False)
    fr = frames(0, y0, W, y0 + D, 0)
    for a in (11.0, 13.3, 15.6, 17.0): fbox(det, fr['F'], a - .04, a + .04, .05, 4.2, -.58, -.5, 'darkmetal')
    fbox(det, fr['F'], 7.5, 20.5, 4.4, 4.65, 0, 3.2, 'white'); fbox(det, fr['F'], 7.4, 20.6, 4.35, 4.7, 3.1, 3.3, 'A_accent')
    for a in (8.0, 20.0): fbox(det, fr['F'], a - .12, a + .12, 0, 4.4, 2.9, 3.14, 'steel')
    fbox(det, fr['F'], 9.5, 18.5, 5.0, 6.9, .02, .35, 'E_sign', skip=('back',)); fbox(det, fr['F'], 0, W, 6.9, 7.5, 0, .12, 'A_accent', skip=('back',))
    parapet(det, 0, y0, W, y0 + D, h, h=.7, t=.2, m='W_wall2')
    for (x, y) in [(4, 3), (7, 3), (20, 4), (23, 10)]: ac_unit(det, x, y0 + y, h)
    for x in (10.5, 14.5): box(det, x, y0 + 5, h, x + 2.5, y0 + 11, h + .6, 'glassroof', skip=('bot',))
    fbox(det, fr['B'], 2.5, 17, 4.4, 4.6, 0, 2.0, 'darkmetal')
    box(body, -.5, 0, 0, W + .5, y0, .05, 'asphalt', skip=('bot',))
    for i in range(12):
        x = 1.2 + i*2.4
        box(det, x, 1.0, .05, x + .12, 5.6, .07, 'white', skip=('bot',))
    box(det, .5, 7.6, .05, W - .5, 7.72, .07, 'white', skip=('bot',))
    box(det, 22.5, 6.4, 0, 26.5, 9.0, 2.4, 'steel', top='roof_flat', skip=('bot',))
    return asset(ents, 'c_market', [('body', body), ('details', det)])
def c_mall(ents):
    W, D, h = 30.0, 24.0, 10.5; body = MB(); det = MB()
    ops = {'F': [(1.0, 9.5, 5.6, 9.2, 'G_glass', .2), (11.5, 18.5, .05, 8.8, 'G_glass', .9), (20.5, 29.0, 5.6, 9.2, 'G_glass', .2), (2, 8.5, .6, 3.8, 'G_glass', .2), (21.5, 28, .6, 3.8, 'G_glass', .2)],
           'R': [(2, 10, .6, 3.8, 'G_glass', .2), (13, 21, .6, 3.8, 'G_glass', .2), (2, 21, 5.6, 9.2, 'G_glass', .2)], 'L': [(2, 10, .6, 3.8, 'G_glass', .2), (13, 21, .6, 3.8, 'G_glass', .2)],
           'B': [(4, 8, .05, 4.2, 'garage', .15), (22, 26, .05, 4.2, 'garage', .15)]}
    flat_body(body, det, 0, 0, W, D, 0, h, ops, wall='W_wall', top='roof_flat', mull=False)
    fr = frames(0, 0, W, D, 0)
    for k in 'FR':
        for (a0, a1, b0, b1, fm, *r) in ops[k]:
            if fm != 'G_glass': continue
            a = a0 + 1.5
            while a < a1 - .3: fbox(det, fr[k], a - .04, a + .04, b0, b1, -r[0] + .01, -.01, 'darkmetal', skip=('back', 'top', 'bot')); a += 1.5
    fbox(det, fr['F'], 0, W, 4.6, 5.0, 0, .9, 'trim'); fbox(det, fr['R'], 0, D, 4.6, 5.0, 0, .9, 'trim')
    fbox(det, fr['F'], 10.8, 19.2, 9.0, 11.8, -.1, 1.2, 'A_accent'); fbox(det, fr['F'], 11.3, 18.7, 9.5, 11.3, 1.2, 1.3, 'E_sign', skip=('back',))
    for a in (11.2, 18.8): cyl(det, a, -1.0, 0, 9.0, .3, 'steel', n=10)
    fbox(det, fr['F'], 1.5, 9.0, 3.9, 4.5, .02, .2, 'E_sign', skip=('back',)); fbox(det, fr['F'], 21.0, 28.5, 3.9, 4.5, .02, .2, 'E_sign', skip=('back',))
    # atrium vitré pyramidal
    cx, cy, a2 = W/2, D/2 + 1, 5.0
    box(det, cx - a2 - .4, cy - a2 - .4, h, cx + a2 + .4, cy + a2 + .4, h + .5, 'concrete', skip=('bot',))
    P = [(cx - a2, cy - a2, h + .5), (cx + a2, cy - a2, h + .5), (cx + a2, cy + a2, h + .5), (cx - a2, cy + a2, h + .5)]; A = (cx, cy, h + 5.0)
    for i, n in enumerate([(0,-1,1),(1,0,1),(0,1,1),(-1,0,1)]): poly(det, [P[i], P[(i+1)%4], A], 'G_glass', n=n)
    parapet(det, 0, 0, W, D, h, h=.8, t=.25, m='W_wall2')
    for (x, y) in [(3, 18), (6, 18), (25, 3), (25, 18)]: ac_unit(det, x, y, h)
    return asset(ents, 'c_mall', [('body', body), ('details', det)])
def ht_base(ents):
    W, D, h = 28.0, 22.0, 8.4; body = MB(); det = MB()
    ops = {'F': [(1, 8, .4, 3.8, 'G_glass', .2), (10.5, 17.5, .05, 3.8, 'G_glass', .5), (20, 27, .4, 3.8, 'G_glass', .2)] + row(W, 8, 2.2, 4.8, 7.6),
           'B': row(W, 8, 2.0, 1.0, 3.2) + row(W, 8, 2.0, 4.8, 7.6), 'R': row(D, 6, 2.0, .8, 3.6) + row(D, 6, 2.0, 4.8, 7.6), 'L': row(D, 6, 2.0, .8, 3.6) + row(D, 6, 2.0, 4.8, 7.6)}
    flat_body(body, det, 0, 0, W, D, 0, h, ops, wall='A_base', top='roof_flat', mull=False)
    fr = frames(0, 0, W, D, 0)
    fbox(det, fr['F'], 0, W, 4.1, 4.5, 0, .5, 'trim')
    fbox(det, fr['F'], 9.0, 19.0, 4.0, 4.5, 0, 5.5, 'white'); fbox(det, fr['F'], 8.9, 19.1, 4.5, 4.9, 5.2, 5.6, 'A_accent')
    for a in (9.5, 18.5): cyl(det, a, -5.1, 0, 4.0, .25, 'steel', n=10)
    parapet(det, 0, 0, W, D, h, h=1.0, t=.3, m='A_base')
    box(det, 2, 16, h, 7, 20.5, h + .1, 'pool', skip=('bot',)); box(det, 1.6, 15.6, h, 7.4, 16, h + .35, 'white'); box(det, 1.6, 20.5, h, 7.4, 20.9, h + .35, 'white')
    return asset(ents, 'ht_base', [('body', body), ('details', det)])
def ht_mid(ents):
    W, D, fh = 18.0, 14.0, 3.2; body = MB(); det = MB(); fr = frames(0, 0, W, D, 0)
    ops = {'F': row(W, 7, 1.7, .7, 2.6), 'B': row(W, 7, 1.7, .7, 2.6), 'R': row(D, 5, 1.6, .7, 2.6), 'L': row(D, 5, 1.6, .7, 2.6)}
    for k, L in (('F', W), ('R', D), ('B', W), ('L', D)):
        panel(body, fr[k], L, fh, ops[k], 'W_wall'); win_details(det, fr[k], ops[k], sill=False)
    box(det, -.1, -.1, 0, W + .1, D + .1, .35, 'W_wall2', skip=('top', 'bot'))
    for x in (1.3, W - 1.3): box(det, x - .25, -.35, 0, x + .25, 0, fh, 'W_wall2', skip=('B', 'top', 'bot'))
    return asset(ents, 'ht_mid', [('body', body), ('details', det)])
def ht_top(ents):
    W, D = 18.0, 14.0; body = MB(); det = MB()
    poly(body, [(0,0,0),(W,0,0),(W,D,0),(0,D,0)], 'roof_flat', n=(0,0,1))
    box(det, -.3, -.3, 0, W + .3, D + .3, 1.2, 'W_wall2', top='concrete', skip=('bot',))
    box(det, 4, 4, 1.2, 14, 10, 4.2, 'W_wall2', top='roof_flat', skip=('bot',))
    box(det, 3, -.5, 1.2, 15, -.3, 4.6, 'darkmetal'); box(det, 3.3, -.52, 1.6, 14.7, -.5, 4.2, 'E_sign')
    for x in (4, 14): box(det, x, 1.5, 1.2, x + .12, 1.62, 4.6, 'steel', skip=('bot',))
    return asset(ents, 'ht_top', [('body', body), ('details', det)])
def o_low(ents):
    W, D, fh, nf = 22.0, 14.0, 3.6, 3; h = fh*nf; body = MB(); det = MB()
    bands = []
    for f in range(nf):
        bands.append((f*fh, (f+1)*fh, 'W_wall', {'F': [(.6, W - .6, .9, fh - .5, 'G_glass', .12)] if f else [(.6, 8.5, .6, fh - .4, 'G_glass', .12), (13.5, W - .6, .6, fh - .4, 'G_glass', .12)],
               'B': [(.6, W - .6, .9, fh - .5, 'G_glass', .12)], 'R': [(.6, D - .6, .9, fh - .5, 'G_glass', .12)], 'L': [(.6, D - .6, .9, fh - .5, 'G_glass', .12)]}))
    block(body, 0, 0, W, D, bands, top='roof_flat')
    for (z0, z1, m, ops) in bands:
        fr = frames(0, 0, W, D, z0)
        for k in 'FRBL':
            for (a0, a1, b0, b1, fm, rec) in ops[k]:
                a = a0 + 1.4
                while a < a1 - .3: fbox(det, fr[k], a - .03, a + .03, b0, b1, -rec + .01, -.01, 'darkmetal', skip=('back', 'top', 'bot')); a += 1.4
    fr0 = frames(0, 0, W, D, 0)['F']
    box(det, 8.9, -2.2, 0, 13.1, 0, 4.2, 'G_glass', top='roof_flat'); box(det, 8.7, -2.4, 4.2, 13.3, .2, 4.5, 'white')
    fbox(det, fr0, 9.3, 12.7, 4.6, 5.3, .01, .15, 'E_sign', skip=('back',))
    parapet(det, 0, 0, W, D, h, h=.9, t=.25, m='W_wall2')
    box(det, 8, 5, h, 14, 9, h + 2.6, 'metal', top='roof_flat', skip=('bot',))
    for (x, y) in [(2, 3), (3.5, 3), (18, 10)]: ac_unit(det, x, y, h)
    return asset(ents, 'o_low', [('body', body), ('details', det)])
def o2_base(ents):
    W, D, h = 22.0, 18.0, 5.6; body = MB(); det = MB()
    fr = frames(0, 0, W, D, 0)
    for k, L in (('F', W), ('R', D), ('B', W), ('L', D)): curtain(body, det, fr[k], L, h, step=2.2, sill=.05, head=.6, rec=.4, wall='A_base', hbar=3.2)
    poly(body, [(0,0,h),(W,0,h),(W,D,h),(0,D,h)], 'concrete', n=(0,0,1))
    fbox(det, fr['F'], 6, 16, h - .5, h - .1, 0, 3.5, 'white'); fbox(det, fr['F'], 7, 15, h - .1, h + .6, 3.3, 3.5, 'E_sign')
    for a in (6.5, 15.5): cyl(det, a, -3.2, 0, h - .5, .2, 'steel', n=10)
    return asset(ents, 'o2_base', [('body', body), ('details', det)])
def o2_mid(ents):
    W, D, fh = 22.0, 18.0, 3.6; body = MB(); det = MB(); fr = frames(0, 0, W, D, 0)
    for k, L in (('F', W), ('R', D), ('B', W), ('L', D)): curtain(body, det, fr[k], L, fh, step=1.5, sill=.9, head=.2, rec=.1, fin=.25)
    return asset(ents, 'o2_mid', [('body', body), ('details', det)])
def o2_top(ents):
    W, D = 22.0, 18.0; body = MB(); det = MB()
    poly(body, [(0,0,0),(W,0,0),(W,D,0),(0,D,0)], 'roof_flat', n=(0,0,1))
    box(det, -.15, -.15, 0, W + .15, D + .15, 1.1, 'W_wall', top='concrete', skip=('bot',))
    box(det, 5, 4, 0, 17, 14, 4.0, 'darkmetal', top='roof_flat', skip=('bot',))
    for i in range(12): x = 5.2 + i*1.0; box(det, x, 3.9, 0, x + .08, 4.0, 4.0, 'metal', skip=('bot',))
    return asset(ents, 'o2_top', [('body', body), ('details', det)])
def o3_base(ents):
    W, D, h = 24.0, 24.0, 8.0; body = MB(); det = MB(); fr = frames(0, 0, W, D, 0)
    for k in 'FRBL': curtain(body, det, fr[k], W, h, step=3.0, sill=.05, head=.8, rec=.8, wall='stone', hbar=4.2)
    poly(body, [(0,0,h),(W,0,h),(W,D,h),(0,D,h)], 'concrete', n=(0,0,1))
    for k in 'FRBL':
        for i in range(0, 9): a = i*3.0; fbox(det, fr[k], a - .0 if i else 0, a + .6 if i else .6, 0, h, 0, .3, 'stone', skip=('back', 'bot'))
    fbox(det, fr['F'], 7, 17, 4.4, 4.9, 0, 4.0, 'darkmetal')
    return asset(ents, 'o3_base', [('body', body), ('details', det)])
def o3_mid(ents):
    W, D, fh = 24.0, 24.0, 3.8; body = MB(); det = MB(); fr = frames(0, 0, W, D, 0)
    for k in 'FRBL': curtain(body, det, fr[k], W, fh, fm='G_glass', step=1.6, sill=.05, head=.05, rec=.08, wall='W_wall', hbar=.9)
    box(det, -.05, -.05, fh - .06, W + .05, D + .05, fh, 'darkmetal', skip=('top', 'bot'))
    return asset(ents, 'o3_mid', [('body', body), ('details', det)])
def o3_top(ents):
    W, D = 24.0, 24.0; body = MB(); det = MB()
    poly(body, [(0,0,0),(W,0,0),(W,D,0),(0,D,0)], 'roof_flat', n=(0,0,1))
    fr = frames(3, 3, 21, 21, 0)
    for k in 'FRBL': curtain(body, det, fr[k], 18, 7.6, step=1.6, sill=.05, head=.05, rec=.08)
    poly(body, [(3,3,7.6),(21,3,7.6),(21,21,7.6),(3,21,7.6)], 'roof_flat', n=(0,0,1))
    fr2 = frames(6, 6, 18, 18, 7.6)
    for k in 'FRBL': curtain(body, det, fr2[k], 12, 5.0, step=1.6, sill=.05, head=.05, rec=.08)
    poly(body, [(6,6,12.6),(18,6,12.6),(18,18,12.6),(6,18,12.6)], 'darkmetal', n=(0,0,1))
    box(det, -.1, -.1, 0, W + .1, D + .1, 1.0, 'darkmetal', top='concrete', skip=('bot',))
    cyl(det, 12, 12, 12.6, 30, .5, 'steel', n=8, r1=.12)
    box(det, 11.8, 11.8, 12.6, 12.2, 12.2, 34, 'steel', skip=('bot',))
    return asset(ents, 'o3_top', [('body', body), ('details', det)])
def o_tech(ents):
    W, D, fh = 28.0, 20.0, 3.8; body = MB(); det = MB()
    ops = {k: [(.5, (W if k in 'FB' else D) - .5, .3, fh - .4, 'G_glass', .15)] for k in 'FRBL'}
    ops2 = {k: [(.5, (W if k in 'FB' else D) - .5, .6, fh - .4, 'G_glass', .15)] for k in 'FRBL'}
    block(body, 0, 0, W, D, [(0, fh, 'white', ops), (fh, 2*fh, 'white', ops2)], top='grass')
    fr = frames(0, 0, W, D, 0)
    for k in 'FRBL':
        L = W if k in 'FB' else D; a = 1.0
        while a < L - .6:
            fbox(det, fr[k], a - .05, a + .05, fh + .2, 2*fh - .2, 0, .6, 'wood', skip=('back',)); a += .9
        fbox(det, fr[k], 0, L, fh - .15, fh + .15, 0, 1.2, 'white')
    for i in range(4):
        for j in range(3):
            x, y = 3 + i*6, 3 + j*5.5
            poly(det, [(x, y, 2*fh + .3), (x + 4.5, y, 2*fh + .3), (x + 4.5, y + 3.0, 2*fh + 1.3), (x, y + 3.0, 2*fh + 1.3)], 'blackglass', n=(0, -1, 3))
            box(det, x + .2, y + 2.6, 2*fh, x + .4, y + 2.8, 2*fh + 1.25, 'steel', skip=('bot',)); box(det, x + 4.1, y + 2.6, 2*fh, x + 4.3, y + 2.8, 2*fh + 1.25, 'steel', skip=('bot',))
    box(det, 11, -3, 0, 17, 0, .06, 'paving', skip=('bot',))
    return asset(ents, 'o_tech', [('body', body), ('details', det)])
