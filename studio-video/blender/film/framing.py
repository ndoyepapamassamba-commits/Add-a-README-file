"""
CADRAGE — ce qu'une caméra voit réellement du décor peint, sur tout le tour du cadre (360°).

Le décor peint est une image projetée depuis une caméra de référence C0 puis repoussée par sa carte de profondeur
(relief). Une caméra qui s'approche ou se décale voit ce relief sous un autre angle : ses parties lointaines peuvent
laisser apparaître le bord de la peinture (prolongé en miroir). Ici, des rayons partent du centre de l'objectif vers
TOUT le pourtour du cadre — 72 directions, tous les 5°, coins compris — et avancent jusqu'à toucher le relief : on
sait alors exactement quel point de la peinture est vu, et de combien la vue dépasse chaque bord.

Le même calcul sert à la génération (scene.fit_view place chaque caméra) et au contrôle de conformité (preflight
vérifie chaque caméra à CHAQUE image de son mouvement).
"""
import math

import numpy as np


def lens_view(lens, shift_x=0.0, shift_y=0.0, fit='VERTICAL', asp=9 / 16, sensor=36.0):
    """Frustum of a level camera in « tan » units: half-extents (tan_h, tan_v) and the off-axis centre (ox, oz) given by
    the lens shift. Blender (BKE_camera_params_compute_viewplane) measures the shift in units of the SENSOR-FIT side:
    the frame width for a horizontal fit, the frame height for a vertical fit (the larger side when AUTO)."""
    if fit == 'HORIZONTAL':
        tan_h = sensor / 2 / lens
        tan_v = tan_h / asp
    else:
        tan_v = sensor / 2 / lens
        tan_h = tan_v * asp
    unit = 2 * tan_h if fit == 'HORIZONTAL' else (2 * tan_v if fit == 'VERTICAL' else 2 * max(tan_h, tan_v))
    return tan_h, tan_v, shift_x * unit, shift_y * unit


def _off(cam):
    return (cam[3], cam[4]) if len(cam) > 4 else (0.0, 0.0)


def border_dirs(tan_h, tan_v, n=72, ox=0.0, oz=0.0):
    """Unit-depth directions (x, 1, z) towards the frame border, one every 360/n degrees around its centre."""
    a = np.arange(n) * 2 * math.pi / n
    c, s = np.cos(a), np.sin(a)
    m = np.maximum(np.abs(c), np.abs(s))
    return np.stack([ox + c / m * tan_h, np.ones(n), oz + s / m * tan_v], 1)


def view_overflow(g, cam, tan_h, tan_v, n=72, steps=120):
    """How far the view of a camera at `cam` (looking +y, level) goes past each edge of the painting:
    (left, right, top, bottom) in metres — 0 everywhere means the whole frame shows painted set only."""
    C0 = np.array(g['C0'], dtype=float)
    Yp, DEPTH = g['Yp'], g['DEPTH']
    dirs = border_dirs(tan_h, tan_v, n, *_off(cam))
    Y = np.linspace(Yp, Yp + DEPTH, steps)
    t = Y[None, :] - cam[1]
    X = cam[0] + t * dirs[:, 0:1]
    Z = cam[2] + t * dirs[:, 2:3]
    k = (Y[None, :] - C0[1]) / (Yp - C0[1])
    u = (C0[0] + (X - C0[0]) / k - g['x0']) / g['Wm']
    v = (g['ztop'] - (C0[2] + (Z - C0[2]) / k)) / g['mH']
    dn = g.get('dn')
    if dn is None:
        idx = np.zeros(len(dirs), int)
    else:
        NX, NZ = dn.shape[1] - 1, dn.shape[0] - 1
        i = np.clip(np.round((u + g['EX']) / (1 + 2 * g['EX']) * NX).astype(int), 0, NX)
        j = np.clip(np.round((v + g['EZ']) / (1 + 2 * g['EZ']) * NZ).astype(int), 0, NZ)
        hit = Y[None, :] >= Yp + (1 - np.asarray(dn)[j, i]) * DEPTH - 1e-6
        idx = np.where(hit.any(1), hit.argmax(1), steps - 1)
    r = np.arange(len(dirs))
    uh, vh = u[r, idx], v[r, idx]
    st = g.get('stage')
    if st:
        # A 3D forestage (and the foot of the set) covers every ray that reaches the painting plane below its top: those
        # rays see the floor the engine built, not a mirrored edge of the painting.
        z_at = cam[2] + (Yp - cam[1]) * dirs[:, 2]
        seen = z_at > st['z_top'] + 1e-6
        if not seen.any():
            return 0.0, 0.0, 0.0, 0.0
        uh, vh = uh[seen], vh[seen]
    return (max(0.0, float((-uh).max()) * g['Wm']), max(0.0, float((uh - 1).max()) * g['Wm']),
            max(0.0, float((-vh).max()) * g['mH']), max(0.0, float((vh - 1).max()) * g['mH']))


