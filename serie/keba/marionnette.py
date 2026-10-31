"""Les marionnettes : chaque personnage est dessiné à partir de sa fiche (bible) et de son état à l'instant t.

Repère local : origine entre les pieds, au sol ; y vers le bas (négatif = vers le haut) ; personnage tourné vers +x.
La transformation globale applique position, saut, sens (miroir), penché et écrasement-étirement.
Animation automatique : clignement des yeux, respiration, mèche et foulard qui suivent le mouvement.
"""
import math

import skia

from .dessin import (CONTOUR, assombrir, eclaircir, forme_eclairee, membre, motif_wax, ombre_sol, point_quad,
                     coude, teinte)

PEAU_SOMBRE = 0.18

DEFAUT_HUMAIN = {
    "x": 0.0, "y": 0.0, "sens": 1.0, "penche": 0.0, "ecrase": 1.0, "saut": 0.0,
    "marche": 0.0, "foulee": 0.0, "course": 0.0, "vx": 0.0, "trainee": 0.0,
    "main_av": None, "main_ar": None, "tete_incline": 0.0, "tourne": 0.35, "regard": (0.0, 0.0),
    "yeux": 1.0, "pupille": 1.0, "sourcils": 0.0, "froncer": 0.0, "bouche": 0.0, "sourire": 0.25, "dents": 0.0,
    "rouge": 0.0, "sueur": 0.0, "foulard": 0.0, "claquette_perdue": 0.0, "mouille": 0.0, "yeux_jaillis": 0.0,
    "visible": 1.0,
}

DEFAUT_MOUTON = {
    "x": 0.0, "y": 0.0, "sens": 1.0, "penche": 0.0, "ecrase": 1.0, "saut": 0.0,
    "marche": 0.0, "foulee": 0.0, "course": 0.0, "vx": 0.0, "trainee": 0.0,
    "tete_baisse": 0.0, "yeux": 0.62, "bouche": 0.0, "colere": 0.0, "regard": (0.0, 0.0), "visible": 1.0,
}


def etat_defaut(fiche: dict) -> dict:
    if fiche["type"] == "mouton":
        return dict(DEFAUT_MOUTON)
    e = dict(DEFAUT_HUMAIN)
    e["main_av"] = tuple(fiche["repos"]["main_av"])
    e["main_ar"] = tuple(fiche["repos"]["main_ar"])
    return e


def avec_expression(etat: dict, expression: dict) -> dict:
    nouvel = dict(etat)
    for k, v in expression.items():
        if k in nouvel:
            nouvel[k] = v
    return nouvel


def hauteur(fiche: dict) -> float:
    if fiche["type"] == "mouton":
        c = fiche["corps"]
        return c["pattes"] + c["hauteur"] + 70
    t = fiche["tete"]
    extra = {"meche": 40, "foulard": 150, "chauve": 0}.get(fiche["cheveux"]["style"], 0)
    return fiche["jambes"]["longueur"] + fiche["corps"]["hauteur"] + t["cou"] + t["ry"] * (1 + t["machoire"]) + extra


# --- petits outils -----------------------------------------------------------------------------------------------

def _ovale(cx, cy, rx, ry):
    return skia.Path().addOval(skia.Rect(cx - rx, cy - ry, cx + rx, cy + ry))


def _clignement(t: float, graine: int) -> float:
    """1 = yeux ouverts, 0 = fermés ; un clignement de 0,14 s toutes les 2,8 à 4,6 s."""
    periode = 2.8 + (graine * 0.37) % 1.8
    phase = (t + graine * 0.71) % periode
    d = 0.14
    if phase < d:
        return abs(phase - d / 2) / (d / 2)
    return 1.0


def _sous_courbe(a, c, b, f):
    """Début (0 → f) d'une courbe de Bézier quadratique, par de Casteljau."""
    c2 = (a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f)
    return a, c2, point_quad(a, c, b, f)


def _trait_quad(canvas, a, c, b, epaisseur, couleur, contour=4.0, shader=None, ombre=0.28):
    trace = skia.Path()
    trace.moveTo(*a)
    trace.quadTo(c[0], c[1], b[0], b[1])
    p = skia.Paint(Style=skia.Paint.kStroke_Style, StrokeWidth=epaisseur, StrokeCap=skia.Paint.kRound_Cap)
    plein = skia.Path()
    p.getFillPath(trace, plein)
    forme_eclairee(canvas, plein, couleur, contour=contour, ombre=ombre, reflet=0.12, shader=shader)


def _transformer(canvas, etat):
    canvas.translate(etat["x"], etat["y"] - etat["saut"])
    canvas.scale(etat["sens"], 1.0)
    canvas.rotate(math.degrees(etat["penche"]))
    e = max(0.4, etat["ecrase"])
    canvas.scale(e ** -0.6, e)


def _local_vers_monde(etat, p):
    x, y = p
    e = max(0.4, etat["ecrase"])
    x, y = x * e ** -0.6, y * e
    c, s = math.cos(etat["penche"]), math.sin(etat["penche"])
    x, y = x * c - y * s, x * s + y * c
    return etat["x"] + etat["sens"] * x, etat["y"] - etat["saut"] + y


# --- squelette des humains ---------------------------------------------------------------------------------------

