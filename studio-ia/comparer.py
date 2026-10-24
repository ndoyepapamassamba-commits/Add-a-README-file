"""Comparatif des moteurs vidéo sur un même sketch : même image, même prompt, accent jugé à l'oreille par ecouter.py.

  python3 comparer.py SKETCH_ID
"""
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import ecouter  # noqa: E402
import generer  # noqa: E402
import or_api  # noqa: E402

MOTEURS = [  # (modèle, résolution, format)
    ("x-ai/grok-imagine-video-1.5-lite", "480p", "4:3"),
    ("x-ai/grok-imagine-video", "480p", "4:3"),
    ("x-ai/grok-imagine-video-1.5", "480p", "4:3"),
    ("google/veo-3.1-lite", "720p", "16:9"),
    ("bytedance/seedance-2.0-mini", "480p", "4:3"),
]
QUESTION = ("Écoute les voix de ce sketch. Réponds sur UNE ligne au format : ACCENT=<ivoirien|ouest-africain|"
            "africain autre|français de France|autre> ; NATUREL=<note sur 10> ; DIALOGUE_COMPLET=<oui|non> ; remarque courte.")


def essai(sid, modele, resolution, aspect, duree):
    s = generer.sketchs()[sid]
    dossier = generer.SORTIE / "comparatif"
    dossier.mkdir(parents=True, exist_ok=True)
    sortie = dossier / f"{sid}_{modele.split('/')[1]}.mp4"
    try:
        if not sortie.exists():
            job = or_api.video_lancer(modele, generer.prompt_video(s), generer.IMAGES / f"{sid}.jpg", duree=duree,
                                      resolution=resolution, aspect=aspect)
            cout = or_api.video_attendre(job, sortie, modele, ref=f"comparatif {sid}", pause=10)
        else:
            cout = "déjà fait"
        avis = ecouter.ecouter(sortie, QUESTION).strip().replace("\n", " ")
        return f"{modele:36s} {cout!s:>8} $ | {avis}"
    except Exception as e:
        return f"{modele:36s} ERREUR {str(e)[:300]}"


if __name__ == "__main__":
    sid = sys.argv[1]
    with ThreadPoolExecutor(len(MOTEURS)) as ex:
        for ligne in ex.map(lambda m: essai(sid, m[0], m[1], m[2], 8), MOTEURS):
            print(ligne)
    print(f"reste sur la clé : {or_api.reste_cle():.2f} $")
