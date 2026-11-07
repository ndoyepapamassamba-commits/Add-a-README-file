# Skit Studio — moteur de génération massive de vidéos de skits (9:16)

Date : 2026-11-07 · Statut : brief utilisateur traité comme spec approuvée (session autonome).

## 1. Intention

Produire en masse, **entièrement dans le navigateur**, des vidéos verticales courtes de dialogues
satiriques (style de la vidéo de référence `tiktok_grok_v4.mp4`) : enchaînement de sketches
question/réponse, sous-titres animés, cartes titre et réaction, emojis, voix, export MP4/WebM
par lot (ZIP). Aucun serveur ; les API externes (LLM, images, TTS) sont optionnelles.

## 2. Rétro-ingénierie de la référence (mesuré sur le fichier)

| Élément | Observation |
|---|---|
| Format | 720×1280, 30 i/s, 62 s, AAC stéréo |
| Structure | 5 sketches, cycle de **12,4 s** : carte réaction 3,2 s → carte titre 2,0 s → plan large 5,0 s (réplique A) → gros plan 2,2 s (punchline B) |
| Accroche | Le sketch 1 démarre à froid (pas de carte titre), les cartes commencent après la 1re punchline |
| Outro | 2 s : « LA SUITE DEMAIN / ABONNE-TOI 🎉 » sur fond violet |
| Carte titre | Fond violet `#2b1b4f`, « SKETCH n/5 » en jaune, titre en blanc, gros emoji 3D |
| Carte réaction | Gros emoji 3D centré, rayons jaunes tournants, emojis flottants (🤣 🎉) |
| Sous-titres | Majuscules, gras (Montserrat 800), blanc + contour noir, **1 à 3 mots-clés en jaune** (fin de phrase), emoji réaction à droite, centrés dans le tiers bas |
| Visuels | Personnages 3D type Pixar (images IA), plan large de situation puis gros plan de la réaction |
| Audio | Voix synthétiques par personnage + lit musical continu |

## 3. Architecture

```
Script (JSON/CSV/texte/générateur/LLM)
   → Normalisation (10-script.js)
   → Voix : mesure/synthèse audio par réplique (40-voices.js, 30-audio.js)
   → Timeline : segments datés (20-timeline.js)
   → Peintre : t → image (70-painter.js, 60-avatars.js, 50-assets.js)
   → Encodeur : WebCodecs + mp4-muxer | MediaRecorder (80-encoder.js)
   → Lot : variantes × file d'attente × ZIP (90-batch.js, 85-zip.js)
```

Scripts classiques (pas de modules ES) pour fonctionner en `file://` par double-clic.
Chaque fichier expose `SkitStudio.<Module>` et `module.exports` pour les tests Node.
Un outil `tools/build-standalone.js` concatène tout en un seul HTML autonome.

### Modèle de projet

```js
{
  id, title, fps: 30, width: 1080, height: 1920,
  theme: { bg, accent, text, font },
  characters: [{ id:'A', name, color, voice:{provider, voiceId, rate, pitch}, avatar:{...} }],
  sketches: [{ title, emoji, scene, lines:[{ speaker, text, emoji, shot:'wide'|'close', emotion }] }],
  layout: { hookFirst, titleCards, reactionCards, outro:{ line1, line2, emoji } },
  subtitles: { mode:'phrase'|'words'|'karaoke', size, highlight:'last'|'marked', uppercase },
  audio: { music:{ volume, duck }, sfx:{ enabled }, laughOnPunchline },
  timing: { reaction, title, minLine, pad, outro }
}
```

Mots-clés : `*mot*` dans le texte force la mise en couleur ; sinon les 2 derniers mots.

### Segments de timeline

`{ type:'line'|'title'|'reaction'|'outro', start, dur, sketch, line, audio }`.
Durée d'une réplique = max(minLine, durée audio + pad). Sans audio mesurable
(Web Speech), estimation : 0,065 s/caractère + 0,4 s.

### Voix (fournisseurs)

- `blip` : voix procédurale (syllabes → bips, hauteur par personnage) — hors ligne, exportable.
- `webspeech` : aperçu seulement (non capturable), export avec durées estimées.
- `openai` : endpoint compatible OpenAI `/audio/speech` (OpenAI, OpenRouter, serveur local).
- `elevenlabs` : `/v1/text-to-speech/{voice}`.
- `file` : fichiers audio importés par réplique.

### Visuels

- Avatars procéduraux (canvas) : tête, yeux, sourcils, bouche synchronisée sur l'enveloppe audio, 6 émotions, 6 décors.
- Images importées ou générées (endpoint compatible OpenAI `/images/generations`) avec effet Ken Burns et recadrage gros plan.
- Emojis : police système ou PNG 3D Fluent (CDN jsDelivr) avec repli.

### Export

1. WebCodecs : H.264 → VP9 → AV1 ; AAC → Opus ; mux MP4 via `mp4-muxer` (CDN) ; audio rendu hors ligne (OfflineAudioContext).
2. Repli : `MediaRecorder` en temps réel (MP4 si supporté, sinon WebM).
3. Lot : file d'attente séquentielle, aperçu de progression, téléchargement individuel ou ZIP (writer STORE maison).

### Génération en masse

Variantes = (banque de sketches) × (K sketches par vidéo, mélangés par graine) × (thèmes de couleur) × (jeux d'emojis) × (ordre d'accroche). Générateur hors ligne par gabarits (slots : prénoms, lieux, objets) + fournisseur LLM optionnel (JSON structuré).

## 4. Tests

- Node (`node --test`) : parseur de scripts, timeline, variantes, ZIP (vérifié par `unzip -t`).
- Playwright : rendu d'un projet de 3 sketches en headless → MP4 vérifié par `ffprobe` (dimensions, durée, piste audio).

## 5. Hors périmètre

Génération vidéo IA (image → vidéo), lip-sync photoréaliste, publication automatique sur TikTok.
