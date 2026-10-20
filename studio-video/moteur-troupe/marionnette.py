# MARIONNETTES 2D DE LA TROUPE (20/10/2026, « les bouches sont déformées, les personnages ne coïncident pas avec la scène ;
# créer des personnages adaptés que tu peux manipuler facilement, en gardant le moteur »).
# Chaque personnage est une MARIONNETTE DÉCOUPÉE (cut-out, comme dans Toon Boom Harmony) dessinée en vectoriel (Skia, BSD) :
#   - lu dans SA FICHE de la bible (âge, taille, corpulence, coiffure, barbe, lunettes, foulard, tenue et couleurs) —
#     déterministe : la même fiche donne toujours le même personnage, les 54 fiches donnent 54 marionnettes ;
#   - bouches DESSINÉES pour chaque visème (A–H + X de Rhubarb, la table A–G + X des studios), jamais étirées : une
#     bouche ne peut pas se déformer, elle est redessinée nette à chaque image ;
#   - corps articulé (buste, tête, bras à deux segments, jambes) piloté par les pistes de jeu du moteur (jeu.pistes) ;
#   - éclairée par la lumière DU DÉCOR (même direction, même teinte, même contour, ombre au sol) : elle coïncide avec la scène.
import math, re, zlib
import numpy as np
import skia

# ── couleurs ──────────────────────────────────────────────────────────────────────────────────────────────────────
COULEURS = {   # vocabulaire des fiches → RVB (teintes franches du wax et des tenues ouest-africaines)
    'bleu roi': (28, 72, 196), 'bleu marine': (28, 40, 88), 'bleu clair': (126, 178, 228), 'bleu': (40, 96, 200),
    'rouge': (206, 40, 46), 'bordeaux': (118, 24, 40), 'rose': (236, 112, 168), 'violet': (122, 62, 160),
    'orange': (238, 126, 34), 'jaune': (246, 196, 40), 'or': (214, 168, 52), 'doré': (214, 168, 52), 'vert': (40, 150, 80),
    'kaki': (138, 136, 86), 'marron': (110, 70, 42), 'brun': (110, 70, 42), 'beige': (214, 192, 150), 'crème': (240, 228, 200),
    'blanc': (244, 244, 240), 'blanche': (244, 244, 240), 'gris': (140, 140, 146), 'noir': (34, 34, 38), 'noire': (34, 34, 38),
    'jean': (66, 98, 150), 'léopard': (214, 160, 70), 'bazin': (122, 62, 160),
}
PEAUX = [(124, 78, 48), (104, 64, 40), (140, 92, 58), (92, 56, 34), (118, 72, 44), (150, 100, 64)]


def rvb(c, a=255):
    return skia.ColorSetARGB(int(a), int(np.clip(c[0], 0, 255)), int(np.clip(c[1], 0, 255)), int(np.clip(c[2], 0, 255)))


def ombre(c, k=0.72):
    return tuple(int(v * k) for v in c)


def clair(c, k=0.25):
    return tuple(int(v + (255 - v) * k) for v in c)


def _couleurs_texte(t):
    """couleurs citées dans l'ordre d'apparition (« bleu roi » avant « bleu »)."""
    t = t.lower(); out = []
    for m in re.finditer(r"bleu roi|bleu marine|bleu clair|[a-zéèêàâçô]+", t):
        w = m.group(0)
        if w in COULEURS and COULEURS[w] not in out: out.append(COULEURS[w])
    return out


# ── lecture d'une fiche ───────────────────────────────────────────────────────────────────────────────────────────
def _age(s):
    s = (s or '').lower(); m = re.search(r'(\d+)', s)
    if m: return int(m.group(1))
    for k, v in (('quarantaine', 45), ('cinquantaine', 55), ('soixantaine', 65), ('trentaine', 35), ('vingtaine', 25)):
        if k in s: return v + (3 if 'fin' in s else -3 if 'début' in s else 0)
    return 35


def fiche_vers_parametres(f):
    """fiche de la bible → paramètres de la marionnette (aucun tirage : tout vient du texte, le reste du nom)."""
    nom = f['name']; ap = (f.get('apparence') or '').lower(); te = (f.get('tenue') or '').lower(); tout = ap + ' ' + te
    h = zlib.crc32(nom.encode())
    age = _age(f.get('age'))
    femme = bool(re.search(r"\b(femme|fille|dame|adolescente|maman|tantie|tata|sœur|mamie|mademoiselle|madame|sorcière|go|lycéenne|voisine)\b", ap + ' ' + nom.lower())) \
        and not re.search(r'\bhomme\b|\bgarçon\b', ap)
    corp = 1.0
    mot_ = lambda k, t=ap: re.search(r'(?<![a-zàâçéèêëîïôûù])' + k + r'(?![a-zàâçéèêëîïôûù])', t) is not None   # mot entier (« bouclés » n'est pas « bouc »)
    for k, v in (('très rond', 1.45), ('gros ventre', 1.45), ('ronde', 1.3), ('rond', 1.25), ('corpulent', 1.35), ('forte', 1.3),
                 ('imposante', 1.3), ('pulpeuse', 1.15), ('généreuses', 1.18), ('robuste', 1.2), ('costaud', 1.22), ('trapu', 1.22),
                 ('carré', 1.15), ('maigre', 0.82), ('sec', 0.85), ('mince', 0.88), ('fluet', 0.85), ('fine', 0.9), ('élancé', 0.92)):
        if mot_(k) and not (k == 'fine' and mot_('fine moustache')) and not (k == 'rond' and mot_('rond de visage')): corp = v; break
    ventre = 'ventre' in ap or 'enceinte' in ap or corp >= 1.3
    cheveux_coul = (200, 200, 204) if re.search(r'blanc|gris', ap) and re.search(r'cheveux|barbe', ap) else (24, 20, 20)
    if age >= 70: cheveux_coul = (225, 225, 228)
    coiffe = None
    if 'foulard' in te or 'foulard' in ap: coiffe = 'foulard'
    elif 'calotte' in te: coiffe = 'calotte'
    elif 'casque de chantier' in te: coiffe = 'casque'
    elif 'casquette' in te: coiffe = 'casquette_envers' if "l’envers" in te or "l'envers" in te else 'casquette'
    elif 'bandeau' in te: coiffe = 'bandeau'
    cheveux = 'court'
    if re.search(r'chauve|crâne rasé', ap): cheveux = 'chauve'
    elif 'dégarni' in ap: cheveux = 'degarni'
    elif 'couettes' in ap: cheveux = 'couettes'
    elif 'afro' in ap: cheveux = 'afro'
    elif 'chignon' in ap: cheveux = 'chignon'
    elif 'tresses' in ap or 'vanilles' in ap: cheveux = 'tresses'
    elif re.search(r'longs cheveux|cheveux lisses|ondulés', ap): cheveux = 'longs'
    elif mot_('ras'): cheveux = 'ras'
    barbe = None
    if 'longue barbe' in ap: barbe = 'longue'
    elif 'barbe' in ap: barbe = 'courte'
    moustache = mot_('moustache') or mot_('grosse moustache'); bouc = mot_('bouc')
    lunettes = None
    if 'lunettes' in ap or 'lunettes' in te:
        lunettes = 'soleil' if 'soleil' in ap else 'rondes' if 'rondes' in ap else 'demi' if 'demi-lune' in ap else 'rect'
        if 'sur le front' in ap: lunettes = None
    lun_coul = (196, 40, 46) if 'lunettes rouges' in ap else (30, 28, 30)
    creoles = 'créoles' in ap or 'boucles' in te
    # tenue : type puis couleurs (dans l'ordre de la fiche)
    cols = _couleurs_texte(te) or [(90, 120, 170)]
    if 'boubou' in te or 'bazin' in te: tenue = 'boubou'
    elif 'infirmière' in te: tenue = 'infirmiere'
    elif re.search(r'\brobe\b|tunique|pagne', te) and femme: tenue = 'robe'
    elif 'combinaison' in te: tenue = 'combinaison'
    elif 'crop top' in te or 'jupe' in te: tenue = 'haut_jupe' if 'jupe' in te else 'haut_jean'
    elif re.search(r'maillot|t-shirt|tee-shirt|débardeur|survêtement|polo', te) and 'chemise' not in te: tenue = 'tshirt'
    else: tenue = 'chemise'
    veste = None
    if 'blouse blanche' in te: veste = ('blouse', (246, 246, 244))
    elif re.search(r'veste|costume|tailleur|blouson', te):
        m = re.search(r'(veste|costume|tailleur|blouson)[^,;]*', te); vc = _couleurs_texte(m.group(0)) if m else []
        veste = ('veste', vc[0] if vc else cols[0])
    elif 'gilet' in te:
        m = re.search(r'gilet[^,;]*', te); vc = _couleurs_texte(m.group(0)); veste = ('gilet', vc[0] if vc else (200, 120, 40))
    cravate = None
    if 'cravate' in te:
        m = re.search(r'cravate[^,;]*', te); vc = _couleurs_texte(m.group(0)); cravate = vc[0] if vc else (180, 30, 40)
    bas = None
    m = re.search(r'(pantalon|short|jean|jupe)[^,;]*', te)
    if m:
        vc = _couleurs_texte(m.group(0)); bas = vc[0] if vc else ((66, 98, 150) if 'jean' in m.group(0) else cols[-1])
    motif = 'fleurs' if re.search(r'wax|fleurs|pagne|tournesol', te) else 'leopard' if 'léopard' in te else \
        'carreaux' if 'carreaux' in te else 'broderie' if 'brodé' in te else None
    taille = float(f.get('taille') or (1.2 if age < 12 else 1.7))
    haut_coul = None   # haut visible sous la veste (« chemise blanche »)
    if veste:
        m = re.search(r'(chemise|chemisier|tee-shirt|t-shirt|débardeur|polo)[^,;]*', te); vc = _couleurs_texte(m.group(0)) if m else []
        haut_coul = vc[0] if vc else (246, 246, 244)
    objets = objets_fiche(te)
    return dict(nom=nom, age=age, femme=femme, taille=taille, corp=corp, ventre=ventre, peau=PEAUX[h % len(PEAUX)],
                cheveux=cheveux, cheveux_coul=cheveux_coul, coiffe=coiffe, coiffe_coul=cols[0], barbe=barbe, moustache=moustache,
                bouc=bouc, lunettes=lunettes, lun_coul=lun_coul, creoles=creoles, tenue=tenue, couleurs=cols, veste=veste,
                cravate=cravate, bas=bas or (ombre(cols[-1], 0.6) if tenue in ('chemise', 'tshirt') else None), motif=motif,
                haut_coul=haut_coul, objets=objets, stetho='stéthoscope' in te,
                enceinte='enceinte' in ap, numero=(re.search(r'numéro (\d+)', te).group(1) if re.search(r'numéro (\d+)', te) else None))


