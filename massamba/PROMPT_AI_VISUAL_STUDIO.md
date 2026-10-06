# PROMPT — Greffe « AI VISUAL STUDIO » dans MASSAMBA Workbench (direct_14 → direct_15)

> À coller dans une session Claude qui a accès au fichier `massamba-workbench-direct_14.html`
> (et, si possible, au dépôt `ndoyepapamassamba-commits/Add-a-README-file`, branche `claude/gallant-bell-286f0p`).

---

Tu es Claude, architecte logiciel senior, ingénieur IA multimodale, réalisateur audiovisuel IA et spécialiste
des applications web locales mono-fichier. Tu fais évoluer **MASSAMBA Workbench — accès direct**
(`massamba-workbench-direct_14.html`) pour y greffer un nouveau département : **🎬 AI VISUAL STUDIO —
AI FILM • ANIMATION • SOCIAL CONTENT PRODUCTION FACTORY**, piloté par JEV.

Livrable : `massamba-workbench-direct_15.html`, un fichier HTML unique qui s'ouvre hors ligne
(double-clic, `file://`). **Le fichier `_14` n'est jamais modifié.**

## 0. CONTEXTE RÉEL (ne pas l'ignorer)

### 0.1 Le propriétaire et son usage
- Il produit des sketchs humoristiques sénégalais pour TikTok (@comedyvideos_100) : vertical 9:16,
  **plus de 60 s** (programme Creator Rewards), en français avec des touches de wolof. L'humour vise les
  situations (belle-famille, quartier, marché, bureau), jamais les groupes.
