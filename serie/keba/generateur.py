"""Générateur d'illustrations PNG : FLUX.2-klein-4B (Apache-2.0) sur la démonstration officielle Hugging Face.

Greffe (31/10/2026, méthode greffer-par-rea) :
- recherche Hugging Face : 138 modèles texte→image, 47 sous MIT/Apache/BSD ; sur processeur, tous les bons modèles
  (4 à 7 milliards de paramètres) prennent de 15 à 40 min par image (mesures de la Fabrique, stable-diffusion.cpp) ;
- la démonstration officielle black-forest-labs/FLUX.2-klein-4B tourne sur carte graphique gratuite (ZeroGPU) :
  10,7 s pour une image 768×1024 en 4 étapes, sans compte ;
- preuve REA ev_b8a293… (gradio_client 2.7.2, client.py l. 84-124) : Client(token=…) envoie le jeton Hugging Face
  (Authorization + x-hf-authorization), ce qui rattache l'appel au quota GPU du compte ; sans jeton : quota anonyme.
  Variable d'environnement HF_TOKEN lue si présente.
Chaque image est mise en cache et accompagnée de sa provenance (modèle, licence, prompt, graine) : preuve des droits.
"""
import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

MODELE = {
    "nom": "FLUX.2-klein-4B",
    "licence": "Apache-2.0",
    "poids": "black-forest-labs/FLUX.2-klein-4B",
    "espace": "black-forest-labs/FLUX.2-klein-4B",
}


def _client_hf():
    from gradio_client import Client
    return Client(MODELE["espace"], token=os.environ.get("HF_TOKEN") or None, verbose=False)


def _empreinte_fichier(chemin: Path) -> str:
    return hashlib.sha256(Path(chemin).read_bytes()).hexdigest()


def _vers_png(source: str, destination: Path):
    import skia
    image = skia.Image.open(source)
    if image is None:
        raise RuntimeError(f"image illisible : {source}")
    image.save(str(destination), skia.kPNG)


class Generateur:
    def __init__(self, cache: Path, fabrique_client=_client_hf, essais: int = 4, pause: float = 8.0):
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.fabrique_client = fabrique_client
        self.essais = essais
        self.pause = pause
        self._client = None

    def _cle(self, prompt, refs, largeur, hauteur, graine, etapes):
        donnees = {"modele": MODELE["nom"], "prompt": prompt, "refs": [_empreinte_fichier(r) for r in refs],
                   "largeur": largeur, "hauteur": hauteur, "graine": graine, "etapes": etapes}
        return hashlib.sha256(json.dumps(donnees, sort_keys=True).encode()).hexdigest()[:24]

    def _refs_gradio(self, refs):
        try:
            from gradio_client import handle_file
        except ImportError:                      # client factice des tests
            return [str(r) for r in refs]
        return [{"image": handle_file(str(r)), "caption": None} for r in refs]

    def generer(self, prompt: str, refs=(), largeur: int = 768, hauteur: int = 1024, graine: int = 0,
                etapes: int = 4) -> Path:
        refs = [Path(r) for r in refs]
        cle = self._cle(prompt, refs, largeur, hauteur, graine, etapes)
        chemin = self.cache / f"{cle}.png"
        if chemin.exists():
            return chemin
        if self._client is None:
            self._client = self.fabrique_client()
        derniere = None
        for essai in range(self.essais):
            try:
                debut = time.time()
                resultat, graine_rendue = self._client.predict(
                    prompt, self._refs_gradio(refs), "Distilled (4 steps)", graine, False, largeur, hauteur,
                    etapes, 1.0, False, api_name="/infer")
                source = resultat["path"] if isinstance(resultat, dict) else resultat
                _vers_png(source, chemin)
                provenance = {
                    "modele": MODELE["nom"], "licence": MODELE["licence"], "poids": MODELE["poids"],
                    "service": f"huggingface.co/spaces/{MODELE['espace']}", "prompt": prompt,
                    "refs": [{"fichier": r.name, "sha256": _empreinte_fichier(r)} for r in refs],
                    "graine": graine, "largeur": largeur, "hauteur": hauteur, "etapes": etapes,
                    "secondes": round(time.time() - debut, 1),
                    "date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                }
                chemin.with_suffix(".json").write_text(json.dumps(provenance, ensure_ascii=False, indent=1))
                return chemin
            except Exception as erreur:          # file d'attente pleine, quota, coupure réseau…
                derniere = erreur
                time.sleep(self.pause * (2 ** essai))
        raise RuntimeError(f"génération impossible après {self.essais} essais : {derniere}")
