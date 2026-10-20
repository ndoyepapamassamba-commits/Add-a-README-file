# Publier sur TikTok automatiquement — voie officielle, gratuite, compte public conservé

L'usine (`usine.py`) publie chaque épisode qui passe toutes les portes et ne recule sur aucune mesure. Elle essaie trois
voies dans l'ordre, sans jamais toucher à la visibilité de votre compte (la monétisation exige un compte public) :

| Voie | Ce qui se passe | Ce qu'il faut |
|---|---|---|
| 1. Publication directe | la vidéo part en public, à l'heure choisie, sans geste | votre app TikTok auditée par TikTok (gratuit, quelques semaines) |
| 2. Brouillon TikTok | la vidéo arrive dans votre boîte TikTok avec une notification ; vous touchez « Publier » | votre app TikTok avec l'API Content Posting, accès « Upload » |
| 3. Kit « A PUBLIER » | vidéo, légende, couverture et fiche prêtes ; dépôt dans TikTok Studio en une minute | rien |

Règle TikTok qui explique l'ordre : un client API **non audité** ne peut publier directement que sur un compte **privé**,
en vidéo privée. L'usine ne le tente donc jamais : sans audit, elle passe par le brouillon.

## Une seule fois : créer votre app TikTok (gratuit, 10 minutes)

1. Sur <https://developers.tiktok.com>, connectez-vous avec **votre** compte TikTok (vous seul faites la connexion et les
   vérifications de sécurité).
2. « Manage apps » → « Connect an app » ; type de plateforme : **Desktop**.
3. Ajoutez les produits **Login Kit**, **Content Posting API** (activez « Upload ») et **Display API**.
4. Login Kit → Redirect URI (desktop) : `http://127.0.0.1:8767/tiktok/rappel/`
5. Copiez la **Client key** et le **Client secret** dans le fichier privé de votre poste
   `~/.massamba-prive/tiktok/app.json` (ou `workbench/.private/tiktok/app.json` dans le dépôt) :
   `{"client_key": "…", "client_secret": "…"}` — ce fichier ne quitte jamais votre poste et n'est jamais publié.
6. Soumettez l'app à la revue de TikTok (description : « publier mes propres sketchs depuis mon studio de montage »).
7. Double-cliquez sur **« Connecter mon TikTok.cmd »** : la page TikTok s'ouvre, vous acceptez, c'est fini.

Pour la publication sans geste (voie 1), demandez ensuite l'audit « Direct Post » dans le même tableau de bord, puis
écrivez `"audite": true` dans `app.json`.

## Réglages (`app.json`)

| Clé | Défaut | Effet |
|---|---|---|
| `aigc` | `false` | étiquette « généré par IA » (désactivée par défaut, votre choix) |
| `plafond_jour` | `3` | publications par jour au plus (TikTok : environ 15 par compte) |
| `couverture_ms` | instant du premier choc | image de couverture |
| `commentaires`, `duo`, `collage` | `true` | interactions autorisées |

## Viralité (viral.py)

TikTok dit mesurer d'abord : finir une vidéo longue, partager, commenter, s'abonner ; la légende, le son et les
mots-dièse décrivent la vidéo ; le nombre d'abonnés n'est pas un facteur direct. L'usine en tire : légende choisie par
JEV parmi quatre styles (camps, partage ciblé, suspense, reconnaissance), sujets dits dans le film en tête, cinq
mots-dièse au plus, couverture au premier choc, « Épisode N », créneaux midi et soir à Abidjan au départ puis appris sur
les chiffres réels de vos vidéos (`publie_tiktok.py apprend`).
