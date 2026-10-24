"""Fabrique des clips : sketch → image (Nano Banana) → vidéo parlante (Grok Imagine) → contrôle.

  python3 generer.py devis                 estimation du coût de tous les sketchs restants
  python3 generer.py images  [ids…]        images de départ (toutes si aucun id)
  python3 generer.py videos  [ids…]        vidéos à partir des images
  python3 generer.py controle [ids…]       transcription + comparaison au dialogue
  python3 generer.py planche [ids…]        planches d'images pour la relecture

L'état de chaque sketch est gardé dans sortie/etat.json : une vidéo lancée n'est jamais relancée
(on reprend son suivi), une étape faite n'est pas refaite. --refaire force une nouvelle génération.
"""
import difflib
import glob
import json
import re
import sys
import threading
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import or_api  # noqa: E402

SORTIE = ICI / "sortie"
IMAGES, CLIPS = SORTIE / "images", SORTIE / "clips"
ETAT = SORTIE / "etat.json"

MODELE_IMAGE = "google/gemini-3.1-flash-lite-image"
MODELE_VIDEO = "x-ai/grok-imagine-video-1.5-lite"
RESOLUTION = "480p"
PRIX_SECONDE, PRIX_IMAGE_ENTREE, PRIX_IMAGE = 0.02, 0.01, 0.034
PLANCHER = 0.40   # on s'arrête avant que la clé descende sous ce reste (dollars)

STYLE = ("3D animated cartoon still in Pixar/DreamWorks style, West African comedy sketch set in Abidjan, Cote d'Ivoire. "
         "All characters are Black Ivorian people with deep dark-brown skin and African facial features, "
         "big expressive eyes, exaggerated comedic expressions and body language.")
FINITION = ("Characters fully visible from head to knees, clear readable faces, warm cinematic lighting, "
            "vibrant saturated colors, high detail, clean composition, no text, no letters, no logo, no watermark.")
VOIX = ("Dialogue in French spoken with a strong Ivorian accent from Abidjan, natural African voices: "
        "Ivorian men's voices for men, Ivorian women's voices for women, children's voices for children. "
        "No background music, no subtitles, no text on screen.")

verrou = threading.Lock()


def sketchs():
    return {s["id"]: s for f in sorted(glob.glob(str(ICI / "sketchs" / "lot*.json"))) for s in json.load(open(f))}


def lire_etat():
    return json.loads(ETAT.read_text()) if ETAT.exists() else {}


def maj_etat(sid, **champs):
    with verrou:
        e = lire_etat()
        e.setdefault(sid, {}).update(champs)
        ETAT.write_text(json.dumps(e, ensure_ascii=False, indent=1))


def mots_dialogue(s):
    return sum(len(t.split()) for _, t in s["dialogue"])


def duree(s):
    """Environ 2,9 mots par seconde chez Grok, plus le temps de la réaction finale."""
    if "duree" in s:
        return s["duree"]
    m = mots_dialogue(s)
    return 6 if m <= 14 else 7 if m <= 17 else 8 if m <= 20 else 9 if m <= 23 else 10


def prompt_image(s):
    persos = " ".join(f"{p['desc'][0].upper() + p['desc'][1:]}, {p['pose']}." for p in s["persos"])
    return f"{STYLE} Scene: {s['lieu']}. {persos} {FINITION}"


def prompt_video(s):
    noms = [p["nom"] for p in s["persos"]]
    lignes = " ".join(f'{noms[i].upper()}: "{t}"' for i, t in s["dialogue"])
    return ("Animate this exact image, keep the same characters, faces, skin tones and setting. Static camera, "
            "Pixar-style 3D cartoon acting, punchy comedic timing, accurate lip-sync: only the character who is "
            f"speaking moves the lips. {s['jeu']} At the very end, quick cut to a close-up of {noms[s['fin']]}'s face "
            f"reacting in exaggerated cartoon shock, looking straight into the camera. {VOIX} {lignes}")


def cout_estime(s, image=True, video=True):
    return (PRIX_IMAGE if image else 0) + ((duree(s) * PRIX_SECONDE + PRIX_IMAGE_ENTREE) if video else 0)


def assez_de_budget(montant):
    reste = or_api.reste_cle()
    if reste is not None and reste - montant < PLANCHER:
        print(f"  ARRÊT budget : reste {reste:.2f} $, besoin {montant:.2f} $, plancher {PLANCHER} $")
        return False
    return True


