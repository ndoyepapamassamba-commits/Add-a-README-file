"""Fabrique les clips d'exemple du README dans ``exemples/`` (MP4 + planche PNG par clip).

    python -m minimoteur.exemples                # runs/dit.pt -> exemples/

Contenu (prompts choisis AVANT de voir les résultats, graine 0, aucun tri) :

* texte->vidéo : 5 prompts vus à l'entraînement + 2 combinaisons TENUES À L'ÉCART
  (jamais vues : le nom du fichier contient « tenu_a_l_ecart ») ;
* image->vidéo : 2 clips dont la 1re image est dessinée par le moteur de rendu ;
* comparaison des réglages d'échantillonnage sur un même prompt et un même
  bruit : 4 / 10 / 30 pas d'Euler, CFG 1 (pas de guidance) ou 4.

Chaque planche montre en haut le clip de RÉFÉRENCE dessiné par le moteur de
rendu des marionnettes (même prompt, une autre graine : ce n'est pas la
« bonne réponse » image par image, juste à quoi ressemble l'action), puis le
clip généré. ``exemples/exemples.json`` donne ce que les détecteurs de
l'évaluation reconnaissent dans chaque clip généré.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont

from .config import DEFAULT_THREADS, PROJECT_DIR, RUNS_DIR
from .evaluate import analyse_clip
from .pipeline import generate, load_moteur
from .troupe_data import is_heldout, parse_prompt, render_clip
from .video_io import upscale, write_mp4

TEXTE_VIDEO = [
    "MODOU saute dans la Cour",
    "COUMBA parle dans le Salon",
    "BAYE NDIAYE marche vers la droite au Marché",
    "KOFFI marche vers la gauche dans le Salon",
    "MAMAN NOUNOU tombe au Maquis",
    # combinaisons tenues à l'écart (jamais vues à l'entraînement)
    "TANTIE AWA saute au Maquis",
    "PETIT MAMADOU marche vers la droite au Maquis",
]
IMAGE_VIDEO = [
    "MODOU marche vers la droite dans le Salon",
    "KOFFI parle au Maquis",  # tenu à l'écart
]
COMPARAISON_PROMPT = "COUMBA saute au Marché"
COMPARAISON = [(4, 1.0), (10, 1.0), (30, 1.0), (4, 4.0), (10, 4.0), (30, 4.0)]
IMAGES = tuple(range(0, 17, 2))  # images montrées sur les planches


def slug(prompt: str) -> str:
    s = unicodedata.normalize("NFKD", prompt).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(dans|la|le|au|vers)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def _font(size: int):
    """Police avec accents (DejaVu Sans si présente), sinon la police par défaut de Pillow."""
    for chemin in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVuSans.ttf", "Arial.ttf"):
        try:
            return ImageFont.truetype(chemin, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def planche(lignes: list[tuple[str, np.ndarray]], titre: str, scale: int = 3, marge: int = 200) -> Image.Image:
    """Planche étiquetée : une ligne par clip (images 0, 2, ..., 16), étiquette à gauche."""
    S = 32 * scale
    gap = 2
    W = marge + len(IMAGES) * (S + gap)
    H = 22 + len(lignes) * (S + gap)
    img = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((6, 4), titre, fill=(0, 0, 0), font=_font(13))
    for i, (label, clip) in enumerate(lignes):
        y = 22 + i * (S + gap)
        d.multiline_text((6, y + 4), label, fill=(30, 30, 30), font=_font(11), spacing=2)
        big = upscale(clip, scale)
        for j, f in enumerate(IMAGES):
            img.paste(Image.fromarray(big[f]), (marge + j * (S + gap), y))
    return img


def _verdict(clip: np.ndarray, prompt: str) -> dict:
    r = analyse_clip(clip, *parse_prompt(prompt))
    return {k: (bool(v) if isinstance(v, (bool, np.bool_)) else v) for k, v in r.items()
            if k.endswith(("_ok", "_vue", "_vu"))}


def _etiquette(r: dict) -> str:
    ok = lambda b: "oui" if b else "non"  # noqa: E731
    return (f"détecteurs :\nidentité {ok(r['identite_ok'])}\naction {ok(r['action_ok'])}"
            f" ({r['action_vue']})\ndécor {ok(r['decor_ok'])}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m minimoteur.exemples",
                                description="Génère les clips d'exemple (MP4 + planches PNG) du README.")
    p.add_argument("--ckpt", default=str(RUNS_DIR / "dit.pt"))
    p.add_argument("--out", default=str(PROJECT_DIR / "exemples"))
    p.add_argument("--steps", type=int, default=30)
    p.add_argument("--cfg", type=float, default=4.0)
    p.add_argument("--shift", type=float, default=3.0)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--threads", type=int, default=DEFAULT_THREADS,
                   help="fils de calcul CPU (défaut 4 ou $MINIMOTEUR_THREADS)")
    args = p.parse_args(argv)
    torch.set_num_threads(args.threads)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    m = load_moteur(args.ckpt)
    ss = m.cfg.data.supersample
    fps = m.cfg.clip.fps
    index: dict = {"reglages": {"pas": args.steps, "cfg": args.cfg, "shift": args.shift, "graine": args.seed},
                   "checkpoint": args.ckpt, "clips": []}

    def ref(prompt: str) -> np.ndarray:
        return render_clip(*parse_prompt(prompt), seed=[4242, 0], supersample=ss)

    jobs = [("t2v", pr) for pr in TEXTE_VIDEO] + [("i2v", pr) for pr in IMAGE_VIDEO]
    for mode, prompt in jobs:
        statut = "tenu_a_l_ecart" if is_heldout(*parse_prompt(prompt)) else "vu"
        nom = f"{mode}_{statut}_{slug(prompt)}"
        first = None
        if mode == "i2v":
            first = render_clip(*parse_prompt(prompt), seed=[args.seed], supersample=ss)[0]
        t0 = time.time()
        clip = generate(m, [prompt], None if first is None else first[None], steps=args.steps,
                        cfg_scale=args.cfg, shift=args.shift, seed=args.seed)[0]
        dt = time.time() - t0
        write_mp4(clip, out / f"{nom}.mp4", fps=fps, scale=8)
        r = _verdict(clip, prompt)
        if mode == "i2v":
            lignes = [("1re image donnée\n(moteur de rendu)", np.repeat(first[None], 17, 0)),
                      ("généré (image->vidéo)\n" + _etiquette(r), clip)]
        else:
            lignes = [("référence\n(moteur de rendu,\nautre graine)", ref(prompt)),
                      ("généré (texte->vidéo)\n" + _etiquette(r), clip)]
        titre = (f"« {prompt} »  [{'COMBINAISON JAMAIS VUE' if statut != 'vu' else 'vu à l’entraînement'}]"
                 f"  {args.steps} pas, CFG {args.cfg:g}, shift {args.shift:g}, graine {args.seed}  (images 0 à 16)")
        planche(lignes, titre).save(out / f"{nom}.png", optimize=True)
        index["clips"].append({"fichier": f"{nom}.mp4", "planche": f"{nom}.png", "mode": mode, "prompt": prompt,
                               "statut": statut, "secondes": round(dt, 2), **r})
        print(f"{nom}: {r}  ({dt:.1f} s)", flush=True)

    # Comparaison : nombre de pas x CFG, même bruit initial.
    lignes = [("référence\n(moteur de rendu)", ref(COMPARAISON_PROMPT))]
    comp = []
    for steps, cfg_scale in COMPARAISON:
        t0 = time.time()
        clip = generate(m, [COMPARAISON_PROMPT], steps=steps, cfg_scale=cfg_scale, shift=args.shift,
                        seed=args.seed)[0]
        dt = time.time() - t0
        r = _verdict(clip, COMPARAISON_PROMPT)
        passes = steps * (1 if cfg_scale == 1.0 else 2)
        lignes.append((f"{steps} pas, CFG {cfg_scale:g}\n{passes} passes DiT, {dt:.2f} s\n" + _etiquette(r), clip))
        comp.append({"pas": steps, "cfg": cfg_scale, "passes_dit": passes, "secondes": round(dt, 2), **r})
    titre = f"« {COMPARAISON_PROMPT} » : nombre de pas d'Euler et guidance (CFG), même bruit (graine {args.seed})"
    planche(lignes, titre, marge=230).save(out / "comparaison_pas_cfg.png", optimize=True)
    index["comparaison_pas_cfg"] = {"prompt": COMPARAISON_PROMPT, "planche": "comparaison_pas_cfg.png",
                                    "essais": comp}
    (out / "exemples.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(f.stat().st_size for f in out.iterdir() if f.is_file())
    print(f"-> {out} ({total / 1e6:.2f} Mo)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
