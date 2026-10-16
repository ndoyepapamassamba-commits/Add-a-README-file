# Notices des composants tiers — moteur fluide

Ce fichier recense **chaque** composant tiers du moteur, sa version exacte et sa licence. Règle du projet : uniquement
des licences permissives (MIT, ISC, BSD, Apache-2.0 ; domaine public). Aucune ligne de code tiers n'est copiée dans `src/` :
les bibliothèques sont utilisées comme dépendances, et les idées des autres moteurs sont réécrites à partir des formules
(voir `CONCEPTION.md`).

Inventaire produit depuis `node_modules` (installation du 16 octobre 2026, `npm install` avec versions exactes).

## Dépendances directes

| Paquet | Version | Licence | Rôle | Statut | Source |
|---|---|---|---|---|---|
| pixi.js | 8.22.0 | MIT | rendu WebGL dans la page (inclus dans `dist/page.js`) | dépendance | https://github.com/pixijs/pixijs |
| delaunator | 5.1.0 | ISC | triangulation de Delaunay des maillages de personnages (import, Node) | dépendance | https://github.com/mapbox/delaunator |
| pngjs | 7.0.0 | MIT | lecture et écriture PNG dans Node (masques, profondeurs, contrôles) | dépendance | https://github.com/pngjs/pngjs |
| playwright | 1.56.1 | Apache-2.0 | pilotage de Chromium sans écran pour la capture image par image | outil (dev) | https://github.com/microsoft/playwright |
| esbuild | 0.28.2 | MIT | construction de la page de rendu | outil (dev) | https://github.com/evanw/esbuild |
| typescript | 5.9.3 | Apache-2.0 | vérification des types | outil (dev) | https://github.com/microsoft/TypeScript |
| vitest | 4.1.11 | MIT | tests | outil (dev) | https://github.com/vitest-dev/vitest |
| vite | 7.3.7 | MIT | moteur de vitest (épinglé en 7.x : évite lightningcss, MPL-2.0) | outil (dev) | https://github.com/vitejs/vite |
| tsx | 4.23.15 | MIT | exécution des commandes TypeScript (`npm run rendre`) | outil (dev) | https://github.com/privatenumber/tsx |
| @types/node | 22.20.5 | MIT | types de Node | outil (dev) | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/pngjs | 6.0.5 | MIT | types de pngjs | outil (dev) | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/delaunator | 5.0.3 | MIT | types de delaunator | outil (dev) | https://github.com/DefinitelyTyped/DefinitelyTyped |

## Composants inclus dans la page de rendu (`dist/page.js`)

PixiJS embarque les paquets suivants ; esbuild conserve leurs commentaires de licence en fin de fichier (`legalComments: 'eof'`).

| Paquet | Version | Licence |
|---|---|---|
| @pixi/colord | 2.9.6 | MIT |
| @xmldom/xmldom | 0.8.15 | MIT |
| earcut | 3.2.4 | ISC |
| eventemitter3 | 5.0.4 | MIT |
| gifuct-js | 2.1.2 | MIT |
| js-binary-schema-parser | 2.0.3 | MIT |
| ismobilejs | 1.1.1 | MIT |
| parse-svg-path | 0.2.0 | MIT |
| tiny-lru | 11.4.7 | BSD-3-Clause |
| @types/earcut | 3.0.0 | MIT |
| @webgpu/types | 0.1.74 | BSD-3-Clause |

## Dépendances transitives (outils de développement et de test)

| Paquet | Version | Licence |
|---|---|---|
| @esbuild/linux-x64 | 0.28.2 | MIT |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT |
| @napi-rs/lzma-linux-x64-gnu | 1.5.1 | MIT |
| @rollup/rollup-linux-x64-gnu | 4.64.7 | MIT |
| @standard-schema/spec | 1.1.0 | MIT |
| @types/chai | 5.2.3 | MIT |
| @types/deep-eql | 4.0.2 | MIT |
| @types/estree | 1.0.9 | MIT |
| @vitest/expect | 4.1.11 | MIT |
| @vitest/mocker | 4.1.11 | MIT |
| @vitest/pretty-format | 4.1.11 | MIT |
| @vitest/runner | 4.1.11 | MIT |
| @vitest/snapshot | 4.1.11 | MIT |
| @vitest/spy | 4.1.11 | MIT |
| @vitest/utils | 4.1.11 | MIT |
| assertion-error | 2.0.1 | MIT |
| chai | 6.3.0 | MIT |
| convert-source-map | 2.0.0 | MIT |
| es-module-lexer | 2.3.2 | MIT |
| estree-walker | 3.0.3 | MIT |
| expect-type | 1.4.0 | Apache-2.0 |
| fdir | 6.5.0 | MIT |
| magic-string | 0.30.21 | MIT |
| nanoid | 3.3.20 | MIT |
| obug | 2.2.1 | MIT |
| pathe | 2.0.3 | MIT |
| picocolors | 1.1.1 | ISC |
| picomatch | 4.0.7 | MIT |
| playwright-core | 1.56.1 | Apache-2.0 |
| postcss | 8.5.30 | MIT |
| robust-predicates | 3.0.3 | Unlicense |
| rollup | 4.64.7 | MIT |
| siginfo | 2.0.0 | ISC |
| source-map-js | 1.2.2 | BSD-3-Clause |
| stackback | 0.0.2 | MIT |
| std-env | 4.3.0 | MIT |
| tinybench | 2.9.0 | MIT |
| tinyexec | 1.3.1 | MIT |
| tinyglobby | 0.2.17 | MIT |
| tinyrainbow | 3.2.0 | MIT |
| undici-types | 6.21.0 | MIT |
| why-is-node-running | 2.3.0 | MIT |

