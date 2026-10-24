"""Appels OpenRouter : images, vidéos, suivi des dépenses.

La clé est injectée par le proxy de la session : aucune clé n'est écrite ici.
Chaque dépense est ajoutée à sortie/depenses.jsonl (un enregistrement par appel facturé).
"""
import base64
import json
import os
import time
from pathlib import Path

import requests

API = "https://openrouter.ai/api/v1"
ICI = Path(__file__).resolve().parent
SORTIE = ICI / "sortie"
JOURNAL = SORTIE / "depenses.jsonl"


def _entetes():
    # sans clé dans l'environnement, le proxy de la session ajoute la sienne
    cle = os.environ.get("OPENROUTER_API_KEY")
    entetes = {"Content-Type": "application/json"}
    if cle:
        entetes["Authorization"] = f"Bearer {cle}"
    return entetes


def noter_depense(genre, modele, cout, ref):
    SORTIE.mkdir(parents=True, exist_ok=True)
    with JOURNAL.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"t": time.time(), "genre": genre, "modele": modele,
                            "cout": cout, "ref": ref}, ensure_ascii=False) + "\n")


def total_depense():
    if not JOURNAL.exists():
        return 0.0
    return sum(json.loads(l).get("cout") or 0 for l in JOURNAL.read_text().splitlines() if l.strip())


def reste_cle():
    d = requests.get(f"{API}/key", headers=_entetes(), timeout=30).json()["data"]
    return d.get("limit_remaining")


def image(modele, prompt, chemin, aspect="4:3", resolution=None, references=(), ref=""):
    """Génère une image et l'écrit dans `chemin`. Renvoie le coût en dollars."""
    corps = {"model": modele, "prompt": prompt, "aspect_ratio": aspect}
    if resolution:
        corps["resolution"] = resolution
    if references:
        corps["input_references"] = [{"type": "image_url", "image_url": {"url": data_url(p)}}
                                     for p in references]
    r = requests.post(f"{API}/images", headers=_entetes(), json=corps, timeout=300)
    if r.status_code != 200:
        raise RuntimeError(f"image {r.status_code}: {r.text[:400]}")
    d = r.json()
    Path(chemin).write_bytes(base64.b64decode(d["data"][0]["b64_json"]))
    cout = (d.get("usage") or {}).get("cost")
    noter_depense("image", modele, cout, ref)
    return cout


def data_url(chemin):
    chemin = Path(chemin)
    mime = "image/png" if chemin.suffix == ".png" else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(chemin.read_bytes()).decode()


def video_lancer(modele, prompt, premiere_image=None, duree=6, resolution="480p",
                 aspect="4:3", audio=True):
    corps = {"model": modele, "prompt": prompt, "duration": duree,
             "resolution": resolution, "aspect_ratio": aspect, "generate_audio": audio}
    if premiere_image:
        corps["frame_images"] = [{"type": "image_url", "image_url": {"url": data_url(premiere_image)},
                                  "frame_type": "first_frame"}]
    r = requests.post(f"{API}/videos", headers=_entetes(), json=corps, timeout=120)
    if r.status_code not in (200, 202):
        raise RuntimeError(f"video {r.status_code}: {r.text[:400]}")
    return r.json()["id"]


def video_etat(job):
    return requests.get(f"{API}/videos/{job}", headers=_entetes(), timeout=60).json()


def video_attendre(job, chemin, modele, ref="", pause=15, max_s=1200):
    """Attend la fin du travail, télécharge la vidéo. Renvoie le coût."""
    debut = time.time()
    while True:
        e = video_etat(job)
        if e.get("status") == "completed":
            break
        if e.get("status") in ("failed", "cancelled", "expired"):
            raise RuntimeError(f"video {job} {e.get('status')}: {e.get('error')}")
        if time.time() - debut > max_s:
            raise TimeoutError(f"video {job} toujours {e.get('status')} après {max_s} s")
        time.sleep(pause)
    url = (e.get("unsigned_urls") or [f"{API}/videos/{job}/content?index=0"])[0]
    r = requests.get(url, headers=_entetes(), timeout=300)
    r.raise_for_status()
    Path(chemin).write_bytes(r.content)
    cout = (e.get("usage") or {}).get("cost")
    noter_depense("video", modele, cout, ref)
    return cout
