# Planche de contrôle des illustrations détourées (fond magenta) : python3 serie/outils/planche_objets.py DOSSIER SORTIE.png
import sys
from pathlib import Path

import skia

dossier, sortie = Path(sys.argv[1]), sys.argv[2]
images = sorted(p for p in dossier.glob("*.png") if not p.name.endswith("-brut.png") and not p.name.startswith("planche"))
cote = 300
s = skia.Surface(cote * max(1, len(images)), cote + 40)
c = s.getCanvas()
c.clear(skia.Color(255, 0, 200))
police = skia.Font(skia.Typeface("DejaVu Sans"), 18)
for i, p in enumerate(images):
    im = skia.Image.open(str(p))
    k = min(cote / im.width(), cote / im.height())
    w, h = im.width() * k, im.height() * k
    c.drawImageRect(im, skia.Rect(i * cote + (cote - w) / 2, (cote - h) / 2, i * cote + (cote + w) / 2, (cote + h) / 2),
                    skia.SamplingOptions(skia.FilterMode.kLinear, skia.MipmapMode.kLinear))
    c.drawString(p.stem, i * cote + 6, cote + 28, police, skia.Paint(Color=skia.ColorWHITE))
s.makeImageSnapshot().save(sortie, skia.kPNG)
print(len(images), "images")
