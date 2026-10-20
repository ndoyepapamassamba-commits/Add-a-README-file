---
name: greffer-par-rea
description: Consigne permanente de l'utilisateur (19/10/2026) — « tu dois désormais pour tout chercher des logiciels à greffer via REA avec précision et avancer, garde-le comme skill ». À appeler pour CHAQUE besoin (défaut, porte qui échoue, lenteur, fonction manquante) juste après methode-veille-creation et rea-d-abord : trouver le logiciel libre qui fait déjà le travail, le démonter avec REA avec précision, le greffer, mesurer, avancer. Jamais de code maison avant cette recherche.
---

# Greffer par REA : pour tout besoin, un logiciel trouvé, démonté, greffé, mesuré

Consignes de l'utilisateur (19/10/2026), mot pour mot :
> « J'ai l'impression qu'on tourne en rond. Greffe tous les logiciels qui te manquent et avançons, on est hors délai. »
> « Tu dois désormais pour tout chercher des logiciels à greffer via REA avec précision et avancer, garde-le comme skill. »

Ordre des compétences : `methode-veille-creation` → `rea-d-abord` → **`greffer-par-rea`** → `zero-limite` → métier.

## Règle : 5 temps, à chaque besoin, sans détour

1. **Nommer le besoin en une ligne mesurable.**
   Exemple : « porte B non jugée : il faut voir si la bouche rendue est ouverte aux voyelles ».
2. **Chercher le logiciel qui le fait déjà**, dans cet ordre :
   - ce qui est déjà installé (`pip list`, `npm ls`, `~/.cache/massamba-models`) ;
   - le journal du veilleur REA ;
   - PyPI et npm ;
   - GitHub (thème + étoiles) ;
   - Hugging Face.

   Licences acceptées pour ce qui tourne chez nous : MIT, Apache-2.0, BSD ; on vérifie la licence du code ET celle des poids. On retient le meilleur et on garde 1 à 2 secours.
3. **Le démonter avec REA, avec précision**, avant d'écrire une ligne :
   - paquet JavaScript : `rea analyze-javascript-application` ;
   - roue Python ou archive : `rea extract-artifact` puis lecture ciblée des sources ;
   - binaire ou bibliothèque native : `rea inspect` / `rea function` / `rea decompile` ;
   - WASM : `rea inspect-wasm-artifact` ;
   - SQLite : `rea inspect-sqlite-database`.

   On cite fichier, ligne et identifiant de preuve ; on sépare observé, déduit et inconnu. On cherche l'option ou l'entrée déjà prévue par l'auteur (paramètre, sortie cachée, mode) avant toute adaptation.
4. **Greffer** dans le moteur : le plus petit branchement qui utilise ce que le logiciel sait déjà faire.
   - Commentaire daté dans le code : outil, licence, preuve REA.
   - Contrôle automatique dans `outils/verif_moteur.py`.
5. **Mesurer et avancer** : chiffre avant/après sur nos données, ou porte de qualité lue.
   - Commit et push après les contrôles.
   - Une ligne dans le registre et le journal de veille.
   - Puis le besoin suivant, tout de suite. Si la greffe ne suffit pas, le logiciel suivant de la liste.

## Interdits

- Écrire une méthode maison avant d'avoir cherché et démonté au moins une voie existante (sauf correctif d'une ligne).
- Une étude sans greffe : chaque veille se termine par un branchement mesuré, ou par « greffe en cours » avec l'outil choisi, l'action lancée et la mesure attendue.
- Décompiler un logiciel propriétaire (Premiere, After Effects, CapCut, Sora, Veo, Kling…) : on étudie ses fonctions publiques, et on greffe un équivalent libre.
- Recopier du code GPL dans le moteur MIT : on apprend la méthode, on réécrit.

## Exemples mesurés (19/10/2026)

| Besoin | Logiciel trouvé | Preuve REA ou lecture précise | Greffe | Mesure |
|---|---|---|---|---|
| Instant exact de chaque mot des sous-titres | Piper 1.8 (MIT, déjà installé) | `piper/voice.py` l. 165-185 : `PiperVoice.load(include_alignments=True)` patche le modèle en mémoire (tenseur `w_ceil`) ; l'aligneur abandonne un morceau dès qu'un phonème manque à la table (`phoneme_ids.py` l. 194-200) | `voix.voice()`, `voix._alignements()`, `bornes_mots()`, `compose.words_of` | son identique à l'échantillon près ; mots prononcés = mots écrits sur 22 répliques sur 22 ; écart à Whisper : médiane 71 → 64 ms, p90 186 → 166 ms |
| Porte B (bouche) non jugée sans JEV | MediaPipe FaceLandmarker (Apache-2.0, déjà dans le cache) | points 13/14 (lèvres), 10/152 (front, menton) | `visage_mesure.py` + `jev_levres.juge_ligne_local` | lèvres aux voyelles 0,07–0,22 contre 0,0006–0,026 sur m, b, p (v14) ; porte lue : 14 répliques conformes sur 20 |
| Porte P (choc) non jugée | même FaceLandmarker (sourcils 105/334, paupières 159/145/386/374) | — | `jev_choc.juge_local` | bouche tombée ET (sourcils levés ou yeux écarquillés) par rapport au dessin neutre |

## Liste de contrôle

- [ ] besoin écrit en une ligne mesurable ;
- [ ] au moins une voie existante cherchée (installé, PyPI, npm, GitHub, HF), licences vérifiées ;
- [ ] REA lancé, preuves précises citées (fichier, ligne, identifiant) ;
- [ ] greffe minimale branchée, avec un contrôle dans `verif_moteur.py` ;
- [ ] mesure avant/après, ou porte lue ;
- [ ] commit et push, puis besoin suivant sans attendre.
