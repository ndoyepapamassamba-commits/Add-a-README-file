import math

import numpy as np
import pytest
import skia

from keba.pantin import Pantin

W, H = 300, 420

ARTICULATIONS = {
    "nez": (150, 80),
    "epaule_av": (114, 130), "coude_av": (96, 186), "poignet_av": (80, 240),
    "epaule_ar": (186, 130), "coude_ar": (204, 186), "poignet_ar": (220, 240),
    "hanche_av": (136, 252), "genou_av": (133, 305), "cheville_av": (130, 355), "orteil_av": (120, 372),
    "hanche_ar": (164, 252), "genou_ar": (167, 305), "cheville_ar": (170, 355), "orteil_ar": (180, 372),
}


def _bonhomme():
    s = skia.Surface(W, H)
    c = s.getCanvas()
    c.clear(skia.ColorTRANSPARENT)
    trait = lambda couleur, ep: skia.Paint(AntiAlias=True, Color=couleur, Style=skia.Paint.kStroke_Style,
                                           StrokeWidth=ep, StrokeCap=skia.Paint.kRound_Cap)
    a = ARTICULATIONS
    for cote, couleur in (("ar", skia.Color(90, 60, 200)), ("av", skia.Color(60, 160, 60))):
        c.drawLine(*a[f"hanche_{cote}"], *a[f"cheville_{cote}"], trait(couleur, 20))
        c.drawLine(*a[f"cheville_{cote}"], *a[f"orteil_{cote}"], trait(couleur, 14))
    c.drawRect(skia.Rect(122, 120, 178, 258), skia.Paint(AntiAlias=True, Color=skia.Color(240, 140, 30)))
    c.drawCircle(150, 72, 42, skia.Paint(AntiAlias=True, Color=skia.Color(140, 90, 60)))
    for cote, couleur in (("ar", skia.Color(200, 40, 40)), ("av", skia.Color(40, 90, 220))):
        c.drawLine(*a[f"epaule_{cote}"], *a[f"coude_{cote}"], trait(couleur, 16))
        c.drawLine(*a[f"coude_{cote}"], *a[f"poignet_{cote}"], trait(couleur, 16))
    img = s.makeImageSnapshot()
    return img.toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)


@pytest.fixture(scope="module")
def pantin():
    return Pantin.depuis_image(_bonhomme(), ARTICULATIONS, pas=8)


def _rendu(pantin, angles=None, **racine):
    s = skia.Surface(W, H)
    s.getCanvas().clear(skia.ColorTRANSPARENT)
    pos = pantin.poser(angles or {}, **racine)
    pantin.dessiner(s.getCanvas(), pos)
    return s.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)


def test_le_maillage_ne_traverse_pas_le_vide_entre_bras_et_torse(pantin):
    alpha = _bonhomme()[:, :, 3]
    for tri in pantin.triangles:
        cx, cy = pantin.sommets[tri].mean(axis=0)
        assert alpha[int(cy), int(cx)] > 0 or _voisinage_opaque(alpha, cx, cy)


def _voisinage_opaque(alpha, x, y, r=4):
    return (alpha[max(0, int(y) - r):int(y) + r + 1, max(0, int(x) - r):int(x) + r + 1] > 0).any()


def test_les_poids_de_chaque_sommet_font_un(pantin):
    assert np.allclose(pantin.poids.sum(axis=1), 1.0)


def test_le_bras_appartient_au_bras_et_pas_au_torse(pantin):
    i = int(np.argmin(np.linalg.norm(pantin.sommets - np.array([88.0, 213.0]), axis=1)))
    dominant = pantin.os[int(np.argmax(pantin.poids[i]))].nom
    assert dominant == "avbras_av"


def test_au_repos_le_pantin_redonne_l_image(pantin):
    original = _bonhomme().astype(int)
    rendu = _rendu(pantin).astype(int)
    opaque = original[:, :, 3] > 250
    ecart = np.abs(rendu[:, :, :3] - original[:, :, :3])[opaque].mean()
    assert ecart < 6


def test_lever_le_bras_bouge_le_bras_sans_toucher_au_torse(pantin):
    repos = _rendu(pantin)
    leve = _rendu(pantin, {"bras_av": math.radians(70)})
    torse = (slice(150, 240), slice(130, 170))
    assert np.abs(repos[torse].astype(int) - leve[torse].astype(int)).max() < 8
    main_repos = repos[230:250, 70:92, 3].mean()
    main_leve = leve[230:250, 70:92, 3].mean()
    assert main_leve < main_repos * 0.3