- **DÉCISION DU PROPRIÉTAIRE : 2D EXCLUSIVEMENT, DE HAUTE QUALITÉ.**
  - Style : dessin animé 2D type série TV franco-africaine moderne (traits noirs nets, aplats, une seule teinte
    d'ombre, visages très expressifs).
  - Pas de 3D, pas de photoréalisme, pas de vidéo générée par défaut.
  - Le Style DNA par défaut du studio est donc ce style 2D. Il est **verrouillé** : on ne change que sur demande
    explicite.
  - La Video Factory existe, mais elle est **désactivée par défaut**. Elle ne s'active que sur décision explicite
    du propriétaire, avec un budget saisi par lui.
- Les productions finales se font aujourd'hui avec le moteur Python local `afrikatoon-auto/`, qui ne coûte rien :
  - 2D en pantins découpés, lip-sync Rhubarb, voix Chatterbox à accent africain vérifiées par Whisper ;
  - musique balafon générée, bruitages CC0, sous-titres mot à mot.

  Le studio du Workbench **ne remplace pas ce moteur**. Il en est la **salle de pré-production et de pilotage** :
  - histoire, bible des personnages et des décors, Style DNA, storyboard ;
  - images 2D via OpenRouter, et animatique de contrôle dans le navigateur ;
  - **export d'un kit JSON compatible** avec `afrikatoon-auto` (§ 9) ;
  - suivi des coûts réels, du QA et de la mémoire de production.
- Personnages récurrents :
  - MAMAN NOUNOU : belle-mère, la cinquantaine, autoritaire, foulard et pagne rouges, tablier vichy vert,
    banane avec des billets ;
  - COUMBA : belle-fille, la vingtaine, robe wax rose et violette, tresses ;
  - PETIT MAMADOU : 8 ans, maillot jaune **sans logo de marque**.

  La bibliothèque compte 38 personnages et 29 scènes (dossiers `assets/characters`, `assets/characters_2d`,
  `assets/characters_2d_ia`, `assets/scenes`). Le propriétaire les importera par glisser-déposer ou par sélection
  de dossier.

### 0.2 Le budget
- Objectif : **moins de 1 $ par vidéo**.
- Le redessin 2D unique des personnages via OpenRouter coûte environ 0,02 $ par image.
- Toute dépense passe par le Cost Governor (§ 6) avec un **plafond dur par production** (1 $ par défaut,
  modifiable par le propriétaire uniquement).

### 0.3 Ce que contient réellement le fichier `_14` (audité — vérifie-le avant de toucher quoi que ce soit)
**Structure générale**
- C'est un **build Vite/React compilé et minifié** d'environ 8 Mo, inliné dans un seul
  `<script type="module">`. Il n'y a **pas de sources** : les noms ci-dessous sont des identifiants minifiés de
  cette version précise. Relocalise-les par motif (recherche textuelle), jamais par numéro de ligne.
- Une CSP n'est pas présente. Le style repose sur des classes Tailwind compilées, avec les jetons `bg-elev`,
  `border-line`, `text-muted`, `text-accent`, `bg-accent-soft`, `text-err` et les variables `--accent` et
  `--accent-fg`. Les composants portent des `data-testid`. Les thèmes clair et sombre sont gérés par
  `settings.theme`.

**Navigation**
- Le tableau des vues est `YSt=[{id:\`home\`,label:\`Mission Control\`}, …, {id:\`jev\`,label:\`JEV\`},
  {id:\`settings\`,label:\`Réglages\`}]` (14 vues).
- Les icônes sont dans `Hwt={home:…, jev:(0,V.jsx)(De,{size:17}), …}`, puis `Q9=YSt.map(…)`.
- Le rendu se fait dans `<main>` par une suite `t===\`jev\`&&(0,V.jsx)(kwt,{})` (`V` = runtime JSX).
- Le raccourci affiché est `Alt+${(r+1)%10}` : une 15e vue entre en collision avec `Alt+5`. Gère ce cas, par
  exemple sans raccourci ou avec `Alt+Shift+S`.

**Store et persistance**
- Store zustand : `H` (`useStore`). `H.getState()` expose entre autres `addJevLog`, `setJevSpend`, `setFabric`,
  `addArtifact`, `toast`, `settings`, `jevLog`, `registry`, `skills`, `fabric`, `ledger`.
- Persistance IndexedDB : base `openrouter-workbench-direct`, store `kv`. On lit avec `Vr.get(clé)` et on écrit
  avec `Lr(clé, getter, délai)` (écriture différée). L'hydratation se fait par `io()`.
- Clés existantes : `jevLog` (1000 dernières entrées), `jevSpend`, `jevLive`, `fabric`, `registry`, `skills`,
  `ledger`, `bench`, `routingLog`, `sessions`, `settings`, `artifacts`, `files`, `workflows`, etc.
- **Ajoute tes propres clés préfixées `vs.`** (par exemple `vs.projects`, `vs.assets.meta`). Ne réécris jamais une
  clé existante.

**Client OpenRouter**
- Base `vr=\`https://openrouter.ai/api/v1\``, client `xr` (`listModels`, `credits`).
- La clé est lue par `lr()` depuis `sessionStorage` ou `localStorage` sous `wbd.openrouter-key`, et masquée par
  `fr()`. Les erreurs lisibles viennent de `_r()` (401, 402, réseau), le catalogue de `pr()` (cache
  `wbd.catalog`, 1 h), l'estimation de coût de `hr()`, le crédit de `mr()`.
- **Réutilise ces fonctions, ne les duplique pas.** La clé n'est lue qu'au moment de construire l'en-tête
  `Authorization` ; elle ne passe jamais dans un prompt, un log, le JEV_LOG, un blueprint ou un export.

**JEV et modules existants**
- Les étapes de trace s'écrivent `{name:\`JEV_POST\`,…}` et `{name:\`JEV_LEARNING\`,…}`. Le JEV_LOG est alimenté
  par `addJevLog`.
- Les sous-onglets JEV couvrent : Control Center, Trace live, JEV_LOG, Sans/avec JEV, Validation scientifique,
  Benchmark 2.0, Profils modèles, Cost Intelligence, JEV API, Régression, JEV APPRENTICE, CHAMPION SCIENCE LAB,
  Mission cognitive, Model Council, Model Expertise, Capability Fabric, Skill Factory, Skill Lab, Experience
  Memory, Failure Replay, Distillation Lab, Training Data, Policy Engine, Free Model Lab, Security,
  Health & Score, Cognitive Benchmark.
- Convention existante à respecter : tout scénario simulé est étiqueté **« SIMULATED TEST ONLY »**, n'est jamais
  écrit dans le JEV_LOG et n'est jamais compté dans les statistiques.

**Test de non-régression existant et plugin image**
- `XSt()` capture les outils, agents, vues, réglages et clés du store. `a9()` compare cette capture à la
  référence `JSt` (`capturedAt` 2026-10-05).
- Un élément **manquant** fait échouer le test ; un élément **ajouté** est simplement signalé. Ta greffe doit donc
  passer `a9().ok === true`.
- Un plugin `images` (Pollinations, outil `image.generate`) existe déjà : garde-le tel quel.

### 0.4 L'API OpenRouter (vérifiée en direct le 06/10/2026 : endpoints publics en 200, CORS `*`)
**Découverte des capacités (sans clé)**
- `GET /api/v1/images/models`
- `GET /api/v1/videos/models` : renvoie `supported_resolutions`, `supported_aspect_ratios`, `supported_sizes`,
  `supported_durations`, `supported_frame_images` (`first_frame` / `last_frame`), `generate_audio`, `seed`,
  `allowed_passthrough_parameters` et `pricing_skus`. **Les clés de `pricing_skus` varient selon le modèle** :
  `duration_seconds_720p`, `duration_seconds_with_audio`, `video_tokens`, `cents_per_second_output`, etc.
- `GET /api/v1/models?output_modalities=speech|audio|image` : pour la synthèse vocale, le champ
  `supported_voices` donne la liste des voix.

**Images**
- `POST /api/v1/images` avec `{model, prompt, aspect_ratio, resolution|size, n, input_references:[{type:"image_url",
  image_url:{url}}]}`. Les URL peuvent être des URL de données en base64.
- Réponse : `data[].b64_json` et `usage.cost`. La facturation est au tout ou rien.

**Vidéos**
- `POST /api/v1/videos` avec `{model, prompt, duration, resolution, aspect_ratio, size, frame_images:[{type:"image_url",
  image_url:{url}, frame_type:"first_frame"|"last_frame"}], input_references, generate_audio, seed, provider}`.
- La réponse contient `id` et `polling_url`. On interroge `GET polling_url` jusqu'à un statut parmi `pending`,
  `in_progress`, `completed` et `failed`. Le résultat est dans `unsigned_urls[0]` ou
  `GET /api/v1/videos/{id}/content?index=0`. Le coût réel est dans `usage.cost`.

**Voix**
- `POST /api/v1/audio/speech` avec `{model, input, voice, response_format:"mp3"|"pcm", speed, input_references}`.
- La réponse est un **flux d'octets audio**, pas du JSON.
- Le clonage de voix (`input_references` audio) n'est supporté que par certains modèles, par exemple Fish Audio
  S2.1 Pro, qui existe en variante gratuite `:free`.

**Musique**
- Lyria passe par `POST /api/v1/chat/completions`. **Le format de sortie audio n'est pas documenté** : traite-le
  comme une capacité à sonder par un appel de test explicite et autorisé. Tant que ce n'est pas vérifié, affiche
  « Capability unavailable in current environment » et propose la musique locale (§ 4, Music).

**Règles**
- **Aucune liste de modèles codée en dur.** Les noms ci-dessus ne servent qu'à illustrer le catalogue du jour,
  qui change chaque semaine : Seedream, FLUX.2, Gemini Flash Image, GPT Image, Qwen Image, Recraft ; Veo 3.1,
  Seedance, Kling, Wan, Grok Imagine Video, Hailuo, Sora, HeyGen ; Gemini TTS, MAI Voice, Fish Audio, Kokoro,
  Grok Voice, etc.
- Avant tout appel, vérifie que la configuration demandée figure dans les capacités découvertes. Une
  configuration invalide n'est **jamais** envoyée.

## 1. HIÉRARCHIE (inchangeable)

| Rôle | Tenu par |
|---|---|
| DIRECTOR / PRODUCER | L'utilisateur |
| EXECUTIVE PRODUCER + AI DIRECTOR | JEV |
| CASTING / EXPERT PANEL | MODEL COUNCIL |
| INFRASTRUCTURE | CAPABILITY FABRIC |
| SAVOIR-FAIRE | SKILLS |
| EXPÉRIENCE | MEMORY |
| BEST VALIDATED WORKER | CHAMPION |
| CANDIDATE | CHALLENGER |
| EXPERT MENTOR | TEACHER |
| LOW-COST TALENT | APPRENTICE |
| POST-PRODUCTION SUPERVISOR | QA |
| PRODUCTION CONTROLLER | COST GOVERNOR |
| MEDIA LIBRARY | ASSET LIBRARY |
| PRODUCTION STUDIO | AI VISUAL STUDIO |

Le Workbench reste le système d'exploitation, et AI VISUAL STUDIO en est un département. **Aucune
fonctionnalité existante n'est supprimée ni modifiée dans son comportement.**

## 2. STRATÉGIE DE GREFFE (obligatoire, adaptée à un bundle minifié)

1. **Audit d'abord.** Relocalise et cite, pour chaque élément du § 0.3, le motif trouvé et sa position.
   Si un identifiant a changé, adapte-toi et dis-le. N'avance pas tant que ce n'est pas fait.
2. **Patches minimaux et réversibles dans le bundle**, et seulement ces trois-là, chacun encadré par
   `/*VS-PATCH-n*/ … /*/VS-PATCH-n*/` :
   1. ajout de `{id:\`studio\`,label:\`AI Visual Studio\`}` dans `YSt`, juste avant `settings` ;
   2. ajout d'une icône `studio` dans `Hwt`, avec une icône déjà importée dans le bundle ou un petit SVG inline ;
   3. ajout dans `<main>` de `t===\`studio\`&&(0,V.jsx)(VSRoot,{})`.

   `VSRoot` est un petit composant défini dans le bundle, juste avant `Hwt`. Il crée un `<div>` conteneur et
   appelle `window.MassambaVisualStudio.mount(el, bridge)`. Le `bridge` est un objet **figé**
   (`Object.freeze`) qui n'expose que des fonctions :

   ```
   { store: { get: () => H.getState(), addJevLog, setJevSpend, toast, addArtifact },
     kv: { get: k => Vr.get(k), set: (k, v) => Vr.set(k, v) },   // clés « vs. » uniquement (vérifié)
     or: { base: vr, authHeader: () => ({ Authorization: "Bearer " + lr() }), hasKey: () => !!lr(),
           friendlyError: _r, catalog: pr, credits: mr, estimate: hr },
     version: "direct_15" }
   ```

   `authHeader` est la seule fonction qui touche à la clé. Elle n'est appelée qu'au moment du `fetch`. Son
   résultat n'est jamais conservé, ni affiché, ni journalisé.
3. **Le studio est un module lisible et séparé** : un second `<script type="module" id="massamba-visual-studio">`,
   ajouté à la fin du fichier et écrit en JavaScript moderne **non minifié et commenté**.
   - Il n'importe aucune dépendance réseau : tout fonctionne hors ligne sauf les appels OpenRouter.
   - Pour l'interface, utilise soit le React du bundle exposé via le bridge, soit du DOM natif avec de petits
     composants. Choisis le plus robuste et justifie ce choix.
   - Il reprend les jetons de style du Workbench (variables CSS, thèmes clair et sombre) pour une cohérence
     visuelle totale.
4. **Interrupteur général** : un réglage `vs.enabled`, activé par défaut. Studio désactivé, le Workbench se
   comporte exactement comme `_14` : aucun appel réseau, aucune écriture dans IndexedDB, aucun ajout au JEV_LOG.
5. **Pas de duplication.** Avant chaque fonction, vérifie si l'équivalent existe dans le bundle (journalisation,
   coût, erreurs, catalogue, toasts, artefacts, routage) et réutilise-le via le bridge.

