# Guide d'écriture — banque de sketchs @ la chaîne (dessin animé 3D, Abidjan)

Tu écris pour une chaîne TikTok de 620 000 abonnés : sketchs comiques TRÈS COURTS, dessin animé 3D style Pixar,
personnages ivoiriens, à Abidjan. Chaque sketch devient UNE image (générée par IA) puis UN clip vidéo animé de 10 à 12 s
(Grok Imagine) qui joue les répliques avec l'accent ivoirien. Le public doit HURLER DE RIRE et rejouer la vidéo.

## LA SEULE CHOSE QUI COMPTE : LE CHOC HUMORISTIQUE

La chute doit être un coup de massue : un retournement que personne ne voit venir, féroce, compris en une seconde,
qui touche si possible DEUX cibles d'un coup, et qui donne envie de taguer quelqu'un. Pas de jeu de mots faible, pas de
morale, pas d'explication après la chute.

Barre à dépasser (sketchs qui ont le mieux marché ou le mieux battu la référence au jury) :
- RÉFÉRENCE, 2,4 millions de vues : « Papa, qui m'a donné mon intelligence ? » / « Ça doit être ta mère. Moi, j'ai encore la mienne. »
- « Ma sœur, on t'a renvoyée de la tontine des femmes mariées dêh ! » / « Mais je suis mariée ! » / « Oui, mais avec le mari de la trésorière-là. » / (la trésorière) « Rembourse mes cotisations et le monsieur dêh ! »
- « Pourquoi tu filmes ma colère-là ?! » / « Papa dit qu'il va envoyer ça à ton papa dêh. » / « Pour faire quoi ? » / « Service après-vente. Il dit ton produit-là est gâté. »
- « Je rentre chez ma mère dêh ! » / « Ya fohi. Tiens deux mille pour le woro-woro. » / « Mais c'est cinq cents seulement ! » / « Prends tes sœurs avec toi. »
- « Qui a mangé le poulet que j'ai caché dans le congélateur-là ?! » / « Madame, je jure c'est pas moi dêh. Patron et moi on était à Bassam toute la journée. »
- « Papa, mon fiancé a une Mercedes dêh ! » / « Le papier est à son nom ? » / « Non, c'est au nom de son oncle. » / « L'oncle-là est libre ? On change de cible. »
- « Tantie, pourquoi tu ajoutes piment ? J'ai pas demandé dêh ! » / « Ton patron-là arrive. Faut que tes larmes aient une explication. »
- « Papa ! Il y a la viande dans ma sauce dêh ! » / « Mange vite avant de te réveiller. »

Méthode : écris d'abord pour toi-même au moins DEUX fois plus d'idées que demandé, puis garde seulement les plus
explosives. Une idée « sympa » ou « classique » est à jeter. Varie les situations, les personnages, les lieux, les âges.

## RÈGLES D'ÉCRITURE

- Dialogue en FRANÇAIS POPULAIRE D'ABIDJAN, un marqueur ivoirien dans presque chaque réplique : « dêh », « -là »
  (« ton copain-là »), « Tonton », « Tantie », « mon vieux », « vieux père », « ya fohi », « gbê », « on dit quoi »,
  « mon petit », « ma sœur », syntaxe ivoirienne (« c'est moi tu as choisi », « il a pas l'argent »). Réalités d'Abidjan
  bienvenues : garba, attiéké, alloco, maquis, gbaka, woro-woro, CIE, Sodeci, tontine, mobile money, délestage, fin du mois.
- On ouvre EN PLEIN CONFLIT : 1re réplique = question, accusation ou révélation. Jamais d'exposition.
- 2 à 4 répliques, 32 mots AU TOTAL au maximum. Aucune réplique de moins de 3 mots (une réplique trop courte n'est pas
  animée par le moteur vidéo).
- 2 personnages (3 au plus). Un seul lieu. PERSONNE NE MARCHE : tout le monde reste à sa place du début à la fin.
- Humour familial et monétisable : pas de sexe ni de nudité, pas d'arme, pas de mort ni de funérailles, pas de maladie
  grave, pas de violence physique, pas de politique, pas de religion (ni prière, ni pasteur, ni imam), pas de moquerie
  d'ethnie, de handicap ou de couleur de peau, pas de marque commerciale.
