# Maisons (zone résidentielle faible densité, niveaux 1 à 5). Façade avant en y = 0.
def h_cottage(ents):
    W, D, zP, fh = 7.2, 6.4, .35, 2.9; zE = zP + fh; body = MB(); det = MB(); roof = MB()
    plinth(body, 0, 0, W, D)
    ops = {'F': face_ops(W, 1, fh, 1.1, 1.3, .95, n=3, door=1), 'B': face_ops(W, 1, fh, 1.1, 1.3, .95, n=2), 'R': face_ops(D, 1, fh, 1.0, 1.3, .95, n=2), 'L': face_ops(D, 1, fh, 1.0, 1.3, .95, n=1)}
    gable_body(body, det, 0, 0, W, D, zP, zE, 42, 'x', ops)
    shutters(det, frames(0, 0, W, D, zP)['F'], ops['F'])
    gable_roof(roof, 0, 0, W, D, zE, 42, ov=.45, gov=.3)
    zr = zE + D/2*math.tan(math.radians(42)); chimney(roof, W*.22, D*.55, zE, zr + .8)
    fr0 = frames(0, 0, W, D, 0)['F']; porch(det, fr0, W/2-1.0, W/2+1.0, 1.0, 2.75, zP, posts=False)
    box(det, W/2-.8, -.9, 0, W/2+.8, -.1, zP-.02, 'stone')
    gutters(det, 0, 0, W, D, zE, .45, 42)
    return asset(ents, 'h_cottage', [('body', body), ('roof', roof), ('details', det)])

def h_bungalow(ents):
    W, D, zP, fh = 9.0, 7.0, .35, 2.9; zE = zP + fh; body = MB(); det = MB(); roof = MB()
    plinth(body, 0, 0, W, D)
    ops = {'F': face_ops(W, 1, fh, 1.2, 1.35, .95, n=4, door=1), 'B': face_ops(W, 1, fh, 1.2, 1.35, .95, n=3), 'R': face_ops(D, 1, fh, 1.1, 1.35, .95, n=2), 'L': face_ops(D, 1, fh, 1.1, 1.35, .95, n=2)}
    flat_body(body, det, 0, 0, W, D, zP, zE, ops, top='concrete', lint=True)
    zr = hip_roof(roof, 0, 0, W, D, zE, 27, ov=.6)
    chimney(roof, W*.68, D*.5, zE, zr + .6)
    fr0 = frames(0, 0, W, D, 0)['F']
    fbox(det, fr0, .3, W*.55, zP-.05, zP, 0, 2.0, 'wood')
    for a in (.45, W*.55-.15): fbox(det, fr0, a-.09, a+.09, zP, zE-.05, 1.72, 1.9, 'trim')
    fbox(det, fr0, .3, W*.55, zE-.2, zE-.02, 0, 2.0, 'trim')
    for a0 in (.3, W*.55 - .05):
        pass
    fbox(det, fr0, .45, W*.55-.15, zP+.9, zP+.96, 1.78, 1.84, 'trim')
    return asset(ents, 'h_bungalow', [('body', body), ('roof', roof), ('details', det)])

def h_house(ents):
    W, D, zP, fh = 8.4, 7.2, .35, 2.9; zE = zP + 2*fh; body = MB(); det = MB(); roof = MB()
    plinth(body, 0, 0, W, D)
    ops = {'F': face_ops(W, 2, fh, 1.25, 1.4, .95, n=3, door=1), 'B': face_ops(W, 2, fh, 1.25, 1.4, .95, n=3, door=0, dw=2.0, dm='G_glass'),
           'R': face_ops(D, 2, fh, 1.2, 1.4, .95, n=2), 'L': face_ops(D, 2, fh, 1.2, 1.4, .95, n=2)}
    gable_body(body, det, 0, 0, W, D, zP, zE, 35, 'x', ops)
    shutters(det, frames(0, 0, W, D, zP)['F'], ops['F'])
    zr = gable_roof(roof, 0, 0, W, D, zE, 35, ov=.5, gov=.35); chimney(roof, W*.72, D*.6, zE, zr + .9)
    fr0 = frames(0, 0, W, D, 0)['F']; porch(det, fr0, W/2-1.0, W/2+1.0, 1.1, 2.7, zP)
    box(det, W/2-.8, -1.0, 0, W/2+.8, -.1, zP-.02, 'stone')
    gutters(det, 0, 0, W, D, zE, .5, 35, gov=.35)
    return asset(ents, 'h_house', [('body', body), ('roof', roof), ('details', det)])

