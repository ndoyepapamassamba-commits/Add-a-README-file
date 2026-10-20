# ASSEMBLAGE DES PLANS GÉNÉRÉS (20/10/2026) — étape 3 de la chaîne générative (plan_generatif.py → modal_studio.py → ICI).
# Remplace le tournage des marionnettes dans l'usine : même sortie (D/clip/f%05d.jpg 576 × 460, D/tournage.json, D/boites.json),
# donc montage, sous-titres, son, export et juge unique ne changent pas. Pour chaque plan :
#   · couleur : un réglage Lab constant ramène le plan généré sur son image clé (fluide.reglage_couleur, même lumière que le film) ;
#   · temps : 25 i/s d'InfiniteTalk → 30 i/s par RIFE (MIT ; flux DIS d'OpenCV en secours) — fluide.retime ;
#   · caméra : le plan est généré caméra fixe ; le trajet de caméra du moteur (cameras.json : ouverture large → plan à deux,
#     poussée de 5 %) est rejoué en recadrant l'image générée ;
#   · juge : boîtes de la tête et de la bouche reportées depuis l'image clé, ouverture des lèvres MESURÉE sur chaque image
#     générée (visage_mesure, MediaPipe FaceLandmarker) — la porte A juge la bouche réellement animée par le modèle.
# Un plan sans vidéo générée est rempli par l'image clé fixe et noté « source: image clé » : le juge (porte D, vie) le refuse.
#   GENERATIF_DIR=… python3 assemble_generatif.py DOSSIER_VERSION   (dans le dossier de l'épisode)
import json, math, os, sys
import numpy as np, cv2

ICI = os.path.dirname(os.path.abspath(__file__)); MOTEUR = os.path.join(os.path.dirname(ICI), 'moteur-troupe'); sys.path.insert(0, MOTEUR)
import fluide, visage_mesure as VM

CW, CH, FPS = 576, 460, 30


def _vue(cam_f, cam_k, gw, gh):
    """rectangle de l'image générée (gw × gh, vue de la caméra de l'image clé) que montre la caméra cam_f, au format du clip."""
    kx0, ky0 = cam_k[0] - cam_k[2] / 2, cam_k[1] - cam_k[3] / 2
    x0 = (cam_f[0] - cam_f[2] / 2 - kx0) / cam_k[2] * gw; y0 = (cam_f[1] - cam_f[3] / 2 - ky0) / cam_k[3] * gh
    w, h = cam_f[2] / cam_k[2] * gw, cam_f[3] / cam_k[3] * gh
    a = CW / CH   # format du clip (1,252) un peu plus large que l'image clé (1,222) : on garde la largeur, on rogne la hauteur
    if w / h < a: y0, h = y0 + (h - w / a) / 2, w / a
    else: x0, w = x0 + (w - h * a) / 2, h * a
    return x0, y0, w, h


def _coupe(im, r):
    x0, y0, w, h = r; M = np.array([[CW / w, 0, -x0 * CW / w], [0, CH / h, -y0 * CH / h]], np.float32)
    return cv2.warpAffine(im, M, (CW, CH), flags=cv2.INTER_AREA if w > CW else cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def _porte(b, r, gw, gh, kw, kh):
    """boîte de l'image clé (kw × kh) → coordonnées du clip pour la vue r de l'image générée (gw × gh)."""
    sx, sy = gw / kw, gh / kh; x0, y0, w, h = r
    return [round((b[0] * sx - x0) * CW / w, 1), round((b[1] * sy - y0) * CH / h, 1), round((b[2] * sx - x0) * CW / w, 1), round((b[3] * sy - y0) * CH / h, 1)]


def tourne(D):
    G = os.environ['GENERATIF_DIR']; T = json.load(open('timeline.json')); P = json.load(open(f'{G}/plans.json'))
    CAM = json.load(open(f'{G}/cameras.json')); BK = json.load(open(f'{G}/cles/boites.json'))
    nf = int(math.ceil(T['total'] * FPS)); os.makedirs(f'{D}/clip', exist_ok=True); boites, sources = {}, {}
    rife = fluide.rife_present()
    for m in P['detail']:
        d = f"{G}/plans/plan-{m['plan']:02d}"; f0, f1 = int(round(m['t0'] * FPS)), min(nf, int(round(m['t1'] * FPS)))
        cle = cv2.imread(f'{d}/image.jpg'); kh, kw = cle.shape[:2]
        fr, fps = fluide.lit(f'{d}/genere.mp4') if os.path.isfile(f'{d}/genere.mp4') else ([], 0)
        if fr:
            col = fluide.reglage_couleur(cv2.resize(fr[0], (kw, kh), interpolation=cv2.INTER_AREA), cle)
            fr = [col(x) for x in fr]; fr, _ = (fluide.retime if rife else fluide.retime_flux)(fr, fps, f1 - f0)
            sources[m['plan']] = {'source': 'InfiniteTalk', 'images_moteur': len(fr), 'fps_moteur': round(fps, 2), 'interpolation': 'RIFE' if rife else 'flux DIS'}
        else:
            fr = [cle] * (f1 - f0); sources[m['plan']] = {'source': 'image clé (plan non généré)'}
        gh, gw = fr[0].shape[:2]; bk = BK[str(m['image_cle'])]
        for k, f in enumerate(range(f0, f1)):
            r = _vue(CAM[str(f)], CAM[str(m['image_cle'])], gw, gh); im = _coupe(fr[k], r)
            cv2.imwrite(f'{D}/clip/f{f:05d}.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 93])
            b = {}
            for n, v in bk.items():
                t_ = _porte(v['tete'], r, gw, gh, kw, kh); bo = _porte(v['bouche'], r, gw, gh, kw, kh)
                b[n] = {'tete': t_, 'bouche': bo, 'pose': 'genere'}
                if n in m['anime']:   # lèvres mesurées sur l'image générée (porte A)
                    x0, y0 = max(0, int(t_[0] - 0.3 * (t_[2] - t_[0]))), max(0, int(t_[1]))
                    x1, y1 = min(CW, int(t_[2] + 0.3 * (t_[2] - t_[0]))), min(CH, int(t_[3] + 0.15 * (t_[3] - t_[1])))
                    mv = VM.mesure(cv2.resize(im[y0:y1, x0:x1], None, fx=2, fy=2)) if x1 - x0 > 16 and y1 - y0 > 16 else None
                    if mv: b[n]['ouv'] = mv['levres']
            boites[str(f)] = b
    json.dump(boites, open(f'{D}/boites.json', 'w'))
    TG = json.load(open(f'{G}/cles/tournage.json'))   # découpage et lieux du rendu des images clés (même découpage, déterministe)
    json.dump({'fps': FPS, 'generatif': True, 'decoupage': TG.get('decoupage') or [[m['t0'], m['t1'], m['sketch'], m['cadre'], m['anime']] for m in P['detail']],
               'images': nf, 'lieux': TG.get('lieux', {}), 'sources': sources}, open(f'{D}/tournage.json', 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({'images': nf, 'plans': len(P['detail']), 'generes': sum(s['source'] == 'InfiniteTalk' for s in sources.values())}, ensure_ascii=False))


if __name__ == '__main__':
    tourne(sys.argv[1])