- Titre : court, en français, il nomme la SITUATION, JAMAIS la chute (le titre s'affiche pendant tout le sketch).
- Interdit de reprendre une blague du catalogue (fichier catalogue.txt) ni une blague connue d'internet : ni la même
  chute, ni la même situation de départ.

## RÈGLES DE MISE EN SCÈNE (apprises aux tests : elles évitent les défauts d'animation)

- Celui qui parle garde le visage tourné de trois quarts vers la caméra ; on doit voir ses lèvres bouger.
- Un personnage qui parle ne boit pas, ne mange pas, ne cache pas sa bouche.
- Un objet tenu est UN SEUL objet (« ONE single wooden ladle ») ; si les deux mains sont prises, aucun autre geste.
- Pas de geste compliqué : petits gestes crédibles (montrer du doigt, hausser les épaules, mains sur les hanches,
  tourner la tête, froncer les sourcils, figer un sourire).
- Pas d'objet qu'on met ou qu'on enlève pendant la scène (perruque, lunettes, vêtement) : ça fait des sauts d'image.
- Le personnage visé par le zoom final est au PREMIER PLAN (un zoom vers le fond dédouble les personnages).
- La réaction finale et le zoom ne commencent qu'APRÈS la dernière réplique.

## TENUES : COULEURS RÉSERVÉES (aucun personnage ne doit ressembler à un autre de toute la chaîne)

Ta fiche te donne une liste de paires de couleurs à TOI SEUL (ex. « teal-and-coral »). Le vêtement principal de CHAQUE
personnage s'écrit exactement « <paire> <vêtement> » (ex. « teal-and-coral boubou », « mint-and-rust tracksuit ») et
n'utilise que tes paires. Jamais deux fois la même combinaison paire + vêtement. Aucun autre vêtement coloré dans la
description (les accessoires sans couleur sont permis : lunettes, montre, sac, foulard, bijoux, téléphone…).

## FORMAT (JSON, champs en anglais pour l'image et l'animation, dialogue en français)

Un tableau JSON d'objets. Exemple réel (sketch validé au test 10 ; ses couleurs ne sont PAS les tiennes, n'utilise que tes paires) :

```json
{"id": "B000-01",
 "titre": "La tontine des femmes mariées",
 "lieu": "courtyard of a house in Treichville, Abidjan, plastic chairs in a circle, a small table with a metal cash box and a notebook, afternoon",
 "persos": [
  {"nom": "the tontine president with the notebook", "desc": "tontine president in her 50s, ochre-and-black kaba, big round glasses, holding a notebook", "pose": "standing on the left, holding the notebook, very serious"},
  {"nom": "the confused member", "desc": "member in her 30s, sky-blue jumpsuit with a white belt, a small purse", "pose": "standing in the middle, hands open, confused"},
  {"nom": "the treasurer with the cash box", "desc": "treasurer in her 40s, emerald-green kaftan with gold trim, hands on the metal cash box", "pose": "sitting at the small table on the right, both hands on the cash box, glaring"}],
 "dialogue": [[0, "Ma sœur, on t'a renvoyée de la tontine des femmes mariées dêh !"], [1, "Mais je suis mariée !"], [0, "Oui, mais avec le mari de la trésorière-là."], [2, "Rembourse mes cotisations et le monsieur dêh !"]],
 "jeu": "Nobody walks; all three stay in their places for the whole video. The president announces it very seriously. The member protests, hands open. The president answers calmly, pointing her pen at the treasurer. The treasurer, seated, slams one hand on the cash box and shouts, her face clearly visible.",
 "chute": "The member freezes, her mouth open. The camera slowly pushes in to a close-up of the member's busted face looking into the camera.",
 "fin": 1,
 "emoji": "choc",
 "cles": ["tontine", "trésorière", "monsieur"],
 "gag_legende": "LE MARI QUAND IL VA RENTRER CE SOIR :",
 "mecanisme": "révélation par un tiers + relance de la victime cachée"}
```

Champs :
- `id` : « <ton préfixe>-<numéro sur 2 chiffres> » (ex. B017-05).
- `lieu` : lieu précis d'Abidjan (prends tes quartiers), décor, moment de la journée, objets utiles à la chute.
- `persos` : `nom` = étiquette anglaise courte et unique dans le sketch (« the stingy husband ») ; `desc` = âge
  (« in his 40s », « around 8 »), tenue avec TA paire de couleurs, un trait physique, l'objet tenu ; `pose` = position
  de départ (« standing on the left… »). Le sexe et l'âge doivent être évidents (« mother », « boy around 9 »…).
- `dialogue` : liste de [indice du personnage, réplique en français].
- `jeu` : mise en scène en anglais, commence par « Nobody walks; … stay in their places for the whole video. », puis
  ce que fait chacun pendant SA réplique ; termine par la dernière réplique dite visage visible.
- `chute` : la réaction APRÈS la dernière réplique, puis « The camera slowly pushes in to a close-up of <nom>'s <émotion>
  face looking into the camera. »
- `fin` : indice du personnage du gros plan final (au premier plan).
- `emoji` : « choc » ou « mdr ».
- `cles` : 2 ou 3 mots-clés tirés du dialogue (affichés en jaune dans les sous-titres).
- `gag_legende` : légende façon mème, MAJUSCULES, 4 à 8 mots, qui finit par « : » (affichée sur un gag 3D après la
  chute : « PAPA EN CHERCHANT SA CEINTURE : », « LE QUARTIER APRÈS CETTE RÉPONSE : »).
- `mecanisme` : en quelques mots, le ressort comique.
