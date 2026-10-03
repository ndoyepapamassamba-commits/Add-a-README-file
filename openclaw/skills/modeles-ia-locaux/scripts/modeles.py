#!/usr/bin/env python3
"""Modèles d'IA open source en local : diagnostic de la machine, recommandations, contrôle des fichiers de
modèles (pickle piégé, empreinte), sécurité d'Ollama. Aucune donnée n'est envoyée.

    py modeles.py materiel                         # RAM, processeur, carte graphique (VRAM), disque libre
    py modeles.py recommander [--usage chat|code|raisonnement|vision|embeddings|transcription|voix|image|video|tout]
    py modeles.py verifier <fichier_modele> [--sha256 <empreinte attendue>]   # code 1 si dangereux ou différent
    py modeles.py ollama                           # Ollama : écoute locale seulement ? modèles installés, taille
"""
import argparse
import hashlib
import json
import os
import pickletools
import platform
import shutil
import socket
import struct
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path


# --- matériel -----------------------------------------------------------------------------------
def ram_gb():
    try:
        import psutil
        return psutil.virtual_memory().total / 2**30
    except ImportError:
        pass
    if sys.platform.startswith("win"):
        import ctypes

        class M(ctypes.Structure):
            _fields_ = [("l", ctypes.c_ulong), ("load", ctypes.c_ulong), ("total", ctypes.c_ulonglong),
                        ("avail", ctypes.c_ulonglong), ("a", ctypes.c_ulonglong), ("b", ctypes.c_ulonglong),
                        ("c", ctypes.c_ulonglong), ("d", ctypes.c_ulonglong), ("e", ctypes.c_ulonglong)]
        m = M()
        m.l = ctypes.sizeof(M)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
        return m.total / 2**30
    if sys.platform == "darwin":
        return int(subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True).stdout) / 2**30
    for line in open("/proc/meminfo"):
        if line.startswith("MemTotal"):
            return int(line.split()[1]) / 2**20
    return 0


def gpus():
    out = []
    if shutil.which("nvidia-smi"):
        r = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                           capture_output=True, text=True)
        for line in r.stdout.strip().splitlines():
            name, mem = [x.strip() for x in line.rsplit(",", 1)]
            out.append(("NVIDIA", name, float(mem) / 1024))
    elif sys.platform == "darwin" and platform.machine() == "arm64":
        out.append(("Apple", "Apple Silicon (mémoire unifiée)", ram_gb() * 0.7))
    elif sys.platform.startswith("win"):
        r = subprocess.run(["powershell", "-NoProfile", "-Command",
                            "Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }"],
                           capture_output=True, text=True)
        for n in r.stdout.strip().splitlines():
            if n.strip():
                out.append(("autre", n.strip(), 0.0))   # VRAM non fiable via WMI : AMD/Intel → mode CPU/Vulkan
    return out


def materiel(show=True):
    ram = ram_gb()
    g = gpus()
    vram = max((x[2] for x in g if x[0] in ("NVIDIA", "Apple")), default=0.0)
    free = shutil.disk_usage(Path.home()).free / 2**30
    if show:
        print(f"Système : {platform.system()} {platform.release()} ({platform.machine()})")
        print(f"Processeur : {os.cpu_count()} cœurs logiques")
        print(f"Mémoire vive : {ram:.1f} Go")
        for kind, name, mem in g or [("—", "aucune carte graphique exploitable détectée", 0)]:
            print(f"Carte graphique : {name}" + (f" — {mem:.1f} Go utilisables" if mem else ""))
        print(f"Disque libre (dossier personnel) : {free:.0f} Go")
        tier = "GPU" if vram >= 6 else "CPU"
        print(f"→ Profil : {tier}, budget modèle ≈ {budget(ram, vram):.0f} Go "
              f"({'carte graphique' if tier == 'GPU' else 'mémoire vive, plus lent'})")
    return ram, vram, free


def budget(ram, vram):
    return vram * 0.9 if vram >= 6 else max(0.0, ram * 0.6 - 2)


