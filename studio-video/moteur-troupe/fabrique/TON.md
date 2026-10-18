# Le ton de l'humour de la troupe

18/10/2026, demande « analyse bien le ton de l'humour en écrivant des sketchs ».

**Sources**
- La veille « Style comique Afrikatoon Ladjagay Gbeze », appelée **[V]** :
  - 10 sketchs Afrikatoon et 4 épisodes de Ladjagaï ;
  - les TikTok de l'utilisateur, mesurés avec le même code ;
  - des études sur le timing comique.
- La bible comique de la troupe, appelée **[B]**, et ses 18 relations entre les personnages de l'univers.

Le contrôle `ton.py` vérifie chaque règle chiffrée, et JEV fait le contrôle final.

## 1. D'où vient le rire chez Afrikatoon et Ladjagaï

1. **Une seule réplique retourne le sens, puis plus rien ne bouge [V].** La chute dure 1,14 à 1,24 s. Elle est suivie d'un gros plan de réaction immobile de 2,2 à 3,4 s, et jusqu'à 4,4 s chez Afrikatoon. Le rire vient de cette compression, pas de la quantité d'animation.

2. **La chute est verbale, et le dessin rend la situation lisible [V].** Les mécaniques qui portent :
   - la prise au pied de la lettre : « la mort m'a bipé » ;
   - la logique qui se contredit : venir au bureau dire qu'on ne peut pas venir ;
   - l'ironie portée par le décor : la façade « PRISON » ;
   - la croyance poussée au bout ;
   - chez Ladjagaï, la mauvaise foi commerciale, la règle absurde inventée sur-le-champ, la vantardise suivie d'une leçon au cadet, le défi immobile.

3. **Le quotidien d'Abidjan [V].** Les thèmes : argent, école, santé, couple, transport, maquis. Les titres les plus vus suivent le modèle « LE/LA + NOM » : LA TRESSE (2,9 M de vues).

4. **Des duos récurrents [V].** Depuis 2026, les mini-séries d'Afrikatoon bâties sur des duos font 9,5 à 14 k vues médianes, contre 3,7 k pour les blagues isolées. Le public revient pour des personnages qu'il reconnaît.

5. **Le registre : autodérision et ironie [V].** Il est servi en français ivoirien populaire et compréhensible : « là », « hein », « dêh », « Dieu merci », « une barre ». Le débit est rapide : 6,3 à 6,7 syllabes par seconde.

6. **Trois pièges à éviter [V] :**
   - l'animalisation des personnes noires par l'IA ;
   - la caricature des corps ;
   - la vulgarité, qui fait perdre des abonnés.

## 2. Ce qui manquait aux premiers sketchs de la saison 1

`ton.py` a relevé ces défauts sur la version écrite à la main.

| Défaut | Bulletin | Télécommande | Ordonnance |
|---|---|---|---|
| Chute trop longue (≤ 8 mots et ≤ 9 syllabes) | 11 mots, 19 syllabes | — | 11 syllabes |
| Pas de rappel de l'accroche dans la chute | ✗ | ✗ | ✗ |
| Pas de témoin figé après la chute | ✗ | ✗ | ✗ |
| Aucune marque du parler ivoirien | ✗ | ✗ | ✗ |
| **« Maman » et « Papa » dans la bouche de Petit Mamadou**, qui vit chez ses grands-parents (bible : « Mamie », « Papi ») | ✗ | ✗ | ✗ |
| Sketch trop court (12 à 22 s) | — | 7,7 s | 8,4 s |

**La cause de fond :** le sketch avait été écrit sans les **relations de la bible** :
- Baye cache son argent, et Nounou le trouve toujours ;
- Mamadou fait chanter Papi avec ses cachettes ;
- Nounou est la reine du marchandage.

Ce sont ces dynamiques qui font les duos récurrents.

## 3. La grille appliquée à chaque sketch

