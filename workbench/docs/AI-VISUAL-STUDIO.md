# AI VISUAL STUDIO — département de production 2D du Workbench (direct_15)

Salle de **pré-production et de pilotage** : histoire, bibles de personnages et de décors, Style DNA, storyboard, images 2D
via OpenRouter, voix, musique locale, sous-titres, animatic de contrôle, QA, coûts réels et mémoire de production. Il ne
remplace pas le moteur local `afrikatoon-auto` : il lui **exporte un kit** (§ Kit).

## Décisions d'architecture
- **Greffe dans les sources** (pas de patch du bundle minifié) : le dépôt contient les sources du Workbench, donc la vue
  `studio` est une vraie vue React (`direct/views/studio/*`), typée et testée. Le fichier `_14` n'est jamais modifié ;
  `direct_15` est un build séparé. Les trois « patches » (entrée de navigation, icône, rendu) sont de simples ajouts dans
  `direct/lib/nav.ts`, `direct/lib/types.ts` et `direct/App.tsx`.
- **Pas de bridge** : le studio importe directement les fonctions du Workbench (client OpenRouter `llm.ts`, `getKey()`,
  `complete()`, routage `routeModel`/`selectModel`, Apprentice `championFor`, store, JEV_LOG). La clé n'est lue qu'au
  moment de construire l'en-tête `Authorization` (`direct/lib/studio/net.ts`).
- **Moteur pur testable** dans `server/jev/studio/` (capacités, coûts, jobs, erreurs, genome, histoire, QA, kit, sous-titres,
  timeline, mémoire, social, ZIP, secrets). Runtime dans `direct/lib/studio/`.
- **Stockage** : clés IndexedDB préfixées `vs.` (`vs.settings`, `vs.projects`, `vs.assets.meta`, `vs.jobs`, `vs.memory`,
  `vs.registry`) ; binaires dans la base dédiée `massamba-visual-studio` (quota surveillé, alerte > 80 %). Aucune clé
  existante n'est réécrite.
- **Interrupteur** `vs.enabled` (activé par défaut) : désactivé ⇒ aucune lecture/écriture IndexedDB, aucun appel réseau,
  aucune entrée JEV_LOG.
- Raccourci : la 15ᵉ vue n'a pas de chiffre (Alt+5 est pris) → **Alt+Maj+S**.
- ZIP : écrivain « store » maison (`zip.ts`, déterministe, sans dépendance) ; les PNG/MP3 sont déjà compressés.

## Les 20 espaces
Production Control Room · Story · Character · World · Style · Scene Director · Image Factory · Video Factory · Dialogue ·
Voice · Sound · Music · Subtitles · AI Editor · Social Factory · Prompt Genome · Asset Library (+ Visual Source Lab) ·
Production Memory · Production Analytics · Model Lab.

## Règles tenues
- **Style 2D verrouillé** (Style DNA par défaut, injecté dans toute génération, négatifs « 3D render, photorealistic… »).
- **Video Factory désactivée par défaut** ; activation = budget saisi par le propriétaire. Un job payé n'est jamais relancé ;
  à la réouverture les jobs vidéo RUNNING sont réinterrogés, jamais soumis à nouveau.
- **Aucune liste de modèles codée en dur** : `MediaCapabilityRegistry` construit à partir de `/images/models`,
  `/videos/models`, `/models?output_modalities=speech|audio` (cache 1 h) ; une configuration absente des capacités n'est
  jamais envoyée ; une découverte entièrement en échec n'est pas mise en cache.
- **Coût avant l'appel** depuis les prix annoncés (par image, par seconde, par SKU) ; format ambigu (jetons) ⇒ « estimation
  incertaine » + formule + confirmation. Coût réel lu dans `usage.cost`. **Plafond dur par production (1 $)** : un appel qui le
  dépasse est bloqué jusqu'à confirmation explicite.
- **Erreurs** classées AUTH_ERROR, RATE_LIMIT, INVALID_PARAMETER, UNSUPPORTED_CAPABILITY, TIMEOUT, SERVER_ERROR,
  CONTENT_ERROR, INSUFFICIENT_CREDITS, UNKNOWN ; relances avec attente exponentielle pour les seules erreurs transitoires ;
  secours sur un autre candidat (jamais après AUTH/CRÉDITS, jamais pour un job déjà payé).
