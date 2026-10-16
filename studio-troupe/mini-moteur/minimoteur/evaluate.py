"""Évaluation automatique du mini-moteur (CPU seulement) -> JSON + Markdown.

Ce qui est mesuré
-----------------
(a) VAE : PSNR de reconstruction sur des clips de combinaisons JAMAIS vues.
(b) Texte->vidéo, sur les 20 prompts tenus à l'écart ET 20 prompts vus :
    * identité : les couleurs dominantes hors décor (histogramme sur la palette
      de la troupe) ressemblent-elles plus au personnage demandé qu'aux 6 autres ?
      Il faut d'abord qu'un personnage SOIT là : une image compte comme
      « avec personnage » si au moins PRESENCE_MIN_PX pixels hors décor tombent
      sur la palette (vrais clips : >= 53 par image ; décor vide passé dans le
      VAE : <= 7). Sans personnage sur au moins la moitié des images, le verdict
      est « absent » (jamais juste) ;
    * action   : trajectoire du personnage (centre de masse, boîte englobante) :
      « saute » = les pieds décollent, « marche vers la droite/gauche » = signe
      du déplacement horizontal, « tombe » = la silhouette passe de haute à
      couchée, « parle » = peu de déplacement mais du mouvement local ;
    * décor    : le fond ressemble-t-il au décor demandé (distance médiane aux 4
      décors vides) ?
    * fluidité : moyenne de |dérivée seconde| du centre de masse (px/image²) et
      des pixels, comparée à la même mesure sur les vrais clips (rapport ~1 = bien).
(c) Image->vidéo : PSNR de l'image 0 générée vs l'image donnée, et persistance
    de l'identité (part des images où le personnage reconnu reste le bon ; une
    image sans personnage compte comme une erreur).

Chaque mesure est aussi calculée sur les VRAIS clips (rendu) et sur leurs
reconstructions par le VAE : c'est le « plafond » atteignable par le détecteur.

Usage :
    python -m minimoteur.evaluate                      # runs/dit.pt -> runs/eval.json + runs/eval.md
    python -m minimoteur.evaluate --vae runs/vae.pt    # seulement le VAE
    python -m minimoteur.evaluate --balayage           # réglages CFG / shift -> runs/balayage.json + .md
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from functools import lru_cache
from pathlib import Path

import numpy as np
import torch

from .config import DEFAULT_THREADS, RUNS_DIR
from .troupe_data import (
    ACTIONS, COULEURS, COSTUMES, DECORS, PERSONNAGES, build_dataset, from_model_space, heldout_triples,
    prompt_for, render_background, render_clip, to_model_space, train_triples,
)

FG_SEUIL = 0.12  # écart max (sur [0,1]) au décor vide pour qu'un pixel soit « personnage »
CODE_RAYON = 0.25  # distance max à une couleur de la palette pour être comptée
PRESENCE_MIN_PX = 20  # pixels « personnage » sur la palette, par image, pour dire qu'un personnage est là
ABSENT = "absent"


# ---------------------------------------------------------------------------
# Détecteurs élémentaires
# ---------------------------------------------------------------------------
def to01(clip: np.ndarray) -> np.ndarray:
    return clip.astype(np.float32) / 255.0


@lru_cache(maxsize=4)
def _fonds(size: int = 32) -> dict[str, np.ndarray]:
    return {d: render_background(d, size) for d in DECORS}


def classify_set(clip01: np.ndarray) -> tuple[str, dict[str, float]]:
    """Décor dont le fond vide est le plus proche (médiane des écarts : robuste au personnage)."""
    dist = {d: float(np.median(np.abs(clip01 - bg[None]).mean(-1))) for d, bg in _fonds(clip01.shape[1]).items()}
    return min(dist, key=dist.get), dist


def foreground(clip01: np.ndarray, decor: str) -> np.ndarray:
    """Masque (T, H, W) des pixels qui s'écartent du décor vide."""
    bg = _fonds(clip01.shape[1])[decor]
    return np.abs(clip01 - bg[None]).max(-1) > FG_SEUIL


@lru_cache(maxsize=1)
def codebook() -> tuple[list[str], np.ndarray]:
    names = sorted({c for cos in COSTUMES.values() for c in
                    (cos.haut, cos.bas, cos.motif, cos.couleur_coiffure, cos.col, cos.centre) if c}
                   | {"peau", "vert", "blanc"})
    return names, np.stack([np.asarray(COULEURS[n], np.float32) / 255.0 for n in names])