def _squelette(f, etat, t):
    L = f["jambes"]["longueur"]
    hc = f["corps"]["hauteur"]
    phi, foulee, course = etat["marche"], etat["foulee"], etat["course"]
    resp = 1.0 + 0.014 * math.sin(2 * math.pi * t / 3.4 + f.get("graine", 0))
    rebond = 0.06 * L * foulee * (1 + 0.8 * course) * (1 + math.cos(2 * phi)) / 2
    hanche = (0.0, -L - rebond + L * 0.04 * foulee)
    epaule_y = hanche[1] - hc * resp
    cou_haut = epaule_y - f["tete"]["cou"]
    tete = (0.0, cou_haut - f["tete"]["ry"] * f["tete"]["machoire"] * 0.82)
    lb, lh = f["corps"]["largeur_bas"], f["corps"]["largeur_haut"]
    ecart = f["jambes"]["ecart"]
    pas = L * 0.55 * foulee * (1 + 0.7 * course)
    leve = L * 0.22 * foulee * (1 + 1.2 * course)
    rentre = min(1.0, etat["saut"] / 90.0)
    pieds, hanches = {}, {}
    for cote, dephase, signe in (("av", 0.0, 1), ("ar", math.pi, -1)):
        ph = phi + dephase
        fx = signe * lb * ecart * 0.55 + pas * math.sin(ph)
        fy = -leve * max(0.0, math.cos(ph))
        fx += rentre * L * 0.12
        fy -= rentre * L * 0.32
        pieds[cote] = (fx, fy)
        hanches[cote] = (signe * lb * ecart, hanche[1])
    epaules = {"av": (lh * 0.42, epaule_y + 16), "ar": (-lh * 0.40, epaule_y + 16)}
    balancier = L * 0.45 * foulee * (1 + 0.6 * course)
    mains = {}
    for cote, signe in (("av", -1), ("ar", 1)):
        base = etat[f"main_{cote}"] or tuple(f["repos"][f"main_{cote}"])
        bx = base[0] + signe * balancier * math.sin(phi)
        by = base[1] - course * f["bras"]["longueur"] * 0.35
        mains[cote] = (epaules[cote][0] + bx, epaules[cote][1] + by)
    return {"hanche": hanche, "epaule_y": epaule_y, "cou_haut": cou_haut, "tete": tete, "pieds": pieds,
            "hanches": hanches, "epaules": epaules, "mains": mains, "resp": resp}


def point_main(fiche, etat, cote="av", t=0.0):
    if fiche["type"] == "mouton":
        c = fiche["corps"]
        return _local_vers_monde(etat, (c["longueur"] * 0.55, -c["pattes"] - c["hauteur"] * 0.9))
    return _local_vers_monde(etat, _squelette(fiche, etat, t)["mains"][cote])


def point_tete(fiche, etat, t=0.0):
    if fiche["type"] == "mouton":
        c = fiche["corps"]
        return _local_vers_monde(etat, (c["longueur"] * 0.5, -c["pattes"] - c["hauteur"] * 0.95))
    sq = _squelette(fiche, etat, t)
    return _local_vers_monde(etat, (sq["tete"][0], sq["tete"][1] - fiche["tete"]["ry"] * 0.9))


# --- dessin des humains ------------------------------------------------------------------------------------------

def _pied(canvas, f, cheville, peau, nu=False):
    p = f["pieds"]
    lg, style = p["longueur"], p["style"]
    x, y = cheville
    ep = f["jambes"]["epaisseur"]
    if style == "talon" and not nu:
        chaussure = skia.Path()
        chaussure.moveTo(x - lg * 0.35, y - ep * 0.45)
        chaussure.quadTo(x + lg * 0.9, y - ep * 0.5, x + lg * 0.75, y + 2)
        chaussure.lineTo(x - lg * 0.3, y + 2)
        chaussure.close()
        forme_eclairee(canvas, chaussure, p["couleur"], contour=3.5)
        talon = skia.Path().addRect(skia.Rect(x - lg * 0.36, y - 2, x - lg * 0.24, y + 12))
        forme_eclairee(canvas, talon, assombrir(p["couleur"], 0.3), contour=2.5, ombre=0)
        return
    semelle_h = 7 if style == "claquette" else 6
    if not nu:
        semelle = skia.Path().addRRect(skia.RRect.MakeRectXY(
            skia.Rect(x - lg * 0.42, y - 1, x + lg * 0.78, y + semelle_h), 6, 6))
        forme_eclairee(canvas, semelle, p["couleur"], contour=3.0, ombre=0.2)
    pied = _ovale(x + lg * 0.18, y - ep * 0.28, lg * 0.55, ep * 0.36)
    forme_eclairee(canvas, pied, peau, contour=3.5)
    if not nu:
        bride = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=5.5,
                           StrokeCap=skia.Paint.kRound_Cap, Color=teinte(assombrir(p["couleur"], 0.15)))
        b = skia.Path()
        b.moveTo(x - lg * 0.05, y + 1)
        b.quadTo(x + lg * 0.3, y - ep * 0.62, x + lg * 0.55, y + 1)
        canvas.drawPath(b, bride)


