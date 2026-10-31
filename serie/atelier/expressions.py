"""Lot des expressions : on ne retouche que le carré de la tête (≈ 5 fois moins de calcul que la planche entière),
puis on le recolle sur la planche avec un fondu : la texture garde exactement le cadrage de la planche, et le pantin
la pose sur le même maillage (Pantin.texture).
"""
import numpy as np

DESCRIPTIONS = {
    "joie": "a big happy open-mouth laugh, eyes squinting with joy",
    "colere": "angry: eyebrows pulled down hard, gritted teeth, furious eyes",
    "fureur": "furious and shouting with the mouth wide open, eyebrows pulled down hard, face flushed with rage",
    "surprise": "very surprised: eyebrows raised high, eyes wide open, mouth open in a round O",
    "peur": "scared: worried raised eyebrows, wide eyes with tiny pupils, trembling open mouth, a drop of sweat",
    "choc": "completely shocked: eyes popping out wide, jaw dropped very low",
    "gene": "a guilty embarrassed grin: worried eyebrows, a big forced smile showing the teeth, a drop of sweat, eyes "
            "looking sideways",
    "soulagement": "relieved: eyes gently closed, a calm smile, relaxed eyebrows",
    "douleur": "in pain: eyes squeezed shut, grimacing mouth",
    "fierte": "proud and haughty: eyes half closed, chin up, a small satisfied smile",
    "yeux_fermes": "the same calm expression but with both eyes closed",
}

PROMPT = ("Edit image 1: show exactly the same cartoon character's head in exactly the same drawing style, same framing, "
          "same size and position, same colours, same hair and accessories, same plain white background; only change "
          "the facial expression to: {}.")


def cadre_tete(art: dict, largeur: int, hauteur: int) -> tuple[int, int, int]:
    nez = np.asarray(art["nez"], float)
    ea, er = np.asarray(art["epaule_av"], float), np.asarray(art["epaule_ar"], float)
    epaules = (ea + er) / 2
    cote = max(2.3 * np.linalg.norm(nez - epaules), 1.7 * np.linalg.norm(ea - er))
    cote = int(min(640, max(256, round(cote / 64) * 64)))
    cote = min(cote, (min(largeur, hauteur) // 64) * 64)
    x = int(round(nez[0] - cote / 2))
    y = int(round(nez[1] - 0.58 * cote))
    x = min(max(0, x), largeur - cote)
    y = min(max(0, y), hauteur - cote)
    return x, y, cote


def lot(choix: dict, cadres: dict) -> list[dict]:
    taches = []
    for perso, noms in choix.items():
        _, _, cote = cadres[perso]
        for k, nom in enumerate(noms):
            taches.append({"id": f"{perso}-expr-{nom}", "prompt": PROMPT.format(DESCRIPTIONS[nom]), "w": cote,
                           "h": cote, "graine": 300 + k, "refs": [f"{perso}-tete.png"]})
    return taches


def recoller(planche: np.ndarray, tete: np.ndarray, cadre, fondu: int = 24) -> np.ndarray:
    """Recolle la tête retouchée dans son cadre, avec un fondu linéaire sur `fondu` pixels de bord."""
    x, y, cote = cadre
    sortie = planche.copy()
    u = np.arange(cote)
    rampe = np.clip(np.minimum(u, cote - 1 - u) / max(1, fondu), 0.0, 1.0)
    masque = np.minimum.outer(rampe, rampe)[:, :, None]
    zone = sortie[y:y + cote, x:x + cote].astype(float)
    sortie[y:y + cote, x:x + cote] = np.round(zone * (1 - masque) + tete[:cote, :cote, :zone.shape[2]] * masque)
    return sortie
