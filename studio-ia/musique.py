"""Musique de fond originale par Lyria 3 (OpenRouter) : pas de droits d'auteur à payer, utilisable en monétisation.

  python3 musique.py NOM "description de la musique"      → habillage/NOM.mp3 (ou .wav selon la sortie)
"""
import base64
import json
import sys
from pathlib import Path

import requests

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import or_api  # noqa: E402

MODELE = "google/lyria-3-pro-preview"


def composer(nom, description):
    corps = {"model": MODELE, "modalities": ["text", "audio"], "stream": True,
             "messages": [{"role": "user", "content": description}]}
    r = requests.post(f"{or_api.API}/chat/completions", headers=or_api._entetes(), json=corps, stream=True, timeout=600)
    if r.status_code != 200:
        raise RuntimeError(f"musique {r.status_code}: {r.text[:500]}")
    morceaux, texte, cout, format_ = [], [], None, None
    for ligne in r.iter_lines():
        if not ligne.startswith(b"data: ") or ligne == b"data: [DONE]":
            continue
        d = json.loads(ligne[6:])
        if d.get("usage"):
            cout = d["usage"].get("cost")
        for c in d.get("choices", []):
            delta = c.get("delta") or {}
            audio = delta.get("audio") or {}
            if audio.get("data"):
                morceaux.append(audio["data"])
                format_ = audio.get("format") or format_
            if delta.get("content"):
                texte.append(delta["content"])
    if not morceaux:
        raise RuntimeError("aucun audio reçu : " + "".join(texte)[:500])
    brut = b"".join(base64.b64decode(m) for m in morceaux)
    ext = format_ or ("mp3" if brut[:3] == b"ID3" or brut[:2] == b"\xff\xfb" else "wav")
    chemin = ICI / "habillage" / f"{nom}.{ext}"
    chemin.write_bytes(brut)
    or_api.noter_depense("musique", MODELE, cout, nom)
    print(f"{chemin} ({len(brut) // 1024} Ko, coût {cout} $) {''.join(texte)[:200]}")
    return chemin


if __name__ == "__main__":
    composer(sys.argv[1], sys.argv[2])
