---
name: modeles-ia-locaux
description: Installe et sécurise des modèles d'IA open source qui tournent sur la machine (Ollama, LM Studio, faster-whisper, Piper, ComfyUI) — diagnostic du PC, choix du modèle adapté (chat, code, vision, embeddings, transcription, voix, image, vidéo), licences, vérification des fichiers téléchargés (empreinte SHA-256, détection de pickle piégé), Ollama limité à la machine, branchement à OpenClaw. Déclencheurs : « installe un modèle », « IA en local », « Ollama », « LM Studio », « modèle open source », « sans Internet », « confidentiel ».
version: 1.0.0
metadata:
  openclaw:
    emoji: "🧩"
    os: [windows, linux, macos]
    requires:
      anyBins: [python, python3, py]
---

# Modèles d'IA open source en local

Intérêt : **les données ne quittent pas la machine**. C'est la seule option acceptable pour analyser des données
de la banque avec une IA, si l'employeur l'autorise. Script : `py {baseDir}\scripts\modeles.py`.

## 1. Diagnostiquer puis choisir (toujours)
```powershell
py {baseDir}\scripts\modeles.py materiel
py {baseDir}\scripts\modeles.py recommander --usage tout      # ou chat, code, vision, embeddings, transcription, voix, image, video
```
Ne proposer que les lignes ✔. Ordre de préférence : licence **Apache-2.0 / MIT**, puis taille. Vérifier la
version la plus récente sur ollama.com/library ou sur la fiche Hugging Face avant d'installer.

## 2. Installer (après accord : téléchargement de plusieurs Go)
| Outil | Windows | Rôle |
|---|---|---|
| **Ollama** (MIT) | `winget install Ollama.Ollama` puis `ollama pull qwen3:8b` | moteur de modèles texte/vision/embeddings |
| **LM Studio** (gratuit, non open source) | `winget install ElementLabs.LMStudio` | interface graphique, modèles GGUF |
| **faster-whisper** (MIT) | `py -m pip install faster-whisper` | transcription de réunions et vocaux |
| **Piper** (GPL-3.0) | `py -m pip install piper-tts` | synthèse vocale rapide sur CPU |
| **ComfyUI** (GPL-3.0) | version portable Windows depuis le GitHub officiel `comfyanonymous/ComfyUI` | images (FLUX schnell, SDXL), vidéo (Wan 2.2) |

Modèles Hugging Face : `py -m pip install -U huggingface_hub` puis `hf download <dépôt> <fichier> --local-dir modeles`.
Jeton HF éventuel : dans le coffre (`coffre-fort`), jamais dans le chat.

## 3. Vérifier chaque fichier téléchargé
```powershell
py {baseDir}\scripts\modeles.py verifier modeles\model.safetensors --sha256 <empreinte de la page officielle>
```
- **GGUF, safetensors, ONNX** : données pures, OK. **.pt / .pth / .bin / .ckpt / .pkl** (pickle) : peuvent exécuter du
  code à l'ouverture ; le script analyse les imports et **refuse** (`code 1`) s'il trouve `os.system`, `subprocess`,
  `eval`… Toujours préférer la version safetensors ; sinon `torch.load(..., weights_only=True)`.
- Uniquement des dépôts officiels (organisation éditrice : Qwen, mistralai, google, deepseek-ai, Comfy-Org,
  Wan-AI…) ; méfiance envers les copies « uncensored », « fixed », « v2 » publiées par des inconnus.
- Jamais de `.exe`, `.bat`, `.ps1` ou de nœud ComfyUI personnalisé sans lecture du code et accord.

## 4. Sécuriser Ollama
```powershell
py {baseDir}\scripts\modeles.py ollama
```
Doit répondre « écoute locale uniquement ✔ ». Ne **jamais** définir `OLLAMA_HOST=0.0.0.0` ni `OLLAMA_ORIGINS=*` :
n'importe quel appareil du Wi-Fi ou site web pourrait utiliser la machine et lire les conversations.

## 5. Brancher à OpenClaw
- Fournisseur de modèle : `openclaw configure` → choisir **Ollama** (adresse `http://127.0.0.1:11434`) et le modèle
  installé ; garder le modèle cloud pour les tâches non confidentielles si l'utilisateur le souhaite.
- Mémoire sémantique : fournisseur d'embeddings `ollama` avec `nomic-embed-text` ou `bge-m3` (voir `memoire-semantique`).
- Règle : **données de la banque → modèle local uniquement**. Le dire à l'utilisateur à chaque fois qu'un fichier
  sensible est en jeu et que le modèle actif est un modèle cloud.

## 6. Entretien
`ollama list` (taille), `ollama rm <modèle>` (après accord), mise à jour mensuelle d'Ollama et de ComfyUI.
