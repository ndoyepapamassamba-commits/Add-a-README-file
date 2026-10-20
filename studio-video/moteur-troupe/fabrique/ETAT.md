# État général de la production

18/10/2026, après la remarque « recadre ta vue, il y a beaucoup d'éléments qui t'échappent ».

**Objectif** : 10 000 vidéos Africa Toon Troll (format TikTok, Ladjagaï). Elles doivent être drôles, fluides et cohérentes, avec une troupe qu'on fait parler et bouger.

**Règle tirée de cette remarque** : ne plus perfectionner un détail isolé. On avance tous les éléments jusqu'à une **première vidéo complète**, puis on corrige ce que la vidéo révèle.

## 1. Tous les éléments d'une vidéo

Légende : ✅ fait, 🟡 en partie, ❌ pas commencé.

| # | Élément | État | Ce qui manque | Action suivante |
|---|---|---|---|---|
| 1 | Histoire de l'univers (bible) | 🟡 | relations de la bible reprises dans `univers.py` (18) ; épisode 1 écrit (3 sketchs) | 7 sketchs de plus pour la saison 1 |
| 2 | Répliques et humour | ✅ | `TON.md` (analyse du ton) + `ton.py` (contrôle chiffré) ; les 3 sketchs passent JEV et battent leur version précédente | brancher `ton.py` dans `histoires.controle` |
| 3 | Personnages : planches | 🟡 | Horde anonyme n'a rien livré (travaux expirés, 404 puis 403) ; ZeroGPU à 0 s ; Pollinations anonyme flou | **voie retenue le 18/10 par l'utilisateur : planches actuelles de la troupe, animées dans Blender** ; nouvelles planches dès qu'un jeton gratuit (Kaggle ou Pollinations) est ajouté |
| 4 | Découpe et mesures | ✅ | — | vues orientées, miroirs, coiffes par SAM, contrôles |
| 5 | Décors vides | 🟡 | décor de la cour d'essai seulement | le lot génère d'abord 6 lieux clés |
| 6 | Objets séparés | 🟡 | la chaise d'essai a été censurée par le service | le lot regénère, avec 10 objets clés en priorité |
| 7 | Compositeur de scène | 🟡 | lumière prise dans le décor, personnages face à face, cadrage, raccord de style, résolution | détaillé au § 3 |
| 8 | Pont vers le moteur d'animation | ❌ | scène composée vers le format attendu par le tournage (squelettes, visages, masques, plaque exacte) | `vers_moteur.py`, à partir des mesures de la découpe |
| 9 | Visage : bouche, émotions, paupières, tête | ✅ / 🟡 | les poses de tête LivePortrait ne sont pas encore dans la bibliothèque du tournage | ajouter les poses à la bibliothèque, piloter le lacet et le tangage |
| 10 | Regard vers l'interlocuteur | 🟡 | la porte D bis existe, mais Mamie vers Baye ne passait pas sur les anciennes planches | sur les nouvelles planches, choisir la vue tournée vers l'interlocuteur, puis la tête LivePortrait |
| 11 | Corps : gestes, assis, déplacements | 🟡 | squelette 2D existant ; marche absente | planches de marche (4 poses), déplacement de A à B, s'asseoir sur un objet du décor |
| 12 | Voix | 🟡 | timbre corrigé ; seuls 7 personnages ont une voix | choisir une voix de référence par personnage nouveau (corpus OpenSLR 57, Afrique de l'Ouest), par âge et par genre |
| 13 | Sons : ambiance, musique, rires | ✅ | ambiances des nouveaux lieux (école, marché, gbaka…) | banque d'ambiances par lieu |
| 14 | Vie du fond : feuillage, oiseaux, figurants | 🟡 | oiseaux pas assez fluides, maquis sans assez de figurants (remarques utilisateur) | figurants tirés de la distribution elle-même, en petit, à l'arrière-plan |
| 15 | Cadrage et montage | 🟡 | cadreur existant, conçu pour les anciennes images | plans moyens et serrés en 9:16, champ-contrechamp, poussée sur la chute |
| 16 | Contrôles automatiques et JEV final | ✅ | — | portes du film, JEV au contrôle final seulement |
| 17 | Vitesse | 🟡 | génération des planches lente (file anonyme) | les planches se font une seule fois ; ensuite une vidéo prend quelques minutes |

## 2. Chemin le plus court vers la première vidéo de la nouvelle troupe

1. **Sketch** : 30–45 s dans la cour, avec Mamie Nounou, Baye et Petit Mamadou, une seule chute. Il peut être écrit tout de suite, sans attendre les planches.
2. **Voix** du sketch : les 3 personnages ont déjà une voix, avec le timbre corrigé.
3. **Planches** : `mamadou-tour`, `nounou-tour`, `baye-tour` et leurs vues assises, plus `decor/cour-apres_midi` et `objet/chaise`. Elles sont en tête de file.
4. **Composition** : chacun tourné vers celui à qui il parle, Baye assis sur la chaise posée à part, cadrage en plan moyen.
5. **Pont vers le moteur**, puis **tournage** : bouche, regard, paupières, tête, gestes, vie du fond.
6. **Montage et son**, puis **contrôles** : portes automatiques, puis JEV au contrôle final.

## 3. Défauts relevés sur la première image composée (Baye et Koffi dans la cour)

| Défaut | Correction |
|---|---|
| 40 % de ciel vide, personnages dans la moitié basse | cadrage 9:16 en plan moyen ; le décor sert de toile plus grande que le cadre |
| tous deux de face, plantés côte à côte | vues de trois quarts tournées l'une vers l'autre, profondeurs décalées |
| ombres vers la droite alors que le soleil du décor vient de l'autre côté | direction de la lumière mesurée sur le décor |
| effet « autocollant » : trop net et trop propre | flou assorti au décor, liseré de lumière, ombre de contact, grain commun |
| résolution trop juste pour les plans serrés | décors et personnages agrandis (Swin2SR, Apache-2.0, déjà installé) |
| ~~bonnet de Baye troué~~ | corrigé : coiffe complétée par SAM 2.1, plus fond contrasté à la génération |

## 4. Voie Blender (18/10/2026, choix de l'utilisateur : « planches actuelles + Blender »)

- `vers_blender.py` : chaque sketch contrôlé devient une histoire du film Blender (`studio-video/blender/film`) : acteurs = planches peintes de la troupe découpées et montées sur squelette, visages LivePortrait, décor peint sur son relief, objets et animaux 3D, gros plan de réaction sur le témoin de la chute.
- `blender/film/plan.py` : voix égalisées par `timbre.py` (correction « voix trop aiguës » reportée).
- Refusé par l'utilisateur : personnages construits en formes simples (« rendu jouet ») ; retiré du dépôt.
- REA sur les outils à brancher (preuves) : `three-vrm-springbone` (Verlet, mouvement secondaire, `ev_7e6ed480…`), `@met4citizen/headaudio` (MFCC → visèmes, `ev_2c3f30c9…`), `speech-to-lipsync` (MFCC, `ev_22aba63f…`).