def _jambes(canvas, f, sq, etat, peau):
    j = f["jambes"]
    bas = j["bas"]
    couleur_jambe = j["couleur_bas"] if bas == "pantalon" else peau
    for cote in ("ar", "av"):
        h, pied = sq["hanches"][cote], sq["pieds"][cote]
        cheville = (pied[0], pied[1] - j["epaisseur"] * 0.35)
        sombre = 0.16 if cote == "ar" else 0.0
        c_j = assombrir(couleur_jambe, sombre)
        if bas == "robe":
            # sous le boubou, on ne voit que le bas des jambes
            mi = (cheville[0] - 2, cheville[1] - j["longueur"] * 0.25)
            membre(canvas, mi, cheville, j["longueur"] * 0.25, j["epaisseur"] * 0.8, assombrir(peau, sombre), contour=3.5)
        else:
            c = membre(canvas, h, cheville, j["longueur"], j["epaisseur"], c_j, contour=4.5, sens=-1)
            if bas == "short":
                a, c2, b = _sous_courbe(h, c, cheville, j["longueur_bas"])
                _trait_quad(canvas, a, c2, b, j["epaisseur"] * 1.55, assombrir(j["couleur_bas"], sombre), contour=4)
        nu = cote == "av" and etat["claquette_perdue"] > 0.5
        _pied(canvas, f, cheville, assombrir(peau, sombre), nu=nu)
    if bas in ("short", "pantalon"):
        hy = sq["hanche"][1]
        lb = f["corps"]["largeur_bas"]
        taille = skia.Path().addRRect(skia.RRect.MakeRectXY(
            skia.Rect(-lb * 0.46, hy - 18, lb * 0.46, hy + j["epaisseur"] * 0.7), 14, 14))
        forme_eclairee(canvas, taille, j["couleur_bas"], contour=4)


def _bras(canvas, f, sq, cote, peau, t, etat):
    b = f["bras"]
    epaule, main = sq["epaules"][cote], sq["mains"][cote]
    sombre = 0.16 if cote == "ar" else 0.0
    sens = -1 if cote == "av" else 1
    c = coude(epaule, main, b["longueur"], sens)
    _trait_quad(canvas, epaule, c, main, b["epaisseur"], assombrir(peau, sombre), contour=4.2)
    corps = f["corps"]
    if corps["habit"] == "boubou":
        a, c2, fin = _sous_courbe(epaule, c, main, b["manche"])
        shader = motif_wax(corps["wax"], 0.9, f.get("graine", 0))
        _trait_quad(canvas, a, c2, fin, b["epaisseur"] * 2.5, assombrir(corps["couleur"], sombre), contour=4,
                    shader=shader)
    elif b["manche"] > 0:
        a, c2, fin = _sous_courbe(epaule, c, main, b["manche"])
        _trait_quad(canvas, a, c2, fin, b["epaisseur"] * 1.5, assombrir(corps["couleur"], sombre), contour=4)
    r = b["epaisseur"] * 0.68
    poing = _ovale(main[0], main[1], r, r * 0.92)
    forme_eclairee(canvas, poing, assombrir(peau, sombre), contour=3.8)
    pouce = _ovale(main[0] + r * 0.55, main[1] - r * 0.45, r * 0.42, r * 0.32)
    forme_eclairee(canvas, pouce, assombrir(peau, sombre), contour=3.0, ombre=0.1)


def _corps(canvas, f, sq, etat, t):
    c = f["corps"]
    hy, ey = sq["hanche"][1], sq["epaule_y"]
    lh, lb = c["largeur_haut"], c["largeur_bas"]
    habit = c["habit"]
    p = skia.Path()
    if habit == "boubou":
        bas = -10.0
        houle = -etat["trainee"] * 0.05 + math.sin(t * 2.2 + 1) * 4 + 18 * etat["foulee"] * math.sin(etat["marche"])
        amp = c["ampleur"] / 2
        p.moveTo(-lh * 0.5, ey + 6)
        p.quadTo(-lh * 0.55, ey - 8, 0, ey - 10)
        p.quadTo(lh * 0.55, ey - 8, lh * 0.5, ey + 6)
        p.cubicTo(lh * 0.62, hy, amp * 0.85 + houle, bas - 40, amp + houle, bas)
        p.quadTo(houle * 0.5, bas + 14, -amp + houle, bas)
        p.cubicTo(-amp * 0.85 + houle, bas - 40, -lh * 0.62, hy, -lh * 0.5, ey + 6)
        p.close()
        forme_eclairee(canvas, p, c["couleur"], contour=4.5, shader=motif_wax(c["wax"], 1.0, f.get("graine", 0)))
        col = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=7, Color=teinte(c["col"]),
                         StrokeCap=skia.Paint.kRound_Cap)
        v = skia.Path()
        v.moveTo(-lh * 0.26, ey - 6)
        v.quadTo(0, ey + 46, lh * 0.26, ey - 6)
        canvas.drawPath(v, col)
        return
    bas = hy + c["longueur_habit"]
    ventre = c["ventre"]
    p.moveTo(-lh * 0.5, ey + 10)
    p.quadTo(-lh * 0.5, ey - 6, -lh * 0.3, ey - 8)
    p.lineTo(lh * 0.3, ey - 8)
    p.quadTo(lh * 0.5, ey - 6, lh * 0.5, ey + 10)
    mid = ey + (bas - ey) * 0.62
    p.cubicTo(lh * 0.52 + ventre * lb * 0.25, ey + (bas - ey) * 0.3, lb * 0.5 + ventre * lb * 0.12, mid,
              lb * 0.5, bas - 14)
    p.quadTo(lb * 0.48, bas + 4, lb * 0.3, bas + 4)
    p.lineTo(-lb * 0.3, bas + 4)
    p.quadTo(-lb * 0.48, bas + 4, -lb * 0.5, bas - 14)
    p.cubicTo(-lb * 0.5 - ventre * lb * 0.12, mid, -lh * 0.52 - ventre * lb * 0.25, ey + (bas - ey) * 0.3,
              -lh * 0.5, ey + 10)
    p.close()
    forme_eclairee(canvas, p, c["couleur"], contour=4.8)
    if habit == "maillot":
        canvas.save()
        canvas.clipPath(p, skia.ClipOp.kIntersect, True)
        r = skia.Paint(AntiAlias=True, Color=teinte(c["rayures"], 0.95))
        for sx in (-1, 1):
            canvas.drawRect(skia.Rect(sx * lb * 0.5 - 13, ey, sx * lb * 0.5 + 13, bas + 10), r)
        canvas.drawRect(skia.Rect(-lb, bas - 14, lb, bas - 6), skia.Paint(Color=teinte(assombrir(c["couleur"], 0.25))))
        canvas.restore()
        col = skia.Path()
        col.moveTo(-lh * 0.22, ey - 8)
        col.quadTo(0, ey + 30, lh * 0.22, ey - 8)
        col.quadTo(0, ey + 8, -lh * 0.22, ey - 8)
        forme_eclairee(canvas, col, c["col"], contour=3, ombre=0.15)
    elif habit == "tablier":
        tab = skia.Path()
        top = ey + (bas - ey) * 0.18
        tab.moveTo(-lh * 0.24, top)
        tab.lineTo(lh * 0.24, top)
        tab.cubicTo(lb * 0.36, top + 40, lb * 0.4, bas - 40, lb * 0.34, bas - 2)
        tab.lineTo(-lb * 0.34, bas - 2)
        tab.cubicTo(-lb * 0.4, bas - 40, -lb * 0.36, top + 40, -lh * 0.24, top)
        tab.close()
        forme_eclairee(canvas, tab, c["tablier"], contour=3.5, ombre=0.22)
        poche = skia.Path().addRRect(skia.RRect.MakeRectXY(
            skia.Rect(-lb * 0.16, bas - 92, lb * 0.16, bas - 44), 10, 10))
        forme_eclairee(canvas, poche, assombrir(c["tablier"], 0.08), contour=3, ombre=0.12, reflet=0)
        bretelle = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=6,
                              Color=teinte(assombrir(c["tablier"], 0.12)))
        canvas.drawLine(-lh * 0.22, top, -lh * 0.12, ey - 6, bretelle)
        canvas.drawLine(lh * 0.22, top, lh * 0.12, ey - 6, bretelle)