## 3. ORCHESTRATION JEV (le cœur)

JEV n'est pas un chatbot : c'est le producteur exécutif et le réalisateur. Pour chaque production :

**Enchaînement**
1. IDÉE → JEV analyse → plan de production → capacités requises → modèles candidats ;
2. → choix (coût, qualité, latence, historique, champion, challenger, secours) → compilation des prompts ;
3. → gestion des dépendances → génération → validation → détection des incohérences → correction ciblée ;
4. → escalade si nécessaire → assemblage → contrôle du coût → mémorisation de ce qui a marché.

**Sélection**
- La sélection se fait par **capacités**, jamais par une règle « tâche X = modèle Y ». Chaîne de décision :
  `TÂCHE → CAPACITÉ REQUISE → CANDIDATS DÉCOUVERTS → COÛT LU EN DIRECT → QUALITÉ MESURÉE (si n suffisant) →
  LATENCE → CHAMPION/CHALLENGER → SECOURS`.
- Les modèles de texte du studio (histoire, dialogues, QA textuelle, compression du contexte) passent par le
  **routage, le Model Council et l'Apprentice existants**, avec en priorité les modèles gratuits ou peu chers
  validés. Pas de nouveau routeur de texte.

**Trace JEV étendue** (même format `{name, ms, tokens, cost, decision}`)
`JEV_PRE → PRODUCTION_CLASSIFICATION → CAPABILITY_DISCOVERY → MODEL_SELECTION → PROMPT_COMPILATION →
ASSET_RETRIEVAL → GENERATION → QA → CORRECTION → FALLBACK → FINALIZATION → JEV_LEARNING`

