"""Repère yeux et bouche (MediaPipe Face Mesh) sur les poses d'un personnage 2D → faces.json.
À lancer avec l'environnement ~/mpenv (MediaPipe exige protobuf 4, incompatible avec Chatterbox)."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
import mediapipe as mp

mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1, min_detection_confidence=0.2,
                                       refine_landmarks=True)
for folder in sys.argv[1:]:
    folder = Path(folder)
    out = {}
    for png in sorted(folder.glob("*.png")):
        im = Image.open(png).convert("RGBA")
        bbox = im.getbbox()
        # on cherche le visage dans le haut de l'image, agrandi sur fond blanc
        top = im.crop((0, 0, im.width, int(im.height * 0.4)))
        found = None
        for s, pad in ((1.0, 50), (0.5, 50), (0.35, 80)):
            t = top.resize((int(top.width * s), int(top.height * s)))
            bg = Image.new("RGB", (t.width + 2 * pad, t.height + 2 * pad), (255, 255, 255))
            bg.paste(t, (pad, pad), t)
            r = mesh.process(np.array(bg))
            if r.multi_face_landmarks:
                L = r.multi_face_landmarks[0].landmark
                w, h = bg.size
                P = lambda i: (((L[i].x * w) - pad) / s, ((L[i].y * h) - pad) / s)
                eyes = []
                for a, b, c, d in ((33, 133, 159, 145), (362, 263, 386, 374)):
                    xa, ya = P(a); xb, yb = P(b); _, yc = P(c); _, yd = P(d)
                    eyes.append([(xa + xb) / 2, (yc + yd) / 2, abs(xb - xa) / 2])
                mx, my = (P(13)[0] + P(14)[0]) / 2, (P(13)[1] + P(14)[1]) / 2
                mw = abs(P(291)[0] - P(61)[0])
                found = {"eyes": eyes, "mouth": [mx, my], "mouth_w": mw}
                break
        out[png.stem] = found or {}
        print(png.name, "ok" if found else "—")
    (folder / "faces.json").write_text(json.dumps(out, indent=1))
