# Brouillons du chantier Blender (mis en veille le 18/10/2026)

Scripts écrits par les agents avant l'arrêt demandé par le propriétaire. Ils sont **sauvegardés tels quels** : ils
n'ont été ni relus ni testés ensemble, et plusieurs contiennent des chemins absolus vers le scratchpad de la session
du 18/10. Ne pas les lancer sans les relire. Aucune image, aucun extrait de la vidéo de référence : seulement du code.

| Dossier | Origine | Contenu |
|---|---|---|
| `rea/` | piste « REA outils Blender » (note 21, terminée) | sonde des opérateurs, POC de découpe en pièces + poids par chaleur, atlas de bouches, angles RTMW → os, essais Workbench et Images as Planes |
| `analyse_041701/` | analyse du clip 041701 (arrêtée en cours) | mesures de la bande de scène, suivi RTMW, silhouettes, ouverture des bouches, détourage ISNet/BiRefNet |
| `vitesse/` | étude de vitesse (arrêtée en cours) | sondes Workbench/EEVEE sous Xvfb, essai Vulkan lavapipe, harnais de banc |
| `workflows/` | plans d'orchestration | les deux scripts de workflow, déjà modifiés pour que la reconstitution utilise la route rapide |

La scène de banc partagée, `../vitesse/scene_banc.py`, était presque finie au moment de l'arrêt : elle compile, mais
n'a pas été validée. L'état complet et la marche à suivre pour reprendre sont dans
`../../moteur-fluide/ETAT-VEILLE.md`, section « Chantier Blender ».