def palette_counts(pixels: np.ndarray) -> np.ndarray:
    """Nombre de pixels (N, 3) tombant sur chaque couleur de la palette de la troupe (les autres sont ignorés)."""
    _, cb = codebook()
    if len(pixels) == 0:
        return np.zeros(len(cb), np.float32)
    d = np.linalg.norm(pixels[:, None, :] - cb[None], axis=-1)
    k = d.argmin(1)
    ok = d[np.arange(len(k)), k] < CODE_RAYON
    return np.bincount(k[ok], minlength=len(cb)).astype(np.float32)


def color_histogram(pixels: np.ndarray) -> np.ndarray:
    """Histogramme normalisé des pixels (N, 3) sur la palette de la troupe."""
    h = palette_counts(pixels)
    return h / max(h.sum(), 1.0)


@lru_cache(maxsize=1)
def reference_histograms() -> dict[str, np.ndarray]:
    """Histogramme moyen de chaque personnage, mesuré sur des clips de référence rendus."""
    ref = {}
    for nom in PERSONNAGES:
        hs = []
        for j, action in enumerate(ACTIONS):
            decor = DECORS[j % len(DECORS)]
            clip = to01(render_clip(nom, action, decor, seed=[777, j]))
            fg = foreground(clip, decor)
            hs.append(color_histogram(clip[fg]))
        ref[nom] = np.mean(hs, axis=0)
    return ref


def identity_from_counts(counts: np.ndarray, min_px: float = PRESENCE_MIN_PX) -> tuple[str, dict[str, float]]:
    """Personnage dont l'histogramme de référence est le plus proche (distance L1) ;
    « absent » si moins de ``min_px`` pixels tombent sur la palette."""
    total = float(counts.sum())
    if total < min_px:
        return ABSENT, {}
    h = counts / total
    dist = {n: float(np.abs(h - r).sum()) for n, r in reference_histograms().items()}
    return min(dist, key=dist.get), dist


def classify_identity(pixels: np.ndarray, min_px: float = PRESENCE_MIN_PX) -> tuple[str, dict[str, float]]:
    """Identité des pixels (N, 3) hors décor ; « absent » s'il y en a trop peu sur la palette."""
    return identity_from_counts(palette_counts(pixels), min_px)


def trajectory(fg: np.ndarray) -> dict[str, np.ndarray]:
    """Centre de masse et boîte englobante du personnage, image par image (NaN si absent)."""
    T = fg.shape[0]
    keys = ("aire", "cx", "cy", "haut", "bas", "gauche", "droite")
    out = {k: np.full(T, np.nan, np.float32) for k in keys}
    for t in range(T):
        ys, xs = np.nonzero(fg[t])
        out["aire"][t] = len(xs)
        if len(xs) < PRESENCE_MIN_PX:  # quelques pixels de bruit ne font pas un personnage
            continue
        out["cx"][t], out["cy"][t] = xs.mean(), ys.mean()
        out["haut"][t], out["bas"][t] = ys.min(), ys.max()
        out["gauche"][t], out["droite"][t] = xs.min(), xs.max()
    return out


def _ends(a: np.ndarray, n: int = 3) -> tuple[float, float]:
    v = a[~np.isnan(a)]
    if len(v) == 0:
        return float("nan"), float("nan")
    return float(np.median(v[:n])), float(np.median(v[-n:]))


def action_features(clip01: np.ndarray, fg: np.ndarray) -> dict[str, float]:
    tr = trajectory(fg)
    valid = ~np.isnan(tr["cx"])
    f: dict[str, float] = {"images_valides": float(valid.mean())}
    if valid.sum() < 4:
        return f
    x0, x1 = _ends(tr["cx"])
    f["dx"] = x1 - x0
    hauteur = tr["bas"] - tr["haut"] + 1
    largeur = tr["droite"] - tr["gauche"] + 1
    r0, r1 = _ends(hauteur / largeur)
    f["ratio_debut"], f["ratio_fin"] = r0, r1
    f["chute_ratio"] = r1 / max(r0, 1e-3)
    y0, y1 = _ends(tr["cy"])
    f["dy"] = y1 - y0
    bas = tr["bas"][valid]
    f["decollage"] = float(np.max(bas) - np.min(bas))  # les pieds quittent le sol
    # activité locale : part des pixels du personnage qui changent d'une image à l'autre
    diff = np.abs(np.diff(clip01, axis=0)).max(-1) > 0.1
    zone = fg[1:] | fg[:-1]
    f["activite"] = float((diff & zone).sum() / max(zone.sum(), 1))
    return f