def test_l_avant_bras_suit_le_bras(pantin):
    etat = pantin.cinematique({"bras_av": math.radians(90)})
    coude_repos = np.array(ARTICULATIONS["coude_av"], float)
    assert np.linalg.norm(etat["avbras_av"]["debut"] - coude_repos) > 30


def test_placement_dans_le_monde_avec_sens_et_echelle(pantin):
    pos = pantin.poser({}, x=500.0, y=900.0, echelle=2.0)
    assert pos[:, 1].max() == pytest.approx(900.0, abs=3)
    miroir = pantin.poser({}, x=500.0, y=900.0, echelle=2.0, sens=-1.0)
    assert np.allclose(pos[:, 0] - 500.0, -(miroir[:, 0] - 500.0), atol=1e-6)
    assert pos[:, 1].max() - pos[:, 1].min() == pytest.approx(2.0 * pantin.hauteur, rel=0.03)


def _bonhomme_manches_collees():
    """Un torse et un bras qui se touchent sur toute la longueur, séparés seulement par un trait sombre."""
    s = skia.Surface(W, H)
    c = s.getCanvas()
    c.clear(skia.ColorTRANSPARENT)
    trait = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=5, Color=skia.Color(40, 22, 12))
    torse = skia.Rect(122, 120, 178, 258)
    bras = skia.Rect(98, 124, 122, 240)
    c.drawCircle(150, 72, 42, skia.Paint(AntiAlias=True, Color=skia.Color(140, 90, 60)))
    for r in (torse, bras):
        c.drawRect(r, skia.Paint(AntiAlias=True, Color=skia.Color(240, 140, 30)))
    for r in (torse, bras):
        c.drawRect(r, trait)
    c.drawRect(skia.Rect(178, 124, 202, 240), skia.Paint(AntiAlias=True, Color=skia.Color(240, 140, 30)))
    c.drawRect(skia.Rect(178, 124, 202, 240), trait)
    for x in (136, 164):
        c.drawRect(skia.Rect(x - 10, 258, x + 10, 370), skia.Paint(AntiAlias=True, Color=skia.Color(60, 160, 60)))
    return s.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)


def test_un_bras_colle_au_torse_est_separe_par_le_trait_du_dessin():
    art = dict(ARTICULATIONS, epaule_av=(110, 128), coude_av=(110, 184), poignet_av=(110, 236),
               epaule_ar=(190, 128), coude_ar=(190, 184), poignet_ar=(190, 236))
    p = Pantin.depuis_image(_bonhomme_manches_collees(), art, pas=8)

    def os_des_copies(x, y):
        """Les sommets de couture existent en une copie par pièce : on regarde toutes les copies du plus proche."""
        d = np.linalg.norm(p.sommets - np.array([x, y], float), axis=1)
        proches = np.nonzero(d <= d.min() + 1e-6)[0]
        return {p.os[int(np.argmax(p.poids[i]))].nom for i in proches}

    assert "torse" in os_des_copies(134, 200)          # bord du torse, collé au bras
    assert os_des_copies(115, 200) <= {"bras_av", "avbras_av"}


def test_le_maillage_ne_depend_pas_du_hasard_de_python(tmp_path):
    import subprocess
    import sys
    code = ("import sys; sys.path.insert(0, 'tests'); import numpy as np; "
            "from test_pantin import _bonhomme_manches_collees, ART_COLLE; from keba.pantin import Pantin; "
            "p = Pantin.depuis_image(_bonhomme_manches_collees(), ART_COLLE, pas=8); "
            "import hashlib; print(hashlib.sha256(p.sommets.tobytes() + p.triangles.tobytes()).hexdigest())")
    sorties = set()
    for graine in ("1", "2"):
        r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                           env={"PYTHONHASHSEED": graine, "PYTHONPATH": ".", "PATH": "/usr/bin:/bin"})
        assert r.returncode == 0, r.stderr
        sorties.add(r.stdout.strip())
    assert len(sorties) == 1


ART_COLLE = dict(ARTICULATIONS, epaule_av=(110, 128), coude_av=(110, 184), poignet_av=(110, 236),
                 epaule_ar=(190, 128), coude_ar=(190, 184), poignet_ar=(190, 236))


