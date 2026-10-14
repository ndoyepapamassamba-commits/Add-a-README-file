#!/usr/bin/env python3
"""LE RÉALISATEUR — prompt → consignes de jeu VALIDÉES → moteur Blender, 0 $ de vidéo.

Pour chaque réplique de l'histoire, il écrit ce que le moteur sait jouer, et rien d'autre (vocabulaire FERMÉ de
direction-vocab.json, poses DESSINÉES de la troupe lues dans rig.json) :
  • pose      : le dessin de celui qui parle (neutre, accuse, choc, haussement, rire — ce que la planche contient) ;
  • geste     : un clip de capture de mouvement CMU par étiquette (« dispute », « haussement », « téléphone »…) ;
  • energie   : 0 (calme) … 1 (explosif) — dose l'amplitude du clip (acting.py) ;
  • react     : la pose dessinée des partenaires présents ;
  • move      : le mouvement de caméra (punch / push / pull / drift) quand la réplique l'appelle.

Trois réalisateurs, du plus sûr au plus libre, combinés « règles d'abord, modèle pour les trous » :
  1. RÈGLES (toujours) : indices mesurables de la réplique (mots du vocabulaire, ponctuation, chute, pose demandée) ;
  2. MODÈLE LOCAL (llama.cpp, MIT ; Qwen3 1,7B, Apache-2.0 ; ~1,3 Go, 4 cœurs : mesuré 5,3 jetons/s, 8 s par réplique,
     JSON valide 5/5 grâce à la grammaire) : sans clé, sans compte, hors ligne ;
  3. OPENROUTER GRATUIT (modèles « :free », 50 requêtes/jour sans crédit) : UNE requête pour tout le film.
Le modèle ne remplit que ce que les règles n'ont pas tranché (geste 'aucun', réaction absente) ; tout est revalidé.
Aucun bpy généré : le moteur traduit (plan.py → scene.py). Sortie : l'histoire « dirigée » (mêmes beats + champs)."""
import argparse
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mocap  # noqa: E402

CAMERA = ('punch', 'push', 'pull', 'drift', 'aucun')
LOCAL_MODEL_DIRS = (os.environ.get('MASSAMBA_LLM', ''), os.path.join(os.path.expanduser('~/.cache/massamba-models'), 'llm'))
DEFAULT_FREE_MODEL = os.environ.get('MASSAMBA_DIRECTOR_MODEL', 'google/gemma-4-26b-a4b-it:free')


def vocab():
    return mocap.vocab()