def classify_action(f: dict[str, float]) -> str:
    if f.get("images_valides", 0.0) < 0.5 or "dx" not in f:
        return ABSENT
    # Seuils calibrés sur les vrais clips (voir tests/test_evaluate.py) :
    # tombe : le centre de masse descend de >= 2,2 px (vrais clips : 2,9 à 7,6 ; autres actions <= 1,2)
    if f["dy"] >= 2.2:
        return "tombe"
    # marche : déplacement horizontal >= 4 px (vrais clips : 8,8 à 14 ; autres actions sans chute <= 1,5)
    if abs(f["dx"]) >= 4.0:
        return "marche vers la droite" if f["dx"] > 0 else "marche vers la gauche"
    # saute : le bas de la silhouette décolle de >= 2,5 px (vrais clips : 4 à 7 ; parle : 0)
    if f["decollage"] >= 2.5:
        return "saute"
    # parle : immobile mais >= 5 % des pixels du personnage changent (vrais clips : 7,5 à 23 %)
    if f["activite"] >= 0.05:
        return "parle"
    return "immobile"


def smoothness(clip01: np.ndarray, fg: np.ndarray) -> dict[str, float]:
    tr = trajectory(fg)
    c = np.stack([tr["cx"], tr["cy"]], -1)
    d2 = np.linalg.norm(c[2:] - 2 * c[1:-1] + c[:-2], axis=-1)
    d2 = d2[~np.isnan(d2)]
    pix = np.abs(clip01[2:] - 2 * clip01[1:-1] + clip01[:-2]).mean()
    return {"saccade_centre_px": float(d2.mean()) if len(d2) else float("nan"), "saccade_pixels": float(pix)}


def analyse_clip(clip: np.ndarray, nom: str, action: str, decor: str) -> dict:
    """Toutes les mesures pour un clip uint8 (T, H, W, 3) et sa demande (nom, action, décor)."""
    c = to01(clip)
    decor_vu, _ = classify_set(c)
    # Le personnage est mesuré contre le décor RECONNU : une erreur de décor ne
    # se transforme pas en erreur d'identité (le décor a sa propre mesure).
    fg = foreground(c, decor_vu)
    counts = np.stack([palette_counts(c[t][fg[t]]) for t in range(len(c))])  # (T, couleurs)
    present = counts.sum(1) >= PRESENCE_MIN_PX
    # Identité du clip : sur les images où un personnage est là, et seulement
    # s'il est là sur au moins la moitié des images (sinon « absent »).
    ident = identity_from_counts(counts[present].sum(0))[0] if present.mean() >= 0.5 else ABSENT
    feats = action_features(c, fg)
    act = classify_action(feats)
    par_image = [identity_from_counts(counts[t])[0] for t in range(len(c))]  # « absent » = erreur
    persist = np.mean([p == nom for p in par_image])
    return {
        "identite_ok": ident == nom, "identite_vue": ident,
        "action_ok": act == action, "action_vue": act,
        "decor_ok": decor_vu == decor, "decor_vu": decor_vu,
        "persistance_identite": float(persist),
        "images_avec_personnage": float(present.mean()),
        **smoothness(c, fg),
    }


def summarize(rows: list[dict]) -> dict[str, float]:
    if not rows:
        return {}
    keys = ("identite_ok", "action_ok", "decor_ok", "persistance_identite", "saccade_centre_px", "saccade_pixels",
            "psnr_image0_dB")
    out = {"n": len(rows)}
    for k in keys:
        vals = [float(r[k]) for r in rows if k in r and not np.isnan(float(r[k]))]
        if vals:
            out[k] = round(float(np.mean(vals)), 4)
    out["tout_ok"] = round(float(np.mean([r["identite_ok"] and r["action_ok"] and r["decor_ok"] for r in rows])), 4)
    return out


def per_action(rows: list[dict], demandes: list[tuple[str, str, str]]) -> dict[str, float]:
    """Exactitude de l'action, action par action (pour voir laquelle échoue)."""
    out = {}
    for a in ACTIONS:
        ok = [r["action_ok"] for r, d in zip(rows, demandes) if d[1] == a]
        if ok:
            out[a] = round(float(np.mean(ok)), 4)
    return out


def psnr_uint8(a: np.ndarray, b: np.ndarray) -> float:
    mse = np.mean((a.astype(np.float32) / 255 - b.astype(np.float32) / 255) ** 2)
    return float(10 * np.log10(1.0 / max(mse, 1e-10)))


