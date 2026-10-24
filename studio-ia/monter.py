"""Montage TikTok : clips 4:3 → segments 1080×1920 (fond flou, sous-titres mot à mot) → compilations ≥ 62 s.

  python3 monter.py segments [ids…]            prépare chaque clip habillé (sortie/segments/)
  python3 monter.py compilation NOM ids…       assemble ces clips dans cet ordre (sortie/compilations/NOM.mp4)
  python3 monter.py compilations               répartit tous les clips prêts en compilations d'au moins 62 s

Entre deux blagues : un emoji 3D (Fluent Emoji de Microsoft, licence MIT) sur fond noir avec un souffle.
Les sous-titres prennent l'orthographe du dialogue écrit et le minutage de la transcription (generer.py controle).
"""
import json
import math
import re
import subprocess
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI))
import generer  # noqa: E402

SORTIE = ICI / "sortie"
SEGMENTS, COMPILS = SORTIE / "segments", SORTIE / "compilations"
HABILLAGE = ICI / "habillage"
POLICE = HABILLAGE / "Poppins-Black.ttf"
L, H, IPS = 1080, 1920, 30
DUREE_MIN = 62.0
TRANSITION = 1.0
COULEURS = ["&H0035FF39&", "&H0000E6FF&", "&H003C3CFF&", "&H00FFE14D&"]   # vert, jaune, rouge, cyan (ASS = BGR)
ENC_V = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", str(IPS)]
ENC_A = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]


def lancer(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr[-1500:])


def duree_media(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True).stdout)


def norme(m):
    return generer.normaliser(m)


def mots_minutes(s, transcription, fin_clip):
    """Mots du dialogue écrit avec le minutage des mots entendus (alignement difflib sur les formes normalisées)."""
    import difflib
    ecrits = []
    for k, (_, t) in enumerate(s["dialogue"]):
        for m in t.split():
            if ecrits and not norme(m):        # « ! », « ?! », « : » isolés par l'espace français : collés au mot d'avant
                ecrits[-1] = (ecrits[-1][0] + "\u00a0" + m, ecrits[-1][1])
            else:
                ecrits.append((m, k))
    entendus = transcription or []
    a = [" ".join(norme(m)) for m, _ in ecrits]
    b = [" ".join(norme(m)) for _, _, m in entendus]
    temps = [None] * len(ecrits)
    for bloc in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for d in range(bloc.size):
            temps[bloc.a + d] = (entendus[bloc.b + d][0], entendus[bloc.b + d][1])
    # mots non entendus : répartis entre les voisins connus (ou sur toute la durée si rien n'est connu)
    connus = [i for i, t in enumerate(temps) if t]
    if not connus:
        pas = (fin_clip - 0.6) / max(len(ecrits), 1)
        return [(m, 0.3 + i * pas, 0.3 + (i + 1) * pas) for i, (m, _) in enumerate(ecrits)]
    for i, t in enumerate(temps):
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


def ass_temps(t):
    t = max(t, 0)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def sous_titres(s, mots, chemin, y_texte, couleur):
    cles = {w for c in s.get("cles", []) for w in norme(c)}
    groupes, courant = [], []
    for m in mots:
        courant.append(m)
        if len(courant) == 3 or re.search(r"[.!?…:,]$", m[0]):
            groupes.append(courant)
            courant = []
    if courant:
        groupes.append(courant)
    lignes = []
    for k, g in enumerate(groupes):
        debut = g[0][1] - 0.05
        fin = groupes[k + 1][0][1] - 0.05 if k + 1 < len(groupes) else g[-1][2] + 0.6
        fin = min(max(fin, debut + 0.35), g[-1][2] + 1.2)
        morceaux = []
        for m, _, _ in g:
            txt = re.sub(r"[.,…]+$", "", m.upper()).replace("{", "(").replace("}", ")").replace("\u00a0", "\\h")
            if set(norme(m)) & cles:
                txt = f"{{\\c{couleur}}}{txt}{{\\c&H00FFFFFF&}}"
            morceaux.append(txt)
        effet = "{\\an5\\pos(540,%d)\\fscx80\\fscy80\\t(0,90,\\fscx112\\fscy112)\\t(90,170,\\fscx100\\fscy100)}" % y_texte
        lignes.append(f"Dialogue: 0,{ass_temps(debut)},{ass_temps(fin)},Mot,,0,0,0,,{effet}{' '.join(morceaux)}")
    chemin.write_text(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, "
        "MarginL, MarginR, MarginV, Encoding\n"
        "Style: Mot,Poppins Black,94,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,7,3,5,60,60,0,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" + "\n".join(lignes) + "\n",
        encoding="utf-8")


