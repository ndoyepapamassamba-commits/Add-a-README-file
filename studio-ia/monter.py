"""Montage TikTok : clips → segments 1080×1920 (fond flou, sous-titres mot à mot avec emojis 3D) → compilations ≥ 62 s
avec musique de fond (baissée sous les voix) et rires après la chute de chaque sketch.

  python3 monter.py audio                      prépare les rires et la boucle de musique (habillage/)
  python3 monter.py segments [ids…]            habille chaque clip (sortie/segments/)
  python3 monter.py compilation NOM ids…       assemble ces clips dans cet ordre (sortie/compilations/NOM.mp4)
  python3 monter.py compilations [noms…]       compilations de sketchs/programme.json (sinon : paquets d'au moins 62 s)

Emojis : Fluent Emoji de Microsoft (licence MIT). Musique : Lyria 3 (composée pour nous). Rires : générés par Grok.
Les sous-titres prennent l'orthographe du dialogue écrit et le minutage de la transcription (generer.py controle).
"""
import difflib
import json
import math
import re
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import generer  # noqa: E402

SORTIE = ICI / "sortie"
SEGMENTS, COMPILS = SORTIE / "segments", SORTIE / "compilations"
HABILLAGE = ICI / "habillage"
EMOJIS = HABILLAGE / "emojis"
POLICE = HABILLAGE / "Poppins-Black.ttf"
RIRES = sorted((HABILLAGE / "rires").glob("rire_*.m4a"))
MUSIQUE = HABILLAGE / "fond_musical.m4a"
L, H, IPS = 1080, 1920, 30
DUREE_MIN = 62.0
TRANSITION = 1.0
H_SCENE = 810                       # clip 4:3 sur toute la largeur
Y_SCENE = (H - H_SCENE) // 2 - 60
Y_TEXTE = Y_SCENE + H_SCENE + 120   # ligne des sous-titres, dans le flou sous la scène
BANDE_H, BANDE_Y = 420, Y_TEXTE - 210
TAILLE_TEXTE = 92
COULEURS = [(57, 255, 53), (255, 230, 0), (255, 60, 60), (77, 225, 255)]   # vert, jaune, rouge, cyan
VOLUME_MUSIQUE, VOLUME_RIRES = 0.22, 0.9
ENC_V = ["-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-r", str(IPS)]
ENC_A = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]

# mot (forme normalisée) → emoji ; le dernier groupe de chaque sketch reçoit toujours un emoji de rire
EMOJI_MOTS = {
    "argent": "argent", "francs": "argent", "franc": "argent", "mille": "argent", "millions": "argent",
    "million": "argent", "salaire": "argent", "payer": "argent", "paie": "argent", "loyer": "argent",
    "dot": "argent", "cotiser": "argent", "credit": "argent", "prix": "argent", "combien": "argent",
    "augmentez": "argent", "gratuitement": "billets", "manger": "poulet", "mange": "poulet", "viande": "poulet",
    "poulet": "poulet", "poulets": "poule", "garba": "marmite", "attieke": "marmite", "thon": "poisson",
    "sauce": "marmite", "marmite": "marmite", "cuisiner": "marmite", "riz": "marmite", "assiette": "marmite",
    "lumiere": "ampoule", "delestage": "ampoule", "courant": "ampoule", "eteint": "ampoule",
    "telephone": "telephone", "wifi": "telephone", "photo": "telephone", "aime": "coeur", "amour": "coeur",
    "epouse": "coeur", "marie": "coeur", "mariage": "bague", "enceinte": "femme_enceinte", "ecole": "diplome",
    "maitre": "diplome", "devoir": "diplome", "devoirs": "diplome", "diplome": "diplome", "universite": "diplome",
    "taxi": "taxi", "gbaka": "taxi", "chauffeur": "taxi", "voiture": "taxi", "pont": "pont", "patron": "valise",
    "entreprises": "valise", "travail": "valise", "voleur": "voleur", "corrige": "muscle", "cie": "facture",
    "sodeci": "facture", "facture": "facture", "proprietaire": "maison", "maison": "maison", "but": "ballon",
    "match": "ballon", "entraineur": "ballon", "tele": "tele", "dormir": "dormir", "dors": "dormir",
    "vaches": "vache", "poules": "poule", "coq": "coq", "poisson": "poisson", "tomate": "tomate", "pain": "pain",
    "chaussures": "chaussure", "cheveux": "ciseaux", "coiffeur": "ciseaux", "docteur": "docteur",
    "malade": "docteur", "medecin": "docteur", "sirop": "docteur", "rhume": "nez", "cadeau": "cadeau",
    "gaz": "gaz", "soleil": "soleil", "etoiles": "etoile", "lune": "lune", "ressemble": "yeux",
    "portrait": "yeux", "fiston": "main_bouche", "taille": "main_bouche", "barbe": "sueur", "maigri": "sueur",
    "sport": "muscle",
}
EMOJIS_RIRE = ["rire", "mdr", "crane"]