# ---------------------------------------------------------------------------
# Protocole
# ---------------------------------------------------------------------------
GROUPES = {"tenus_a_l_ecart": "tenus à l'écart", "vus": "vus"}


def eval_prompts() -> dict[str, list[tuple[str, str, str]]]:
    return {"tenus_a_l_ecart": heldout_triples(), "vus": train_triples()[::6]}


@torch.no_grad()
def eval_vae(vae, n_clips: int = 200, seed: int = 1234, supersample: int = 3) -> dict:
    held = build_dataset("heldout", n_clips, seed, supersample)
    scores = []
    for i in range(0, len(held), 32):
        x = to_model_space(held.clips[i: i + 32])
        r = vae.decode(vae.encode(x))
        xr, rr = (x.clamp(-1, 1) + 1) / 2, (r.clamp(-1, 1) + 1) / 2
        scores.append(10 * torch.log10(1.0 / (xr - rr).pow(2).flatten(1).mean(1).clamp_min(1e-10)))
    s = torch.cat(scores)
    return {"psnr_heldout_dB": round(float(s.mean()), 2), "psnr_min_dB": round(float(s.min()), 2), "n": len(s)}


def run(ckpt: Path | None, vae_ckpt: Path | None, n_per_prompt: int, steps: int, cfg_scale: float, shift: float,
        seed: int, sheet: Path | None) -> dict:
    from .pipeline import generate, load_moteur, load_vae

    res: dict = {"date": time.strftime("%Y-%m-%d %H:%M"), "parametres": {
        "n_par_prompt": n_per_prompt, "pas": steps, "cfg": cfg_scale, "shift": shift, "graine": seed}}
    t0 = time.time()
    if ckpt is None:
        vae, cfg, _ = load_vae(vae_ckpt)
        res["vae"] = eval_vae(vae, cfg.data.n_eval_clips, cfg.data.seed, cfg.data.supersample)
        return res
    m = load_moteur(ckpt)
    res["vae"] = eval_vae(m.vae, m.cfg.data.n_eval_clips, m.cfg.data.seed, m.cfg.data.supersample)
    res["checkpoint"] = str(ckpt)
    planche = []
    for groupe, triples in eval_prompts().items():
        prompts = [prompt_for(*tr) for tr in triples for _ in range(n_per_prompt)]
        demandes = [tr for tr in triples for _ in range(n_per_prompt)]
        # Plafond : vrais clips (graines d'évaluation) et leurs reconstructions VAE
        vrais = np.stack([render_clip(*tr, seed=[seed, 99, i], supersample=m.cfg.data.supersample)
                          for i, tr in enumerate(demandes)])
        recons = from_model_space(m.vae.decode(m.vae.encode(to_model_space(vrais))))
        res.setdefault("plafond_vrais_clips", {})[groupe] = summarize([analyse_clip(c, *tr) for c, tr in zip(vrais, demandes)])
        rows_rec = [analyse_clip(c, *tr) for c, tr in zip(recons, demandes)]
        res.setdefault("plafond_reconstruction_vae", {})[groupe] = summarize(rows_rec)
        res.setdefault("action_par_type", {}).setdefault("reconstruction VAE", {})[groupe] = per_action(rows_rec, demandes)
        # Texte -> vidéo
        gen = generate(m, prompts, steps=steps, cfg_scale=cfg_scale, shift=shift, seed=seed)
        rows = [analyse_clip(c, *tr) for c, tr in zip(gen, demandes)]
        res.setdefault("texte_video", {})[groupe] = summarize(rows)
        res["action_par_type"].setdefault("texte→vidéo", {})[groupe] = per_action(rows, demandes)
        res.setdefault("detail_texte_video", {})[groupe] = [
            {"prompt": p, **{k: v for k, v in r.items() if k.endswith(("_vue", "_vu", "_ok"))}} for p, r in zip(prompts, rows)]
        # Image -> vidéo : 1re image = image 0 du vrai clip
        gen_i2v = generate(m, prompts, vrais[:, 0], steps=steps, cfg_scale=cfg_scale, shift=shift, seed=seed)
        rows_i2v = [{**analyse_clip(c, *tr), "psnr_image0_dB": psnr_uint8(c[0], v[0])}
                    for c, tr, v in zip(gen_i2v, demandes, vrais)]
        res.setdefault("image_video", {})[groupe] = summarize(rows_i2v)
        res["action_par_type"].setdefault("image→vidéo", {})[groupe] = per_action(rows_i2v, demandes)
        planche += [vrais[0], gen[0], gen_i2v[0]] + ([gen[n_per_prompt]] if len(gen) > n_per_prompt else [])
    res["duree_s"] = round(time.time() - t0, 1)
    if sheet is not None:
        from .video_io import contact_sheet, save_png

        save_png(contact_sheet(planche), sheet, scale=4)
        res["planche"] = str(sheet)
    return res


