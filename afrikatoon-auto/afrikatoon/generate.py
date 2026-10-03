"""Création de personnages et de décors (images), sans abonnement.

Passe par les « Inference Providers » de HuggingFace avec HF_TOKEN : chaque image coûte une fraction de
centime, prise sur les crédits gratuits du compte (≈ 0,10 $/mois en gratuit, 2 $ avec PRO).
Modèles sous licence permettant l'usage commercial :
  - FLUX.1-schnell (Apache 2.0)      : planches de personnages sur fond vert, décors
  - Z-Image-Turbo (Apache 2.0)       : variante, rendu 3D plus doux
  - FLUX.2-klein-4B (Apache 2.0)     : retouche d'une image existante (version 2D, nouvelle expression…)

    python run.py generer perso "MAMADOU LE PECHEUR" "pêcheur sénégalais d'une quarantaine d'années, …"
    python run.py generer decor port "port de pêche de Joal, pirogues colorées"
    python run.py generer 2d MAMAN_NOUNOU          # version dessin animé 2D de toutes ses poses
"""
from pathlib import Path

from PIL import Image

from . import config

ASSETS = Path(__file__).resolve().parent.parent / "assets"
STYLE = ("3D Pixar-style cartoon, West African characters, warm sunlight, vibrant saturated colors, "
         "high detail, no text, no watermark")
SHEET = ("character expression sheet, the SAME character drawn 5 times side by side, full body, standing, "
         "three-quarter view facing right, identical outfit and proportions in all 5: 1) neutral content, mouth "
         "closed 2) angry pointing finger 3) shocked hands on cheeks 4) smug shrug palms open 5) laughing hard. "
         "Plain bright green background (#00FF00), evenly spaced, no overlap, no text")
TWO_D = ("Redraw this exact character as a high-quality 2D cartoon illustration in the style of a modern "
         "French-African TV animated series: clean bold black outlines, flat cel-shaded colors, simple shapes, "
         "expressive face. Keep the same face, same pose, same outfit and patterns, same accessories and "
         "proportions. Plain white background, no text.")


def _client(provider: str):
    from huggingface_hub import InferenceClient
    return InferenceClient(provider=provider, api_key=config.HF_TOKEN)


def text_image(prompt: str, dest: Path, width: int, height: int, model: str = "black-forest-labs/FLUX.1-schnell",
               provider: str = "nscale", seed: int | None = None) -> Path:
    img = _client(provider).text_to_image(prompt, model=model, width=width, height=height, seed=seed)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest)
    return dest


def edit_image(src: Path, prompt: str, dest: Path, model: str = "black-forest-labs/FLUX.2-klein-4B",
               provider: str = "fal-ai") -> Path:
    img = _client(provider).image_to_image(str(src), prompt=prompt, model=model)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest)
    return dest


def character(name: str, description: str, seed: int | None = None) -> list[Path]:
    """Nouvelle planche 5 expressions sur fond vert, découpée et importée (assets/characters/<NOM>/)."""
    from . import assets_tool
    sheet = ASSETS / "planches" / f"{name.upper().replace(' ', '_')}.png"
    text_image(f"{STYLE}. {SHEET}. The character: {description}", sheet, 1536, 640, seed=seed)
    return assets_tool.import_sheet(sheet, name.upper())


def decor(name: str, description: str, seed: int | None = None) -> Path:
    """Décor vide vertical 9:16 (assets/backgrounds/<nom>.jpg), agrandi ×2 par IA."""
    from . import assets_tool
    raw = ASSETS / "backgrounds" / f"_{name}_raw.png"
    text_image(f"{STYLE}. Empty {description}, West Africa, no people, no characters, depth of field, "
               "cinematic background for an animated film, vertical 9:16", raw, 768, 1344, seed=seed)
    big = assets_tool.upscale4(Image.open(raw)).resize((1080, 1890), Image.LANCZOS)
    dest = ASSETS / "backgrounds" / f"{name}.jpg"
    big.save(dest, quality=93)
    raw.unlink()
    return dest


def to_2d(name: str) -> list[Path]:
    """Version 2D (dessin animé à plat) de toutes les poses d'un personnage : assets/characters_2d/<NOM>/."""
    src_dir = ASSETS / "characters" / name.replace(" ", "_")
    out_dir = ASSETS / "characters_2d" / name.replace(" ", "_")
    done = []
    for png in sorted(src_dir.glob("*.png")):
        cut = Image.open(png).convert("RGBA")
        flat = Image.new("RGBA", (cut.width + 80, cut.height + 80), (255, 255, 255, 255))
        flat.alpha_composite(cut, (40, 40))
        tmp = out_dir / f"_{png.stem}_in.png"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        flat.convert("RGB").save(tmp)
        done.append(edit_image(tmp, TWO_D, out_dir / f"{png.stem}.png"))
        tmp.unlink()
    return done