# ── objets de la fiche (ce que le personnage tient : il entre en scène avec, comme dans sa description) ─────────────
#    famille : plat (tenu à plat), tige (tenu par le bout), canne (jusqu'au sol), pot (contenant), boule
OBJETS = [('tablette', 'plat', (40, 96, 190), (0.50, 0.36)), ('ordinateur', 'plat', (60, 62, 70), (0.62, 0.42)),
          ('téléphone', 'plat', (30, 30, 36), (0.20, 0.36)), ('portable', 'plat', (30, 30, 36), (0.20, 0.36)),
          ('cahiers?', 'plat', (60, 90, 190), (0.42, 0.52)), ('copies', 'plat', (248, 248, 242), (0.46, 0.56)),
          ('dossiers?', 'plat', (190, 50, 46), (0.46, 0.56)), ('livres?', 'plat', (150, 40, 40), (0.42, 0.54)),
          ('journal', 'plat', (236, 232, 222), (0.44, 0.56)), ('carnet', 'plat', (40, 40, 46), (0.26, 0.34)),
          ('formulaires', 'plat', (248, 248, 242), (0.46, 0.56)), ('plans', 'tige', (238, 232, 214), (0.95, 0.12)),
          ('ardoise', 'plat', (40, 44, 46), (0.52, 0.40)), ('plaquette', 'plat', (240, 240, 240), (0.42, 0.54)),
          ('calculatrice', 'plat', (50, 50, 56), (0.26, 0.38)), ('passeport', 'plat', (120, 30, 40), (0.22, 0.30)),
          ('facture', 'plat', (250, 250, 246), (0.34, 0.46)), ('billets', 'plat', (120, 170, 120), (0.34, 0.20)),
          ('caisse', 'pot', (150, 150, 156), (0.60, 0.40)),
          ('stylo', 'tige', (200, 30, 36), (0.36, 0.035)), ('craie', 'tige', (250, 250, 250), (0.16, 0.04)),
          ('cuillère', 'tige', (170, 116, 66), (0.62, 0.06)), ('perche', 'tige', (40, 40, 44), (1.10, 0.04)),
          ('micro', 'tige', (40, 40, 44), (0.40, 0.08)), ('sceptre', 'tige', (220, 176, 50), (0.95, 0.07)),
          ('clé à molette', 'tige', (170, 172, 178), (0.50, 0.08)), ('lampe', 'tige', (60, 60, 66), (0.40, 0.09)),
          ('chapelet', 'tige', (120, 70, 40), (0.40, 0.03)), ('cuisse de poulet', 'boule', (176, 104, 46), (0.24, 0.30)),
          ('canne', 'canne', (130, 84, 44), (0, 0.05)), ('sac à main', 'pot', (230, 110, 160), (0.36, 0.30)),
          ('sac noir', 'pot', (30, 30, 34), (0.36, 0.30)), ('valise', 'pot', (60, 60, 70), (0.60, 0.80)),
          ('tasse', 'pot', (240, 240, 236), (0.16, 0.16)), ('bouteille', 'pot', (40, 130, 70), (0.12, 0.44)),
          ('calebasse', 'pot', (196, 150, 70), (0.36, 0.30)), ('marmite', 'pot', (36, 36, 38), (0.56, 0.40)),
          ('ballon', 'boule', (230, 110, 40), (0.46, 0.46)), ('nounours', 'boule', (150, 100, 60), (0.46, 0.56)),
          ('talkie-walkie', 'plat', (36, 36, 40), (0.14, 0.34))]


def objets_fiche(te):
    """→ [(nom, famille, couleur, (longueur, largeur) en têtes, main)] ; main : 'avant' (levé, à la main) ou 'arriere' (sous le bras)."""
    out = []
    for seg in re.split(r'[,;]', te):
        for nom, fam, col, dim in OBJETS:
            m = re.search(r'\b' + nom + r'\b', seg)
            if not m: continue
            vc = _couleurs_texte(seg[m.start():]); c = vc[0] if vc else col
            main = 'arriere' if re.search(r'sous le bras|contre elle|en bandoulière|à la ceinture', seg) else 'avant'
            if re.search(r'à la ceinture|en bandoulière|sur la tête|dans la poche|au cou|autour du cou', seg) and fam != 'pot': break
            out.append((re.sub(r's\?$', '', nom), fam, c, dim, main)); break
    av = [o for o in out if o[4] == 'avant']; ar = [o for o in out if o[4] == 'arriere']
    if len(av) > 1: ar = ar + av[1:]; av = av[:1]
    return {'avant': av[0] if av else None, 'arriere': ar[0] if ar else None}