# --- catalogue (poids open source ; tailles = quantification Q4 d'Ollama, approximatives) -------
# (usage, nom, commande, mémoire Go, licence, remarque)
CAT = [
    ("chat", "Qwen3 4B", "ollama pull qwen3:4b", 3.5, "Apache-2.0", "très bon en français, petit PC"),
    ("chat", "Qwen3 8B", "ollama pull qwen3:8b", 6.5, "Apache-2.0", "le meilleur rapport qualité/poids"),
    ("chat", "Gemma 3 12B", "ollama pull gemma3:12b", 9.5, "Gemma (conditions Google)", "rédaction soignée, vision"),
    ("chat", "Qwen3 14B", "ollama pull qwen3:14b", 11, "Apache-2.0", ""),
    ("chat", "gpt-oss 20B", "ollama pull gpt-oss:20b", 14, "Apache-2.0", "raisonnement, outils"),
    ("chat", "Mistral Small 3.2 24B", "ollama pull mistral-small3.2", 16, "Apache-2.0", "excellent français (Mistral AI)"),
    ("chat", "Qwen3 30B-A3B (MoE)", "ollama pull qwen3:30b", 20, "Apache-2.0", "rapide malgré la taille"),
    ("chat", "Llama 3.2 3B", "ollama pull llama3.2:3b", 2.5, "Llama Community (non OSI)", "très petit PC"),
    ("code", "Qwen2.5-Coder 7B", "ollama pull qwen2.5-coder:7b", 5.5, "Apache-2.0", "Python, VBA, SQL"),
    ("code", "Qwen2.5-Coder 14B", "ollama pull qwen2.5-coder:14b", 10, "Apache-2.0", ""),
    ("raisonnement", "DeepSeek-R1 8B (distill)", "ollama pull deepseek-r1:8b", 6, "MIT", "calculs, logique, lent"),
    ("raisonnement", "DeepSeek-R1 14B (distill)", "ollama pull deepseek-r1:14b", 10, "MIT", ""),
    ("vision", "Qwen2.5-VL 7B", "ollama pull qwen2.5vl:7b", 7, "Apache-2.0", "lire captures, tableaux scannés"),
    ("vision", "Gemma 3 4B", "ollama pull gemma3:4b", 4, "Gemma (conditions Google)", "images + texte, léger"),
    ("embeddings", "nomic-embed-text", "ollama pull nomic-embed-text", 0.5, "Apache-2.0", "mémoire sémantique"),
    ("embeddings", "bge-m3", "ollama pull bge-m3", 1.5, "MIT", "multilingue, meilleur en français"),
    ("transcription", "Whisper large-v3-turbo (faster-whisper)", "pip install faster-whisper", 3, "MIT", "réunions, vocaux"),
    ("transcription", "Whisper small (faster-whisper)", "pip install faster-whisper", 1, "MIT", "PC modeste"),
    ("voix", "Chatterbox multilingue", "déjà dans afrikatoon (scripts/setup_env.sh)", 4, "MIT", "voix expressives, accent"),
    ("voix", "Piper (voix fr_FR)", "pip install piper-tts", 0.2, "GPL-3.0 (moteur) + licence de chaque voix", "très rapide, CPU"),
    ("image", "FLUX.1 [schnell] via ComfyUI", "ComfyUI portable + modèle FLUX.1-schnell", 12, "Apache-2.0", "GPU NVIDIA conseillé"),
    ("image", "SDXL via ComfyUI", "ComfyUI portable + sd_xl_base_1.0.safetensors", 8, "OpenRAIL++-M", ""),
    ("image", "Real-ESRGAN x4 (agrandissement)", "déjà dans afrikatoon (spandrel)", 2, "BSD-3", "CPU possible"),
    ("image", "rembg / BiRefNet (détourage)", "pip install rembg", 1, "MIT", "CPU"),
    ("video", "Wan 2.2 TI2V-5B via ComfyUI", "ComfyUI + Wan2.2-TI2V-5B", 12, "Apache-2.0", "≥ 12 Go de VRAM avec déchargement"),
    ("video", "Wan 2.2 I2V-A14B (Space HF, quota)", "déjà dans afrikatoon (--mock wan)", 0, "Apache-2.0", "dans le cloud HF, gratuit limité"),
]


