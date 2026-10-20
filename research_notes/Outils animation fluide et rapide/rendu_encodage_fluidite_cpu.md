# Rendu et encodage rapides d'un film 2D/2,5D déterministe sur CPU seul (Linux, 4 cœurs, sans GPU), et fluidité du mouvement (état octobre 2026)

> Notes de recherche du 16/10/2026. Elles combinent une veille Internet sourcée et des **mesures locales faites le même jour dans le conteneur du projet** : 4 vCPU (`nproc` = 4), 15 Gio de RAM, Ubuntu 24.04, Mesa 25.2.8 (llvmpipe, « LLVM 20.1.2 256 bits »), Chromium 141.0.7390.37 (builds Playwright 1.56.1 `chromium-1194` et `chromium_headless_shell-1194`), ffmpeg 6.1.1 (Ubuntu, avec libx264, libx265, libsvtav1 1.7.0, libvpx, libaom), @napi-rs/canvas 1.0.11, rife-ncnn-vulkan 20221029.
> Une mesure locale est notée **[mesure locale]** et décrite (protocole + commande) pour pouvoir être refaite. Un chiffre extrapolé est noté **(estimation)**.
>
> **Banc synthétique WebGL** utilisé pour les mesures locales (`page.html` + `run2.cjs`, dans le scratchpad de la session) : toile WebGL2 de 576×1024 ; décor = grille déplacée par une carte de profondeur lue dans le vertex shader, texture couleur 2048² ; « grille 447 » = 448² = **200 704 sommets** (≈ le maillage actuel du projet, ~200k), « grille 160 » = 25 921 sommets, « grille 40 » = 1 681 sommets ; 10 cartes personnages 512² en alpha avec rotation ; passe d'étalonnage plein écran (FBO → vignettage, saturation, grain). Chaque image : `__frame(t)` puis `canvas.toDataURL('image/jpeg', 0.92)` renvoyé à Node (même chemin que le pipeline actuel). Ce banc est plus lourd que la vraie page (le projet mesure 6,3 i/s agrégées avec 4 instances, le banc 4,7 i/s) : **les rapports de vitesse sont transposables, pas les valeurs absolues**.

## 1. Chromium sans GPU : SwiftShader, llvmpipe (ANGLE→GL/EGL), lavapipe (ANGLE→Vulkan), WebGPU/Dawn sur SwiftShader — quel moteur, quels drapeaux ?

### Takeaway
Sur notre machine, **ANGLE sur Mesa llvmpipe via EGL sans écran X (`--use-gl=angle --use-angle=gl-egl`) + `LP_NUM_THREADS=1` par instance × 4 instances** est **2,5× plus rapide que SwiftShader à scène égale, et 6,2× plus rapide une fois le maillage du décor ramené de 200k à 26k sommets** (29,3 i/s agrégées contre 4,7 i/s) ; le rendu reste bit-à-bit déterministe. SwiftShader en repli WebGL automatique est en cours de retrait dans Chromium (opt-in obligatoire depuis ~M139), lavapipe n'est pas installable/fiable ici, et WebGPU-sur-SwiftShader n'apporte rien de mesuré.