# ── bouches dessinées (visèmes Rhubarb ; table A–G + X des studios) ────────────────────────────────────────────────
#                 ouverture, largeur, rondeur, dents du haut, lèvre sous les dents (F/V), langue (L)
VISEMES = {'A': (0.00, 0.50, 0.0, 0, 0, 0), 'B': (0.20, 0.62, 0.0, 1, 0, 0), 'C': (0.42, 0.66, 0.0, 1, 0, 0),
           'D': (0.78, 0.74, 0.0, 1, 0, 1), 'E': (0.46, 0.42, 0.6, 0, 0, 0), 'F': (0.20, 0.26, 1.0, 0, 0, 0),
           'G': (0.12, 0.56, 0.0, 1, 1, 0), 'H': (0.40, 0.56, 0.0, 1, 0, 1), 'X': (0.00, 0.48, 0.0, 0, 0, 0)}

# ── émotions (poids donnés par jeu.pistes) → visage : sourcils (hauteur, pente intérieure), ouverture des yeux,
#    coins de la bouche, ouverture de base (rire), joues
EMO_VISAGE = {
    'joie': dict(sourcils=0.15, pente=0.0, yeux=0.95, coins=0.8, base=0.10, joues=0.6),
    'rire': dict(sourcils=0.25, pente=0.0, yeux=0.55, coins=1.0, base=0.55, joues=1.0),
    'tristesse': dict(sourcils=0.15, pente=0.8, yeux=0.85, coins=-0.7, base=0.0, joues=0.0),
    'mecontent': dict(sourcils=-0.35, pente=-0.4, yeux=0.85, coins=-0.5, base=0.0, joues=0.0),
    'colere': dict(sourcils=-0.6, pente=-1.0, yeux=0.9, coins=-0.6, base=0.15, joues=0.0),
    'frustration': dict(sourcils=-0.4, pente=-0.6, yeux=0.8, coins=-0.5, base=0.0, joues=0.0),
    'surprise': dict(sourcils=1.0, pente=0.2, yeux=1.35, coins=0.0, base=0.45, joues=0.0),
    'peur': dict(sourcils=0.8, pente=0.9, yeux=1.3, coins=-0.5, base=0.25, joues=0.0),
    'malice': dict(sourcils=0.1, pente=-0.3, yeux=0.75, coins=0.6, base=0.0, joues=0.5, asym=1.0),
    'soupcon': dict(sourcils=-0.3, pente=-0.3, yeux=0.6, coins=-0.2, base=0.0, joues=0.0, asym=1.0),
    'innocent': dict(sourcils=0.5, pente=0.6, yeux=1.1, coins=0.3, base=0.0, joues=0.3),
    'frime': dict(sourcils=0.2, pente=-0.2, yeux=0.75, coins=0.7, base=0.0, joues=0.4, asym=1.0),
    'emu': dict(sourcils=0.3, pente=0.7, yeux=0.9, coins=0.3, base=0.0, joues=0.4),
    'degout': dict(sourcils=-0.3, pente=-0.4, yeux=0.7, coins=-0.8, base=0.05, joues=0.0, asym=1.0),
    'haussement': dict(sourcils=0.9, pente=0.0, yeux=1.1, coins=0.0, base=0.0, joues=0.0),
}


def visage_emotion(poids):
    """mélange des émotions pondérées (jeu.pistes) → paramètres du visage (neutre = tout à 0, yeux à 1)."""
    v = dict(sourcils=0.0, pente=0.0, yeux=1.0, coins=0.15, base=0.0, joues=0.0, asym=0.0)
    for e, w in (poids or {}).items():
        if e not in EMO_VISAGE or w <= 1e-3: continue
        w = float(np.clip(w, 0, 1))
        for k, x in EMO_VISAGE[e].items():
            v[k] += w * (x - (1.0 if k == 'yeux' else 0.15 if k == 'coins' else 0.0))
    v['yeux'] = float(np.clip(v['yeux'], 0.35, 1.45)); v['sourcils'] = float(np.clip(v['sourcils'], -0.8, 1.2))
    v['coins'] = float(np.clip(v['coins'], -1.0, 1.0)); v['base'] = float(np.clip(v['base'], 0, 0.7))
    return v


# ── outils de dessin ──────────────────────────────────────────────────────────────────────────────────────────────
def P():
    return skia.Path()


def ovale(cx, cy, rx, ry):
    p = P(); p.addOval(skia.Rect.MakeLTRB(cx - rx, cy - ry, cx + rx, cy + ry)); return p


def membre(x0, y0, x1, y1, r0, r1):
    """capsule effilée de (x0, y0) rayon r0 à (x1, y1) rayon r1 (bras, jambes, cou)."""
    a = math.atan2(y1 - y0, x1 - x0); nx, ny = -math.sin(a), math.cos(a)
    p = P(); p.moveTo(x0 + nx * r0, y0 + ny * r0); p.lineTo(x1 + nx * r1, y1 + ny * r1)
    p.arcTo(skia.Rect.MakeLTRB(x1 - r1, y1 - r1, x1 + r1, y1 + r1), math.degrees(a) + 90, -180, False)
    p.lineTo(x0 - nx * r0, y0 - ny * r0)
    p.arcTo(skia.Rect.MakeLTRB(x0 - r0, y0 - r0, x0 + r0, y0 + r0), math.degrees(a) - 90, -180, False); p.close()
    return p


def poly(pts, lisse=True):
    """contour fermé passant par les points (courbe lissée par milieux : formes rondes de dessin animé)."""
    p = P(); n = len(pts)
    if not lisse:
        p.moveTo(*pts[0]); [p.lineTo(*q) for q in pts[1:]]; p.close(); return p
    m = [((pts[i][0] + pts[(i + 1) % n][0]) / 2, (pts[i][1] + pts[(i + 1) % n][1]) / 2) for i in range(n)]
    p.moveTo(*m[-1])
    for i in range(n): p.quadTo(pts[i][0], pts[i][1], m[i][0], m[i][1])
    p.close(); return p


class Pinceau:
    """remplissage ombré au cel (ombre du côté opposé à la lumière du décor) + contour foncé de la même teinte."""

    def __init__(self, canvas, lumiere=(-0.55, -0.8), trait=2.0, teinte=(255, 246, 230)):
        self.c = canvas; self.lx, self.ly = lumiere; self.trait = trait; self.teinte = teinte

    def _t(self, col):   # la couleur prend la teinte de la lumière du décor (même étalonnage que la scène)
        return tuple(int(c * t / 255) for c, t in zip(col, self.teinte))

    def remplit(self, path, col, ombre_k=0.74, decal=None, contour=True, motif=None, alpha=255):
        c = self.c; col = self._t(col); d = decal if decal is not None else self.trait * 3.2
        p = skia.Paint(AntiAlias=True, Color=rvb(ombre(col, ombre_k), alpha)); c.drawPath(path, p)
        c.save(); c.clipPath(path, skia.ClipOp.kIntersect, True)
        q = skia.Path(path); q.offset(self.lx * d * 1.6, self.ly * d * 1.2)
        c.drawPath(q, skia.Paint(AntiAlias=True, Color=rvb(col, alpha)))
        if motif: motif(c, path)
        c.restore()
        if contour:
            c.drawPath(path, skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=self.trait,
                                        StrokeJoin=skia.Paint.kRound_Join, Color=rvb(ombre(col, 0.42), alpha)))

    def trait_(self, path, col, w=None, alpha=255):
        self.c.drawPath(path, skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=w or self.trait,
                                         StrokeCap=skia.Paint.kRound_Cap, StrokeJoin=skia.Paint.kRound_Join, Color=rvb(col, alpha)))

    def plein(self, path, col, alpha=255):
        self.c.drawPath(path, skia.Paint(AntiAlias=True, Color=rvb(self._t(col), alpha)))


