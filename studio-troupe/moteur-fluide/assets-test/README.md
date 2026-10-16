# Personnages de test du moteur

`modou-test/` contient MODOU **dessiné en code** (`src/outils/personnage-test/modou.ts`), en attendant les planches
de la troupe. Il appartient au projet (aucune ressource tierce) et peut être versé au dépôt.

| Fichier | Contenu |
|---|---|
| `modou-test.png` | dessin 720×1440, fond transparent, de face, pose A (bras écartés du corps) |
| `modou-test.parties.png` | carte des parties : canal rouge = rang de l'os + 1 dans `rig.json` → `parties.os` |
| `rig.json` | description source `moteur-fluide/rig-source@1` : articulations, ancrages du visage, pieds, carte |

Le maillage, les poids et les groupes de dessin ne sont pas stockés : `chargerRig()` (`src/rig/charger.ts`) les
reconstruit en un peu plus d'une seconde, de façon déterministe.

## Commandes

```bash
# Redessiner le personnage et réécrire rig.json (sortie identique à l'octet près)
npx tsx src/outils/personnage-test/generer.ts

# Planche de contrôle : maillage, parties, bandes de poids, poses de test (CoR et LBS)
# → studio-troupe/sorties/rig-apercu/<id>.png (jamais versé)
npx tsx src/outils/personnage-test/apercu.ts assets-test/modou-test/rig.json

# Détourer une image générée sur fond uni (clé de couleur, ombre au sol retirée)
npx tsx src/outils/personnage-test/detourer.ts <image.png> <sortie.png> [--reference <alpha.png>]
```

## Préparer un personnage dessiné (planche de l'utilisateur ou image générée)

1. Image détourée en PNG (alpha), de face, **bras écartés du corps** (un vide net entre bras et torse) et jambes
   séparées. Les personnages privés vont dans `studio-troupe/.private/personnages/<id>/`, jamais dans le dépôt.
2. `rig.json` au format `moteur-fluide/rig-source@1` : `articulations` (bassin, taille, base du cou, base et sommet
   de la tête, épaule, coude, poignet, bout de la main, hanche, genou, cheville, bout du pied, côtés G et D du
   personnage : de face, son côté gauche est à droite de l'image), `pieds`, `visage` (yeux, bouche, sourcils, menton).
3. Facultatif : `parties` (carte des parties, exacte) ou `zones` (polygones qui forcent l'os d'une région, par
   exemple les manches sur `brasG` / `brasD` quand l'étiquetage automatique les coupe).
4. Vérifier la planche de contrôle : bandes de pli aux articulations, aucune déchirure dans les poses de test.
