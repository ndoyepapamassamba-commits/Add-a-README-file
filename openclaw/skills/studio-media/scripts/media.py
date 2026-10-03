#!/usr/bin/env python3
"""Studio média local (ffmpeg + Pillow) — la source n'est jamais modifiée, chaque sortie est une copie.

    py media.py infos      fichier                       # durée, résolution, codecs, poids, GPS/EXIF présents ?
    py media.py anonymiser fichier|dossier               # retire EXIF, GPS, appareil, auteur (photos et vidéos)
    py media.py tiktok     video.mp4 [--flou]            # 1080×1920 9:16, fond flouté si besoin, H.264 + AAC -14 LUFS
    py media.py whatsapp   video.mp4 [--mo 15]           # compressée sous la taille cible (2 passes)
    py media.py images     dossier [--max 1920] [--format webp|jpg] [--qualite 82]   # lot redimensionné, sans métadonnées
    py media.py planche    video.mp4 [--n 16]            # planche contact pour vérifier une vidéo d'un coup d'œil
    py media.py filigrane  fichier --texte "@comedyvideos_100" [--position bas-droite]
    py media.py audio      video.mp4 [--format mp3|wav]  # extrait la bande son normalisée
    py media.py gif        video.mp4 --debut 3 --duree 4 # GIF léger (palette optimisée)
    py media.py couper     video.mp4 --debut 00:00:05 --fin 00:01:10   # découpe sans réencodage
"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

IMG = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic", ".bmp"}
VID = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".3gp"}


def need(binary="ffmpeg"):
    if not shutil.which(binary):
        sys.exit(f"{binary} introuvable. Windows : winget install Gyan.FFmpeg (puis nouveau terminal) ; "
                 "macOS : brew install ffmpeg ; Linux : sudo apt install ffmpeg")


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore")
    if r.returncode:
        sys.exit("ffmpeg a échoué :\n" + r.stderr[-1500:])
    return r.stdout


def out(src: Path, tag: str, ext=None) -> Path:
    d = src.parent / "sorties"
    d.mkdir(exist_ok=True)
    return d / f"{src.stem}_{tag}{ext or src.suffix}"


def probe(p: Path) -> dict:
    need("ffprobe")
    return json.loads(run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(p)]))


def exif_info(p: Path):
    from PIL import Image
    from PIL.ExifTags import TAGS
    with Image.open(p) as im:
        ex = im.getexif()
        tags = {TAGS.get(k, k): v for k, v in ex.items()}
        gps = bool(ex.get_ifd(0x8825)) if ex else False
        return im.size, tags, gps


def infos(p: Path):
    print(f"{p.name} — {p.stat().st_size / 1e6:.2f} Mo")
    if p.suffix.lower() in IMG:
        size, tags, gps = exif_info(p)
        print(f"Image {size[0]}×{size[1]}")
        for k in ("Make", "Model", "DateTime", "Artist", "Software", "Copyright"):
            if k in tags:
                print(f"  {k} : {tags[k]}")
        print("  ⚠  POSITION GPS PRÉSENTE" if gps else "  pas de GPS")
        return
    d = probe(p)
    f = d["format"]
    print(f"Durée {float(f.get('duration', 0)):.1f} s, débit {int(f.get('bit_rate', 0)) // 1000} kb/s")
    for s in d["streams"]:
        if s["codec_type"] == "video":
            print(f"  vidéo {s['codec_name']} {s['width']}×{s['height']} @ {s.get('r_frame_rate')}")
        elif s["codec_type"] == "audio":
            print(f"  audio {s['codec_name']} {s.get('sample_rate')} Hz {s.get('channels')} canaux")
    tags = {**f.get("tags", {}), **{k: v for s in d["streams"] for k, v in s.get("tags", {}).items()}}
    sens = {k: v for k, v in tags.items() if any(x in k.lower() for x in ("location", "gps", "make", "model", "artist",
                                                                         "author", "comment", "encoder", "creation"))}
    for k, v in sens.items():
        print(f"  métadonnée {k} : {v}")
    if any("location" in k.lower() or "gps" in k.lower() for k in sens):
        print("  ⚠  POSITION GPS PRÉSENTE")


def anonymiser(p: Path):
    files = [x for x in p.rglob("*") if x.suffix.lower() in IMG | VID and "sorties" not in x.parts] if p.is_dir() else [p]
    for f in files:
        if f.suffix.lower() in IMG:
            from PIL import Image, ImageOps
            with Image.open(f) as im:
                im = ImageOps.exif_transpose(im)          # garde l'orientation, jette l'EXIF
                dest = out(f, "anonyme")
                kw = {"quality": 92} if dest.suffix.lower() in (".jpg", ".jpeg", ".webp") else {}
                if dest.suffix.lower() in (".jpg", ".jpeg") and im.mode in ("RGBA", "P"):
                    im = im.convert("RGB")
                im.save(dest, **kw)
        else:
            need()
            dest = out(f, "anonyme")
            run(["ffmpeg", "-y", "-v", "error", "-i", str(f), "-map", "0", "-map_metadata", "-1", "-map_chapters", "-1",
                 "-c", "copy", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact", str(dest)])
        print(f"✔ {dest}")
    print(f"{len(files)} fichier(s) sans métadonnées (originaux intacts).")


def tiktok(p: Path, flou: bool):
    need()
    dest = out(p, "tiktok", ".mp4")
    if flou:
        vf = ("[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:5[bg];"
              "[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30[v]")
    else:
        vf = "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30[v]"
    has_audio = any(s["codec_type"] == "audio" for s in probe(p)["streams"])
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", str(p), "-filter_complex", vf, "-map", "[v]"]
    cmd += ["-map", "0:a:0", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"] if has_audio else []
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-profile:v", "high",
            "-movflags", "+faststart", "-map_metadata", "-1", str(dest)]
    run(cmd)
    print(f"✔ {dest} (1080×1920, 30 i/s, son à -14 LUFS, sans métadonnées)")


def whatsapp(p: Path, mo: float):
    need()
    dur = float(probe(p)["format"]["duration"])
    kbps = int(mo * 8 * 1000 * 0.95 / dur) - 96
    if kbps < 150:
        sys.exit(f"Vidéo trop longue pour {mo} Mo ({dur:.0f} s) : la couper d'abord.")
    dest = out(p, f"{int(mo)}Mo", ".mp4")
    vf = "scale='min(720,iw)':-2"
    null = "NUL" if sys.platform.startswith("win") else "/dev/null"
    base = ["ffmpeg", "-y", "-v", "error", "-i", str(p), "-vf", vf, "-c:v", "libx264", "-b:v", f"{kbps}k", "-preset", "medium"]
    log = str(dest.with_suffix(".log"))
    run(base + ["-pass", "1", "-passlogfile", log, "-an", "-f", "mp4", null])
    run(base + ["-pass", "2", "-passlogfile", log, "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
                "-map_metadata", "-1", str(dest)])
    for f in dest.parent.glob(dest.stem + ".log*"):
        f.unlink()
    print(f"✔ {dest} : {dest.stat().st_size / 1e6:.1f} Mo (cible {mo} Mo)")


def images(d: Path, mx: int, fmt: str, q: int):
    from PIL import Image, ImageOps
    files = [x for x in (d.iterdir() if d.is_dir() else [d]) if x.suffix.lower() in IMG]
    before = after = 0
    for f in files:
        with Image.open(f) as im:
            im = ImageOps.exif_transpose(im)
            im.thumbnail((mx, mx), Image.LANCZOS)
            if fmt == "jpg" and im.mode != "RGB":
                im = im.convert("RGB")
            dest = out(f, f"{mx}", "." + fmt)
            im.save(dest, quality=q, optimize=True, **({"method": 6} if fmt == "webp" else {}))
        before += f.stat().st_size
        after += dest.stat().st_size
    print(f"{len(files)} image(s) : {before / 1e6:.1f} Mo → {after / 1e6:.1f} Mo, sans métadonnées, dans {d / 'sorties' if d.is_dir() else d.parent / 'sorties'}")


def planche(p: Path, n: int):
    need()
    dur = float(probe(p)["format"]["duration"])
    cols = 4 if n <= 16 else 6
    rows = -(-n // cols)
    dest = out(p, "planche", ".jpg")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(p), "-vf",
         f"fps={n / max(dur, 0.1):.5f},scale=270:-2,drawtext=text='%{{pts\\:hms}}':x=5:y=5:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.5,tile={cols}x{rows}",
         "-frames:v", "1", "-q:v", "3", str(dest)])
    print(f"✔ {dest}")


POS = {"bas-droite": "W-w-30:H-h-30", "bas-gauche": "30:H-h-30", "haut-droite": "W-w-30:30", "haut-gauche": "30:30",
       "centre": "(W-w)/2:(H-h)/2"}


def filigrane(p: Path, texte: str, pos: str):
    xy = POS[pos].replace("W", "w").replace("H", "h").replace("w-w", "w-tw").replace("h-h", "h-th").replace(
        "(w-w)", "(w-tw)").replace("(h-h)", "(h-th)")
    safe = texte.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    if p.suffix.lower() in IMG:
        from PIL import Image, ImageDraw, ImageFont, ImageOps
        with Image.open(p) as im:
            im = ImageOps.exif_transpose(im).convert("RGBA")
            lay = Image.new("RGBA", im.size, (0, 0, 0, 0))
            dr = ImageDraw.Draw(lay)
            size = max(16, im.width // 28)
            try:
                font = ImageFont.truetype("arial.ttf" if sys.platform.startswith("win") else "DejaVuSans-Bold.ttf", size)
            except OSError:
                font = ImageFont.load_default()
            tw, th = dr.textbbox((0, 0), texte, font=font)[2:]
            m = 30
            x = {"gauche": m, "droite": im.width - tw - m}.get(pos.split("-")[-1], (im.width - tw) // 2)
            y = m if pos.startswith("haut") else (im.height - th) // 2 if pos == "centre" else im.height - th - m
            dr.text((x + 2, y + 2), texte, font=font, fill=(0, 0, 0, 140))
            dr.text((x, y), texte, font=font, fill=(255, 255, 255, 200))
            dest = out(p, "filigrane", ".png")
            Image.alpha_composite(im, lay).save(dest)
    else:
        need()
        x, y = xy.split(":")
        dest = out(p, "filigrane", ".mp4")
        run(["ffmpeg", "-y", "-v", "error", "-i", str(p), "-vf",
             f"drawtext=text='{safe}':x={x}:y={y}:fontsize=h/32:fontcolor=white@0.8:shadowcolor=black@0.6:shadowx=2:shadowy=2",
             "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-c:a", "copy", "-movflags", "+faststart", str(dest)])
    print(f"✔ {dest}")


def audio(p: Path, fmt: str):
    need()
    dest = out(p, "audio", "." + fmt)
    codec = ["-c:a", "libmp3lame", "-q:a", "2"] if fmt == "mp3" else ["-c:a", "pcm_s16le"]
    run(["ffmpeg", "-y", "-v", "error", "-i", str(p), "-vn", "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "48000"] + codec +
        ["-map_metadata", "-1", str(dest)])
    print(f"✔ {dest}")


def gif(p: Path, debut: float, duree: float):
    need()
    dest = out(p, "anim", ".gif")
    run(["ffmpeg", "-y", "-v", "error", "-ss", str(debut), "-t", str(duree), "-i", str(p), "-filter_complex",
         "fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer",
         str(dest)])
    print(f"✔ {dest} ({dest.stat().st_size / 1e6:.1f} Mo)")


def couper(p: Path, debut: str, fin: str):
    need()
    dest = out(p, "extrait")
    run(["ffmpeg", "-y", "-v", "error", "-ss", debut, "-to", fin, "-i", str(p), "-map", "0", "-c", "copy",
         "-avoid_negative_ts", "make_zero", str(dest)])
    print(f"✔ {dest} (sans réencodage : coupe calée sur l'image clé la plus proche)")


def main():
    ap = argparse.ArgumentParser(description="Studio média local")
    ap.add_argument("action", choices=["infos", "anonymiser", "tiktok", "whatsapp", "images", "planche", "filigrane",
                                       "audio", "gif", "couper"])
    ap.add_argument("chemin", type=Path)
    ap.add_argument("--flou", action="store_true")
    ap.add_argument("--mo", type=float, default=15)
    ap.add_argument("--max", type=int, default=1920)
    ap.add_argument("--format", default="")
    ap.add_argument("--qualite", type=int, default=82)
    ap.add_argument("--n", type=int, default=16)
    ap.add_argument("--texte", default="")
    ap.add_argument("--position", default="bas-droite", choices=list(POS))
    ap.add_argument("--debut", default="0")
    ap.add_argument("--duree", type=float, default=4)
    ap.add_argument("--fin", default="")
    a = ap.parse_args()
    p = a.chemin
    if not p.exists():
        sys.exit(f"Introuvable : {p}")
    act = a.action
    if act == "infos":
        infos(p)
    elif act == "anonymiser":
        anonymiser(p)
    elif act == "tiktok":
        tiktok(p, a.flou)
    elif act == "whatsapp":
        whatsapp(p, a.mo)
    elif act == "images":
        images(p, a.max, a.format or "webp", a.qualite)
    elif act == "planche":
        planche(p, a.n)
    elif act == "filigrane":
        if not a.texte:
            sys.exit("--texte requis")
        filigrane(p, a.texte, a.position)
    elif act == "audio":
        audio(p, a.format or "mp3")
    elif act == "gif":
        gif(p, float(a.debut), a.duree)
    else:
        if not a.fin:
            sys.exit("--fin requis")
        couper(p, a.debut, a.fin)


if __name__ == "__main__":
    main()
