"""Montage au DESIGN DE LA CHAÎNE (vidéo de référence « Épisode 1 · Koffi le faux riche », mesures reprises du code de la
Fabrique : marque.py, cartes_fx.py, compose.py, branche claude/relaxed-noether-svkgiu), porté de 576×1024 à 1080×1920 :
  - bandes NETTES (aucun flou) : dégradé nuit + motif losange discret, filets néon cyan / rose autour de la scène ;
  - haut : accroche « ATTENDS LE DERNIER… C'EST GÂTÉ ! », pastille « SKETCH k/n » + titre jaune, « 😱 LE CHOC ! » puis
    « 🤣 MDR ! » sur chaque chute, carte de fin (logo, nom, @pseudo, « ABONNE-TOI POUR LA SUITE ») ;
  - bandeau qui défile (logo, @pseudo, ABONNE-TOI, nom, PARTAGE À TA FAMILLE) entre deux filets néon ;
  - scène 5:4 ; entre deux sketchs, carte sur la dernière image assombrie : soleil de rayons, émoji qui rit, ruban incliné
    avec le titre du sketch suivant et sa pastille ;
  - bas : sous-titres karaoké (mot prononcé dans une étiquette de la couleur du personnage, mots-clés en jaune, émoji 3D
    qui jaillit après le mot) ; à la fin, le vote « TON SKETCH PRÉFÉRÉ ? ».
Son : dialogues normalisés, un rire après chaque chute, un souffle à chaque carte, musique baissée sous les voix.
Le logo et le nom de la chaîne sont lus dans prive/ (avatar.jpg, marque.json), jamais dans le dépôt public.

  python3 chaine.py NOM ids…        → sortie/compilations/NOM.mp4
"""
import json
import math
import re
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import generer  # noqa: E402
import monter  # noqa: E402

K = 1080 / 576                      # mesures de la référence (576 × 1024) → 1080 × 1920


def k(v):
    return int(round(v * K))


W, H, IPS = 1080, 1920, 30
Y0, CH = k(282), k(460)
Y1 = Y0 + CH
SG, SD = k(32), W - k(64)           # zone sûre TikTok (boutons à droite)
CX = (SG + SD) / 2
CYAN, ROSE, JAUNE, VIOLET, OR = (37, 244, 238), (254, 44, 85), (255, 210, 63), (120, 40, 200), (255, 190, 40)
NUIT_H, NUIT_B = (16, 9, 34), (36, 16, 58)
ACCROCHE_S, REACTION_S, T_CARTE, FIN_S = 2.5, 2.4, 1.4, 2.6
MARGE_CHUTE = 2.6                   # temps mort coupé : le clip s'arrête au plus 2,6 s après la dernière réplique
QUEUE = FIN_S + 1.0                 # dernière image tenue : vote puis carte de fin
Y_BANDEAU, H_BANDEAU, PAS_BANDEAU = k(214), k(50), 4      # 4 px par image à 30 i/s : défilement sans sous-pixel
COUL_PERSO = [(255, 128, 190), (255, 200, 80), (110, 225, 150), (120, 180, 255), (90, 225, 230), (255, 160, 100)]
SAUMON, JAUNE_MOT, ENCRE = (255, 120, 110), (255, 222, 110), (28, 14, 40)
F_SOUS = k(40)
LARGEUR_SOUS = k(450)
EMO_W = k(50)
POLICE = ICI / "habillage" / "Montserrat.ttf"
EMOJIS = ICI / "habillage" / "emojis"
PRIVE = ICI / "prive"
ENC_V = ["-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p"]


def marque():
    try:
        m = json.loads((PRIVE / "marque.json").read_text())
    except Exception:
        m = {}
    return m.get("nom", "ma chaîne"), m.get("pseudo", "@ma_chaine")


NOM, PSEUDO = marque()


@lru_cache(maxsize=None)
def police(sz, style=b"Black"):
    f = ImageFont.truetype(str(POLICE), max(8, int(sz)))
    try:
        f.set_variation_by_name(style)
    except Exception:
        pass
    return f


@lru_cache(maxsize=None)
def emoji(nom, d):
    return Image.open(EMOJIS / f"{nom}.png").convert("RGBA").resize((max(1, d), max(1, d)), Image.LANCZOS)