def faire_image(s, refaire=False):
    sid = s["id"]
    chemin = IMAGES / f"{sid}.jpg"
    if chemin.exists() and not refaire:
        return
    if not assez_de_budget(PRIX_IMAGE):
        return
    try:
        cout = or_api.image(MODELE_IMAGE, prompt_image(s), chemin, aspect="4:3", resolution="1K", ref=sid)
        maj_etat(sid, image=chemin.name, cout_image=cout, video=None, job=None, controle=None)
        print(f"  image {sid} ok ({cout} $)")
    except Exception as e:
        print(f"  image {sid} ERREUR {e}")


def faire_video(s, refaire=False):
    sid = s["id"]
    chemin, image = CLIPS / f"{sid}.mp4", IMAGES / f"{sid}.jpg"
    etat = lire_etat().get(sid, {})
    if chemin.exists() and not refaire:
        return
    if not image.exists():
        print(f"  vidéo {sid} : pas d'image")
        return
    job = None if refaire else etat.get("job")
    try:
        if not job:
            if not assez_de_budget(cout_estime(s, image=False)):
                return
            job = or_api.video_lancer(MODELE_VIDEO, prompt_video(s), image, duree=duree(s),
                                      resolution=RESOLUTION, aspect="4:3")
            maj_etat(sid, job=job, duree=duree(s))
        cout = or_api.video_attendre(job, chemin, MODELE_VIDEO, ref=sid, pause=10)
        maj_etat(sid, video=chemin.name, cout_video=cout, controle=None)
        print(f"  vidéo {sid} ok ({cout} $)")
    except Exception as e:
        maj_etat(sid, job=None, erreur=str(e)[:300])
        print(f"  vidéo {sid} ERREUR {e}")


def normaliser(texte):
    t = unicodedata.normalize("NFD", texte.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.findall(r"[a-z0-9]+", t)


def controler(s):
    import transcrire
    sid = s["id"]
    chemin = CLIPS / f"{sid}.mp4"
    if not chemin.exists():
        return
    attendu = " ".join(t for _, t in s["dialogue"])
    # sans texte d'amorce : l'amorce fait parfois dérailler la transcription (« Oh ! » seul)
    mots = transcrire.mots(chemin)
    entendu = " ".join(m for _, _, m in mots)
    score = difflib.SequenceMatcher(None, normaliser(attendu), normaliser(entendu)).ratio()
    maj_etat(sid, controle={"score": round(score, 2), "entendu": entendu,
                            "mots": [[round(a, 2), round(b, 2), m] for a, b, m in mots]})
    print(f"  contrôle {sid} : {score:.0%}  « {entendu} »")


def planche(ids):
    from PIL import Image, ImageDraw
    vignettes = [(sid, IMAGES / f"{sid}.jpg") for sid in ids if (IMAGES / f"{sid}.jpg").exists()]
    for n in range(0, len(vignettes), 12):
        lot = vignettes[n:n + 12]
        feuille = Image.new("RGB", (4 * 400, 3 * 300), "black")
        for k, (sid, p) in enumerate(lot):
            im = Image.open(p).convert("RGB").resize((400, 300))
            ImageDraw.Draw(im).text((8, 6), sid, fill="yellow")
            feuille.paste(im, ((k % 4) * 400, (k // 4) * 300))
        sortie = SORTIE / f"planche_{lot[0][0]}.jpg"
        feuille.save(sortie, quality=85)
        print(f"  {sortie}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    refaire = "--refaire" in sys.argv
    action, ids = args[0], args[1:]
    tous = sketchs()
    choisis = [tous[i] for i in ids] if ids else list(tous.values())
    IMAGES.mkdir(parents=True, exist_ok=True)
    CLIPS.mkdir(parents=True, exist_ok=True)
    if action == "devis":
        etat = lire_etat()
        reste = [s for s in choisis if not (CLIPS / f"{s['id']}.mp4").exists()]
        total = sum(cout_estime(s, image=not (IMAGES / f"{s['id']}.jpg").exists()) for s in reste)
        secs = sum(duree(s) for s in reste)
        print(f"{len(reste)} clips à faire, {secs} s de vidéo, coût estimé {total:.2f} $ ; clé : {or_api.reste_cle():.2f} $")
    elif action == "images":
        with ThreadPoolExecutor(4) as ex:
            list(ex.map(lambda s: faire_image(s, refaire), choisis))
    elif action == "videos":
        with ThreadPoolExecutor(6) as ex:
            list(ex.map(lambda s: faire_video(s, refaire), choisis))
    elif action == "controle":
        for s in choisis:
            controler(s)
    elif action == "planche":
        planche([s["id"] for s in choisis])
    print(f"dépensé (journal) : {or_api.total_depense():.2f} $ ; reste sur la clé : {or_api.reste_cle():.2f} $")


if __name__ == "__main__":
    main()
