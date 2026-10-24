"""Contrôle de RÉALISME à l'œil (25/10/2026, défaut vu par l'utilisateur sur « Le copain laid » : « un changement brutal
de personnage » — la grande sœur passait derrière le père et se fondait en lui) : 16 images du clip, dans l'ordre, sont
montrées à un modèle qui voit (Gemini Flash), qui dit si un personnage apparaît, disparaît, se transforme, se dédouble,
change de vêtements, ou fait un geste impossible.

  python3 regarder.py ids…        (le verdict est aussi rangé dans sortie/etat.json : « realisme »)
"""
import base64
import io
import re
import subprocess
import sys
from pathlib import Path

import requests
from PIL import Image, ImageDraw

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import generer  # noqa: E402
import monter  # noqa: E402
import or_api  # noqa: E402

MODELE = "google/gemini-3.8-flash"
QUESTION = ("Ces 16 images sont extraites DANS L'ORDRE (de gauche à droite, ligne par ligne, temps en jaune) d'un même plan "
            "d'animation 3D de {d:.0f} secondes. Personnages prévus : {persos}. Juge la CONTINUITÉ DES PERSONNAGES. "
            "GRAVE = un personnage disparaît ou apparaît d'un coup, se transforme en un autre, fusionne avec un autre, se "
            "dédouble, change franchement de visage, de corps ou de tenue, ou un corps se déforme (membre en trop, étirement). "
            "MINEUR = seulement un petit objet ou un détail du décor qui change, ou un léger changement de maquillage / motif "
            "pendant un zoom. NE SONT PAS des défauts : un personnage qui se lève, s'assoit, marche ou sort normalement du "
            "cadre, un zoom ou un recadrage vers un visage. "
            "Réponds sur UNE ligne : REALISME=OK ou REALISME=MINEUR ou REALISME=GRAVE ; puis le défaut précis avec le temps.")


