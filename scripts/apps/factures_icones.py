"""Teranga Factures : dessine les icônes de l'application (PNG) sans fichier source.

Usage : python3 scripts/apps/factures_icones.py   (depuis la racine du site)
Produit apps/factures/icons/ : icon-192.png, icon-512.png (coins arrondis), maskable-192.png, maskable-512.png
(plein cadre, motif dans la zone sûre), apple-touch-icon.png (180, plein cadre) et favicon-32.png.
"""
from pathlib import Path
from PIL import Image, ImageDraw

VERT = (11, 110, 79)          # #0b6e4f
VERT_FONCE = (7, 84, 60)
OR = (242, 183, 5)            # #f2b705
TERRE = (196, 87, 42)         # terre cuite
PAPIER = (255, 255, 255)
PLI = (207, 230, 220)
TRAIT = (203, 213, 208)

SUR = 4  # suréchantillonnage pour des bords lisses
DOSSIER = Path(__file__).resolve().parents[2] / "apps" / "factures" / "icons"


def fond(d, n, arrondi):
    # léger dégradé vertical du vert de la marque
    for y in range(n):
        t = y / max(1, n - 1)
        c = tuple(round(VERT[i] * (1 - t) + VERT_FONCE[i] * t) for i in range(3))
        d.line([(0, y), (n, y)], fill=c)
    if arrondi:
        masque = Image.new("L", (n, n), 0)
        ImageDraw.Draw(masque).rounded_rectangle([0, 0, n - 1, n - 1], radius=round(n * 0.22), fill=255)
        return masque
    return None


def motif(d, n, echelle):
    """Feuille de facture (coin plié, lignes, total), bande wax en bas et pastille « payé »."""
    cx, cy = n / 2, n / 2
    w, h = n * 0.50 * echelle, n * 0.62 * echelle
    x0, y0 = cx - w / 2 - n * 0.03 * echelle, cy - h / 2
    x1, y1 = x0 + w, y0 + h
    pli = w * 0.26
    r = n * 0.035 * echelle
    # ombre douce
    d.rounded_rectangle([x0 + n * 0.012 * echelle, y0 + n * 0.018 * echelle, x1 + n * 0.012 * echelle, y1 + n * 0.018 * echelle],
                        radius=r, fill=(0, 0, 0, 60))
    # feuille avec coin plié
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=PAPIER)
    d.polygon([(x1 - pli, y0), (x1 + 1, y0), (x1 + 1, y0 + pli)], fill=VERT)
    d.polygon([(x1 - pli, y0), (x1, y0 + pli), (x1 - pli, y0 + pli)], fill=PLI)
    # en-tête
    ep = h * 0.055
    d.rounded_rectangle([x0 + w * 0.12, y0 + h * 0.12, x0 + w * 0.52, y0 + h * 0.12 + ep], radius=ep / 2, fill=VERT)
    # lignes de détail
    for i, lg in enumerate([0.76, 0.62, 0.70]):
        yy = y0 + h * (0.32 + i * 0.12)
        d.rounded_rectangle([x0 + w * 0.12, yy, x0 + w * lg, yy + ep * 0.7], radius=ep * 0.35, fill=TRAIT)
        d.rounded_rectangle([x0 + w * 0.80, yy, x0 + w * 0.88, yy + ep * 0.7], radius=ep * 0.35, fill=TRAIT)
    # total
    yt = y0 + h * 0.70
    d.rounded_rectangle([x0 + w * 0.46, yt, x0 + w * 0.88, yt + ep * 1.1], radius=ep * 0.5, fill=VERT)
    # bande wax (triangles alternés) en bas de la feuille
    yb0, yb1 = y1 - h * 0.13, y1 - h * 0.05
    d.rectangle([x0, yb0, x1, yb1], fill=OR)
    k = 6
    pas = w / k
    for i in range(k):
        xa = x0 + i * pas
        d.polygon([(xa, yb1), (xa + pas / 2, yb0), (xa + pas, yb1)], fill=TERRE if i % 2 == 0 else VERT)
    # pastille « payé »
    pr = n * 0.135 * echelle
    px, py = x1 + n * 0.02 * echelle, y1 - n * 0.02 * echelle
    d.ellipse([px - pr - n * 0.012 * echelle, py - pr - n * 0.012 * echelle,
               px + pr + n * 0.012 * echelle, py + pr + n * 0.012 * echelle], fill=VERT)
    d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=OR)
    e = pr * 0.24
    d.line([(px - pr * 0.45, py + pr * 0.02), (px - pr * 0.1, py + pr * 0.36), (px + pr * 0.48, py - pr * 0.34)],
           fill=VERT_FONCE, width=round(e), joint="curve")
    for (qx, qy) in [(px - pr * 0.45, py + pr * 0.02), (px + pr * 0.48, py - pr * 0.34)]:
        d.ellipse([qx - e / 2, qy - e / 2, qx + e / 2, qy + e / 2], fill=VERT_FONCE)


def icone(taille, arrondi, echelle):
    n = taille * SUR
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    masque = fond(d, n, arrondi)
    calque = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    motif(ImageDraw.Draw(calque, "RGBA"), n, echelle)
    img = Image.alpha_composite(img, calque)
    if masque is not None:
        img.putalpha(masque)
    return img.resize((taille, taille), Image.LANCZOS)


def main():
    DOSSIER.mkdir(parents=True, exist_ok=True)
    for t in (192, 512):
        icone(t, True, 1.0).save(DOSSIER / f"icon-{t}.png", optimize=True)
        icone(t, False, 0.82).save(DOSSIER / f"maskable-{t}.png", optimize=True)
    icone(180, False, 0.92).convert("RGB").save(DOSSIER / "apple-touch-icon.png", optimize=True)
    icone(32, True, 1.0).save(DOSSIER / "favicon-32.png", optimize=True)
    print("Icônes écrites dans", DOSSIER)


if __name__ == "__main__":
    main()