def h_gablefront(ents):
    W, D, zP, fh = 7.4, 9.4, .35, 2.9; zE = zP + 2*fh; body = MB(); det = MB(); roof = MB()
    plinth(body, 0, 0, W, D)
    ops = {'F': face_ops(W, 2, fh, 1.2, 1.45, .95, n=2, door=0), 'B': face_ops(W, 2, fh, 1.2, 1.45, .95, n=2),
           'R': face_ops(D, 2, fh, 1.2, 1.4, .95, n=3), 'L': face_ops(D, 2, fh, 1.2, 1.4, .95, n=3)}
    gable_body(body, det, 0, 0, W, D, zP, zE, 40, 'y', ops)
    shutters(det, frames(0, 0, W, D, zP)['R'], ops['R']); shutters(det, frames(0, 0, W, D, zP)['L'], ops['L'])
    zr = gable_roof(roof, 0, 0, W, D, zE, 40, ov=.4, gov=.45, axis='y'); chimney(roof, W*.62, D*.7, zE, zr + .7)
    fr0 = frames(0, 0, W, D, 0)['F']
    fbox(det, fr0, .3, 3.3, fh+zP-.18, fh+zP, 0, 1.3, 'concrete')
    fbox(det, fr0, .3, 3.3, fh+zP, fh+zP+1.0, 1.25, 1.3, 'darkmetal', skip=('back',))
    for a in (.36, 3.24): fbox(det, fr0, a-.06, a+.06, zP, fh+zP-.18, 1.1, 1.24, 'darkmetal')
    box(det, .5, -1.2, 0, 2.3, -.1, zP-.02, 'stone')
    gutters(det, 0, 0, W, D, zE, .4, 40, gov=.45, axis='y')
    return asset(ents, 'h_gablefront', [('body', body), ('roof', roof), ('details', det)])

def h_family(ents):
    W, D, zP, fh = 9.6, 8.2, .35, 2.9; zE = zP + 2*fh; body = MB(); det = MB(); roof = MB()
    plinth(body, 0, 0, W, D)
    ops = {'F': face_ops(W, 2, fh, 1.3, 1.45, .95, n=3, door=1), 'B': face_ops(W, 2, fh, 1.3, 1.45, .95, n=3, door=1, dw=2.2, dm='G_glass'),
           'R': face_ops(D, 2, fh, 1.2, 1.4, .95, n=2, skip=((0,0),(0,1))), 'L': face_ops(D, 2, fh, 1.2, 1.4, .95, n=2)}
    flat_body(body, det, 0, 0, W, D, zP, zE, ops, top='concrete', lint=True)
    zr = hip_roof(roof, 0, 0, W, D, zE, 30, ov=.5); chimney(roof, W*.25, D*.45, zE, zr + .7)
    # garage accolé
    gx0, gx1, gy0, gy1, gh = W, W + 3.8, .9, 7.6, 3.0
    gops = {'F': [(.5, 3.3, .05, 2.35, 'garage', .12)], 'R': [(4.2, 5.2, .05, 2.2, 'A_door', .1)], 'B': [], 'L': []}
    fr = frames(gx0, gy0, gx1, gy1, 0)
    for k, Ln in (('F', gx1-gx0), ('R', gy1-gy0), ('B', gx1-gx0)): panel(body, fr[k], Ln, gh, gops.get(k, []), 'W_wall')
    poly(body, [(gx0,gy0,gh),(gx1,gy0,gh),(gx1,gy1,gh),(gx0,gy1,gh)], 'roof_flat', n=(0,0,1))
    box(det, gx0-.05, gy0-.2, gh, gx1+.2, gy1+.2, gh+.25, 'trim')
    box(det, gx0+.4, -3.5, 0, gx1-.4, gy0, .04, 'paving', skip=('bot',))
    fr0 = frames(0, 0, W, D, 0)['F']; porch(det, fr0, W/2-1.1, W/2+1.1, 1.2, 2.8, zP)
    box(det, W/2-.9, -1.1, 0, W/2+.9, -.1, zP-.02, 'stone')
    fbox(det, frames(0, 0, W, D, zP)['F'], 1.6-.8, 1.6+.8, fh+.55, fh+.6, 0, .9, 'darkmetal')
    return asset(ents, 'h_family', [('body', body), ('roof', roof), ('details', det)])