def planche(clip, n=16, largeur=320):
    d = monter.duree_media(clip)
    images = []
    for i in range(n):
        t = d * (i + 0.5) / n
        brut = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(clip), "-frames:v", "1",
                               "-vf", f"scale={largeur}:-2", "-f", "image2pipe", "-vcodec", "png", "-"],
                              capture_output=True, check=True).stdout
        im = Image.open(io.BytesIO(brut)).convert("RGB")
        ImageDraw.Draw(im).text((6, 4), f"{t:.1f}s", fill=(255, 255, 0))
        images.append(im)
    w, h = images[0].size
    feuille = Image.new("RGB", (w * 4, h * 4), "black")
    for i, im in enumerate(images):
        feuille.paste(im, ((i % 4) * w, (i // 4) * h))
    tampon = io.BytesIO()
    feuille.save(tampon, format="JPEG", quality=85)
    return tampon.getvalue(), d


def regarder(sid):
    s = generer.sketchs()[sid]
    clip = generer.CLIPS / f"{sid}.mp4"
    jpg, d = planche(clip)
    persos = " ; ".join(p["nom"] for p in s["persos"])
    corps = {"model": MODELE, "messages": [{"role": "user", "content": [
        {"type": "text", "text": QUESTION.format(d=d, persos=persos)},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(jpg).decode()}}]}]}
    r = requests.post(f"{or_api.API}/chat/completions", headers=or_api._entetes(), json=corps, timeout=180)
    r.raise_for_status()
    rep = r.json()
    or_api.noter_depense("regard", MODELE, (rep.get("usage") or {}).get("cost"), sid)
    avis = rep["choices"][0]["message"]["content"].strip().replace("\n", " ")
    ok = not re.search(r"REALISME\s*=\s*GRAVE", avis)      # seul un défaut GRAVE fait refaire le clip
    generer.maj_etat(sid, realisme={"ok": ok, "avis": avis[:400]})
    return ok, avis




# SYNCHRO (25/10/2026, défaut vu par l'utilisateur sur « Papa influenceur » : « la maîtresse parle à un moment à la place de
# l'enfant » — le zoom final sur la maîtresse partait pendant la dernière réplique de l'enfant) : pour chaque réplique, deux
# images prises pendant qu'elle est dite, étiquetées avec le personnage qui doit parler.
QUESTION_SYNCHRO = ("Images extraites d'un plan d'animation 3D, deux par réplique, dans l'ordre. Sur chaque image est écrit "
                    "le numéro de la réplique et LE PERSONNAGE QUI DOIT PARLER à ce moment. Personnages : {persos}. Pour chaque "
                    "réplique : le personnage indiqué est-il bien visible et en train de parler (bouche ouverte ou qui bouge) ? "
                    "Est-ce plutôt un AUTRE personnage qui parle, ou qui est seul en gros plan à sa place ? "
                    "Réponds sur UNE ligne : SYNCHRO=OK ou SYNCHRO=ERREUR ; puis le numéro de la réplique fautive et ce qu'on voit.")


def synchro(sid):
    import json as _json
    s = generer.sketchs()[sid]
    clip = generer.CLIPS / f"{sid}.mp4"
    d = monter.duree_media(clip)
    etat = generer.lire_etat().get(sid, {})
    mots = monter.mots_minutes(s, (etat.get("controle") or {}).get("mots"), d)
    rangs = [k for k, (_, t) in enumerate(s["dialogue"]) for m in t.split() if generer.normaliser(m)]
    plages = {}
    for i, (_, a, b) in enumerate(mots):
        r = rangs[i] if i < len(rangs) else len(s["dialogue"]) - 1
        lo, hi = plages.get(r, (a, b))
        plages[r] = (min(lo, a), max(hi, b))
    images = []
    for r in sorted(plages):
        a, b = plages[r]
        qui = s["persos"][s["dialogue"][r][0]]["nom"]
        for f in (0.35, 0.8):
            t = a + (b - a) * f
            brut = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(clip), "-frames:v", "1",
                                   "-vf", "scale=400:-2", "-f", "image2pipe", "-vcodec", "png", "-"],
                                  capture_output=True, check=True).stdout
            im = Image.open(io.BytesIO(brut)).convert("RGB")
            dr = ImageDraw.Draw(im)
            dr.rectangle((0, 0, im.width, 18), fill=(0, 0, 0))
            dr.text((4, 3), f"réplique {r + 1} : {qui} parle ({t:.1f}s)", fill=(255, 255, 0))
            images.append(im)
    w, h = images[0].size
    col = 4
    feuille = Image.new("RGB", (w * col, h * ((len(images) + col - 1) // col)), "black")
    for i, im in enumerate(images):
        feuille.paste(im, ((i % col) * w, (i // col) * h))
    tampon = io.BytesIO()
    feuille.save(tampon, format="JPEG", quality=85)
    corps = {"model": MODELE, "messages": [{"role": "user", "content": [
        {"type": "text", "text": QUESTION_SYNCHRO.format(persos=" ; ".join(p["nom"] for p in s["persos"]))},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(tampon.getvalue()).decode()}}]}]}
    r_ = requests.post(f"{or_api.API}/chat/completions", headers=or_api._entetes(), json=corps, timeout=180)
    r_.raise_for_status()
    rep = r_.json()
    or_api.noter_depense("synchro", MODELE, (rep.get("usage") or {}).get("cost"), sid)
    avis = rep["choices"][0]["message"]["content"].strip().replace("\n", " ")
    ok = not re.search(r"SYNCHRO\s*=\s*ERREUR", avis)
    generer.maj_etat(sid, synchro={"ok": ok, "avis": avis[:400]})
    return ok, avis


if __name__ == "__main__":
    for sid in sys.argv[1:]:
        ok, avis = regarder(sid)
        print(f"  regard {sid} : {'garde' if ok else 'REFAIRE'} | {avis[:300]}")
        ok, avis = synchro(sid)
        print(f"  synchro {sid} : {'garde' if ok else 'REFAIRE'} | {avis[:300]}")