BALAYAGE = ((2.0, 3.0), (4.0, 3.0), (7.0, 3.0), (4.0, 6.0))  # (CFG, shift) essayés par --balayage


def balayage(ckpt: Path, n_per_prompt: int, steps: int, seed: int,
             reglages: tuple[tuple[float, float], ...] = BALAYAGE) -> dict:
    """Texte->vidéo seulement, mêmes prompts et mêmes graines que ``run`` pour chaque réglage (CFG, shift).

    Le réglage CFG 4 / shift 3 redonne exactement la ligne texte->vidéo de ``run``.
    """
    from .pipeline import generate, load_moteur

    m = load_moteur(ckpt)
    res: dict = {"date": time.strftime("%Y-%m-%d %H:%M"), "checkpoint": str(ckpt),
                 "parametres": {"n_par_prompt": n_per_prompt, "pas": steps, "graine": seed}, "essais": []}
    t0 = time.time()
    for cfg_scale, shift in reglages:
        essai: dict = {"cfg": cfg_scale, "shift": shift}
        for groupe, triples in eval_prompts().items():
            demandes = [tr for tr in triples for _ in range(n_per_prompt)]
            gen = generate(m, [prompt_for(*tr) for tr in demandes], steps=steps, cfg_scale=cfg_scale, shift=shift,
                           seed=seed)
            rows = [analyse_clip(c, *tr) for c, tr in zip(gen, demandes)]
            essai[groupe] = summarize(rows)
            essai[groupe]["action_par_type"] = per_action(rows, demandes)
        res["essais"].append(essai)
        print(f"CFG {cfg_scale:g}, shift {shift:g} : " + " ; ".join(
            f"{GROUPES[g]} identité {essai[g]['identite_ok']:.0%} action {essai[g]['action_ok']:.0%}"
            for g in GROUPES), flush=True)
    res["duree_s"] = round(time.time() - t0, 1)
    return res


def balayage_markdown(res: dict) -> str:
    p = res["parametres"]
    n = len(eval_prompts()["vus"]) * p["n_par_prompt"]
    L = [f"# Balayage des réglages d'échantillonnage ({res['date']})", "",
         f"Texte→vidéo, {p['pas']} pas d'Euler, {p['n_par_prompt']} graine(s) par prompt (graine {p['graine']}), "
         f"{n} clips par groupe. Avec {n} clips, un pourcentage est connu à environ ±{100 / n ** 0.5:.0f} points "
         f"près (2 écarts-types pour un taux de 50 %). La ligne CFG 4 / shift 3 est celle de l'évaluation "
         f"complète (mêmes prompts, mêmes graines).", "",
         "| CFG | shift | prompts | identité | action | décor | les 3 |", "|---|---|---|---|---|---|---|"]
    for e in res["essais"]:
        for g in GROUPES:
            s = e[g]
            L.append(f"| {e['cfg']:g} | {e['shift']:g} | {GROUPES[g]} | {100 * s['identite_ok']:.0f} % | "
                     f"{100 * s['action_ok']:.0f} % | {100 * s['decor_ok']:.0f} % | {100 * s['tout_ok']:.0f} % |")
    return "\n".join(L) + "\n"