### Cited Findings
**Sources externes**
- Un développeur Chromium rapporte ~46 i/s sur llvmpipe contre ~5 i/s sur SwiftShader pour la même page ; l'équipe SwiftShader répond qu'elle avait trouvé SwiftShader ~2× plus rapide que llvmpipe par le passé et soupçonne un chemin lent pour une opération rare (fil ancien, résultat dépendant de la charge) — [Google Groups swiftshader « Performance vs. llvmpipe? »](https://groups.google.com/g/swiftshader/c/QKcxP0e-PTA)
- Microlink (Chrome 150 « chrome-for-testing », Mesa 26.1.3 compilé maison, LLVM 19.1.7, 8 cœurs AVX2, 16 Go, sans GPU) : capture WebGL passée de ~24 s (SwiftShader) à ~6 s (llvmpipe) soit ~4× en isolé, ~2× sous charge, en remplaçant `--use-angle=swiftshader` par `--use-angle=gl` ; **mais `--use-angle=gl` exige un écran X (Xvfb) même en headless**, sinon WebGL retombe silencieusement en 2D ; `--disable-gpu` réactive SwiftShader ; `--in-process-gpu` casse la surface GL — [Microlink blog](https://microlink.io/blog/webgl-without-a-gpu)
- BotBrowser (1/06/2026, Ubuntu 22.04, mesure CPU cumulée des processus Chromium, une seule charge Canvas2D + WebGL2) : en mode fenêtré sous Xvfb, SwiftShader ~999 % CPU contre llvmpipe ~513 % (−49 %) ; lavapipe ~153 % mais **WebGL2 désactivé** (Mesa 23.2 sans les extensions Vulkan requises par ANGLE), « pas utilisable en production », instable en conteneur ; en headless par défaut, aucun gain CPU (713 % vs 713 %) ; les pixels diffèrent d'un rastériseur à l'autre ; drapeaux lavapipe testés : `--use-angle=vulkan --enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE` — [BotBrowser blog](https://botbrowser.io/en/blog/mesa-llvmpipe-vs-swiftshader-chromium-linux/)
- Documentation Chromium : SwiftShader = `--use-gl=angle --use-angle=swiftshader` ; repli WebGL « unsafe » = `--use-angle=swiftshader-webgl --enable-unsafe-swiftshader` ; le repli automatique est déprécié (« WebGL context creation will soon fail instead of falling back to SwiftShader ») pour raison de sécurité (code JIT dans le processus GPU) ; `--enable-unsafe-swiftshader` supprime l'avertissement et reste admis pour tests headless, pas pour du contenu non fiable — [Chromium docs/gpu/swiftshader.md](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md) ; [Intent to Remove: SwiftShader Fallback (blink-dev)](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/YUEOoPeUAAAJ)
- Calendrier : Esri situe la dépréciation du repli automatique à Chrome 137 (mai 2025) — [Esri](https://support.esri.com/en-us/knowledge-base/usage-of-arcgis-maps-sdk-for-javascript-with-chrome-whe-000038872) ; Samsung indique qu'à partir de M139 la création de contexte WebGL échoue là où SwiftShader aurait été utilisé — [Samsung Internet policy](https://developer.samsung.com/browser/policy/enable-unsafe-swift-shader.html) ; chromedp ajoute `--enable-unsafe-swiftshader` à `--disable-gpu` car le repli est « opt-in » en Chromium 139+ — [chromedp v0.14.1](https://chromium.googlesource.com/external/github.com/chromedp/chromedp/+/refs/tags/v0.14.1) ; Edge propose une politique d'entreprise pour différer la dépréciation — [Microsoft Learn](https://learn.microsoft.com/en-my/deployEdge/microsoft-edge-policies/enableunsafeswiftshader). Les sources divergent sur le numéro exact (137 vs 139).
- Remotion documente `--gl` : `angle`, `egl`, `swiftshader`, `vulkan` (≥ 4.0.41), `angle-egl` (≥ 4.0.52), `swangle` (défaut sur Lambda) ; recommande `swangle` sur machine sans GPU, et chrome-for-testing plutôt que headless-shell pour les pilotes GPU Linux — [Remotion gl-options](https://www.remotion.dev/docs/gl-options)
- llvmpipe utilise par défaut autant de fils que de CPU (`nproc`) ; Wine force `LP_NUM_THREADS=4` pour limiter la mémoire — [liste wine-gitlab](https://list.winehq.org/hyperkitty/list/wine-gitlab@list.winehq.org/thread/R7U3SU46S7J4QD7CFXS7ZRRUKAONVRJL/) ; plafond historique 16 fils, MR proposant 32 — [Mesa MR 18415](https://gitlab.freedesktop.org/mesa/mesa/-/merge_requests/18415) ; `LP_NUM_THREADS=0` = un seul fil — [WebRender wiki](https://github.com/servo/webrender/wiki/Software-backend)
- WebGPU en headless : caché par défaut ; `--enable-unsafe-webgpu` + (Linux) `--use-webgpu-adapter=swiftshader` le route sur le Vulkan logiciel de SwiftShader — [agent-browser.dev/webgpu](https://agent-browser.dev/webgpu) ; mêmes drapeaux dans la config de tests Chromium — [FlagSpecificConfig](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/web_tests/FlagSpecificConfig). Aucune mesure de performance publiée trouvée.
- Licences : SwiftShader Apache-2.0 — [LICENSE.txt](https://raw.githubusercontent.com/google/swiftshader/master/LICENSE.txt) ; Mesa est un composant système (non redistribué par l'app).

#### Mesures locales (16/10/2026)
- **[mesure locale] Moteur réellement actif** (chaîne `UNMASKED_RENDERER_WEBGL`) : `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` → « ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero))) » ; `--use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist` **sans Xvfb** → « ANGLE (Mesa, llvmpipe (LLVM 20.1.2 256 bits), OpenGL ES 3.2) » (fonctionne aussi bien dans `headless_shell` que dans `chrome --headless`) ; sous `xvfb-run` avec `--use-angle=gl` → « llvmpipe … OpenGL 4.5 ». **Contrairement à ce qu'écrit Microlink pour `--use-angle=gl` (GLX), la variante EGL n'a pas besoin d'écran X.**
- **[mesure locale] Débit agrégé, 4 instances `headless_shell` en parallèle × 96 images (384 images, temps mur lancement compris)** :

| Configuration | Grille décor | Images/s agrégées | Gain vs actuel |
|---|---|---|---|
| SwiftShader (≈ config actuelle) | 447 (200k sommets) | **4,71** | 1,0× |
| llvmpipe `gl-egl`, `LP_NUM_THREADS=1` | 447 | **11,69** | 2,5× |
| SwiftShader | 160 (26k sommets) | **13,11** | 2,8× |
| llvmpipe `gl-egl`, fils par défaut | 160 | **28,44** | 6,0× |
| llvmpipe `gl-egl`, `LP_NUM_THREADS=1` | 160 | **29,26** | **6,2×** |

- **[mesure locale] Une instance, 24 images (ms/image, rendu + JPEG renvoyé à Node)** : grille 447 → SwiftShader 701 ms, llvmpipe 429 ms ; grille 160 → 290 / 175 ms ; grille 40 → 198 / 110 ms. **Le maillage de 200k sommets coûte à lui seul ~70 % du temps d'image** sur les deux rastériseurs CPU.
- **[mesure locale] Première série plus courte (4 × 48 images)** : SwiftShader grille 447 ≈ 3,1 i/s ; llvmpipe fils par défaut ≈ 4,3 i/s ; llvmpipe `LP_NUM_THREADS=1` ≈ 5,3 i/s ; grille 160 + llvmpipe `LP=1` ≈ 18 i/s (12,4 s mur). Les écarts avec la série de 96 images viennent de la chauffe (compilation JIT des shaders) : **variance ±20–30 % sur une série courte**, d'où l'intérêt de séries longues.
- **[mesure locale] Une instance sous Xvfb + `--use-angle=gl` (GLX)** : 218 ms/image (JPEG dans la page) contre 280–310 ms en `gl-egl` et 289–462 ms en SwiftShader, même protocole (une seule série chacun ; non mesuré en 4 instances).
- **[mesure locale] Déterminisme** : empreinte MD5 des pixels de l'image t = 1,0 s identique sur 3 lancements llvmpipe (dont `LP_NUM_THREADS=1` vs défaut) et sur 2 lancements SwiftShader ; **différente entre les deux moteurs** (ne pas mélanger les moteurs dans un même film ou une même référence de non-régression).
- **[mesure locale] WebGPU** : `navigator.gpu.requestAdapter()` renvoie `null` avec les drapeaux par défaut ; avec `chrome --enable-unsafe-webgpu --use-webgpu-adapter=swiftshader --enable-features=Vulkan` → adaptateur « google / swiftshader ». Performance non mesurée.
- **[mesure locale] lavapipe** : non testable ici — aucun ICD Vulkan installé (`/usr/share/vulkan/icd.d` absent, paquet `mesa-vulkan-drivers` non installé).

### Inferences
- **Commande recommandée (à valider sur la vraie page)** : `LP_NUM_THREADS=1 headless_shell --use-gl=angle --use-angle=gl-egl --ignore-gpu-blocklist` (sans `--disable-gpu`, sans `--in-process-gpu`), 4 instances pour 4 cœurs ; garder SwiftShader en secours automatique si la chaîne renderer ne contient pas « llvmpipe ». Dans Playwright : `chromium.launch({ args: ['--use-gl=angle','--use-angle=gl-egl','--ignore-gpu-blocklist'], env: { ...process.env, LP_NUM_THREADS: '1' } })`.
- **Le gain le plus gros n'est pas le moteur mais le maillage** : 200k sommets pour 590k pixels (~1 sommet pour 3 px) est surdimensionné ; une grille de ~26k sommets (≈ 1 sommet pour 23 px) ou, mieux, **une grille adaptative** (dense seulement là où la profondeur varie fort, plate ailleurs) devrait garder la parallaxe visuellement identique — critère d'acceptation : SSIM ≥ 0,99 entre rendu 200k et rendu allégé sur 20 images de test, à mesurer.
- `LP_NUM_THREADS=1` évite la sur-souscription (4 instances × 4 fils llvmpipe sur 4 cœurs) ; le gain est faible à grille 160 (+3 %) mais net à grille 447 (+24 % sur la première série).
- La projection pour un film de 60 s (estimation, banc synthétique) : 1 440 images à 24 i/s → ~49 s de rendu avec la meilleure configuration, contre ~306 s avec la configuration actuelle ; 1 800 images à 30 i/s → ~62 s ; 3 600 images à 60 i/s → ~123 s.
- La dépréciation de SwiftShader rend la migration vers llvmpipe prudente à moyen terme (l'unsafe-flag peut disparaître) ; llvmpipe est un composant Mesa de l'OS, hors périmètre de licence de notre code.

### Gaps
- Pas de mesure sur la vraie page du projet (seulement sur le banc synthétique) : à refaire avec `window.__frame(t)` réel.
- lavapipe (ANGLE→Vulkan) non mesurable dans ce conteneur ; statut WebGL2 sur Mesa 25.x non vérifié.
- Pas de benchmark public de WebGPU/Dawn sur SwiftShader ; non mesuré localement.
- Plafond actuel de `LP_MAX_THREADS` dans Mesa 25.2 non vérifié dans le code source.
- Date exacte de retrait définitif de `--enable-unsafe-swiftshader` : aucune source n'en donne.

## 2. Relecture des images et encodage depuis la page : WebCodecs, Mediabunny, readPixels vs toDataURL, capture CDP, tuyau vers ffmpeg, horloge virtuelle, techniques de Remotion/Revideo/HyperFrames

### Takeaway
Le **chemin actuel (seek déterministe `__frame(t)` + JPEG + ffmpeg) est déjà celui de l'état de l'art** (HyperFrames de HeyGen fait pareil) ; `readPixels` synchrone est **plus lent** que `toDataURL` JPEG dans nos mesures, et **WebCodecs H.264 n'existe pas dans le Chromium de Playwright** (VP8/VP9/AV1 seulement) et n'accélère pas le rendu. Le levier est le rendu (§1), pas la relecture ; Mediabunny est MPL-2.0 (pas MIT).

### Cited Findings
**Sources externes**
- HyperFrames (HeyGen, Apache-2.0) : l'horloge n'est jamais celle du mur — `window.__hf.seek(t)` avec `quantizeTimeToFrame = Math.round(t*fps)/fps` ; chaque image produite par `HeadlessExperimental.beginFrame` (un cycle layout→paint→composite→capture, compositeur en pause entre deux appels) avec `screenshot: { format: "jpeg", quality: 80, optimizeForSpeed: true }` ; le retour `hasDamage` dit si l'image a changé ; nécessite `chrome-headless-shell` Linux avec `--deterministic-mode --enable-begin-frame-control --run-all-compositor-stages-before-draw --disable-threaded-animation --disable-threaded-scrolling --disable-checker-imaging --disable-image-animation-resync --enable-surface-synchronization` ; parallélisme = N processus Chrome puis concaténation ffmpeg des morceaux MP4 ; aucun chiffre de débit publié — [HeyGen research « HTML to video »](https://www.heygen.com/research/html-to-video) ; licence Apache-2.0 — [LICENSE](https://raw.githubusercontent.com/heygen-com/hyperframes/main/LICENSE)
- `HeadlessExperimental.beginFrame` : envoie un BeginFrame et rend la main quand l'image est terminée, avec capture optionnelle ; conçu pour `--run-all-compositor-stages-before-draw` — [CDP HeadlessExperimental](https://cdpstatus.reactnative.dev/devtools-protocol/tot/HeadlessExperimental) ; `--deterministic-mode` est un méta-drapeau du headless shell — [headless_shell_switches.cc](https://chromium.googlesource.com/chromium/src/+/b9b02e0537eac358b8facb9802e16adce590f0ea/headless/app/headless_shell_switches.cc)
- Remotion : concurrence par défaut = moitié des fils ; JPEG plus rapide que PNG ; H.264 = encodeur le plus rapide, VP8/VP9 « beaucoup plus lents » ; `npx remotion benchmark` pour trouver la concurrence optimale — [Remotion performance](https://www.remotion.dev/docs/performance) ; le framework Remotion reste sous sa propre « Remotion License », Mediabunny sous MPL-2.0 — [Remotion blog Mediabunny](https://www.remotion.dev/blog/mediabunny) (le journal de veille du projet classe déjà Remotion « licence entreprise → non retenu », entrée du 14/10/2026)
- Revideo (MIT, fork de Motion Canvas) : rendu « presque toujours plus rapide que le temps réel » depuis 0.4.6 ; décodeur WebCodecs le plus rapide mais limité au MP4 ; `renderPartialVideo()` + concaténation pour paralléliser — [docs Revideo slow-rendering](https://docs.re.video/common-issues/slow-rendering) ; [docs décodeurs](https://docs.re.video/decoders) ; affirmation non vérifiée « 60 s de Full HD en 14,3 s sur MacBook » — [Product Hunt](https://www.producthunt.com/products/revideo) ; licence MIT — [LICENSE](https://raw.githubusercontent.com/redotvideo/revideo/main/LICENSE)
- Les builds Chromium sans codecs propriétaires (dont le Chromium de Playwright) répondent `false` à `isConfigSupported('avc1.4D0033')` — [OpenIPC issue #330](https://github.com/OpenIPC/website/issues/330) ; les constructeurs WebCodecs n'existent qu'en contexte sécurisé — [MDN WebCodecs](https://developer.mozilla.org/docs/Web/API/WebCodecs_API)
- Mediabunny : licence **MPL-2.0** (copyleft au niveau du fichier) — [README Mediabunny 1.61.3](https://cdn.jsdelivr.net/npm/mediabunny@1.61.3/README.md) ; npm : mediabunny 1.61.5 MPL-2.0 (modifié le 15/10/2026), mp4-muxer 5.2.2 **MIT** (dernière modification 2/07/2025), webm-muxer 5.1.4 MIT — [npm mediabunny](https://www.npmjs.com/package/mediabunny), [npm mp4-muxer](https://www.npmjs.com/package/mp4-muxer) (vérifié par `npm view` le 16/10/2026). Le journal de veille du projet avait déjà écarté Mediabunny pour cette raison (`.claude/skills/veille-permanente/SKILL.md`, entrée du 14/10/2026).

#### Mesures locales (16/10/2026)
- **[mesure locale] `VideoEncoder.isConfigSupported` (576×1024, 24 i/s, `prefer-software`)** dans Chromium 141 de Playwright (chrome et headless_shell, tous moteurs GL) : `avc1.42001f` (H.264 Baseline) **false**, `avc1.640028` (High) **false**, `hvc1` **false**, `vp8` true, `vp09.00.31.08` true, `av01.0.08M.08` true.
- **[mesure locale] Encodage WebCodecs dans la page** (llvmpipe `gl-egl`, grille 160, 48 images, rendu + `new VideoFrame(canvas)` + `encode`, `latencyMode:'quality'`, 6 Mb/s) : VP9 168,8 ms/image, AV1 140,1 ms/image, VP8 165,2 ms/image, contre **174,8 ms/image** pour rendu + JPEG renvoyé à Node. Gain ≤ 20 % sur une instance, et il faudrait de toute façon transcoder en H.264 pour TikTok.
- **[mesure locale] `gl.readPixels` synchrone vs `toDataURL('image/jpeg')`** (rendu compris, grille 447) : SwiftShader 573–609 ms contre 289–462 ms ; llvmpipe EGL 579–680 ms contre 280–310 ms ; llvmpipe GLX 308 ms contre 218 ms. Chromium journalise « GPU stall due to ReadPixels ». **readPixels synchrone est le chemin le plus lent.**
- `createImageBitmap(canvas)` revient en < 7 ms mais sans attendre le rendu : mesure non valable (non retenue).
- **[mesure locale]** Le ffmpeg fourni par Playwright (`/opt/pw-browsers/ffmpeg-1011`) est une build LGPL-2.1 qui n'encode que VP8 (et PNG) : inutilisable pour la livraison H.264.

### Inferences
- Garder le schéma actuel « seek déterministe → JPEG (q 0,92–0,95) → ffmpeg » ; il est aligné sur HyperFrames. Pour rester sans perte jusqu'à l'encodeur, l'option est PNG (plus lent à encoder dans la page) ou RGBA brut, mais le RGBA (2,36 Mo/image) passé par CDP en base64 coûterait plus que le JPEG ; à réserver si un test SSIM montre une perte visible de génération JPEG→x264.
- **Pipeline sans fichiers intermédiaires** : écrire chaque JPEG reçu directement dans `ffmpeg -f image2pipe -framerate 30 -c:v mjpeg -i - …` (stdin) au lieu de fichiers ; un ffmpeg par instance produit un morceau MP4, puis `-f concat -c copy` (même méthode que HyperFrames).
- `beginFrame` + `--deterministic-mode` n'est utile que si la page dépend du compositeur (CSS, vidéos, DOM) ; notre rendu WebGL piloté par `__frame(t)` n'en a pas besoin. Idée reprise de HyperFrames : utiliser un drapeau « image inchangée » (équivalent de `hasDamage`) pour **ne pas re-rendre les images fixes** (plans tenus, pauses de dialogue) et dupliquer la précédente — gain proportionnel au nombre d'images tenues (à mesurer).
- WebCodecs H.264 n'est envisageable qu'avec Google Chrome (`channel: 'chrome'`), non installé ici : non vérifié.
- Relecture asynchrone WebGL2 (PBO + `fenceSync`) : pourrait masquer le coût de readPixels, non testée.

### Gaps
- Support de `avc1` par WebCodecs dans Google Chrome Linux (OpenH264 ?) : aucune source primaire trouvée, Chrome non installé pour tester.
- CDP `Page.startScreencast` : aucune source sur son (non-)déterminisme trouvée dans cette session ; non mesuré.
- Wiki ffmpeg (trac.ffmpeg.org) inaccessible (protection anti-robots Anubis) : les réglages ffmpeg ci-dessous reposent sur des mesures locales et des forums.

## 3. Moteurs de composition 2D purement CPU pour remplacer WebGL (Skia, Cairo, Blend2D, PixiJS, libvips)

### Takeaway
Pour une scène « décor + ~10 calques avec transformées affines », **Skia en CPU via @napi-rs/canvas (MIT) compose une image 576×1024 en 22 ms (45 i/s) sur un cœur et ~128 i/s agrégées sur 4 processus** — 4× plus vite que le meilleur WebGL logiciel mesuré ; mais Canvas 2D n'a **pas de déformation par maillage** (pas de parallaxe par carte de profondeur, pas de marionnette ARAP) : c'est un moteur « multiplan », pas un remplaçant direct.

### Cited Findings
**Sources externes**
- Tableau du README @napi-rs/canvas (opération non nommée) : skia-canvas ~21,2 M ops/s, node-canvas ~16,6 M, @napi-rs/skia ~14,7 M ; suites « draw house » / « gradient » (v0.0.9, Ryzen 9 5950X, Windows) : napi-rs 37 et 42 ops/s contre node-canvas 30/34 et skia-canvas 26/36 — résultats anciens et contradictoires — [README napi-rs canvas (miroir)](https://github.com/RMG-GROUP/napi-rs-canvas) ; un guide 2026 décrit @napi-rs/canvas comme plus rapide que node-canvas sans mesure publiée — [PkgPulse](https://www.pkgpulse.com/guides/node-canvas-vs-napi-rs-canvas-vs-skia-canvas-server-2026)
- Licences/versions npm (vérifiées par `npm view` le 16/10/2026) : @napi-rs/canvas 1.0.11 MIT ; skia-canvas 4.0.0 MIT (modifié le 14/10/2026) ; canvas (node-canvas, Cairo) 3.2.3 MIT ; pixi.js 8.22.0 MIT ; sharp 0.35.5 Apache-2.0 — [npm @napi-rs/canvas](https://www.npmjs.com/package/@napi-rs/canvas), [npm skia-canvas](https://www.npmjs.com/package/skia-canvas), [npm canvas](https://www.npmjs.com/package/canvas), [npm pixi.js](https://www.npmjs.com/package/pixi.js), [npm sharp](https://www.npmjs.com/package/sharp)
- Blend2D 0.11.4 sur Ryzen 7950X : remplissage d'un rectangle **tourné** avec motif bilinéaire 256×256 = 3,39 appels/ms en mono-fil, 6,80 en 2 fils ; remplissage plein 256² : ×1,97 en 2 fils, ×3,79 en 4 fils ; mauvais passage à l'échelle sur les petites tailles (8×8) — [blend2d.com/performance](https://blend2d.com/performance.html) ; le moteur multi-fils est « encore expérimental », découpe l'image en bandes horizontales, contexte asynchrone — [Blend2D multithreaded rendering](https://blend2d.com/doc/multithreaded-rendering.html) ; banc mono-cœur tiers (i7-8650U, 2024-04-17) où Blend2D mène sur la plupart des cas contre Skia, Cairo, Qt6, AGG — [ctx.graphics performance](https://ctx.graphics/performance/) ; support jusqu'à 32 fils — [Phoronix](https://www.phoronix.com/news/Blend2D-Multi-Threaded) ; licence Zlib — [LICENSE.md](https://raw.githubusercontent.com/blend2d/blend2d/master/LICENSE.md)

#### Mesures locales (16/10/2026)
- **[mesure locale] @napi-rs/canvas 1.0.11 (Skia CPU)**, scène : décor 1152×2048 avec zoom/panoramique caméra, 10 cartes 512² (rotation, échelle, alpha 0,9), vignette radiale, sortie 576×1024 : **22,3 ms/image en RGBA brut (`getImageData`) = 44,9 i/s** ; 34,1 ms/image en JPEG q92 (29,3 i/s) ; **4 processus × 96 images : 384 images en 3,0 s (≈ 128 i/s agrégées, 33,5–34,4 i/s par processus)**. Une première série faite pendant qu'un encodage ffmpeg tournait donnait 28 ms et ~34 i/s agrégées : la mesure est sensible à la concurrence CPU.
- L'API exposée ne contient ni `drawTriangles` ni maillage (seulement `Path2D`) — [mesure locale] (liste des exports du module).

### Inferences
- **Voie « 2D pure » possible pour les plans sans parallaxe de profondeur** : décor en 3–5 plans (multiplan à la Disney) + cartes affines, rendu par Skia CPU dans des processus Node (worker_threads ou processus), sortie RGBA brute vers `ffmpeg -f rawvideo -pix_fmt rgba -s 576x1024 -r 30 -i -`. Un film de 60 s à 30 i/s (1 800 images) se composerait en ~14 s sur 4 cœurs **(estimation)**.
- La parallaxe par carte de profondeur et l'ARAP demandent un maillage texturé : soit rester en WebGL (llvmpipe, §1), soit découper le décor en couches de profondeur (ce que fait déjà `scripts/scene_layers.py` selon le journal de veille) et les composer en 2D — critère : écart visuel SSIM ≥ 0,98 avec la version maillage sur des mouvements de caméra modérés.
- Blend2D (Zlib, C++) serait plus rapide encore en mono-fil selon ses propres bancs, mais n'a pas de liaison Node maintenue identifiée ici ; libvips/sharp est optimisé pour le traitement d'images, pas pour la composition de dizaines de calques transformés par image (non mesuré).

### Gaps
- skia-canvas 4.0, node-canvas, PixiJS en Node, Blend2D et libvips non mesurés localement.
- Licence de libvips (LGPL selon l'énoncé de la mission) non revérifiée dans cette session ; implication : bibliothèque liée dynamiquement par sharp, à vérifier avant usage.
- Pas de source publique sur un débit « 10 calques transformés + déformation de maillage » en CPU.

## 4. Moteurs avec sortie « film » déterministe hors ligne : Godot 4 Movie Maker, Blender (EEVEE/Workbench/Cycles CPU), Natron, MLT/melt

### Takeaway
**Godot 4 (MIT) a un vrai mode film déterministe** (`--write-movie`, `--fixed-fps`), mais `--headless` coupe le rendu (pilote « Dummy ») : il faudrait Xvfb + OpenGL logiciel, sans gain démontré et au prix d'une réécriture des scènes. **Blender sans GPU est trop lent** (mesuré par le projet : Cycles CPU 2,57 s/image, EEVEE sur llvmpipe ~150 s/image). MLT/melt sert au montage, pas au rendu de nos scènes. Aucun ne bat la voie WebGL-llvmpipe optimisée.

### Cited Findings
- Godot Movie Maker : `godot --path /chemin/projet --write-movie output.avi` ; `--resolution 1280x720` ; `--fixed-fps 30` ; rendu non temps réel, « frame pacing » parfait, sortie identique quelle que soit la machine ; formats : OGV (Theora/Vorbis, **enregistrable seulement dans les builds éditeur**), AVI MJPEG (limite 4 Go), PNG + WAV ; « Disable V-Sync » dans les réglages Editor > Movie Writer ; le *Mix Rate* audio doit être divisible par le FPS ; exemple de flou de bouge `ffmpeg -i input.avi -vf "tmix=frames=4, fps=60" -crf 15 output.mp4` — [Godot docs « Creating movies »](https://docs.godotengine.org/en/stable/tutorials/animation/creating_movies.html)
- Avec `--headless`, le serveur de rendu de Godot 4 est « Dummy » : aucune image — [Godot Q&A](https://ask.godotengine.org/150510/godot-headless-not-same-godot-window-cant-render-the-backend) ; l'OpenGL logiciel « peut convenir pour de la 2D basique à basse résolution (jusqu'à 1280×720) », 3D lente — [forum Godot](https://forum.godotengine.org/t/can-godot-render-directly-to-frame-buffer-without-x-on-linux/55812) ; `--rendering-driver opengl3` contourne l'absence de Vulkan, et lavapipe était « pratiquement pas viable » pour Godot 4.0 selon un fil de forum — [godotforums](https://godotforums.org/d/30389/3) ; licence MIT — [LICENSE.txt](https://raw.githubusercontent.com/godotengine/godot/master/LICENSE.txt)
- Blender EEVEE : le flou de bouge par accumulation re-évalue toute la scène à chaque pas temporel (« can add a lot of overhead ») — [manuel Blender 4.2](https://docs.blender.org/manual/en/4.2/render/eevee/render_settings/motion_blur.html)
- Mesures internes du projet (journal de veille, 14/10/2026) : EEVEE sans GPU ≈ 150 s par image de preflight + erreurs `EGL_BAD_MATCH` → écarté ; **Cycles CPU 2,57 s/image** (576×1024, 10 échantillons) ; film 9 de 64 s rendu en 75 min — `.claude/skills/veille-permanente/SKILL.md` (ligne « Rendu Blender plus rapide SANS carte graphique »)
- MLT : LGPL-2.1 ou GPL-2/3 selon les parties ; dernière version stable 7.36.1 (31/12/2025) — [Wikipédia MLT](https://en.wikipedia.org/wiki/Media_Lovin%27_Toolkit) ; paquet Alpine déclaré « GPL-2.0-or-later AND LGPL-2.1-or-later AND GPL-3.0-or-later » — [Alpine mlt](https://pkgs.alpinelinux.org/package/edge/community/x86/mlt) ; en 2009, le mainteneur indiquait libmlt/libmlt++ en LGPL et **melt + certains modules en GPL** (activés par `--enable-gpl`) — [rpmfusion 2009](https://lists.rpmfusion.org/pipermail/rpmfusion-developers/2009-May/005100.html)

### Inferences
- Godot ne serait intéressant que pour une réécriture complète du moteur de scène ; avec Xvfb + `--rendering-driver opengl3` il retomberait sur le même llvmpipe que Chromium : gain de vitesse non démontré, coût de migration élevé. À tester seulement si l'on veut un moteur de jeu natif (physique, particules).
- Blender reste la « voie qualité » (Cycles), pas la voie rapide : 1 440 images × 2,57 s ≈ 62 min pour 60 s à 24 i/s (calcul à partir de la mesure interne).
- melt peut servir d'outil externe d'assemblage (transitions, titrages) appelé en ligne de commande ; comme il est GPL, ne pas le lier à notre code ni le redistribuer sans respecter la GPL.

### Gaps
- Godot `--write-movie` sous Xvfb + llvmpipe : aucun retour d'expérience chiffré trouvé ; non testé (Godot non installé).
- Natron : aucune source consultée dans cette session (licence, activité du projet, rendu en ligne de commande) — non documenté ici.
- Blender Workbench sur CPU : pas de mesure trouvée ni faite.

## 5. Réglages ffmpeg vitesse/qualité pour ce contenu, et licences (libx264 GPL, OpenH264 BSD, SVT-AV1/libaom BSD)

### Takeaway
**L'encodage n'est pas le goulot** : sur le vrai film du projet (576×1024, 409 images), libx264 `-preset slow -tune animation -crf 18` prend 9,4 s (≈ 33 s pour 60 s à 24 i/s) et `veryfast` 2,2 s. Prendre `slow`/`medium` + `tune animation` ; H.264 reste le format recommandé pour TikTok. Attention licence : **libx264 est GPL** (ffmpeg appelé comme exécutable externe, ne pas le redistribuer sans conformité GPL) ; OpenH264 est BSD mais la couverture brevets ne vaut que pour les binaires de Cisco.

### Cited Findings
- **[mesure locale] Encodage du film réel `troupe-village-bac-a-sable.mp4`** (576×1024, 24 i/s, 409 images, décodé en y4m, 4 cœurs, ffmpeg 6.1.1) :

| Encodeur / réglage | Temps (409 images) | Taille | Débit moyen | Projection 1 440 images (estimation) |
|---|---|---|---|---|
| x264 `ultrafast` crf 18 tune animation | 0,86 s | 10,16 Mo | ~4,8 Mb/s | ~3 s |
| x264 `veryfast` crf 18 tune animation | 2,15 s | 3,53 Mo | ~1,7 Mb/s | ~7,6 s |
| x264 `medium` crf 18 tune animation | 5,61 s | 4,26 Mo | ~2,0 Mb/s | ~20 s |
| x264 `slow` crf 18 tune animation | 9,41 s | 4,14 Mo | ~1,9 Mb/s | ~33 s |
| SVT-AV1 1.7.0 preset 10 crf 30 | 5,16 s | 2,03 Mo | ~1,0 Mb/s | ~18 s |
| SVT-AV1 1.7.0 preset 8 crf 30 | 9,60 s | 1,96 Mo | ~0,9 Mb/s | ~34 s |

  (À CRF égal, la qualité n'est pas identique d'un preset à l'autre : les tailles ne se comparent pas à qualité égale.)
- `-tune animation` (x264) : `--bframes +2 --deblock 1:1 --psy-rd 0.4:<inchangé> --aq-strength 0.6 --ref ×2 si >1` (sources communautaires, à confronter à la doc x264) — [Doom9](https://forum.doom9.org/archive/index.php/t-181765.html) ; [VideoHelp](https://forum.videohelp.com/showthread.php?p=2349198)
- TikTok : 1080×1920 recommandé, 30 i/s recommandé (60 pour l'action), 6–8 Mb/s à 30 i/s, H.264 + AAC, MP4/MOV ; page vérifiée le 25/09/2026 contre l'aide TikTok et l'API Content Posting (certaines limites de taille non officielles) — [postfa.st TikTok video specs](https://postfa.st/sizes/tiktok/video)
- OpenH264 : licence BSD-2 (Cisco) — [LICENSE](https://raw.githubusercontent.com/cisco/openh264/master/LICENSE) ; Cisco publie les binaires et paie la licence de brevets MPEG LA pour ceux-ci — [Mozilla blog 2013](https://blog.mozilla.org/en/mozilla/video-interoperability-on-the-web-gets-a-boost-from-ciscos-h-264-codec/) ; interprétation non officielle : un binaire recompilé soi-même n'est pas couvert par la licence brevets — [Doom9](https://forum.doom9.org/archive/index.php/t-169653.html)
- SVT-AV1 : BSD 3-Clause Clear (Alliance for Open Media) — [LICENSE.md](https://raw.githubusercontent.com/AOMediaCodec/SVT-AV1/master/LICENSE.md)
- **[mesure locale]** Le ffmpeg du conteneur (Ubuntu 6.1.1) inclut libx264, libx265 (GPL), libsvtav1, libaom, librav1e, libvpx ; le ffmpeg fourni par Playwright est une build LGPL sans H.264.

### Inferences
- Commande type (sortie TikTok 30 i/s, depuis un tuyau JPEG) : `ffmpeg -f image2pipe -framerate 30 -c:v mjpeg -i - -i voix.wav -c:v libx264 -preset slow -tune animation -crf 16 -pix_fmt yuv420p -profile:v high -movflags +faststart -c:a aac -b:a 192k -shortest film.mp4`. Avec un CRF 16–18, le débit (~2 Mb/s mesuré à CRF 18) reste sous les 6–8 Mb/s conseillés par TikTok ; baisser à CRF 14–16 donnera une source plus propre au ré-encodage de la plateforme (à vérifier par SSIM/VMAF après réimport). En 576×1024, TikTok remettra à l'échelle ; un rendu natif 1080×1920 coûterait ~3,5× plus de pixels.
- Lancer l'encodage **en flux pendant le rendu** (un ffmpeg par instance, morceaux concaténés en `-c copy`) masque presque tout le temps d'encodage ; régler `-threads 1` par ffmpeg si 4 rendus tournent déjà.
- Licences : appeler le binaire ffmpeg système comme outil externe n'impose pas la GPL à notre code ; **le redistribuer avec libx264 dans la livraison imposerait les obligations GPL** (fournir les sources). Alternative 100 % permissive : OpenH264 (binaire Cisco pour la couverture brevets) — qualité/vitesse non mesurées ici ; ou AV1 (SVT-AV1, BSD) si la plateforme le ré-encode de toute façon, mais TikTok recommande H.264.

### Gaps
- Pas de mesure VMAF/SSIM à débit égal entre x264 et SVT-AV1 sur notre contenu (libvmaf absent du ffmpeg du conteneur ; seul `ssim` est disponible).
- Vitesse/qualité d'OpenH264 non mesurées (encodeur non présent dans ffmpeg ici).
- Documentation officielle x264 des tunes non consultée (wiki ffmpeg inaccessible) ; valeurs issues de forums.

## 6. Interpolation d'images pour doubler la fluidité (RIFE, rife-ncnn-vulkan, FILM, GMFSS, IFRNet, AMT, EMA-VFI, AnimeInterp, ToonCrafter, minterpolate) vs rendu analytique de plus d'images

### Takeaway
Notre moteur étant déterministe, **rendre 2× plus d'images analytiquement coûte ~49 s de plus pour 60 s (estimation), contre ~11 min pour RIFE sur CPU et ~8 min pour `minterpolate`** — et sans aucun artefact. L'interpolation n'est utile que pour des plans venus de l'extérieur (vidéos générées). Licences utilisables : RIFE/Practical-RIFE MIT, rife-ncnn-vulkan MIT, IFRNet MIT, GMFSS_Fortuna MIT, FILM Apache-2.0, EMA-VFI Apache-2.0 ; **AMT est CC BY-NC 4.0 (exclu)**.

### Cited Findings
- **[mesure locale] rife-ncnn-vulkan 20221029 en mode CPU (`-g -1 -j 1:4:2`)** sur des images 576×1024 du film réel : une paire → 1,14 s (chargement du modèle compris) ; dossier de 8 images → 16 images en **3,90 s (RIFE v4.6)** et 3,70 s (v4.0), soit **≈ 0,46–0,49 s par image intermédiaire**, E/S PNG comprises. Le message « vkCreateInstance failed -9 » (pas d'ICD Vulkan) n'empêche pas le chemin CPU.
- **[mesure locale] ffmpeg `minterpolate=fps=48:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`** sur 5 s du film réel (120 images) : **40,7 s** ; `mi_mode=blend` (simple fondu, sur banc synthétique) : 1,05 s pour 5 s.
- Practical-RIFE : « 4.25 recommandé par défaut pour la plupart des scènes » ; avec 4.25 « les scènes d'anime ont été nettement améliorées » ; 4.24+ adapté au post-traitement de vidéos de diffusion ; modèles « lite » moins coûteux ; liens de modèles sous la même licence MIT — [README Practical-RIFE](https://raw.githubusercontent.com/hzwer/Practical-RIFE/main/README.md) ; licence MIT — [LICENSE](https://raw.githubusercontent.com/hzwer/Practical-RIFE/main/LICENSE) ; RIFE ECCV2022 MIT (Megvii) — [LICENSE](https://raw.githubusercontent.com/hzwer/ECCV2022-RIFE/main/LICENSE)
- rife-ncnn-vulkan : `-g -1` = CPU, `-j load:proc:save` (défaut 1:2:2) ; binaires sans CUDA ni PyTorch — [README rife-ncnn-vulkan](https://raw.githubusercontent.com/nihui/rife-ncnn-vulkan/master/README.md) ; MIT — [LICENSE](https://raw.githubusercontent.com/nihui/rife-ncnn-vulkan/master/LICENSE) ; ncnn BSD-3 (Tencent) — [LICENSE.txt](https://raw.githubusercontent.com/Tencent/ncnn/master/LICENSE.txt)
- Licences vérifiées (fichiers LICENSE bruts, 16/10/2026) : FILM (Google) Apache-2.0 — [LICENSE](https://raw.githubusercontent.com/google-research/frame-interpolation/main/LICENSE) ; IFRNet MIT — [LICENSE](https://raw.githubusercontent.com/ltkong218/IFRNet/main/LICENSE) ; EMA-VFI Apache-2.0 — [LICENSE](https://raw.githubusercontent.com/MCG-NJU/EMA-VFI/main/LICENSE) ; **AMT : Creative Commons BY-NC 4.0** — [LICENSE](https://raw.githubusercontent.com/MCG-NKU/AMT/main/LICENSE) ; GMFSS_Fortuna MIT — [LICENSE](https://raw.githubusercontent.com/98mxr/GMFSS_Fortuna/main/LICENSE) ; ToonCrafter (code) Apache-2.0 — [LICENSE](https://raw.githubusercontent.com/ToonCrafter/ToonCrafter/main/LICENSE)
- Défauts sur dessin animé : un développeur 2D rapporte que RIFE « mélange les deux images et le motif se perd » sur des aplats à motifs — [itch.io](https://itch.io/post/15747996) ; ToonCrafter (diffusion vidéo) vise les grands mouvements non linéaires et occlusions des dessins animés que les méthodes classiques gèrent mal — [arXiv 2405.17933](https://arxiv.org/abs/2405.17933v1) ; DRBA ajoute une couche de contrôle pour éviter les distorsions des réseaux d'interpolation sur l'anime — [DRBA](https://github.com/hyw-dev/DRBA)
- Ordre de grandeur GPU (pas CPU) : RIFE pour Nuke ~0,6 s/image HD sur RTX 3090 — [RIFE-for-Nuke](https://github.com/rafaelperez/RIFE-for-Nuke)

### Inferences
- Coût pour doubler un film de 60 s (24 → 48 i/s, 1 440 images intermédiaires) **(estimations)** : RIFE CPU ≈ 1 440 × 0,47 s ≈ **11 min** ; minterpolate mci ≈ 12 × 40,7 s ≈ **8 min** ; rendu analytique des 1 440 images en plus avec la config llvmpipe optimisée ≈ **49 s**. Le rendu analytique est ~10–13× moins cher et exact (pas de fantômes ni de déformation des contours).
- Utiliser RIFE (4.25 ou 4.25.lite, MIT) seulement pour les plans externes (Grok/Wan) dont on n'a pas la scène ; préférer rife-ncnn-vulkan pour éviter PyTorch (attention : la release 20221029 n'embarque les modèles que jusqu'à v4.6).
- ToonCrafter est un modèle de diffusion (GPU) : hors budget CPU « quelques minutes ».

### Gaps
- Qualité mesurée (SSIM/LPIPS) de RIFE vs rendu analytique sur nos plans : non faite (les deux images consécutives testées étaient quasi identiques, SSIM 0,995).
- Vitesses CPU de FILM, IFRNet, EMA-VFI, GMFSS : non mesurées, aucune source chiffrée trouvée.
- Licence d'AnimeInterp et licence des poids de ToonCrafter : non trouvées.
- Modèles RIFE ≥ 4.7 au format ncnn : disponibilité non vérifiée.

## 7. Flou de bouge et anticrénelage temporel pour la fluidité perçue (accumulation de sous-images, obturateur 180°), coût

### Takeaway
Le flou de bouge par accumulation coûte **N fois le rendu** (N sous-images), mais avec un moteur déterministe c'est simple et exact : rendre à 60 i/s et faire `tmix=frames=2` + `fps=30` donne un obturateur ~180° à 30 i/s pour ~2× le coût ; mieux, **flouter seulement les calques qui bougent vite** (cartes personnages, panoramiques) dans le shader, pour un surcoût limité à leurs pixels.

### Cited Findings
- RED : la règle des 7 s suppose 24 i/s et obturateur 180° ; « les angles plus grands rendent le panoramique plus fluide mais plus étalé », les petits plus nets mais saccadés — [RED « Camera panning speed »](https://www.reddigitalcinema.com/red-101/camera-panning-speed)
- Godot (doc officielle) : flou de bouge ×4 par `ffmpeg -i input.avi -vf "tmix=frames=4, fps=60" -crf 15 output.mp4` à partir d'une source 240 i/s — [Godot « Creating movies »](https://docs.godotengine.org/en/stable/tutorials/animation/creating_movies.html)
- Blender EEVEE : l'accumulation découpe le rendu en pas temporels, chaque pas = ré-évaluation complète de la scène ; précis mais demande beaucoup de pas pour des dégradés propres ; plus de pas permettent de réduire le flou post-traitement — [manuel Blender 4.2](https://docs.blender.org/manual/en/4.2/render/eevee/render_settings/motion_blur.html)
- **[mesure locale]** `tmix=frames=2` + encodage x264 veryfast sur 60 s synthétiques (1 440 images, source bruitée) : 9,6 s.

### Inferences
- Obturateur 180° = exposition d'une demi-période d'image (1/48 s à 24 i/s, 1/60 s à 30 i/s) — définition standard de l'angle d'obturateur, pas une valeur mesurée.
- Recette à coût maîtrisé **(proposition)** : rendre à 60 i/s (3 600 images ≈ 123 s, estimation §1) puis `-vf "tmix=frames=2,fps=30"` → film 30 i/s avec 2 échantillons couvrant 1/60 s (≈ 180°). Avec 4 sous-images (`fps=120`, `tmix=frames=4`), le coût double encore (~4 min) : réserver aux plans à panoramique rapide.
- Innovation possible : **flou de bouge sélectif dans la page** — pour chaque carte personnage, échantillonner sa transformée à k sous-temps dans le fragment shader (ou dessiner k copies à alpha 1/k) ; le décor, qui bouge lentement, reste à 1 échantillon. Coût proportionnel à l'aire des cartes, pas à l'image entière ni au maillage de 200k sommets. Critère : judder perçu (écart max de déplacement par image > 3–4 px sans flou) supprimé sur les plans de test, surcoût < 30 % du temps d'image (à mesurer).
- `tmix` sur des images à 24 i/s seulement (sans sur-échantillonnage) produit des fantômes, pas un vrai flou de bouge : à éviter.

### Gaps
- Pas de source sur les réglages d'obturateur utilisés dans l'animation 2D « cartoon » (où le flou est souvent dessiné à la main ou absent).
- Coût réel du flou sélectif dans notre page : non mesuré.

## 8. Fluidité perçue : seuils de judder des panoramiques à 24 i/s (règle des 7 s), 24 vs 30 vs 60 i/s pour TikTok/Reels

### Takeaway
À 24 i/s, la règle de base est **≤ une largeur d'image par 7 s** (soit ~82 px/s, **~3,4 px par image pour 576 px de large**) ; et sur téléphone 60 Hz, **24 i/s ajoute un judder de cadence 3:2** que 30 i/s n'a pas. Comme notre rendu est analytique et que TikTok recommande 30 i/s, **passer le moteur à 30 i/s (voire 60) est le levier de fluidité le moins cher** (+25 % d'images, ~62 s de rendu estimé pour 60 s).

### Cited Findings
- RED : « panoramiquer pas plus vite qu'une largeur d'image complète toutes les sept secondes », valable quel que soit l'objectif ou le capteur ; point de départ, pas une limite dure ; fondé sur 24 i/s et 180° ; filmer à 48 ou 60 i/s lisse les mouvements ; les sujets suivis ou proches peuvent justifier un panoramique plus rapide ; scènes contrastées plus sujettes au stroboscope ; commencer et finir le mouvement hors du cadre utile — [RED](https://www.reddigitalcinema.com/red-101/camera-panning-speed)
- Règle « 7 secondes bord à bord » attribuée aux recommandations de l'ASC par un intervenant de forum — [DVinfo](https://dvinfo.net/forum/canon-eos-full-frame-hd/514839-universal-frame-rate.html?nojs=1) ; « règle de base qui marche presque toujours » pour le motion design — [Adobe community, Rick Gerard](https://community.adobe.com/t5/after-effects/avoiding-judder-in-motion-graphics-by-rick-gerard/m-p/11865336) ; un calculateur RED cité sur un forum de drones donne un panoramique de 90° en ≥ 16 s à 24 i/s (~5,6°/s), valeur approximative — [MavicPilots](https://mavicpilots.com/threads/real-framerate-and-smooth-video.63482/post-724694)
- Sur un écran 60 Hz, une image à 24 i/s devrait durer 2,5 rafraîchissements : le système alterne 3 et 2 rafraîchissements (50 ms / 33 ms), cadence irrégulière visible surtout sur les panoramiques lents — [Forasoft « judder »](https://www.forasoft.com/learn/video-quality/glossary/terms-vqm/judder) ; [RTINGS « Stutter vs Judder »](https://www.rtings.com/tv/learn/research/motion-cadence)
- TikTok : 30 i/s recommandé, 60 i/s pour l'action — [postfa.st](https://postfa.st/sizes/tiktok/video) ; des pages de moindre qualité affirment que TikTok accepte 23,976 à 60 i/s avec lecture plafonnée à 60 i/s (non officiel)

### Inferences
- **Règle de caméra à coder dans le planificateur de plans (proposition, « plafond » appliqué par le code)** : vitesse de panoramique horizontal ≤ largeur/7 s → 82 px/s à 576 px de large ; à 24 i/s ≈ 3,4 px/image. Par proportionnalité du déplacement par image (inférence, pas une norme publiée) : à 30 i/s, ~4,3 px/image reste équivalent pour une largeur en ~5,6 s ; à 60 i/s, une largeur en ~2,8 s. Pour les tilts verticaux (1 024 px), la même logique donne ~146 px/s (inférence).
- **Courbes d'accélération** : démarrer/arrêter les mouvements de caméra par une rampe douce (ease-in/out sur ≥ 0,5 s) évite les à-coups de vitesse, cohérent avec le conseil RED de commencer et finir hors cadre.
- Sur téléphone 60 Hz (cas majoritaire supposé), **30 i/s est régulier (2:2), 24 i/s ne l'est pas (3:2)** ; sur écran 120 Hz, 24 (5:5) et 30 (4:4) sont tous deux réguliers (calcul de cadence). Recommandation : **rendu natif 30 i/s** pour TikTok/Reels, 60 i/s pour les plans d'action, et ne garder 24 i/s que pour un rendu « cinéma » assumé.
- Les personnages animés « en deux » (une pose toutes les 2 images) restent un choix de style ; le panoramique de caméra, lui, doit être recalculé à chaque image (sinon judder).

### Gaps
- Aucune source officielle TikTok/Instagram consultée directement (les pages d'aide n'ont pas été lues) ; fréquence de lecture effective des applis et taux 120 Hz des téléphones du public : non documentés.
- Pas d'étude perceptive trouvée sur les seuils de judder spécifiques au format vertical 9:16 ou à l'animation 2D.