def _oeil(canvas, f, cx, cy, erx, ery, etat, ouvert, peau, tourne, cote_loin):
    v = f["visage"]
    jaillis = etat["yeux_jaillis"]
    s = (1 + max(0.0, ouvert - 1) * 0.9) * (1 + 0.9 * jaillis)
    rx, ry = erx * s * (0.82 if cote_loin else 1.0), ery * s
    cy = cy - jaillis * ery * 0.6
    if ouvert < 0.12:
        trait = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=4.5,
                           StrokeCap=skia.Paint.kRound_Cap, Color=teinte(CONTOUR))
        l = skia.Path()
        l.moveTo(cx - rx, cy)
        courbe = -ry * 0.7 if etat["sourire"] > 0.3 else ry * 0.25
        l.quadTo(cx, cy + courbe, cx + rx, cy)
        canvas.drawPath(l, trait)
        return
    blanc = _ovale(cx, cy, rx, ry)
    forme_eclairee(canvas, blanc, "#FBF8F2", contour=3.4, ombre=0.12, reflet=0)
    canvas.save()
    canvas.clipPath(blanc, skia.ClipOp.kIntersect, True)
    rg = etat["regard"]
    px = cx + max(-1.0, min(1.0, rg[0] + tourne * 0.3)) * rx * 0.42
    py = cy + max(-1.0, min(1.0, rg[1])) * ry * 0.4
    r = v["pupille"] * etat["pupille"] * s * (0.85 if cote_loin else 1.0)
    canvas.drawCircle(px, py, r * 1.38, skia.Paint(AntiAlias=True, Color=teinte("#5A3018")))
    canvas.drawCircle(px, py, r, skia.Paint(AntiAlias=True, Color=teinte("#140B07")))
    canvas.drawCircle(px - r * 0.42, py - r * 0.45, r * 0.42, skia.Paint(AntiAlias=True, Color=teinte("#FFFFFF")))
    canvas.drawCircle(px + r * 0.5, py + r * 0.45, r * 0.18, skia.Paint(AntiAlias=True, Color=teinte("#FFFFFF", 0.9)))
    if ouvert < 1.0:
        bas_paupiere = cy - ry + 2 * ry * (1 - ouvert)
        paup = skia.Path().addRect(skia.Rect(cx - rx - 4, cy - ry - 4, cx + rx + 4, bas_paupiere))
        forme_eclairee(canvas, paup, assombrir(peau, 0.05), contour=0, ombre=0.0, reflet=0.0)
        canvas.drawLine(cx - rx, bas_paupiere, cx + rx, bas_paupiere,
                        skia.Paint(AntiAlias=True, StrokeWidth=3.6, Color=teinte(CONTOUR)))
    canvas.restore()
    canvas.drawPath(blanc, skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=3.4,
                                      Color=teinte(CONTOUR)))
    if v.get("cils"):
        cil = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=3,
                         StrokeCap=skia.Paint.kRound_Cap, Color=teinte(CONTOUR))
        haut = cy - ry * min(1.0, ouvert)
        for k, dx in enumerate((0.35, 0.65, 0.9)):
            canvas.drawLine(cx + rx * dx, haut + ry * 0.12 * k, cx + rx * dx + 7, haut - 6 + ry * 0.1 * k, cil)