| Règle | Valeur | Source |
|---|---|---|
| Accroche | Un conflit dès la 1re réplique : question piège ou accusation (« ? » ou « ! ») | [B] |
| Chute | Une seule, en **dernière** réplique ; rien après | [V] [B] |
| Longueur de la chute | 8 mots et 9 syllabes au plus (34 à 37 images à 30 i/s) | [V] |
| Rappel | La chute reprend un mot de l'accroche, retourné contre quelqu'un | [B] |
| Réaction | Un **témoin**, pas l'auteur de la chute, se fige en gros plan 2,2 à 4,5 s ; le tournage tient cette durée (`voix.py`) | [V] |
| Durée | 12 à 22 s ; 4 à 12 répliques ; voix au débit mesuré de chaque personnage | [V] |
| Mécanique | Déclarée, parmi les 12 mécaniques des références | [V] [B] |
| Ressort | La chute ou la réaction porte le défaut d'un personnage (pas de blague hors personnage) | [B] |
| Adresse | Les vocatifs suivent la famille (`univers.ADRESSE`) | [R] |
| Langue | 2 à 4 marques ivoiriennes, jamais forcées ; pas de wolof ni de mot cru | [B] |
| Pièges | Rien sur le corps, un animal comparé à une personne, une ethnie, une religion | [V] |

## 4. Les trois sketchs réécrits (`histoires/saison1-ep01.json`)

| Sketch | Duo | Mécanique | Chute (témoin figé) |
|---|---|---|---|
| **LE BULLETIN** | Nounou ↔ Baye, devant Mamadou | Vantardise contredite : Baye donne la leçon (« j'étais toujours premier ») | « Premier à cacher son bulletin. » (Baye figé, Mamadou tourne lentement la tête vers lui) |
| **LA CACHETTE** | Mamadou ↔ Papi, puis Nounou | Contre-pied : Mamadou fait payer son silence en marchandant comme sa grand-mère (« une barre pour la bouche, deux pour les yeux ») | « Moi, j'ai tout vu ce matin. » (Baye figé ; Mamadou range ses billets très lentement) |
| **L'ORDONNANCE** | Nounou ↔ Baye, puis Mamadou | Prise au pied de la lettre : « plus de sucre », donc Baye en remet ; l'enfant retourne aussitôt la logique | « Docteur a dit : plus de bonbons ! » (Nounou figée, le sucre coule encore) |

## 5. Contrôle final par JEV

Exigence : décision > 0,5 sur chaque question, sans marge. Chaque nouveau sketch a aussi affronté en duel sa version précédente, dans les deux ordres de présentation pour annuler le biais de position.

| Sketch | Drôle (/4) | Chute | Ivoirien | Clair | Méchant (< 0,5) | Duel contre l'ancienne version |
|---|---|---|---|---|---|---|
| Le bulletin | 2,23 / 2,24 | 0,91 / 0,90 | 0,65 / 0,64 | 0,86 | 0,09 | 0,53 / 0,535 (gagné) |
| La cachette | 1,86 / 1,83 | 0,77 / 0,76 | 0,73 / 0,70 | 0,63 / 0,64 | 0,17 / 0,13 | 0,795 (gagné) |
| L'ordonnance | 2,16 / 2,22 | 0,76 / 0,78 | 0,70 / 0,71 | 0,73 / 0,74 | 0,11 / 0,12 | 0,57 / 0,585 (gagné) |

Les anciennes versions obtenaient :
- **drôle** : 2,08, 1,67 et 1,95 ;
- **ivoirien** : 0,51, 0,38 et 0,53. La télécommande échouait donc à la porte « ivoirien ».

**Les deux refus de JEV pendant l'écriture :**
- **L'ordonnance** a d'abord perdu son duel (0,40), car elle livrait le malentendu trop tôt et privait l'enfant de sa réplique. Elle a été reconstruite autour de l'escalade vers Petit Mamadou.
- **La cachette** a d'abord obtenu 0,48 et 0,50 en « ivoirien ». La variante gardée, avec « dêh », « sous le lit là » et « on se connaît pas », obtient 0,73 et 0,70.
