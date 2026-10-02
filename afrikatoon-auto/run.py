"""Afrikatoon Auto — du scénario à la publication TikTok en une commande.

    python run.py auth                      # une seule fois : autoriser l'app sur votre compte TikTok
    python run.py scenario [--idea "..."]   # écrire seulement le kit (scénario + prompts)
    python run.py run [--idea "..."]        # tout : scénario → images → clips → montage → TikTok
    python run.py run --mock --no-upload    # test gratuit du montage, sans aucune API
    python run.py upload output/<dossier>   # (re)publier une vidéo déjà montée
    python run.py monter mes_clips_grok/ --kit kit.json   # assembler vos clips Grok (gratuit)
    python run.py voix creer BAYE           # 3 voix inédites proposées d'après la description
    python run.py voix garder BAYE <id>     # garder la meilleure
    python run.py voix utiliser BAYE <voice_id>   # ou une voix de la Voice Library ElevenLabs
    python run.py voix auto ma_video.mp4    # découpe auto des voix (aiguë / grave) à trier
    python run.py voix extraire ma_video.mp4 --debut 3 --fin 9 --perso MODOU
    python run.py voix cloner MODOU         # crée la voix clonée (ElevenLabs)
    python run.py voix tester MODOU "Baye ! Mes 50 000 francs !"
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

from afrikatoon import config, montage, scenario, tiktok, visuals, voices

HISTORY = config.STATE_DIR / "history.json"


def load_history() -> list[dict]:
    return json.loads(HISTORY.read_text(encoding="utf-8")) if HISTORY.exists() else []


def save_history(entry: dict) -> None:
    hist = load_history() + [entry]
    HISTORY.parent.mkdir(parents=True, exist_ok=True)
    HISTORY.write_text(json.dumps(hist, ensure_ascii=False, indent=2), encoding="utf-8")


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "sketch"


def new_workdir(kit: dict) -> Path:
    d = config.OUTPUT_DIR / f"{time.strftime('%Y%m%d-%H%M%S')}-{slug(kit['title'])}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def caption_of(kit: dict) -> str:
    return f"{kit['caption']} {' '.join(kit['hashtags'])}"


def cmd_auth(_args):
    print("1) Ouvrez ce lien, connectez-vous à TikTok et cliquez « Autoriser » :\n")
    print(tiktok.authorize_url(), "\n")
    url = input("2) Collez ici l'URL complète de la page vers laquelle vous avez été redirigé : ")
    tok = tiktok.exchange_code(url.strip())
    print(f"\nOK. Jetons enregistrés dans {tiktok.TOKEN_FILE}")
    print("Pour GitHub Actions, ajoutez ce secret TIKTOK_REFRESH_TOKEN :\n" + tok["refresh_token"])


def get_kit(args) -> dict:
    if getattr(args, "format", None):
        config.STORY_FORMAT = args.format
    if args.kit:
        return json.loads(Path(args.kit).read_text(encoding="utf-8"))
    return scenario.generate_kit(idea=args.idea, history=load_history())


def cmd_scenario(args):
    kit = get_kit(args)
    work = new_workdir(kit)
    scenario.save_kit(kit, work / "kit.json")
    print(json.dumps(kit, ensure_ascii=False, indent=2))
    print(f"\nKit enregistré : {work / 'kit.json'}")


def cmd_run(args):
    kit = get_kit(args)
    work = new_workdir(kit)
    scenario.save_kit(kit, work / "kit.json")
    print(f"[1/4] Scénario : « {kit['title']} » ({len(kit['scenes'])} scènes) → {work}")

    clips = []
    for i, sc in enumerate(kit["scenes"]):
        clip = work / f"clip_{i:02d}.mp4"
        if args.mock:
            if args.mock == "3d":
                from afrikatoon import animatic3d as animatic
            else:
                from afrikatoon import animatic
            animatic.render_clip(sc, i, clip, setting=kit.get("setting", "cour"),
                                 is_last=i == len(kit["scenes"]) - 1, title=kit["title"],
                                 min_seconds=config.CLIP_SECONDS)
        else:
            print(f"[2/4] Scène {i + 1}/{len(kit['scenes'])} : image…")
            img = visuals.scene_image(sc, work / f"scene_{i:02d}.png")
            print(f"[3/4] Scène {i + 1}/{len(kit['scenes'])} : animation…")
            if config.VOICE_MODE == "clone":
                raw = visuals.scene_clip(sc, img, work / f"raw_{i:02d}.mp4")
                audio = voices.scene_audio(sc, work, i, config.CLIP_SECONDS)
                voices.lipsync(raw, audio, clip)
            else:
                visuals.scene_clip(sc, img, clip)
        clips.append(clip)

    final = montage.assemble(clips, kit["scenes"], work, work / "final.mp4",
                             subtitles=not args.no_subs)
    length = montage.duration(final)
    print(f"[4/4] Montage terminé : {final} ({length:.1f} s)")
    if length < 60:
        print("ATTENTION : vidéo < 60 s, non éligible au programme Creator Rewards.")
    (work / "caption.txt").write_text(caption_of(kit), encoding="utf-8")

    entry = {"date": time.strftime("%Y-%m-%d %H:%M"), "title": kit["title"],
             "conflict": kit.get("theme", {}).get("conflict"),
             "twist": kit.get("theme", {}).get("twist"), "folder": work.name}
    if not args.no_upload:
        res = tiktok.publish(final, caption_of(kit), mode=args.mode)
        print(f"TikTok : {res['status']} (publish_id {res['publish_id']})")
        entry["tiktok"] = res["status"]
    if not args.mock:
        save_history(entry)


def cmd_upload(args):
    work = Path(args.folder)
    kit = json.loads((work / "kit.json").read_text(encoding="utf-8"))
    res = tiktok.publish(work / "final.mp4", caption_of(kit), mode=args.mode)
    print(f"TikTok : {res['status']} (publish_id {res['publish_id']})")


def cmd_monter(args):
    """Assemble des clips déjà générés (ex. téléchargés depuis Grok gratuitement) en une vidéo finale."""
    src = Path(args.dossier)
    clips = sorted(p for p in src.iterdir() if p.suffix.lower() in (".mp4", ".mov", ".webm"))
    if not clips:
        sys.exit(f"Aucun clip vidéo dans {src}")
    kit = json.loads(Path(args.kit).read_text(encoding="utf-8")) if args.kit else \
        {"title": src.name, "caption": "", "hashtags": [], "scenes": [{} for _ in clips]}
    scenes = (kit["scenes"] + [{}] * len(clips))[:len(clips)]
    work = new_workdir(kit)
    final = montage.assemble(clips, scenes, work, work / "final.mp4", subtitles=bool(args.kit))
    length = montage.duration(final)
    print(f"Montage : {final} ({length:.1f} s, {len(clips)} clips)")
    if length < 60:
        print(f"ATTENTION : {length:.0f} s < 60 s — ajoutez des clips pour la monétisation.")
    if kit.get("caption"):
        (work / "caption.txt").write_text(caption_of(kit), encoding="utf-8")
        scenario.save_kit(kit, work / "kit.json")
        if args.publier:
            res = tiktok.publish(final, caption_of(kit))
            print(f"TikTok : {res['status']}")


def cmd_voix(args):
    if args.action == "creer":
        for p in voices.design(args.cible):
            print(f"  {p['file']}   →  python run.py voix garder \"{args.cible}\" {p['id']}")
        print("Écoutez les 3 propositions et gardez la meilleure.")
    elif args.action == "garder":
        print(f"Voix enregistrée pour {args.cible} :", voices.keep(args.cible, args.texte))
    elif args.action == "utiliser":
        voices.use_library_voice(args.cible, args.texte)
        print(f"{args.cible} utilise maintenant la voix {args.texte}")
    elif args.action == "auto":
        for f in voices.auto_split(Path(args.cible)):
            print(" ", f)
        print("Écoutez ces extraits et déplacez les bons dans state/voice_samples/<PERSONNAGE>/")
    elif args.action == "extraire":
        print("Extrait enregistré :", voices.extract_sample(Path(args.cible), args.debut, args.fin, args.perso))
    elif args.action == "cloner":
        print(f"Voix clonée pour {args.cible} :", voices.clone(args.cible))
    elif args.action == "tester":
        dest = config.OUTPUT_DIR / f"test_voix_{slug(args.cible)}.mp3"
        dest.parent.mkdir(parents=True, exist_ok=True)
        print("Écoutez :", voices.speak(args.cible, args.texte, dest))


def main(argv=None):
    p = argparse.ArgumentParser(description="Afrikatoon Auto")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("auth").set_defaults(func=cmd_auth)
    for name, func in (("scenario", cmd_scenario), ("run", cmd_run)):
        sp = sub.add_parser(name)
        sp.add_argument("--idea", help="Idée imposée (ex: « Tabaski, mouton échangé »)")
        sp.add_argument("--kit", help="Réutiliser un kit.json existant au lieu d'en écrire un")
        sp.add_argument("--format", choices=["sketch", "blagues"],
                        help="sketch (histoire en 3 actes) ou blagues (compilation « la blague du jour »)")
        sp.set_defaults(func=func)
        if name == "run":
            sp.add_argument("--mock", nargs="?", const="2d", choices=["2d", "3d"],
                            help="Aperçu gratuit sans API : 2d (rapide) ou 3d (Blender, ~1 h)")
            sp.add_argument("--no-upload", action="store_true", help="Ne pas publier sur TikTok")
            sp.add_argument("--no-subs", action="store_true", help="Sans sous-titres incrustés")
            sp.add_argument("--mode", choices=["draft", "direct"], default=None)
    up = sub.add_parser("upload")
    up.add_argument("folder")
    up.add_argument("--mode", choices=["draft", "direct"], default=None)
    up.set_defaults(func=cmd_upload)
    mo = sub.add_parser("monter", help="Assembler vos clips (ex. Grok) en une vidéo > 1 min")
    mo.add_argument("dossier", help="Dossier contenant les clips, dans l'ordre alphabétique (01.mp4, 02.mp4…)")
    mo.add_argument("--kit", help="kit.json du sketch (sous-titres + légende)")
    mo.add_argument("--publier", action="store_true", help="Envoyer ensuite sur TikTok")
    mo.set_defaults(func=cmd_monter)
    vx = sub.add_parser("voix", help="Voix clonées des personnages (ElevenLabs)")
    vx.add_argument("action", choices=["creer", "garder", "utiliser", "auto", "extraire", "cloner", "tester"])
    vx.add_argument("cible", help="extraire : chemin de la vidéo ; cloner/tester : nom du personnage")
    vx.add_argument("texte", nargs="?", default="Walay, je te jure que je n'ai rien !",
                    help="tester : texte à dire ; garder/utiliser : identifiant de la voix")
    vx.add_argument("--debut", type=float, default=0)
    vx.add_argument("--fin", type=float, default=10)
    vx.add_argument("--perso", help="Personnage auquel appartient l'extrait (extraire)")
    vx.set_defaults(func=cmd_voix)
    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())