def recommander(usage):
    ram, vram, _ = materiel(show=False)
    b = budget(ram, vram)
    gpu_only = {"image", "video"}
    print(f"Budget mémoire pour un modèle : ≈ {b:.0f} Go ({'GPU' if vram >= 6 else 'CPU'})\n")
    for u in sorted({c[0] for c in CAT}):
        if usage not in ("tout", u):
            continue
        rows = [c for c in CAT if c[0] == u]
        print(f"■ {u.upper()}")
        for _, name, cmd, mem, lic, note in rows:
            ok = mem <= b and (u not in gpu_only or vram >= mem or mem <= 2)
            flag = "✔" if ok else "✘ trop lourd"
            print(f"  {flag:12} {name:42} {mem:>5.1f} Go  {lic}")
            if ok:
                print(f"               → {cmd}" + (f"   ({note})" if note else ""))
        print()
    print("Préférer les licences Apache-2.0 / MIT pour un usage professionnel ; vérifier la dernière version sur "
          "ollama.com/library ou la fiche Hugging Face avant d'installer.")


# --- contrôle d'un fichier de modèle ------------------------------------------------------------
DANGER_MODULES = {"os", "posix", "nt", "subprocess", "sys", "builtins", "__builtin__", "socket", "shutil", "runpy",
                  "webbrowser", "requests", "urllib", "httplib", "http", "pty", "commands", "importlib", "ctypes",
                  "pickle", "marshal", "code", "pdb", "asyncio", "multiprocessing"}
DANGER_NAMES = {"eval", "exec", "compile", "open", "__import__", "getattr", "system", "popen", "apply"}
SAFE_PREFIX = ("torch", "collections", "numpy", "_codecs", "__builtin__.set", "builtins.set", "typing")


def pickle_globals(data: bytes):
    found = []
    stack = []
    try:
        for op, arg, _ in pickletools.genops(data):
            if op.name in ("SHORT_BINUNICODE", "BINUNICODE", "UNICODE", "STRING", "BINSTRING", "SHORT_BINSTRING"):
                stack.append(arg)
            elif op.name in ("GLOBAL", "INST"):
                found.append(tuple(str(arg).split(" ", 1)))
            elif op.name == "STACK_GLOBAL" and len(stack) >= 2:
                found.append((stack[-2], stack[-1]))
    except Exception as e:  # noqa: BLE001  — flux corrompu ou volontairement malformé
        found.append(("<illisible>", str(e)[:60]))
    return found


def judge(globs):
    bad = []
    for mod, name in globs:
        full = f"{mod}.{name}"
        if mod == "<illisible>":
            bad.append(f"flux pickle illisible ({name})")
        elif mod.split(".")[0] in DANGER_MODULES and not full.startswith(SAFE_PREFIX) or name in DANGER_NAMES:
            bad.append(full)
    return bad