def _sourcil(canvas, f, cx, cy, erx, etat, gauche):
    v = f["visage"]
    angle = etat["froncer"] * 0.42 * (1 if gauche else -1)
    lg = erx * 1.45
    dx, dy = math.cos(angle) * lg / 2, math.sin(angle) * lg / 2
    p = skia.Path()
    p.moveTo(cx - dx, cy - dy)
    p.quadTo(cx, cy - 5 - abs(etat["sourcils"]) * 2, cx + dx, cy + dy)
    canvas.drawPath(p, skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=v["sourcils"],
                                  StrokeCap=skia.Paint.kRound_Cap, Color=teinte(v["couleur_sourcils"])))


def _bouche(canvas, f, mx, my, etat, peau):
    v = f["visage"]
    sou, ouv = etat["sourire"], etat["bouche"]
    W = v["bouche"] * (0.9 + 0.25 * max(0.0, sou))
    coin_y = my - sou * W * 0.18
    gauche, droite = (mx - W / 2, coin_y), (mx + W / 2, coin_y)
    couleur_levres = v.get("levres") or CONTOUR
    if ouv < 0.06:
        p = skia.Path()
        p.moveTo(*gauche)
        p.quadTo(mx, my + sou * W * 0.32, droite[0], droite[1])
        canvas.drawPath(p, skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=4.6,
                                      StrokeCap=skia.Paint.kRound_Cap, Color=teinte(couleur_levres)))
        return
    h = ouv * W * 0.75
    p = skia.Path()
    p.moveTo(*gauche)
    p.quadTo(mx, my - h * 0.18 + sou * W * 0.12, droite[0], droite[1])
    p.quadTo(mx, my + h + sou * W * 0.28, gauche[0], gauche[1])
    p.close()
    canvas.drawPath(p, skia.Paint(AntiAlias=True, Color=teinte("#4A1316")))
    canvas.save()
    canvas.clipPath(p, skia.ClipOp.kIntersect, True)
    canvas.drawOval(skia.Rect(mx - W * 0.32, my + h * 0.45, mx + W * 0.32, my + h * 1.25),
                    skia.Paint(AntiAlias=True, Color=teinte("#E06A6A")))
    if etat["dents"] > 0.5:
        haut = my - h * 0.2
        canvas.drawRect(skia.Rect(mx - W, haut - 10, mx + W, haut + max(7.0, h * 0.3)),
                        skia.Paint(AntiAlias=True, Color=teinte("#FFFDF5")))
        if v.get("dents_bonheur"):
            canvas.drawRect(skia.Rect(mx - 2.6, haut - 10, mx + 2.6, haut + max(7.0, h * 0.3)),
                            skia.Paint(AntiAlias=True, Color=teinte("#4A1316")))
    canvas.restore()
    canvas.drawPath(p, skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=4,
                                  StrokeJoin=skia.Paint.kRound_Join, Color=teinte(couleur_levres)))


def _tete_chemin(rx, ry, machoire):
    k = 0.5523
    rb = ry * machoire
    p = skia.Path()
    p.moveTo(0, -ry)
    p.cubicTo(rx * k, -ry, rx, -ry * k, rx, 0)
    p.cubicTo(rx, rb * k, rx * 0.96 * k, rb, 0, rb)
    p.cubicTo(-rx * 0.96 * k, rb, -rx, rb * k, -rx, 0)
    p.cubicTo(-rx, -ry * k, -rx * k, -ry, 0, -ry)
    p.close()
    return p


def _foulard(canvas, f, rx, ry, etat, t):
    cf = f["cheveux"]["foulard"]
    u = etat["foulard"]
    shader = motif_wax(cf, 0.8, f.get("graine", 0) + 1)
    if u > 0.02:
        queue = skia.Path()
        lg = 520 * u
        n = 18
        haut, bas = [], []
        for i in range(n + 1):
            s = i / n
            x = -rx * 0.2 - s * lg
            ondule = math.sin(t * 9 - s * 7) * 26 * s * u - s * 40
            larg = 30 * (1 - 0.5 * s)
            haut.append((x, -ry * 1.9 + ondule - larg))
            bas.append((x, -ry * 1.9 + ondule + larg))
        queue.moveTo(*haut[0])
        for pt in haut[1:]:
            queue.lineTo(*pt)
        for pt in reversed(bas):
            queue.lineTo(*pt)
        queue.close()
        forme_eclairee(canvas, queue, cf[0], contour=4, shader=shader)
    hf = 150 * (1 + 0.55 * u)
    canvas.save()
    canvas.rotate(math.degrees(math.sin(t * 8) * 0.05 * u - 0.08))
    p = skia.Path()
    base = -ry * 0.32
    p.moveTo(-rx * 1.08, base)
    p.cubicTo(-rx * 1.35, base - hf * 0.6, -rx * 0.55, base - hf * 1.05, rx * 0.15, base - hf)
    p.cubicTo(rx * 0.95, base - hf * 0.92, rx * 1.3, base - hf * 0.45, rx * 1.08, base)
    p.quadTo(0, base + ry * 0.2, -rx * 1.08, base)
    p.close()
    forme_eclairee(canvas, p, cf[0], contour=4.5, shader=shader)
    pli = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=3.5,
                     Color=teinte(assombrir(cf[0], 0.45), 0.8), StrokeCap=skia.Paint.kRound_Cap)
    for k in range(3):
        y = base - hf * (0.25 + 0.22 * k)
        q = skia.Path()
        q.moveTo(-rx * (0.95 - 0.1 * k), y + 10)
        q.quadTo(0, y - 18, rx * (0.95 - 0.12 * k), y + 6)
        canvas.drawPath(q, pli)
    canvas.restore()


