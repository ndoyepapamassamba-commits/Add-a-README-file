"""Vidéo Afrikatoon 100 % OpenRouter : images clés (Seedream), animation avec dialogue et lip-sync (Veo 3.1 Lite),
musique originale locale, sous-titres Whisper, montage ffmpeg.

    python -m afrikatoon.openrouter kits/…json --budget 6            # fabrique (reprend là où il s'est arrêté)
    python -m afrikatoon.openrouter kits/…json --plan                # plan + coût, aucun appel payant
    python -m afrikatoon.openrouter --credit                         # crédit restant de la clé
    python -m afrikatoon.openrouter --convertir-2d "MAMAN NOUNOU" COUMBA "PETIT MAMADOU" --decor-2d village --budget 1

La clé est lue dans OPENROUTER_API_KEY et n'est jamais affichée. Chaque appel payant est refusé s'il ferait dépasser
--budget (en $), d'après le coût annoncé par OpenRouter (usage.cost) et l'estimation avant appel.
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from . import config

API = "https://openrouter.ai/api/v1"
IMG_MODEL = "bytedance-seed/seedream-5-0-flash"
VID_MODEL = "google/veo-3.1-lite"
VID_PRICE = {True: 0.05, False: 0.03}            # $/s en 720p avec / sans son (prix publics au 04/10/2026)
IMG_PRICE = 0.02
STYLE = ("Afrikatoon style: polished 3D cartoon like a Pixar/DreamWorks feature, warm golden afternoon light, "
         "expressive faces, Senegalese setting. Vertical 9:16 framing, characters fully in frame, no text, no logo, "
         "no subtitles, no watermark.")
VOICES = {
    "MAMAN NOUNOU": "a loud, theatrical West African woman in her fifties, strong Senegalese accent, sharp and bossy",
    "COUMBA": "a young West African woman in her twenties, soft but sassy voice, Senegalese accent",
    "PETIT MAMADOU": "an excited 8-year-old West African boy, high-pitched voice, Senegalese accent",
}


class BudgetError(RuntimeError):
    pass


class Client:
    def __init__(self, budget: float, journal: Path):
        self.key = os.getenv("OPENROUTER_API_KEY", "").strip()
        if not self.key:
            sys.exit("OPENROUTER_API_KEY absente de l'environnement (une nouvelle session la charge).")
        self.budget, self.journal = budget, journal
        self.spent = sum(json.loads(l)["cost"] for l in journal.read_text().splitlines()) if journal.exists() else 0.0

    def _req(self, method, path, body=None, raw=False, timeout=120):
        url = path if path.startswith("http") else f"{API}/{path}"
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={
            "Authorization": f"Bearer {self.key}", "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/ndoyepapamassamba-commits/Add-a-README-file", "X-Title": "Afrikatoon"})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    payload = r.read()
                    return payload if raw else json.loads(payload)
            except urllib.error.HTTPError as e:
                msg = e.read().decode("utf-8", "ignore")[:400]
                if e.code in (429, 500, 502, 503) and attempt < 3:
                    time.sleep(5 * 2 ** attempt)
                    continue
                raise RuntimeError(f"OpenRouter {e.code} sur {path.split('?')[0]} : {msg}") from None
            except urllib.error.URLError:
                if attempt < 3:
                    time.sleep(5 * 2 ** attempt)
                    continue
                raise

    def guard(self, estimate: float, what: str):
        if self.spent + estimate > self.budget:
            raise BudgetError(f"Budget atteint : {self.spent:.2f} $ dépensés, {what} coûterait ~{estimate:.2f} $ "
                              f"(budget {self.budget:.2f} $).")

    def log(self, what: str, cost: float):
        self.spent += cost
        with open(self.journal, "a") as f:
            f.write(json.dumps({"t": time.strftime("%Y-%m-%d %H:%M:%S"), "what": what, "cost": cost}) + "\n")
        print(f"   {what} : {cost:.3f} $ (total {self.spent:.2f} $)")

    def credit(self):
        d = self._req("GET", "key")["data"]
        return d

    # -- image
    def image(self, prompt: str, refs: list[Path], dest: Path, model=IMG_MODEL):
        self.guard(IMG_PRICE * 1.5, f"image {dest.name}")
        body = {"model": model, "prompt": prompt, "aspect_ratio": "9:16", "resolution": "1K",
                "input_references": [{"type": "image_url", "image_url": {"url": data_url(p)}} for p in refs]}
        r = self._req("POST", "images", body, timeout=300)
        dest.write_bytes(base64.b64decode(r["data"][0]["b64_json"]))
        self.log(f"image {dest.name}", float((r.get("usage") or {}).get("cost") or IMG_PRICE))
        return dest

    # -- vidéo (asynchrone)
    def video(self, prompt: str, first: Path, dest: Path, seconds: int, audio=True, model=VID_MODEL):
        est = seconds * VID_PRICE[audio]
        self.guard(est, f"vidéo {dest.name}")
        body = {"model": model, "prompt": prompt, "duration": seconds, "resolution": "720p", "aspect_ratio": "9:16",
                "generate_audio": audio,
                "frame_images": [{"type": "image_url", "image_url": {"url": data_url(first)}, "frame_type": "first_frame"}]}
        job = self._req("POST", "videos", body)
        poll = job.get("polling_url") or f"{API}/videos/{job['id']}"
        t0 = time.time()
        while True:
            time.sleep(10)
            st = self._req("GET", poll)
            if st["status"] == "completed":
                break
            if st["status"] == "failed" or time.time() - t0 > 1200:
                raise RuntimeError(f"Vidéo {dest.name} : {st.get('status')} {str(st.get('error'))[:200]}")
        urls = st.get("unsigned_urls") or [f"{API}/videos/{job['id']}/content?index=0"]
        dest.write_bytes(self._req("GET", urls[0], raw=True, timeout=300))
        self.log(f"vidéo {dest.name} ({seconds} s)", float((st.get("usage") or {}).get("cost") or est))
        return dest


def _vdur(p: Path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True, check=True).stdout.strip())


def data_url(p: Path) -> str:
    mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}"


def _chars(sc):
    c = sc["characters"]
    return json.loads(c.replace("'", '"')) if isinstance(c, str) else c


def _dialogue(sc):
    d = sc.get("dialogue") or []
    return json.loads(d) if isinstance(d, str) else d


def refs_for(names: list[str], setting: str) -> list[Path]:
    out = []
    for n in names:
        p = config.ROOT / "assets" / "characters" / n.replace(" ", "_") / "neutral.png"
        if p.exists():
            out.append(p)
    bg = config.ROOT / "assets" / f"backgrounds_2d_{setting}.png"
    if bg.exists():
        out.append(bg)
    return out[:4]


def scene_plan(kit: dict):
    plan = []
    for i, sc in enumerate(kit["scenes"]):
        lines = _dialogue(sc)
        chars = sum(len(l["text"]) for l in lines)
        need = chars / 13 + 1.2                                  # débit oral ~13 car./s + respirations
        sec = 4 if need <= 4 else 6 if need <= 6 else 8
        plan.append(dict(i=i, sc=sc, names=_chars(sc), lines=lines, seconds=sec))
    return plan


def video_prompt(p, kit):
    sc = p["sc"]
    who = "; ".join(f"{n} has the voice of {VOICES.get(n, 'a West African adult with a Senegalese accent')}"
                    for n in p["names"])
    said = " Then ".join(f'{l["speaker"]} says in French: "{l["text"]}"' for l in p["lines"])
    action = sc.get("animation_prompt", "").split("MAMAN NOUNOU voice")[0].strip()
    return (f"{STYLE} Animate this exact image, keep the same characters, faces, clothes and setting. {action} "
            f"{who}. Dialogue, with accurate lip-sync, one speaker at a time: {said} "
            "Natural courtyard ambience, no background music.")


def make(kit_path: Path, budget: float, only_plan=False):
    kit = json.loads(kit_path.read_text(encoding="utf-8"))
    plan = scene_plan(kit)
    total_s = sum(p["seconds"] for p in plan)
    est = len(plan) * IMG_PRICE + total_s * VID_PRICE[True]
    print(f"« {kit['title']} » : {len(plan)} plans, {total_s} s de vidéo Veo 3.1 Lite 720p avec dialogue — "
          f"estimation {est:.2f} $ (sans reprises)")
    for p in plan:
        print(f"  plan {p['i'] + 1} : {p['seconds']} s, {', '.join(p['names'])}, {len(p['lines'])} réplique(s)")
    if only_plan:
        return None
    work = config.ROOT / "output" / f"openrouter-{kit_path.stem}"
    work.mkdir(parents=True, exist_ok=True)
    cl = Client(budget, work / "depenses.jsonl")
    clips = []
    for p in plan:
        k = p["i"]
        key = work / f"cle_{k:02d}.png"
        clip = work / f"plan_{k:02d}.mp4"
        if not key.exists():
            print(f"■ plan {k + 1} : image clé")
            cl.image(f"{STYLE} {p['sc']['image_prompt']}. Use the reference images for the exact look of each "
                     "character (face, body, clothes) and of the setting.", refs_for(p["names"], kit.get("setting", "village")), key)
        if not clip.exists():
            print(f"■ plan {k + 1} : animation {p['seconds']} s")
            cl.video(video_prompt(p, kit), key, clip, p["seconds"])
        clips.append(clip)
    final = assemble(kit, plan, clips, work)
    print(f"Terminé : {final} — dépense totale {cl.spent:.2f} $")
    return final


def assemble(kit, plan, clips, work: Path) -> Path:
    """Concatène, normalise le son, ajoute la musique originale (locale, gratuite) et les sous-titres mot à mot."""
    from . import montage, sound2d
    from .wananim import word_times
    norm = []
    for c in clips:
        n = c.with_name(c.stem + "_n.mp4")
        if not n.exists():
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(c), "-vf",
                            "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1",
                            "-c:v", "libx264", "-crf", "19", "-preset", "medium", "-c:a", "aac", "-ar", "48000", "-ac", "2",
                            str(n)], check=True)
        norm.append(n)
    lst = work / "liste.txt"
    lst.write_text("".join(f"file '{n.resolve()}'\n" for n in norm))
    joined = work / "assemble.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy",
                    str(joined)], check=True)
    total = _vdur(joined)
    music = work / "musique.wav"
    import numpy as np
    m = sound2d.music(total)
    tmp = work / "musique.f32"
    (np.asarray(m, np.float32) * 0.5).tofile(tmp)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(sound2d.SR), "-ac", "1", "-i", str(tmp),
                    "-ac", "2", "-ar", "48000", str(music)], check=True)
    tmp.unlink()
    # sous-titres : Whisper sur la piste de chaque plan, texte du kit
    head = ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "", "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, "
            "Outline, Shadow, Alignment, MarginL, MarginR, MarginV",
            "Style: Hook,DejaVu Sans,74,&H00FFFFFF,&H00000000,&H96000000,1,3,6,0,8,50,50,170",
            "Style: Word,DejaVu Sans,62,&H00FFFFFF,&H00000000,&H64000000,1,1,4,1,2,90,90,230", "",
            "[Events]", "Format: Layer, Start, End, Style, Text"]
    if kit.get("hook_text"):
        head.append(f"Dialogue: 1,{montage._ts(0)},{montage._ts(2.6)},Hook,{{\\fad(0,250)}}"
                    f"{montage._escape(kit['hook_text'].upper())}")
    t = 0.0
    for p, n in zip(plan, norm):
        wav = n.with_suffix(".wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(n), "-ac", "1", "-ar", "16000", str(wav)], check=True)
        text = " ".join(l["text"] for l in p["lines"])
        if text:
            words = [(w, t + a, t + b) for w, a, b in word_times(wav, text)]
            head += montage._word_events(words, 0.0)
        t += _vdur(n)
    ass = work / "sous_titres.ass"
    ass.write_text("\n".join(head) + "\n", encoding="utf-8")
    final = work / "final.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(joined), "-i", str(music), "-filter_complex",
                    "[1:a]volume=0.22[m];[0:a][m]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[d];"
                    "[0:a][d]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1:LRA=9[a]",
                    "-map", "0:v", "-map", "[a]", "-vf", f"ass={ass}", "-c:v", "libx264", "-crf", "20", "-preset", "medium",
                    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-map_metadata", "-1", str(final)], check=True)
    return final


# --- Pipeline « presque gratuit » (< 1 $) : notre 2D + quelques plans de réaction animés par Veo ----------------

REACT = {"shock": "eyes widen in disbelief, eyebrows jump up, hands rise to the cheeks",
         "angry": "frowns harder, purses lips, shakes the head slowly, arms tense",
         "laugh": "bursts out laughing silently, shoulders shaking, eyes squinting with joy",
         "smug": "raises one eyebrow with a slow satisfied smile, chin up",
         "neutral": "listens attentively, small nods, blinks, breathes naturally"}


def insert_prompt(name: str, emo: str) -> str:
    return (f"Animate this exact cartoon frame, same art style, same character, same framing. {name} is LISTENING "
            f"to someone off-screen and reacts: {REACT.get(emo, REACT['neutral'])}. Mouth stays closed (not talking). "
            "Natural blinking and breathing, slight hair and fabric motion, very slow camera push-in. "
            "No text, no subtitles, no brand logos, no new characters, no scene change.")


def pick_inserts(director, n: int = 4, seconds: int = 4):
    """Choisit n moments où un personnage ÉCOUTE pendant une longue réplique (plans de réaction)."""
    from .anim2d import name_is_kid
    cands = []
    for L in director.lines:
        dur = L["end"] - L["start"]
        listeners = [x for x in L["names"] if x != L["speaker"] and x in director.actors and not name_is_kid(x)
                     or (x != L["speaker"] and name_is_kid(x) and director.kid_entry and L["start"] > director.kid_entry[1])]
        if dur < 2.4 or not listeners:
            continue
        who = listeners[-1]
        bonus = {"hook": 2, "twist": 3, "chute": 1}.get(L["beat"], 0)
        cands.append((bonus + dur, L, who))
    out, used = [], []
    for _, L, who in sorted(cands, key=lambda c: -c[0]):
        t0 = L["start"] + 0.4
        d = min(float(seconds), L["end"] - t0 + 0.3)
        if any(not (t0 + d < a or t0 > b) for a, b in used) or sum(w == who for *_, w in out) >= 2:
            continue                                         # pas de chevauchement, 2 plans max par personnage
        used.append((t0 - 1.5, t0 + d + 1.5))
        out.append((t0, d, who))
        if len(out) == n:
            break
    return sorted(out)


def first_frame(director, t: float, who: str, dest: Path) -> Path:
    """Image de départ = notre propre rendu 2D en gros plan sur celui qui écoute (continuité parfaite, 0 $)."""
    from . import anim2d
    pose = director._pose_at(who, t + 0.5)
    states = {n: {"pose": director._pose_at(n, t + 0.5)} for n in director.actors}
    visible = [a for n, a in director.actors.items()
               if not (anim2d.name_is_kid(n) and (not director.kid_entry or t < director.kid_entry[0]))]
    cam = director._framing("MCU", who)
    img = anim2d.render(director.bg, director.bg_units, visible, states, cam, t, focus=who)
    img.save(dest)
    return dest, pose


def inserts_for(director, work: Path, n: int = 4, budget: float = 1.0):
    """Produit les plans de réaction Veo 3.1 Lite (720p, sans son, 4 s) : ~0,12 $ chacun."""
    cl = Client(budget, work / "depenses_openrouter.jsonl")
    res = []
    for k, (t0, d, who) in enumerate(pick_inserts(director, n)):
        clip = work / f"insert_{k:02d}.mp4"
        if not clip.exists():
            img, emo = first_frame(director, t0, who, work / f"insert_{k:02d}.png")
            print(f"■ plan de réaction {k + 1} : {who} ({emo}) à {t0:.1f} s")
            try:
                cl.video(insert_prompt(who, emo), img, clip, 4, audio=False)
            except BudgetError as e:
                print("  ", e, "— la vidéo continue en 2D pour les plans restants.")
                break
            except RuntimeError as e:
                print("   échec, plan gardé en 2D :", str(e)[:200])
                continue
        res.append((t0, d, clip))
    print(f"Plans IA : {len(res)} — dépense OpenRouter {cl.spent:.2f} $")
    return res


# --- 2D haute qualité : redessin unique des personnages et des décors (≈ 0,02 $ l'image, une seule fois) ----------

TWO_D_MODEL = "black-forest-labs/flux.2-klein-4b"        # même famille que l'essai réussi (MAMAN_NOUNOU angry)
TWO_D_FALLBACK = "bytedance-seed/seedream-5-0-flash"
TWO_D = ("Redraw this exact character as a high-quality 2D cartoon illustration in the style of a modern "
         "French-African TV animated series: clean bold black outlines, flat cel-shaded colors with one soft shadow "
         "tone, simple shapes, expressive face, mouth and eyes clearly drawn. Keep the same face, same pose, same "
         "facial expression, same outfit and fabric patterns, same accessories and proportions, full body from head "
         "to feet. Plain pure white background, no text, no logo, no shadow on the ground.")
TWO_D_BG = ("Redraw this exact place as a high-quality 2D cartoon background painting for a modern French-African TV "
            "animated series: clean outlines, flat colors with soft gradients, warm afternoon light, same layout, "
            "same baobab, huts and path. Remove every person. No text, no logo. Vertical 9:16.")


def _cut(img_path: Path, dest: Path, height: int):
    """Fond blanc → détourage (rembg), recadrage, mise à l'échelle des poses actuelles, agrandissement net."""
    from PIL import Image
    from . import assets_tool
    im = Image.open(img_path).convert("RGB")
    if im.height * 2 < height:                       # sortie 1K : agrandissement IA ×4 (Real-ESRGAN), sinon Lanczos
        im = assets_tool.upscale4(im)
    cut = assets_tool._cutout(im)
    cut = cut.crop(cut.getbbox())
    k = height / cut.height
    cut = cut.resize((max(1, int(cut.width * k)), height), Image.LANCZOS)
    cut.save(dest)
    return dest