def test_lever_un_bras_colle_ne_dechire_pas_le_dessin():
    p = Pantin.depuis_image(_bonhomme_manches_collees(), ART_COLLE, pas=8)
    s = skia.Surface(W, H)
    s.getCanvas().clear(skia.ColorTRANSPARENT)
    p.dessiner(s.getCanvas(), p.poser({"bras_av": math.radians(80)}))
    a = s.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)
    assert (a[160:230, 126:134, 3] > 200).mean() > 0.95       # le flanc du torse reste entier
    assert (a[175:230, 98:116, 3] > 60).mean() < 0.15         # là où était le bras : vide, pas de traînée


def test_la_bordure_transparente_ne_sert_pas_de_raccourci(pantin):
    # un sommet du bord de la tête, loin des bras, appartient à la tête
    i = int(np.argmin(np.linalg.norm(pantin.sommets - np.array([109.0, 72.0]), axis=1)))
    assert pantin.os[int(np.argmax(pantin.poids[i]))].nom == "tete"


def test_le_contour_n_est_pas_troue(pantin):
    original = _bonhomme()
    rendu = _rendu(pantin)
    contour = (original[:, :, 3] > 200)
    perdu = contour & (rendu[:, :, 3] < 100)
    assert perdu.sum() < 0.002 * contour.sum()


def test_une_texture_d_expression_remplace_l_image_sans_changer_la_forme(pantin):
    variante = _bonhomme()
    variante[:, :, :3] = 255 - variante[:, :, :3]                 # même silhouette, couleurs inversées
    texture = pantin.texture(variante)
    s = skia.Surface(W, H)
    s.getCanvas().clear(skia.ColorTRANSPARENT)
    pantin.dessiner(s.getCanvas(), pantin.poser({}), texture=texture)
    rendu = s.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)
    assert abs(int(rendu[200, 150, 0]) - (255 - 240)) < 8          # le torse orange devenu bleu
    assert (rendu[:, :, 3] > 200).sum() == pytest.approx((_rendu(pantin)[:, :, 3] > 200).sum(), rel=0.01)


def _dame_en_robe():
    s = skia.Surface(W, H)
    c = s.getCanvas()
    c.clear(skia.ColorTRANSPARENT)
    a = ARTICULATIONS
    trait = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=5, Color=skia.Color(40, 22, 12))
    for cote in ("av", "ar"):                                   # pieds qui dépassent sous la robe
        c.drawLine(*a[f"cheville_{cote}"], *a[f"orteil_{cote}"],
                   skia.Paint(AntiAlias=True, Color=skia.Color(200, 30, 40), StrokeWidth=14,
                              StrokeCap=skia.Paint.kRound_Cap))
    robe = skia.Path()
    robe.moveTo(122, 120)
    robe.lineTo(178, 120)
    robe.lineTo(205, 350)
    robe.lineTo(95, 350)
    robe.close()
    c.drawPath(robe, skia.Paint(AntiAlias=True, Color=skia.Color(120, 40, 160)))
    c.drawPath(robe, trait)
    c.drawCircle(150, 72, 42, skia.Paint(AntiAlias=True, Color=skia.Color(140, 90, 60)))
    return s.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)


def test_une_robe_reste_d_un_seul_tenant_quand_les_jambes_bougent():
    p = Pantin.depuis_image(_dame_en_robe(), ARTICULATIONS, pas=8, modele="robe")
    s = skia.Surface(W, H)
    s.getCanvas().clear(skia.ColorTRANSPARENT)
    p.dessiner(s.getCanvas(), p.poser({"cuisse_av": -0.4, "cuisse_ar": 0.4}))
    a = s.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)
    robe_avant = _dame_en_robe()[200:340, 110:190]
    robe_apres = a[200:340, 110:190]
    assert np.abs(robe_avant.astype(int) - robe_apres.astype(int)).max() < 10    # la robe ne bouge pas
    pieds_avant = _dame_en_robe()[355:380, 100:200, 3] > 100
    pieds_apres = a[355:380, 100:200, 3] > 100
    assert (pieds_avant != pieds_apres).sum() > 40                              # les pieds, si


def test_le_rendu_est_reproductible(pantin):
    angles = {"cuisse_av": 0.4, "tibia_av": -0.3, "tete": 0.2}
    assert np.array_equal(_rendu(pantin, angles), _rendu(pantin, angles))