def h_villa(ents):
    W, D, zP, fh = 12.0, 8.6, .45, 3.1; zE = zP + 2*fh; body = MB(); det = MB(); roof = MB()
    plinth(body, 0, 0, W, D, h=.45)
    ops = {'F': face_ops(W, 2, fh, 1.3, 1.7, .8, n=5, door=2, dw=1.6, dh=2.5), 'B': face_ops(W, 2, fh, 1.3, 1.7, .8, n=5, door=2, dw=2.6, dm='G_glass'),
           'R': face_ops(D, 2, fh, 1.3, 1.7, .8, n=3), 'L': face_ops(D, 2, fh, 1.3, 1.7, .8, n=3, skip=((0,1),(0,2)))}
    flat_body(body, det, 0, 0, W, D, zP, zE, ops, top='concrete', lint=True)
    shutters(det, frames(0, 0, W, D, zP)['F'], [o for o in ops['F'] if o[4] == 'G_glass'])
    cornice(det, 0, 0, W, D, zE - .12, .2, .12)
    zr = hip_roof(roof, 0, 0, W, D, zE, 26, ov=.55)
    chimney(roof, 1.6, D*.45, zE, zr + .4); chimney(roof, W - 2.2, D*.45, zE, zr + .4)
    # aile de plain-pied à gauche
    wx0, wx1, wy0, wy1, wz = -5.2, 0, 2.4, 10.4, zP + fh
    plinth(body, wx0, wy0, wx1 - .1, wy1, h=.45)
    wops = {'F': face_ops(wx1-wx0, 1, fh, 1.3, 1.7, .8, n=2), 'L': face_ops(wy1-wy0, 1, fh, 1.3, 1.7, .8, n=3), 'B': face_ops(wx1-wx0, 1, fh, 1.3, 1.7, .8, n=2), 'R': []}
    fr = frames(wx0, wy0, wx1, wy1, zP)
    for k, Ln in (('F', wx1-wx0), ('L', wy1-wy0), ('B', wx1-wx0)):
        panel(body, fr[k], Ln, wz - zP, wops[k], 'W_wall'); win_details(det, fr[k], wops[k]); lintels(det, fr[k], wops[k])
    hip_roof(roof, wx0, wy0, wx1, wy1, wz, 26, ov=.5)
    panel(body, ((wx1, D, zP), (0,1,0), (0,0,1), (1,0,0)), wy1 - D, wz - zP, [], 'W_wall')
    # portique d'entrée à colonnes
    fr0 = frames(0, 0, W, D, 0)['F']
    fbox(det, fr0, W/2-2.1, W/2+2.1, zP+2.95, zP+3.3, 0, 2.2, 'trim')
    for a in (W/2-1.8, W/2+1.8): cyl(det, a, -1.9, zP, zP+2.95, .2, 'trim', n=12)
    box(det, W/2-2.3, -2.4, 0, W/2+2.3, -.1, zP-.02, 'stone')
    fbox(det, fr0, W/2-2.1, W/2+2.1, zP+3.3, zP+3.95, 1.9, 2.0, 'W_wall', skip=('back',))
    # terrasse arrière
    box(det, 1.5, D, 0, W-1.5, D+3.2, zP-.02, 'paving', skip=('bot',))
    return asset(ents, 'h_villa', [('body', body), ('roof', roof), ('details', det)])

