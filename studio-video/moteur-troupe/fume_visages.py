"""Essai de fumée des bibliothèques d'expressions (charge + visage) avant tout tournage : chaque personnage, bouche
fermée / mi-ouverte / ouverte, neutre et en riant ; planche de contrôle.   python3 fume_visages.py <prep> <planche.jpg> [lieu,lieu…]
19/10/2026 : la liste des lieux de l'épisode limite l'essai à ceux qui seront tournés (les lieux « -reel », photos écartées par
l'utilisateur, arrêtaient l'usine alors qu'aucun plan ne s'y tourne)."""
import hashlib, json, os, sys
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import expressions_lp as XL


def empreinte(*chemins):
    """DÉJÀ VÉRIFIÉ (20/10/2026, « 13 minutes, diminue encore » : cet essai prenait 45 s par épisode sur des bibliothèques
    inchangées) : taille et date de chaque fichier de la bibliothèque, du visage 3D et de l'image de la scène, plus le code
    d'expressions_lp — le moindre changement refait l'essai."""
    h = hashlib.sha1(open(XL.__file__, 'rb').read())
    for c in chemins:
        fs = [os.path.join(r, f) for r, _, n in os.walk(c) for f in n if not f.startswith('.fume')] if os.path.isdir(c) else [c]
        for f in sorted(fs):
            st = os.stat(f); h.update(f'{os.path.relpath(f, c)}|{st.st_size}|{int(st.st_mtime)}'.encode())
    return h.hexdigest()[:20]

PREP, OUT = sys.argv[1], sys.argv[2]; LIEUX = set(sys.argv[3].split(',')) if len(sys.argv) > 3 and sys.argv[3] else None
lignes, erreurs = [], []
for sc in sorted(os.listdir(PREP)):
    fs = f'{PREP}/{sc}/scene.json'
    if not os.path.isfile(fs) or (LIEUX is not None and sc not in LIEUX): continue
    S = json.load(open(fs)); img = cv2.cvtColor(cv2.imread(f'{PREP}/{sc}/image.png'), cv2.COLOR_BGR2RGB)
    for a in S['acteurs']:
        dl = f"{PREP}/{sc}/expressions/{a['slug']}"; f3 = f"{PREP}/{sc}/rig/visage3d-{a['slug']}.npy"
        if not os.path.isfile(f'{dl}/meta.json') or not os.path.isfile(f3): continue
        cle = empreinte(dl, f3, f'{PREP}/{sc}/image.png'); dej = f'{dl}/.fume-ok'
        if os.environ.get('FUME_TOUJOURS') != '1' and os.path.isfile(dej) and open(dej).read().strip() == cle and os.path.isfile(f'{dl}/.fume.jpg'):
            lignes.append(cv2.imread(f'{dl}/.fume.jpg')); print(sc, a['slug'], 'ok (déjà vérifié, bibliothèque inchangée)', flush=True); continue
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
            cv2.imwrite(f'{dl}/.fume.jpg', l, [cv2.IMWRITE_JPEG_QUALITY, 88]); open(dej, 'w').write(cle)
            print(sc, a['slug'], 'ok', flush=True)
        except Exception as ex:
            erreurs.append((a['slug'], repr(ex)[:160])); print(sc, a['slug'], 'ERREUR', repr(ex)[:160], flush=True)
if lignes: cv2.imwrite(OUT, np.vstack(lignes), [cv2.IMWRITE_JPEG_QUALITY, 88])
print('ERREURS' if erreurs else 'TOUT OK', erreurs)
sys.exit(1 if erreurs else 0)
