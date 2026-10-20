# Savoir-faire vidéo et 3D retiré de Workbench (16/10/2026)

Fiches de savoir-faire que l'agent du chat de Workbench utilisait pour la vidéo, la 3D et Blender. Elles renvoyaient
aux outils et écrans désormais dans Studio Vidéo ; elles sont gardées ici mot pour mot, comme référence du domaine.

## Fiches « métier » (server/engine/skillsCraft.ts)

```ts
  // ── Video / 3D (Film Autopilot, circuit Grok, troupe 3D, Blender) ──
  {
    ...BASE,
    name: 'video_prompting',
    description: 'Prompts vidéo conformes au modèle (skill video-prompting) : mouvements de caméra, actions calées sur la durée, dialogues, images de référence ; aucun nom de modèle / durée / format dans le prompt.',
    capabilities: ['un mouvement de caméra par plan', 'vocabulaire de cadrage', 'temps d’action calés sur la durée', 'fiches par modèle (Veo, Wan, Seedance, LTX, MiniMax)', 'planches personnage'],
    triggers: ['prompt (de )?vid[ée]o', 'prompt video', '\\bgrok\\b', '\\bveo\\b', '\\bkling\\b', 'seedance', '\\bwan\\b', '\\bltx\\b', 'minimax', 'image.to.video', 'image vers vid[ée]o', 'texte vers vid[ée]o', 'g[ée]n[ée]ration vid[ée]o', 'animation vid[ée]o', 'clip vid[ée]o'],
    required_tools: [],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    security_profile: 'lecture seule',
    agents: ['omnipotent'],
    companions: ['character_design'],
    source: 'square-zero-labs/video-prompting-skill (Apache-2.0) — hook shapeVideoPrompt',
    license: 'Apache-2.0',
    playbook:
      'Follow the video-prompting skill (skill.read video-prompting, then references/models/<model>/prompting.md for the named model). Route: video prompt or character sheet; identify model and input mode (t2v / i2v / reference); for i2v the image is the anchor — describe motion, camera, performance and audio, not the image; one camera move per shot, cinematography vocabulary (close-up, wide shot, slow dolly in…); never the model name, duration, aspect ratio or resolution inside the prompt (parameters go in a separate line); as many action beats as the clip length supports. In the Film Autopilot this runs in code (shapeVideoPrompt in every Grok / animation prompt) while the skill is enabled.',
  },
  {
    ...BASE,
    name: 'character_design',
    description: 'Cohérence des personnages (skill character-design) : ancre d’identité immuable répétée dans chaque prompt, bloc variable par plan, planches de référence, escalade de cohérence.',
    capabilities: ['ancre d’identité', 'bloc variable par plan', 'planches / turnarounds / expressions', 'ce qui ne doit pas dériver'],
    triggers: ['personnage', 'fiche personnage', 'planche', 'turnaround', 'expressions? du personnage', 'coh[ée]rence des personnages', 'm[êe]me visage', 'identit[ée] du personnage', 'mascotte', 'afrikatoon'],
    required_tools: [],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    security_profile: 'lecture seule',
    agents: ['omnipotent'],
    companions: ['video_prompting'],
    source: 'fal-ai-community/skills character-design (MIT) — hook characterAnchor',
    license: 'MIT',
    playbook:
      'Follow the character-design skill (skill.read character-design, references/anchor-system.md). Write a short immutable CHARACTER ANCHOR (codename, age range, face, eyes, nose/mouth, skin marks, hair, build/posture, signature wardrobe or accessory, style) and repeat it verbatim in every prompt of that character; a SHOT VARIABLE block carries what may change (expression, pose, setting, camera, lighting, mood). Never rewrite the anchor casually: if identity drifts, strengthen the anchor or use an approved reference image. In the Film Autopilot the anchor is built from the character sheet (characterAnchor) and the owner’s drawn sheets stay the references.',
  },
  {
    ...BASE,
    name: 'video_storyboard',
    description: 'Storyboard de production (skill video-storyboard) : idée → plans de ~5 s avec durées, cadrages, mouvements, continuité entre personnages, décors et accessoires ; thème visuel commun.',
    capabilities: ['cadence par plateforme', 'thème visuel verrouillé', 'plan par plan (cadrage, mouvement, lumière, sujet, action)', 'arc narratif', 'check-list de post-production'],
    triggers: ['storyboard', 'd[ée]coupage', 'plan par plan', 'liste de plans', 'shot list', 's[ée]quence', '\\breel\\b', 'tiktok', '\\bshorts?\\b', 'publicit[ée] vid[ée]o', 'explainer', 'vid[ée]o de \\d+ ?s'],
    required_tools: [],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    security_profile: 'lecture seule',
    agents: ['omnipotent'],
    companions: ['video_prompting', 'character_design'],
    source: 'aicontentskills/ai-video-storyboard-skill (MIT) — hooks shotPlan, visualTheme',
    license: 'MIT',
    playbook:
      'Follow the video-storyboard skill. Brief intake (platform, duration, subject, tone, call to action, constraints); cadence of ~5 s shots; lock the Visual Theme first (palette, lighting, lens, film look, motion language) and respect it in every shot; each shot: purpose, composition (shot size + angle), one camera move, lighting, subject, action, a concrete 40–80-word prompt, audio direction; a story arc (hook / build / payoff / CTA or problem / solution / proof / CTA); post-production checklist; why it works. In the Film Autopilot shotPlan and visualTheme run at the SCENES stage while the skill is enabled.',
  },
  {
    ...BASE,
    name: 'video_director',
    description: 'Réalisation et finition (skill video-director) : histoire → package de production dirigé — traitement, clips de 15 s au plus, un événement par clip, 2–5 temps, continuité entre clips, son, validation.',
    capabilities: ['traitement du réalisateur', 'durée calculée avant les prompts', 'clips ≤ 15 s, un événement, 2–5 temps', 'plan de continuité entre clips', 'validation avant livraison'],
    triggers: ['r[ée]alisat', 'r[ée]alise (une|la) vid[ée]o', 'court.m[ée]trage', '\\bfilm\\b', 'mini.s[ée]rie', 'histoire en vid[ée]o', 'sc[ée]nario vid[ée]o', 'vid[ée]o narrative', 'package de production', 'rythme du film', 'continuit[ée]'],
    required_tools: [],
    recommended_models: { metric: 'intelligence', tier: 'quality' },
    security_profile: 'lecture seule',
    agents: ['omnipotent'],
    companions: ['video_storyboard', 'character_design', 'cinema_craft'],
    source: 'zlbigger/story-video-director (MIT) — hook directorBeats',
    license: 'MIT',
    playbook:
      'Follow the video-director skill (skill.read video-director; references/directing-and-runtime.md, continuity-and-edit-design.md). Resolve the input (central event, emotional destination, genre, characters, locations, props, continuity risks); compute the runtime from information density before any prompt; write the causal scene sequence, then split into generation units: every clip ≤ 15 s, one principal event, 2–5 timed beats, explicit opening and final state, dialogue that fits; design every clip boundary (continuation, coverage, reaction, insert, sound bridge); director treatment (visual language) before assets; validate before delivery. In the Film Autopilot directorBeats enforces these invariants on every scene while the skill is enabled — fewer failed Grok takes, lower cost.',
  },
  {
    ...BASE,
    name: 'blender_cinematic',
    description: 'Scènes Blender cinématographiques (skill blender-cinematic-scene) : modélisation bpy, éclairage PBR cinéma, caméra, animation, cycles de vérification sur rendu réel.',
    capabilities: ['blockout → détail', 'éclairage trois points', 'caméra 50 mm + profondeur de champ', 'rendu de vérification', 'performance mesurée'],
    triggers: ['blender', '\\bbpy\\b', 'sc[èe]ne 3d', '[ée]clairage cin[ée]ma', 'lumi[èe]re trois points', 'cam[ée]ra 3d', 'rendu 3d', 'animation de cam[ée]ra', 'objet 3d', 'mod[ée]lisation', '\\bglb\\b', 'studio 3d'],
    required_tools: [],
    recommended_models: { metric: 'coding', tier: 'quality' },
    security_profile: 'écrit dans l’espace de travail',
    agents: ['coder', 'architect'],
    companions: ['code_generation'],
    source: 'Evan1108-Coder/blender-cinematic-modeling-skill (MIT) — hook blenderScript cinematic',
    license: 'MIT',
    playbook:
      'Follow the blender-cinematic-scene skill (references/visual-quality.md, verification.md). Establish the target (subject, deliverable: still / animation / interactive); blockout silhouette, scale and camera views before detail; model thickness and recesses where they affect silhouette and shadows; cinematic PBR lighting (key / fill / rim), a camera with a real focal length and depth of field; execute in Blender, capture logs, fix, re-run; verify on actual renders early (a concept image is not evidence); measure performance honestly. In the app, blender.scene writes the bpy script with the cinematic rig and a verification still (`--verify`) while the skill is enabled.',
  },
  {
    ...BASE,
    name: 'remotion_motion_graphics',
    description: 'Motion graphics par code (skill remotion-motion-graphics) : titres, lower thirds, génériques, compte à rebours, sous-titres, graphiques animés ; diagnostic avant décoration, vérification image par image.',
    capabilities: ['entrée → tenue → sortie complètes', 'ressort / easing, jamais linéaire', 'décalage 3–5 images', 'marges de sécurité', 'vérification sur images fixes', 'son'],
    triggers: ['motion (design|graphics)', 'titre anim', 'lower third', 'g[ée]n[ée]rique', 'remotion', 'animation typographique', 'incrustation', 'habillage vid[ée]o', 'compte [àa] rebours', 'badge anim', 'texte anim', 'vid[ée]o anim[ée]e par code'],
    required_tools: [],
    recommended_models: { metric: 'coding', tier: 'balanced' },
    security_profile: 'écrit dans l’espace de travail',
    agents: ['coder'],
    companions: ['remotion_best_practices'],
    source: 'fernandokaraka/remotion-motion-graphics-skill (MIT)',
    license: 'MIT',
    playbook:
      'Follow the remotion-motion-graphics skill (references/traps.md before any animation code, patterns.md, polish.md). Diagnose before decorating (check what the code computes at frame 0, mid and last — e.g. interpolate without clamp shows a wrong number); verify with stills at key frames and read them; craft checklist: complete enter → hold → exit, never linear (spring / easing), stagger 3–5 frames, idle life during the hold, one payoff, geometric light not clip-art, title-safe margins and scrim behind text, timing that follows content, data-driven props, canvas-relative sizing; add sound on entrances / exits. The app’s frame-exact montage engine follows the same rules.',
  },
  {
    ...BASE,
    name: 'marketing_video',
    description: 'Vidéo marketing / lancement (skill remotion-marketing-video) : brief, jetons de marque, inventaire des assets, storyboard avant le code, prévisualisation, validation par critiques, rendu par plateforme.',
    capabilities: ['brief + jetons de marque', 'storyboard avant le code', 'produit visible en 3 s', 'texte lisible à 720p', 'sous-titres incrustés', 'boucle rendu → audit → critiques'],
    triggers: ['vid[ée]o marketing', 'vid[ée]o de lancement', 'lancement produit', '\\bpromo\\b', 'publicit[ée]', '\\bpub\\b', 'vid[ée]o sociale', 'd[ée]mo produit', 'avant.apr[èe]s', 'vid[ée]o linkedin', 'contenu social', 'teaser'],
    required_tools: [],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    security_profile: 'lecture seule',
    agents: ['omnipotent'],
    companions: ['video_storyboard', 'remotion_motion_graphics'],
    source: 'EveryInc/product-launch-video (MIT)',
    license: 'MIT',
    playbook:
      'Follow the remotion-marketing-video skill. Gather inputs in parallel (brief: headline, taglines, features, tone; brand tokens: fonts, colours, logo — the imported logo and chosen design of the app; real product UI copy, never invented labels); storyboard before any code (beat / time / visual / text table); lead with the viewer’s problem, product visible within 3 s, before/after as the money shot, text readable at 720p (≥ 18 px), captions burned in; render-audit loop on single frames, then critics (design, readability, pacing, brand consistency), then ship per platform (aspect, fps).',
  },
  {
    ...BASE,
    name: 'remotion_best_practices',
    description: 'Suite de référence Remotion (skill remotion-best-practices) : compositions, animations, polices, timing, sous-titres, prévisualisation, rendu — tout est fonction de l’image courante.',
    capabilities: ['compositions et séquences', 'timing en images', 'polices locales', 'captions (pages courtes)', 'prévisualisation avant rendu', 'rendu'],
    triggers: ['remotion', 'composition vid[ée]o', 'vid[ée]o par code', 'vid[ée]o react', 'usecurrentframe', 'sous.titres? synchronis', 'captions', 'rendu vid[ée]o programmatique', 'timing des animations', 'pr[ée]visualisation vid[ée]o'],
    required_tools: [],
    recommended_models: { metric: 'coding', tier: 'balanced' },
    security_profile: 'écrit dans l’espace de travail',
    agents: ['coder'],
    companions: [],
    source: 'remotion-dev/skills (MIT) — hook pageCaptions',
    license: 'MIT',
    playbook:
      'Follow the remotion-best-practices router (skill.read remotion-best-practices, then the REFERENCE.md of the need: remotion-create, remotion-markup, remotion-captions, remotion-multimedia, remotion-render, remotion-studio). Every animated value is a function of useCurrentFrame(); timing in frames via fps; no non-deterministic CSS animation; preserve user edits; open the preview before rendering and render only on explicit request; captions as short pages kept in the clip’s own Sequence. In the app’s montage the subtitle pages (pageCaptions) follow the captions rule while the skill is enabled.',
  },
  {
    ...BASE,
    name: 'cinema_craft',
    description: 'Chaîne de production cinéma (skill cinema-skills + 5 compétences) : scénario, bible de style, dépouillement, liste de plans, sources, montage, étalonnage, son et voix, export, série.',
    capabilities: ['bible de style (un seul look)', 'dépouillement', 'liste de plans', 'plan de montage', 'script couleur', 'check-list d’export'],
    triggers: ['cin[ée]ma', 'cadrage', 'lumi[èe]re', '[ée]talonnage', 'montage', '\\bson\\b', 'voix off', 'bible de style', 'style bible', 's[ée]rie', '[ée]pisode', 'sc[ée]nario', 'cha[îi]ne de production', 'd[ée]pouillement', 'script couleur', 'export vid[ée]o'],
    required_tools: [],
    recommended_models: { metric: 'intelligence', tier: 'balanced' },
    security_profile: 'lecture seule',
    agents: ['omnipotent'],
    companions: ['video_director', 'video_storyboard'],
    source: 'DenisHumen/cinema-skills + Benitoow/cinema-skills (MIT) — hook styleBible',
    license: 'MIT',
    playbook:
      'Follow the cinema-skills chain: brief → script → STYLE BIBLE (palette, grade, lenses, framing rules, sound palette, voice, character locks — the single source of truth every step reads) → shot list with stable ids (cinema-shot-list) → sources matching the bible → edit for rhythm (cinema-cut-list) → grade for shot matching (cinema-color-script) → sound & voice → export by destination (cinema-export-checklist); a series bible for episodes (continuity log). One look from the first frame to the last; every change to the bible is deliberate and logged. In the Film Autopilot styleBible is written from the project’s Style DNA at the SCENES stage while the skill is enabled.',
  },
```

