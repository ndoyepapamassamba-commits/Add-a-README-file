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

  python3 chaine.py NOM ids…                       → sortie/compilations/NOM.mp4 (sketchs dans l'ordre donné)
  python3 chaine.py --meilleur-d-abord NOM ids…    → ordre DÉCROISSANT : du plus drôle au moins drôle
  python3 chaine.py --boucle NOM ids…              → ouverture sur le choc du 1er sketch + raccord de boucle en fin
  python3 chaine.py --rejouer NOM ids…             → transitions gratuites : replay de la chute + RIRE-O-MÈTRE
ORDRE (règle de l'utilisateur, 26/10/2026) : « le premier sketch doit être celui qui marque et qui est le meilleur toujours,
et doit inciter à regarder le reste », puis « du plus rigolo au moins rigolo » (toutes les chutes doivent pourtant se valoir
en humour extrême : un clip nettement en dessous des autres est écarté plutôt que placé en fin). Les ids sont donnés dans
l'ordre du jury (texte) ; le classement mêle cette place et la note d'écoute du clip fini (voir score_drole).
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
# --boucle (26/10/2026, « donner envie de tout regarder en boucle ») : la vidéo s'ouvre sur le visage choqué de la fin du
# 1er sketch (« COMMENT ON EN EST ARRIVÉ LÀ ? »), et la carte de fin se fond dans cette même image : quand TikTok relance
# la vidéo, le raccord ne se voit pas
TEASER_S, BOUCLE_S = 1.4, 0.5
# --rejouer (26/10/2026, « 3 ou 4 clips avec une transition entre les vidéos qui captent… casse le coût ») : après chaque
# chute, transition fabriquée ici, sans rien payer : REPLAY de la dernière réplique (zoom, sous-titres, son), puis le
# RIRE-O-MÈTRE qui s'affole avec l'appel à commenter, puis la carte du sketch suivant ; moins de clips payés pour 62 s
REJOUE_MAX, METRE_S = 3.0, 2.0
# GAGS 3D LIBRES DE DROIT (26/10/2026, « des animations 3D libres de droit et extrêmement drôles se mélangeant avec le
# sketch ») : extraits de films de la Blender Foundation sous licence CC BY (usage commercial permis, crédit obligatoire),
# insérés après le replay avec une légende façon mème. Seuls les films à la licence vérifiée : Big Buck Bunny (CC BY) et
# Caminandes 3 « Llamigos » (licence « Attribution » sur video.blender.org). Les films sont téléchargés dans
# sortie/blender_cc/ (hors dépôt) : voir README.
CC_DIR = generer.SORTIE / "blender_cc"
CREDIT_CC = "(CC BY) Blender Foundation | studio.blender.org"
GAGS = {  # nom : (fichier, début, durée prise, vitesse, titre du film)
    "glissade": ("caminandes3.ogv", 13.5, 4.0, 1.0, "Caminandes 3 : Llamigos"),
    "lama_choc": ("caminandes3.ogv", 34.0, 3.0, 1.0, "Caminandes 3 : Llamigos"),
    "yeux_fous": ("BigBuckBunny_640x360.m4v", 480.4, 1.5, 0.6, "Big Buck Bunny"),
    "lapin_choc": ("BigBuckBunny_640x360.m4v", 196.6, 3.0, 1.0, "Big Buck Bunny"),
    "lapin_colere": ("BigBuckBunny_640x360.m4v", 233.0, 4.0, 1.0, "Big Buck Bunny"),
}


def duree_gag(nom):
    _, _, d, v, _ = GAGS[nom]
    return d / v


def lire_gag(nom):
    f, debut, d, v, _ = GAGS[nom]
    clip = CC_DIR / f
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{debut:.3f}", "-t", f"{d + 0.2:.3f}", "-i", str(clip), "-vf",
                          f"setpts={1 / v:.4f}*PTS," + filtre_scene(clip), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    taille = W * CH * 3
    try:
        while True:
            b = p.stdout.read(taille)
            if len(b) < taille:
                break
            yield b
    finally:
        p.kill()
        p.wait()


def haut_legende(txt, u):
    """légende façon mème au-dessus du gag : blanche, contour noir, sur deux lignes au plus."""
    im = Image.new("RGBA", (W, Y0), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    p = min(pop(u), 1.0)
    if p > 0.05:
        taille = k(40)
        while police(taille).getlength(txt) > 2 * (W - k(60)) and taille > k(24):
            taille -= 2
        f = police(taille * p)
        mots, lignes = txt.split(), [""]
        for m in mots:
            essai = (lignes[-1] + " " + m).strip()
            if f.getlength(essai) <= W - k(60) or not lignes[-1]:
                lignes[-1] = essai
            else:
                lignes.append(m)
        y = k(150) - (len(lignes) - 1) * taille * 0.55
        for li in lignes[:2]:
            dr.text((CX, y), li, font=f, fill=(255, 255, 255, 255), anchor="mm", stroke_width=k(4), stroke_fill=(0, 0, 0, 255))
            y += taille * 1.1
    return im


def scene_gag(b, film):
    im = Image.frombytes("RGB", (W, CH), b).convert("RGBA")
    dr = ImageDraw.Draw(im)
    txt = f"{film} · {CREDIT_CC}"
    f = police(k(11), b"Bold")
    dr.rounded_rectangle((k(10), CH - k(30), k(22) + f.getlength(txt), CH - k(10)), radius=k(6), fill=(0, 0, 0, 140))
    dr.text((k(16), CH - k(20)), txt, font=f, fill=(255, 255, 255, 230), anchor="lm")
    return im.convert("RGB")


def bas_rires(u):
    """trois émojis qui rient et jaillissent l'un après l'autre sous le gag."""
    im = Image.new("RGBA", (W, H - Y1), (0, 0, 0, 0))
    for i, nom in enumerate(("rire", "mdr", "crane")):
        q = pop(u - 0.15 * i)
        if q > 0.05:
            e = emoji(nom, max(8, int(k(110) * q)))
            x = CX + (i - 1) * k(150)
            im.alpha_composite(e, (int(x - e.width / 2), int(k(110) - e.height / 2)))
    return im


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


def haut_teaser(u):
    im = Image.new("RGBA", (W, Y0), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    p = pop(u)
    if p > 0.05:
        f1, f2 = police(k(30) * p), police(k(40) * p)
        dr.text((CX, k(112)), "COMMENT ON EN EST", font=f1, fill=(255, 255, 255, 255), anchor="mm",
                stroke_width=k(4), stroke_fill=(0, 0, 0, 255))
        texte_double(dr, (CX - k(30), k(166)), "ARRIVÉ LÀ ?", f2, couleur=JAUNE, dec=k(3), ancre="mm")
        e = emoji("choc", max(8, int(k(64) * p)))
        im.alpha_composite(e, (int(CX - k(30) + f2.getlength("ARRIVÉ LÀ ?") / 2 + k(8)), int(k(166) - e.height / 2)))
    return im


def haut_rejoue(u):
    im = Image.new("RGBA", (W, Y0), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    p = pop(u)
    if p > 0.05:
        f = police(k(42) * p)
        e = emoji("mdr", max(8, int(k(80) * p)))
        larg = e.width + k(12) + f.getlength("REVOIS LA CHUTE !")
        x0 = CX - larg / 2
        im.alpha_composite(e, (int(x0), int(k(150) - e.height / 2)))
        texte_double(dr, (x0 + e.width + k(12), k(150)), "REVOIS LA CHUTE !", f, couleur=JAUNE, dec=k(3), ancre="lm")
    return im


def haut_metre(u):
    im = Image.new("RGBA", (W, Y0), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    p = pop(u)
    if p > 0.05:
        texte_double(dr, (CX, k(150)), "RIRE-O-MÈTRE", police(k(44) * p), dec=k(3), ancre="mm")
    return im


def scene_rejoue(img, u, R):
    """image du replay : léger zoom qui avance + badge REPLAY rouge qui clignote."""
    z = 1.08 + 0.10 * u / max(R, 0.1)
    cw, chh = W / z, CH / z
    im = img.crop((int((W - cw) / 2), int((CH - chh) / 2), int((W + cw) / 2), int((CH + chh) / 2))).resize(
        (W, CH), Image.LANCZOS).convert("RGBA")
    dr = ImageDraw.Draw(im)
    if int(u * 3) % 2 == 0:
        dr.rounded_rectangle((k(18), k(16), k(150), k(52)), radius=k(8), fill=ROSE + (235,))
        dr.ellipse((k(28), k(28), k(40), k(40)), fill=(255, 255, 255, 255))
        dr.text((k(48), k(34)), "REPLAY", font=police(k(20)), fill=(255, 255, 255, 255), anchor="lm")
    return im.convert("RGB")


def scene_metre(fond_img, u):
    """RIRE-O-MÈTRE sur la dernière image assombrie : la jauge se remplit, déborde, puis « MORT DE RIRE 💀 »."""
    arr = (np.asarray(fond_img, dtype=np.float32) * 0.45).astype(np.uint8)
    im = Image.fromarray(arr, "RGB").convert("RGBA")
    dr = ImageDraw.Draw(im)
    x0, x1, y0, y1 = k(60), W - k(60), CH * 0.40, CH * 0.40 + k(56)
    dr.rounded_rectangle((x0, y0, x1, y1), radius=k(28), fill=(255, 255, 255, 40), outline=(255, 255, 255, 230), width=k(4))
    plein = min(1.0, 1 - (1 - min(1.0, u / 0.8)) ** 3)
    if plein > 0.02:
        xa = x0 + k(6) + (x1 - x0 - k(12)) * plein
        for i in range(int(xa - x0 - k(6))):
            c = tuple(int(JAUNE[j] + (ROSE[j] - JAUNE[j]) * i / max(1, x1 - x0)) for j in range(3))
            dr.line((x0 + k(6) + i, y0 + k(6), x0 + k(6) + i, y1 - k(6)), fill=c + (255,))
    for i, cran in enumerate(("PETIT RIRE", "FOU RIRE", "MAX")):
        xc = x0 + (x1 - x0) * (i + 1) / 3.2
        dr.text((xc, y0 - k(18)), cran, font=police(k(15), b"Bold"), fill=(255, 255, 255, 220), anchor="mm")
    if u > 0.85:
        q = pop(u - 0.85)
        f = police(k(46) * max(q, 0.01))
        e = emoji("crane", max(8, int(k(84) * q)))
        larg = f.getlength("MORT DE RIRE") + k(12) + e.width
        xm = CX - larg / 2
        ym = CH * 0.66
        texte_double(dr, (xm, ym), "MORT DE RIRE", f, couleur=JAUNE, dec=k(3), ancre="lm")
        im.alpha_composite(e, (int(xm + f.getlength("MORT DE RIRE") + k(12)), int(ym - e.height / 2)))
    return im.convert("RGB")


def bas_commente(u):
    im = Image.new("RGBA", (W, H - Y1), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    p = pop(u)
    if p > 0.05:
        dr.text((CX, k(60)), "TU AS RI ?", font=police(k(34) * p), fill=(255, 255, 255, 255), anchor="mm",
                stroke_width=k(3), stroke_fill=(0, 0, 0, 255))
        appel, taille = "ÉCRIS « DÊH » EN COMMENTAIRE", k(30)
        while police(taille).getlength(appel) > W - k(40):       # la phrase tient dans la largeur, même au rebond
            taille -= 2
        texte_double(dr, (CX, k(112)), appel, police(taille * min(p, 1.0)), couleur=JAUNE, dec=k(2), ancre="mm")
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
            # un mot très long (« ARTISTE-CHANTEUR ») peut déborder même sur deux lignes : police réduite pour ce groupe
            large = max(self.largeur(g, l, em) for l in lignes)
            F = self.F if large <= LARGEUR_SOUS else police(F_SOUS * LARGEUR_SOUS / large)
            qui = s["dialogue"][g[0][3]][0]
            self.groupes.append({"mots": g, "em": em, "lignes": lignes, "couleur": COUL_PERSO[qui % len(COUL_PERSO)],
                                 "chute": g[0][3] == dernier, "F": F})
        for j, gr in enumerate(self.groupes):
            gr["debut"] = gr["mots"][0][1] - 0.05
            suiv = self.groupes[j + 1]["mots"][0][1] - 0.05 if j + 1 < len(self.groupes) else gr["mots"][-1][2] + 0.6
            gr["fin"] = max(gr["debut"] + 0.3, min(suiv, gr["mots"][-1][2] + 1.2))
        self.fin_parole = max(m[2] for m in mots)

    def texte(self, m):
        return re.sub(r"[.,…]+$", "", m.upper()).replace(" ", " ")

    def largeur(self, g, idx, em, F=None):
        return (F or self.F).getlength(" ".join(self.texte(g[i][0]) for i in idx)) + EMO_W * sum(1 for i in idx if i in em)

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
        F = gr["F"]
        sp = F.getlength(" ")
        y = k(752) - Y1
        for r in gr["lignes"]:
            x = (W - self.largeur(g, r, em, F)) / 2
            for i in r:
                w = self.texte(g[i][0])
                ww = F.getlength(w)
                cle = bool(set(generer.normaliser(g[i][0])) & self.cles)
                if i == act:
                    u = max(0.0, t - g[i][1])
                    kk = 1.0 + 0.06 * max(0.0, 1 - u / 0.12)
                    pad = k(7) * kk
                    fond_ = SAUMON if (gr["chute"] and cle) else gr["couleur"]
                    dr.rounded_rectangle((x - pad, y - k(3) * kk, x + ww + pad, y + k(47) * kk), radius=k(13), fill=fond_ + (235,))
                    dr.text((x, y), w, font=F, fill=ENCRE)
                else:
                    dr.text((x + k(2), y + k(3)), w, font=F, fill=(0, 0, 0, 110))
                    dr.text((x, y), w, font=F, fill=JAUNE_MOT if cle else (255, 255, 255), stroke_width=k(4),
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

def filtre_scene(clip):
    """recadrage en 5:4, 1080 × 862 (Veo : image 4:3 dans du 16:9, recadrée d'abord en 4:3)."""
    w, h = monter.taille_video(clip)
    pre = "crop=ih*4/3:ih," if w / h > 1.5 else ""
    return f"{pre}crop=trunc(ih*{W}/{CH}/2)*2:ih,scale={W}:{CH}:flags=lanczos,fps={IPS}"


def scene_a(clip, t):
    """une image de la scène à l'instant t du clip."""
    brut = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(0.0, t):.3f}", "-i", str(clip), "-vf", filtre_scene(clip),
                           "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return Image.frombytes("RGB", (W, CH), brut[:W * CH * 3])


def lire_scene(clip, debut=None, duree=None):
    """images 1080 × 862 (rgb24) du clip recadré en 5:4 (ou d'une fenêtre [debut, debut + duree] du clip)."""
    fenetre = (["-ss", f"{debut:.3f}", "-t", f"{duree:.3f}"] if debut is not None else [])
    p = subprocess.Popen(["ffmpeg", "-v", "error", *fenetre, "-i", str(clip), "-vf", filtre_scene(clip),
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


def compiler(nom, ids, boucle=False, rejouer=False):
    tous = generer.sketchs()
    etat = generer.lire_etat()
    t0 = TEASER_S if boucle else 0.0
    plan, t = [], t0
    for r, sid in enumerate(ids):
        s = tous[sid]
        clip = generer.CLIPS / f"{sid}.mp4"
        d = monter.duree_media(clip)
        brut = monter.mots_minutes(s, (etat.get(sid, {}).get("controle") or {}).get("mots"), d)
        rangs = [k_ for k_, (_, txt) in enumerate(s["dialogue"]) for m in txt.split() if generer.normaliser(m)]
        mots = [(m, a, b, rangs[i] if i < len(rangs) else len(s["dialogue"]) - 1) for i, (m, a, b) in enumerate(brut)]
        st = SousTitres(s, mots)
        d = min(d, st.fin_parole + MARGE_CHUTE, s.get("coupe", d))   # « coupe » : clip arrêté avant un défaut tardif
        R, r0 = 0.0, 0.0
        if rejouer:                     # fenêtre du replay : la dernière réplique, 3 s au plus
            derniere_rep = len(s["dialogue"]) - 1
            a_l = min([a for (_, a, _, rg) in mots if rg == derniere_rep] or [st.fin_parole - 1.5])
            r1 = min(d, st.fin_parole + 0.45)
            r0 = max(0.0, a_l - 0.15, r1 - REJOUE_MAX)
            R = r1 - r0
        gag = s.get("gag") if rejouer else None          # [nom du gag, légende]
        G = duree_gag(gag[0]) if gag else 0.0
        apres = (R + G + METRE_S + T_CARTE if rejouer else T_CARTE) if r < len(ids) - 1 else R + G + QUEUE
        plan.append({"sid": sid, "s": s, "clip": clip, "debut": t, "duree": d, "apres": apres, "st": st,
                     "chute": t + st.fin_parole, "titre": (s.get("titre") or "").upper(), "R": R, "r0": r0,
                     "gag": gag, "G": G})
        t += d + apres
    t_fin = t
    total = t_fin + (BOUCLE_S if boucle else 0.0)
    n = len(plan)
    haut_bg, bas_bg = fond()
    bandeau = Bandeau()
    COMPILS = generer.SORTIE / "compilations"
    COMPILS.mkdir(parents=True, exist_ok=True)
    video = COMPILS / f"{nom}_image.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(IPS), "-i", "-", *ENC_V, str(video)], stdin=subprocess.PIPE)
    n_img = 0
    premiere = derniere_img = None
    if boucle:
        fige = scene_a(plan[0]["clip"], plan[0]["duree"] - 0.08)          # visage choqué de la fin du 1er sketch
        for j in range(int(round(TEASER_S * IPS))):
            u = j / IPS
            z = 1.0 + 0.12 * u / TEASER_S
            cw, chh = W / z, CH / z
            scene = fige.crop((int((W - cw) / 2), int((CH - chh) / 2), int((W + cw) / 2), int((CH + chh) / 2))).resize(
                (W, CH), Image.LANCZOS)
            haut = haut_bg.copy()
            haut.alpha_composite(haut_teaser(u))
            haut.alpha_composite(bandeau.a(n_img), (0, Y_BANDEAU))
            img = haut.convert("RGB").tobytes() + scene.tobytes() + bas_bg.convert("RGB").tobytes()
            premiere = premiere or img
            enc.stdin.write(img)
            n_img += 1
    for r, p in enumerate(plan):
        derniere = None
        flux = lire_scene(p["clip"])
        nb_clip = int(round(p["duree"] * IPS))
        nb_apres = int(round(p["apres"] * IPS))
        flux_r = rejouee = flux_g = None
        R, G = p["R"], p["G"]
        for j in range(nb_clip + nb_apres):
            tg = n_img / IPS
            u = (j - nb_clip) / IPS
            phase = ("clip" if j < nb_clip else "rejoue" if u < R else "gag" if u < R + G else
                     "metre" if rejouer and r < n - 1 and u < R + G + METRE_S else "suite")
            if j < nb_clip:
                b = next(flux, None)
                if b is not None:
                    derniere = b
                scene = Image.frombytes("RGB", (W, CH), derniere)
            elif phase == "rejoue":
                if flux_r is None:
                    flux_r = lire_scene(p["clip"], p["r0"], R + 0.2)
                b = next(flux_r, None)
                if b is not None:
                    rejouee = b
                scene = scene_rejoue(Image.frombytes("RGB", (W, CH), rejouee or derniere), u, R)
            elif phase == "gag":
                if flux_g is None:
                    flux_g = lire_gag(p["gag"][0])
                b = next(flux_g, None)
                if b is not None:
                    gag_img = b
                scene = scene_gag(gag_img, GAGS[p["gag"][0]][4])
            elif phase == "metre":
                scene = scene_metre(Image.frombytes("RGB", (W, CH), rejouee or derniere), u - R - G)
            else:
                scene = Image.frombytes("RGB", (W, CH), derniere)
                u = u - R - G - (METRE_S if rejouer and r < n - 1 else 0.0)
                if r < n - 1:
                    arr = (np.asarray(scene, dtype=np.float32) * 0.62).astype(np.uint8)
                    scene = Image.fromarray(arr, "RGB").convert("RGBA")
                    scene.alpha_composite(carte(u, plan[r + 1]["titre"], r + 2, n))
                    scene = scene.convert("RGB")
            # bande du haut
            haut = haut_bg.copy()
            fin_film = tg >= t_fin - FIN_S
            if fin_film:
                haut.alpha_composite(haut_fin(min(1.0, (tg - (t_fin - FIN_S)) / 0.35)))
            elif phase == "rejoue":
                haut.alpha_composite(haut_rejoue((j - nb_clip) / IPS))
                haut.alpha_composite(bandeau.a(n_img), (0, Y_BANDEAU))
            elif phase == "gag":
                haut.alpha_composite(haut_legende(p["gag"][1], (j - nb_clip) / IPS - R))
                haut.alpha_composite(bandeau.a(n_img), (0, Y_BANDEAU))
            elif phase == "metre":
                haut.alpha_composite(haut_metre((j - nb_clip) / IPS - R - G))
                haut.alpha_composite(bandeau.a(n_img), (0, Y_BANDEAU))
            else:
                reac = next((q for q in plan if q["chute"] <= tg < q["chute"] + REACTION_S), None)
                if t0 <= tg < t0 + ACCROCHE_S:
                    haut.alpha_composite(haut_accroche(tg - t0))
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
            elif phase == "rejoue":
                c = p["st"].image(p["r0"] + (j - nb_clip) / IPS)
                if c is not None:
                    bas.alpha_composite(c)
            elif phase == "gag":
                bas.alpha_composite(bas_rires((j - nb_clip) / IPS - R))
            elif phase == "metre":
                bas.alpha_composite(bas_commente((j - nb_clip) / IPS - R - G))
            elif r == n - 1 and tg >= t_fin - QUEUE:
                bas.alpha_composite(vote(min(1.0, (tg - (t_fin - QUEUE)) / 0.3), n))
                if any(q["gag"] for q in plan):         # crédit CC BY des extraits 3D, exigé par la licence
                    ImageDraw.Draw(bas).text((CX, k(190)), f"Extraits 3D : {CREDIT_CC}", font=police(k(13), b"Bold"),
                                             fill=(255, 255, 255, 200), anchor="mm")
            derniere_img = haut.convert("RGB").tobytes() + scene.tobytes() + bas.convert("RGB").tobytes()
            enc.stdin.write(derniere_img)
            n_img += 1
    if boucle:                          # raccord : la carte de fin se fond dans la toute première image
        a_, b_ = (np.frombuffer(x, np.uint8).astype(np.float32) for x in (derniere_img, premiere))
        nb = int(round(BOUCLE_S * IPS))
        for j in range(nb):
            x = (j + 1) / nb
            enc.stdin.write((a_ * (1 - x) + b_ * x).astype(np.uint8).tobytes())
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
        ms = int((p["debut"] + p["duree"] + (p["R"] + p["G"] + METRE_S if rejouer else 0.0)) * 1000)
        f.append(f"[{base + i}:a]volume=0.5,adelay={ms}|{ms}[s{i}]")
    base += n - 1
    souffles = [f"[s{i}]" for i in range(n - 1)]
    if rejouer:                         # replay : la réplique rejouée, un souffle de rembobinage avant, un rire après
        for i, p in enumerate(plan):
            debut_r = p["debut"] + p["duree"]
            entrees += ["-i", str(p["clip"]), "-i", str(souffle()), "-i", str(monter.RIRES[(i + 2) % len(monter.RIRES)])]
            ms, ms_s, ms_r = (int(x * 1000) for x in (debut_r, max(0.0, debut_r - 0.2), debut_r + p["R"] - 0.25))
            f.append(f"[{base}:a]atrim={p['r0']:.3f}:{p['r0'] + p['R']:.3f},asetpts=PTS-STARTPTS,"
                     f"afade=t=out:st={max(0, p['R'] - 0.2):.3f}:d=0.2,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,"
                     f"aformat=channel_layouts=stereo,adelay={ms}|{ms}[rj{i}]")
            f.append(f"[{base + 1}:a]volume=0.6,adelay={ms_s}|{ms_s}[rs{i}]")
            f.append(f"[{base + 2}:a]volume={monter.VOLUME_RIRES},aresample=48000,adelay={ms_r}|{ms_r}[rr{i}]")
            souffles += [f"[rj{i}]", f"[rs{i}]", f"[rr{i}]"]
            base += 3
            if p["gag"]:                  # gag 3D : son du film (ralenti si besoin), puis un rire du public
                fichier, debut_g, d_g, v_g, _ = GAGS[p["gag"][0]]
                debut_gag = debut_r + p["R"]
                entrees += ["-ss", f"{debut_g:.3f}", "-t", f"{d_g:.3f}", "-i", str(CC_DIR / fichier),
                            "-i", str(monter.RIRES[(i + 1) % len(monter.RIRES)])]
                ms_g, ms_rg = int(debut_gag * 1000), int((debut_gag + 0.4) * 1000)
                tempo = f"atempo={v_g:.3f}," if abs(v_g - 1.0) > 1e-3 else ""
                f.append(f"[{base}:a]{tempo}volume=0.7,aresample=48000,aformat=channel_layouts=stereo,"
                         f"adelay={ms_g}|{ms_g}[gg{i}]")
                f.append(f"[{base + 1}:a]volume={monter.VOLUME_RIRES * 0.8:.2f},aresample=48000,adelay={ms_rg}|{ms_rg}[gr{i}]")
                souffles += [f"[gg{i}]", f"[gr{i}]"]
                base += 2
    if boucle:                          # souffle de « rembobinage » entre l'ouverture et le 1er sketch
        entrees += ["-i", str(souffle())]
        ms = int(max(0.0, t0 - 0.25) * 1000)
        f.append(f"[{base}:a]volume=0.6,adelay={ms}|{ms}[sb]")
        souffles.append("[sb]")
        base += 1
    entrees += ["-stream_loop", "-1", "-i", str(monter.MUSIQUE)]
    f.append(f"[{base}:a]atrim=0:{total:.2f},volume={monter.VOLUME_MUSIQUE},afade=t=out:st={total - 1.5:.2f}:d=1.5[mus]")
    f.append("[voix]asplit=2[vx][cle]")
    f.append("[mus][cle]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[musb]")
    f.append("[vx][musb]" + "".join(f"[r{i}]" for i in range(n)) + "".join(souffles) +
             f"amix=inputs={2 + n + len(souffles)}:normalize=0:duration=first,alimiter=limit=0.95[a]")
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


def note_ecoute(sid, etat):
    avis = etat.get(sid, {}).get("avis") or ""
    d, n = (re.search(rf"{c}\s*=\s*(\d+(?:[.,]\d+)?)", avis) for c in ("DRÔLE", "NATUREL"))
    return tuple(float(m.group(1).replace(",", ".")) if m else 0.0 for m in (d, n))


def score_drole(i, rang, n, etat):
    """note d'écoute du clip fini (DRÔLE + NATUREL / 2) + bonus du jury sur le texte : les ids sont donnés dans l'ordre du
    jury, le premier reçoit +2, le dernier 0 (une seule écoute note bien le jeu des voix mais mal la force de la blague)."""
    drole, naturel = note_ecoute(i, etat)
    return drole + naturel / 2 + (2.0 * (1 - rang / (n - 1)) if n > 1 else 0.0)


def meilleur_d_abord(ids):
    etat = generer.lire_etat()
    notes = {i: score_drole(i, r, len(ids), etat) for r, i in enumerate(ids)}
    return sorted(ids, key=lambda i: -notes[i])


if __name__ == "__main__":
    options = [a for a in sys.argv[1:] if a.startswith("--")]
    nom, *ids = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--meilleur-d-abord" in options:
        ids = meilleur_d_abord(ids)
        e = generer.lire_etat()
        print("  ordre :", " ".join(f"{i}({'/'.join(f'{x:g}' for x in note_ecoute(i, e))})" for i in ids))  # notes d'écoute
    compiler(nom, ids, boucle="--boucle" in options, rejouer="--rejouer" in options)
