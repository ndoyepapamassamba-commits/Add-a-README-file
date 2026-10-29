"""Assemble l'application en UN fichier HTML autonome : modules (src/), bibliothèques (vendor/ : mp4-muxer et webm-muxer
sous licence MIT, mp4box.js sous licence BSD-3), banque de sketchs (banque/selection.json) et sons (sons/).

  python3 construire.py [banque.json] [sortie.html]
"""
import base64
import json
import re
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
SRC = ICI / "src"


def js_sur(texte):
    """texte inséré dans une balise <script> : seule « </script » (et « <!-- ») ferait sortir le navigateur du script.
    On n'échappe QUE ces suites : un remplacement général de « </ » casserait une expression régulière comme /</g."""
    texte = re.sub(r"</(script)", r"<\\/\1", texte, flags=re.I)
    return texte.replace("<!--", "<\\!--")


def b64(chemin):
    return base64.b64encode(chemin.read_bytes()).decode() if chemin.exists() else None


def main():
    banque = Path(sys.argv[1]) if len(sys.argv) > 1 else ICI / "banque" / "selection.json"
    sortie = Path(sys.argv[2]) if len(sys.argv) > 2 else ICI / "studio-comedie.html"
    sketchs = json.loads(banque.read_text(encoding="utf-8"))
    sons = {"musique": b64(ICI / "sons" / "musique.m4a"),
            "rires": [x for x in (b64(ICI / "sons" / f"rire_{i}.m4a") for i in (1, 3)) if x]}
    js = "\n".join((SRC / f).read_text(encoding="utf-8") for f in
                   ("01_base.js", "02_banque.js", "03_production.js", "04_montage.js", "05_reglages.js"))
    page = (SRC / "shell.html").read_text(encoding="utf-8")
    remplacements = {
        "{{CSS}}": (SRC / "style.css").read_text(encoding="utf-8"),
        "{{MP4MUXER}}": js_sur((ICI / "vendor" / "mp4-muxer.min.js").read_text(encoding="utf-8")),
        "{{WEBMMUXER}}": js_sur((ICI / "vendor" / "webm-muxer.min.js").read_text(encoding="utf-8")),
        "{{MP4BOX}}": js_sur((ICI / "vendor" / "mp4box.all.min.js").read_text(encoding="utf-8")),
        "{{BANQUE}}": js_sur(json.dumps(sketchs, ensure_ascii=False, separators=(",", ":"))),
        "{{SONS}}": json.dumps(sons),
        "{{JS}}": js_sur(js),
    }
    for cle, val in remplacements.items():
        assert page.count(cle) == 1, cle
        page = page.replace(cle, val)
    sortie.write_text(page, encoding="utf-8")
    print(f"{sortie} : {len(sketchs)} sketchs, {sortie.stat().st_size / 1e6:.1f} Mo")


if __name__ == "__main__":
    main()