**JEV_LOG** (via `addJevLog`, même structure que l'existant, plus les champs suivants)
`project_id, scene_id, job_id, media_type, task_family, model, champion_or_challenger, prompt_version, quality,
success, latency, cost, fallback, retry, correction, teacher, JEV_cost, total_cost`

## 4. LES 20 ESPACES DU STUDIO

Navigation interne :
1. 🎬 Production Control Room
2. ✍️ Story
3. 👤 Character
4. 🌍 World
5. 🎨 Style
6. 🎥 Scene Director
7. 🖼️ Image Factory
8. 🎞️ Video Factory
9. 🗣️ Dialogue
10. 🎙️ Voice
11. 🔊 Sound
12. 🎵 Music
13. 💬 Subtitles
14. ✂️ AI Editor
15. 📱 Social Factory
16. 🧬 Prompt Genome
17. 🗂️ Asset Library (incluant le Visual Source Lab)
18. 🧠 Production Memory
19. 📊 Production Analytics
20. ⚙️ Model Lab (capacités, champions et challengers audiovisuels, Job Queue)

**Production Control Room** (écran principal)
- Champ de saisie libre, par exemple : « Crée une vidéo humoristique sénégalaise de 60 s où une belle-mère
  découvre que son gendre lui a caché quelque chose ».
- Fiche projet : titre, format, langue, durée, plateforme, style, statut, coût estimé et réel, modèles utilisés,
  nombre de scènes, personnages, assets, régénérations, score qualité, avancement.
- Frise des étapes : IDEA → STORY → CHARACTERS → WORLD → STYLE → STORYBOARD → IMAGES → (VIDEO, désactivée par
  défaut) → DIALOGUE → VOICE → SOUND → SUBTITLES → EDIT → QA → EXPORT. Chaque étape porte l'un des statuts
  QUEUED, RUNNING, COMPLETED, WARNING, FAILED, NEEDS REVIEW ou DISABLED.
- **Autopilot** : « Produis cette vidéo » enchaîne tout, avec un bouton Pause/Stop à chaque étape et une
  confirmation avant toute dépense au-delà du plafond.

**Story**
- Produit le concept, la logline, le synopsis, la structure (hook dans la 1re seconde, escalade, twist, chute de
  moins de 10 mots), les personnages, le conflit, le climax, la résolution et la durée.
- Puis la **liste des scènes**. Champs de chaque scène : `scene_id, duration, location, time, characters, action,
  dialogue, emotion, camera, lighting, sound, music, transition, visual_prompt, video_prompt, voice_prompt,
  subtitle_prompt`.
- Répliques de 12 mots maximum, écrites pour être dites à voix haute. Le wolof est permis, avec sa traduction pour
  les sous-titres.

**Character** (Character Bible)
- Fiche : ID, NAME, ROLE, AGE, GENDER, ETHNICITY, SKIN, FACE, HAIR, BODY, HEIGHT, CLOTHING, SHOES, ACCESSORIES,
  VOICE, ACCENT, PERSONALITY, EMOTIONAL PROFILE, GESTURES, POSTURE, WALK, FACIAL EXPRESSIONS, SPEAKING STYLE.
- Images de référence et **Consistency Profile** (descripteur textuel compact plus références).
- Variantes : face, profil, 3/4, en pied, gros plan, émotions (neutral, angry, shock, smug, laugh), action, assis,
  marche, parle.
- **Import de la bibliothèque existante** par glisser-déposer ou `<input webkitdirectory>` : un dossier
  `NOM/pose.png` avec son `meta.json` crée la fiche automatiquement.
- **Redessin 2D HQ** :
  - une image par pose, la pose neutre redessinée servant ensuite de référence de style pour toutes les autres ;
  - tâche « 2D redraw », choix de modèle par capacités (édition d'image avec référence, ratio et résolution
    supportés) ;
  - consigne de contenu : garder visage, pose, tenue, motifs et proportions, fond blanc uni, aucun logo.

**World** (World Bible)
- Lieux persistants : Dakar, maison, salon, cour, rue, marché, bureau, plage, maquis, quartier.
- Pour chacun : architecture, palette, lumière, météo, heure, textures, objets, arrière-plan, angles de caméra
  possibles, références.

**Style** (Style DNA)
- Dimensions : COLOR, LIGHTING, MATERIAL, CAMERA, LENS, DEPTH, CONTRAST, TEXTURE, CHARACTER DESIGN, ENVIRONMENT
  DESIGN, ANIMATION STYLE, RENDER STYLE, POST PROCESSING.
- Valeur par défaut verrouillée : **2D HQ franco-africaine** (§ 0.1).
- Le Style DNA est injecté dans **toute** génération.
- « Utilise le style de cette image » crée une nouvelle variante de Style DNA à partir de la référence, quand le
  modèle accepte des références.

**Scene Director**
- Composer : type de plan, caméra, objectif (24, 35, 50, 85 mm), lumière, mouvements des personnages, du visage
  et de l'environnement, dialogue, ambiance, bruitages, musique, durée, ratio.
- Storyboard visuel en cartes : vignette, personnages, action, dialogue, caméra, audio, modèle, statut, qualité.
  Les scènes se réordonnent par glisser-déposer.

**Prompt Genome**
- Un **moteur de composition**, pas une liste de prompts.
- Dimensions : SUBJECT, CHARACTER, LOCATION, ACTION, EMOTION, CAMERA, LENS, LIGHTING, COLOR, STYLE, MATERIAL,
  COMPOSITION, DEPTH, MOTION, CINEMATOGRAPHY, DIALOGUE, AUDIO, AMBIENCE, SFX, MUSIC, QUALITY, NEGATIVE,
  PLATFORM, ASPECT, DURATION.
- Gabarits : image, vidéo, image→vidéo, personnage, décor, dialogue, voix, bruitage, musique, sous-titres.
- Chaque prompt compilé est versionné (`prompt_version`) et adapté au modèle choisi (longueur, langue, paramètres
  supportés).
- Bibliothèque de motifs composables : cinématographie, comédie, histoires africaines, vidéo sociale, animation
  2D, voix, bruitages, musique.

**Image Factory**
- Modes : texte→image, image→image, retouche, référence→image, cohérence de personnage, transfert de style,
  génération de scène, variantes (4, 8 ou 16), agrandissement si un modèle le propose.
- Chaque résultat affiche : modèle, prompt, graine (si renvoyée), **coût réel (`usage.cost`)**, latence,
  qualité QA, références utilisées.
- Actions : USE, EDIT, REGENERATE, SAVE CHARACTER, SAVE STYLE, SEND TO STORYBOARD (et SEND TO VIDEO si la Video
  Factory est active).

**Video Factory** (désactivée par défaut, § 0.1)
- Une fois activée par le propriétaire, avec un budget saisi : modes texte→vidéo, image→vidéo, première image,
  première et dernière image, référence, personnage, scène.
- Paramètres proposés **uniquement** parmi ceux que le modèle déclare.
- Cycle d'un job : soumission → id → interrogation espacée (10 à 15 s) → progression → résultat → enregistrement
  de l'asset.
- Boutons CANCEL, RETRY, REGENERATE et FALLBACK MODEL.
- **Un job déjà payé n'est jamais relancé automatiquement.**

**Grok Imagine Video**
- Intégration de premier rang, parce que le propriétaire l'utilise déjà pour faire parler ses personnages, mais
  **jamais obligatoire**.
- Vérifie dans les capacités découvertes si elle génère de l'audio : à la date de l'audit, sa fiche n'annonçait
  pas `generate_audio`.
- JEV compare Grok, Veo, Seedance, Kling, Wan, Sora et les autres selon les capacités réelles et l'historique.

**« Fais parler ce personnage »**
- Chaîne : IMAGE DU PERSONNAGE → capacité vidéo (première image) → voix (TTS du profil vocal) → capacité de
  lip-sync ou de génération audio native → QA (synchro, visage) → secours.
- Secours prioritaire et gratuit : export vers le moteur 2D local (lip-sync Rhubarb), § 9.

**Dialogue**
- Pour chaque réplique : personnage, texte, émotion, intensité, débit, pauses, accent, langue (français, wolof,
  anglais…).
- Les répliques sont synchronisables avec la scène.

**Voice**
- Bibliothèque de voix par personnage : VOICE ID, langue, accent, genre, âge, hauteur, vitesse, émotion, style.
- PREVIEW, GENERATE, REGENERATE, SAVE PROFILE.
- La TTS passe par `/audio/speech`, avec en priorité les modèles gratuits validés.
- Le clonage depuis un échantillon fourni par le propriétaire n'est possible qu'avec son accord explicite et pour
  les modèles qui le déclarent.
- **Le profil de voix ne contient jamais de secret.**

**Sound**
- Pour chaque scène : ambiance, bruitages, foley, room tone. JEV propose les bruitages selon l'action (porte,
  téléphone, foule, marché, rires, surprise, impact…).
