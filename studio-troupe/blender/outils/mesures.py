#!/usr/bin/env python3
"""Mesures de qualité d'une vidéo — MÊMES définitions que le contrôle qualité du studio
(workbench : direct/lib/studio/videoMetrics.ts, profil de référence server/jev/studio/qualityRef.ts).

Définitions (identiques au code TypeScript) :
  - échantillonnage : 25 images/s sur les 12 premières secondes, chaque image réduite à 180 × 320 (largeur × hauteur),
    valeurs entières 0–255. Le profil REFERENCE_041701 a été mesuré avec la chaîne ffmpeg
    « -t 12 -vf fps=25,scale=180:320 -pix_fmt rgb24 » (mise à l'échelle bicubique par défaut de ffmpeg) : ce module
    utilise EXACTEMENT cette chaîne (vérifié : 041701 → 8,833 / 57,548 / 105,744 / 42,327 / 1,161 / 1,973 / 6, soit les
    valeurs de qualityRef.ts au centième près ; une réduction « moyenne de zone » donnerait 8,39 de netteté) ;
    n = max(3, floor(min(secondes, durée) · 25)) images ;
  - gris = (R + V + B) / 3 ;
  - netteté (sharpness) = moyenne sur les images de la moyenne de |4·g − haut − bas − gauche − droite| (Laplacien,
    pixels intérieurs) ;
  - richesse des couleurs (colorfulness, Hasler–Süsstrunk) = moyenne de sqrt(var(rg) + var(yb)) + 0,3·sqrt(m_rg² + m_yb²)
    avec rg = R − V, yb = (R + V)/2 − B ;
  - luminosité (brightness) = moyenne du gris ; contraste (contrast) = écart type du gris (population) ;
  - mouvement (motion) = médiane, sur les paires d'images successives, de la moyenne |g_i − g_(i−1)| ;
  - saccades (jerk) = médiane de la moyenne |(g_i − g_(i−1)) − (g_(i−1) − g_(i−2))| ;
  - rythme des plans (shotSeconds) = n / fps / (coupes + 1), une coupe = une différence d'images > 30.
  La médiane prend l'élément d'indice floor(len/2) de la liste triée (comme le code TS).

Options propres à ce module (n'altèrent pas les définitions) :
  - recadrage x,y,l,h en pixels source avant réduction (ex. la bande de scène d'une vidéo TikTok) ; la réduction garde
    alors le MÊME facteur que pour l'image entière (largeur source / 180) pour que la netteté reste comparable ;
  - début (s) pour ignorer une introduction, fin (s) pour couper une carte de fin.

Utilisation :
  python mesures.py video.mp4 [--recadrage 0,531,1080,859] [--secondes 12] [--debut 0] [--fin 10.03] [--json sortie.json]
  ou depuis Python : from mesures import mesurer ; m = mesurer('video.mp4')
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys

import numpy as np

CLES = ('sharpness', 'colorfulness', 'brightness', 'contrast', 'motion', 'jerk', 'shotSeconds')
LIBELLES = {
    'sharpness': 'Netteté', 'colorfulness': 'Richesse des couleurs', 'brightness': 'Luminosité', 'contrast': 'Contraste',
    'motion': 'Quantité de mouvement', 'jerk': 'Fluidité (saccades)', 'shotSeconds': 'Rythme des plans',
}
# Profil de référence (copie de REFERENCE_041701 dans qualityRef.ts) et pondérations du score de fidélité.
REFERENCE_041701 = {
    'target': {'sharpness': 8.83, 'colorfulness': 57.55, 'brightness': 105.74, 'contrast': 42.33, 'motion': 1.16, 'jerk': 1.97, 'shotSeconds': 6},
    'min': {'sharpness': 8.83, 'colorfulness': 45.3, 'brightness': 69.93, 'contrast': 42.33, 'motion': 0.52, 'jerk': 0.85, 'shotSeconds': 4},
    'max': {'sharpness': 18.34, 'colorfulness': 87.81, 'brightness': 128.19, 'contrast': 59.14, 'motion': 2.33, 'jerk': 4.06, 'shotSeconds': 6},
}
POIDS = {'sharpness': 1.2, 'colorfulness': 1, 'brightness': 0.8, 'contrast': 0.8, 'motion': 1.2, 'jerk': 1.5, 'shotSeconds': 0.8}
L_MESURE, H_MESURE = 180, 320


def _sonde(chemin: str) -> tuple[int, int, float, float]:
    """(largeur, hauteur, i/s, durée) du premier flux vidéo."""
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                          'stream=width,height,r_frame_rate,avg_frame_rate,duration:format=duration', '-of', 'json', chemin],
                         check=True, capture_output=True, text=True).stdout
    j = json.loads(out)
    s = j['streams'][0]
    num, den = (s.get('avg_frame_rate') or s['r_frame_rate']).split('/')
    fps = float(num) / float(den) if float(den) else 30.0
    dur = float(s.get('duration') or j.get('format', {}).get('duration') or 0)
    return int(s['width']), int(s['height']), fps, dur


def _images_ffmpeg(chemin: str, debut: float, duree: float, fps: float, filtre_spatial: str, l: int, h: int) -> list[np.ndarray]:
    """Images échantillonnées par ffmpeg (fps puis recadrage/réduction bicubique), RVB uint8."""
    cmd = ['ffmpeg', '-v', 'error']
    if debut > 0:
        cmd += ['-ss', f'{debut:.6f}']
    cmd += ['-i', chemin, '-t', f'{duree:.6f}', '-vf', f'fps={fps:g},{filtre_spatial}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    out = subprocess.run(cmd, check=True, capture_output=True).stdout
    a = np.frombuffer(out, np.uint8)
    k = a.size // (l * h * 3)
    return list(a[:k * l * h * 3].reshape(k, h, l, 3))


def metriques_images(images: list[np.ndarray], fps: float) -> dict:
    """Les 7 métriques à partir d'images RVB uint8 déjà réduites (définitions de videoMetrics.ts)."""
    n = len(images)
    sharp = colf = bright = contr = 0.0
    d1: list[float] = []
    d2: list[float] = []
    prev = None
    prev_d = None
    for im in images:
        rgb = im.astype(np.float64)
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        gray = (r + g + b) / 3
        rg = r - g
        yb = 0.5 * (r + g) - b
        mrg, myb = rg.mean(), yb.mean()
        colf += math.sqrt(max(0.0, (rg * rg).mean() - mrg * mrg + ((yb * yb).mean() - myb * myb))) + 0.3 * math.sqrt(mrg * mrg + myb * myb)
        mg = gray.mean()
        bright += mg
        contr += math.sqrt(max(0.0, (gray * gray).mean() - mg * mg))
        lap = np.abs(4 * gray[1:-1, 1:-1] - gray[:-2, 1:-1] - gray[2:, 1:-1] - gray[1:-1, :-2] - gray[1:-1, 2:])
        sharp += float(lap.mean())
        if prev is not None:
            diff = gray - prev
            d1.append(float(np.abs(diff).mean()))
            if prev_d is not None:
                d2.append(float(np.abs(diff - prev_d).mean()))
            prev_d = diff
        prev = gray

    def med(a: list[float]) -> float:
        s = sorted(a)
        return s[len(s) // 2] if s else 0.0

    coupes = sum(1 for x in d1 if x > 30)
    return {'sharpness': sharp / n, 'colorfulness': colf / n, 'brightness': bright / n, 'contrast': contr / n,
            'motion': med(d1), 'jerk': med(d2), 'shotSeconds': n / fps / (coupes + 1),
            '_details': {'images': n, 'coupes': coupes, 'motion_par_image': d1, 'jerk_par_image': d2}}


def mesurer(chemin: str, secondes: float = 12.0, fps: float = 25.0, recadrage: tuple[int, int, int, int] | None = None,
            debut: float = 0.0, fin: float | None = None, details: bool = False) -> dict:
    """Mesure une vidéo (voir l'en-tête). recadrage = (x, y, l, h) en pixels source."""
    L, H, fps_src, dur = _sonde(chemin)
    if fin is not None:
        dur = min(dur, fin)
    dur_utile = min(secondes, max(0.0, dur - debut))
    n = max(3, int(math.floor(dur_utile * fps)))
    facteur = L / L_MESURE  # même densité que l'image entière 1080×1920 → 180×320
    if recadrage:
        x, y, l, h = recadrage
        # le filtre crop de ffmpeg arrondit x, y au pair en 4:2:0 : on prend la zone paire contenue dans la demande
        x2, y2 = x + (x & 1), y + (y & 1)
        l, h = (l - (x2 - x)) & ~1, (h - (y2 - y)) & ~1
        x, y = x2, y2
        taille = (max(1, int(round(l / facteur))), max(1, int(round(h / facteur))))
        filtre = f'crop={l}:{h}:{x}:{y},scale={taille[0]}:{taille[1]}'
    else:
        x, y, l, h = 0, 0, L, H
        taille = (L_MESURE, H_MESURE)
        filtre = f'scale={L_MESURE}:{H_MESURE}'
    images = _images_ffmpeg(chemin, debut, dur_utile, fps, filtre, *taille)[:n]
    if not images:
        raise RuntimeError(f'aucune image lue dans {chemin}')
    while len(images) < n:  # flux plus court que prévu : on répète la dernière image (comme un lecteur en fin de flux)
        images.append(images[-1])
    m = metriques_images(images, fps)
    info = m.pop('_details')
    res = {k: round(float(m[k]), 4) for k in CLES}
    res['_mesure'] = {'fichier': chemin.split('/')[-1], 'source': [L, H, round(fps_src, 3), round(dur, 3)], 'recadrage': [x, y, l, h],
                      'taille_mesure': list(taille), 'fps': fps, 'secondes': round(n / fps, 3), 'debut': debut, 'images': n,
                      'coupes': info['coupes'], 'chaine': f'ffmpeg -t {dur_utile:g} -vf fps={fps:g},{filtre} -pix_fmt rgb24'}
    if details:
        res['_par_image'] = {'motion': [round(v, 3) for v in info['motion_par_image']], 'jerk': [round(v, 3) for v in info['jerk_par_image']]}
    return res


def score_metrique(k: str, x: float, p: dict = REFERENCE_041701) -> int:
    """% d'une métrique (metricScore de qualityRef.ts)."""
    if not math.isfinite(x):
        return 0
    lo, hi = p['min'][k], p['max'][k]
    if k == 'jerk' and x <= hi:
        return 100
    if lo <= x <= hi:
        return 100
    span = max(hi - lo, abs(p['target'][k]) * 0.25, 1e-6)
    out = lo - x if x < lo else x - hi
    return max(0, round(100 * (1 - out / span)))


def fidelite(m: dict, p: dict = REFERENCE_041701) -> dict:
    """Score de fidélité visuelle pondéré (visualFidelity de qualityRef.ts)."""
    items = [{'cle': k, 'libelle': LIBELLES[k], 'valeur': m[k], 'cible': p['target'][k], 'score': score_metrique(k, m[k], p)} for k in POIDS]
    tw = sum(POIDS.values())
    return {'score': round(sum(i['score'] * POIDS[i['cle']] for i in items) / tw), 'items': items}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description='Mesures de qualité (définitions du contrôle qualité du studio).')
    ap.add_argument('video')
    ap.add_argument('--secondes', type=float, default=12.0)
    ap.add_argument('--fps', type=float, default=25.0)
    ap.add_argument('--recadrage', help='x,y,l,h en pixels source')
    ap.add_argument('--debut', type=float, default=0.0)
    ap.add_argument('--fin', type=float)
    ap.add_argument('--details', action='store_true')
    ap.add_argument('--json', help='fichier de sortie')
    a = ap.parse_args(argv)
    rec = tuple(int(v) for v in a.recadrage.split(',')) if a.recadrage else None
    m = mesurer(a.video, a.secondes, a.fps, rec, a.debut, a.fin, a.details)
    m['_fidelite_041701'] = fidelite(m)
    txt = json.dumps(m, ensure_ascii=False, indent=1)
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as f:
            f.write(txt)
    print(txt if not a.details else json.dumps({k: v for k, v in m.items() if k != '_par_image'}, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
