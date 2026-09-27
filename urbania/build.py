#!/usr/bin/env python3
"""Assemble Urbania en un seul fichier HTML autonome.

src/00-head.html contient le <title>, les styles et le balisage de l'interface.
Les fichiers src/*.js sont concaténés dans l'ordre dans un unique <script type="module">.

Sorties :
  index.html          document complet, à ouvrir directement dans un navigateur
  dist/artifact.html  même contenu sans squelette (pour une publication en Artifact)
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
IMPORTMAP = """<script type="importmap">
{"imports":{
  "three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
}}
</script>
"""

def main():
    head = (SRC / "00-head.html").read_text(encoding="utf-8")
    parts = sorted(p for p in SRC.glob("*.js"))
    js = "\n".join(f"/* ===== {p.name} ===== */\n" + p.read_text(encoding="utf-8") for p in parts)
    body = head + "\n" + IMPORTMAP + '<script type="module">\n' + js + "\n</script>\n"
    (ROOT / "dist").mkdir(exist_ok=True)
    (ROOT / "dist" / "artifact.html").write_text(body, encoding="utf-8")
    title_end = head.index("<!--BODY-->")
    doc = ("<!doctype html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"utf-8\">\n"
           "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n"
           + head[:title_end] + "</head>\n<body>\n" + head[title_end:] + "\n" + IMPORTMAP
           + '<script type="module">\n' + js + "\n</script>\n</body>\n</html>\n")
    (ROOT / "index.html").write_text(doc, encoding="utf-8")
    print(f"index.html : {len(doc)/1024:.0f} Ko, {len(parts)} modules")

if __name__ == "__main__":
    sys.exit(main())
