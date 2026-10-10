# Designs premium, sites réels et logo

## Avant chaque livrable
Une demande qui réclame un fichier (Excel, Word, PowerPoint, PDF, mail, site, application) ouvre la galerie **avant tout appel au modèle**. Elle s'ouvre aussi si le modèle écrit lui-même un fichier Office en Python ou en JavaScript.

## Sources de design
| Source | Ce qui est repris | Comment |
|---|---|---|
| 14 designs intégrés | palette, police | jetons du thème |
| Image trouvée sur Internet | mise en page complète, palette, police | lecture par un modèle vision |
| **Site réel (URL)** | couleurs **exactes**, polices, arrondis, ombres, variables CSS, navigation, structure | HTML et CSS du site lus via r.jina.ai, capture d'écran lue par un modèle vision |

### Galerie Internet
- 12 filtres de style et une recherche libre.
- Chaque page lance 4 recherches différentes ; « Plus de designs » charge la page suivante sans doublon.
- Il faut une clé Tavily.

### Sites réels
- Environ 6 lectures r.jina.ai par site (gratuit, 20 par minute) et un petit appel vision.
- Les logos, photos et textes du site ne sont jamais copiés.

## Logo
- **Choix :** sans logo, une image du chat, ou un logo importé.
- **Recoloration harmonieuse** (`server/services/logoHarmony.ts`) :
  - les familles de couleurs du logo sont trouvées par k-means ;
  - chaque famille reçoit un rôle : fond, blanc, noir ou couleur de marque ;
  - fond → couleur principale, couleurs de marque → accent puis séries (teintes distinctes), blanc conservé si lisible (sinon couleur sombre de la palette).
- **Dessin intact** :
  - chaque pixel est exprimé comme le mélange de la paire de couleurs qui l'explique le mieux, puis reconstruit avec les nouvelles couleurs ;
  - les lettres, les traits fins (par exemple la boucle d'un « k ») et les contours lissés gardent exactement leur forme ;
  - un test vérifie l'écart de couverture.
- **Variantes :** harmonisé, harmonisé sans fond, blanc (pour bandeau), couleur principale, original.
- **Placement automatique** (`server/services/officeLogo.ts`) :
  - Excel : bandeau de titre de la première feuille, graphiques conservés ;
  - Word : en-tête de chaque page ;
  - PowerPoint : chaque diapositive ;
  - HTML : bandeau ou haut de page.
- **Limites :**
  - Mail `.eml` : non traité (la version `.mail.html` contient le logo) ;
  - Python : le modèle ne doit pas insérer le logo lui-même ; l'app l'ajoute.

## Mémoire
- Tout fait vient du chat : messages, pièces jointes, fichiers, résultats d'outils.
- Ce qui vient d'ailleurs (leçons, coffre d'expérience, missions similaires) sert seulement de méthode. Les chiffres y sont masqués (`methodOnly`).
- Si un design autre que le style maison est choisi, les souvenirs qui imposent le style maison ne sont pas transmis au modèle.