def motif_wax(cols, r):
    """motif wax (fleurs rondes et points) dessiné dans la forme découpée."""
    a, b = (cols + [(246, 196, 40), (40, 150, 80)])[1:3] if len(cols) > 1 else ((246, 196, 40), (40, 150, 80))

    def f(c, path):
        bb = path.getBounds(); s = r * 2.6
        y = bb.top() - s; k = 0
        while y < bb.bottom() + s:
            x = bb.left() - s + (s / 2 if k % 2 else 0)
            while x < bb.right() + s:
                for k_ in range(6):
                    t_ = k_ * math.pi / 3
                    c.drawCircle(x + math.cos(t_) * r * 0.55, y + math.sin(t_) * r * 0.55, r * 0.42, skia.Paint(AntiAlias=True, Color=rvb(a, 235)))
                c.drawCircle(x, y, r * 0.38, skia.Paint(AntiAlias=True, Color=rvb(b, 240)))
                x += s
            y += s * 0.86; k += 1
    return f


def motif_carreaux(col, r):
    def f(c, path):
        bb = path.getBounds(); p = skia.Paint(AntiAlias=True, Color=rvb(ombre(col, 0.6), 110), StrokeWidth=r * 0.5)
        x = bb.left()
        while x < bb.right(): c.drawLine(x, bb.top(), x, bb.bottom(), p); x += r * 2.2
        y = bb.top()
        while y < bb.bottom(): c.drawLine(bb.left(), y, bb.right(), y, p); y += r * 2.2
    return f


def motif_leopard(r):
    def f(c, path):
        bb = path.getBounds(); s = r * 2.4; y = bb.top(); k = 0
        while y < bb.bottom() + s:
            x = bb.left() + (s / 2 if k % 2 else 0)
            while x < bb.right() + s:
                c.drawOval(skia.Rect.MakeLTRB(x - r * 0.7, y - r * 0.5, x + r * 0.7, y + r * 0.5),
                           skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=r * 0.35, Color=rvb((40, 26, 16), 220)))
                x += s
            y += s * 0.8; k += 1
    return f


# ── la marionnette ────────────────────────────────────────────────────────────────────────────────────────────────
POSE_REPOS = dict(tete=0.0, tete_lacet=0.0, tete_tangage=0.0, buste=0.0, buste_lacet=0.0, souffle=0.0, epaules=0.0,
                  bassin_x=0.0, bras_g=(8.0, 12.0), bras_d=(8.0, 12.0), regard=(0.0, 0.0), cligne=0.0, emotions={},
                  bouche='X', bouche_k=1.0, face=1.0)


