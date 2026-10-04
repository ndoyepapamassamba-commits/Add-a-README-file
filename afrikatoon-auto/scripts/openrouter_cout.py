#!/usr/bin/env python3
"""Coût d'une vidéo Afrikatoon faite uniquement avec OpenRouter, aux prix publics DU JOUR (aucune clé requise).

    python scripts/openrouter_cout.py kits/2026-10-03/02b-la-sauce-de-belle-maman-anim.json
    python scripts/openrouter_cout.py <kit.json> --reprises 1.3 --fcfa 570

Lit le kit (nombre de scènes, caractères de dialogue, durée visée) et chiffre trois formules.
"""
import argparse
import json
import math
import urllib.request

API = "https://openrouter.ai/api/v1"
TOKENS_PAR_IMAGE = 4175            # modèles d'image facturés au « image_token » (doc OpenRouter : 4175 tokens = 1 image)


def get(path):
    with urllib.request.urlopen(f"{API}/{path}", timeout=30) as r:
        return json.loads(r.read())["data"]


def prix():
    img = {m["id"]: m["pricing"] for m in get("models?output_modalities=image")}
    tts = {m["id"]: m["pricing"] for m in get("models?output_modalities=speech")}
    vid = {m["id"]: m["pricing_skus"] for m in get("videos/models")}
    return img, tts, vid


TOKENS_GEMINI = 1290                # images Gemini « Flash Image » en 1K : ~1290 tokens de sortie


def image_cost(p, gemini=False):
    unit = float(p.get("image_output") or p.get("image_token") or 0)
    return unit * (TOKENS_GEMINI if gemini else TOKENS_PAR_IMAGE) + float(p.get("image", 0) or 0)


def seedance_s(rate, w, h, fps=24):
    """Seedance est facturé en « video tokens » ≈ largeur × hauteur × images/s ÷ 1024 (estimation)."""
    return w * h * fps / 1024 * float(rate)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kit")
    ap.add_argument("--reprises", type=float, default=1.3, help="marge de prises ratées (1.3 = +30 %)")
    ap.add_argument("--fcfa", type=float, default=570, help="FCFA pour 1 USD (indicatif)")
    ap.add_argument("--duree", type=float, default=0, help="durée finale visée en s (défaut : estimée du kit)")
    a = ap.parse_args()
    kit = json.load(open(a.kit, encoding="utf-8"))
    scenes = kit["scenes"]
    lines = [l for s in scenes for l in s.get("dialogue") or []]
    chars = sum(len(l["text"]) for l in lines)
    duree = a.duree or max(60.0, chars / 14 + 1.5 * len(scenes))      # ~14 caractères/s à l'oral + respirations
    plans = math.ceil(duree / 6)
    img, tts, vid = prix()
    r = a.reprises

    def ligne(nom, usd, detail):
        return nom, usd, detail

    images_eco = image_cost(img["bytedance-seed/seedream-5-0-flash"]) * (len(scenes) + 3) * r
    images_std = image_cost(img["google/gemini-3.1-flash-image"], gemini=True) * (len(scenes) + 3) * r
    voix_payant = float(tts["fish-audio/s2.1-pro"]["prompt"]) * chars * 3
    musique = 0.04                                                    # Lyria 3 Clip : 0,04 $ le clip de 30 s
    musique_long = 0.08                                               # Lyria 3 Pro : 0,08 $ le morceau
    lite = vid["google/veo-3.1-lite"]
    veo_lite_muet = float(lite["duration_seconds_without_audio_720p"])
    veo_lite_son = float(lite["duration_seconds_with_audio_720p"])
    sd = vid["bytedance/seedance-1-5-pro"]
    sd_son = seedance_s(sd["video_tokens"], 720, 1280)
    kling = float(vid["kwaivgi/kling-v3.0-pro"]["duration_seconds_with_audio"])
    s = duree * r
    formules = {
        "ÉCO — Veo 3.1 Lite 720p muet + voix Fish gratuites (bouches non synchronisées)": [
            ("Images clés Seedream 5 Flash", images_eco), ("Vidéo Veo 3.1 Lite 720p sans son", s * veo_lite_muet),
            ("Voix Fish Audio S2.1 Pro Free", 0.0), ("Musique Lyria 3 Clip", musique)],
        "STANDARD — Seedance 1.5 Pro 720p avec dialogue et lip-sync natifs": [
            ("Images clés Gemini 3.1 Flash Image", images_std), ("Vidéo Seedance 1.5 Pro 720p avec audio (estim.)", s * sd_son),
            ("Voix de secours Fish S2.1 Pro", voix_payant), ("Musique Lyria 3 Clip", musique)],
        "PREMIUM — Kling v3.0 Pro avec audio": [
            ("Images clés Gemini 3.1 Flash Image", images_std), ("Vidéo Kling v3.0 Pro avec audio", s * kling),
            ("Voix Fish S2.1 Pro", voix_payant), ("Musique Lyria 3 Pro", musique_long)],
        "Variante STANDARD Veo — Veo 3.1 Lite 720p avec audio natif": [
            ("Images clés Seedream 5 Flash", images_eco), ("Vidéo Veo 3.1 Lite 720p avec audio", s * veo_lite_son),
            ("Musique Lyria 3 Clip", musique)],
    }
    print(f"Kit : {kit.get('title', a.kit)} — {len(scenes)} scènes, {len(lines)} répliques, {chars} caractères, "
          f"≈ {duree:.0f} s, {plans} plans de 6 s, marge de reprises ×{r}\n")
    for nom, items in formules.items():
        tot = sum(v for _, v in items)
        print(f"■ {nom}")
        for k, v in items:
            print(f"   {k:52} {v:7.2f} $")
        print(f"   {'TOTAL':52} {tot:7.2f} $  ≈ {tot * a.fcfa:,.0f} FCFA\n".replace(",", " "))
    print("Écriture du sketch : gratuite (Claude dans la session, ou un modèle « :free » d'OpenRouter).\n"
          "Bruitages : Kenney CC0 en local (0 $). Montage, sous-titres, mixage : ffmpeg en local (0 $).\n"
          "Prix lus en direct sur openrouter.ai ; ajouter les frais d'achat de crédits OpenRouter.")


if __name__ == "__main__":
    main()
