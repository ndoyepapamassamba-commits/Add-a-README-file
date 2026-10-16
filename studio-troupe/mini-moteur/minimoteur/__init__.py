"""Mini-moteur vidéo de la troupe (@comedyvideos_100).

Recréation MINIATURE, entraînable sur CPU, de la recette des générateurs vidéo
actuels (Wan 2.x, HunyuanVideo ; Veo 3 / Kling pour ce qui est public) :

    troupe_data   -> clips procéduraux de marionnettes + légendes
    text_encoder  -> tokenizer + petit Transformer (à la place de umT5 gelé)
    vae           -> VAE vidéo 3D causal (4x temps, 4x4 espace, 8 canaux)
    dit           -> Transformer de diffusion (patchs 1x2x2, RoPE 3D, adaLN, cross-attention, I2V)
    flow          -> flow matching (vitesse), t logit-normal, shift, Euler, CFG
    train / generate / evaluate -> lignes de commande
"""

__version__ = "0.1.0"
