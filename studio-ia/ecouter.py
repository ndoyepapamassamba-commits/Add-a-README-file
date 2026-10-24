"""Écoute un fichier audio ou vidéo avec un modèle qui comprend le son (Gemini Flash) et répond à une question.

  python3 ecouter.py FICHIER "question"

Sert au contrôle de ce que l'oreille seule peut juger : voix chantée dans une musique, rires, accent.
"""
import base64
import subprocess
import sys
from pathlib import Path

import requests

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import or_api  # noqa: E402

MODELE = "google/gemini-3.8-flash"


def ecouter(chemin, question, debut=0, duree=40):
    mp3 = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(debut), "-t", str(duree), "-i", str(chemin), "-vn",
                          "-ac", "1", "-ar", "24000", "-b:a", "64k", "-f", "mp3", "-"],
                         capture_output=True, check=True).stdout
    corps = {"model": MODELE, "messages": [{"role": "user", "content": [
        {"type": "text", "text": question},
        {"type": "input_audio", "input_audio": {"data": base64.b64encode(mp3).decode(), "format": "mp3"}}]}]}
    r = requests.post(f"{or_api.API}/chat/completions", headers=or_api._entetes(), json=corps, timeout=180)
    if r.status_code != 200:
        raise RuntimeError(f"écoute {r.status_code}: {r.text[:400]}")
    d = r.json()
    or_api.noter_depense("ecoute", MODELE, (d.get("usage") or {}).get("cost"), Path(chemin).name)
    return d["choices"][0]["message"]["content"]


if __name__ == "__main__":
    print(ecouter(sys.argv[1], sys.argv[2]))
