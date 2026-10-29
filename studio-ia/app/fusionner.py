"""Fusionne les lots écrits par les auteurs (banque/brut/) et les notes des deux juges (banque/notes/) en une banque propre
pour l'application : format vérifié, note = moyenne des deux regards, drapeaux, doublons (entre eux et avec les 217 sketchs
déjà écrits), tenues uniques sur toute la chaîne.

  python3 fusionner.py [note_minimale]      → banque/selection.json + banque/rapport.txt
"""
import difflib
import glob
import itertools
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ICI = Path(__file__).resolve().parent
RACINE = ICI.parent
sys.path.insert(0, str(RACINE))
import generer  # noqa: E402
import jury  # noqa: E402
import verifier  # noqa: E402

BANQUE = Path(os.environ.get("BANQUE_DIR", ICI / "banque"))
MARQUEURS = verifier.MARQUEURS + ("ma chérie", "chéri", "vieux père", "on dit quoi", "c'est comment", "gbê", "mon gars")
COULEURS = ["teal", "coral", "mustard", "plum", "mint", "rust", "lavender", "saffron", "emerald", "magenta", "cobalt", "peach",
            "olive", "burgundy", "turquoise", "tangerine", "lilac", "ochre", "crimson", "sky-blue", "jade", "fuchsia", "sand",
            "ruby", "indigo", "lime", "copper", "rose", "navy", "gold", "silver", "cream", "chocolate", "apricot", "cyan", "violet",
            "maroon", "pistachio", "salmon", "aubergine", "amber", "ivory", "charcoal", "sunflower", "cherry"]


def mots(t):
    return generer.normaliser(t)


def valide(s):
    """None si le sketch est utilisable, sinon la raison du rejet."""
    try:
        if not (s.get("id") and s.get("titre") and s.get("lieu") and s.get("jeu") and s.get("chute")):
            return "champ manquant"
        p, d = s.get("persos"), s.get("dialogue")
        if not (isinstance(p, list) and 1 <= len(p) <= 3 and all(x.get("nom") and x.get("desc") and x.get("pose") for x in p)):
            return "personnages invalides"
        if len({x["nom"] for x in p}) != len(p):
            return "deux personnages du même nom"
        if not (isinstance(d, list) and 2 <= len(d) <= 4 and all(isinstance(i, int) and 0 <= i < len(p) and isinstance(t, str) for i, t in d)):
            return "dialogue invalide"
        if not (isinstance(s.get("fin"), int) and 0 <= s["fin"] < len(p)):
            return "fin invalide"
        n = sum(len(mots(t)) for _, t in d)
        if n > 36:
            return f"trop long ({n} mots)"
        if any(len(mots(t)) < 2 for _, t in d):
            return "réplique trop courte"
    except Exception as e:                      # noqa: BLE001
        return f"format : {e}"
    return None


def similaire(a, b):
    """deux chutes ou deux dialogues trop proches (mots pleins communs ou phrase presque identique)."""
    pa, pb = {m for m in mots(a) if len(m) > 3}, {m for m in mots(b) if len(m) > 3}
    jac = len(pa & pb) / max(1, len(pa | pb))
    seq = difflib.SequenceMatcher(None, " ".join(mots(a)), " ".join(mots(b))).ratio()
    return max(jac, seq)


