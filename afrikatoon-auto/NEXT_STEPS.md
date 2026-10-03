# Reprise — prochaine étape (à lire par Claude en début de session)

État au 3 octobre 2026 :
- Moteur `photo` opérationnel : personnages réalistes de l'utilisateur dans `assets/characters/`
  (KOFFI, MAMAN_NOUNOU, COUMBA, PETIT_MAMADOU, TANTIE_AWA — 5 expressions chacun), décors provisoires
  dans `assets/backgrounds/`. Démo livrée : « La sauce de belle-maman ».
- L'utilisateur REFUSE les images figées : il veut de vraies animations, meilleures que ses clips Grok.
- Réseau de l'environnement : accès « Complet ». `HF_TOKEN` (jeton HuggingFace « Read ») ajouté
  dans les variables d'environnement.
- Chatterbox (voix FR gratuites, MIT) fonctionne sur CPU (~40-80 s par réplique) ; installé par
  `scripts/setup_env.sh`. L'utilisateur doit valider le rendu des voix.

À faire maintenant :
1. Vérifier `echo ${#HF_TOKEN}` (ne jamais afficher le jeton).
2. Animer une image composée (personnage de `assets/characters/` posé sur un décor) avec le Space
   HuggingFace ZeroGPU `zerogpu-aoti/wan2-2-fp8da-aoti-faster` (endpoint `/generate_video`, paramètres
   input_image, prompt, steps=6, duration_seconds≈3.5-5) via `gradio_client` + `HF_TOKEN`.
   Mesurer le temps et le quota consommé par clip.
3. Si ça marche : module `afrikatoon/wananim.py` (une image composée par scène → clip animé), voix
   Chatterbox par réplique, synchronisation labiale (chercher un Space ZeroGPU de lip-sync audio→vidéo
   sous licence commerciale, ex. LatentSync), montage existant (`montage.assemble`).
4. Produire la vidéo « La sauce de belle-maman » en vraie animation et l'afficher à l'utilisateur.
