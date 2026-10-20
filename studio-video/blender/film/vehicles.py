"""
VÉHICULES — des voitures crédibles, générées (pas des boîtes) : carrosserie continue « lissée » par sections (capot,
pare-brise, pavillon, lunette, coffre, passages de roue, rentrée de caisse), vitres teintées, peinture laquée,
phares / feux, calandre, pare-chocs, rétroviseurs, poignées, plaques, pneus et jantes à rayons. Types : berline,
taxi compteur (orange, enseigne), woro-woro (vert), 4x4. Tout est à l'échelle réelle (4,4–4,8 m) et posé au sol.
"""
import math

# (length, width, roof height, profile) — the profile gives the top line (u = 0 rear → 1 front) as control points.
TYPES = {
    'berline': (4.55, 1.76, 1.45, [(0.0, 0.52), (0.03, 0.93), (0.20, 1.0), (0.36, 1.42), (0.42, 1.45), (0.58, 1.45), (0.74, 1.02), (0.94, 0.88), (1.0, 0.58)]),
    '4x4': (4.75, 1.86, 1.82, [(0.0, 0.62), (0.02, 1.05), (0.10, 1.75), (0.16, 1.82), (0.66, 1.82), (0.78, 1.25), (0.95, 1.12), (1.0, 0.70)]),
}
BELT = {'berline': 0.98, '4x4': 1.18}
CABIN = {'berline': (0.21, 0.75), '4x4': (0.07, 0.78)}
PAINT = {'taxi': (235, 120, 25), 'woro': (40, 140, 70)}


def _interp(pts, u):
    for (u0, z0), (u1, z1) in zip(pts, pts[1:]):
        if u0 <= u <= u1:
            t = (u - u0) / (u1 - u0) if u1 > u0 else 0
            t = 0.5 - 0.5 * math.cos(math.pi * t)  # smooth between control points
            return z0 + (z1 - z0) * t
    return pts[-1][1]