def lancer(cmd, entree=None):
    r = subprocess.run(cmd, capture_output=True, input=entree)
    if r.returncode:
        raise RuntimeError(r.stderr.decode(errors="replace")[-1500:])


def duree_media(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True).stdout)


def taille_video(p):
    w, h = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                           "-of", "csv=p=0", str(p)], capture_output=True, text=True).stdout.strip().split(",")
    return int(w), int(h)


norme = generer.normaliser


# ---------- audio : rires et boucle de musique ----------

def preparer_audio():
    (HABILLAGE / "rires").mkdir(exist_ok=True)
    # (source générée, début, durée) — plages relevées à l'écoute (ecouter.py) comme les plus propres
    extraits = [("salle_10s.mp4", 2.5, 4.0), ("salle_10s.mp4", 4.0, 4.0), ("amis_8s.mp4", 0.0, 3.5),
                ("salle_10s.mp4", 0.0, 4.0)]
    for k, (src, debut, duree) in enumerate(extraits, 1):
        lancer(["ffmpeg", "-v", "error", "-y", "-ss", str(debut), "-t", str(duree), "-i", str(SORTIE / "rires" / src),
                "-vn", "-af", f"loudnorm=I=-16:TP=-2,afade=t=in:d=0.05,afade=t=out:st={duree - 1.3}:d=1.3",
                *ENC_A, str(HABILLAGE / "rires" / f"rire_{k}.m4a")])
    # passage sans aucune voix de la musique Lyria (40–80 s, vérifié à l'écoute), bouclé en fondu jusqu'à ~2 min 40
    passage = SORTIE / "passage_musique.wav"
    lancer(["ffmpeg", "-v", "error", "-y", "-ss", "40", "-t", "40", "-i", str(HABILLAGE / "musique_abidjan2.mp3"),
            "-ar", "48000", "-ac", "2", str(passage)])
    filtre = "[0][1]acrossfade=d=2[ab];[ab][2]acrossfade=d=2[abc];[abc][3]acrossfade=d=2,loudnorm=I=-14:TP=-1.5[m]"
    lancer(["ffmpeg", "-v", "error", "-y", *sum([["-i", str(passage)] for _ in range(4)], []),
            "-filter_complex", filtre, "-map", "[m]", *ENC_A, str(MUSIQUE)])
    print("rires :", [p.name for p in sorted((HABILLAGE / "rires").glob("*.m4a"))],
          "| musique :", f"{duree_media(MUSIQUE):.0f} s")


# ---------- sous-titres ----------

def mots_minutes(s, transcription, fin_clip):
    """Mots du dialogue écrit avec le minutage des mots entendus (alignement difflib sur les formes normalisées)."""
    ecrits = []
    for k, (_, t) in enumerate(s["dialogue"]):
        for m in t.split():
            if ecrits and not norme(m):        # « ! », « ?! », « : » isolés par l'espace français : collés au mot d'avant
                ecrits[-1] = (ecrits[-1][0] + " " + m, ecrits[-1][1])
            else:
                ecrits.append((m, k))
    entendus = transcription or []
    a = [" ".join(norme(m)) for m, _ in ecrits]
    b = [" ".join(norme(m)) for _, _, m in entendus]
    temps = [None] * len(ecrits)
    for bloc in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for d in range(bloc.size):
            temps[bloc.a + d] = (entendus[bloc.b + d][0], entendus[bloc.b + d][1])
    connus = [i for i, t in enumerate(temps) if t]
    if not connus:
        pas = (fin_clip - 0.6) / max(len(ecrits), 1)
        return [(m, 0.3 + i * pas, 0.3 + (i + 1) * pas) for i, (m, _) in enumerate(ecrits)]
    for i, t in enumerate(temps):            # mots non entendus : répartis entre les voisins connus
        if t:
            continue
        avant = max([j for j in connus if j < i], default=None)
        apres = min([j for j in connus if j > i], default=None)
        t0 = temps[avant][1] if avant is not None else max(0.2, temps[apres][0] - 0.35 * (apres - i))
        t1 = temps[apres][0] if apres is not None else min(fin_clip - 0.2, t0 + 0.35 * (i - avant))
        n_trou = (apres if apres is not None else len(ecrits)) - (avant if avant is not None else -1) - 1
        rang = i - (avant if avant is not None else -1) - 1
        pas = max(t1 - t0, 0.2) / max(n_trou, 1)
        temps[i] = (t0 + rang * pas, t0 + (rang + 1) * pas)
    return [(m, t[0], t[1]) for (m, _), t in zip(ecrits, temps)]