def segment(sid):
    s = generer.sketchs()[sid]
    clip = generer.CLIPS / f"{sid}.mp4"
    etat = generer.lire_etat().get(sid, {})
    fin_clip = duree_media(clip)
    mots = mots_minutes(s, (etat.get("controle") or {}).get("mots"), fin_clip)
    SEGMENTS.mkdir(parents=True, exist_ok=True)
    ass = SEGMENTS / f"{sid}.ass"
    h_scene = round(L * 0.75 / 2) * 2                 # le clip 4:3 occupe toute la largeur
    y_scene = (H - h_scene) // 2 - 60
    sous_titres(s, mots, ass, y_scene + h_scene + 120, COULEURS[int(sid) % len(COULEURS)])
    filtre = (f"[0:v]split[a][b];[a]scale={L}:{H}:force_original_aspect_ratio=increase,crop={L}:{H},"
              f"gblur=sigma=28,eq=brightness=-0.10:saturation=1.15[fond];"
              f"[b]scale={L}:{h_scene}:flags=lanczos,unsharp=5:5:0.6[scene];"
              f"[fond][scene]overlay=0:{y_scene},ass={ass}:fontsdir={HABILLAGE},fps={IPS},format=yuv420p[v];"
              f"[0:a]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[son]")
    sortie = SEGMENTS / f"{sid}.mp4"
    lancer(["ffmpeg", "-v", "error", "-y", "-i", str(clip), "-filter_complex", filtre, "-map", "[v]", "-map", "[son]",
            *ENC_V, *ENC_A, str(sortie)])
    return sortie


def transition(emoji):
    """Emoji qui surgit (rebond) sur fond noir, avec un souffle synthétisé."""
    from PIL import Image
    sortie = SEGMENTS / f"transition_{emoji}.mp4"
    if sortie.exists():
        return sortie
    dossier = SEGMENTS / f"tr_{emoji}"
    dossier.mkdir(parents=True, exist_ok=True)
    source = Image.open(HABILLAGE / f"{emoji}.png").convert("RGBA")
    n = int(TRANSITION * IPS)
    for i in range(n):
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


def compilation(nom, ids):
    tous = generer.sketchs()
    morceaux = []
    for sid in ids:
        seg = SEGMENTS / f"{sid}.mp4"
        if not seg.exists():
            seg = segment(sid)
        morceaux += [seg, transition(tous[sid].get("emoji", "choc"))]
    COMPILS.mkdir(parents=True, exist_ok=True)
    liste = COMPILS / f"{nom}.txt"
    liste.write_text("".join(f"file '{p}'\n" for p in morceaux))
    sortie = COMPILS / f"{nom}.mp4"
    lancer(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(liste), "-c", "copy",
            "-movflags", "+faststart", str(sortie)])
    d = duree_media(sortie)
    print(f"  {sortie.name} : {len(ids)} sketchs, {d:.1f} s")
    return sortie, d


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
    if action == "segments":
        ids = args or sorted(p.stem for p in generer.CLIPS.glob("*.mp4"))
        for sid in ids:
            print(f"  segment {sid} : {segment(sid).name}")
    elif action == "compilation":
        compilation(args[0], args[1:])
    elif action == "compilations":
        prets = sorted(p.stem for p in generer.CLIPS.glob("*.mp4"))
        durees = {sid: duree_media(generer.CLIPS / f"{sid}.mp4") for sid in prets}
        for k, paquet in enumerate(repartir(prets, durees), 1):
            compilation(f"compilation_{k:02d}", paquet)


if __name__ == "__main__":
    main()