- Sources : bibliothèque locale importée (CC0, par exemple Kenney) en priorité. Un modèle génératif n'intervient
  que s'il est découvert et autorisé.

**Music**
- Paramètres : genre, ambiance, tempo, instruments (balafon, djembé, kora…), durée, énergie, contexte culturel,
  intro, montée, climax, outro.
- Génération via un modèle découvert seulement après sonde validée. Sinon, deux options :
  - **synthèse procédurale locale** en WebAudio (balafon et djembé simples, gratuite) ;
  - musique importée.

**Subtitles**
- Transcription automatique si une capacité existe ; sinon, timing calculé à partir du texte et de la durée de la
  voix.
- Styles CLEAN, COMEDY, CINEMATIC, SOCIAL, DYNAMIC, avec mot actif surligné.
- Formats 9:16, 16:9 et 1:1 pour TikTok, Reels, Shorts et YouTube.
- **Emojis contextuels**, déduits de l'émotion et de l'action, jamais aléatoires.

**AI Editor**
- Timeline à pistes VIDEO/IMAGES, DIALOGUE, VOICE, MUSIC, SFX, SUBTITLES.
- Opérations : couper, rogner, scinder, réordonner, transitions, niveaux audio, fondus, texte, emoji, vitesse,
  zoom, recadrage.
- Montage automatique à partir du storyboard.
- **Rendu d'aperçu dans le navigateur** : canvas, WebAudio et `MediaRecorder` (WebM, ou MP4 si le navigateur le
  supporte), ce qui produit une animatique avec voix et sous-titres.
- Si une capacité manque, affiche « Capability unavailable in current environment » et propose l'export du kit
  vers le moteur 2D local.

