"""Génération du scénario (histoire drôle, personnages, prompts) avec Claude."""
import json
import math
import random

from . import bible, config

SCRIPT_TOOL = {
    "name": "save_kit",
    "description": "Enregistre le kit de production complet du sketch.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Titre court accrocheur, en français"},
            "concept": {"type": "string", "description": "Résumé du sketch en 2-3 phrases"},
            "characters": {
                "type": "array", "items": {"type": "string"},
                "description": "Noms des personnages utilisés (clés de la bible, ex: MODOU, BAYE)",
            },
            "setting": {"type": "string", "description": "Clé du décor principal"},
            "scenes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "act": {"type": "integer", "description": "1, 2 ou 3"},
                        "beat": {"type": "string", "description": "hook, escalade, twist ou chute"},
                        "characters": {"type": "array", "items": {"type": "string"}},
                        "image_prompt": {"type": "string", "description": "Prompt image en anglais"},
                        "animation_prompt": {
                            "type": "string",
                            "description": "Prompt animation en anglais, dialogues FR inclus",
                        },
                        "dialogue": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "speaker": {"type": "string"},
                                    "text": {"type": "string"},
                                },
                                "required": ["speaker", "text"],
                            },
                        },
                    },
                    "required": ["act", "beat", "characters", "image_prompt",
                                 "animation_prompt", "dialogue"],
                },
            },
            "caption": {"type": "string", "description": "Légende TikTok avec question d'engagement"},
            "hashtags": {"type": "array", "items": {"type": "string"}},
            "score": {
                "type": "object",
                "properties": {
                    "hook": {"type": "integer"},
                    "universalite": {"type": "integer"},
                    "reproductibilite": {"type": "integer"},
                },
            },
        },
        "required": ["title", "concept", "characters", "setting", "scenes", "caption", "hashtags"],
    },
}


def _system_prompt(n_scenes: int, clip_seconds: int) -> str:
    chars = "\n".join(
        f"- {name} — {c['role']}. Registre : {c['voice']}.\n  Verbatim : `{c['visual']}`"
        for name, c in bible.CHARACTERS.items()
    )
    settings = "\n".join(f"- {k} : `{v}`" for k, v in bible.SETTINGS.items())
    return f"""Tu es le scénariste d'AFRIKATOON STUDIO, qui écrit des sketchs humoristiques en cartoon 3D
style Pixar pour le compte TikTok @comedyvideos_100 (humour africain francophone, audience Afrique
de l'Ouest + diaspora).

PERSONNAGES (recopie la description « Verbatim » MOT POUR MOT dans chaque prompt image où le
personnage apparaît) :
{chars}

DÉCORS (verbatim) :
{settings}

STYLE GLOBAL à inclure dans chaque prompt image : `{bible.STYLE}`

ÉMOTIONS utiles : {", ".join(bible.EMOTIONS)}

STRUCTURE OBLIGATOIRE — vidéo de plus d'une minute (monétisation Creator Rewards) :
exactement {n_scenes} scènes de {clip_seconds} secondes, réparties en 3 actes sur le même conflit :
Acte 1 accusation (la scène 1 est le HOOK : conflit déjà en cours, première réplique = accusation,
cri ou révélation, jamais d'exposition) → Acte 2 fausse preuve d'innocence / escalade, chaque
réplique plus absurde → Acte 3 twist (renversement : l'accusateur est coupable, le faible gagne,
l'enfant dit la vérité, l'objet caché apparaît) puis chute. Chaque acte a sa micro-punchline.

RÈGLES DES PROMPTS :
- image_prompt (anglais) : "3D animated cartoon, Pixar/DreamWorks style. [N] African characters in
  [décor verbatim]. [perso verbatim] with [émotion exagérée], [pose]. ..." + le détail de décor qui
  porte le gag bien visible + style global. 2-3 personnages max.
- animation_prompt (anglais) : 2 mouvements max par personnage, mouvement de caméra, puis
  `Dialogue in French with West African accent — NOM: "réplique" NOM: "réplique".`
  Comedic timing, expressive faces. La DERNIÈRE scène se termine par
  `freeze on [PERSO]'s shocked face looking directly at camera`.
- dialogue : répliques courtes (12 mots max), 1 à 3 par scène, qui tiennent en {clip_seconds} s,
  identiques à celles du animation_prompt.

HUMOUR : familial, sûr publicitairement. Pas de vulgarité, pas de violence réelle, pas de politique,
pas de religion moquée, pas de stéréotype dégradant. On se moque des situations, jamais des ethnies.
Scénario 100% original (TikTok démonétise le contenu répétitif).

HABILLAGE : caption en français avec une question d'engagement (« Team Modou ou team Baye ? »),
6-8 hashtags incluant {" ".join(bible.BASE_HASHTAGS)}.

Appelle l'outil save_kit avec le kit complet."""


def pick_theme(history: list[dict]) -> dict:
    """Tire une combinaison décor × conflit × twist pas encore utilisée récemment."""
    recent = {(h.get("conflict"), h.get("twist")) for h in history[-30:]}
    for _ in range(50):
        theme = {
            "conflict": random.choice(bible.CONFLICTS),
            "twist": random.choice(bible.TWISTS),
            "setting": random.choice(list(bible.SETTINGS)),
        }
        if (theme["conflict"], theme["twist"]) not in recent:
            return theme
    return theme


def generate_kit(theme: dict | None = None, idea: str | None = None, history=None) -> dict:
    import anthropic

    history = history or []
    theme = theme or pick_theme(history)
    n_scenes = max(3, math.ceil(config.TARGET_SECONDS / config.CLIP_SECONDS))
    past_titles = ", ".join(h["title"] for h in history[-20:] if h.get("title")) or "aucun"

    user = (
        f"Écris un nouveau sketch.\nConflit : {theme['conflict']}\nTwist : {theme['twist']}\n"
        f"Décor principal : {theme['setting']}\n"
        + (f"Idée imposée par l'utilisateur : {idea}\n" if idea else "")
        + f"Titres déjà publiés (ne pas refaire) : {past_titles}"
    )

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY or None)
    resp = client.messages.create(
        model=config.CLAUDE_MODEL,
        max_tokens=8000,
        system=_system_prompt(n_scenes, config.CLIP_SECONDS),
        tools=[SCRIPT_TOOL],
        tool_choice={"type": "tool", "name": "save_kit"},
        messages=[{"role": "user", "content": user}],
    )
    kit = next(b.input for b in resp.content if b.type == "tool_use")
    kit["theme"] = theme
    validate_kit(kit)
    return kit


def validate_kit(kit: dict) -> None:
    unknown = [c for c in kit["characters"] if c not in bible.CHARACTERS]
    if unknown:
        print(f"[scenario] Nouveaux personnages (hors bible) : {unknown}")
    for tag in bible.BASE_HASHTAGS:
        if tag not in kit["hashtags"]:
            kit["hashtags"].append(tag)
    kit["hashtags"] = kit["hashtags"][:8]
    if len(kit["scenes"]) * config.CLIP_SECONDS < 60:
        raise ValueError(
            f"Kit trop court : {len(kit['scenes'])} scènes × {config.CLIP_SECONDS}s < 60 s")


def save_kit(kit: dict, path) -> None:
    path.write_text(json.dumps(kit, ensure_ascii=False, indent=2), encoding="utf-8")
