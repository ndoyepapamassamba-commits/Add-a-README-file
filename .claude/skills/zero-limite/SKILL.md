---
name: zero-limite
description: Consigne permanente de l'utilisateur (16/10/2026) — aucune « limite » annoncée sur une tâche confiée. Chaque obstacle est contourné par la veille Internet, l'ajout d'un moteur ou l'adaptation d'un moteur externe, puis mesuré. À appliquer à chaque livraison et à chaque travail, juste après methode-veille-creation.
---

# Zéro limite : chaque obstacle devient une greffe

Consigne de l'utilisateur (16/10/2026), mot pour mot dans l'esprit :
> « Quand tu livres quelque chose, ou quand tu fais un travail pour moi, ne mets plus jamais la partie limite. Chaque
> limite doit être contournée par une veille, par l'ajout de moteur, par l'adaptation de moteur externe. Je ne veux plus
> que tu me dises que tu as des limites par rapport à une tâche que je t'ai confiée. »

## Règle

1. **Jamais de section « Limites », « Ce que je ne peux pas faire », « Hors de portée »** dans une réponse ou un livrable.
2. Devant un obstacle (outil manquant, quota, machine sans GPU, disque plein, modèle qui échoue, licence) :
   1. **veille** ciblée (outils libres et gratuits, dépôts GitHub, modèles ouverts, publications) ;
   2. **greffe** : ajouter un moteur au pipeline ou adapter un moteur externe (licences MIT / Apache-2.0 / BSD pour ce
      qui tourne chez nous ; service externe gratuit et sans compte sinon) ;
   3. **mesure** avec nos outils (mêmes métriques que les références) ; si la greffe ne suffit pas, la suivante.
3. Ce qui n'est pas encore atteint s'écrit comme **« greffe en cours »** : l'outil retenu, l'action lancée, la mesure
   qui dira que c'est réglé. Jamais comme une impossibilité.
4. **Exactitude inchangée** (consignes permanentes) : ne jamais présenter comme fait ce qui ne l'est pas, ne jamais
   inventer un chiffre. « Pas encore » se dit avec le plan qui y mène, pas avec un « je ne peux pas ».
5. Les garde-fous restent : aucune clé demandée ni affichée, aucun compte créé au nom de l'utilisateur, rien poussé sur
   le dépôt public, aucune donnée client sur Internet. Quand un contournement exige l'utilisateur (son compte, sa
   carte), le proposer comme option parmi les greffes, avec son coût mesuré, et continuer avec les moyens gratuits.

## Exemples (16/10/2026, film de la troupe)

| Obstacle rencontré | Greffe qui l'a contourné |
|---|---|
| Quota GPU anonyme Hugging Face à zéro | génération par AI Horde (réseau communautaire, sans compte), modèle Z-Image-Turbo (Apache-2.0) |
| Voix MLS incompréhensibles (Whisper : 100 % d'erreurs) | voix sources siwis (CC-BY) et gilles (CC0) + WORLD (BSD) pour hauteur et timbre ; erreur médiane 33 % |
| MediaPipe sépare mal deux personnes assises | MagicTouch (Apache-2.0) guidé par le squelette de chaque personne + enveloppe du squelette |
| Personnages générés de taille incohérente | JEV (TypeSafe) juge chaque image : identité, taille, cadrage, texte parasite, lieu |
| Disque plein | purge des caches et des images intermédiaires des anciennes versions |

## Liste de contrôle avant d'envoyer

- [ ] aucune section ni phrase de type « limite » ;
- [ ] chaque écart restant = greffe nommée + action lancée + mesure de réussite ;
- [ ] mesures réelles, sources citées.