def _tete(canvas, f, sq, etat, t, peau):
    tt = f["tete"]
    rx, ry = tt["rx"], tt["ry"]
    v = f["visage"]
    tourne = etat["tourne"]
    canvas.save()
    canvas.translate(0, sq["cou_haut"])
    canvas.rotate(math.degrees(etat["tete_incline"]))
    canvas.translate(0, sq["tete"][1] - sq["cou_haut"])
    cou = skia.Path().addRRect(skia.RRect.MakeRectXY(
        skia.Rect(-rx * 0.28, 0, rx * 0.28, sq["cou_haut"] - sq["tete"][1] + 14), 10, 10))
    forme_eclairee(canvas, cou, assombrir(peau, 0.12), contour=4, ombre=0.2)
    for cote in (-1, 1):
        ox = cote * rx * 0.94 + tourne * rx * (0.32 if cote < 0 else 0.08)
        oreille = _ovale(ox, ry * 0.05, rx * 0.17, ry * 0.24)
        forme_eclairee(canvas, oreille, peau, contour=3.8)
        if "boucles" in f["accessoires"]:
            canvas.drawCircle(ox, ry * 0.32, 13, skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style,
                                                             StrokeWidth=4.5, Color=teinte("#F2B705")))
    tete = _tete_chemin(rx, ry, tt["machoire"])
    style = f["cheveux"]["style"]
    forme_eclairee(canvas, tete, peau, contour=5, reflet=0.38 if style == "chauve" else 0.22)
    if style == "meche":
        canvas.save()
        canvas.clipPath(tete, skia.ClipOp.kIntersect, True)
        cheveux = _ovale(-tourne * rx * 0.12, -ry * 0.62, rx * 1.1, ry * 0.62)
        forme_eclairee(canvas, cheveux, f["cheveux"]["couleur"], contour=0, ombre=0.25, reflet=0.1)
        canvas.restore()
        angle = -etat["trainee"] * 0.0012 + math.sin(t * 3.1) * 0.06
        canvas.save()
        canvas.translate(rx * 0.05, -ry * 0.96)
        canvas.rotate(math.degrees(max(-0.7, min(0.7, angle))))
        m = skia.Path()
        m.moveTo(-20, 8)
        m.cubicTo(-28, -30, 6, -58, 34, -50)
        m.cubicTo(14, -40, 8, -20, 18, 6)
        m.close()
        forme_eclairee(canvas, m, f["cheveux"]["couleur"], contour=4, ombre=0.2, reflet=0.3)
        canvas.restore()
    elif style == "chauve":
        canvas.drawOval(skia.Rect(-rx * 0.55, -ry * 0.9, -rx * 0.1, -ry * 0.62),
                        skia.Paint(AntiAlias=True, Color=teinte("#FFFFFF", 0.32)))
    fx = tourne * rx * 0.26
    ey = -ry * 0.05
    erx, ery = v["yeux_rx"], v["yeux_ry"]
    ouvert = etat["yeux"]
    if ouvert <= 1.25:
        ouvert *= _clignement(t, f.get("graine", 0))
    yeux = ((fx - v["yeux_ecart"] * (1 - 0.12 * tourne), False), (fx + v["yeux_ecart"] * (1 - 0.32 * tourne), True))
    for cx, loin in yeux:
        _oeil(canvas, f, cx, ey, erx, ery, etat, ouvert, peau, tourne, loin)
    s_y = ey - ery * (1 + max(0.0, ouvert - 1) * 0.9) * 1.18 - 7 - etat["sourcils"] * ery * 0.5
    for (cx, loin), gauche in zip(yeux, (True, False)):
        _sourcil(canvas, f, cx, s_y - etat["yeux_jaillis"] * ery, erx, etat, gauche)
    nx, ny = fx + tourne * rx * 0.2, ry * 0.2
    nez = _ovale(nx, ny, v["nez"] * (1 + 0.25 * tourne), v["nez"] * 0.78)
    forme_eclairee(canvas, nez, assombrir(peau, PEAU_SOMBRE), contour=3.2, ombre=0.2, reflet=0.3)
    if etat["sourire"] > 0.4:
        a = 0.24 * (etat["sourire"] - 0.4) / 0.6
        for cx, _ in yeux:
            canvas.drawOval(skia.Rect(cx - 16, ry * 0.26, cx + 16, ry * 0.4),
                            skia.Paint(AntiAlias=True, Color=teinte("#E0705A", a)))
    _bouche(canvas, f, fx + tourne * rx * 0.06, ry * 0.5 * tt["machoire"], etat, peau)
    if "moustache" in f["accessoires"]:
        mo = skia.Path()
        mx, my = nx, ny + v["nez"] * 0.8
        mo.moveTo(mx, my)
        mo.cubicTo(mx + 30, my - 8, mx + 56, my + 6, mx + 50, my + 22)
        mo.cubicTo(mx + 34, my + 14, mx + 14, my + 18, mx, my + 10)
        mo.cubicTo(mx - 14, my + 18, mx - 34, my + 14, mx - 50, my + 22)
        mo.cubicTo(mx - 56, my + 6, mx - 30, my - 8, mx, my)
        mo.close()
        forme_eclairee(canvas, mo, f["cheveux"]["couleur"], contour=3.5, ombre=0.2, reflet=0.25)
    if "crayon" in f["accessoires"]:
        canvas.save()
        canvas.translate(-rx * 0.94 + tourne * rx * 0.32, -ry * 0.25)
        canvas.rotate(-58)
        cr = skia.Path().addRRect(skia.RRect.MakeRectXY(skia.Rect(-48, -6, 34, 6), 3, 3))
        forme_eclairee(canvas, cr, "#FFC93C", contour=2.8, ombre=0.15)
        canvas.drawRect(skia.Rect(26, -6, 36, 6), skia.Paint(AntiAlias=True, Color=teinte("#F48FB1")))
        canvas.restore()
    if etat["rouge"] > 0.01:
        canvas.save()
        canvas.clipPath(tete, skia.ClipOp.kIntersect, True)
        canvas.drawRect(skia.Rect(-rx * 1.2, -ry * 1.2, rx * 1.2, ry * 1.3),
                        skia.Paint(Color=teinte("#E53935", 0.42 * etat["rouge"])))
        canvas.restore()
        if etat["rouge"] > 0.8:
            for cote in (-1, 1):
                for k in range(3):
                    ph = (t * 1.6 + k / 3) % 1.0
                    canvas.drawCircle(cote * (rx * 1.05 + ph * 30), -ph * 120, 10 + ph * 18,
                                      skia.Paint(AntiAlias=True, Color=teinte("#FFFFFF", 0.55 * (1 - ph))))
    if etat["sueur"] > 0.01:
        ph = (t * 0.6) % 1.0
        gx, gy = fx + rx * 0.72, -ry * 0.5 + ph * ry * 0.5
        goutte = skia.Path()
        goutte.moveTo(gx, gy - 18)
        goutte.quadTo(gx + 12, gy, gx, gy + 6)
        goutte.quadTo(gx - 12, gy, gx, gy - 18)
        forme_eclairee(canvas, goutte, "#8FD3FF", contour=2.6, ombre=0.1, reflet=0.5)
    if style == "foulard":
        _foulard(canvas, f, rx, ry, etat, t)
    canvas.restore()