def car(bpy, K, name, loc, color=(200, 40, 40), kind='berline', heading=0.0, rnd=None):
    """One car as an assembly « asm-voiture… »: body loft + glass + lights + wheels. `heading` in degrees (0 = +x)."""
    style = 'taxi' if kind == 'taxi' else ('woro' if kind == 'woro' else None)
    shape = '4x4' if kind == '4x4' else 'berline'
    L, W, H, prof = TYPES[shape]
    paint = PAINT.get(style, color)
    belt, (c0, c1) = BELT[shape], CABIN[shape]
    r_wheel = 0.33 if shape == 'berline' else 0.38
    wheel_u = (0.18, 0.80) if shape == 'berline' else (0.17, 0.80)
    arch = r_wheel + 0.07
    NS, NR = 44, 28  # stations along the car, points around each section
    verts, faces, mats = [], [], []
    for i in range(NS + 1):
        u = i / NS
        x = (u - 0.5) * L
        zt = _interp(prof, u)
        zb = 0.24
        for wu in wheel_u:
            dx = (u - wu) * L
            if abs(dx) < arch:
                zb = max(zb, r_wheel + 0.02 + math.sqrt(arch * arch - dx * dx) * 0.92)
        # Rounded ends in plan (the body is narrower at the bumpers).
        end = min(u, 1 - u)
        hw = W / 2 * (0.86 + 0.14 * min(1.0, end / 0.06))
        zc, hz = (zb + zt) / 2, max(0.02, (zt - zb) / 2)
        for j in range(NR):
            a = 2 * math.pi * j / NR
            cy, sz = math.cos(a), math.sin(a)
            y = hw * math.copysign(abs(cy) ** (2 / 7), cy)
            z = zc + hz * math.copysign(abs(sz) ** (2 / 7), sz)
            if z > belt and c0 <= u <= c1:
                # Tumblehome: the glasshouse leans inwards above the belt line.
                y *= 1 - 0.16 * min(1.0, (z - belt) / max(0.05, zt - belt))
            verts.append((x, y, z))
    for i in range(NS):
        for j in range(NR):
            a = i * NR + j
            b = i * NR + (j + 1) % NR
            faces.append((a, b, b + NR, a + NR))
            uc = (i + 0.5) / NS
            zc_ = (verts[a][2] + verts[a + NR][2]) / 2
            yc = abs(verts[a][1])
            top = _interp(prof, uc)
            pillar = any(abs(uc - p) < 0.012 for p in (c0 + 0.02, (c0 + c1) / 2, c1 - 0.02))
            glass = c0 + 0.015 < uc < c1 - 0.015 and belt + 0.03 < zc_ < top - 0.04 and not pillar and yc > 0.05
            mats.append(1 if glass else 0)
    faces.append(tuple(range(NR))[::-1])
    mats.append(0)
    faces.append(tuple(NS * NR + j for j in range(NR)))
    mats.append(0)
    me = bpy.data.meshes.new(f'{name}-body')
    me.from_pydata(verts, [], faces)
    me.update()
    body = bpy.data.objects.new(f'paintbody-{name}', me)
    bpy.context.scene.collection.objects.link(body)
    me.materials.append(K['mat'](f'paint-{name}', paint, 0.25))
    me.materials.append(K['mat'](f'tint-{name}', (26, 32, 40), 0.04))
    for p, m in zip(me.polygons, mats):
        p.material_index = m
        p.use_smooth = True
    ss = body.modifiers.new('smooth', 'SUBSURF')
    ss.levels, ss.render_levels = 1, 1
    body['shell'] = False
    parts = [body]
    box, cyl, sphere = K['box'], K['cyl'], K['sphere']
    fx, rx = L / 2, -L / 2
    zf = _interp(prof, 0.985)
    # Front: grille, headlights, bumper, plate. Rear: taillights, bumper, plate.
    parts.append(box(f'metalgrille-{name}', fx - 0.04, fx + 0.01, -0.36, 0.36, 0.42, min(zf - 0.04, 0.62), (30, 30, 34), 0.4))
    for s in (-1, 1):
        hl = sphere(f'glowhead-{name}{s}', (fx - 0.06, s * (W / 2 - 0.28), min(zf - 0.08, 0.7)), 0.11, (255, 250, 235), 0.1)
        hl.scale = (0.45, 1.3, 0.55)
        parts.append(hl)
        tl = sphere(f'glowtail-{name}{s}', (rx + 0.05, s * (W / 2 - 0.25), 0.82 if shape == 'berline' else 0.95), 0.1, (220, 30, 30), 0.1)
        tl.scale = (0.4, 1.5, 0.6)
        parts.append(tl)
        parts.append(box(f'mirror-{name}{s}', fx - L * (1 - c1) - 0.08, fx - L * (1 - c1) + 0.06, s * (W / 2 + 0.02), s * (W / 2 + 0.16), belt + 0.02, belt + 0.14, paint, 0.3))
        for du in (0.42, 0.62):
            parts.append(box(f'metalhandle-{name}{s}{du}', rx + L * du - 0.08, rx + L * du + 0.08, s * (W / 2 - 0.005), s * (W / 2 + 0.02), belt - 0.06, belt - 0.03, (200, 200, 205), 0.3))
    # Door gaps, dark wheel-arch liners and the sill: the lines that make a body read as a car.
    for s in (-1, 1):
        for du in (c0 + 0.02, (c0 + c1) / 2, c1 - 0.03):
            parts.append(box(f'gap-{name}{s}{du}', rx + L * du - 0.006, rx + L * du + 0.006, s * (W / 2 - 0.02), s * (W / 2 + 0.006), 0.42, belt - 0.01, (20, 20, 22), 0.6))
        parts.append(box(f'sill-{name}{s}', rx + L * (wheel_u[0] + 0.09), rx + L * (wheel_u[1] - 0.09), s * (W / 2 - 0.06), s * (W / 2 + 0.01), 0.24, 0.34, (35, 35, 38), 0.6))
        for wu in wheel_u:
            # (the liner stays above the road: radius ≤ its centre height — it must not dig into the ground)
            liner = cyl(f'liner-{name}{wu}{s}', ((wu - 0.5) * L, s * (W / 2 - 0.16), r_wheel + 0.02), min(arch - 0.01, r_wheel + 0.015), 0.12, (12, 12, 14), 0.9)
            liner.rotation_euler = (math.radians(90), 0, 0)
            parts.append(liner)
    parts.append(box(f'bumperf-{name}', fx - 0.12, fx + 0.06, -W / 2 + 0.06, W / 2 - 0.06, 0.26, 0.42, (40, 40, 44), 0.5))
    parts.append(box(f'bumperr-{name}', rx - 0.06, rx + 0.12, -W / 2 + 0.06, W / 2 - 0.06, 0.28, 0.46, (40, 40, 44), 0.5))
    parts.append(box(f'plate-{name}', fx + 0.06, fx + 0.075, -0.24, 0.24, 0.3, 0.4, (245, 240, 220), 0.4))
    parts.append(box(f'plater-{name}', rx - 0.075, rx - 0.06, -0.24, 0.24, 0.5, 0.6, (245, 240, 220), 0.4))
    if style == 'taxi':
        top = _interp(prof, 0.5)
        parts.append(box(f'glowtaxisign-{name}', -0.28, 0.28, -0.14, 0.14, top, top + 0.16, (255, 220, 120), 0.3))
    if style == 'woro':
        parts.append(box(f'stripe-{name}', rx + 0.3, fx - 0.3, W / 2 - 0.01, W / 2 + 0.005, belt - 0.2, belt - 0.12, (250, 220, 60), 0.4))
        parts.append(box(f'stripel-{name}', rx + 0.3, fx - 0.3, -W / 2 - 0.005, -W / 2 + 0.01, belt - 0.2, belt - 0.12, (250, 220, 60), 0.4))
    # Wheels: tyre with bevelled shoulders, metal rim with five spokes, hub.
    for wu in wheel_u:
        wx = (wu - 0.5) * L
        for s in (-1, 1):
            wy = s * (W / 2 - 0.13)
            t = cyl(f'tyre-{name}{wu}{s}', (wx, wy, r_wheel), r_wheel, 0.22, (22, 22, 24), 0.8)
            t.rotation_euler = (math.radians(90), 0, 0)
            bv = t.modifiers.new('shoulder', 'BEVEL')
            bv.width, bv.segments = 0.05, 3
            parts.append(t)
            rim = cyl(f'metalrim-{name}{wu}{s}', (wx, wy + s * 0.105, r_wheel), r_wheel * 0.62, 0.03, (200, 202, 208), 0.25)
            rim.rotation_euler = (math.radians(90), 0, 0)
            parts.append(rim)
            for k in range(5):
                sp = box(f'metalspoke-{name}{wu}{s}{k}', -0.025, 0.025, -0.012, 0.012, 0, r_wheel * 0.58, (180, 182, 188), 0.3)
                sp.location = (wx, wy + s * 0.12, r_wheel)
                sp.rotation_euler = (0, math.radians(72 * k), 0)
                parts.append(sp)
    em = bpy.data.objects.new(f'asm-voiture-{name}', None)
    bpy.context.scene.collection.objects.link(em)
    em['assembly'] = 'voiture'
    for p in parts:
        if p.parent is None:
            p.parent = em
    em.location = loc
    em.rotation_euler = (0, 0, math.radians(heading))
    return em