def groupes_de_mots(mots):
    """Coupe aux ponctuations, puis répartit chaque morceau en groupes équilibrés de 2 à 3 mots (jamais un mot seul en fin)."""
    morceaux, courant = [], []
    for m in mots:
        courant.append(m)
        if re.search(r"[.!?…:,]$", m[0]):
            morceaux.append(courant)
            courant = []
    if courant:
        morceaux.append(courant)
    groupes = []
    for mc in morceaux:
        k = math.ceil(len(mc) / 3)
        base, reste = divmod(len(mc), k)
        i = 0
        for j in range(k):
            n = base + (1 if j < reste else 0)
            groupes.append(mc[i:i + n])
            i += n
    return groupes


def emojis_des_groupes(s, groupes):
    choix, utilises = [], set()
    for g in groupes:
        e = None
        for m, _, _ in g:
            for forme in norme(m):
                e = e or s.get("emojis", {}).get(forme) or EMOJI_MOTS.get(forme)
        if e in utilises or len([c for c in choix if c]) >= 3:
            e = None
        choix.append(e)
        if e:
            utilises.add(e)
    choix[-1] = EMOJIS_RIRE[int(s["id"]) % len(EMOJIS_RIRE)]
    return choix


@lru_cache(maxsize=None)
def emoji_image(nom, taille):
    return Image.open(EMOJIS / f"{nom}.png").convert("RGBA").resize((taille, taille), Image.LANCZOS)


@lru_cache(maxsize=None)
def police(taille):
    return ImageFont.truetype(str(POLICE), taille)


