# DOUBLONS (20/10/2026) — « les 10000 vidéos […] avec possibilité en cas de doublon ou bien de cocher déjà publié ».
# Une vidéo trop proche d'une autre déjà livrée (même épisode refait, même plan repris, même fichier recodé) ne doit pas
# partir deux fois sur le compte : TikTok écarte le contenu recopié des recommandations (règles « contenu non original »).
# GREFFE : ImageHash (BSD-2-Clause, PyPI imagehash 4.3.2) — empreinte perceptuelle pHash 64 bits de chaque image ;
# ffmpeg lit une image par seconde, réduite et en gris. Ressemblance de A à B = part des images de A qui ont une jumelle dans B
# (écart de Hamming ≤ ECART_MAX), le titre (2 premières s) et le carton de fin (FIN_S dernières s) exclus : ils sont communs à
# toute la série par construction. Seuil SEUIL_DOUBLON mesuré sur nos films (tableau dans SERIE.md, « Doublons »).
import json, os, subprocess, sys
import numpy as np

ECART_MAX = 8          # bits sur 64 : deux images « jumelles »
# calibré le 20/10/2026 sur 8 films (SERIE.md, « Doublons ») : même film recodé 1,000 ; versions d'un même épisode (v15, v16,
# v17) 0,612 à 0,820 ; épisodes différents 0,000 à 0,500 (0,500 = deux épisodes des mêmes acteurs dans les mêmes décors)
SEUIL_DOUBLON = 0.6    # au-delà : doublon (même épisode refait ou recopié) — la vidéo n'est pas proposée à la publication
SEUIL_PROCHE = 0.45    # entre les deux : « proche » — simple avertissement (même duo, même décor, autre histoire)
DEBUT_S, FIN_S = 2.0, 6.0


def empreinte(video, fps=1.0):
    """pHash 64 bits (entiers) d'une image par seconde, titre et fin exclus."""
    import imagehash
    from PIL import Image
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]))
    w, h = 90, 160
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(DEBUT_S), '-t', str(max(1.0, dur - DEBUT_S - FIN_S)), '-i', video,
                          '-vf', f'fps={fps},scale={w}:{h},format=gray', '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
    im = np.frombuffer(raw, np.uint8).reshape(-1, h, w)
    return [int(str(imagehash.phash(Image.fromarray(x))), 16) for x in im]


def ressemblance(a, b):
    """part des images de a qui ont une jumelle dans b (0 à 1)."""
    if not a or not b: return 0.0
    B = np.array(b, dtype=np.uint64)
    n = 0
    for x in a:
        d = np.array([bin(int(v)).count('1') for v in (B ^ np.uint64(x))])
        n += int(d.min() <= ECART_MAX)
    return n / len(a)


def cherche(emp, autres):
    """autres : {id: empreinte} → (id le plus proche, ressemblance symétrique max)."""
    best = (None, 0.0)
    for i, e in autres.items():
        r = max(ressemblance(emp, e), ressemblance(e, emp))
        if r > best[1]: best = (i, round(r, 3))
    return best


if __name__ == '__main__':
    V = sys.argv[1:]; E = {v: empreinte(v) for v in V}
    for i, a in enumerate(V):
        for b in V[i + 1:]:
            print(f'{max(ressemblance(E[a], E[b]), ressemblance(E[b], E[a])):.3f}  {a}  ↔  {b}')
