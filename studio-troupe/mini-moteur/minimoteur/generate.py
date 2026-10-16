"""Génération d'un clip : texte->vidéo, ou image->vidéo avec une 1re image.

Exemples :

    # texte -> vidéo
    python -m minimoteur.generate --prompt "MODOU saute dans la Cour" --out clip.mp4

    # image -> vidéo avec votre image (redimensionnée en 32x32)
    python -m minimoteur.generate --prompt "MODOU saute dans la Cour" --image premiere_image.png

    # image -> vidéo avec une 1re image dessinée par le moteur de rendu du jeu de données
    python -m minimoteur.generate --prompt "COUMBA parle dans le Salon" \\
        --image-from "COUMBA parle dans le Salon" --out coumba.mp4

Sorties : un MP4 H.264 (yuv420p) agrandi x8 (256x256) et un GIF du même nom.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import torch

from .config import DEFAULT_THREADS, RUNS_DIR
from .pipeline import generate, load_moteur
from .troupe_data import canonical_prompt, render_first_frame
from .video_io import load_image, save_png, write_gif, write_mp4


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m minimoteur.generate",
        description="Génère un clip de 17 images (32x32, agrandi x8) avec le mini-moteur de la troupe.",
    )
    p.add_argument("--prompt", required=True, help='légende, ex. "MODOU saute dans la Cour"')
    src = p.add_mutually_exclusive_group()
    src.add_argument("--image", default=None, help="1re image (PNG/JPG) pour l'image->vidéo")
    src.add_argument("--image-from", default=None,
                     help="prompt dont on dessine la 1re image avec le moteur de rendu des marionnettes")
    p.add_argument("--image-seed", type=int, default=0, help="graine du rendu de --image-from")
    p.add_argument("--steps", type=int, default=30, help="nombre de pas d'Euler (défaut 30)")
    p.add_argument("--cfg", type=float, default=4.0, help="échelle de guidance sans classifieur (défaut 4)")
    p.add_argument("--shift", type=float, default=3.0, help="décalage du calendrier de t (défaut 3)")
    p.add_argument("--seed", type=int, default=0, help="graine du bruit initial")
    p.add_argument("--out", default="clip.mp4", help="fichier MP4 de sortie")
    p.add_argument("--gif", default=None, help="fichier GIF (défaut : même nom que --out)")
    p.add_argument("--no-gif", action="store_true", help="ne pas écrire de GIF")
    p.add_argument("--ckpt", default=str(RUNS_DIR / "dit.pt"), help="checkpoint du moteur (défaut runs/dit.pt)")
    p.add_argument("--scale", type=int, default=8, help="agrandissement au plus proche voisin (défaut 8)")
    p.add_argument("--fps", type=int, default=None, help="images par seconde (défaut : 8)")
    p.add_argument("--no-ema", action="store_true", help="utiliser les poids bruts plutôt que la moyenne EMA")
    p.add_argument("--threads", type=int, default=DEFAULT_THREADS,
                   help="fils de calcul CPU (défaut 4 ou $MINIMOTEUR_THREADS ; 1 ou 2 si la machine est déjà occupée)")
    return p


def check_prompt(prompt: str, tokenizer) -> str:
    """Ramène le prompt à la légende exacte du gabarit, ou prévient s'il en sort.

    Le tokenizer ignore la casse mais pas les accents : sans ce contrôle,
    « MODOU saute au Marche » serait lu avec le VERBE « marche » et sans décor.
    """
    canon = canonical_prompt(prompt)
    if canon is not None:
        if canon != prompt:
            print(f"prompt normalisé : « {prompt} » -> « {canon} »")
        return canon
    unknown = [w for w in tokenizer.split(prompt) if tokenizer.encode(w) == [tokenizer.unk_id]]
    print("attention : ce prompt ne suit pas le gabarit « NOM action décor » appris "
          "(ex. « MODOU saute dans la Cour ») ; le résultat est imprévisible.", file=sys.stderr)
    if unknown:
        print(f"attention : mots inconnus du vocabulaire (ignorés -> <unk>) : {unknown}", file=sys.stderr)
    return prompt


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    torch.set_num_threads(args.threads)
    t0 = time.time()
    m = load_moteur(args.ckpt, use_ema=not args.no_ema)
    out = Path(args.out)
    first = None
    if args.image:
        first = load_image(args.image, m.cfg.clip.size)
    elif args.image_from:
        first = render_first_frame(args.image_from, seed=args.image_seed, supersample=m.cfg.data.supersample)
        img_path = save_png(first, out.with_name(out.stem + "_image0.png"))
        print(f"1re image dessinée -> {img_path}")
    prompt = check_prompt(args.prompt, m.tokenizer)
    clip = generate(m, [prompt], None if first is None else first[None], steps=args.steps,
                    cfg_scale=args.cfg, shift=args.shift, seed=args.seed)[0]
    fps = args.fps or m.cfg.clip.fps
    mp4 = write_mp4(clip, out, fps=fps, scale=args.scale)
    print(f"vidéo -> {mp4}")
    if not args.no_gif:
        gif = write_gif(clip, Path(args.gif) if args.gif else out.with_suffix(".gif"), fps=fps, scale=args.scale)
        print(f"GIF   -> {gif}")
    mode = "image->vidéo" if first is not None else "texte->vidéo"
    print(f"{mode} « {prompt} » : {args.steps} pas, CFG {args.cfg}, shift {args.shift}, graine {args.seed} "
          f"({time.time() - t0:.1f} s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