def project(cam, tan_h, tan_v, p):
    """Screen position of a world point for a level camera looking +y: (x, y) in 0..1 from the top-left, and the
    depth in front of the lens (≤ 0 = behind the camera)."""
    D = p[1] - cam[1]
    if D <= 1e-6:
        return None, None, D
    ox, oz = _off(cam)
    xn = ((p[0] - cam[0]) / D - ox) / tan_h
    zn = ((p[2] - cam[2]) / D - oz) / tan_v
    return 0.5 + xn / 2, 0.5 - zn / 2, D


def decor_vertices(g, stride=3):
    """The relief of the painted set on a sub-sampled grid (same maths as scene.build_decor): vertices (Z, X, 3) and the
    painting coordinates (gx, gz) of each, gx/gz in 0..1 inside the painting."""
    dn = g.get('dn')
    if dn is None:
        return None
    dn = np.asarray(dn)
    NZ, NX = dn.shape[0] - 1, dn.shape[1] - 1
    gx = np.linspace(-g['EX'], 1 + g['EX'], NX + 1)[::stride]
    gz = np.linspace(-g['EZ'], 1 + g['EZ'], NZ + 1)[::stride]
    d = dn[::stride, ::stride]
    C0 = np.array(g['C0'], dtype=float)
    Yp, DEPTH = g['Yp'], g['DEPTH']
    GX, GZ = np.meshgrid(gx, gz)
    P0 = np.stack([g['x0'] + GX * g['Wm'], np.full_like(GX, Yp), g['ztop'] - GZ * g['mH']], -1)
    k = ((Yp + (1 - d) * DEPTH) - C0[1]) / (Yp - C0[1])
    V = C0 + (P0 - C0) * k[..., None]
    return V, GX, GZ


def decor_distortion(g, cam, tan_h, tan_v, mesh=None):
    """How much the PAINTING is deformed in the view of a camera that is not at the painting's own viewpoint C0 — the
    relief built from the depth map is a « rubber sheet »: seen from elsewhere, it stretches at depth edges (painted
    people's faces and bodies smear). For every visible cell: the ratio of its size on screen to its size in the
    painting, normalised by the median (the zoom). Returns (share of the visible area deformed by more than 35 %,
    95th percentile of the deformation, visible cells)."""
    mesh = mesh or decor_vertices(g)
    if mesh is None:
        return 0.0, 1.0, 0
    V, GX, GZ = mesh
    D = V[..., 1] - cam[1]
    ox, oz = _off(cam)
    xs = ((V[..., 0] - cam[0]) / D - ox) / tan_h
    zs = ((V[..., 2] - cam[2]) / D - oz) / tan_v
    du_s = np.hypot(np.diff(xs, axis=1)[:-1], np.diff(zs, axis=1)[:-1])
    dv_s = np.hypot(np.diff(xs, axis=0)[:, :-1], np.diff(zs, axis=0)[:, :-1])
    du_p = np.diff(GX, axis=1)[:-1] * g['Wm']
    dv_p = np.diff(GZ, axis=0)[:, :-1] * g['mH']
    ru, rv = du_s / np.maximum(du_p, 1e-9), dv_s / np.maximum(dv_p, 1e-9)
    cx_, cz_ = xs[:-1, :-1], zs[:-1, :-1]
    inside = (np.abs(cx_) <= 1) & (np.abs(cz_) <= 1) & (GX[:-1, :-1] >= 0) & (GX[:-1, :-1] <= 1) & (GZ[:-1, :-1] >= 0) & (GZ[:-1, :-1] <= 1)
    if not inside.any():
        return 0.0, 1.0, 0
    mu, mv = np.median(ru[inside]), np.median(rv[inside])
    dist = np.maximum.reduce([ru / mu, mu / np.maximum(ru, 1e-9), rv / mv, mv / np.maximum(rv, 1e-9)])[inside]
    return float((dist > 1.35).mean()), float(np.percentile(dist, 95)), int(inside.sum())