def pop(u):
    """échelle élastique 0 → 1,25 → 0,94 → 1 en 0,4 s (cartes_fx._pop)."""
    if u <= 0:
        return 0.0
    if u < 0.18:
        return 1.25 * (1 - (1 - u / 0.18) ** 3)
    if u < 0.30:
        x = (u - 0.18) / 0.12
        return 1.25 - 0.31 * x * x * (3 - 2 * x)
    if u < 0.40:
        x = (u - 0.30) / 0.10
        return 0.94 + 0.06 * x * x * (3 - 2 * x)
    return 1.0


def texte_double(dr, xy, txt, f, couleur=(255, 255, 255), dec=k(2), ancre="la"):
    """lettres doublées cyan / rose décalées, puis le texte plein (effet des titres de la plateforme)."""
    x, y = xy
    dr.text((x - dec, y - dec), txt, font=f, fill=CYAN + (255,), anchor=ancre)
    dr.text((x + dec, y + dec), txt, font=f, fill=ROSE + (255,), anchor=ancre)
    dr.text((x, y), txt, font=f, fill=tuple(couleur) + (255,), anchor=ancre)


@lru_cache(maxsize=None)
def logo(d):
    """photo de profil ronde dans un anneau dégradé cyan → rose."""
    s = 4
    D = d * s
    f = PRIVE / "avatar.jpg"
    if f.exists():
        im = Image.open(f).convert("RGB")
        c = min(im.size)
        im = im.crop(((im.width - c) // 2, (im.height - c) // 2, (im.width + c) // 2, (im.height + c) // 2))
    else:
        im = Image.new("RGB", (D, D), JAUNE)
        ImageDraw.Draw(im).text((D / 2, D / 2), NOM[:1].upper(), font=police(D * 0.6), fill=NUIT_H, anchor="mm")
    out = Image.new("RGBA", (D, D), (0, 0, 0, 0))
    yy, xx = np.mgrid[0:D, 0:D]
    a = np.clip((xx + yy) / (2.0 * D), 0, 1)[..., None]
    anneau = (np.array(CYAN) * (1 - a) + np.array(ROSE) * a).astype(np.uint8)
    m = Image.new("L", (D, D), 0)
    ImageDraw.Draw(m).ellipse((0, 0, D - 1, D - 1), fill=255)
    out.paste(Image.fromarray(anneau), (0, 0), m)
    e = int(D * 0.075)
    m2 = Image.new("L", (D, D), 0)
    ImageDraw.Draw(m2).ellipse((e, e, D - 1 - e, D - 1 - e), fill=255)
    out.paste(Image.new("RGB", (D, D), NUIT_H), (0, 0), m2)
    e2 = int(D * 0.11)
    ph = im.resize((D - 2 * e2, D - 2 * e2), Image.LANCZOS)
    m3 = Image.new("L", ph.size, 0)
    ImageDraw.Draw(m3).ellipse((0, 0, ph.width - 1, ph.height - 1), fill=255)
    out.paste(ph, (e2, e2), m3)
    return out.resize((d, d), Image.LANCZOS)


# ---------- fond et bandeau ----------

def fond():
    t = np.linspace(0, 1, H)[:, None, None]
    rgb = (np.array(NUIT_H) * (1 - t) + np.array(NUIT_B) * t) * np.ones((1, W, 1))
    yy, xx = np.mgrid[0:H, 0:W]
    per, demi = k(48), k(48) // 2
    losange = ((np.abs(((xx + yy) % per) - demi) < 1.5) | (np.abs(((xx - yy) % per) - demi) < 1.5)).astype(np.float32)[..., None]
    rgb = np.clip(rgb + losange * 9.0, 0, 255).astype(np.uint8)
    for y, c in ((Y0 - k(6), CYAN), (Y0 - k(3), ROSE), (Y1 + k(2), ROSE), (Y1 + k(5), CYAN)):
        rgb[y:y + k(2), :] = c
    im = Image.fromarray(rgb, "RGB")
    return im.crop((0, 0, W, Y0)).convert("RGBA"), im.crop((0, Y1, W, H)).convert("RGBA")


class Bandeau:
    def __init__(self):
        h = H_BANDEAU
        d = h - k(10)
        f, f2 = police(k(24)), police(k(18), b"Bold")
        motif = [("logo", None), ("t", PSEUDO), ("p", "•"), ("t2", "ABONNE-TOI"), ("p", "•"), ("logo", None),
                 ("t", NOM.upper()), ("p", "•"), ("t2", "PARTAGE À TA FAMILLE"), ("p", "•")]
        larg = [d + k(14) if c == "logo" else int((f if c == "t" else f2).getlength(v)) + k(22) for c, v in motif]
        self.periode = P = sum(larg)
        n = int(np.ceil((W + P) / P)) + 1
        self.bande = im = Image.new("RGBA", (P * n, h), (0, 0, 0, 0))
        dr = ImageDraw.Draw(im)
        x = 0
        for _ in range(n):
            for (c, v), lg in zip(motif, larg):
                if c == "logo":
                    im.alpha_composite(logo(d), (x + k(7), k(5)))
                elif c == "t":
                    texte_double(dr, (x + k(11), h / 2), v, f, ancre="lm")
                elif c == "t2":
                    dr.text((x + k(11), h / 2), v, font=f2, fill=JAUNE + (255,), anchor="lm")
                else:
                    dr.text((x + k(11), h / 2), v, font=f2, fill=ROSE + (255,), anchor="lm")
                x += lg
        self.fond = Image.new("RGBA", (W, h), NUIT_H + (215,))
        d2 = ImageDraw.Draw(self.fond)
        d2.rectangle((0, 0, W, k(2) - 1), fill=CYAN + (255,))
        d2.rectangle((0, h - k(2), W, h), fill=ROSE + (255,))

    def a(self, n_image):
        off = (n_image * PAS_BANDEAU) % self.periode
        out = self.fond.copy()
        out.alpha_composite(self.bande.crop((off, 0, off + W, H_BANDEAU)))
        return out


# ---------- bande du haut ----------

def lignes_titre(txt, f, largeur):
    L, cur = [], ""
    for w in txt.split():
        t = (cur + " " + w).strip()
        if f.getlength(t) <= largeur or not cur:
            cur = t
        else:
            L.append(cur)
            cur = w
    if cur:
        L.append(cur)
    return L


@lru_cache(maxsize=None)
def haut_titre(txt, rang, total):
    im = Image.new("RGBA", (W, Y0), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    larg = SD - SG
    for sz in (42, 38, 34, 30):
        f = police(k(sz))
        L = lignes_titre(txt, f, larg)
        if len(L) <= 2 and all(f.getlength(l) <= larg for l in L):
            break
    h = k(sz + 6)
    y = k(150) - (len(L) - 1) * h / 2
    for l in L:
        dr.text((CX + k(3), y + k(4)), l, font=f, fill=(0, 0, 0, 160), anchor="mm")
        dr.text((CX, y), l, font=f, fill=JAUNE + (255,), anchor="mm", stroke_width=k(5), stroke_fill=(0, 0, 0, 255))
        y += h
    fz = police(k(15), b"Bold")
    lab = f"SKETCH {rang}/{total}"
    lw = fz.getlength(lab) + k(24)
    y_p = k(96) - (len(L) - 1) * h / 2 - (k(12) if len(L) > 1 else 0)
    dr.rounded_rectangle((CX - lw / 2, y_p - k(12), CX + lw / 2, y_p + k(12)), radius=k(12), fill=(20, 12, 40, 235),
                         outline=JAUNE + (255,), width=k(2))
    dr.text((CX, y_p), lab, font=fz, fill=JAUNE + (255,), anchor="mm")
    return im


def haut_accroche(t):
    im = Image.new("RGBA", (W, Y0), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    p = pop(t)
    if p > 0.05:
        f1, f2 = police(k(30) * p), police(k(40) * p)
        dr.text((CX, k(112)), "ATTENDS LE DERNIER…", font=f1, fill=(255, 255, 255, 255), anchor="mm",
                stroke_width=k(4), stroke_fill=(0, 0, 0, 255))
        texte_double(dr, (CX - k(30), k(166)), "C'EST GÂTÉ !", f2, couleur=JAUNE, dec=k(3), ancre="mm")
        e = emoji("rire", max(8, int(k(64) * p)))
        im.alpha_composite(e, (int(CX - k(30) + f2.getlength("C'EST GÂTÉ !") / 2 + k(8)), int(k(166) - e.height / 2)))
    return im


def haut_reaction(u, rang):
    im = Image.new("RGBA", (W, Y0), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    choc = u < 1.0
    p = pop(u if choc else u - 1.0)
    nom = "choc" if choc else ("mdr" if rang % 2 else "rire")
    mot = "LE CHOC !" if choc else "MDR !"
    e = emoji(nom, max(8, int(k(96) * p)))
    f = police(k(44) * max(p, 0.01))
    larg = e.width + k(14) + f.getlength(mot)
    x0 = CX - larg / 2
    im.alpha_composite(e, (int(x0), int(k(150) - e.height / 2)))
    texte_double(dr, (x0 + e.width + k(14), k(150)), mot, f, couleur=JAUNE if choc else (255, 255, 255), dec=k(3), ancre="lm")
    return im


def haut_fin(a):
    im = Image.new("RGBA", (W, Y0), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    d = k(96 + 16 * a)
    im.alpha_composite(logo(d), (int(CX - d / 2), int(k(118) - d / 2)))
    texte_double(dr, (CX, k(196)), NOM.upper(), police(k(40)), dec=k(3), ancre="mm")
    dr.text((CX, k(236)), PSEUDO, font=police(k(22), b"Bold"), fill=(255, 255, 255, 235), anchor="mm")
    dr.text((CX, k(264)), "ABONNE-TOI POUR LA SUITE", font=police(k(16), b"Bold"), fill=JAUNE + (255,), anchor="mm")
    if a < 1:
        al = np.array(im)
        al[..., 3] = (al[..., 3] * a).astype(np.uint8)
        im = Image.fromarray(al)
    return im


# ---------- carte entre deux sketchs (sur la scène) ----------

def etoile(dr, x, y, r, a, coul):
    pts = [(x + (r if j % 2 == 0 else r * 0.28) * math.cos(j * math.pi / 4),
            y + (r if j % 2 == 0 else r * 0.28) * math.sin(j * math.pi / 4)) for j in range(8)]
    dr.polygon(pts, fill=coul + (int(255 * a),))


def carte(u, titre, rang, total):
    im = Image.new("RGBA", (W, CH), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    ex, ey, base, ty = W / 2, CH * 0.40, k(140), CH * 0.74
    s = pop(u)
    R = base * 0.5
    if s > 0:
        Rr, a0_ = R * 2.0 * min(1.0, s), u * 0.8
        for j in range(16):
            a0 = a0_ + j * math.pi / 8
            a1 = a0 + math.pi / 40
            dr.polygon([(ex + 0.55 * R * math.cos(a0), ey + 0.55 * R * math.sin(a0)), (ex + Rr * math.cos(a0), ey + Rr * math.sin(a0)),
                        (ex + Rr * math.cos(a1), ey + Rr * math.sin(a1)), (ex + 0.55 * R * math.cos(a1), ey + 0.55 * R * math.sin(a1))],
                       fill=(CYAN if j % 2 else ROSE) + (70,))
        rr = R * 1.18 * min(1.0, s)
        dr.ellipse((ex - rr, ey - rr, ex + rr, ey + rr), fill=OR + (55,))
        ang = 6.0 * math.sin(2 * math.pi * 1.6 * u) * math.exp(-1.1 * u)
        e = emoji(["rire", "mdr"][rang % 2], max(8, int(base * s)))
        if abs(ang) > 0.3:
            e = e.rotate(ang, resample=Image.BICUBIC, expand=True)
        im.alpha_composite(e, (int(ex - e.width / 2), int(ey - e.height / 2)))
    for j in range(7):
        th = j * 2 * math.pi / 7 + 0.4
        rr = R * (1.55 + 0.25 * (j % 3))
        a = max(0.0, math.sin(2 * math.pi * (1.6 * u + j * 0.37))) * min(1.0, s)
        if a > 0.05:
            etoile(dr, ex + rr * math.cos(th), ey + rr * math.sin(th), k(6 + 4 * (j % 2)), a, (255, 255, 255) if j % 2 else JAUNE)
    for j, (nom, cote) in enumerate(zip(("mdr", "main_bouche"), (-1, 1))):
        v = min(1.0, max(0.0, (u - 0.12 - 0.08 * j) / 0.3))
        v = 1 - (1 - v) ** 3
        if v <= 0:
            continue
        e2 = emoji(nom, int(base * 0.42)).rotate(cote * 12, resample=Image.BICUBIC, expand=True)
        x2 = ex + cote * (R * 1.7) * v + cote * (1 - v) * W * 0.6
        y2 = ey + R * 0.55 + k(6) * math.sin(2 * math.pi * 1.8 * u + j)
        im.alpha_composite(e2, (int(x2 - e2.width / 2), int(y2 - e2.height / 2)))
    if titre:
        f, fz = police(k(30)), police(k(15), b"Bold")
        larg = int(min(W - k(40), f.getlength(titre) + k(60)))
        h = k(58)
        a_ = np.linspace(0, 1, larg)[None, :, None]
        g = (np.array(ROSE) * (1 - a_) + np.array(VIOLET) * a_) * np.ones((h, 1, 1))
        rub = Image.fromarray(np.dstack([g, np.full((h, larg, 1), 235)]).astype(np.uint8), "RGBA")
        d2 = ImageDraw.Draw(rub)
        d2.rectangle((0, 0, larg - 1, k(3)), fill=CYAN + (255,))
        d2.rectangle((0, h - k(4), larg - 1, h - 1), fill=CYAN + (255,))
        ft = f
        while ft.getlength(titre) > larg - k(30) and ft.size > k(18):
            ft = police(ft.size - 2)
        d2.text((larg / 2, h / 2), titre, font=ft, fill=(255, 255, 255, 255), anchor="mm", stroke_width=k(3),
                stroke_fill=(30, 10, 40, 255))
        e_ = min(1.0, max(0.0, u / 0.2))
        kk = 0.9 + 0.1 * (1 - (1 - e_) ** 3)
        rub = rub.resize((max(1, int(rub.width * kk)), max(1, int(rub.height * kk))), Image.LANCZOS)
        rub = rub.rotate(-4, resample=Image.BICUBIC, expand=True)
        im.alpha_composite(rub, (int(W / 2 - rub.width / 2), int(ty)))
        lab = f"SKETCH {rang}/{total}"
        lw = int(fz.getlength(lab) + k(22))
        past = Image.new("RGBA", (lw, k(24)), (0, 0, 0, 0))
        dp = ImageDraw.Draw(past)
        dp.rounded_rectangle((0, 0, lw - 1, k(24) - 1), radius=k(12), fill=(20, 12, 40, 230), outline=JAUNE + (255,), width=k(2))
        dp.text((lw / 2, k(12)), lab, font=fz, fill=JAUNE + (255,), anchor="mm")
        im.alpha_composite(past, (int(W / 2 - lw / 2), int(ty - k(28))))
    return im


# ---------- sous-titres karaoké ----------

def emoji_du_mot(mot, s):
    for forme in generer.normaliser(mot):
        e = s.get("emojis", {}).get(forme) or monter.EMOJI_MOTS.get(forme)
        if e and (EMOJIS / f"{e}.png").exists():
            return e
    return None


class SousTitres:
    def __init__(self, s, mots):
        """mots : [(mot, début, fin, rang de la réplique)] ; groupes de 2 à 4 mots, sur une ou deux lignes."""
        self.s = s
        self.F = police(F_SOUS)
        self.cles = {w for c in s.get("cles", []) for w in generer.normaliser(c)}
        dernier = len(s["dialogue"]) - 1
        self.groupes = []
        for g in self.decouper(mots):
            em, vus = [], set()
            for i, (m, _, _, _) in enumerate(g):
                e = emoji_du_mot(m, s)
                if e and e not in vus and len(em) < 2:
                    em.append((i, e))
                    vus.add(e)
            em = dict(em)
            lignes = self.disposer(g, em)
            qui = s["dialogue"][g[0][3]][0]
            self.groupes.append({"mots": g, "em": em, "lignes": lignes, "couleur": COUL_PERSO[qui % len(COUL_PERSO)],
                                 "chute": g[0][3] == dernier})
        for j, gr in enumerate(self.groupes):
            gr["debut"] = gr["mots"][0][1] - 0.05
            suiv = self.groupes[j + 1]["mots"][0][1] - 0.05 if j + 1 < len(self.groupes) else gr["mots"][-1][2] + 0.6
            gr["fin"] = max(gr["debut"] + 0.3, min(suiv, gr["mots"][-1][2] + 1.2))
        self.fin_parole = max(m[2] for m in mots)

    def texte(self, m):
        return re.sub(r"[.,…]+$", "", m.upper()).replace(" ", " ")

    def largeur(self, g, idx, em):
        return self.F.getlength(" ".join(self.texte(g[i][0]) for i in idx)) + EMO_W * sum(1 for i in idx if i in em)

    def decouper(self, mots):
        props, cur = [], []
        for m in mots:
            cur.append(m)
            if re.search(r"[.!?…,:]$", m[0]) or (len(cur) >= 2 and m is mots[-1]):
                props.append(cur)
                cur = []
        if cur:
            props.append(cur)
        fus = []
        for p in props:                       # jamais un mot seul : il rejoint sa voisine
            if fus and (len(p) == 1 or len(fus[-1]) == 1) and len(fus[-1]) + len(p) <= 4:
                fus[-1] = fus[-1] + p
            else:
                fus.append(p)
        out = []
        for p in fus:
            n = math.ceil(len(p) / 4)
            base, reste = divmod(len(p), n)
            i = 0
            for j in range(n):
                t = base + (1 if j < reste else 0)
                out.append(p[i:i + t])
                i += t
        return out

    def disposer(self, g, em):
        n = len(g)
        if self.largeur(g, range(n), em) <= LARGEUR_SOUS:
            return [list(range(n))]
        best = min(range(1, n), key=lambda c: max(self.largeur(g, range(c), em), self.largeur(g, range(c, n), em)))
        return [list(range(best)), list(range(best, n))]

    def image(self, t):
        """calque RGBA de la bande du bas (W × (H - Y1)) à l'instant t du sketch, ou None."""
        gr = next((g for g in self.groupes if g["debut"] <= t < g["fin"]), None)
        if gr is None:
            return None
        g, em = gr["mots"], gr["em"]
        act = max([i for i, (_, d, _, _) in enumerate(g) if d - 0.02 <= t] or [0])
        im = Image.new("RGBA", (W, H - Y1), (0, 0, 0, 0))
        dr = ImageDraw.Draw(im)
        sp = self.F.getlength(" ")
        y = k(752) - Y1
        for r in gr["lignes"]:
            x = (W - self.largeur(g, r, em)) / 2
            for i in r:
                w = self.texte(g[i][0])
                ww = self.F.getlength(w)
                cle = bool(set(generer.normaliser(g[i][0])) & self.cles)
                if i == act:
                    u = max(0.0, t - g[i][1])
                    kk = 1.0 + 0.06 * max(0.0, 1 - u / 0.12)
                    pad = k(7) * kk
                    fond_ = SAUMON if (gr["chute"] and cle) else gr["couleur"]
                    dr.rounded_rectangle((x - pad, y - k(3) * kk, x + ww + pad, y + k(47) * kk), radius=k(13), fill=fond_ + (235,))
                    dr.text((x, y), w, font=self.F, fill=ENCRE)
                else:
                    dr.text((x + k(2), y + k(3)), w, font=self.F, fill=(0, 0, 0, 110))
                    dr.text((x, y), w, font=self.F, fill=JAUNE_MOT if cle else (255, 255, 255), stroke_width=k(4),
                            stroke_fill=(24, 12, 34))
                x += ww
                if i in em:
                    u = t - g[i][1] + 0.02
                    d = int(k(42) * pop(u)) if u > 0 else 0
                    if d > 8:
                        e = emoji(em[i], d)
                        im.alpha_composite(e, (int(x + EMO_W / 2 - e.width / 2), int(y + k(22) - e.height / 2)))
                    x += EMO_W
                x += sp
            y += k(50)
        return im


def vote(a, n):
    im = Image.new("RGBA", (W, H - Y1), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    larg = SD - SG
    q = "TON SKETCH PRÉFÉRÉ ?"
    for sq in (34, 31, 28, 25):
        fq = police(k(sq))
        if fq.getlength(q) + k(6) <= larg:
            break
    texte_double(dr, (CX, k(44)), q, fq, couleur=JAUNE, dec=k(2), ancre="mm")
    choix = "   ".join(str(i + 1) for i in range(n))
    dr.text((CX, k(96)), choix, font=police(k(30), b"Bold"), fill=(255, 255, 255, 255), anchor="mm", stroke_width=k(3),
            stroke_fill=(0, 0, 0, 255))
    dr.text((CX, k(142)), "RÉPONDS PAR SON NUMÉRO EN COMMENTAIRE", font=police(k(18), b"Bold"), fill=CYAN + (255,), anchor="mm",
            stroke_width=k(2), stroke_fill=(0, 0, 0, 255))
    if a < 1:
        al = np.array(im)
        al[..., 3] = (al[..., 3] * a).astype(np.uint8)
        im = Image.fromarray(al)
    return im


# ---------- assemblage ----------

def lire_scene(clip):
    """images 1080 × 862 (rgb24) du clip recadré en 5:4 (Veo : image 4:3 dans du 16:9, recadrée d'abord en 4:3)."""
    w, h = monter.taille_video(clip)
    pre = "crop=ih*4/3:ih," if w / h > 1.5 else ""
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(clip), "-vf",
                          f"{pre}crop=trunc(ih*{W}/{CH}/2)*2:ih,scale={W}:{CH}:flags=lanczos,fps={IPS}",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    taille = W * CH * 3
    try:
        while True:
            b = p.stdout.read(taille)
            if len(b) < taille:
                break
            yield b
    finally:                            # clip coupé après la chute : le lecteur est arrêté sans bruit
        p.kill()
        p.wait()


def souffle():
    f = generer.SORTIE / "segments" / "souffle.wav"
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        monter.lancer(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                       "anoisesrc=d=0.7:c=pink:a=0.6,highpass=f=500,lowpass=f=4000,afade=t=in:d=0.12,afade=t=out:st=0.2:d=0.5,"
                       "volume=0.6,aformat=channel_layouts=stereo", "-ar", "48000", str(f)])
    return f


def compiler(nom, ids):
    tous = generer.sketchs()
    etat = generer.lire_etat()
    plan, t = [], 0.0
    for r, sid in enumerate(ids):
        s = tous[sid]
        clip = generer.CLIPS / f"{sid}.mp4"
        d = monter.duree_media(clip)
        brut = monter.mots_minutes(s, (etat.get(sid, {}).get("controle") or {}).get("mots"), d)
        rangs = [k_ for k_, (_, txt) in enumerate(s["dialogue"]) for m in txt.split() if generer.normaliser(m)]
        mots = [(m, a, b, rangs[i] if i < len(rangs) else len(s["dialogue"]) - 1) for i, (m, a, b) in enumerate(brut)]
        st = SousTitres(s, mots)
        d = min(d, st.fin_parole + MARGE_CHUTE)
        apres = T_CARTE if r < len(ids) - 1 else QUEUE
        plan.append({"sid": sid, "s": s, "clip": clip, "debut": t, "duree": d, "apres": apres, "st": st,
                     "chute": t + st.fin_parole, "titre": (s.get("titre") or "").upper()})
        t += d + apres
    total = t
    n = len(plan)
    haut_bg, bas_bg = fond()
    bandeau = Bandeau()
    COMPILS = generer.SORTIE / "compilations"
    COMPILS.mkdir(parents=True, exist_ok=True)
    video = COMPILS / f"{nom}_image.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(IPS), "-i", "-", *ENC_V, str(video)], stdin=subprocess.PIPE)
    n_img = 0
    for r, p in enumerate(plan):
        derniere = None
        flux = lire_scene(p["clip"])
        nb_clip = int(round(p["duree"] * IPS))
        nb_apres = int(round(p["apres"] * IPS))
        for j in range(nb_clip + nb_apres):
            tg = n_img / IPS
            if j < nb_clip:
                b = next(flux, None)
                if b is not None:
                    derniere = b
                scene = Image.frombytes("RGB", (W, CH), derniere)
            else:
                scene = Image.frombytes("RGB", (W, CH), derniere)
                u = (j - nb_clip) / IPS
                if r < n - 1:
                    arr = (np.asarray(scene, dtype=np.float32) * 0.62).astype(np.uint8)
                    scene = Image.fromarray(arr, "RGB").convert("RGBA")
                    scene.alpha_composite(carte(u, plan[r + 1]["titre"], r + 2, n))
                    scene = scene.convert("RGB")
            # bande du haut
            haut = haut_bg.copy()
            fin_film = tg >= total - FIN_S
            if fin_film:
                haut.alpha_composite(haut_fin(min(1.0, (tg - (total - FIN_S)) / 0.35)))
            else:
                reac = next((q for q in plan if q["chute"] <= tg < q["chute"] + REACTION_S), None)
                if tg < ACCROCHE_S:
                    haut.alpha_composite(haut_accroche(tg))
                elif reac is not None:
                    haut.alpha_composite(haut_reaction(tg - reac["chute"], plan.index(reac)))
                else:
                    i_t = max([i for i, q in enumerate(plan) if q["debut"] - T_CARTE <= tg] or [0])
                    if plan[i_t]["titre"]:
                        haut.alpha_composite(haut_titre(plan[i_t]["titre"], i_t + 1, n))
                haut.alpha_composite(bandeau.a(n_img), (0, Y_BANDEAU))
            # bande du bas
            bas = bas_bg.copy()
            if j < nb_clip:
                c = p["st"].image(j / IPS)
                if c is not None:
                    bas.alpha_composite(c)
            elif r == n - 1 and tg >= total - QUEUE:
                bas.alpha_composite(vote(min(1.0, (tg - (total - QUEUE)) / 0.3), n))
            enc.stdin.write(haut.convert("RGB").tobytes() + scene.tobytes() + bas.convert("RGB").tobytes())
            n_img += 1
    enc.stdin.close()
    enc.wait()
    # son : dialogues à leur place, rires après chaque chute, souffle à chaque carte, musique baissée sous les voix
    entrees, f = [], []
    for i, p in enumerate(plan):
        entrees += ["-i", str(p["clip"])]
        ms = int(p["debut"] * 1000)
        f.append(f"[{i}:a]atrim=0:{p['duree']:.3f},afade=t=out:st={max(0, p['duree'] - 0.15):.3f}:d=0.15,"
                 f"loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[v{i}]")
    f.append("".join(f"[v{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0,apad=whole_dur={total:.2f}[voix]")
    base = n
    for i, p in enumerate(plan):
        entrees += ["-i", str(monter.RIRES[i % len(monter.RIRES)])]
        ms = int((p["chute"] + 0.15) * 1000)
        f.append(f"[{base + i}:a]volume={monter.VOLUME_RIRES},aresample=48000,adelay={ms}|{ms}[r{i}]")
    base += n
    for i, p in enumerate(plan[:-1]):
        entrees += ["-i", str(souffle())]
        ms = int((p["debut"] + p["duree"]) * 1000)
        f.append(f"[{base + i}:a]volume=0.5,adelay={ms}|{ms}[s{i}]")
    base += n - 1
    entrees += ["-stream_loop", "-1", "-i", str(monter.MUSIQUE)]
    f.append(f"[{base}:a]atrim=0:{total:.2f},volume={monter.VOLUME_MUSIQUE},afade=t=out:st={total - 1.5:.2f}:d=1.5[mus]")
    f.append("[voix]asplit=2[vx][cle]")
    f.append("[mus][cle]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[musb]")
    f.append("[vx][musb]" + "".join(f"[r{i}]" for i in range(n)) + "".join(f"[s{i}]" for i in range(n - 1)) +
             f"amix=inputs={2 + n + n - 1}:normalize=0:duration=first,alimiter=limit=0.95[a]")
    son = COMPILS / f"{nom}_son.m4a"
    monter.lancer(["ffmpeg", "-v", "error", "-y", *entrees, "-filter_complex", ";".join(f), "-map", "[a]",
                   "-t", f"{total:.2f}", *monter.ENC_A, str(son)])
    sortie = COMPILS / f"{nom}.mp4"
    monter.lancer(["ffmpeg", "-v", "error", "-y", "-i", str(video), "-i", str(son), "-map", "0:v", "-map", "1:a",
                   "-c", "copy", "-shortest", "-movflags", "+faststart", str(sortie)])
    video.unlink()
    son.unlink()
    print(f"  {sortie.name} : {n} sketchs, {monter.duree_media(sortie):.1f} s")
    return sortie


if __name__ == "__main__":
    compiler(sys.argv[1], sys.argv[2:])