def _gouttes(canvas, etat, hauteur_perso, t):
    if etat["mouille"] < 0.02:
        return
    p = skia.Paint(AntiAlias=True, Color=teinte("#7EC8F5", 0.85 * etat["mouille"]))
    for k in range(7):
        ph = (t * 1.3 + k * 0.137) % 1.0
        x = (k - 3) * 22
        y = -hauteur_perso * (0.85 - ph * 0.85)
        canvas.drawOval(skia.Rect(x - 4, y - 7, x + 4, y + 7), p)


def _dessiner_humain(canvas, f, etat, t):
    peau = f["peau"]
    lb = f["corps"]["largeur_bas"]
    vol = min(1.0, etat["saut"] / 300.0)
    ombre_sol(canvas, etat["x"], etat["y"], lb * 1.35 * (1 - 0.55 * vol), 0.30 * (1 - 0.6 * vol))
    canvas.save()
    _transformer(canvas, etat)
    sq = _squelette(f, etat, t)
    _bras(canvas, f, sq, "ar", peau, t, etat)
    _jambes(canvas, f, sq, etat, peau)
    _corps(canvas, f, sq, etat, t)
    _tete(canvas, f, sq, etat, t, peau)
    _bras(canvas, f, sq, "av", peau, t, etat)
    _gouttes(canvas, etat, hauteur(f), t)
    canvas.restore()


# --- le mouton -----------------------------------------------------------------------------------------------------

def _laine(cx, cy, lg, ht, graine):
    p = _ovale(cx, cy, lg * 0.5, ht * 0.5)
    n = 13
    for i in range(n):
        a = 2 * math.pi * i / n
        r = 0.2 * ht + ((graine * 7 + i * 13) % 5) * 2.5
        bx, by = cx + math.cos(a) * lg * 0.45, cy + math.sin(a) * ht * 0.42
        p = skia.Op(p, _ovale(bx, by, r * 1.15, r), skia.PathOp.kUnion_PathOp)
    return p


def _corne(canvas, cx, cy, taille, couleur):
    p = skia.Path()
    n = 40
    for i in range(n + 1):
        s = i / n
        a = -0.6 + s * 4.6
        r = taille * (1 - 0.72 * s)
        x, y = cx + math.cos(a) * r - taille * 0.2, cy + math.sin(a) * r
        if i == 0:
            p.moveTo(x, y)
        else:
            p.lineTo(x, y)
    pt = skia.Paint(Style=skia.Paint.kStroke_Style, StrokeWidth=taille * 0.42, StrokeCap=skia.Paint.kRound_Cap,
                    StrokeJoin=skia.Paint.kRound_Join)
    plein = skia.Path()
    pt.getFillPath(p, plein)
    forme_eclairee(canvas, plein, couleur, contour=3.5, ombre=0.3, reflet=0.25)
    stries = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=2.2,
                        Color=teinte(assombrir(couleur, 0.35), 0.7))
    for i in range(3, n - 4, 4):
        s = i / n
        a = -0.6 + s * 4.6
        r = taille * (1 - 0.72 * s)
        x, y = cx + math.cos(a) * r - taille * 0.2, cy + math.sin(a) * r
        w = taille * 0.2
        canvas.drawLine(x - math.cos(a) * w, y - math.sin(a) * w, x + math.cos(a) * w, y + math.sin(a) * w, stries)


