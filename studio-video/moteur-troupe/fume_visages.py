"""Essai de fumée des bibliothèques d'expressions (charge + visage) avant tout tournage : chaque personnage, bouche
fermée / mi-ouverte / ouverte, neutre et en riant ; planche de contrôle.   python3 fume_visages.py <prep> <planche.jpg>"""
import json, os, sys
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import expressions_lp as XL

PREP, OUT = sys.argv[1], sys.argv[2]
lignes, erreurs = [], []
for sc in sorted(os.listdir(PREP)):
    fs = f'{PREP}/{sc}/scene.json'
    if not os.path.isfile(fs): continue
    S = json.load(open(fs)); img = cv2.cvtColor(cv2.imread(f'{PREP}/{sc}/image.png'), cv2.COLOR_BGR2RGB)
    for a in S['acteurs']:
        dl = f"{PREP}/{sc}/expressions/{a['slug']}"; f3 = f"{PREP}/{sc}/rig/visage3d-{a['slug']}.npy"
        if not os.path.isfile(f'{dl}/meta.json') or not os.path.isfile(f3): continue
        try:
            B = XL.charge(dl, img, np.load(f3)); ims = []
            for emo in ({}, {'rire': 1.0}):
                for b in (0.0, 0.5, 1.0):
                    v = XL.visage(B, emo, b)
                    assert v.shape[:2] == (B['taille'], B['taille']) and np.isfinite(v).all()
                    o = cv2.resize(np.clip(v, 0, 255).astype(np.uint8), (150, 150), interpolation=cv2.INTER_AREA)
                    o = cv2.cvtColor(o, cv2.COLOR_RGB2BGR)
                    cv2.putText(o, f"{'rire' if emo else 'neutre'} {b}", (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1)
                    ims.append(o)
            colle = XL.colle(img, B, XL.visage(B, {}, 0.0)); assert colle.shape == img.shape
            rp, o_ = XL.paupieres(B)   # contrôle du clignement (18/10) : les yeux clos doivent cacher le blanc des yeux
            print(sc, a['slug'], 'paupières : indice de fermeture', rp, '(blanc des yeux du neutre', o_, ')', flush=True)
            if (B['meta'].get('lunettes') or 0) <= 0.5: assert rp <= XL.SCLERE_CLOS   # yeux derrière des lunettes noires : rien à fermer à l'image, f'yeux clos encore ouverts ({rp} > {XL.SCLERE_CLOS})'
            ims.append(cv2.cvtColor(cv2.resize(np.clip(XL.visage(B, {}, 0.0, 1.0), 0, 255).astype(np.uint8), (150, 150), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2BGR))
            l = np.hstack(ims); cv2.putText(l, a['slug'], (4, 146), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1); lignes.append(l)
            print(sc, a['slug'], 'ok', flush=True)
        except Exception as ex:
            erreurs.append((a['slug'], repr(ex)[:160])); print(sc, a['slug'], 'ERREUR', repr(ex)[:160], flush=True)
if lignes: cv2.imwrite(OUT, np.vstack(lignes), [cv2.IMWRITE_JPEG_QUALITY, 88])
print('ERREURS' if erreurs else 'TOUT OK', erreurs)
sys.exit(1 if erreurs else 0)