**Social Factory**
- Déclinaisons TikTok, Reels, Shorts, YouTube et Facebook ; formats 9:16, 16:9 et 1:1.
- Produit : hook (plusieurs variantes), titre, description, légende avec une **question qui force à choisir un
  camp**, sous-titres, emojis, 6 à 8 hashtags, miniature et appel à l'action.
- Rappel obligatoire : étiquette « contenu IA » sur TikTok.

**Asset Library et Visual Source Lab**
- Types : image, vidéo, audio, voix, musique, bruitage, personnage, style, monde, scène, prompt.
- Métadonnées : projet, scène, personnage, modèle, prompt, date, coût, qualité, source, tags.
- Recherche par filtres. Recherche sémantique seulement si une capacité d'embeddings existe déjà dans le
  Workbench (à réutiliser).
- Les binaires vont dans une base IndexedDB dédiée `massamba-visual-studio`, avec quota surveillé et alerte
  au-delà de 80 %.
- Trois statuts distincts : **SOURCE REFERENCE / GENERATED ASSET / FINAL ASSET**.
- Toute référence venue d'Internet porte la mention : **« Reference asset — verify usage rights before
  publication »**. Une telle image n'est jamais présentée comme libre de droits.

**Production Memory**
- Mémorise ce qui a marché et échoué : meilleur modèle, motif de prompt, réglages de personnage, style, réglages
  vidéo, voix, bruitages, musique.
- Mêmes principes que le Champion/Challenger existant : **une réussite isolée ne devient jamais une règle**.

**Production Analytics**
- Indicateurs : vidéos produites, images générées, coût total, coût par vidéo et par scène, qualité moyenne, taux
  de réussite, de régénération et de secours, dépense premium évitée, meilleurs modèle, style et personnage,
  première cause d'échec.
- Graphiques à partir des **seules données réelles**. Sans données : « Aucune donnée réelle disponible ».

## 5. CAPABILITY FABRIC MULTIMÉDIA ET CHAMPION/CHALLENGER AUDIOVISUEL

