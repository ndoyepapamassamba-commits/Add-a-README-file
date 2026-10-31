# Planche d'images extraites d'une vidéo : python3 serie/outils/planche_video.py VIDEO.mp4 SORTIE.png t1 t2 ...
import subprocess
import sys
import tempfile

import skia

video, sortie, temps = sys.argv[1], sys.argv[2], sys.argv[3:]
with tempfile.TemporaryDirectory() as tmp:
    images = []
    for t in temps:
        f = f"{tmp}/{t}.png"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", t, "-i", video, "-frames:v", "1", "-vf", "scale=270:480", f],
                       check=True)
        images.append((t, skia.Image.open(f)))
    col = 6
    lignes = (len(images) + col - 1) // col
    s = skia.Surface(270 * col, 500 * lignes)
    c = s.getCanvas()
    c.clear(skia.ColorBLACK)
    police = skia.Font(skia.Typeface("DejaVu Sans"), 20)
    for i, (t, im) in enumerate(images):
        x, y = (i % col) * 270, (i // col) * 500
        c.drawImage(im, x, y)
        c.drawString(f"{t} s", x + 8, y + 496, police, skia.Paint(Color=skia.ColorWHITE))
    s.makeImageSnapshot().save(sortie, skia.kPNG)