def convertir_2d(names: list[str], budget: float = 1.0, model: str = TWO_D_MODEL):
    """Toutes les poses → assets/characters_2d_ia/<NOM>/<pose>.png (+ meta.json). La 1re pose convertie sert de
    référence de style aux suivantes, pour un rendu homogène. Ensuite : ~/mpenv/bin/python scripts/face_points.py."""
    from PIL import Image
    root = config.ROOT / "assets"
    cl = Client(budget, root / "characters_2d_ia" / "depenses.jsonl")
    for name in names:
        n = name.replace(" ", "_")
        src, dst = root / "characters" / n, root / "characters_2d_ia" / n
        dst.mkdir(parents=True, exist_ok=True)
        meta = json.loads((src / "meta.json").read_text())
        ref_h = Image.open(root / "characters_2d" / n / "neutral.png").height if (root / "characters_2d" / n / "neutral.png").exists() else 3000
        style_ref = None
        for pose in sorted(meta, key=lambda p: p != "neutral"):           # neutre d'abord : référence de style
            out = dst / f"{pose}.png"
            if out.exists():
                style_ref = style_ref or out
                continue
            a = Image.open(src / f"{pose}.png").convert("RGBA")
            flat = Image.new("RGB", (a.width + 80, a.height + 80), (255, 255, 255))
            flat.paste(a, (40, 40), a)
            (dst / "_bruts").mkdir(exist_ok=True)
            tmp = dst / "_bruts" / f"{pose}_in.png"
            flat.save(tmp)
            raw = dst / "_bruts" / f"{pose}_ia.png"
            refs = [tmp] + ([style_ref] if style_ref else [])
            prompt = TWO_D + (" Match exactly the drawing style, line weight and colors of the second reference image."
                              if style_ref else "")
            print(f"■ {name} / {pose}")
            try:
                cl.image(prompt, refs, raw, model=model)
            except RuntimeError as e:
                print("   modèle principal indisponible, repli :", str(e)[:120])
                cl.image(prompt, refs, raw, model=TWO_D_FALLBACK)
            _cut(raw, out, ref_h)
            tmp.unlink()
            style_ref = style_ref or out
        old = root / "characters_2d" / n / "meta.json"          # bouche de secours : ancienne 2D mise à l'échelle
        old_meta = json.loads(old.read_text()) if old.exists() else {}
        m2 = {}
        for p, v in meta.items():
            ov = old_meta.get(p) or {}
            newh = Image.open(dst / f"{p}.png").height if (dst / f"{p}.png").exists() else ref_h
            k = newh / ref_h
            m2[p] = {"mouth": [int(x * k) for x in ov.get("mouth", [0, 0])], "mouth_w": int(ov.get("mouth_w", 40) * k),
                     "faces": v.get("faces", "right")}
        (dst / "meta.json").write_text(json.dumps(m2, indent=2))
    print(f"Conversion 2D : {cl.spent:.2f} $ dépensés. Étape suivante : "
          "~/mpenv/bin/python scripts/face_points.py assets/characters_2d_ia/*/")