class Marionnette:
    def __init__(self, prm):
        self.p = prm
        a = prm['age']
        self.ratio_tete = 0.36 if a < 12 else 0.32 if a < 18 else 0.30 if a < 65 else 0.29   # tête de dessin animé : visage lisible sur un téléphone

    # géométrie (repère : pieds au point (x, y), échelle ppm pixels par mètre ; y vers le bas)
    def gabarit(self, x, y, ppm):
        p = self.p; H = p['taille'] * ppm; hh = H * self.ratio_tete; hw = hh * (0.78 if p['femme'] else 0.84)
        nl = hh * 0.10; ys = y - H + hh + nl * 0.8; th = H * (0.28 if p['age'] >= 12 else 0.25); yh = ys + th
        sw = hw * 0.66 * (1.12 if not p['femme'] else 1.0) * (0.88 if p['age'] < 12 else 1.0) * (0.9 + 0.25 * (p['corp'] - 1))
        return dict(H=H, hh=hh, hw=hw, nl=nl, ys=ys, yh=yh, sw=sw, x=x, y=y, ppm=ppm, tete=(x, y - H + hh * 0.5))

    def dessine(self, canvas, x, y, ppm, pose=None, lumiere=(-0.55, -0.8), teinte=(255, 246, 230), ombre_sol=True):
        """dessine la marionnette pieds en (x, y) ; pose : canaux du jeu (POSE_REPOS pour les clés absentes).
        → boîtes utiles (corps, tête, bouche) pour le cadrage et le juge."""
        po = dict(POSE_REPOS); po.update(pose or {}); p = self.p; G = self.gabarit(x, y, ppm)
        H, hh, hw, ys, yh, sw = G['H'], G['hh'], G['hw'], G['ys'], G['yh'], G['sw']
        trait = max(1.2, hh * 0.022); B = Pinceau(canvas, lumiere, trait, teinte); f = 1.0 if po['face'] >= 0 else -1.0
        peau = p['peau']; corp = p['corp']
        if ombre_sol:   # ombre portée au sol, poussée à l'opposé de la lumière (la même que celle des objets du décor)
            sp = skia.Paint(AntiAlias=True, Color=rvb((20, 14, 10), 110)); sp.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, hh * 0.08))
            ox = -lumiere[0] * hh * 0.5; canvas.drawOval(skia.Rect.MakeLTRB(x - sw * 1.3 + ox, y - hh * 0.07, x + sw * 1.3 + ox, y + hh * 0.07), sp)
        bx = x + po['bassin_x'] * hh * 0.02
        # jambes et chaussures (les robes et boubous les couvrent)
        lj = (y - yh); ecart = sw * 0.42
        col_j = p['bas'] or peau
        for s in (-1, 1):
            if p['tenue'] in ('robe', 'boubou', 'infirmiere') and p['tenue'] != 'infirmiere': continue
            B.remplit(membre(bx + s * ecart * 0.9, yh, bx + s * ecart, y - hh * 0.10, sw * 0.30 * corp ** 0.5, sw * 0.22), col_j)
        for s in (-1, 1):
            B.remplit(ovale(bx + s * ecart + f * hh * 0.06, y - hh * 0.06, hh * 0.17, hh * 0.08), (40, 30, 26) if p['age'] >= 12 else (230, 230, 236))
        # buste (rotation douce autour du bassin) + souffle
        canvas.save(); canvas.rotate(po['buste'] * 0.8, bx, yh)
        sy = 1.0 + 0.012 * po['souffle']; canvas.scale(1.0, sy); canvas.translate(0, (1 - sy) * yh / sy)
        dy_ep = -po['epaules'] * hh * 0.03
        cols = p['couleurs']; c1 = cols[0]; c2 = cols[1] if len(cols) > 1 else ombre(c1, 0.8)
        mot = motif_wax(cols, hh * 0.085) if p['motif'] == 'fleurs' else motif_carreaux(c1, hh * 0.04) if p['motif'] == 'carreaux' \
            else motif_leopard(hh * 0.06) if p['motif'] == 'leopard' else None
        # bras arrière (derrière le buste)
        ob = p.get('objets') or {}; epx = sw * p['corp'] * 0.84; epy = ys + dy_ep + hh * 0.05
        self._bras(B, canvas, po['bras_g'] if f > 0 else po['bras_d'], bx - f * epx, epy, hh, sw, -f, derriere=True, objet=ob.get('arriere'), sol=y)
        largeur_bas = sw * (1.55 if p['tenue'] in ('robe', 'boubou') else 0.95) * corp
        ventre = sw * (0.35 if p['ventre'] else 0.0) * corp
        if p['tenue'] in ('robe', 'boubou'):
            bas_y = y - hh * 0.12
            robe = P(); robe.moveTo(bx - sw * corp * 0.9, ys + dy_ep)
            robe.quadTo(bx, ys + dy_ep - hh * 0.03, bx + sw * corp * 0.9, ys + dy_ep)
            robe.quadTo(bx + sw * 1.08 * corp + f * ventre, yh - th_(G) * 0.15, bx + sw * 1.0 * corp, yh)
            robe.lineTo(bx + largeur_bas, bas_y); robe.quadTo(bx, bas_y + hh * 0.05, bx - largeur_bas, bas_y)
            robe.lineTo(bx - sw * 1.0 * corp, yh); robe.quadTo(bx - sw * 1.08 * corp, yh - th_(G) * 0.15, bx - sw * corp * 0.9, ys + dy_ep); robe.close()
            B.remplit(robe, c1, motif=mot)
            if p['motif'] == 'broderie':   # plastron brodé d'or
                pl = poly([(bx - sw * 0.35, ys + dy_ep), (bx + sw * 0.35, ys + dy_ep), (bx + sw * 0.22, ys + hh * 0.75), (bx - sw * 0.22, ys + hh * 0.75)])
                B.remplit(pl, (214, 168, 52), contour=False)
        else:
            torse = [(bx - sw * corp, ys + dy_ep), (bx + sw * corp, ys + dy_ep), (bx + sw * 0.98 * corp + f * ventre, yh - (yh - ys) * 0.35),
                     (bx + sw * 0.88 * corp, yh + hh * 0.05), (bx - sw * 0.88 * corp, yh + hh * 0.05), (bx - sw * 0.98 * corp, yh - (yh - ys) * 0.35)]
            haut = p.get('haut_coul') or c1
            if p['tenue'] == 'infirmiere': haut = (238, 128, 172)
            B.remplit(poly(torse), haut, motif=None if p.get('haut_coul') else mot)
            if p['tenue'] == 'infirmiere':   # col en V et poches blancs (fiche : « tunique rose à col et poches blancs »)
                B.remplit(poly([(bx - sw * 0.46, ys + dy_ep - hh * 0.01), (bx, ys + dy_ep + hh * 0.36), (bx + sw * 0.46, ys + dy_ep - hh * 0.01),
                                (bx + sw * 0.24, ys + dy_ep - hh * 0.01), (bx, ys + dy_ep + hh * 0.22), (bx - sw * 0.24, ys + dy_ep - hh * 0.01)], False), (250, 250, 248))
                for s_ in (-1, 1):
                    pk = skia.RRect.MakeRectXY(skia.Rect.MakeLTRB(bx + s_ * sw * 0.62 - sw * 0.2, yh - hh * 0.30, bx + s_ * sw * 0.62 + sw * 0.2, yh - hh * 0.08), hh * 0.02, hh * 0.02)
                    pp = P(); pp.addRRect(pk); B.remplit(pp, (250, 250, 248))
            if p['tenue'] == 'haut_jupe' and p['bas']:
                B.remplit(poly([(bx - sw * 0.9 * corp, yh), (bx + sw * 0.9 * corp, yh), (bx + sw * 1.15, yh + (y - yh) * 0.45), (bx - sw * 1.15, yh + (y - yh) * 0.45)], False), p['bas'])
            if p['numero']:
                fnt = skia.Font(skia.Typeface('DejaVu Sans', skia.FontStyle.Bold()), hh * 0.32)
                canvas.drawString(p['numero'], bx - hh * 0.17, ys + hh * 0.62, fnt, skia.Paint(AntiAlias=True, Color=rvb((30, 120, 60))))
            if p['veste']:   # pans de veste ouverts en V sur la chemise, revers rabattus
                kind, vc = p['veste']; yv = ys + dy_ep + (yh - ys) * 0.55
                for s in (-1, 1):
                    pan = poly([(bx + s * sw * corp * 1.02, ys + dy_ep), (bx + s * sw * 0.40, ys + dy_ep - hh * 0.01), (bx + s * sw * 0.07, yv),
                                (bx + s * sw * 0.07, yh + hh * 0.05), (bx + s * sw * 0.9 * corp, yh + hh * 0.05 + (hh * 0.25 if kind == 'blouse' else 0)),
                                (bx + s * sw * 0.99 * corp + (f * ventre if s == f else 0), yh - (yh - ys) * 0.35)], False)
                    B.remplit(pan, vc)
                    if kind != 'gilet':
                        rev = poly([(bx + s * sw * 0.40, ys + dy_ep - hh * 0.01), (bx + s * sw * 0.62, ys + dy_ep + hh * 0.02), (bx + s * sw * 0.40, ys + dy_ep + hh * 0.22),
                                    (bx + s * sw * 0.10, yv - hh * 0.02)], False)
                        B.remplit(rev, ombre(vc, 0.86))
            if p['cravate']:
                B.remplit(poly([(bx - hw * 0.07, ys + hh * 0.02), (bx + hw * 0.07, ys + hh * 0.02), (bx + hw * 0.09, ys + hh * 0.85),
                                (bx, ys + hh * 0.98), (bx - hw * 0.09, ys + hh * 0.85)], False), p['cravate'])
        if p.get('stetho'):   # stéthoscope autour du cou, pavillon sur la poitrine
            st = P(); st.moveTo(bx - sw * 0.40, ys + dy_ep - hh * 0.02); st.cubicTo(bx - sw * 0.46, ys + hh * 0.30, bx - sw * 0.20, ys + hh * 0.50, bx - sw * 0.10, ys + hh * 0.52)
            st.moveTo(bx + sw * 0.40, ys + dy_ep - hh * 0.02); st.cubicTo(bx + sw * 0.46, ys + hh * 0.30, bx + sw * 0.30, ys + hh * 0.40, bx + sw * 0.28, ys + hh * 0.46)
            B.trait_(st, (70, 74, 84), w=hh * 0.03)
            B.remplit(ovale(bx + sw * 0.28, ys + hh * 0.49, hh * 0.045, hh * 0.045), (196, 200, 208))
        # cou et tête (rotation autour du cou)
        cx, cy = bx + f * hw * 0.04, ys - G['nl'] * 0.3
        B.remplit(membre(cx, ys + hh * 0.05, cx, cy - hh * 0.12, hw * 0.17, hw * 0.16), peau)
        boites = self._tete(B, canvas, po, G, cx, cy, f)
        # bras avant
        self._bras(B, canvas, po['bras_d'] if f > 0 else po['bras_g'], bx + f * epx, epy, hh, sw, f, derriere=False, objet=ob.get('avant'), sol=y)
        canvas.restore()
        boites['corps'] = (x - sw * 1.6 * corp, y - H, x + sw * 1.6 * corp, y)
        return boites

    def _bras(self, B, canvas, ang, sx, sy, hh, sw, cote, derriere, objet=None, sol=None):
        """bras à deux segments : ang = (épaule, coude) en degrés (0 = pendant le long du corps, positif = vers l'avant).
        Proportions de dessin animé : poignet à hauteur de hanche au repos. objet : ce que la main tient (fiche)."""
        p = self.p; a1, a2 = ang; L1 = hh * 0.60; L2 = hh * 0.50
        t1 = math.radians(a1); ex, ey = sx + cote * (math.sin(t1) * L1 * 0.8 + L1 * 0.05), sy + math.cos(t1) * L1
        t2 = math.radians(a1 + a2); hx, hy = ex + cote * math.sin(t2) * L2 * 0.85, ey + math.cos(t2) * L2
        manche = p['veste'][1] if p['veste'] else p['couleurs'][0]
        if p['tenue'] == 'infirmiere': manche = (238, 128, 172)
        large = p['tenue'] == 'boubou'
        r = sw * 0.22 * p['corp'] ** 0.5; ok = 0.62 if derriere else 0.74
        B.remplit(membre(sx, sy, ex, ey, r * (1.6 if large else 1.05), r * (1.8 if large else 0.92)), manche, ombre_k=ok)
        court = p['tenue'] in ('tshirt', 'haut_jupe', 'haut_jean', 'infirmiere') and not p['veste']
        avant_bras_couvert = large or (p['veste'] is not None) or p['tenue'] in ('chemise', 'combinaison')
        B.remplit(membre(ex, ey, hx, hy, r * (1.5 if large else 0.88), r * 0.72), manche if avant_bras_couvert else p['peau'], ombre_k=ok)
        if court:   # manche courte : le bas de la manche coupe le haut du bras
            B.remplit(membre(sx, sy, sx + (ex - sx) * 0.55, sy + (ey - sy) * 0.55, r * 1.12, r * 1.02), manche, ombre_k=ok)
        if p.get('haut_coul') and not large:   # manchette de la chemise sous la veste
            ux, uy = (hx - ex), (hy - ey); n_ = math.hypot(ux, uy) or 1
            B.remplit(membre(hx - ux / n_ * r * 0.55, hy - uy / n_ * r * 0.55, hx - ux / n_ * r * 0.05, hy - uy / n_ * r * 0.05, r * 0.74, r * 0.72), p['haut_coul'], ombre_k=ok)
        ang_main = math.degrees(math.atan2(hy - ey, hx - ex))
        if objet and objet[1] != 'canne': self._objet(B, canvas, objet, hx, hy + r * 0.4, hh, cote, ang_main, derriere, sol)
        B.remplit(ovale(hx, hy + r * 0.4, r * 0.95, r * 1.05), p['peau'], ombre_k=ok)
        B.remplit(ovale(hx + cote * r * 0.75, hy, r * 0.32, r * 0.5), p['peau'], ombre_k=ok)   # pouce
        if objet and objet[1] == 'canne': self._objet(B, canvas, objet, hx, hy + r * 0.4, hh, cote, ang_main, derriere, sol)
        return hx, hy

    def _objet(self, B, canvas, ob, hx, hy, hh, cote, ang_main, derriere, sol):
        nom, fam, col, (lo, la), _ = ob; ok = 0.62 if derriere else 0.74
        canvas.save(); canvas.translate(hx, hy)
        if fam == 'plat':   # tenu debout dans la main, face au public (tablette, cahier, téléphone…)
            w, h = la * hh * 1.0, lo * hh * 1.0
            if nom in ('tablette', 'ordinateur', 'ardoise', 'billets'): w, h = lo * hh, la * hh
            canvas.rotate(cote * 8)
            rr = skia.RRect.MakeRectXY(skia.Rect.MakeLTRB(-w * 0.5 + cote * w * 0.18, -h * 0.82, w * 0.5 + cote * w * 0.18, h * 0.18), hh * 0.03, hh * 0.03)   # tenu par le bas
            pa = P(); pa.addRRect(rr); B.remplit(pa, col, ombre_k=ok)
            if nom in ('tablette', 'téléphone', 'portable', 'ordinateur'):   # écran
                e = skia.RRect.MakeRectXY(skia.Rect.MakeLTRB(-w * 0.42 + cote * w * 0.18, -h * 0.74, w * 0.42 + cote * w * 0.18, h * 0.10), hh * 0.02, hh * 0.02)
                pe = P(); pe.addRRect(e); B.plein(pe, (200, 226, 246))
            elif nom in ('cahier', 'copie', 'livre', 'dossier', 'formulaire', 'journal', 'facture', 'carnet', 'plaquette'):
                for i in range(3):   # lignes d'écriture / tranche
                    yy = -h * 0.65 + i * h * 0.22
                    B.trait_(_ligne_(-w * 0.32 + cote * w * 0.18, yy, w * 0.30 + cote * w * 0.18, yy), (150, 150, 160), w=max(1.0, hh * 0.012))
        elif fam == 'tige':   # tenu par le bout, pointe en l'air (stylo levé, cuillère, perche, sceptre)
            canvas.rotate(-cote * 22)
            L = lo * hh; e = max(la * hh, hh * 0.03)
            B.remplit(membre(0, hh * 0.08, 0, -L, e * 0.55, e * 0.45), col, ombre_k=ok)
            if nom == 'stylo': B.remplit(membre(0, -L * 0.85, 0, -L, e * 0.5, e * 0.2), (240, 240, 236), contour=False)
        elif fam == 'pot':   # contenant tenu par l'anse, sous la main
            w, h = lo * hh, la * hh
            if nom == 'bouteille': w, h = la * hh, lo * hh
            rr = skia.RRect.MakeRectXY(skia.Rect.MakeLTRB(-w / 2, hh * 0.02, w / 2, hh * 0.02 + h), w * 0.2, w * 0.2)
            pa = P(); pa.addRRect(rr); B.remplit(pa, col, ombre_k=ok)
        elif fam == 'boule':
            B.remplit(ovale(cote * lo * hh * 0.3, la * hh * 0.25, lo * hh * 0.5, la * hh * 0.5), col, ombre_k=ok)
        elif fam == 'canne' and sol is not None:
            canvas.restore(); canvas.save()
            B.remplit(membre(hx, hy - hh * 0.05, hx + cote * hh * 0.12, sol, hh * 0.035, hh * 0.03), col, ombre_k=ok)
            canvas.restore(); return
        canvas.restore()

    def _tete(self, B, canvas, po, G, cx, cy, f):
        p = self.p; hh, hw = G['hh'], G['hw']; peau = p['peau']
        canvas.save(); canvas.rotate(po['tete'] * 0.9 + po['buste'] * 0.2, cx, cy)
        hcx, hcy = cx, cy - hh * 0.5 + po['tete_tangage'] * hh * 0.004
        yaw = float(np.clip(po['tete_lacet'] / 20.0, -1, 1)); fx = f * 0.30 + yaw * 0.35   # visage de trois quarts vers le partenaire
        dx = fx * hw * 0.18; dyn = po['tete_tangage'] * hh * 0.006
        # cheveux arrière (tresses, longs, chignon)
        if p['cheveux'] in ('tresses', 'longs') and p['coiffe'] not in ('foulard',):
            B.remplit(poly([(hcx - hw * 0.55, hcy - hh * 0.2), (hcx + hw * 0.55, hcy - hh * 0.2), (hcx + hw * 0.62, hcy + hh * 0.85),
                            (hcx - hw * 0.62, hcy + hh * 0.85)]), p['cheveux_coul'], ombre_k=0.6)
        if p['cheveux'] == 'chignon' and p['coiffe'] is None:
            B.remplit(ovale(hcx - f * hw * 0.35, hcy - hh * 0.42, hw * 0.28, hh * 0.2), p['cheveux_coul'])
        # oreilles
        for s in (-1, 1):
            B.remplit(ovale(hcx + s * hw * 0.5 - dx * 0.4, hcy + hh * 0.04, hw * 0.10, hh * 0.12), peau)
            if p['creoles']:
                B.trait_(ovale(hcx + s * hw * 0.5 - dx * 0.4, hcy + hh * 0.20, hw * 0.07, hw * 0.07), (226, 176, 48), w=B.trait * 1.4)
        # forme du visage (mâchoire plus carrée chez l'homme, joues pleines chez les ronds)
        jw = 0.46 if p['femme'] else 0.5; jw *= (1 + 0.12 * (p['corp'] - 1))
        face = poly([(hcx, hcy - hh * 0.5), (hcx + hw * 0.5, hcy - hh * 0.32), (hcx + hw * 0.52, hcy + hh * 0.08), (hcx + hw * jw * 0.85, hcy + hh * 0.36),
                     (hcx + dx * 0.4, hcy + hh * 0.5), (hcx - hw * jw * 0.85, hcy + hh * 0.36), (hcx - hw * 0.52, hcy + hh * 0.08), (hcx - hw * 0.5, hcy - hh * 0.32)])
        B.remplit(face, peau, decal=hh * 0.05)
        E = visage_emotion(po['emotions'])
        if E['joues'] > 0.05:
            for s in (-1, 1):
                jp = skia.Paint(AntiAlias=True, Color=rvb((210, 90, 80), int(70 * E['joues'])))
                jp.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, hw * 0.05))
                canvas.drawOval(skia.Rect.MakeXYWH(hcx + dx + s * hw * 0.28 - hw * 0.1, hcy + hh * 0.12, hw * 0.2, hh * 0.08), jp)
        # cheveux / coiffe (dessus)
        self._cheveux(B, canvas, hcx, hcy, hh, hw, f)
        # yeux
        ey = hcy + hh * 0.0 + dyn; es = hw * 0.25 * (1.12 if p['age'] < 12 else 1.0) * (1.05 if p['femme'] else 1.0)
        rx, ry = po['regard']; ouv = float(np.clip(E['yeux'] * (1 - po['cligne']), 0.0, 1.5))
        yeux_box = []
        for k, s in enumerate((-1, 1)):
            loin = (s * f) < 0; sc = 0.86 if loin else 1.0
            ex = hcx + dx + s * hw * 0.22; w = es * sc; h = es * 1.12 * sc
            bl = ovale(ex, ey, w * 0.5, h * 0.5 * max(0.08, min(ouv, 1.35)))
            canvas.drawPath(bl, skia.Paint(AntiAlias=True, Color=rvb(B._t((250, 248, 244)))))
            canvas.save(); canvas.clipPath(bl, skia.ClipOp.kIntersect, True)
            ix = ex + (rx * 0.22 + fx * 0.18) * w; iy = ey + ry * 0.18 * h
            canvas.drawCircle(ix, iy, w * 0.30, skia.Paint(AntiAlias=True, Color=rvb((64, 38, 22))))
            canvas.drawCircle(ix, iy, w * 0.16, skia.Paint(AntiAlias=True, Color=rvb((12, 8, 6))))
            canvas.drawCircle(ix - w * 0.09, iy - w * 0.10, w * 0.07, skia.Paint(AntiAlias=True, Color=rvb((255, 255, 255))))
            canvas.restore()
            B.trait_(bl, (40, 24, 16), w=B.trait * 1.1)
            # paupière haute : trait épais (lisible même petit)
            lid = P(); lid.moveTo(ex - w * 0.55, ey - h * 0.08 * ouv); lid.quadTo(ex, ey - h * 0.62 * min(ouv, 1.3), ex + w * 0.55, ey - h * 0.08 * ouv)
            B.trait_(lid, (30, 18, 12), w=B.trait * 1.8)
            # sourcil : hauteur, pente intérieure (s côté intérieur), asymétrie (malice, soupçon)
            haut = E['sourcils'] + (0.35 * E['asym'] * (1 if s == f else -0.6))
            byi = ey - h * 0.95 - haut * h * 0.45 - (E['pente'] * h * 0.28)
            bye = ey - h * 0.95 - haut * h * 0.45 + (E['pente'] * h * 0.10)
            xi, xe = ex - s * w * 0.45, ex + s * w * 0.55
            br = P(); br.moveTo(xi, byi); br.quadTo((xi + xe) / 2, min(byi, bye) - h * 0.18, xe, bye)
            B.trait_(br, p['cheveux_coul'] if p['age'] >= 70 else (22, 14, 10), w=hh * 0.045)
            yeux_box.append((ex - w * 0.6, ey - h * 1.2, ex + w * 0.6, ey + h * 0.6))
        # nez (pointe vers le partenaire)
        nx, ny = hcx + dx * 1.35, hcy + hh * 0.15 + dyn
        nez = poly([(nx - hw * 0.07, ny + hh * 0.03), (nx + f * hw * 0.02, ny - hh * 0.12), (nx + hw * 0.08, ny + hh * 0.03), (nx, ny + hh * 0.06)])
        B.remplit(nez, ombre(peau, 0.92), decal=hh * 0.02)
        # lunettes
        if p['lunettes']:
            for k, s in enumerate((-1, 1)):
                ex = hcx + dx + s * hw * 0.22; w = es * (0.86 if (s * f) < 0 else 1.0)
                r = skia.Rect.MakeLTRB(ex - w * 0.62, ey - w * 0.55, ex + w * 0.62, ey + w * 0.55)
                if p['lunettes'] == 'soleil':
                    canvas.drawRoundRect(r, w * 0.3, w * 0.3, skia.Paint(AntiAlias=True, Color=rvb((20, 20, 26), 245)))
                lp = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=B.trait * 1.6, Color=rvb(p['lun_coul']))
                if p['lunettes'] == 'rondes': canvas.drawOval(r, lp)
                else: canvas.drawRoundRect(r, w * 0.2, w * 0.2, lp)
            pont = P(); pont.moveTo(hcx + dx - hw * 0.09, ey - es * 0.15); pont.lineTo(hcx + dx + hw * 0.09, ey - es * 0.15)
            B.trait_(pont, p['lun_coul'], w=B.trait * 1.4)
        # bouche dessinée
        boite_bouche = self._bouche(B, canvas, hcx + dx * 1.1, hcy + hh * 0.31 + dyn, hw, hh, po, E)
        # barbe / moustache / bouc
        if p['barbe']:
            longue = p['barbe'] == 'longue'
            bb = poly([(hcx - hw * 0.46, hcy + hh * 0.1), (hcx - hw * 0.30, hcy + hh * (0.62 if longue else 0.5)), (hcx + dx * 0.4, hcy + hh * (0.82 if longue else 0.56)),
                       (hcx + hw * 0.30, hcy + hh * (0.62 if longue else 0.5)), (hcx + hw * 0.46, hcy + hh * 0.1), (hcx + dx, hcy + hh * 0.40)])
            B.remplit(bb, p['cheveux_coul'] if p['age'] >= 55 else (36, 28, 24), ombre_k=0.75, alpha=235)
            self._bouche(B, canvas, hcx + dx * 1.1, hcy + hh * 0.31 + dyn, hw, hh, po, E)   # bouche redessinée par-dessus la barbe
        if p['moustache']:
            mo = P(); mo.moveTo(hcx + dx * 1.1 - hw * 0.15, hcy + hh * 0.27 + dyn); mo.quadTo(hcx + dx * 1.1, hcy + hh * 0.22 + dyn, hcx + dx * 1.1 + hw * 0.15, hcy + hh * 0.27 + dyn)
            B.trait_(mo, (30, 22, 18) if p['age'] < 60 else p['cheveux_coul'], w=hh * 0.035)
        if p['bouc'] and not p['barbe']:
            B.remplit(ovale(hcx + dx * 0.9, hcy + hh * 0.46, hw * 0.07, hh * 0.05), (34, 26, 22), contour=False)
        canvas.restore()
        x0 = min(b[0] for b in yeux_box); x1 = max(b[2] for b in yeux_box)
        return {'tete': (hcx - hw * 0.62, hcy - hh * 0.62, hcx + hw * 0.62, hcy + hh * 0.56), 'yeux': (x0, min(b[1] for b in yeux_box), x1, max(b[3] for b in yeux_box)),
                'bouche': boite_bouche}

    def _bouche(self, B, canvas, mx, my, hw, hh, po, E):
        v = po['bouche'] if po['bouche'] in VISEMES else 'X'; o, lw, rd, dents, fv, langue = VISEMES[v]
        k = float(np.clip(po.get('bouche_k', 1.0), 0, 1)); o = o * k; o = max(o, E['base'] * (1 if v in 'XA' else 0.5))
        w = hw * (0.36 + 0.24 * lw) * (1 - 0.35 * rd) * (1 + 0.15 * max(E['coins'], 0)); hgt = hh * 0.27 * o * (1 + 0.35 * rd)
        coin = E['coins'] * hh * 0.035; lev = (110, 52, 46)
        xl, xr = mx - w / 2, mx + w / 2
        if o < 0.07:   # bouche fermée : un trait en sourire / moue, lèvre inférieure suggérée
            l = P(); l.moveTo(xl, my - coin); l.quadTo(mx, my + coin * 0.8 + hh * 0.005, xr, my - coin)
            B.trait_(l, (52, 20, 18), w=B.trait * 2.2)
            lb = P(); lb.moveTo(mx - w * 0.22, my + hh * 0.045); lb.quadTo(mx, my + hh * 0.07, mx + w * 0.22, my + hh * 0.045)
            B.trait_(lb, ombre(B._t(self.p['peau']), 0.75), w=B.trait)
            return (xl, my - hh * 0.05, xr, my + hh * 0.08)
        top = my - hgt * 0.35; bot = my + hgt * 0.65
        bouche = P(); bouche.moveTo(xl, my - coin)
        bouche.cubicTo(xl + w * 0.2, top - hgt * 0.05, xr - w * 0.2, top - hgt * 0.05, xr, my - coin)
        bouche.cubicTo(xr - w * 0.1, bot + hgt * 0.1, xl + w * 0.1, bot + hgt * 0.1, xl, my - coin); bouche.close()
        canvas.drawPath(bouche, skia.Paint(AntiAlias=True, Color=rvb(B._t((70, 18, 22)))))
        canvas.save(); canvas.clipPath(bouche, skia.ClipOp.kIntersect, True)
        if dents and not fv:
            canvas.drawRect(skia.Rect.MakeLTRB(xl, top - hgt, xr, top + hgt * 0.28), skia.Paint(AntiAlias=True, Color=rvb((250, 248, 242))))
        if fv:
            canvas.drawRect(skia.Rect.MakeLTRB(xl, top - hgt, xr, my + hgt * 0.2), skia.Paint(AntiAlias=True, Color=rvb((250, 248, 242))))
        if langue or o > 0.5:
            canvas.drawOval(skia.Rect.MakeLTRB(mx - w * 0.3, bot - hgt * 0.45, mx + w * 0.3, bot + hgt * 0.4), skia.Paint(AntiAlias=True, Color=rvb(B._t((214, 96, 104)))))
        canvas.restore()
        B.trait_(bouche, lev, w=B.trait * (1.3 + 1.1 * min(1.0, o / 0.4)))
        return (xl, top - hgt * 0.1, xr, bot + hgt * 0.1)

    def _cheveux(self, B, canvas, hcx, hcy, hh, hw, f):
        p = self.p; c = p['cheveux_coul']; co = p['coiffe']
        if co == 'foulard':
            g = poly([(hcx - hw * 0.62, hcy - hh * 0.18), (hcx - hw * 0.70, hcy - hh * 0.62), (hcx - hw * 0.2, hcy - hh * 0.98), (hcx + hw * 0.35, hcy - hh * 1.02),
                      (hcx + hw * 0.78, hcy - hh * 0.66), (hcx + hw * 0.62, hcy - hh * 0.18), (hcx, hcy - hh * 0.30)])
            B.remplit(g, p['coiffe_coul'], motif=motif_wax(p['couleurs'], hh * 0.05) if p['motif'] == 'fleurs' else None)
            B.remplit(ovale(hcx + f * hw * 0.42, hcy - hh * 0.88, hw * 0.22, hh * 0.14), p['coiffe_coul'])   # nœud
            return
        if p['cheveux'] == 'afro':
            B.remplit(ovale(hcx, hcy - hh * 0.32, hw * 0.82, hh * 0.52), c, ombre_k=0.6)
        elif p['cheveux'] == 'couettes':
            for s in (-1, 1): B.remplit(ovale(hcx + s * hw * 0.62, hcy - hh * 0.45, hw * 0.28, hh * 0.22), c, ombre_k=0.6)
            for s in (-1, 1): B.remplit(ovale(hcx + s * hw * 0.48, hcy - hh * 0.30, hw * 0.08, hh * 0.06), (236, 112, 168), contour=False)
        if p['cheveux'] not in ('chauve',) and co not in ('calotte', 'casquette', 'casquette_envers', 'casque'):
            hauteur = {'ras': 0.06, 'degarni': 0.05, 'court': 0.10, 'tresses': 0.12, 'longs': 0.12, 'chignon': 0.10, 'afro': 0.0, 'couettes': 0.08}.get(p['cheveux'], 0.1)
            calotte = poly([(hcx - hw * 0.53, hcy - hh * 0.10), (hcx - hw * 0.52, hcy - hh * 0.42), (hcx - hw * 0.2, hcy - hh * (0.56 + hauteur)), (hcx + hw * 0.25, hcy - hh * (0.56 + hauteur)),
                            (hcx + hw * 0.53, hcy - hh * 0.42), (hcx + hw * 0.53, hcy - hh * 0.10), (hcx + hw * 0.35, hcy - hh * (0.34 if p['cheveux'] != 'degarni' else 0.42)),
                            (hcx - hw * 0.35, hcy - hh * (0.34 if p['cheveux'] != 'degarni' else 0.42))])
            if p['cheveux'] != 'afro': B.remplit(calotte, c, ombre_k=0.6)
        if co == 'calotte':
            B.remplit(poly([(hcx - hw * 0.5, hcy - hh * 0.36), (hcx - hw * 0.46, hcy - hh * 0.72), (hcx + hw * 0.46, hcy - hh * 0.72), (hcx + hw * 0.5, hcy - hh * 0.36)], False),
                      p['coiffe_coul'] if p['coiffe_coul'] != p['couleurs'][0] or p['tenue'] != 'boubou' else (240, 228, 200))
        elif co in ('casquette', 'casquette_envers', 'casque'):
            col = (246, 196, 40) if co == 'casque' else p['coiffe_coul']
            B.remplit(poly([(hcx - hw * 0.54, hcy - hh * 0.30), (hcx - hw * 0.5, hcy - hh * 0.62), (hcx, hcy - hh * 0.74), (hcx + hw * 0.5, hcy - hh * 0.62), (hcx + hw * 0.54, hcy - hh * 0.30)]), col)
            vs = -f if co == 'casquette_envers' else f
            if co != 'casque': B.remplit(poly([(hcx + vs * hw * 0.2, hcy - hh * 0.34), (hcx + vs * hw * 0.95, hcy - hh * 0.30), (hcx + vs * hw * 0.9, hcy - hh * 0.40), (hcx + vs * hw * 0.2, hcy - hh * 0.42)], False), ombre(col, 0.85))
        elif co == 'bandeau':
            B.remplit(poly([(hcx - hw * 0.55, hcy - hh * 0.36), (hcx + hw * 0.55, hcy - hh * 0.36), (hcx + hw * 0.52, hcy - hh * 0.46), (hcx - hw * 0.52, hcy - hh * 0.46)], False), p['coiffe_coul'])