## Points d’attention

- **robust-predicates 3.0.3 — Unlicense** (dédicace au domaine public, approuvée OSI), dépendance de `delaunator`. Permissive ; signalée
  car ce n'est ni MIT, ni ISC, ni BSD, ni Apache. Si on veut s'en passer, `rig/` peut écrire sa propre triangulation
  (Bowyer-Watson, prévue dans la note de recherche 02, G5).
- **lightningcss (MPL-2.0)** : écarté en épinglant `vite` en 7.3.7 (vite 8 l'impose).
- Les outils de développement (`typescript`, `vitest`, `vite`, `esbuild`, `tsx`, `playwright`) ne sont jamais inclus dans les vidéos.

## Outils système (hors npm)

| Outil | Version | Licence | Usage |
|---|---|---|---|
| Chromium (navigateur de Playwright, `chromium-1194`, préinstallé dans `/opt/pw-browsers`) | celui de Playwright 1.56.1 | BSD-3-Clause et licences de ses composants | rendu WebGL sans écran (SwiftShader), usage local, non redistribué |
| FFmpeg / ffprobe (`/usr/bin`) | 6.1.1-3ubuntu5 | build Ubuntu `--enable-gpl` (libx264 GPL) | encodage et vérification en processus séparé, usage local, non redistribué ; `export/` consigne `ffmpeg -version` et `-buildconf` dans son rapport ; `scene/analyse.ts` l'appelle aussi (processus séparé) pour décoder les images du kit en RGBA brut |
| Police Inter (`/usr/share/fonts/opentype/inter`, paquet système) | celle du système | SIL Open Font License 1.1 | sous-titres incrustés (nommée par la page, jamais copiée ni redistribuée ; l'OFL autorise son usage dans les vidéos produites). Repli : DejaVu Sans (licence libre Bitstream Vera / domaine public) |

## Outils de préparation facultatifs (hors npm, processus séparés, jamais inclus dans le dépôt)

| Outil ou ressource | Version | Licence | Usage |
|---|---|---|---|
| onnxruntime (Python) | 1.31.0 | MIT | `outils/voix/piper_onnx.py` : exécute le modèle de voix (notre propre appel, sans le code Piper) |
| onnx (Python) | 1.23.2 | Apache-2.0 | lecture du graphe de voix et sortie des durées (`w_ceil`) |
| numpy (Python) | 2.5.4 | BSD-3-Clause | tampons audio |
| Voix Piper `fr_FR-mls-medium` (fichier `.onnx` + `.onnx.json`, téléchargé hors dépôt) | version des piper-voices (Hugging Face `rhasspy/piper-voices`) | **CC BY 4.0** (données Multilingual LibriSpeech, CC BY 4.0) | voix des répliques (`npm run voix`). **Attribution obligatoire** dans les crédits des vidéos : « Voix : Piper fr_FR mls medium (CC BY 4.0) ». Licence de contenu permissive mais distincte de MIT/BSD/Apache : signalée ici. Le moteur `piper-tts` (GPL-3.0) et espeak-ng (GPL-3.0) ne sont PAS utilisés : la phonétisation est la nôtre (`visage/phonetique`). |
| `sd-cli` de stable-diffusion.cpp | compilé localement | MIT | agrandissement de la texture d'un personnage (`outils/affiner`) |
| Poids `RealESRGAN_x4plus_anime_6B.pth` (xinntao/Real-ESRGAN, publication GitHub) | fichier publié avec Real-ESRGAN | BSD-3-Clause | agrandisseur ×4 de la texture d'un dessin trop petit (`outils/affiner`) |

## Ressources privées

Les décors (`studio-troupe/.private/kit/`) et les dessins de la troupe sont **lus sur place** et ne sont jamais copiés dans le
dépôt ; les rendus qui les utilisent vont dans `studio-troupe/sorties/` (ignoré par git).
