# SIGNATURE DE LA CHAÎNE ET BANDES NETTES (18/10/2026) — remarques de l'utilisateur sur la v3 : « dans les sketchs l'arrière-plan
# comporte encore des flous » et « efface le descriptif du matériel attaché et remplace par mon logo TikTok et mon nom en
# stylé ». Mesure de la v3 : le 9:16 n'était occupé qu'à 45 % par la scène (clip 576×460 sur 1 024 px de haut), les 55 % restants
# étaient la même image agrandie et FLOUTÉE (format des TikTok de la chaîne, mais c'est ce flou que l'utilisateur ne veut plus).
# Les bandes deviennent un habillage NET : dégradé nuit, filets néon cyan/rose autour du clip, en haut la signature (logo rond
# de la chaîne, anneau dégradé, « @nom » en lettres doublées cyan/rose) et le titre du sketch en cours ; en fin de film, la
# carte de signature grand format prend la place du crédit des moteurs (le crédit CC-BY des voix passe dans la légende de la
# publication : legende.txt, écrite par compose.py). Aucun flou nulle part : contrôle `aucun_flou` (variance du laplacien
# des bandes ≥ celle d'un aplat dessiné, et AUCUN pixel des bandes tiré du clip).
# Le logo et le nom viennent du profil public de la chaîne (photo enregistrée hors dépôt : workbench/.private/marque/).
#   import marque ; M = marque.Habillage(W, H, CLIP_Y, CH, sketchs, total) ; fond = M.fond ; calque = M.calque(t)
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ICI = os.path.dirname(os.path.abspath(__file__))
MARQUE = os.environ.get('MARQUE_DIR', os.path.normpath(os.path.join(ICI, '..', '..', 'workbench', '.private', 'marque')))
def _reglage():   # nom et @pseudo de la chaîne : réglage privé (workbench/.private/marque/marque.json), jamais dans le dépôt public
    import json
    f = os.path.join(MARQUE, 'marque.json')
    try: return json.load(open(f, encoding='utf-8'))
    except Exception: return {}
NOM = os.environ.get('MARQUE_NOM') or _reglage().get('nom', 'ma chaîne')
PSEUDO = os.environ.get('MARQUE_PSEUDO') or _reglage().get('pseudo', '@ma_chaine')
FONT = os.path.expanduser(os.environ.get('MASSAMBA_MODELS', '~/.cache/massamba-models')) + '/fonts/Montserrat.ttf'
CYAN, ROSE, JAUNE, NUIT_H, NUIT_B = (37, 244, 238), (254, 44, 85), (255, 210, 63), (16, 9, 34), (36, 16, 58)
FIN_S = 2.6          # durée de la carte de signature en fin de film
ACCROCHE_S = 2.5     # accroche des premières secondes


def police(sz, style=b'Black'):
    f = ImageFont.truetype(FONT, sz)
    try: f.set_variation_by_name(style)
    except Exception: pass
    return f