def _ligne_(x0, y0, x1, y1):
    q = P(); q.moveTo(x0, y0); q.lineTo(x1, y1); return q


def th_(G):
    return G['yh'] - G['ys']


def bible(chemin=None):
    import json, os
    chemin = chemin or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bible_comique.json')
    return {f['name']: f for f in json.load(open(chemin))['personnages']}


def marionnette(nom, fiches=None):
    fiches = fiches or bible(); return Marionnette(fiche_vers_parametres(fiches[nom]))


def image(canvas_fn, w, h, fond=(0, 0, 0, 0)):
    """rend une fonction de dessin → tableau RGBA (h, w, 4) uint8."""
    s = skia.Surface(w, h); c = s.getCanvas(); c.clear(skia.ColorSetARGB(fond[3], fond[0], fond[1], fond[2])); canvas_fn(c)
    return s.makeImageSnapshot().toarray(colorType=skia.ColorType.kRGBA_8888_ColorType)


if __name__ == '__main__':   # planche de casting : toute la bible en marionnettes
    import sys, cv2
    F = bible(); noms = list(F); n = len(noms); col = 9; W_, H_ = 260, 330; out = np.zeros(((n + col - 1) // col * H_, col * W_, 4), np.uint8)
    for i, nm in enumerate(noms):
        m = marionnette(nm, F)
        def dessin(c, m=m):
            c.clear(skia.ColorSetARGB(255, 236, 222, 196)); m.dessine(c, W_ / 2, H_ - 40, 160, dict(emotions={'joie': 0.4}, bouche='X', face=1 if i % 2 else -1))
            c.drawString(nm[:22], 6, H_ - 10, skia.Font(None, 14), skia.Paint(AntiAlias=True, Color=skia.ColorBLACK))
        out[i // col * H_:(i // col + 1) * H_, i % col * W_:(i % col + 1) * W_] = image(dessin, W_, H_)
    cv2.imwrite(sys.argv[1] if len(sys.argv) > 1 else 'casting.png', cv2.cvtColor(out, cv2.COLOR_RGBA2BGRA))