def _dessiner_mouton(canvas, f, etat, t):
    c = f["corps"]
    lg, ht, P = c["longueur"], c["hauteur"], c["pattes"]
    vol = min(1.0, etat["saut"] / 300.0)
    ombre_sol(canvas, etat["x"], etat["y"], lg * 1.1 * (1 - 0.5 * vol), 0.3 * (1 - 0.6 * vol))
    canvas.save()
    _transformer(canvas, etat)
    phi, foulee, course = etat["marche"], etat["foulee"], etat["course"]
    pas = P * 0.5 * foulee * (1 + 0.8 * course)
    leve = P * 0.25 * foulee * (1 + course)
    rebond = 8 * foulee * abs(math.sin(phi))
    cy = -P - ht * 0.45 - rebond
    pattes = (("ar_loin", -lg * 0.30 + 14, 0.0, True), ("av_loin", lg * 0.30 + 14, math.pi, True),
              ("ar", -lg * 0.30, math.pi, False), ("av", lg * 0.30, 0.0, False))
    def patte(x0, dephase, loin):
        ph = phi + dephase
        fx = x0 + pas * math.sin(ph)
        fy = -leve * max(0.0, math.cos(ph))
        couleur = assombrir(f["visage"], 0.25 if loin else 0.0)
        membre(canvas, (x0, cy + ht * 0.3), (fx, fy - 10), P * 0.98, 17, couleur, contour=3.6, sens=-1)
        sabot = skia.Path().addRRect(skia.RRect.MakeRectXY(skia.Rect(fx - 11, fy - 16, fx + 13, fy + 1), 5, 5))
        forme_eclairee(canvas, sabot, f["sabots"], contour=3, ombre=0.1)
    for _, x0, dph, loin in pattes[:2]:
        patte(x0, dph, loin)
    queue = _ovale(-lg * 0.52, cy - ht * 0.12 + math.sin(t * 5) * 3, 26, 22)
    forme_eclairee(canvas, queue, f["laine"], contour=4)
    corps = _laine(0, cy, lg, ht, f.get("graine", 0))
    forme_eclairee(canvas, corps, f["laine"], contour=5, ombre=0.26, reflet=0.3)
    for _, x0, dph, loin in pattes[2:]:
        patte(x0, dph, loin)
    baisse = etat["tete_baisse"]
    canvas.save()
    canvas.translate(lg * 0.38, cy - ht * 0.22)
    canvas.rotate(math.degrees(0.15 + baisse * 0.85))
    oreille = skia.Path()
    oreille.moveTo(8, -40)
    oreille.quadTo(-38, -30 + baisse * 20, -44, -6 + baisse * 10)
    oreille.quadTo(-20, -22, 8, -28)
    forme_eclairee(canvas, oreille, f["visage"], contour=3.5)
    visage = skia.Path()
    visage.moveTo(0, -62)
    visage.cubicTo(44, -76, 92, -50, 104, -6)
    visage.cubicTo(112, 22, 92, 40, 70, 38)
    visage.cubicTo(40, 36, 6, 22, -6, -6)
    visage.cubicTo(-12, -30, -10, -54, 0, -62)
    visage.close()
    forme_eclairee(canvas, visage, f["visage"], contour=4.5, reflet=0.3)
    toupet = _laine(10, -58, 64, 34, f.get("graine", 0) + 3)
    forme_eclairee(canvas, toupet, f["laine"], contour=3.5, ombre=0.2)
    _corne(canvas, -6, -42, 40, f["cornes"])
    yeux = etat["yeux"] * (_clignement(t, f.get("graine", 0)) if etat["yeux"] <= 1.25 else 1.0)
    ox, oy = 52, -30
    if yeux < 0.12:
        canvas.drawLine(ox - 12, oy, ox + 12, oy, skia.Paint(AntiAlias=True, StrokeWidth=4, Color=teinte(CONTOUR)))
    else:
        blanc = _ovale(ox, oy, 13, 13 * min(1.4, max(0.35, yeux)))
        forme_eclairee(canvas, blanc, "#FFF7E6", contour=3, ombre=0.1, reflet=0)
        canvas.save()
        canvas.clipPath(blanc, skia.ClipOp.kIntersect, True)
        canvas.drawCircle(ox + 4 + etat["regard"][0] * 4, oy + 1, 6.5, skia.Paint(AntiAlias=True, Color=teinte("#1A0E08")))
        canvas.drawCircle(ox + 1.5, oy - 2, 2.4, skia.Paint(AntiAlias=True, Color=teinte("#FFFFFF")))
        if yeux < 1.0:
            canvas.drawRect(skia.Rect(ox - 16, oy - 16, ox + 16, oy - 13 + 26 * (1 - yeux)),
                            skia.Paint(AntiAlias=True, Color=teinte(assombrir(f["visage"], 0.1))))
        canvas.restore()
        sourcil = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=5,
                             StrokeCap=skia.Paint.kRound_Cap, Color=teinte("#140C08"))
        angle = 0.35 * etat["colere"]
        canvas.drawLine(ox - 14, oy - 16 - 6 * angle, ox + 14, oy - 16 + 8 * angle, sourcil)
    canvas.drawOval(skia.Rect(96, 4, 104, 12), skia.Paint(AntiAlias=True, Color=teinte("#140C08")))
    bouche = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=3.5,
                        StrokeCap=skia.Paint.kRound_Cap, Color=teinte("#140C08"))
    if etat["bouche"] > 0.05:
        b = _ovale(86, 26, 13, 8 + 12 * etat["bouche"])
        canvas.drawPath(b, skia.Paint(AntiAlias=True, Color=teinte("#4A1316")))
        canvas.drawPath(b, bouche)
    else:
        m = skia.Path()
        m.moveTo(72, 26)
        m.quadTo(86, 32, 98, 24)
        canvas.drawPath(m, bouche)
    canvas.restore()
    canvas.restore()


def dessiner(canvas, fiche: dict, etat: dict, t: float = 0.0):
    if etat.get("visible", 1.0) < 0.5:
        return
    if fiche["type"] == "mouton":
        _dessiner_mouton(canvas, fiche, etat, t)
    else:
        _dessiner_humain(canvas, fiche, etat, t)