def verifier(path: Path, expected):
    size = path.stat().st_size
    h = hashlib.sha256()
    with open(path, "rb") as f:
        head = f.read(16)
        f.seek(0)
        for b in iter(lambda: f.read(1 << 22), b""):
            h.update(b)
    digest = h.hexdigest()
    print(f"{path.name} — {size / 2**30:.2f} Go\nSHA-256 : {digest}")
    problems = []
    if expected:
        if expected.lower().strip() != digest:
            problems.append("EMPREINTE DIFFÉRENTE de celle publiée : fichier altéré ou incomplet")
        else:
            print("✔ empreinte conforme à la source officielle")
    if head[:4] == b"GGUF":
        ver = struct.unpack("<I", head[4:8])[0]
        print(f"Format GGUF v{ver} (llama.cpp / Ollama / LM Studio) : données pures, pas de code exécutable ✔")
    elif path.suffix == ".safetensors" or (len(head) >= 9 and head[8:9] == b"{"):
        with open(path, "rb") as f:
            n = struct.unpack("<Q", f.read(8))[0]
            if n > 100 * 2**20:
                problems.append("en-tête safetensors anormal")
            else:
                meta = json.loads(f.read(n))
                ntens = len([k for k in meta if k != "__metadata__"])
                print(f"Format safetensors : {ntens} tenseurs, pas de code exécutable ✔")
    elif path.suffix.lower() == ".onnx":
        print("Format ONNX : graphe de calcul, pas de pickle ✔ (vérifier tout de même la provenance)")
    elif zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as z:
            pk = [n for n in z.namelist() if n.endswith(".pkl") or n.endswith("/data.pkl")]
            print(f"Archive PyTorch (zip) : {len(pk)} flux pickle — analyse des imports…")
            for n in pk:
                bad = judge(pickle_globals(z.read(n)))
                problems += [f"{n} : importe {b}" for b in bad]
        if not problems:
            print("✔ aucun import dangereux trouvé. Préférer quand même la version .safetensors si elle existe, "
                  "et charger avec torch.load(..., weights_only=True).")
    elif head[:1] == b"\x80":
        print("Pickle brut (.pkl/.bin/.pt ancien) — analyse des imports…")
        bad = judge(pickle_globals(path.read_bytes()))
        problems += [f"importe {b}" for b in bad]
        if not bad:
            print("✔ aucun import dangereux trouvé (le format reste risqué : préférer safetensors/GGUF).")
    else:
        print("Format non reconnu : ne pas charger sans connaître la source.")
    for p in problems:
        print("✘", p)
    if problems:
        print("NE PAS CHARGER CE MODÈLE. Le supprimer et le retélécharger depuis la page officielle.")
        sys.exit(1)


# --- Ollama -------------------------------------------------------------------------------------
def ollama():
    host = os.getenv("OLLAMA_HOST", "")
    origins = os.getenv("OLLAMA_ORIGINS", "")
    issues = []
    if host and not host.split("//")[-1].startswith(("127.0.0.1", "localhost", "[::1]")):
        issues.append(f"OLLAMA_HOST={host} : Ollama écoute sur le réseau. Supprimer la variable (écoute locale par défaut).")
    if origins.strip() == "*":
        issues.append("OLLAMA_ORIGINS=* : n'importe quel site web ouvert dans le navigateur peut piloter Ollama.")
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=3) as r:
            models = json.loads(r.read()).get("models", [])
        print(f"Ollama répond en local ✔ — {len(models)} modèle(s) :")
        for m in models:
            print(f"  {m['name']:35} {m.get('size', 0) / 2**30:5.1f} Go  {m.get('details', {}).get('quantization_level', '')}")
    except OSError:
        print("Ollama ne répond pas sur 127.0.0.1:11434 (pas installé ou pas lancé).")
        models = None
    # écoute sur une adresse réseau de la machine ?
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        lan = s.getsockname()[0]
        s.close()
        if not lan.startswith("127.") and socket.create_connection((lan, 11434), timeout=1):
            issues.append(f"Ollama est joignable depuis le réseau ({lan}:11434) : tout appareil du Wi-Fi peut l'utiliser.")
    except OSError:
        pass
    for i in issues:
        print("⚠ ", i)
    if not issues and models is not None:
        print("Sécurité : écoute locale uniquement ✔")
    sys.exit(1 if issues else 0)


def main():
    ap = argparse.ArgumentParser(description="Modèles d'IA open source en local")
    ap.add_argument("action", choices=["materiel", "recommander", "verifier", "ollama"])
    ap.add_argument("fichier", nargs="?", type=Path)
    ap.add_argument("--usage", default="tout")
    ap.add_argument("--sha256")
    a = ap.parse_args()
    if a.action == "materiel":
        materiel()
    elif a.action == "recommander":
        recommander(a.usage)
    elif a.action == "verifier":
        if not a.fichier or not a.fichier.exists():
            sys.exit("Fichier de modèle introuvable")
        verifier(a.fichier, a.sha256)
    else:
        ollama()


if __name__ == "__main__":
    main()
