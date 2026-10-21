# TEINT DE LA V1 SUR LE FILM FINI (21/10/2026) — « même le teint des personnages, nous sommes en Afrique de l'Ouest ».
# La série S00001 (usine serie.py, moteur de la V1) mesure L* 48,6 / b* 46 au personnage le plus clair, la V1 publiée 35,3 / 26
# (niveau_v1.teint, 9e décile). banque/peau.py ramène le teint clip par clip ; cette passe le fait sur N'IMPORTE QUEL film fini,
# quelle que soit la chaîne qui l'a produit : chaque image, dans la bande de la scène, la peau (classes 2 et 3 du segmenteur
# MediaPipe selfie_multiclass, Apache-2.0) de CHAQUE personnage est ramenée vers la peau de la V1 — clarté et saturation
# réduites d'un même facteur pour tout le personnage (ombres et modelé gardés, teinte gardée), jamais éclaircie. Facteurs
# suivis d'une image à l'autre (personnage reconnu à son centre) et lissés, masques lissés dans le temps et fondus aux bords :
# pas de scintillement. Titres, sous-titres et cartes hors de la bande : intacts.
#   python3 teint_film.py ENTREE.mp4 SORTIE.mp4
import os, subprocess, sys
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, ICI)
import niveau_v1 as N

CIBLE_L = float(os.environ.get('PEAU_L', '31'))     # V1 : 28 à 36 par image, 35,3 au 9e décile (même cible que banque/peau.py)
CIBLE_B = float(os.environ.get('PEAU_B', '21'))     # V1 : 22 à 26, 26,0 au 9e décile
LISSE_F, LISSE_M = 0.12, 0.45                       # part de l'image courante dans les facteurs et dans le masque


def facteurs(L, B, peau):
    """facteur de clarté et de saturation d'un personnage : sa peau médiane ramenée à la cible, jamais au-dessus de 1."""
    l = float(np.median(L[peau])); b = float(np.median(B[peau]))
    return min(1.0, CIBLE_L / max(l, 1e-3)), min(1.0, CIBLE_B / max(b, 1e-3))


def passe(entree, sortie):
    mp, seg, _ = N._outils(); y0, y1 = N.BANDE_V1
    c = cv2.VideoCapture(entree); fps = c.get(cv2.CAP_PROP_FPS) or 30
    W, H = int(c.get(cv2.CAP_PROP_FRAME_WIDTH)), int(c.get(cv2.CAP_PROP_FRAME_HEIGHT)); a, z = int(H * y0), int(H * y1)
    tmp = sortie + '.video.mp4'
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', f'{fps}', '-i', '-',
                            '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', tmp], stdin=subprocess.PIPE)
    suivis, prec_m, n, avant, apres = [], None, 0, [], []
    while True:
        ok, f = c.read()
        if not ok: break
        n += 1; b = f[a:z]; h, w = b.shape[:2]
        m = np.squeeze(seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(b, cv2.COLOR_BGR2RGB)))).category_mask.numpy_view())
        m = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
        peau = ((m == 2) | (m == 3)).astype(np.float32)
        prec_m = peau if prec_m is None or prec_m.shape != peau.shape else LISSE_M * peau + (1 - LISSE_M) * prec_m
        lab = cv2.cvtColor(b, cv2.COLOR_BGR2LAB).astype(np.float32); L = lab[..., 0] * 100 / 255; B = lab[..., 2] - 128
        k, lab_cc, st, cen = cv2.connectedComponentsWithStats((m > 0).astype(np.uint8))
        fl = np.ones((h, w), np.float32); fc = np.ones((h, w), np.float32); vus = []
        for j in range(1, k):
            if st[j, 4] < 0.02 * m.size: continue
            pj = (lab_cc == j) & (peau > 0)
            if pj.sum() < 150: continue
            gl, gb = facteurs(L, B, pj); avant.append(float(np.median(L[pj])))
            # même personnage qu'à l'image précédente (centre à moins de 15 % de la largeur) : facteurs lissés
            s = min(suivis, key=lambda s: np.hypot(*(s['c'] - cen[j])), default=None)
            if s is not None and np.hypot(*(s['c'] - cen[j])) < 0.15 * w:
                gl = LISSE_F * gl + (1 - LISSE_F) * s['gl']; gb = LISSE_F * gb + (1 - LISSE_F) * s['gb']
            vus.append({'c': cen[j], 'gl': gl, 'gb': gb})
            zone = cv2.dilate((lab_cc == j).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
            fl[zone] = gl; fc[zone] = min(gl, gb)
        suivis = vus
        wgt = cv2.GaussianBlur(prec_m, (0, 0), 1.5)
        gl_px = 1 - wgt * (1 - fl); gc_px = 1 - wgt * (1 - fc)
        lab[..., 0] *= gl_px; lab[..., 1] = 128 + (lab[..., 1] - 128) * gc_px; lab[..., 2] = 128 + (lab[..., 2] - 128) * gc_px
        nb = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
        if peau.any(): apres.append(float(np.median(cv2.cvtColor(nb, cv2.COLOR_BGR2LAB)[..., 0][peau > 0]) * 100 / 255))
        f[a:z] = nb; enc.stdin.write(f.tobytes())
    enc.stdin.close(); enc.wait()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-i', entree, '-map', '0:v', '-map', '1:a?', '-c', 'copy', '-shortest', sortie], check=True)
    os.remove(tmp)
    return {'images': n, 'peau_L_avant_med': round(float(np.median(avant)), 1) if avant else None,
            'peau_L_apres_med': round(float(np.median(apres)), 1) if apres else None, 'cible_L': CIBLE_L, 'cible_b': CIBLE_B}


if __name__ == '__main__':
    import json
    print(json.dumps(passe(sys.argv[1], sys.argv[2]), ensure_ascii=False))
