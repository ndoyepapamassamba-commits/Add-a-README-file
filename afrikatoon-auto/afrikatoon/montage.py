"""Montage final avec ffmpeg : normalisation 1080x1920, assemblage, sous-titres jaunes incrustés."""
import json
import subprocess
from pathlib import Path


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, check=True).stdout
    return float(json.loads(out)["format"]["duration"])


def has_audio(path: Path) -> bool:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
         "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True).stdout
    return bool(out.strip())


def normalize(src: Path, dest: Path) -> Path:
    """Met chaque clip au même format (9:16, 30 i/s, AAC stéréo) pour un assemblage propre."""
    # clip paysage ou carré : on le centre sur une copie floutée de lui-même (comme sur TikTok)
    vf = ("split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
          "boxblur=30:2,eq=brightness=-0.08[bg];[b]scale=1080:1920:force_original_aspect_ratio=decrease[fg];"
          "[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src)]
    if not has_audio(src):
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-shortest"]
    cmd += ["-map", "0:v:0", "-map", "0:a:0" if has_audio(src) else "1:a:0",
            "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-af", "afade=t=in:d=0.04,areverse,afade=t=in:d=0.08,areverse",  # pas de clic entre les scènes
            "-c:a", "aac", "-ar", "44100", "-ac", "2", str(dest)]
    subprocess.run(cmd, check=True)
    return dest


def _ts(t: float) -> str:
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def _escape(text: str) -> str:
    return text.replace("\\", "").replace("{", "(").replace("}", ")").replace("\n", " ")


def build_subtitles(scenes: list[dict], durations: list[float], dest: Path, hook: str = "") -> Path:
    """Sous-titres gros et jaunes ; chaque réplique occupe une part du clip proportionnelle à sa longueur."""
    lines = [
        "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV",
        "Style: Main,DejaVu Sans,64,&H0000FFFF,&H00000000,&H64000000,1,1,5,2,2,60,60,380",
        "Style: Hook,DejaVu Sans,78,&H00FFFFFF,&H00000000,&H96000000,1,3,6,0,8,50,50,170", "",
        "[Events]",
        "Format: Layer, Start, End, Style, Text",
    ]
    if hook:  # titre d'accroche en haut pendant les 3 premières secondes (arrête le scroll)
        lines.append(f"Dialogue: 1,{_ts(0)},{_ts(3.0)},Hook,{{\\fad(0,200)}}{_escape(hook.upper())}")
    t0 = 0.0
    for scene, d in zip(scenes, durations):
        dialogue = scene.get("dialogue") or []
        total = sum(len(l["text"]) for l in dialogue) or 1
        usable = max(d - 0.6, 0.5)
        t = t0 + 0.3
        for line in dialogue:
            span = usable * len(line["text"]) / total
            if "start" in line:  # timing exact connu (aperçu animé)
                t, span = t0 + line["start"], line["end"] - line["start"]
            text = f"{line['speaker']} : {line['text']}"
            lines.append(f"Dialogue: 0,{_ts(t)},{_ts(t + span)},Main,{_escape(text)}")
            t += span
        t0 += d
    dest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return dest


def assemble(clips: list[Path], scenes: list[dict], workdir: Path, final: Path,
             subtitles: bool = True, hook: str = "") -> Path:
    norm = [normalize(c, workdir / f"norm_{i:02d}.mp4") for i, c in enumerate(clips)]
    durations = [duration(c) for c in norm]
    concat_list = workdir / "concat.txt"
    concat_list.write_text("".join(f"file '{p.resolve()}'\n" for p in norm))
    joined = workdir / "joined.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                    "-i", str(concat_list), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", str(joined)], check=True)
    if not subtitles:
        joined.replace(final)
        return final
    ass = build_subtitles(scenes, durations, workdir / "subs.ass", hook)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(joined),
                    "-vf", f"ass={ass}", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                    "-c:a", "copy", "-movflags", "+faststart", str(final)], check=True)
    return final