## Fiches du catalogue (server/engine/skillsCatalogue.ts)

```ts
  ['scenario_3d_assets', 'scenario-3d', 'Génération d’assets 3D (skill scenario-3d) : texte ou image vers maillage, PBR, auto-rig, retarget, export GLB / FBX / OBJ.', ['asset 3d', 'g[ée]n[ée]r(e|ation) (un |d.)?(objet|mod[èe]le|maillage) 3d', 'image vers 3d', 'texte vers 3d', '\\bmesh\\b', 'accessoire 3d', 'auto.rig'], ['blender_cinematic', 'scenario_textures'], ['coder'], [], 'Follow the scenario-3d skill: brief → mesh (text-to-3D / image-to-3D) → PBR texture → optional auto-rig → GLB; preview and validate before use. In the app a GLB loads into the WebGL sandbox (`loadGlb`) and into Blender (glTF import); the troupe actors are the first consumers.'],
  ['scenario_3d_worlds', 'scenario-3d-worlds', 'Mondes et environnements 3D (skill scenario-3d-worlds) : texte / image / panorama vers monde navigable ou splat gaussien.', ['monde 3d', 'environnement 3d', 'd[ée]cor 3d', 'lieu explorable', 'panorama', 'skybox', 'splat'], ['scenario_3d_assets', 'blender_cinematic'], ['coder'], [], 'Follow the scenario-3d-worlds skill: start from the place description (market, street, interior), choose text-to-world / image-to-world / skybox-to-splat, check scale and walkability. In the app the adapted sets of the Film Autopilot and the Blender scenes reuse the same place descriptions.'],
  ['scenario_sprite_animation', 'scenario-sprite-animation', 'Animation de sprites (skill scenario-sprite-animation) : cycles de marche / idle / attaque, feuilles de sprites, GIF, découpe en images moteur.', ['sprite', 'feuille de sprites', 'cycle (de marche|idle|d.attaque)', 'animation courte', 'gif anim'], ['video_storyboard'], ['coder'], [], 'Follow the scenario-sprite-animation skill: one character image → animation sheet (directions, frames) → sliced engine-ready frames; loop seamlessly. The app’s 2D full-body engine (clips) is the consumer of short reusable cycles.'],
  ['scenario_video', 'scenario-video', 'Génération et édition vidéo Scenario (skill scenario-video) : texte / image vers vidéo, lipsync, upscale, découpe, extension, reframe.', ['scenario (video|vid[ée]o)', 'upscale (la |de la )?vid[ée]o', 'reframe', 'lipsync', 'extend (the )?clip|prolonge le clip'], ['video_prompting', 'video_director'], ['omnipotent'], [], 'Follow the scenario-video skill as an optional provider beside Grok / Pollinations / HF Space: image-to-video from the approved still, motion prompt shaped by `shapeVideoPrompt`, cost estimated before the call, the clip analysed by the quality gate like any other take.'],
  // ── Blender (voie de rendu des vidéos 3D) ──
  ['blender_lighting_rendering', 'scenario-blender-lighting-rendering', 'Éclairage et rendu Blender (skill scenario-blender-lighting-rendering) : trois points, lumière motivée, HDRI, EEVEE vs Cycles, AgX / ACES, passes, compositing, jugement d’un rendu.', ['[ée]clairage blender', 'rendu blender', '\\bcycles\\b', '\\beevee\\b', '\\bhdri\\b', 'compositing', 'rendu (plat|terne|bruit)', 'agx|aces'], ['blender_cinematic', 'cinema_craft'], ['coder'], [], 'Follow the scenario-blender-lighting-rendering skill: light the subject first (key, fill, rim or motivated), choose EEVEE for speed and Cycles for truth, AgX view transform, check values and rule of thirds, judge the render like a lighter. In the app `cinematicRig` writes this rig into every bpy script and `scripts/blender-render.py` renders it headless.'],
  ['blender_animation', 'scenario-blender-animation', 'Animation Blender par Python (skill scenario-blender-animation) : cycles de marche, acting, lip sync, blocking → spline → polish, timing, arcs, NLA.', ['anim(e|ation) (dans |sous )?blender', 'keyframes? blender', 'courbes? d.animation', 'cycle de marche', '\\bnla\\b', 'anim(ation)? (flott|raide|glisse)'], ['blender_rigging', 'video_director'], ['coder'], [], 'Follow the scenario-blender-animation skill: block in stepped keys on the beats, spline, polish (arcs, overlap, squash), stage a playblast before the final render. In the Blender path of the app the troupe’s retargeted clips become actions on the imported GLB armature.'],
  ['blender_rigging', 'scenario-blender-rigging', 'Rigging Blender (skill scenario-blender-rigging) : Rigify, poids automatiques, IK/FK, drivers, shape keys correctives, test des déformations.', ['rig(ging)? blender', 'rigify', 'armature', 'poids (de peinture|automatiques)', 'bone heat', 'ik.?fk', 'shape keys?'], ['blender_animation', 'blender_rig_verification'], ['coder'], [], 'Follow the scenario-blender-rigging skill: fit the metarig, generate, weight and test deformations on extreme poses before animating. The app’s engine skeleton (index / thumb bones) maps onto the Blender armature for the troupe actors.'],
  ['blender_previs', 'scenario-blender-previs-storyboard', 'Prévisualisation et animatique Blender (skill scenario-blender-previs-storyboard) : temps → liste de plans, caméra et focale par plan, règle des 180°, marqueurs liés aux caméras, Grease Pencil.', ['pr[ée]vis', 'animatique', 'storyboard blender', 'grease pencil', 'marqueurs? (de )?cam[ée]ra', 'r[èe]gle des 180'], ['video_storyboard', 'cinema_craft'], ['coder'], [], 'Follow the scenario-blender-previs-storyboard skill: beats → shot list → one camera per shot with lens and height, markers bound to cameras, time the animatic in the sequencer before any heavy render. In the app `shotPlan` provides the shot list the animatic starts from.'],
  ['blender_staged_scene', 'blender-staged-scene-construction', 'Construction de scènes Blender par étapes (skill blender-staged-scene-construction) : étapes numérotées avec points de reprise, rendu en arrière-plan, export GLB vérifié, limites mesurées.', ['sc[èe]ne (blender )?par [ée]tapes', 'construction par [ée]tapes', 'sc[èe]ne proc[ée]durale', 'blender (fig|gel|bloqu)', 'from_pydata', 'rendu en arri[èe]re.plan'], ['blender_cinematic'], ['coder'], [], 'Follow the blender-staged-scene-construction skill: numbered stages (build_all), checkpoints that survive crashes, meshes from data not operators, a separate background render, GLB export hygiene and a validation.json with honest limits. `scripts/blender-render.py` is the background renderer of the app.'],
  ['blender_rig_verification', 'blender-rig-verification', 'Vérification de rig mécanique (skill blender-rig-verification) : rig analytique vérifié numériquement, choréographie cuite en shape keys, re-rendu de contrôle, site à défilement d’images.', ['v[ée]rification de rig', 'rig (cass|v[ée]rifi)', 'm[ée]canisme', 'd[ée]pli(age|ant)', 'vue [ée]clat[ée]e', 'bake (de l.)?animation|cuire l.animation'], ['blender_rigging'], ['coder'], [], 'Follow the blender-rig-verification skill: define the mechanism analytically, verify numerically (lengths, arcs), bake into editable shape keys, validate by an independent re-render. In the app the A/B gate and `visual.compare` are the independent re-check.'],
  ['concept_visual_gate', 'concept-target-visual-gate', 'Porte visuelle contre un concept cible (skill concept-target-visual-gate) : prompts de concept structurés, relecteurs indépendants, grille de scores honnête, jalons vérifiés par capture.', ['porte visuelle', 'concept (cible|d.abord)', 'compar(e|er) (au|avec le) concept', 'ressemble (pas )?[àa] la r[ée]f[ée]rence', 'capture ou (ça|ca) n.existe pas'], ['visual_regression', 'frontend_visual_qa'], ['qa_engineer'], ['visual.compare'], 'Follow the concept-target-visual-gate skill: write the concept target first, review each milestone with a fresh-context reviewer and a scoring ledger, never lower the target to declare success. In the app `visual.compare` and `cloneCompare` measure the gap to the reference; the Film A/B gate keeps the better take.'],
  ['blender_mcp_sessions', 'blender-mcp-isolated-sessions', 'Sessions Blender MCP isolées (skill blender-mcp-isolated-sessions) : instance Blender propre à la session, port dédié, sans toucher à un Blender ouvert.', ['blender mcp', 'session blender (isol|d[ée]di)', 'piloter blender', 'blender headless', 'deux(i[èe]me)? (instances? )?blender'], ['blender_staged_scene'], ['coder'], [], 'Follow the blender-mcp-isolated-sessions skill: start a session-owned Blender on a free port, never attach to a running GUI scene, stop it when done. In the app the headless path is `bpy` as a module or `blender -b --python scripts/blender-render.py`, and the local bridge (`scripts/blender-bridge.py`) renders on the user’s GPU.'],
  ['voxel_diorama', 'voxel-diorama-blender', 'Dioramas voxel Blender (skill voxel-diorama-blender) : maillages groupés par palette, insets déterministes, ombrage sRGB correct, export vers un visualiseur web.', ['voxel', 'diorama', 'isom[ée]trique', 'cubes? (instanc|empil)', 'blender vers web'], ['blender_cinematic'], ['coder'], [], 'Follow the voxel-diorama-blender skill: batch cubes per (group, palette, shade), epsilon insets against coincident faces, sRGB-correct shading, Z-up → Y-up for the web viewer. The WebGL sandbox of the app displays the exported scene.'],
  ['blender_image_to_3d', 'blender-image-to-3d', 'Image vers modèle 3D prêt pour un moteur (skill blender-image-to-3d) : phases à portes avec rendus comparés à la référence, silhouette mesurée, retopo, textures, rig, export GLB / FBX.', ['image vers (mod[èe]le )?3d', 'photo en 3d', 'reconstruire en 3d', 'concept art (en|vers) 3d', 'optimis(e|ation) (des|de l.)assets?', 'r[ée]duire les polygones', '\\blod\\b'], ['scenario_3d_assets', 'blender_cinematic'], ['coder'], [], 'Follow the blender-image-to-3d skill: calibrate the scene to the reference camera, block out, compare renders to the reference (silhouette measurement), then detail, retopo, bake and export with a manifest; reimport to verify. The troupe’s inflated actor (`inflatedActor`) is the app’s own image-to-body path; Draco and LOD keep the sandbox light.'],
  ['blender_cloud_modeling', 'blender-3d-modeling', 'Modélisation et rendu Blender distants (skill blender-3d-modeling) : turntables, prises de vue produit, conversions de formats, impression 3D, via un service hébergé.', ['turntable', 'rendu (cloud|distant|h[ée]berg)', 'conversion (glb|fbx|obj|blend)', 'imprimabilit', 'prises? de vue produit 3d'], ['blender_cinematic'], ['coder'], [], 'Follow the blender-3d-modeling skill only when a remote render is wanted; by default the app renders locally (`scripts/blender-render.py`, local bridge) at 0 $. Always confirm cost before a hosted call.'],
  ['cinematic_3d_production', 'cinematic-3d-production', 'Production cinématique 3D (skill cinematic-3d-production) : assets Blender, rendu final Unreal ou Blender, vérification sur rendus réels, production récupérable.', ['production cin[ée]matique', '\\bunreal\\b', 'temps r[ée]el', 'plan cin[ée]matique 3d', 'rendu final 3d', 'visualisation (produit|architectur|scientifique)'], ['blender_cinematic', 'cinema_craft', 'blender_lighting_rendering'], ['coder', 'architect'], [], 'Follow the cinematic-3d-production skill: plan the shot, author assets in Blender, render in Blender (headless / local bridge) or Unreal when installed, verify on real renders, keep the production recoverable (versions, manifests). Cinematic imagery is never engineering proof.'],
```

