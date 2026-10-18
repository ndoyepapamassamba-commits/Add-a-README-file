# Reprise : générer toute la fabrique avec la clé OpenRouter (budget unique de 10 $)

*Accord de l'utilisateur, 18/10/2026* : « Je te donne un budget de 10 dollars […] générer rapidement », « une seule fois ».
La clé est déjà dans les réglages de l'environnement. Une session ouverte après cet ajout la voit sous `OPENROUTER_API_KEY`.

## 0. Vérifier la clé (oui/non, jamais la valeur)

```bash
python3 -c "import os; print(bool(os.environ.get('OPENROUTER_API_KEY')))"
```

## 1. Essai de 3 modèles (≈ 0,10 $), puis choix

Mesurer pour chaque modèle le coût réel (journal `couts.jsonl`), le temps et la qualité de la planche.

```bash
cd studio-video/moteur-troupe/fabrique
S=<scratchpad>/fabrique/or
for m in google/gemini-2.5-flash-image google/gemini-nano-banana-2.1 openai/gpt-5-image-mini; do
  FABRIQUE_VOIES=openrouter OR_PAYANT_AUTORISE=1 FABRIQUE_PLAFOND_USD=0.2 FABRIQUE_OR_MODELE=$m \
    python3 generer.py $S/essai-$(basename $m) perso/nounou-assis 1
done
```

Vérifier ensuite sur chaque planche :

- même personnage sur toutes les vues ;
- fond uni ;
- yeux et bouche lisibles.

Puis passer la planche dans `decoupe.py`.

## 2. Tout le catalogue, sous plafond dur

Le catalogue compte **189 planches**. Avec Gemini 2.5 Flash Image, compter ≈ 0,04 $ par planche, soit ≈ 7,5 $, avec une marge pour les reprises.

```bash
FABRIQUE_VOIES=openrouter OR_PAYANT_AUTORISE=1 FABRIQUE_PLAFOND_USD=10 FABRIQUE_OR_MODELE=<modèle choisi> \
  python3 generer.py <scratchpad>/fabrique/lot1 '' 16
```

Le plafond est appliqué par le code :

- chaque appel réserve son coût avant de partir ;
- le coût réel relevé ensuite corrige la réservation ;
- au plafond, la voie se ferme.

Les planches déjà faites ne sont jamais refaites.

## 3. Découpe et mesures (local, gratuit)

```bash
for f in <lot1>/perso/*-tour.png;   do python3 decoupe.py $f <vues>/$(basename $f -tour.png) tour;   done
for f in <lot1>/perso/*-assis.png;  do python3 decoupe.py $f <vues>/$(basename $f -assis.png) assis; done
for f in <lot1>/perso/*-marche.png; do python3 decoupe.py $f <vues>/$(basename $f -marche.png) marche; done
```

Toute planche marquée en défaut (bouche, yeux, bras, texte, nombre de silhouettes) repart à l'étape 2 avec une autre graine.

## 4. Suite du plan (PLAN.md)

1. Séparer les sièges : le tabouret ou la chaise de la vue assise devient un objet fixe.
2. Construire les bibliothèques LivePortrait par vue : émotions, bouches, paupières et poses de tête.
3. Écrire le compositeur de scène (E5) : décor vide, objets et personnages, perspective, ombres de contact, export au format du moteur.
4. Écrire les premiers épisodes de la saison 2 (l'école).