def test_la_pose_de_repos_ramene_les_bras_le_long_du_corps():
    from keba.pantin import pose_de_repos
    art = {"epaule_av": (100.0, 100.0), "poignet_av": (100.0 - 70.7, 170.7),     # bras écarté à 45°
           "epaule_ar": (200.0, 100.0), "poignet_ar": (200.0 + 70.7, 170.7)}
    r = pose_de_repos(art, ecart=math.radians(12))
    assert r["bras_av"] == pytest.approx(math.radians(-33), abs=1e-3)       # vers le corps : sens antihoraire
    assert r["bras_ar"] == pytest.approx(math.radians(33), abs=1e-3)


def _maillot_et_short():
    """Un maillot orange qui recouvre le haut d'un short bleu (le cas du bas du maillot de Kéba)."""
    s = skia.Surface(W, H)
    c = s.getCanvas()
    c.clear(skia.ColorTRANSPARENT)
    trait = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=4, Color=skia.Color(40, 22, 12))
    for x in (136, 164):
        jambe = skia.Rect(x - 13, 240, x + 13, 340)
        c.drawRect(jambe, skia.Paint(AntiAlias=True, Color=skia.Color(40, 90, 220)))
        c.drawRect(jambe, trait)
    maillot = skia.Rect(118, 120, 182, 268)
    c.drawRect(maillot, skia.Paint(AntiAlias=True, Color=skia.Color(245, 140, 30)))
    c.drawRect(maillot, trait)
    c.drawCircle(150, 72, 42, skia.Paint(AntiAlias=True, Color=skia.Color(140, 90, 60)))
    return s.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)


def test_l_ourlet_du_maillot_reste_en_place_quand_la_cuisse_tourne():
    art = dict(ARTICULATIONS, hanche_av=(136, 250), genou_av=(136, 295), cheville_av=(136, 335),
               orteil_av=(126, 338), hanche_ar=(164, 250), genou_ar=(164, 295), cheville_ar=(164, 335),
               orteil_ar=(174, 338))
    image = _maillot_et_short()
    p = Pantin.depuis_image(image, art, pas=8)
    s = skia.Surface(W, H)
    s.getCanvas().clear(skia.ColorTRANSPARENT)
    p.dessiner(s.getCanvas(), p.poser({"cuisse_av": -0.7, "cuisse_ar": 0.7}))
    a = s.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)
    ourlet = (slice(236, 266), slice(122, 178))           # le bas du maillot, au-dessus du short
    assert np.abs(a[ourlet].astype(int) - image[ourlet].astype(int)).max() < 12


def _tunique_longue():
    """Une tunique (tablier) qui descend jusqu'à mi-cuisse, par-dessus le pantalon."""
    s = skia.Surface(W, H)
    c = s.getCanvas()
    c.clear(skia.ColorTRANSPARENT)
    trait = skia.Paint(AntiAlias=True, Style=skia.Paint.kStroke_Style, StrokeWidth=4, Color=skia.Color(40, 22, 12))
    for x in (136, 164):
        jambe = skia.Rect(x - 13, 240, x + 13, 340)
        c.drawRect(jambe, skia.Paint(AntiAlias=True, Color=skia.Color(100, 70, 40)))
        c.drawRect(jambe, trait)
    tunique = skia.Rect(116, 120, 184, 290)
    c.drawRect(tunique, skia.Paint(AntiAlias=True, Color=skia.Color(245, 238, 215)))
    c.drawRect(tunique, trait)
    c.drawCircle(150, 72, 42, skia.Paint(AntiAlias=True, Color=skia.Color(140, 90, 60)))
    return s.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)


def test_une_tunique_longue_reste_d_un_tenant_quand_les_cuisses_tournent():
    art = dict(ARTICULATIONS, hanche_av=(136, 250), genou_av=(136, 300), cheville_av=(136, 335),
               orteil_av=(126, 338), hanche_ar=(164, 250), genou_ar=(164, 300), cheville_ar=(164, 335),
               orteil_ar=(174, 338))
    image = _tunique_longue()
    p = Pantin.depuis_image(image, art, pas=8, jupe=0.85)
    s = skia.Surface(W, H)
    s.getCanvas().clear(skia.ColorTRANSPARENT)
    p.dessiner(s.getCanvas(), p.poser({"cuisse_av": -0.6, "cuisse_ar": 0.6}))
    a = s.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)
    bas_tunique = (slice(262, 286), slice(122, 178))
    assert np.abs(a[bas_tunique].astype(int) - image[bas_tunique].astype(int)).max() < 12