**MediaCapabilityRegistry**
- Construit à chaque ouverture du studio (cache d'une heure) et sur le bouton « DISCOVER CAPABILITIES », à partir
  des quatre endpoints de découverte (§ 0.4).
- Pour chaque modèle, il note :
  - capacités : IMAGE_GENERATION, IMAGE_EDITING, REFERENCE_IMAGES, VIDEO_GENERATION, IMAGE_TO_VIDEO,
    FIRST_LAST_FRAME, REFERENCE_TO_VIDEO, AUDIO (natif), SPEECH, VOICE_CLONING, VOICES[] ;
  - paramètres acceptés : ASPECT_RATIOS[], DURATIONS[], RESOLUTIONS[], SEED, PASSTHROUGH[] ;
  - PRICING (brut, tel que fourni) et LATENCY (mesurée, sinon vide).
- Il est relié au Capability Fabric existant via `setFabric`, sous une entrée `media`, en ajout uniquement.
- Les modèles qui apparaissent ou disparaissent sont signalés (« nouveau », « retiré ») ; un modèle retiré n'est
  plus jamais proposé.

**Calcul du coût avant appel**
- Il se fait à partir de `pricing_skus` et du prix par image, selon le format **réel** déclaré.
- Format inconnu ou ambigu, par exemple `video_tokens` : coût affiché « estimation incertaine » avec la formule,
  et confirmation obligatoire.
- Après l'appel, le coût réel est toujours lu dans `usage.cost` et rapproché de l'estimation.

**Champions et challengers**
- Ils sont définis par la combinaison : type de média, famille de tâche, style, risque et contrat de sortie.
  Exemples : `IMAGE / 2D-REDRAW / 2D-HQ`, `IMAGE / CHARACTER-CONSISTENCY / 2D-HQ`, `VOICE / FRENCH`,
  `VOICE / WOLOF`, `VIDEO / I2V / TALKING / 9:16`.
- Promotion au rang de champion seulement après une validation statistique suffisante, avec les seuils du
  CHAMPION SCIENCE LAB existant.
- Affichage : n, qualité, taux de réussite, confiance, coût, latence, performance récente, challenger, décision.
  **Jamais « Best model »** avec un échantillon insuffisant.

**Apprentice et Teacher** (existants, étendus au média)
- Modèle gratuit ou peu cher → skills style et personnage → génération → QA → correction → secours premium.
- Un nouveau modèle gratuit compétitif suit le parcours DISCOVER → TEST → VALIDATE → CHALLENGER → CHAMPION.
- Le Teacher analyse les échecs et propose une stratégie corrigée pour retenter avec un modèle moins cher.
- Sa dépense est classée **« LEARNING INVESTMENT »** quand elle améliore durablement une stratégie. Elle est
  enregistrée dans `jevSpend` et le JEV_LOG.

## 6. COST GOVERNOR, JOB QUEUE, ERREURS

**MediaCostGovernor**
- Avant chaque appel, il compare : coût du modèle, coût de JEV, chance de réussite (historique, sinon
  « inconnue »), gain de qualité attendu, coût du secours.
- Il n'utilise jamais un modèle premium si un modèle validé moins cher suffit. Il ne sacrifie jamais une qualité
  critique (visage, cohérence) pour économiser.
- Modes : ECO, BALANCED, QUALITY, PREMIUM, AUTOPILOT. Le mode par défaut est **ECO**, en cohérence avec l'objectif
  de moins de 1 $ par vidéo.
- **Plafond dur par production** : 1 $ par défaut. Tout appel qui le dépasserait est bloqué et demande une
  confirmation explicite.
- Le crédit OpenRouter est affiché via `mr()`.
- Le propriétaire est invité à poser aussi une **limite de crédit sur la clé** côté openrouter.ai.

**ProductionJobs**
- File persistante (survit à la fermeture du navigateur) avec les statuts QUEUED, RUNNING, COMPLETED, FAILED et
  CANCELLED.
- Champs : ID, modèle, tâche, scène, statut, début, fin, coût, erreur, nombre de relances.
- À la réouverture, les jobs vidéo `RUNNING` sont **réinterrogés**, jamais soumis à nouveau.

**Erreurs**
- Chaque appel a un délai maximal, des relances avec attente exponentielle **uniquement pour les erreurs
  transitoires** (429, 5xx, réseau) et un secours.
- Messages lisibles via `_r` étendu, avec la classification : AUTH_ERROR, RATE_LIMIT, INVALID_PARAMETER,
  UNSUPPORTED_CAPABILITY, TIMEOUT, SERVER_ERROR, CONTENT_ERROR, INSUFFICIENT_CREDITS, UNKNOWN.

## 7. QA, CONTINUITÉ, AUTO-RÉPARATION

**ProductionQA**
- Contrôles : cohérence des personnages et du style, continuité de scène, cohérence temporelle, dialogue,
  synchro voix, sous-titres, niveaux audio, qualité visuelle, format, durée (plus de 60 s pour TikTok) et
  sécurité du contenu.
- Pour la sécurité du contenu : aucune vraie personne identifiable, **aucun logo de marque réelle**, pas de
  moquerie d'ethnie, de religion ou de handicap.
- Scores VISUAL, NARRATIVE, AUDIO, CONSISTENCY, TECHNICAL et SOCIAL, plus un TOTAL sur 100.
- Les scores visuels viennent d'un modèle de vision **existant** du Workbench (routage normal) **avec mention du
  juge et de sa confiance**. Si aucun juge n'est disponible, la case reste vide : on ne met jamais de score par
  défaut.

**ContinuityEngine**
- Vérifie : personnage, tenue, lieu, lumière, heure, objets, dialogue, caméra.
- Propagation du contexte vers chaque scène : histoire globale, Style DNA, bibles de personnages et de décors,
  état de la scène précédente, scène courante, intention de la scène suivante.
- Ce contexte est **compressé par JEV** : on n'envoie jamais tout le projet.

**Auto-réparation ciblée** (jamais une régénération à l'aveugle)
| Problème | Correction |
|---|---|
| Visage qui dérive | régénérer la référence du personnage |
| Voix incohérente | régénérer la voix |
| Rupture de continuité | injecter l'état de la scène précédente |
| Mauvaise caméra | recompiler le prompt |
| Sous-titres décalés | recalculer le timing |
| Mauvais lip-sync | autre chaîne parole/vidéo, ou moteur 2D local |
| Mauvais ratio | recadrage |

Chaque correction est journalisée.

## 8. PRODUCTION BLUEPRINT ET EXPORTS

**Blueprint**
- Une production est sauvegardée sous la forme d'un JSON :
  `{project, title, language, duration, platform, styleDNA, characters, worlds, scenes, assets(refs), prompts,
  models, generationJobs, audio, subtitles, timeline, qa, costs, decisions, revisions}`.
- Il est versionné et permet de reprendre une production après fermeture du navigateur.

**Exports**
- Formats : projet (JSON + assets en ZIP), vidéo d'aperçu, scène, storyboard (PNG ou HTML imprimable), assets,
  prompts, **rapport de production** (histoire, personnages, scènes, modèles, prompts, coûts réels, qualité,
  erreurs, régénérations, sortie finale).
- Le ZIP est fait sans dépendance réseau : utilise une bibliothèque déjà présente dans le bundle si elle existe,
  sinon écris un petit ZIP « store ».
- **Aucun export ne contient de clé ni de jeton.** Un scan de motifs de secrets bloque l'export si nécessaire.

## 9. PONT AVEC LE MOTEUR LOCAL `afrikatoon-auto` (spécifique à notre contexte)

**Bouton « Exporter le kit afrikatoon-auto »**
Il produit un ZIP contenant :
- `kits/<AAAA-MM-JJ>/<NN>-<slug>.json`, au schéma attendu par `run.py` :
  `{title, concept, characters[], setting, theme, scenes:[{act, beat ("hook"|"escalade"|"twist"|"chute"…),
  characters[], image_prompt, animation_prompt, dialogue:[{speaker, text}]}], hook_text, caption, hashtags[],
  score{}}`. Les noms des personnages sont en MAJUSCULES, comme dans `assets/characters/` ;
- `assets/characters_2d_ia/<NOM>/<pose>.png` et `meta.json` pour les personnages redessinés dans le studio (poses
  neutral, angry, shock, smug, laugh) ;
- `assets/backgrounds_2d_ia_<décor>.png` ;
- un `LISEZMOI.txt` avec la commande à lancer :
  `AFRIKATOON_2D_DIR=characters_2d_ia python run.py run --kit kits/…json --mock 2d-hq --no-upload`.

**Import du résultat**
- La vidéo finale, `caption.txt` et la planche contact importées dans l'Asset Library deviennent des FINAL ASSET.
- Leur coût est de 0 $ : rendu local.

## 10. SÉCURITÉ (en plus du module Security existant)

- La clé OpenRouter reste dans le stockage existant `wbd.openrouter-key`. Elle n'est jamais copiée ailleurs,
  jamais injectée dans un prompt, un log, le JEV_LOG, un blueprint ou un export, et jamais affichée autrement que
  par `fr()`.
- Les prompts envoyés aux modèles sont filtrés contre les motifs de secrets (clés, jetons, mots de passe).
- Le contenu renvoyé par les modèles (texte, métadonnées) est une donnée, pas un ordre.
- Pas d'`eval`, pas d'`innerHTML` avec du texte de modèle sans échappement. Les vidéos et images téléchargées
  sont traitées comme des blobs.
- Aucune donnée professionnelle (banque, clients) n'est envoyée aux modèles du studio.

## 11. DESIGN ET RESPONSIVE

- Premium, cinématographique et technique, entre Adobe, DaVinci Resolve, Runway, un storyboard et une salle de
  contrôle IA : grandes cartes visuelles, vignettes, storyboard, timeline, barres de progression, badges de
  modèle, jauges de qualité et de coût, file des jobs, cartes de scène et de personnage.
- **Cohérent avec le Workbench** : mêmes jetons, mêmes thèmes, même typographie.
- Priorité au poste de travail, compatible portable et tablette. Pas de défilement horizontal de la page.

## 12. RÈGLE ABSOLUE : AUCUNE DONNÉE INVENTÉE

- Jamais de fausses générations, de faux modèles, de faux prix, de faux scores, de faux benchmarks, de fausses
  économies ni de faux champions.
- Sans donnée réelle : **« Aucune donnée réelle disponible. »**
- Fonction impossible dans le navigateur ou via OpenRouter : **« Capability unavailable in current
  environment »** avec le secours proposé.
- Démos autorisées uniquement sous l'étiquette **« SIMULATED TEST ONLY »** (convention existante) : jamais
  journalisées, jamais comptées.

## 13. PHASES (dans cet ordre ; ne passe à la suivante que si la précédente est validée)

| Phase | Contenu |
|---|---|
| 1 | Audit, patches de greffe, bridge, coquille du studio, interrupteur `vs.enabled` |
| 2 | MediaCapabilityRegistry, Cost Governor, Job Queue, erreurs |
| 3 | Story, Character (import de la bibliothèque, redessin 2D HQ), World, Style DNA, Prompt Genome |
| 4 | Image Factory |
| 5 | Dialogue, Voice, Sound, Music (local d'abord), Subtitles |
| 6 | Storyboard, AI Editor (aperçu MediaRecorder), Export du kit `afrikatoon-auto` |
| 7 | Autopilot et Production Control Room |
| 8 | QA, Continuity, auto-réparation |
| 9 | Champion/Challenger audiovisuel, Apprentice/Teacher média, Production Memory, Analytics |
| 10 | Video Factory (désactivée par défaut) et chaîne « Fais parler ce personnage » |
| 11 | Social Factory, exports, rapport de production |
| 12 | Tests et non-régression |

Si une session ne suffit pas, livre une version **stable et fonctionnelle** à la fin d'une phase complète, avec
la liste exacte de ce qui reste. Ne livre jamais une version cassée ou décorative.

## 14. TESTS (exécutés réellement, dans Chromium sans interface via Playwright, en `file://`)

**Non-régression**
1. Le Workbench se charge sans erreur console nouvelle par rapport à `_14` (compare les deux fichiers).
2. Les 14 vues d'origine s'ouvrent et JEV et ses sous-onglets s'affichent.
3. `a9().ok === true` (régression intégrée) ; seul `studio` apparaît dans `added`.
4. Les modules suivants sont intacts : Apprentice, Champion/Challenger, Model Council, Skills, Memory, Security,
   Cost Intelligence, Benchmark.
5. Les clés IndexedDB existantes ne sont pas modifiées par le studio.
6. Studio désactivé : comportement identique à `_14` (aucun appel réseau, aucune écriture).

**Studio**
7. Le studio se charge.
8. La découverte des capacités fonctionne en réel sur les endpoints publics, sans clé.
9. Le chemin image fonctionne : simulé par interception réseau Playwright (`route`), puis **un seul** appel réel
   si une clé est disponible et que le propriétaire l'autorise.
10. Le chemin job vidéo (soumission, interrogation, terminé, échec) fonctionne avec un serveur intercepté.
11. Le secours et la classification des erreurs (401, 402, 429, 5xx, timeout, paramètre invalide) fonctionnent.
12. L'Asset Library fonctionne.
13. Le blueprint est sauvegardé et rechargé après rechargement de la page.
14. Le Prompt Genome fonctionne.
15. Le QA fonctionne.
16. L'export du kit `afrikatoon-auto` produit un JSON valide au schéma du § 9.
17. **Aucune métrique fictive** : avec une base vide, toutes les vues affichent « Aucune donnée réelle
    disponible ».
18. **Aucun secret exposé** : recherche de la clé de test dans le DOM, IndexedDB, localStorage hors
    `wbd.openrouter-key`, les exports et le JEV_LOG.
19. Plafond de budget : un appel qui dépasserait le plafond est bloqué.

Revue finale complète : fonctions, références, événements, appels API, JSON, états, erreurs JS, boutons, modales,
sauvegardes, secours. **Corrige toute régression avant de livrer.**

## 15. LIVRABLE ET COMPTE RENDU

Livre `massamba-workbench-direct_15.html` (le `_14` reste intact), puis donne :
1. le résumé des modules ajoutés ;
2. l'architecture (patches, bridge, module, stockage) ;
3. les modèles et capacités **réellement détectés** le jour du test, avec leur source ;
4. les fonctionnalités réellement opérationnelles ;
5. les fonctionnalités qui dépendent d'une capacité externe ou d'une clé ;
6. les tests effectués, avec leur résultat réel ;
7. les régressions détectées ;
8. les corrections effectuées ;
9. une estimation des coûts par type de production, **calculée à partir des prix lus en direct**, avec la date ;
10. un mode d'emploi en 10 lignes, pour un utilisateur Windows qui ouvre le fichier par double-clic.

Commence par l'audit du fichier. Puis implémente réellement. Ne te contente pas d'une explication.