def rendre_groupe(g, emoji, cles, couleur):
    """Image RGBA d'un groupe : mots en capitales (mots-clés en couleur), contour noir, emoji 3D en bout de ligne."""
    mots = [(re.sub(r"[.,…]+$", "", m.upper()).replace(" ", " "), bool(set(norme(m)) & cles)) for m, _, _ in g]
    taille = TAILLE_TEXTE
    while True:
        f = police(taille)
        largeurs = [f.getlength(m + " ") for m, _ in mots]
        t_emoji = int(taille * 1.35) if emoji else 0
        largeur = sum(largeurs) - f.getlength(" ") + (t_emoji + 16 if emoji else 0)
        if largeur <= 1000 or taille <= 60:
            break
        taille -= 6
    im = Image.new("RGBA", (int(largeur) + 40, int(taille * 1.9)), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x, y = 20, int(taille * 0.35)
    for (m, cle), lg in zip(mots, largeurs):
        d.text((x + 4, y + 5), m, font=f, fill=(0, 0, 0, 150), stroke_width=8, stroke_fill=(0, 0, 0, 150))
        d.text((x, y), m, font=f, fill=couleur if cle else (255, 255, 255), stroke_width=8, stroke_fill=(0, 0, 0))
        x += lg
    pos_emoji = (int(x - f.getlength(" ") + 16), int(y + taille * 0.62 - t_emoji / 2)) if emoji else None
    return im, pos_emoji, t_emoji


def bande_images(s, mots, duree):
    """Images RGBA (1080 × BANDE_H) du bandeau de sous-titres, une par trame, avec rebond du texte et de l'emoji."""
    cles = {w for c in s.get("cles", []) for w in norme(c)}
    couleur = COULEURS[int(s["id"]) % len(COULEURS)]
    groupes = groupes_de_mots(mots)
    emojis = emojis_des_groupes(s, groupes)
    plages = []
    for k, g in enumerate(groupes):
        debut = g[0][1] - 0.05
        fin = groupes[k + 1][0][1] - 0.05 if k + 1 < len(groupes) else g[-1][2] + 0.9
        plages.append((debut, min(max(fin, debut + 0.35), g[-1][2] + 1.4)))
    rendus = [rendre_groupe(g, e, cles, couleur) for g, e in zip(groupes, emojis)]
    vide = Image.new("RGBA", (L, BANDE_H), (0, 0, 0, 0))
    for n in range(int(round(duree * IPS))):
        t = n / IPS
        actif = next((k for k, (a, b) in enumerate(plages) if a <= t < b), None)
        if actif is None:
            yield vide
            continue
        im_g, pos_e, t_e = rendus[actif]
        dt = t - plages[actif][0]
        echelle = 1.0 if dt > 0.18 else 0.82 + 0.26 * math.sin(min(dt / 0.18, 1) * math.pi * 0.75) / math.sin(math.pi * 0.75)
        cadre = vide.copy()
        g_img = im_g if abs(echelle - 1) < 0.01 else im_g.resize((max(1, int(im_g.width * echelle)),
                                                                  max(1, int(im_g.height * echelle))), Image.BILINEAR)
        ox, oy = (L - g_img.width) // 2, BANDE_H // 2 - g_img.height // 2
        cadre.alpha_composite(g_img, (max(0, ox), max(0, oy)))
        if pos_e:
            de = dt - 0.06
            if de > 0:
                pop = 1.0 if de > 0.3 else min(1.2, 1.25 * math.sin(min(de / 0.3, 1) * math.pi * 0.62) / math.sin(math.pi * 0.62))
                te = max(1, int(t_e * pop * echelle))
                cx = ox + int((pos_e[0] + t_e / 2) * echelle)
                cy = oy + int((pos_e[1] + t_e / 2) * echelle)
                cadre.alpha_composite(emoji_image(emojis[actif], te), (max(0, cx - te // 2), max(0, cy - te // 2)))
        yield cadre


# ---------- segments ----------

def segment(sid):
    s = generer.sketchs()[sid]
    clip = generer.CLIPS / f"{sid}.mp4"
    etat = generer.lire_etat().get(sid, {})
    fin_clip = duree_media(clip)
    mots = mots_minutes(s, (etat.get("controle") or {}).get("mots"), fin_clip)
    SEGMENTS.mkdir(parents=True, exist_ok=True)
    w, h = taille_video(clip)
    recadre = "crop=ih*4/3:ih," if w / h > 1.5 else ""      # Veo : image 4:3 posée dans du 16:9
    filtre = (f"[0:v]{recadre}split[a][b];[a]scale={L}:{H}:force_original_aspect_ratio=increase,crop={L}:{H},"
              f"gblur=sigma=28,eq=brightness=-0.10:saturation=1.15[fond];"
              f"[b]scale={L}:{H_SCENE}:flags=lanczos,unsharp=5:5:0.6[scene];"
              f"[fond][scene]overlay=0:{Y_SCENE}[img];"
              f"[1:v]format=rgba[bande];[img][bande]overlay=0:{BANDE_Y}:shortest=1,fps={IPS},format=yuv420p[v];"
              f"[0:a]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[son]")
    sortie = SEGMENTS / f"{sid}.mp4"
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-i", str(clip),
                             "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{L}x{BANDE_H}", "-r", str(IPS), "-i", "-",
                             "-filter_complex", filtre, "-map", "[v]", "-map", "[son]", *ENC_V, *ENC_A,
                             "-t", f"{fin_clip:.3f}", str(sortie)], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    for cadre in bande_images(s, mots, fin_clip + 0.2):
        proc.stdin.write(cadre.tobytes())
    proc.stdin.close()
    if proc.wait():
        raise RuntimeError(proc.stderr.read().decode(errors="replace")[-1500:])
    chute = max(t1 for _, _, t1 in mots)            # fin de la dernière réplique : les rires partent de là
    (SEGMENTS / f"{sid}.json").write_text(json.dumps({"duree": duree_media(sortie), "chute": round(chute, 2)}))
    return sortie


def transition(emoji):
    """Emoji qui surgit (rebond) sur fond noir, avec un souffle synthétisé."""
    sortie = SEGMENTS / f"transition_{emoji}.mp4"
    if sortie.exists():
        return sortie
    dossier = SEGMENTS / f"tr_{emoji}"
    dossier.mkdir(parents=True, exist_ok=True)
    source = Image.open(HABILLAGE / f"{emoji}.png").convert("RGBA")
    for i in range(int(TRANSITION * IPS)):
        t = i / IPS
        echelle = 0.25 + 0.95 * (1 - math.exp(-t * 14)) * (1 + 0.18 * math.exp(-t * 6) * math.sin(t * 22))
        taille = max(8, int(500 * echelle))
        im = Image.new("RGB", (L, H), "black")
        e = source.resize((taille, taille), Image.LANCZOS)
        im.paste(e, ((L - taille) // 2, (H - taille) // 2 - 60), e)
        im.save(dossier / f"{i:03d}.png")
    son = (f"anoisesrc=d={TRANSITION}:c=pink:a=0.6,highpass=f=400,lowpass=f=3500,"
           f"afade=t=in:d=0.15,afade=t=out:st=0.25:d={TRANSITION - 0.25},volume=0.7,aformat=channel_layouts=stereo")
    lancer(["ffmpeg", "-v", "error", "-y", "-framerate", str(IPS), "-i", str(dossier / "%03d.png"),
            "-f", "lavfi", "-i", son, "-shortest", "-map", "0:v", "-map", "1:a", *ENC_V, *ENC_A, str(sortie)])
    return sortie


# ---------- compilations ----------

def compilation(nom, ids):
    tous = generer.sketchs()
    morceaux, chutes, t = [], [], 0.0
    for sid in ids:
        seg = SEGMENTS / f"{sid}.mp4"
        if not seg.exists() or not (SEGMENTS / f"{sid}.json").exists():
            seg = segment(sid)
        info = json.loads((SEGMENTS / f"{sid}.json").read_text())
        chutes.append(t + info["chute"] + 0.15)
        tr = transition(tous[sid].get("emoji", "choc"))
        morceaux += [seg, tr]
        t += info["duree"] + duree_media(tr)
    COMPILS.mkdir(parents=True, exist_ok=True)
    liste = COMPILS / f"{nom}.txt"
    liste.write_text("".join(f"file '{p}'\n" for p in morceaux))
    brut = COMPILS / f"{nom}_brut.mp4"
    lancer(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(liste), "-c", "copy", str(brut)])
    total = duree_media(brut)
    # mixage : voix + souffles (piste d'origine), musique en boucle baissée sous les voix, un rire après chaque chute
    entrees = ["-i", str(brut), "-stream_loop", "-1", "-i", str(MUSIQUE)]
    for k in range(len(chutes)):
        entrees += ["-i", str(RIRES[k % len(RIRES)])]
    f = ["[0:a]asplit=2[voix][cle]",
         f"[1:a]atrim=0:{total:.2f},volume={VOLUME_MUSIQUE},afade=t=out:st={total - 1.5:.2f}:d=1.5[mus]",
         "[mus][cle]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[musb]"]
    for k, c in enumerate(chutes):
        ms = int(c * 1000)
        f.append(f"[{k + 2}:a]volume={VOLUME_RIRES},adelay={ms}|{ms}[r{k}]")
    f.append("[voix][musb]" + "".join(f"[r{k}]" for k in range(len(chutes))) +
             f"amix=inputs={2 + len(chutes)}:normalize=0:duration=first,alimiter=limit=0.95[a]")
    sortie = COMPILS / f"{nom}.mp4"
    lancer(["ffmpeg", "-v", "error", "-y", *entrees, "-filter_complex", ";".join(f), "-map", "0:v", "-map", "[a]",
            "-c:v", "copy", *ENC_A, "-movflags", "+faststart", str(sortie)])
    brut.unlink()
    print(f"  {sortie.name} : {len(ids)} sketchs, {duree_media(sortie):.1f} s")
    return sortie


def repartir(ids, durees):
    """Paquets consécutifs d'au moins DUREE_MIN secondes ; le reste trop court est versé dans le dernier paquet."""
    paquets, courant, total = [], [], 0.0
    for sid in ids:
        courant.append(sid)
        total += durees[sid] + TRANSITION
        if total >= DUREE_MIN:
            paquets.append(courant)
            courant, total = [], 0.0
    if courant:
        if paquets:
            paquets[-1] += courant
        else:
            paquets.append(courant)
    return paquets


def main():
    action, args = sys.argv[1], sys.argv[2:]
    if action == "audio":
        preparer_audio()
    elif action == "segments":
        ids = args or sorted(p.stem for p in generer.CLIPS.glob("*.mp4"))
        for sid in ids:
            print(f"  segment {sid} : {segment(sid).name}")
    elif action == "compilation":
        compilation(args[0], args[1:])
    elif action == "compilations":
        programme = ICI / "sketchs" / "programme.json"
        if programme.exists():          # ordre choisi : décors et thèmes variés dans chaque compilation
            for nom, ids in json.loads(programme.read_text()).items():
                if args and nom not in args:
                    continue
                prets = [i for i in ids if (generer.CLIPS / f"{i}.mp4").exists()]
                manquants = sorted(set(ids) - set(prets))
                if manquants:
                    print(f"  {nom} : clips manquants {manquants}")
                compilation(nom, prets)
        else:
            prets = sorted(p.stem for p in generer.CLIPS.glob("*.mp4"))
            durees = {sid: duree_media(generer.CLIPS / f"{sid}.mp4") for sid in prets}
            for k, paquet in enumerate(repartir(prets, durees), 1):
                compilation(f"compilation_{k:02d}", paquet)


if __name__ == "__main__":
    main()