def main():
    note_min = float(sys.argv[1]) if len(sys.argv) > 1 else 5.5
    fiches = {b["id"]: b for b in json.load(open(BANQUE / "briefs.json"))}
    rejets = Counter()
    sketchs = []
    for f in sorted(glob.glob(str(BANQUE / "brut" / "B*.json"))):
        try:
            lot = json.load(open(f))
        except Exception:                        # noqa: BLE001
            rejets["fichier illisible"] += 1
            continue
        for s in lot:
            r = valide(s)
            if r:
                rejets[r] += 1
                continue
            s["emoji"] = s.get("emoji") if s.get("emoji") in ("choc", "mdr") else "mdr"
            s["cles"] = [c for c in (s.get("cles") or []) if isinstance(c, str)][:3]
            s["theme"] = fiches.get(s["id"][:4], {}).get("domaine", "")
            sketchs.append(s)
    # notes des deux juges
    notes = defaultdict(dict)
    drapeaux = defaultdict(set)
    for f in glob.glob(str(BANQUE / "notes" / "B*_*.json")):
        regard = Path(f).stem.split("_")[-1]
        try:
            for n in json.load(open(f)):
                notes[n["id"]][regard] = float(n["note"])
                drapeaux[n["id"]].update(n.get("drapeaux") or [])
        except Exception:                        # noqa: BLE001
            rejets["notes illisibles"] += 1
    gardes = []
    for s in sketchs:
        nt = notes.get(s["id"], {})
        if not nt:
            rejets["non noté"] += 1
            continue
        dr = drapeaux[s["id"]]
        if "danger" in dr:
            rejets["drapeau danger"] += 1
            continue
        if "connu" in dr:
            rejets["drapeau connu (déjà vu)"] += 1
            continue
        note = sum(nt.values()) / len(nt)
        note -= 0.7 * len(dr & {"confus", "tournage", "titre"})
        texte = " ".join(t for _, t in s["dialogue"]).lower()
        if not any(m in texte for m in MARQUEURS):
            note -= 0.5
        s["note"] = round(note, 2)
        s["notes"] = {k: round(v, 1) for k, v in nt.items()}
        if dr:
            s["drapeaux"] = sorted(dr)
        gardes.append(s)
    gardes.sort(key=lambda s: -s["note"])
    # doublons : avec le catalogue déjà écrit, puis entre eux (on garde le mieux noté)
    catalogue = [t for _, t in jury.deja_tournes()]
    chutes_cat = [t.split(" / ")[-1] for t in catalogue]
    retenus, chutes = [], []
    for s in gardes:
        chute = s["dialogue"][-1][1]
        tout = " / ".join(t for _, t in s["dialogue"])
        if any(similaire(chute, c) >= 0.62 for c in chutes_cat) or any(similaire(tout, c) >= 0.72 for c in catalogue):
            rejets["doublon du catalogue"] += 1
            continue
        if any(similaire(chute, c) >= 0.62 for c in chutes):
            rejets["doublon dans la banque"] += 1
            continue
        retenus.append(s)
        chutes.append(chute)
    # tenues : la combinaison « paire de couleurs + type de vêtement » (« olive-and-lilac dress ») ne sert qu'une fois dans
    # toute la chaîne ; sinon la paire est remplacée par une paire jamais utilisée. (Les signatures à une seule couleur,
    # « white shirt », ne sont pas uniques à l'échelle de milliers de personnages : les paires réservées le sont.)
    def paires_sig(desc):
        return {sig for sig in verifier.signatures(desc) if re.match(r"^[a-z]+(?:-[a-z]+)*-and-[a-z]+(?:-[a-z]+)* ", sig)}
    vus = {sig for s in generer.sketchs().values() for p in s["persos"] for sig in paires_sig(p["desc"])}
    utilisees = {m.group(0) for s in retenus for p in s["persos"] for m in re.finditer(r"[a-z]+(?:-[a-z]+)*-and-[a-z]+(?:-[a-z]+)*", p["desc"])}
    libres = (f"{a}-and-{b}" for a, b in itertools.combinations(COULEURS, 2) if f"{a}-and-{b}" not in utilisees)
    corrigees = 0
    for s in retenus:
        for p in s["persos"]:
            for sig in sorted(paires_sig(p["desc"]) & vus):
                neuve = next(libres, None)
                if not neuve:
                    break
                p["desc"] = p["desc"].replace(sig.split(" ")[0], neuve, 1)
                corrigees += 1
            vus |= paires_sig(p["desc"])
    selection = [s for s in retenus if s["note"] >= note_min]
    for s in selection:
        s.pop("mecanisme", None)
    (BANQUE / "selection.json").write_text(json.dumps(selection, ensure_ascii=False, indent=0), encoding="utf-8")
    hist = Counter(int(s["note"]) for s in retenus)
    rapport = [f"lots lus : {len(glob.glob(str(BANQUE / 'brut' / 'B*.json')))} ; sketchs valides : {len(sketchs)} ; notés et sans drapeau bloquant : {len(gardes)}",
               f"après doublons : {len(retenus)} ; tenues recolorées : {corrigees} ; GARDÉS (note ≥ {note_min}) : {len(selection)} → {2 * len(selection)} prompts",
               "notes : " + "  ".join(f"{k}-{k + 1}: {hist[k]}" for k in sorted(hist, reverse=True)),
               "rejets : " + " ; ".join(f"{k} {v}" for k, v in rejets.most_common())]
    (BANQUE / "rapport.txt").write_text("\n".join(rapport) + "\n", encoding="utf-8")
    print("\n".join(rapport))


if __name__ == "__main__":
    main()