- **JEV** : trace étendue (`PRODUCTION_CLASSIFICATION → CAPABILITY_DISCOVERY → MODEL_SELECTION → PROMPT_COMPILATION →
  ASSET_RETRIEVAL → GENERATION → QA → CORRECTION → FALLBACK → FINALIZATION`), durées réelles ; chaque appel (succès **et
  échec**) écrit une entrée JEV_LOG avec le tag `studio` (project_id, scene_id, job_id, media_type, task_family, model,
  champion_or_challenger, prompt_version, quality, success, latency, cost, fallback, retry, correction, teacher, JEV_cost,
  total_cost). Ces entrées n'ont pas de tag `apprentice` : le lab Champion Science les ignore.
- **Texte** (histoire, fiches, social, QA texte, Teacher) : routage et Apprentice existants (champion Apprentice VALIDATED, sinon
  `routeModel`/`selectModel`).
- **QA** : règles (format, durée > 60 s TikTok, répliques ≤ 12 mots, marques réelles, contenu moqueur, secrets, continuité).
  Les scores VISUAL/AUDIO/CONSISTENCY viennent **uniquement** d'un juge vision réel (identité + confiance affichées) ; sans
  juge ils restent vides ; TOTAL = moyenne des scores mesurés seulement.
- **Auto-réparation ciblée** (visage → référence ; voix → voix ; continuité → état précédent ; caméra/prompt → recompilation ;
  sous-titres → timing ; lip-sync → moteur local ; ratio → recadrage).
- **Champions/challengers audiovisuels** : clé `MÉDIA / TÂCHE / STYLE / RISQUE / CONTRAT` ; champion seulement avec n ≥ 20 et
  borne basse de réussite ≥ 70 % (intervalle de Wilson) ; « INSUFFICIENT SAMPLE » sinon ; jamais « best model ».
- **Teacher** : un modèle plus fort analyse un échec ; dépense classée LEARNING INVESTMENT (coûts du projet, `jevSpend`, JEV_LOG).
- **Sécurité** : scan de motifs de secrets sur prompts, blueprint, exports (export bloqué si trouvé) ; contenu des modèles traité
  comme donnée ; aucune donnée professionnelle envoyée.

## Kit afrikatoon-auto
`kits/<date>/<NN>-<slug>.json` (schéma `{title, concept, characters[] MAJUSCULES, setting, theme, scenes[{act, beat, characters,
image_prompt, animation_prompt, dialogue[{speaker,text}]}], hook_text, caption, hashtags[], score{}}`),
`assets/characters_2d_ia/<NOM>/<pose>.png` + `meta.json`, `assets/backgrounds_2d_ia_<décor>.png`, `LISEZMOI.txt` avec
`AFRIKATOON_2D_DIR=characters_2d_ia python run.py run --kit kits/….json --mock 2d-hq --no-upload`. Le rendu final importé
(vidéo, caption, planche) devient **FINAL ASSET** à 0 $.

## Limites connues (dites, pas cachées)
- Clonage de voix, transcription automatique, agrandissement d'image/vidéo, recherche sémantique des assets : non
  implémentés (aucune capacité exploitable détectée ou non demandée) — affichés comme tels.
- Musique par modèle (Lyria…) : le format de sortie audio n'est pas documenté ; seule une **sonde** explicite et autorisée est
  proposée, jamais exécutée automatiquement. La musique locale WebAudio (balafon/djembé/kora) est le chemin par défaut.
- Aperçu navigateur : animatic en temps réel (images fixes + zoom lent), ce n'est pas le film final.
- Synchro labiale d'une vidéo générée : non mesurée automatiquement (contrôle humain).
- Aucun appel payant réel n'a été exécuté dans les tests (pas de clé autorisée) : les chemins image/voix/vidéo sont testés
  contre des réponses interceptées au format réel ; la découverte, elle, a été exécutée en réel sur les endpoints publics.
