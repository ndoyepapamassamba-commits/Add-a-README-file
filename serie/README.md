# KÉBA — moteur de série d'animation muette

Série burlesque sans paroles dans un quartier inspiré de Dakar : **Kéba** veut toujours aider, chaque geste déclenche
une catastrophe plus grande, et ses victimes (**Tonton Bara**, **Tata Coumba**, **Gaïndé** le bélier) le poursuivent.

## Ce que fait le moteur

1. **Illustrations PNG** (une seule fois par personnage, décor ou objet) : FLUX.2-klein-4B (Apache-2.0) via
   stable-diffusion.cpp (MIT) sur les machines gratuites de GitHub (`.github/workflows/atelier-images.yml`),
   détourées (`keba/detourage.py`), avec leur provenance (modèle, licence, prompt, graine).
2. **Expressions** : la tête recadrée est retouchée avec la planche en référence, égalisée en couleur et recollée
   (`atelier/expressions.py`).
3. **Pantins** (`keba/pantin.py`) : chaque illustration est découpée en maillage, posée sur un squelette (MediaPipe
   pour les humains, silhouette pour le bélier), en pièces cousues aux articulations. Modèles : humain, robe,
   quadrupède ; os « basque » pour les tabliers et maillots longs.
4. **Jeu d'acteur** (`keba/acteur.py`) : marche et course déduites de la vitesse, respiration, clignements, gestes.
5. **Physique** (`keba/simulation.py`, pymunk) : les dominos sont simulés ; chaque choc devient un son dosé.
6. **Mise en scène** (`keba/mise_en_scene.py`, `keba/pilote.py`) : ordres datés, caméra sur ressort bornée au décor.
7. **Son** (`keba/son.py`) : 14 bruitages synthétisés, musique composée selon les humeurs (FluidSynth + FluidR3_GM).
8. **Rendu** (`keba/rendu.py`) : 1080×1920 à 60 i/s, en parallèle sur tous les cœurs, puis contrôles automatiques
   (`keba/controle.py`) et fiche TikTok.

## Utilisation (depuis `serie/`)

```bash
python3 -m keba.episode --sortie sorties/ep0001 --apercu
```

```bash
python3 -m keba.episode --sortie sorties/ep0001
```

```bash
python3 -m pytest -q
```

Dépendances : `pip install skia-python pymunk numpy scipy mido pillow` ; outils système : `ffmpeg`, `fluidsynth`,
`fluid-soundfont-gm`, `libegl1`.

## Nouvelles illustrations

```bash
python3 -m atelier.taches
```

puis pousser `serie/atelier/taches.json` : l'atelier GitHub fabrique les images ; les ranger avec
`python3 serie/outils/recuperer_atelier.py`.