def character_sheets():
    """characters.json (name → height, voice, age, activity…), {} when absent."""
    try:
        with open(os.path.join(HERE, 'characters.json'), encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def character_poses(rig, name):
    """The drawn poses of an actor (what the troupe's board contains), 'neutre' at least."""
    c = (rig.get('cast') or {}).get(name) or {}
    kinds = [p['kind'] for p in c.get('poses') or []]
    return kinds or ['neutre']


# ── 1. Règles : ce que la réplique dit d'elle-même ──────────────────────────────────────────────────────────────────
POSE_GESTE = {'rire': 'rire', 'haussement': 'haussement', 'accuse': 'pointe', 'choc': 'aucun', 'neutre': 'aucun'}


def rules(beat, i, story):
    """Measurable cues only: the vocabulary's words in the line, the punctuation, the punchline, the story's pose."""
    text = beat.get('text', '')
    geste = mocap.search(text)
    if geste == 'aucun':
        geste = POSE_GESTE.get(beat.get('pose', 'neutre'), 'aucun')
    punch = story.get('punch') and story['punch'].get('beat') == i
    bangs = text.count('!') + text.count('?!')
    if geste == 'aucun' and ('?!' in text or bangs >= 2):
        geste = 'dispute'  # an outraged line (« Mille ?! ») argues with the hands even without a cue word
    if punch:
        energie = 0.9
    elif bangs >= 2 or '?!' in text:
        energie = 0.8
    elif bangs == 1 or text.isupper():
        energie = 0.7
    elif len(text) > 90:
        energie = 0.45
    else:
        energie = 0.6
    return {'geste': geste, 'energie': energie, 'source': 'regles'}


def reaction_trigger(beat, i, story, r):
    """Does the line give the partner a reason to react (a question, a cry, the punchline, an energetic line)?"""
    text = beat.get('text', '')
    punch = bool(story.get('punch')) and story['punch'].get('beat') == i
    return punch or '!' in text or '?' in text or r['energie'] >= 0.7


# ── 2/3. Modèles : le prompt, la grammaire, la validation ────────────────────────────────────────────────────────────
def system_prompt(story, poses_by_actor):
    V = vocab()
    gestes = '\n'.join(f"  - {k} : {g['desc']}" for k, g in V['gestes'].items())
    poses = '\n'.join(f"  - {n} : {', '.join(p)}" for n, p in poses_by_actor.items())
    return (
        "Tu es le réalisateur d'un sketch TikTok dessiné en Côte d'Ivoire (humour de marché, de famille, de maquis ; "
        f"style Afrikatoon). Titre : « {story.get('title', '')} ». Accroche : « {story.get('hook', '')} ».\n"
        "Pour UNE réplique, tu choisis seulement dans ces listes (rien d'autre n'existe dans le moteur) :\n"
        f"GESTES capturés :\n{gestes}\n"
        f"POSES dessinées par personnage :\n{poses}\n"
        "ENERGIE : 0 = calme, 0,5 = normal, 1 = explosif (chute, cri). CAMERA : punch (zoom sec, chute ou révélation), "
        "push (avance), pull (recul), drift (glissement), aucun (laisser le montage choisir : le plus fréquent).\n"
        "REACTIONS : la pose dessinée de chaque partenaire PRÉSENT qui entend la réplique (choc pour une surprise, "
        "accuse pour un reproche, rire pour une blague réussie, haussement pour l'indifférence, neutre sinon).\n"
        "Réponds UNIQUEMENT par un objet JSON : pose, geste, energie, camera, reactions."
    )


def user_prompt(beat, i, n, present, prev):
    before = f"Réplique précédente : {prev['who']} — « {prev.get('text', '')} »\n" if prev else ''
    return (f"{before}Réplique {i + 1}/{n}. Qui parle : {beat['who']}. Présents : {', '.join(present) or 'personne'}. "
            f"Texte : « {beat.get('text', '')} »")


def grammar_schema(poses, present_poses):
    V = vocab()
    return {
        'type': 'object', 'additionalProperties': False,
        'required': ['pose', 'geste', 'energie', 'camera', 'reactions'],
        'properties': {
            'pose': {'type': 'string', 'enum': poses},
            'geste': {'type': 'string', 'enum': list(V['gestes'])},
            'energie': {'type': 'number', 'minimum': 0, 'maximum': 1},
            'camera': {'type': 'string', 'enum': list(CAMERA)},
            'reactions': {'type': 'object', 'additionalProperties': False,
                          'properties': {n: {'type': 'string', 'enum': p} for n, p in present_poses.items()}},
        },
    }


def validate(d, poses, present_poses):
    """Only what the engine can play survives: unknown values are dropped (never an error, never a guess)."""
    V = vocab()
    out = {}
    if isinstance(d, dict):
        if d.get('pose') in poses:
            out['pose'] = d['pose']
        if d.get('geste') in V['gestes']:
            out['geste'] = d['geste']
        try:
            out['energie'] = min(1.0, max(0.0, float(d.get('energie'))))
        except (TypeError, ValueError):
            pass
        if d.get('camera') in CAMERA:
            out['camera'] = d['camera']
        r = d.get('reactions')
        if isinstance(r, dict):
            out['reactions'] = {n: p for n, p in r.items() if n in present_poses and p in present_poses[n]}
    return out


def extract_json(text):
    m = re.search(r'\{.*\}', text or '', re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except ValueError:
        return None


class LocalDirector:
    """llama.cpp (MIT) + a GGUF model under ~/.cache/massamba-models/llm (Qwen3 1,7B Q4_K_M, Apache-2.0)."""

    def __init__(self, path):
        from llama_cpp import Llama
        self.path = path
        self.llm = Llama(model_path=path, n_ctx=3072, n_threads=max(1, os.cpu_count() or 4), n_batch=256, verbose=False)

    @staticmethod
    def find():
        for d in LOCAL_MODEL_DIRS:
            if d and os.path.isfile(d):
                return d
            if d and os.path.isdir(d):
                ggufs = sorted(f for f in os.listdir(d) if f.endswith('.gguf'))
                if ggufs:
                    return os.path.join(d, ggufs[0])
        return None

    def ask(self, system, user, schema):
        from llama_cpp import LlamaGrammar
        # Qwen3: an empty <think> block switches the thinking off; the grammar forces the JSON of the schema.
        prompt = f"<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
        r = self.llm.create_completion(prompt, max_tokens=200, temperature=0.3,
                                       grammar=LlamaGrammar.from_json_schema(json.dumps(schema)))
        return extract_json(r['choices'][0]['text'])


class OpenRouterDirector:
    """A free text model of OpenRouter (« :free », 50 requests/day without credits): ONE request for the whole film."""

    def __init__(self, model=DEFAULT_FREE_MODEL):
        self.key = os.environ.get('OPENROUTER_API_KEY', '')
        self.model = model

    def ask_all(self, system, users):
        import urllib.request
        body = {
            'model': self.model, 'temperature': 0.3,
            'messages': [{'role': 'system', 'content': system + '\nRéponds par un TABLEAU JSON : un objet par réplique, dans l\'ordre.'},
                         {'role': 'user', 'content': '\n\n'.join(users)}],
        }
        req = urllib.request.Request('https://openrouter.ai/api/v1/chat/completions', data=json.dumps(body).encode(),
                                     headers={'Authorization': f'Bearer {self.key}', 'Content-Type': 'application/json',
                                              'HTTP-Referer': 'https://github.com/ndoyepapamassamba-commits', 'X-Title': 'MASSAMBA Workbench'})
        with urllib.request.urlopen(req, timeout=120) as r:
            j = json.load(r)
        text = j['choices'][0]['message']['content']
        m = re.search(r'\[.*\]', text, re.S)
        arr = json.loads(m.group(0)) if m else []
        return arr if isinstance(arr, list) else [], j.get('usage') or {}


# ── Le réalisateur : règles, puis le modèle pour les trous ───────────────────────────────────────────────────────────
def present_at(story, i):
    """Who is on stage at beat i (an actor with 'enter' arrives on that beat)."""
    return [c for c in story['cast'] if (c.get('enter') is None or c['enter'] <= i)]


def direct(story, rig, mode='auto', log=print):
    t0 = time.time()
    beats = story['beats']
    cast = {c['id']: c for c in story['cast']}
    poses_of = {c['id']: character_poses(rig, c['name']) for c in story['cast']}
    poses_by_name = {c['name']: poses_of[c['id']] for c in story['cast']}
    backend, model_name = 'regles', ''
    local = None
    if mode in ('auto', 'openrouter') and os.environ.get('OPENROUTER_API_KEY'):
        backend = 'openrouter'
    elif mode in ('auto', 'local'):
        path = LocalDirector.find()
        if path:
            try:
                local = LocalDirector(path)
                backend, model_name = 'local', os.path.basename(path)
            except Exception as e:  # noqa: BLE001 — llama.cpp missing: the rules stay
                log(f'[réalisateur] modèle local indisponible ({e.__class__.__name__}: {e}) : règles seules')
    out = json.loads(json.dumps(story))
    sysmsg = system_prompt(story, poses_by_name)
    users, present_list = [], []
    for i, b in enumerate(beats):
        present = [c for c in present_at(story, i) if c['id'] != b['who']]
        present_list.append(present)
        users.append(user_prompt(b, i, len(beats), [c['name'] for c in present], beats[i - 1] if i else None))
    answers = [None] * len(beats)
    usage = {}
    if backend == 'openrouter':
        try:
            orr = OpenRouterDirector()
            arr, usage = orr.ask_all(sysmsg, users)
            answers = (arr + [None] * len(beats))[: len(beats)]
            model_name = orr.model
        except Exception as e:  # noqa: BLE001 — network / quota: the rules stay
            log(f'[réalisateur] OpenRouter indisponible ({e.__class__.__name__}: {str(e)[:80]}) : règles seules')
            backend = 'regles'
    for i, b in enumerate(beats):
        who_poses = poses_of[b['who']]
        present = present_list[i]
        pp = {c['name']: poses_of[c['id']] for c in present}
        r = rules(b, i, story)
        if backend == 'local':
            try:
                answers[i] = local.ask(sysmsg, users[i], grammar_schema(who_poses, pp))
            except Exception as e:  # noqa: BLE001
                log(f'[réalisateur] réplique {i + 1} : modèle local en erreur ({e.__class__.__name__}) : règles')
        v = validate(answers[i], who_poses, pp)
        nb = out['beats'][i]
        # Rules first: a cue found in the line wins; the model fills the gaps and may raise the energy of a flat line.
        nb['geste'] = r['geste'] if r['geste'] != 'aucun' else v.get('geste', 'aucun')
        nb['energie'] = round(max(r['energie'], v.get('energie', 0.0)) if r['source'] == 'regles' and 'energie' in v and r['energie'] <= 0.6 else r['energie'], 2)
        if 'pose' in v and 'pose' not in b and v['pose'] != 'rire':
            nb['pose'] = v['pose']  # the story's pose is the author's; a laugh is decided by the words (plan.spoken_pose)
        react = dict(b.get('react') or {})
        # A partner's reaction proposed by the model needs a TRIGGER in the line (a question, a cry, the punchline,
        # an energetic line): measured on film 6, Qwen3 1,7B put « accuse » on 15 lines of 18 — a pose ping-pong.
        if reaction_trigger(b, i, story, r):
            for name, pose in (v.get('reactions') or {}).items():
                cid = next((c['id'] for c in present if c['name'] == name), None)
                if cid and cid not in react and pose != 'neutre':
                    react[cid] = pose
        if react:
            nb['react'] = react
        if 'move' not in b and v.get('camera') and v['camera'] != 'aucun' and v['camera'] in ('punch',) and story.get('punch', {}).get('beat') == i:
            nb['move'] = v['camera']  # a camera punch only where the story puts its punchline
        nb['_source'] = {'geste': 'regles' if r['geste'] != 'aucun' else ('modele' if 'geste' in v else 'regles'),
                         'modele': bool(v)}
    # Entrances: an actor who arrives on a beat walks in with a STYLE (100STYLE clip), read from its first line, the
    # story's hook and its character sheet (age, activity) — rules only, deterministic.
    sheets = character_sheets()
    for c in out['cast']:
        if c.get('enter') and not c.get('entree'):
            first = next((b.get('text', '') for b in beats if b['who'] == c['id']), '')
            sheet = sheets.get(c['name'], {})
            # Priority: what the actor SAYS on arriving, then the story's hook, then its sheet (activity, then age).
            tag = 'entre_normal'
            for src in (first, story.get('hook', ''), str(sheet.get('activite', ''))):
                tag = mocap.search_entrance(src)
                if tag != 'entre_normal':
                    break
            if tag == 'entre_normal' and (sheet.get('age') or 0) >= 60:
                tag = 'entre_vieux'
            c['entree'] = tag
    motion_budget(out, log)
    out['_director'] = {'backend': backend, 'model': model_name, 'seconds': round(time.time() - t0, 1),
                        'usage': usage, 'date': time.strftime('%Y-%m-%d')}
    return out


# MOTION BUDGET — measured on film 6 (14/10/2026): a gesture clip on 14 lines of 18 pushed the film's motion to 0,0294
# and its coverage to 0,46, above the channel's range (motion ≤ 0,027, coverage ≤ 0,435; the same film without the
# director: 0,0195 / 0,41). The channel's own videos gesture on about half the lines: the director keeps the gestures
# of the strongest half (the punchline first, then the lines with a cue word, then by energy) and plays the rest with
# the procedural acting only.
GESTURE_SHARE = 0.5


def motion_budget(story, log=print):
    beats = story['beats']
    punch_i = (story.get('punch') or {}).get('beat', -1)
    cand = [i for i, b in enumerate(beats) if b.get('geste', 'aucun') != 'aucun']
    keep_n = max(1, int(round(GESTURE_SHARE * len(beats))))
    if len(cand) <= keep_n:
        return
    def rank(i):
        b = beats[i]
        src = (b.get('_source') or {}).get('geste', '')
        # A cue word in the line or the author's own pose (a laugh, a shrug, an accusation) are explicit asks; the
        # model's fills come after; the energy breaks ties.
        explicit = mocap.search(b.get('text', '')) != 'aucun' or POSE_GESTE.get(b.get('pose', 'neutre'), 'aucun') != 'aucun'
        return (i == punch_i, explicit, src == 'regles', float(b.get('energie', 0)))
    keep = set(sorted(cand, key=rank, reverse=True)[:keep_n])
    for i in cand:
        if i not in keep:
            beats[i]['geste'] = 'aucun'
            beats[i].setdefault('_source', {})['geste'] = 'budget'
    log(f'[réalisateur] budget de mouvement : {len(keep)} gestes gardés sur {len(cand)} ({len(beats)} répliques)')


def summary(story):
    rows = []
    for i, b in enumerate(story['beats']):
        rows.append(f"{i + 1:>2}. {b['who']:<8} {b.get('pose', 'neutre'):<10} geste={b.get('geste', 'aucun'):<12} "
                    f"énergie={b.get('energie', 0):.2f} {('caméra=' + b['move']) if b.get('move') else '':<13} "
                    f"réactions={b.get('react') or {}} ({b.get('_source', {}).get('geste', '')})")
    for c in story.get('cast', []):
        if c.get('entree'):
            rows.append(f"entrée de {c['name']} (réplique {c.get('enter')}) : {c['entree']}")
    d = story.get('_director', {})
    rows.append(f"réalisateur : {d.get('backend')} {d.get('model', '')} en {d.get('seconds')} s")
    return '\n'.join(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--story', required=True)
    ap.add_argument('--rig', required=True, help='rig.json de la troupe découpée (poses dessinées par personnage)')
    ap.add_argument('--out', required=True)
    ap.add_argument('--mode', default='auto', choices=['auto', 'regles', 'local', 'openrouter'])
    a = ap.parse_args()
    story = json.load(open(a.story, encoding='utf-8'))
    rig = json.load(open(a.rig, encoding='utf-8'))
    out = direct(story, rig, a.mode)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('[réalisateur]\n' + summary(out), flush=True)


if __name__ == '__main__':
    main()
