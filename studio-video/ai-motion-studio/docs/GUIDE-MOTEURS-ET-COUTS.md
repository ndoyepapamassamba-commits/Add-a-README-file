# Moteurs vidéo, connexions et coûts

Règle de l'application : **aucune capacité, aucun modèle ni aucun prix inventé**.

- Les capacités des moteurs gratuits sont relues **en direct** dans la configuration publique de chaque service, à chaque session.
- Celles des fournisseurs à clé viennent des SDK officiels démontés le 22/10/2026 et de leur documentation officielle.
- Quand une information n'est pas sûre, l'application affiche « ? » ou « À CONFIRMER », jamais une valeur supposée.

## 1. Moteurs gratuits (appelés depuis votre navigateur)

| Moteur | Modes | Bornes lues en direct le 22/10/2026 | Licence des poids |
|---|---|---|---|
| Wan 2.2 14B rapide (Space `zerogpu-aoti`) | image → vidéo | 0,5 à 5 s ; 4 étapes | Apache-2.0 |
| Wan 2.2 image de départ + image de fin (Space `multimodalart`) | image → vidéo | 0,5 à 5,1 s ; deux images obligatoires | Apache-2.0 |
| LTX-2.3 (Space officiel Lightricks) | texte → vidéo et image → vidéo | 1 à 10 s ; hauteur et largeur réglables | LTX-2 Community License : gratuite sous 10 M$ de chiffre d'affaires annuel |
| LTX-2.3 première/dernière image (Space `linoyts`) | les deux ; image de fin et audio facultatifs | — | LTX-2 Community License |
| LTX-Video distillé (secours) | texte → vidéo | — | Open Weights License Lightricks : à relire avant usage commercial |
| Chaîne Pollinations « sana » → Wan 2.2 | texte → image → vidéo | 0,5 à 5 s | Image : service Pollinations ; vidéo : Apache-2.0 |

**Coût** : 0 €. Ces moteurs consomment le **quota GPU quotidien gratuit** de Hugging Face.

- Le quota anonyme est réduit ; un compte gratuit donne davantage.
- Le quota se renouvelle 24 h après la première utilisation.
- Pour l'utiliser, collez votre jeton dans **Moteurs IA → Jeton Hugging Face**. Le jeton :
  - est vérifié par `whoami-v2`, puis le champ est vidé ;
  - reste en mémoire seulement, le temps de l'onglet ;
  - n'est envoyé qu'au service appelé.

**Ce qui est consigné à chaque génération** (Historique, exportable en JSON ou CSV) :

- fournisseur, modèle, mode et paramètres ;
- états successifs, rang dans la file et message du service ;
- durée réelle et graine ;
- erreur éventuelle, en français.

## 2. Moteur local : V1 de la troupe (gratuit, sur votre machine)

`moteur-v1` tourne un sketch parlé sur une scène préparée de la troupe : voix Piper, bouches synchronisées, rires, ambiance, montage TikTok 1080×1920. Il passe par le serveur local (`MASSAMBA_BIBLIO`). Avant tournage, le bouton « Contrôler » vérifie le sketch avec la grille de ton.

**Coût** : 0 €, uniquement le calcul de votre ordinateur. La durée de tournage est mesurée et affichée dans l'historique.

## 3. Fournisseurs à clé secrète (désactivés par défaut)

La clé se met **uniquement** dans le fichier `.env` du serveur local. Elle n'apparaît jamais dans le navigateur, dans un fichier projet ni dans les journaux, qui la caviardent.

| Fournisseur | Ce qui est branché | Source vérifiée |
|---|---|---|
| fal.ai | File d'attente officielle `queue.fal.run` (envoi, statut, résultat, annulation), modèle choisi dans `FAL_MODELE_I2V` / `FAL_MODELE_T2V` | Documentation fal, lue le 22/10/2026 |
| Replicate | Le serveur relit le **schéma d'entrée réel** du modèle avant d'envoyer ; prédictions, suivi, annulation | Référence HTTP Replicate |
| Runway | `gen4_turbo`, `gen4.5`, `veo3.1` ; en-tête `X-Runway-Version: 2024-11-06` ; formats et durées du SDK | `@runwayml/sdk` 4.22.0 |
| Luma | Ray 2, Ray Flash 2 (texte → vidéo ; une image impose une URL publique) | `lumaai` 1.19.1 |
| Kling | JWT HS256 (clé d'accès + clé secrète) | **À CONFIRMER** : la documentation officielle n'a pas pu être relue en direct ; l'adresse `KLING_API_BASE` est obligatoire |

### Garde-fous de coût (appliqués par le code)

1. `PAYANT_AUTORISE=0` par défaut : le serveur refuse toute tâche payante (code 403). L'application grise ces moteurs (« payant (désactivé) »).
2. Si la voie payante est ouverte, chaque lancement exige une **confirmation**. La fenêtre affiche le fournisseur, le modèle, le coût « Tarif indisponible — vérifier auprès du fournisseur » et votre budget déclaré.
3. **Plafond dur par jour** : `PLAFOND_TACHES_PAYANTES_JOUR`, compté par le serveur.
4. **Limite par session** (Moteurs IA → Budget et limites) : au-delà, l'application bloque les générations.
5. **Mode « Film complet »** : avant de lancer toutes les scènes, l'application montre l'estimation par moteur et demande confirmation.
6. **Double soumission** : une génération identique encore en cours est refusée.

### Pourquoi aucun prix n'est affiché

Les tarifs changent souvent et dépendent du compte (crédits, abonnement, résolution, durée). L'application ne connaît pas votre contrat. Elle affiche donc les paramètres qui influent sur le coût (durée, format, qualité, nombre de scènes) et vous renvoie au tableau de bord du fournisseur. C'est la consigne : « Ne jamais inventer un prix ».

## 4. Mode démo

**MODE DÉMO** (puce en haut à droite, ou Moteurs IA) produit une petite animation locale : zoom ou panoramique sur l'image. Un bandeau orange « DÉMO — animation locale, pas une génération IA » est **incrusté dans chaque image**. Le média reçoit l'étiquette « DÉMO » partout et n'est jamais compté comme une génération IA.