def decor_2d(setting: str = "village", budget: float = 1.0, model: str = TWO_D_MODEL):
    from PIL import Image
    root = config.ROOT / "assets"
    src, dest = root / f"backgrounds_2d_{setting}.png", root / f"backgrounds_2d_ia_{setting}.png"
    cl = Client(budget, root / "characters_2d_ia" / "depenses.jsonl")
    raw = root / f"_bg_{setting}_raw.png"
    cl.image(TWO_D_BG, [src], raw, model=model)
    im = Image.open(raw).convert("RGB")
    w, h = Image.open(src).size
    from PIL import ImageFilter                      # décor flou de profondeur à l'écran : Lanczos suffit (Real-ESRGAN
    im = im.resize((w, h), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 60, 2))   # sature la mémoire ici)
    im.save(dest)
    raw.unlink()
    print(f"Décor 2D : {dest}")
    return dest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kit", nargs="?", type=Path)
    ap.add_argument("--budget", type=float, default=6.0)
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--credit", action="store_true")
    ap.add_argument("--convertir-2d", nargs="*", metavar="NOM", help="redessiner ces personnages en 2D HQ")
    ap.add_argument("--decor-2d", metavar="DECOR", help="redessiner ce décor en 2D HQ (ex. village)")
    a = ap.parse_args()
    if a.convertir_2d is not None or a.decor_2d:
        if a.convertir_2d:
            convertir_2d(a.convertir_2d, a.budget)
        if a.decor_2d:
            decor_2d(a.decor_2d, a.budget)
        return
    if a.credit:
        d = Client(0, Path(os.devnull)).credit()
        lim = d.get("limit")
        print(f"Utilisé : {d.get('usage', 0):.2f} $ ; limite de la clé : {lim if lim is not None else 'aucune'} ; "
              f"restant : {d.get('limit_remaining', '—')}")
        return
    if not a.kit:
        sys.exit("Donner un kit")
    try:
        make(a.kit, a.budget, a.plan)
    except BudgetError as e:
        sys.exit(str(e) + " Relancer avec un --budget plus élevé pour continuer (le travail fait est conservé).")


if __name__ == "__main__":
    main()