def to_markdown(res: dict) -> str:
    L = [f"# Évaluation du mini-moteur ({res.get('date', '')})", ""]
    if "vae" in res:
        v = res["vae"]
        L += [f"**VAE** : PSNR de reconstruction sur {v['n']} clips tenus à l'écart = **{v['psnr_heldout_dB']} dB** "
              f"(min {v['psnr_min_dB']} dB).", ""]
    if "texte_video" not in res:
        return "\n".join(L)
    p = res["parametres"]
    L += [f"Génération : {p['pas']} pas d'Euler, CFG {p['cfg']}, shift {p['shift']}, "
          f"{p['n_par_prompt']} graines par prompt.", ""]
    cols = [("identite_ok", "identité"), ("action_ok", "action"), ("decor_ok", "décor"), ("tout_ok", "les 3"),
            ("persistance_identite", "persistance id."), ("saccade_centre_px", "saccade centre (px)"),
            ("saccade_pixels", "saccade pixels"), ("psnr_image0_dB", "PSNR image 0 (dB)")]
    L += ["| mesure | prompts | " + " | ".join(c[1] for c in cols) + " |",
          "|---|---|" + "---|" * len(cols)]
    for titre, key in (("vrais clips (plafond)", "plafond_vrais_clips"),
                       ("reconstruction VAE", "plafond_reconstruction_vae"),
                       ("texte→vidéo", "texte_video"), ("image→vidéo", "image_video")):
        for groupe, s in res.get(key, {}).items():
            vals = []
            for k, _ in cols:
                x = s.get(k)
                vals.append("—" if x is None else (f"{100 * x:.0f} %" if k.endswith("_ok") or k == "persistance_identite"
                                                   else f"{x:.3f}"))
            L.append(f"| {titre} | {GROUPES.get(groupe, groupe)} | " + " | ".join(vals) + " |")
    if res.get("action_par_type"):
        L += ["", "Exactitude de l'action, action par action :", "",
              "| mode | prompts | " + " | ".join(ACTIONS) + " |", "|---|---|" + "---|" * len(ACTIONS)]
        for mode, groupes in res["action_par_type"].items():
            for groupe, d in groupes.items():
                L.append(f"| {mode} | {GROUPES.get(groupe, groupe)} | "
                         + " | ".join("—" if a not in d else f"{100 * d[a]:.0f} %" for a in ACTIONS) + " |")
    L += ["", "Lecture : « identité / action / décor » = part des clips où le détecteur automatique reconnaît ce "
          "qui était demandé ; « saccade » = |dérivée seconde| moyenne (plus bas = plus fluide, à comparer aux vrais "
          "clips) ; « tenus à l'écart » = combinaisons jamais vues à l'entraînement."]
    if res.get("planche"):
        L += ["", f"Planche (vrai clip / T2V / I2V par groupe) : `{res['planche']}`"]
    return "\n".join(L) + "\n"


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m minimoteur.evaluate",
                                description="Mesures automatiques du mini-moteur (CPU) -> JSON + Markdown.")
    p.add_argument("--ckpt", default=str(RUNS_DIR / "dit.pt"), help="checkpoint du moteur (DiT + VAE)")
    p.add_argument("--vae", default=None, help="évaluer seulement ce checkpoint de VAE")
    p.add_argument("--n-per-prompt", type=int, default=2, help="graines par prompt (défaut 2)")
    p.add_argument("--steps", type=int, default=30)
    p.add_argument("--cfg", type=float, default=4.0)
    p.add_argument("--shift", type=float, default=3.0)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--out-json", default=str(RUNS_DIR / "eval.json"))
    p.add_argument("--out-md", default=str(RUNS_DIR / "eval.md"))
    p.add_argument("--sheet", default=str(RUNS_DIR / "eval_planche.png"), help="planche PNG ('' pour aucune)")
    p.add_argument("--threads", type=int, default=DEFAULT_THREADS,
                   help="fils de calcul CPU (défaut 4 ou $MINIMOTEUR_THREADS ; 1 ou 2 si la machine est occupée)")
    p.add_argument("--balayage", action="store_true",
                   help="au lieu de l'évaluation complète : texte->vidéo pour CFG 2/4/7 (shift 3) et shift 6 (CFG 4)")
    p.add_argument("--out-balayage", default=str(RUNS_DIR / "balayage.json"),
                   help="sortie de --balayage (JSON ; un .md du même nom est aussi écrit)")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    torch.set_num_threads(args.threads)
    if args.balayage:
        res = balayage(Path(args.ckpt), args.n_per_prompt, args.steps, args.seed)
        out = Path(args.out_balayage)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
        md = balayage_markdown(res)
        out.with_suffix(".md").write_text(md, encoding="utf-8")
        print(md)
        print(f"-> {out}\n-> {out.with_suffix('.md')}")
        return 0
    res = run(None if args.vae else Path(args.ckpt), Path(args.vae) if args.vae else None, args.n_per_prompt,
              args.steps, args.cfg, args.shift, args.seed, Path(args.sheet) if args.sheet else None)
    Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out_json).write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    md = to_markdown(res)
    Path(args.out_md).write_text(md, encoding="utf-8")
    print(md)
    print(f"-> {args.out_json}\n-> {args.out_md}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