def _logo(d):
    """logo rond de la chaîne (photo de profil) entouré d'un anneau dégradé cyan → rose ; repli : rond dégradé avec l'initiale."""
    f = next((os.path.join(MARQUE, n) for n in ('logo.png', 'logo.jpg', 'avatar.jpg') if os.path.isfile(os.path.join(MARQUE, n))), ''); s = 4; D = d * s
    if os.path.isfile(f):
        im = Image.open(f).convert('RGB'); c = min(im.size)
        im = im.crop(((im.width - c) // 2, (im.height - c) // 2, (im.width + c) // 2, (im.height + c) // 2)).resize((D, D), Image.LANCZOS)
    else:
        im = Image.new('RGB', (D, D), JAUNE); ImageDraw.Draw(im).text((D / 2, D / 2), NOM[:1].upper(), font=police(int(D * 0.6)), fill=NUIT_H, anchor='mm')
    out = Image.new('RGBA', (D, D), (0, 0, 0, 0))
    yy, xx = np.mgrid[0:D, 0:D]; a = np.clip((xx + yy) / (2.0 * D), 0, 1)[..., None]
    anneau = (np.array(CYAN) * (1 - a) + np.array(ROSE) * a).astype(np.uint8)
    m = Image.new('L', (D, D), 0); ImageDraw.Draw(m).ellipse((0, 0, D - 1, D - 1), fill=255)
    out.paste(Image.fromarray(anneau), (0, 0), m)
    e = int(D * 0.075); m2 = Image.new('L', (D, D), 0); ImageDraw.Draw(m2).ellipse((e, e, D - 1 - e, D - 1 - e), fill=255)
    out.paste(Image.new('RGB', (D, D), NUIT_H), (0, 0), m2)
    e2 = int(D * 0.11); ph = im.resize((D - 2 * e2, D - 2 * e2), Image.LANCZOS)
    m3 = Image.new('L', ph.size, 0); ImageDraw.Draw(m3).ellipse((0, 0, ph.width - 1, ph.height - 1), fill=255)
    out.paste(ph, (e2, e2), m3)
    return out.resize((d, d), Image.LANCZOS)


def _texte_double(dr, xy, txt, f, couleur=(255, 255, 255), dec=2, ancre='la'):
    """lettres doublées cyan / rose décalées (effet « glitch » des titres de la plateforme), puis le texte plein."""
    x, y = xy
    dr.text((x - dec, y - dec), txt, font=f, fill=CYAN + (255,), anchor=ancre)
    dr.text((x + dec, y + dec), txt, font=f, fill=ROSE + (255,), anchor=ancre)
    dr.text((x, y), txt, font=f, fill=couleur + (255,), anchor=ancre)


def _lignes(txt, f, largeur):
    mots, L, cur = txt.split(), [], ''
    for w in mots:
        t = (cur + ' ' + w).strip()
        if f.getlength(t) <= largeur or not cur: cur = t
        else: L.append(cur); cur = w
    if cur: L.append(cur)
    return L


class Habillage:
    def __init__(self, W, H, clip_y, ch, sketchs, total, safe_gauche=32, safe_droite=None, fps=30, chutes=()):
        self.W, self.H, self.y0, self.y1, self.total, self.fps = W, H, clip_y, clip_y + ch, total, fps
        self.sg, self.sd = safe_gauche, (safe_droite if safe_droite is not None else W - 64)
        self.sk = [(s['t0'], s['t1'], (s.get('titre') or '').upper()) for s in sketchs]
        self.chutes = sorted(chutes)   # instants des prises de choc (jeu.prise_t) : un émoji animé jaillit sur chaque chute
        self.fond = self._fond()
        self._cache = {}
        self.signature = self._signature()
        self.bandeau = self._bandeau()

    def _fond(self):
        """bandes haut et bas : dégradé nuit vertical + motif losange très discret + filets néon autour du clip (BGR)."""
        W, H = self.W, self.H
        t = np.linspace(0, 1, H)[:, None, None]
        rgb = (np.array(NUIT_H) * (1 - t) + np.array(NUIT_B) * t) * np.ones((1, W, 1))
        yy, xx = np.mgrid[0:H, 0:W]
        losange = ((np.abs(((xx + yy) % 48) - 24) < 1) | (np.abs(((xx - yy) % 48) - 24) < 1)).astype(np.float32)[..., None]
        rgb = rgb + losange * 9.0                                         # motif net à 1 px : pas un flou, un tissu
        rgb = np.clip(rgb, 0, 255).astype(np.uint8)
        for y, c in ((self.y0 - 6, CYAN), (self.y0 - 3, ROSE), (self.y1 + 2, ROSE), (self.y1 + 5, CYAN)):
            if 0 <= y < H - 1: rgb[y:y + 2, :] = c
        return np.ascontiguousarray(rgb[..., ::-1])

    def _signature(self):
        """ligne de signature permanente : logo rond + @pseudo en lettres doublées, centrée dans la zone sûre."""
        im = Image.new('RGBA', (self.W, self.y0), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
        f = police(26); d = 54; lg = _logo(d); larg = d + 10 + f.getlength(PSEUDO)
        x = (self.sg + self.sd) / 2 - larg / 2; y = 78
        im.alpha_composite(lg, (int(x), y)); _texte_double(dr, (x + d + 10, y + d / 2), PSEUDO, f, ancre='lm')
        return im

    # BANDEAU DÉFILANT (18/10/2026, « le nouveau logo va défiler tout au long de la vidéo, en haut, pour augmenter le visuel et
    # retenir l'audience ») : une bande néon juste au-dessus du clip où le logo rond et le nom de la chaîne défilent de droite
    # à gauche pendant tout le film. Vitesse ENTIÈRE en pixels par image (60 px/s : 1 px par image à 60 i/s) : aucun
    # sous-pixel, donc aucun tremblement ; le motif est périodique, la bande ne « saute » jamais.
    Y_BANDEAU, H_BANDEAU, VITESSE = 214, 50, 60
    def _bandeau(self):
        h = self.H_BANDEAU; d = h - 10; lg = _logo(d); f = police(24); f2 = police(18, b'Bold')
        motif = [('logo', None), ('t', PSEUDO), ('p', '•'), ('t2', 'ABONNE-TOI'), ('p', '•'), ('logo', None), ('t', NOM.upper()), ('p', '•'), ('t2', 'PARTAGE À TA FAMILLE'), ('p', '•')]
        larg = []
        for k, v in motif:
            larg.append(d + 14 if k == 'logo' else int((f if k == 't' else f2).getlength(v)) + 22)
        P = sum(larg); n = int(np.ceil((self.W + P) / P)) + 1
        im = Image.new('RGBA', (P * n, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); x = 0
        for _ in range(n):
            for (k, v), w in zip(motif, larg):
                if k == 'logo': im.alpha_composite(lg, (x + 7, 5))
                elif k == 't': _texte_double(dr, (x + 11, h / 2), v, f, ancre='lm')
                elif k == 't2': dr.text((x + 11, h / 2), v, font=f2, fill=JAUNE + (255,), anchor='lm')
                else: dr.text((x + 11, h / 2), v, font=f2, fill=ROSE + (255,), anchor='lm')
                x += w
        fond = Image.new('RGBA', (self.W, h), NUIT_H + (215,)); d2 = ImageDraw.Draw(fond)
        d2.line([(0, 0), (self.W, 0)], fill=CYAN + (255,), width=2); d2.line([(0, h - 2), (self.W, h - 2)], fill=ROSE + (255,), width=2)
        self._periode = P
        return fond, im

    def _bandeau_t(self, t):
        fond, im = self.bandeau; pas = max(1, int(round(self.VITESSE / self.fps)))
        off = (int(round(t * self.fps)) * pas) % self._periode
        out = fond.copy(); out.alpha_composite(im.crop((off, 0, off + self.W, self.H_BANDEAU)))
        return out

    def _titre(self, txt):
        im = Image.new('RGBA', (self.W, self.y0), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
        larg = self.sd - self.sg
        for sz in (42, 38, 34, 30):
            f = police(sz); L = _lignes(txt, f, larg)
            if len(L) <= 2 and all(f.getlength(l) <= larg for l in L): break
        h = sz + 6; y = 150 - (len(L) - 1) * h / 2
        for l in L:
            x = (self.sg + self.sd) / 2
            dr.text((x + 3, y + 4), l, font=f, fill=(0, 0, 0, 160), anchor='mm')
            dr.text((x, y), l, font=f, fill=JAUNE + (255,), anchor='mm', stroke_width=5, stroke_fill=(0, 0, 0, 255))
            y += h
        return im

    def _carte_fin(self, a):
        """carte de signature grand format (fin de film) : logo 112 px, nom en grandes lettres doublées, @pseudo, appel discret."""
        k = ('fin', round(a, 2))
        if k in self._cache: return self._cache[k]
        im = Image.new('RGBA', (self.W, self.y0), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
        d = int(round(96 + 16 * a)); lg = _logo(d); cx = (self.sg + self.sd) / 2
        im.alpha_composite(lg, (int(cx - d / 2), int(118 - d / 2)))
        _texte_double(dr, (cx, 196), NOM.upper(), police(40), dec=3, ancre='mm')
        dr.text((cx, 236), PSEUDO, font=police(22, b'Bold'), fill=(255, 255, 255, 235), anchor='mm')
        dr.text((cx, 264), 'ABONNE-TOI POUR LA SUITE', font=police(16, b'Bold'), fill=JAUNE + (255,), anchor='mm')
        if a < 1:
            al = np.array(im); al[..., 3] = (al[..., 3] * a).astype(np.uint8); im = Image.fromarray(al)
        self._cache[k] = im
        return im

    def calque(self, t):
        """calque RGBA (W × y0) de la bande du haut à l'instant t (signature + titre du sketch, ou carte de fin)."""
        tf = self.total - FIN_S
        if t >= tf: return self._carte_fin(min(1.0, (t - tf) / 0.35))
        i = next((j for j, (a, b, _) in enumerate(self.sk) if a - 1.2 <= t < (self.sk[j + 1][0] - 1.2 if j + 1 < len(self.sk) else tf)), None)
        r_ = next((c for c in self.chutes if c <= t < c + 2.4), None)
        if t < ACCROCHE_S:
            im = self._accroche(t)
        elif r_ is not None:
            im = self._reaction(t - r_, self.chutes.index(r_))
        else:
            k = ('sk', i)
            if k not in self._cache:
                im = Image.new('RGBA', (self.W, self.y0), (0, 0, 0, 0))
                if i is not None and self.sk[i][2]:
                    im.alpha_composite(self._titre(self.sk[i][2])); im.alpha_composite(self._compteur(i + 1, len(self.sk)))
                self._cache[k] = im
            im = self._cache[k].copy()
        im.alpha_composite(self._bandeau_t(t), (0, self.Y_BANDEAU))
        return im

    # RÉTENTION (18/10/2026, « les vidéos doivent inciter à regarder plus de 30 secondes sur une minute ») :
    #   · ACCROCHE des 2,5 premières secondes (la décision de rester se prend là) : promesse sur la fin, en parler ivoirien,
    #     avec l'émoji animé — « ATTENDS LE DERNIER… C'EST GÂTÉ ! » ;
    #   · COMPTEUR « SKETCH k/3 » au-dessus du titre : le spectateur sait qu'il en reste, et combien ;
    #   · ÉMOJI ANIMÉ QUI JAILLIT sur chaque chute (coin haut droit du clip, 2,4 s) : récompense visuelle au moment du rire.
    def _compteur(self, k, n):
        im = Image.new('RGBA', (self.W, self.y0), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); f = police(15, b'Bold')
        lab = f'SKETCH {k}/{n}'; lw = f.getlength(lab) + 24; cx = (self.sg + self.sd) / 2
        dr.rounded_rectangle((cx - lw / 2, 84, cx + lw / 2, 108), radius=12, fill=(20, 12, 40, 235), outline=JAUNE + (255,), width=2)
        dr.text((cx, 96), lab, font=f, fill=JAUNE + (255,), anchor='mm')
        return im

    def _accroche(self, t):
        import cartes_fx
        im = Image.new('RGBA', (self.W, self.y0), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); cx = (self.sg + self.sd) / 2
        p = cartes_fx._pop(t); f1 = police(max(8, int(30 * max(p, 0.01)))); f2 = police(max(8, int(40 * max(p, 0.01))))
        if p > 0.05:
            dr.text((cx, 112), "ATTENDS LE DERNIER…", font=f1, fill=(255, 255, 255, 255), anchor='mm', stroke_width=4, stroke_fill=(0, 0, 0, 255))
            _texte_double(dr, (cx - 30, 166), "C'EST GÂTÉ !", f2, couleur=JAUNE, dec=3, ancre='mm')
            e = cartes_fx._image_emoji('1f602', max(8, int(64 * p)), t)
            if e is not None: im.alpha_composite(e, (int(cx - 30 + f2.getlength("C'EST GÂTÉ !") / 2 + 8), int(166 - e.height / 2)))
        return im

    def _reaction(self, u, k):
        """la chute « traduite » dans la bande du haut : 😱 « LE CHOC ! » pendant la prise de choc, puis 🤣 « MDR » quand le
        public rit — à la place du titre, jamais sur un visage."""
        import cartes_fx
        im = Image.new('RGBA', (self.W, self.y0), (0, 0, 0, 0)); dr = ImageDraw.Draw(im); cx = (self.sg + self.sd) / 2
        choc = u < 1.0; v = u if choc else u - 1.0; p = cartes_fx._pop(v)
        cp = '1f631' if choc else ('1f923' if k % 2 else '1f602'); mot = 'LE CHOC !' if choc else 'MDR !'
        e = cartes_fx._image_emoji(cp, max(8, int(96 * p)), u)
        f = police(max(8, int(44 * max(p, 0.01))))
        larg = (e.width if e is not None else 0) + 14 + f.getlength(mot); x0 = cx - larg / 2
        if e is not None: im.alpha_composite(e, (int(x0), int(150 - e.height / 2)))
        _texte_double(dr, (x0 + (e.width if e is not None else 0) + 14, 150), mot, f, couleur=JAUNE if choc else (255, 255, 255), dec=3, ancre='lm')
        return im

    def autocollant(self, t):
        """émoji animé qui jaillit sur la chute (coin haut droit du clip) → (image RGBA, (x, y)) ou None."""
        if os.environ.get('AUTOCOLLANT_CLIP', '0') != '1': return None   # la réaction vit désormais dans la bande du haut
        c = next((c for c in self.chutes if c <= t < c + 2.4), None)
        if c is None: return None
        import cartes_fx
        u = t - c; p = cartes_fx._pop(u) * (1.0 if u < 2.1 else max(0.0, (2.4 - u) / 0.3))
        if p <= 0.02: return None
        # « quand on est choqué, le choc » : 😱 pendant la prise de choc (1 s), puis le rire 🤣 / 😂 quand le public rit
        cp = '1f631' if u < 1.0 else ('1f923' if (self.chutes.index(c) % 2) else '1f602')
        if u >= 1.0: p = p * cartes_fx._pop(u - 1.0) if u < 1.4 else p
        d = max(8, int(104 * p)); e = cartes_fx._image_emoji(cp, d, u)
        e = e.rotate(-12 + 6 * np.sin(2 * np.pi * 1.5 * u), resample=Image.BICUBIC, expand=True)
        # posé À CHEVAL sur le filet néon du haut du clip, à droite : il « sort du cadre » sans jamais couvrir un visage
        return e, (int(self.sd - 56 - e.width / 2), int(self.y0 + 6 - e.height / 2))


def aucun_flou(img_bgr, clip_y, ch, seuil=0.35):
    """contrôle (défaut vu par l'utilisateur → contrôle automatique) : les bandes ne sont PAS une copie floutée du clip.
    On refait la prédiction « clip agrandi et flouté » de l'ancien montage et on la corrèle aux bandes (moyenne de chaque
    ligne retirée, pour ne pas compter un simple dégradé) : corrélation ≥ seuil → bande floutée tirée du clip → faute."""
    import cv2
    g = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32); H, W = g.shape
    fr = g[clip_y:clip_y + ch]; sc = H / fr.shape[0]; bw = int(round(fr.shape[1] * sc))
    small = cv2.GaussianBlur(cv2.resize(fr, (bw // 4, H // 4), interpolation=cv2.INTER_AREA), (0, 0), 4.5)
    pred = cv2.resize(small, (bw, H)); x0 = (bw - W) // 2; pred = pred[:, x0:x0 + W]
    r = {}
    for nom, (a, b) in (('haut', (0, clip_y - 8)), ('bas', (clip_y + ch + 8, H))):
        if b - a < 20: continue
        u = g[a:b] - g[a:b].mean(1, keepdims=True); v = pred[a:b] - pred[a:b].mean(1, keepdims=True)
        r[nom] = round(float((u * v).sum() / (np.sqrt((u * u).sum() * (v * v).sum()) + 1e-6)), 3)
    return all(c < seuil for c in r.values()), r