def h_modern(ents):
    body = MB(); det = MB()
    # rez-de-chaussée vitré
    W0, D0, h0 = 12.5, 9.0, 3.3
    box(body, -.2, -.2, 0, W0+.2, D0+.2, .15, 'concrete', skip=('bot',))
    ops0 = {'F': [(.5, 4.8, .2, 3.0, 'G_glass', .1), (5.6, 6.8, .2, 2.5, 'A_door', .1), (7.6, 12.0, .2, 3.0, 'G_glass', .1)],
            'B': [(.5, 12.0, .2, 3.0, 'G_glass', .1)], 'R': [(1.0, 4.0, 1.0, 2.6, 'G_glass', .1)], 'L': [(1.0, 8.0, .2, 3.0, 'G_glass', .1)]}
    flat_body(body, det, 0, 0, W0, D0, .15, h0, ops0, top='roof_flat', mull=False)
    for (a0, a1) in [(.5, 4.8), (7.6, 12.0)]:
        a = a0 + 1.45
        while a < a1 - .2:
            fbox(det, frames(0, 0, W0, D0, .15)['F'], a-.03, a+.03, .2, 3.0, -.08, -.03, 'darkmetal'); a += 1.45
    # étage en porte-à-faux habillé de bois
    x0, x1, y0, y1, z0, z1 = 3.2, 14.2, 1.2, 8.4, h0, h0 + 3.1
    ops1 = {'F': [(.6, 10.4, .6, 2.5, 'G_glass', .15)], 'B': [(1.0, 5.0, .6, 2.5, 'G_glass'), (6.0, 10.0, .6, 2.5, 'G_glass')], 'R': [(1.5, 5.7, .6, 2.5, 'G_glass')], 'L': [(2.0, 5.0, .6, 2.5, 'G_glass')]}
    fr1 = frames(x0, y0, x1, y1, z0); L1 = {'F': x1-x0, 'B': x1-x0, 'R': y1-y0, 'L': y1-y0}
    for k in 'FRBL': panel(body, fr1[k], L1[k], z1 - z0, ops1[k], 'wood')
    poly(body, [(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)], 'roof_flat', n=(0,0,1))
    poly(body, [(W0,y0,z0),(x1,y0,z0),(x1,y1,z0),(W0,y1,z0)], 'wood', n=(0,0,-1))
    box(det, x0-.1, y0-.1, z1, x1+.1, y1+.1, z1+.3, 'W_wall', top='concrete')
    box(det, -.1, -.1, h0, W0+.1, D0+.1, h0+.25, 'W_wall', top='concrete')
    for a in (2.0, 4.1, 6.2, 8.3): fbox(det, fr1['F'], a-.02, a+.02, .6, 2.5, -.12, -.08, 'darkmetal')
    # terrasse avec garde-corps vitré sur le toit du rez-de-chaussée
    box(det, 0, 0, h0 + .25, 3.2, .06, h0 + 1.25, 'G_glass'); box(det, 0, 0, h0 + .25, .06, D0, h0 + 1.25, 'G_glass')
    box(det, -.02, -.02, h0 + 1.25, 3.2, .08, h0 + 1.3, 'steel'); box(det, -.02, -.02, h0 + 1.25, .08, D0, h0 + 1.3, 'steel')
    # auvent de carport
    box(det, W0 + .2, -.2, 2.7, W0 + 3.4, 6.5, 2.9, 'W_wall', top='roof_flat')
    for (x, y) in [(W0 + 3.1, 0), (W0 + 3.1, 6.1)]: box(det, x, y, 0, x + .15, y + .15, 2.7, 'steel')
    box(det, W0 + .2, -3.0, 0, W0 + 3.4, 6.5, .04, 'paving', skip=('bot',))
    box(det, 1.0, D0, 0, 11.5, D0 + 2.8, .1, 'wood', skip=('bot',))
    return asset(ents, 'h_modern', [('body', body), ('details', det)])

def h_townhouse(ents):
    W, D, zP, fh = 6.2, 10.0, .45, 3.0; zE = zP + 3*fh; body = MB(); det = MB(); roof = MB()
    plinth(body, 0, 0, W, D, h=.45)
    ops = {'F': face_ops(W, 3, fh, 1.15, 1.7, .8, n=2, door=0, dh=2.5), 'B': face_ops(W, 3, fh, 1.15, 1.6, .9, n=2), 'R': face_ops(D, 3, fh, .9, 1.3, 1.0, n=2), 'L': face_ops(D, 3, fh, .9, 1.3, 1.0, n=2)}
    flat_body(body, det, 0, 0, W, D, zP, zE, ops, top='concrete', lint=True)
    for f in range(3): cornice(det, 0, -.02, W, .02, zP + (f+1)*fh - .1, .12, .1, 'trim')
    zr = gable_roof(roof, 0, 0, W, D, zE, 48, ov=.3, gov=.15)
    chimney(roof, .3, D*.45, zE, zr + .5); chimney(roof, W - .9, D*.45, zE, zr + .5)
    # lucarnes
    for a in (W*.3, W*.7):
        k = math.tan(math.radians(48)); yb = 1.3; zb = zE + (yb - 0)*k - .4
        box(roof, a - .6, yb - 1.2, zE + .5, a + .6, yb + .4, zE + 2.1, 'W_wall', top='R_roof')
        box(det, a - .4, yb - 1.25, zE + .8, a + .4, yb - 1.19, zE + 1.8, 'G_glass')
    fr0 = frames(0, 0, W, D, 0)['F']
    for f in (1, 2): fbox(det, fr0, W*.75-.8, W*.75+.8, zP + f*fh + .8, zP + f*fh + .86, 0, .45, 'darkmetal')
    box(det, .5, -1.1, 0, 2.0, -.1, zP - .02, 'stone')
    return asset(ents, 'h_townhouse', [('body', body), ('roof', roof), ('details', det)])

HOUSES = [h_cottage, h_bungalow, h_house, h_gablefront, h_family, h_villa, h_modern, h_townhouse]
