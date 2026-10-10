# MASSAMBA Workbench direct_20 — mémoire par chat, pilotage JEV, apprentissage

## Mémoire : elle reste dans le chat
- **Cause du bug** : l'espace de fichiers et la mémoire `.ai/` étaient globaux ; le contexte choisi par JEV et l'arbre de
  fichiers venaient de TOUS les chats.
- **Correction (appliquée par le code)** : chaque chat a son propre espace (`@chat/<id>/…`) et sa propre mémoire `.ai/`.
  L'agent d'un chat ne peut ni lister, ni chercher, ni lire, ni écraser les fichiers d'un autre chat. Un fichier de l'espace
  partagé (vue Fichiers) n'est visible que si le chat l'a joint ou si l'utilisateur a écrit son chemin. Le chat est
  réaffirmé avant chaque outil : deux chats en parallèle ne se mélangent pas.
- **Dernière livraison** : après une livraison, « change / ajoute / mets… » vise les fichiers livrés (bloc `<LAST_DELIVERY>`,
  pare-feu d'historique qui ramène la mission livrée), sauf si un autre fichier est nommé.
- **Mémoire sémantique du chat** (gratuite, sans API d'embeddings) : décisions, préférences et livraisons extraites à chaque
  tour ; les 3 faits pertinents sont réinjectés (≈ 40 tokens chacun). Un index d'une ligne des demandes antérieures du chat
  (`<CHAT_INDEX>`) remplace l'ancien historique complet.

## Modèle verrouillé par chat
Aucun changement automatique de modèle en cours de discussion (routage, escalade, repli, descente « live », apprenti).
« Auto » choisit une fois au premier message. Désactivable : Réglages → « Garder le même modèle ».

## Pilotage JEV (anti-dérive, anti-arrêt)
- Ancrage toutes les 6 étapes d'outils (objectif, fait, reste) : ≈ 120 tokens, aucun appel en plus.
- Réponse vide → une relance ciblée au lieu d'un arrêt silencieux.
- Budget d'étapes de la voie rapide prolongé tant que le travail progresse (jamais au-delà de votre réglage) ; à la limite,
  livraison de ce qui est fait au lieu d'une erreur.

## Vision pour modèles non-vision (ex. Qwen Flash)
Le modèle du chat ne change pas : un petit modèle vision (gratuit d'abord, sinon le moins cher) lit l'image une fois
(description exhaustive, OCR verbatim, tableaux, valeurs des graphiques) et le texte est transmis. Cache par image et
question : 0 $ la deuxième fois.

## Internet : Brave Search
`web.search` utilise Brave (offre gratuite) et renvoie les résultats bruts au modèle, sans appel LLM de synthèse. Brave
bloque les appels directs du navigateur : déployer `relay/brave-relay` (Supabase) et coller son URL dans Réglages. Repli
OpenRouter (payant) désactivable.

## Agents qui apprennent
- **Leçons** : ce que vous corrigez après une livraison devient une leçon pour ce type de demande, réappliquée d'emblée
  (3 au plus, seulement si pertinentes). Visibles et supprimables (JEV Cognitive OS → Coffre & leçons).
- **Contrat d'environnement** dans le noyau OMNIPOTENT : le modèle travaille avec la mémoire, les outils et les règles de
  l'app (et cherche sur le web toute donnée datée).
- **Expérience embarquée** : 20 leçons d'ingénierie et métier, rappelées seulement quand elles correspondent.
- **14 skills d'ingénierie** (débogage, revue de code, TDD, refactoring, SQL, API, performance, UI, ADR, postmortem,
  design de livrables, présentations, écrit de direction, data storytelling) : activés seulement sur leurs déclencheurs.

## Coffre d'expérience et archives
- « ☆ Garder dans le coffre » sous une réponse : texte + fichiers. La plus proche d'une nouvelle demande est proposée au
  modèle (`<EXPERIENCE>`), `vault.open` copie ses fichiers dans le chat.
- Archives : « Tout archiver », sélection (archiver / désarchiver / exporter), import d'une archive. Rien n'est supprimé.

## Exports : style maison par défaut, plus figé
Le style GOD 3D · BLUE ECOBANK reste le défaut (charte intacte et signée). Thèmes : corporate, modern, minimal, executive,
warm, nature, ou personnalisé (couleurs / police) — seulement quand l'utilisateur le demande. Presets MCP Figma et Canva
(désactivés, OAuth requis ; la connexion directe depuis le navigateur n'est pas garantie).

## Studio 2D et 3D
- Rendu animé 2.5D : mouvement de caméra par plan selon le contenu, zoom vers le personnage qui parle, rebond calé sur la
  voix, fondus enchaînés ; orbite cinématographique en 3D ; vrais clips vidéo quand la Video Factory est activée.
- Voix : une voix distincte et cohérente (genre, âge) par personnage, vitesse naturelle.
- Plus de bruitages synthétiques ajoutés automatiquement ; musique plus basse sous les voix.

## Limites honnêtes
- Aucune économie chiffrée annoncée : à lire dans le journal après usage réel.
- La mémoire sémantique est lexicale + n-grammes (pas d'embeddings) : elle rate les reformulations très éloignées.
- Deux chats exécutés exactement au même instant restent séparés par réaffirmation du chat à chaque étape ; un outil très
  long d'un chat peut, en théorie, s'exécuter pendant une étape de l'autre.
- Brave exige votre clé et un relais ; Figma/Canva exigent un compte et peuvent refuser le navigateur.
- Le rendu animé reste un animatic (caméra sur image) ; une vraie animation demande la Video Factory (payante).
