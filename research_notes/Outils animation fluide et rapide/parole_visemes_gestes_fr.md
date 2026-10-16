# De la parole FRANÇAISE aux données d'animation (phonèmes/visèmes, lip-sync, gestes, expressions) — chaîne libre, rapide, CPU seul (état au 16/10/2026)

Contexte rappelé : MASSAMBA Workbench, sketches comiques en français, personnages africains dessinés ; voix Piper (fr_FR-siwis-medium, fr_FR-tom-medium) ; bouche = enveloppe RMS + plan texte → visèmes maison (5 dessins d'ouverture) ; conteneur 4 cœurs sans GPU, Python 3.12, Node 22 ; règle maison : code et poids exécutés chez nous en MIT / Apache-2.0 / BSD seulement ; objectif « un film de 60 s en quelques minutes ».

Conventions : « RTF » = temps de calcul ÷ durée audio (plus petit = plus rapide) sauf mention « × temps réel » (plus grand = plus rapide). « Mesure locale » = mesuré le 16/10/2026 dans ce conteneur (4 cœurs, sans GPU) ; scripts dans le bloc-notes de la session (`/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/scripts/piper_align_test.py` et `.../scripts/cmp_piper_rhubarb.py`).

---

## 1. Reconnaissance phonétique et alignement forcé du français (Rhubarb, Papagayo-NG, Allosaurus, wav2vec2/XLS-R, MFA, WhisperX, whisper-timestamped, torchaudio MMS_FA)

### Takeaway
Pour une voix SYNTHÉTISÉE, le meilleur « aligneur » est le TTS lui-même : Piper 1.8.0 (déjà installé) expose la durée exacte de chaque phonème (mesuré : somme des durées = durée audio à l'échantillon près). Rhubarb (MIT) reste utile en contrôle ou pour un audio importé, mais son mode phonétique est imprécis en français (mesuré : 21/29 bilabiales couvertes à ±40 ms, décalages de −251 à +109 ms). Pour un audio réel avec texte connu, la voie sous licence permise est un alignement CTC (code BSD) avec un modèle Apache-2.0 (`facebook/wav2vec2-xlsr-53-espeak-cv-ft` pour les phonèmes, `jonatasgrosman/wav2vec2-large-xlsr-53-french` pour les mots) ou MFA (code MIT, modèle français CC BY 4.0). Attention : les modèles PAR DÉFAUT de WhisperX (français), torchaudio MMS_FA et ctc-forced-aligner sont CC BY-NC 4.0.

### Cited Findings

**Rhubarb Lip Sync**
- Licence : Rhubarb est MIT et « toutes ses dépendances tierces » sont MIT, BSD ou équivalentes ; les données de lip-sync produites « vous appartiennent » — [LICENSE.md Rhubarb](https://github.com/DanielSWolf/rhubarb-lip-sync/blob/master/LICENSE.md)
- Dernière version : 1.14.0, publiée un « 03 Apr » (l'année n'est pas affichée sur la page ; les versions précédentes : 1.13.0 « 14 Jun », 1.12.0 « 12 Mar ») ; aucune mention d'une 2.0 ni d'une réécriture — [Releases Rhubarb](https://github.com/DanielSWolf/rhubarb-lip-sync/releases)
- 1.14.0 n'ajoute que des projets de démo Spine/After Effects et des correctifs ; le mode phonétique date de 1.9.0 (« basic support for non-English recordings through phonetic recognition ») — [CHANGELOG Rhubarb](https://raw.githubusercontent.com/DanielSWolf/rhubarb-lip-sync/master/CHANGELOG.md)
- Deux reconnaisseurs : PocketSphinx (« only recognizes English dialog ») et Phonetic (« language-independent… Use it if your recordings are not in English », résultats « less precise ») — [README Rhubarb](https://github.com/DanielSWolf/rhubarb-lip-sync)
- Formes de bouche : A (fermée, P/B/M), B (légèrement ouverte, dents serrées, la plupart des consonnes), C (ouverte, EH), D (grande ouverte, AA), E (légèrement arrondie, AO/ER), F (lèvres en avant, UW/OW/W) ; étendues optionnelles G (dents sur la lèvre inférieure, F/V), H (L long), X (repos) — [README Rhubarb](https://github.com/DanielSWolf/rhubarb-lip-sync)
- Sorties TSV, XML, JSON, plus `dat` pour Moho/OpenToonz ; autant de fils que de cœurs par défaut — [README Rhubarb](https://github.com/DanielSWolf/rhubarb-lip-sync)
- Mesure antérieure (14/10/2026, 22 répliques françaises) : 1,65 s de calcul pour 1,78 s de voix ; ses fermetures A tombent 2,25× plus dans les mots à m/b/p (63 % vs 28 % du temps) ; ses autres formes ouvraient moins que la voix → seules les fermetures sont gardées — [journal veille-permanente du dépôt](/home/user/Add-a-README-file/.claude/skills/veille-permanente/SKILL.md)
- **Mesure locale (16/10/2026)** sur 3 répliques Piper siwis (12,5 s d'audio) : sur 29 bilabiales /m b p/ données par Piper, 21 (72 %) recouvertes par une forme A de Rhubarb (phonétique) à ±40 ms ; écart début-A − début-phonème : de −251 ms à +109 ms (médiane −48 ms sur les 21 cas) ; calcul Rhubarb 1,14–1,26 s pour ~4 s (RTF 0,27–0,33), 8,3 s au premier appel (RTF 1,85, démarrage à froid) — [script local](/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/scripts/cmp_piper_rhubarb.py)

**Papagayo-NG**
- Licence GPL (fichier `gpl.txt`, version non précisée sur la page) ; jeu de bouches Preston Blair par défaut, Fleming & Dobbs disponible ; « now only works with Moho » ; dépôt contenant `Rhubarb.py` et `auto_recognition.py` ; découpages par langue (italien, coréen cités), le français n'est pas mentionné — [GitHub Papagayo-NG](https://github.com/morevnaproject/papagayo-ng)

**Allosaurus (reconnaisseur universel de phones)**
- Code GPL-3.0 — [LICENSE Allosaurus](https://github.com/xinjli/allosaurus/blob/master/LICENSE)
- Inventaire universel « around 230 phones » par défaut ; option `lang` pour restreindre à l'inventaire d'une langue (« can improve your recognition accuracy ») ; modèles téléchargés automatiquement (`latest`) — [README Allosaurus](https://github.com/xinjli/allosaurus)

**Modèles wav2vec2 / XLS-R (phonèmes et mots)**
- `facebook/wav2vec2-xlsr-53-espeak-cv-ft` (reconnaissance de phonèmes multilingue, étiquettes espeak) : licence apache-2.0 sur la fiche — [API Hugging Face](https://huggingface.co/api/models/facebook/wav2vec2-xlsr-53-espeak-cv-ft)
- `Cnam-LMSSC/wav2vec2-french-phonemizer` : MIT sur la fiche ; parole → phonèmes IPA en français ; PER 5,52 % (Common Voice FR 13.0 test), 4,36 % (MLS FR) ; affiné à partir de `facebook/wav2vec2-base-fr-voxpopuli-v2` — [fiche Cnam-LMSSC](https://huggingface.co/Cnam-LMSSC/wav2vec2-french-phonemizer)
- …or ce modèle de base est publié en cc-by-nc-4.0 — [API Hugging Face voxpopuli-v2 fr](https://huggingface.co/api/models/facebook/wav2vec2-base-fr-voxpopuli-v2) (licence héritée à clarifier : contradiction MIT dérivé / NC d'origine)
- `jonatasgrosman/wav2vec2-large-xlsr-53-french` (mots, caractères) : apache-2.0 — [API Hugging Face](https://huggingface.co/api/models/jonatasgrosman/wav2vec2-large-xlsr-53-french)

**Montreal Forced Aligner (MFA)**
- Code MIT — [LICENSE MFA](https://github.com/MontrealCorpusTools/Montreal-Forced-Aligner/blob/main/LICENSE)
- Modèle acoustique « French MFA » v3.0.0 (entraîné le 29/02/2024) : CC BY 4.0 ; données Common Voice FR v16.1 (963,62 h, 17 312 locuteurs), GlobalPhone FR (26,95 h), « African-accented French » (19,93 h, 233 locuteurs) ; WER 0 % indiqué mais « not a typical WER measure on held out data » — [doc MFA, modèle acoustique français](https://mfa-models.readthedocs.io/en/latest/acoustic/French/French%20MFA%20acoustic%20model%20v3_0_0.html)
- Dictionnaire « French MFA » v3.0.0 : CC BY 4.0, 105 730 mots, variété « de prestige » (couverture plus faible pour d'autres variétés) — [doc MFA, dictionnaire français](https://mfa-models.readthedocs.io/en/latest/dictionary/French/French%20MFA%20dictionary%20v3_0_0.html) ; le dépôt `mfa-models` est sous CC BY 4.0 — [LICENSE mfa-models](https://github.com/MontrealCorpusTools/mfa-models/blob/main/LICENSE)
- Préprint MFA 3.0 (McAuliffe et al., 16/06/2026) : erreurs moyennes de frontières « below 15 ms » sur quatre corpus (anglais, japonais, coréen — pas de français) — [arXiv 2606.18466](https://arxiv.org/abs/2606.18466)
- Français non natif (Zhou & Hutin, Interspeech 2025) : WebMAUS meilleur pour la segmentation mots et phones, SPPAS meilleur pour l'étiquetage, « MFA the worst » — [ISCA Archive](https://www.isca-archive.org/interspeech_2025/zhou25b_interspeech.html)

**WhisperX, whisper-timestamped, torchaudio, ctc-forced-aligner**
- WhisperX : code BSD-2-Clause — [LICENSE WhisperX](https://github.com/m-bain/whisperX/blob/main/LICENSE) ; son modèle d'alignement par défaut pour `fr` est `VOXPOPULI_ASR_BASE_10K_FR` (pipeline torchaudio) — [alignment.py](https://github.com/m-bain/whisperX/blob/main/whisperx/alignment.py)
- …modèle publié « under CC BY-NC 4.0 and redistributed with the same license », affiné sur 211 h de français VoxPopuli — [doc torchaudio VOXPOPULI_ASR_BASE_10K_FR](https://docs.pytorch.org/audio/2.8.0/generated/torchaudio.pipelines.VOXPOPULI_ASR_BASE_10K_FR.html)
- whisper-timestamped : AGPL-3.0 — [LICENSE whisper-timestamped](https://github.com/linto-ai/whisper-timestamped/blob/master/LICENSE)
- torchaudio : code BSD-2-Clause — [LICENSE torchaudio](https://github.com/pytorch/audio/blob/main/LICENSE) ; `forced_align` marqué DEPRECATED en 2.8, « removed in 2.9 » selon le tutoriel 2.9 — [tutoriel CTC 2.9](https://docs.pytorch.org/audio/2.9.0/tutorials/ctc_forced_alignment_api_tutorial.html) ; contredit par les notes de version 2.9 : « We're still working towards preserving `forced_align`, `lfilter`… » — [release v2.9.0](https://github.com/pytorch/audio/releases/tag/v2.9.0)
- MMS_FA (torchaudio) : 1 130 langues, 31 000 h, publié « under CC-BY-NC 4.0 License » — [doc MMS_FA](https://docs.pytorch.org/audio/2.8.0/generated/torchaudio.pipelines.MMS_FA.html)
- ctc-forced-aligner : code BSD-2-Clause (2026) ; accepte tout modèle CTC Hugging Face, mais modèle par défaut `MahmoudAshraf/mms-300m-1130-forced-aligner` en cc-by-nc-4.0 — [LICENSE](https://github.com/MahmoudAshraf97/ctc-forced-aligner/blob/main/LICENSE), [README](https://github.com/MahmoudAshraf97/ctc-forced-aligner), [API Hugging Face](https://huggingface.co/api/models/MahmoudAshraf/mms-300m-1130-forced-aligner)
- faster-whisper-small (poids MIT, français inclus) est déjà en cache local (`~/.cache/massamba-models/whisper`) — [API Hugging Face Systran](https://huggingface.co/api/models/Systran/faster-whisper-small)
- Kyutai STT `stt-1b-en_fr` : anglais + français, horodatage au mot ; poids CC BY 4.0, code MIT (Python) / Apache (Rust) — [README delayed-streams-modeling](https://github.com/kyutai-labs/delayed-streams-modeling)
- Autres : gentle (MIT, anglais) — [COPYING gentle](https://github.com/lowerquality/gentle/blob/master/COPYING) ; aeneas (AGPL-3.0) — [LICENSE aeneas](https://github.com/readbeyond/aeneas/blob/master/LICENSE)

**Phonétisation (G2P) du texte français**
- espeak-ng (utilisé par Piper et par Kokoro pour le français) : GPL-3.0 — [COPYING espeak-ng](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING)
- gruut : MIT, français pris en charge (`fr` / `fr-fr`) — [LICENSE gruut](https://github.com/rhasspy/gruut/blob/master/LICENSE), [README gruut](https://github.com/rhasspy/gruut)

### Inferences
- Les voix étant synthétisées, la reconnaissance phonétique est inutile dans le cas nominal : les durées internes du TTS sont la vérité terrain du son produit (voir §2). Rhubarb devient un **contrôle indépendant** (taux de bilabiales couvertes, écart médian) plutôt qu'une source.
- Pour un audio externe (doublage enregistré, rire, voix d'un autre moteur) avec texte connu : alignement CTC maison ou `ctc-forced-aligner` (BSD) **en forçant** un modèle Apache (`wav2vec2-xlsr-53-espeak-cv-ft` pour des phonèmes IPA ; `jonatasgrosman/...-french` pour les mots) ; ne jamais garder les valeurs par défaut (WhisperX fr, MMS_FA, mms-300m = non commercial).
- MFA est la référence de précision (frontières < 15 ms sur d'autres langues) avec un modèle français riche en accents africains (19,93 h), mais sa licence de modèle (CC BY 4.0) sort de la règle MIT/Apache/BSD stricte ; acceptable seulement si la règle admet CC BY avec attribution (déjà le cas de fait pour la voix siwis).
- Allosaurus (GPL-3.0), Papagayo-NG (GPL, Moho seulement), whisper-timestamped et aeneas (AGPL) sont hors règle.
- Le dépôt torchaudio est en phase de maintenance ; ne pas dépendre de `forced_align` sans test `hasattr(...)` ; un Viterbi CTC en numpy (quelques dizaines de lignes) supprime la dépendance.

### Gaps
- Licence des poids Allosaurus non trouvée dans le README.
- Aucun banc publié mesurant la précision de Rhubarb « phonétique » sur du français ; seule notre mesure locale (29 bilabiales) existe.
- Les chiffres MFA vs WebMAUS vs SPPAS sur le français (Zhou & Hutin 2025) ne sont pas lus (PDF non consulté) ; pas de banc trouvé pour wav2vec2/CTC sur le français natif à 20 ms.
- Statut réel de `torchaudio.functional.forced_align` en 2.9/2.10 : sources contradictoires, non testé (torch absent du conteneur).
- Année exacte de Rhubarb 1.14.0 non affichée.

---

## 2. TTS français qui donnent directement les temps des phonèmes/mots, et voix expressives sur CPU (licences, vitesse)

### Takeaway
Piper 1.8.0 donne déjà les alignements phonème par phonème en français (mesuré, exact) — c'est le gain immédiat, sans nouveau modèle. Mais : piper1-gpl est GPL-3.0, espeak-ng aussi, et la voix « tom » est issue de données sous AGPLv3. Pour des voix plus expressives sur CPU sous licence permissive : Kokoro-82M (Apache-2.0, une seule voix FR, grade B-, durées prédites exposées), Pocket TTS de Kyutai (code MIT, poids CC BY 4.0, français, clonage de voix, ~2,3–2,5× temps réel annoncé sur 4 vCPU), Chatterbox Multilingual V3 (MIT, français, contrôle « exaggeration », plus lent que le temps réel sur CPU). Voxtral TTS, F5-TTS, XTTS-v2 et Fish Audio sont non commerciaux.

### Cited Findings

**Piper (OHF-Voice/piper1-gpl)**
- Le dépôt actif est sous GPL-3.0 — [GitHub piper1-gpl](https://github.com/OHF-Voice/piper1-gpl) ; l'ancien dépôt `rhasspy/piper` est MIT — [LICENSE rhasspy/piper](https://github.com/rhasspy/piper/blob/master/LICENSE.md) ; l'Open Home Foundation « is looking for maintainers for Piper » — [README piper1-gpl](https://github.com/OHF-Voice/piper1-gpl)
- Le conteneur a `piper-tts` 1.8.0 (donc la version GPL) — mesure locale (`pip show piper-tts`)
- Alignements : « experimental support » depuis 1.3.1 ; patch en mémoire depuis 1.5.0 ; `PiperVoice.load(..., include_alignments=True)` (paquet `onnx` requis, `pip install piper-tts[alignment]`) ; `AudioChunk` reçoit `phonemes`, `phoneme_ids`, `phoneme_id_samples`, `phoneme_alignments` (nombre d'échantillons par phonème) ; destiné à « aligning speech with mouth movement » — [docs/ALIGNMENTS.md](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/ALIGNMENTS.md), [CHANGELOG](https://github.com/OHF-Voice/piper1-gpl/blob/main/CHANGELOG.md)
- **Mesure locale** (phrase de 4,4 s, 4 cœurs) : siwis-medium = synthèse 2,25 s (RTF 0,51), tom-medium (44,1 kHz) = 4,74 s (RTF 1,03) ; 82 éléments d'alignement ; **somme des durées = durée audio exacte** (4,400 s / 4,400 s ; 4,586 / 4,586) ; il faut AUSSI passer `include_alignments=True` à `synthesize()` (sinon rien) ; la liste contient l'accent `ˈ`, le tilde nasal `̃` et les espaces comme éléments séparés (à fusionner avec le phonème voisin) — [script local](/tmp/claude-0/-home-user-Add-a-README-file/b47568ca-f920-5025-9cd6-5f833e2dbfb0/scratchpad/scripts/piper_align_test.py)
- Licences des données des voix françaises : siwis CC BY 4.0 ; **tom AGPLv3** ; upmc (jessica/pierre) CC BY-SA 4.0 ; gilles CC0 (qualité « low », 16 kHz) ; mls (125 locuteurs) CC BY 4.0 — [MODEL_CARD siwis](https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/siwis/medium/MODEL_CARD), [tom](https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/tom/medium/MODEL_CARD), [upmc](https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/upmc/medium/MODEL_CARD), [gilles](https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/gilles/low/MODEL_CARD), [mls](https://huggingface.co/rhasspy/piper-voices/blob/main/fr/fr_FR/mls/medium/MODEL_CARD)

**Kokoro-82M (hexgrad)**
- Poids apache-2.0 ; « deployed in numerous projects and commercial APIs » — [fiche Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) ; code `kokoro` et G2P `misaki` Apache-2.0 — [LICENSE kokoro](https://github.com/hexgrad/kokoro/blob/main/LICENSE), [LICENSE misaki](https://github.com/hexgrad/misaki/blob/main/LICENSE)
- Français : une seule voix `ff_siwis` (féminine, note globale B-, < 11 h de données SIWIS CC BY 4.0), G2P espeak-ng `fr-fr` ; « Support for non-English languages may be absent or thin » — [VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)
- Horodatage au mot (`join_timestamps`) appliqué seulement pour `lang_code` 'a'/'b' (anglais) ; pour les autres langues le résultat garde `pred_dur` (durées prédites, 1 trame = 600 échantillons à 24 kHz = 25 ms) — [kokoro/pipeline.py](https://github.com/hexgrad/kokoro/blob/main/kokoro/pipeline.py)
- Vitesse CPU : aucun banc x86 fiable trouvé ; ports mobiles : RTF 0,58 (émulateur Android, ONNX), ~1,8 (Pixel 8a, LiteRT fp32) — [soniqo Android](https://soniqo.audio/benchmarks/android), [LiteRT Kokoro](https://huggingface.co/litert-community/Kokoro-82M)

**Pocket TTS (Kyutai)**
- Code MIT — [LICENSE pocket-tts](https://github.com/kyutai-labs/pocket-tts/blob/main/LICENSE) ; poids CC BY 4.0, langues en/fr/de/pt/it/es, mis à jour le 11/10/2026 (accès restreint sur HF) — [API Hugging Face kyutai/pocket-tts](https://huggingface.co/api/models/kyutai/pocket-tts)
- « Runs on CPU », 100 M paramètres, ~200 ms avant le premier son, « ~6x real-time on a CPU of MacBook Air M4 », « Uses only 2 CPU cores », clonage de voix, français ; variantes 24 couches pour les langues non anglaises « higher quality but slower » ; sur VM x86 4 vCPU : « RTF ~2.3-2.5x on CPU » (× temps réel) — [README pocket-tts](https://github.com/kyutai-labs/pocket-tts)
- Licences des voix détaillées par voix — [kyutai/tts-voices](https://huggingface.co/kyutai/tts-voices)

**Kyutai TTS 1.6B en_fr (DSM)**
- Poids CC BY 4.0, anglais + français, 1,8 B paramètres réels, streaming, voix via embeddings pré-calculés, pas de filigrane ; entraîné sur 32 H100 — [fiche kyutai/tts-1.6b-en_fr](https://huggingface.co/kyutai/tts-1.6b-en_fr) ; code MIT / Apache — [README DSM](https://github.com/kyutai-labs/delayed-streams-modeling)

**Chatterbox (Resemble AI)**
- Code MIT — [LICENSE chatterbox](https://github.com/resemble-ai/chatterbox/blob/master/LICENSE) ; fiche HF MIT, 23 langues dont le français — [fiche ResembleAI/chatterbox](https://huggingface.co/ResembleAI/chatterbox)
- « Chatterbox Multilingual V3 » (500 M) : meilleure similarité, moins d'hallucinations ; « Single Language Pack » de 6 versions affinées ; contrôle « exaggeration/intensity » (défaut 0,5 ; ~0,7+ avec cfg ~0,3 pour plus de drame ; plus d'exaggeration accélère le débit) ; sorties filigranées — [fiche Chatterbox](https://huggingface.co/ResembleAI/chatterbox)
- CPU : port LiteRT INT8 RTF 0,95 et FP32 RTF 2,3 sur 4 fils pour 5 s d'énoncé (variante non précisée ; la boucle autorégressive T3 = 85 % du temps) — [soniqo/Chatterbox-LiteRT](https://huggingface.co/soniqo/Chatterbox-LiteRT) ; Turbo = anglais seulement, MIT — [API HF chatterbox-turbo](https://huggingface.co/api/models/ResembleAI/chatterbox-turbo)

**Autres modèles et licences (poids)**
- Voxtral-4B-TTS-2603 (Mistral) : CC BY-NC 4.0 (héritée des voix de référence), 9 langues dont le français — [fiche Voxtral TTS](https://huggingface.co/mistralai/Voxtral-4B-TTS-2603)
- Qwen3-TTS (janvier 2026) : Apache-2.0, 10 langues dont le français ; contrôle « timbre, emotion, and prosody » par instruction (modèles 1,7B VoiceDesign/CustomVoice) ; clonage 3 s (Base 0,6B/1,7B) — [README Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS), [API HF](https://huggingface.co/api/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base)
- Fun-CosyVoice3-0.5B-2512 : apache-2.0, français inclus — [API HF](https://huggingface.co/api/models/FunAudioLLM/Fun-CosyVoice3-0.5B-2512)
- Supertonic 3 (29/04/2026) : 99 M paramètres, ONNX, 31 langues dont le français (WER FR 4,89 sur Minimax-MLS-test) ; **dépôt archivé** (« No updates, bug fixes… will be provided ») ; code MIT, poids OpenRAIL — [README Supertonic](https://github.com/supertone-inc/supertonic), [API HF supertonic-3](https://huggingface.co/api/models/Supertone/supertonic-3)
- MeloTTS : code MIT ; `MeloTTS-French` MIT — [LICENSE MeloTTS](https://github.com/myshell-ai/MeloTTS/blob/main/LICENSE), [API HF](https://huggingface.co/api/models/myshell-ai/MeloTTS-French)
- XTTS-v2 : « coqui-public-model-license » — [API HF](https://huggingface.co/api/models/coqui/XTTS-v2)
- F5-TTS : code MIT, poids cc-by-nc-4.0 — [LICENSE](https://github.com/SWivid/F5-TTS/blob/main/LICENSE), [API HF](https://huggingface.co/api/models/SWivid/F5-TTS)
- Fish Speech : « FISH AUDIO COMMUNITY LICENSE AGREEMENT, Version 1.0 — Last Updated: October 13, 2026 » — [LICENSE fish-speech](https://github.com/fishaudio/fish-speech/blob/main/LICENSE) ; `fishaudio/s2-pro` : « fish-audio-research-license », français inclus — [API HF](https://huggingface.co/api/models/fishaudio/s2-pro)
- Orpheus : code Apache-2.0 ; `orpheus-3b-0.1-ft` apache-2.0, anglais — [LICENSE](https://github.com/canopyai/Orpheus-TTS/blob/main/LICENSE), [API HF](https://huggingface.co/api/models/canopylabs/orpheus-3b-0.1-ft)
- Dia-1.6B : apache-2.0, anglais — [API HF](https://huggingface.co/api/models/nari-labs/Dia-1.6B) ; Sesame CSM-1B : apache-2.0, anglais — [API HF](https://huggingface.co/api/models/sesame/csm-1b)
- NeuTTS : « NeuTTS Open License v1.0 » ; `neutts-nano-french` licence « other », accès restreint — [LICENSE neutts-air](https://github.com/neuphonic/neutts-air/blob/main/LICENSE), [API HF](https://huggingface.co/api/models/neuphonic/neutts-nano-french)
- VibeVoice-1.5B (MIT, en/zh) et VoxCPM-0.5B (Apache, en/zh) : pas de français — [API HF VibeVoice](https://huggingface.co/api/models/microsoft/VibeVoice-1.5B), [API HF VoxCPM](https://huggingface.co/api/models/openbmb/VoxCPM-0.5B)

### Inferences
- **Gain immédiat sans nouveau modèle** : activer `include_alignments=True` dans `plan.py` (Piper 1.8.0 déjà là, + paquet `onnx` Apache-2.0) remplace le plan texte→visèmes maison par des temps exacts. Budget mesuré : ~0,5 s de calcul par seconde de voix siwis → ~30 s pour un film de 60 s (≈ 60 s avec tom).
- **Risques de licence à traiter** : (1) piper1-gpl et espeak-ng sont GPL-3.0 (outil exécuté, rien de redistribué, mais hors règle MIT/Apache/BSD) ; (2) la voix « tom » est entraînée sur des données AGPLv3 → à remplacer (mls 125 locuteurs CC BY 4.0, upmc CC BY-SA 4.0, ou une voix Pocket TTS). Le correctif d'alignement n'est qu'une sortie ONNX supplémentaire : il peut être réécrit en code maison MIT avec `onnx` + `onnxruntime`, et l'ancien Piper MIT existe, mais le phonétiseur reste espeak-ng (GPL) sauf passage à gruut (MIT, français).
- **Expressivité comique** : Chatterbox Multilingual V3 (MIT) est le seul candidat permissif avec un bouton d'intensité émotionnelle et le français ; sur 4 cœurs il faut compter environ 1 à 2,5 min de calcul par minute de voix (port LiteRT, variante incertaine) → acceptable en lot, pas en interactif ; puis aligner son audio avec un CTC Apache (texte connu). Pocket TTS (MIT + CC BY 4.0) est le candidat « rapide + clonage » à mesurer sur nos répliques ; Qwen3-TTS (Apache) apporte l'émotion par instruction mais sa vitesse CPU n'est pas documentée par une source fiable.
- Kokoro `ff_siwis` = même locutrice SIWIS que Piper siwis : intérêt surtout pour la licence Apache des poids et `pred_dur`, pas pour la variété des voix.

### Gaps
- Aucune mesure de Pocket TTS, Chatterbox, Kokoro ou Qwen3-TTS sur ce conteneur (torch absent ; poids Pocket TTS sous accès restreint).
- Un chiffre tiers « Qwen3-TTS RTF 5,4 sur CPU » apparaît dans un résumé de recherche sans source identifiable → non retenu.
- Pocket TTS : liste des voix françaises et licence de chacune non lues ; pas d'horodatage documenté.
- Kyutai TTS : sortie d'horodatages au mot côté TTS non confirmée (seul le STT est documenté avec timestamps).
- MeloTTS français : vitesse CPU et qualité non vérifiées ; Zonos : prise en charge du français non vérifiée.
- Orpheus multilingue (français) : fiche à accès restreint, licence non lue.

---

## 3. Gestes co-verbaux et mouvements de tête pilotés par la parole (modèles 2023-2026 vs règles prosodiques)

### Takeaway
Les générateurs appris (EMAGE/CaMN, SynTalker, DiffuseStyleGesture…) sortent du SMPL-X/FLAME ou du BVH, visent le GPU, et la plupart dépendent de SMPL-X/AMASS dont la licence interdit l'usage commercial ; aucun n'est adapté tel quel à des dessins 2D sur 4 cœurs. L'alternative à règles est bien documentée : BEAT (Cassell 2001) pour le choix des gestes à partir du texte, alignement de l'apex des gestes « beat » sur les syllabes proéminentes (plus faible en français, surtout sur l'accent final de groupe), hochements de tête sur les événements prosodiques (Graf 2002), sourcils liés aux montées de F0 dans 71 % des cas seulement (Cavé 1996), et réactions d'écoute sur une zone de F0 basse (Ward).

### Cited Findings
- PantoMatrix (EMAGE CVPR 2024, CaMN ECCV 2022, DisCo ACMMM 2022) : « Outputs are in SMPLX and FLAME parameters » (.npz), transfert possible vers ARKit ; exemple d'API en CUDA (`model.cuda()`) ; pas d'ONNX ni de version légère ; dernière actualité datée 2025/01 ; licence non affichée sur la page — [GitHub PantoMatrix](https://github.com/PantoMatrix/PantoMatrix)
- SMPL-X : « for the sole purpose of performing non-commercial scientific research » ; usage commercial interdit sauf licence Meshcapade ; « Model & Software » inclut les « animations » — [licence SMPL-X](https://smpl-x.is.tue.mpg.de/modellicense.html)
- Jeu BEAT2 : fiche HF annoncée apache-2.0 — [API HF H-Liu1997/BEAT2](https://huggingface.co/api/datasets/H-Liu1997/BEAT2)
- SynTalker : LICENSE MIT (2026) ; démo HF sur GPU ; visualisation SMPL-X via l'addon Blender d'EMAGE ; nécessite AMASS (SMPL-H/SMPL-X) — [LICENSE SynTalker](https://github.com/RobinWitch/SynTalker/blob/main/LICENSE), [README SynTalker](https://github.com/RobinWitch/SynTalker)
- DiffuseStyleGesture : MIT — [LICENSE](https://github.com/YoungSeng/DiffuseStyleGesture/blob/master/LICENSE) ; ZeroEGGS (Ubisoft) : animations en BVH, sortie de `generate.py` en BVH — [README ZeroEGGS](https://github.com/ubisoft/ubisoft-laforge-ZeroEGGS)
- Gesticulator : GPL-3.0 — [LICENSE](https://github.com/Svito-zar/gesticulator/blob/master/LICENSE) ; Trimodal (Yoon et al.) : « AIR License and Service Agreement » — [LICENSE.md](https://github.com/ai4r/Gesture-Generation-from-Trimodal-Context/blob/master/LICENSE.md)
- Veille du 14/10/2026 : EMAGE Apache-2.0 vu seulement sur un miroir ; AMUSE (mars 2026), LiveGesture (avril 2026, temps réel), DialoGen (mars 2026) sans licence trouvée ; décision : couche de jeu PROCÉDURALE pilotée par la voix — [journal veille-permanente](/home/user/Add-a-README-file/.claude/skills/veille-permanente/SKILL.md), [LiveGesture arXiv](https://arxiv.org/abs/2604.10927)
- BEAT (Cassell, Vilhjálmsson, Bickmore, SIGGRAPH 2001) : texte tapé → comportements non verbaux synchronisés + parole ; règles « derived from extensive research into human conversational behavior » ; modules : étiquetage linguistique → suggestion/sélection de comportements → ordonnancement ; extensible — [page MIT Media Lab](https://media.mit.edu/gnl/projects/beat), [article PDF](https://www.media.mit.edu/gnl/publications/siggraph2001.pdf), [historique SIGGRAPH](https://history.siggraph.org/?p=116944)
- Allemand (Repp et al., Interspeech 2023, 120 gestes beat) : le geste commence au plus tard sur la syllabe accentuée, l'apex y tombe le plus souvent, d'autant plus que la proéminence est forte — [ISCA Interspeech 2023](https://www.isca-archive.org/interspeech_2023/repp23_interspeech.html)
- Français (Rohrer, Prieto & Delais-Roussarie, ICPhS 2019) : apex des beats alignés sur les syllabes à accent mélodique à des taux bien plus faibles qu'attendu ; ceux qui s'alignent tombent plutôt sur l'accent de fin de groupe accentuel — [ICPhS 2019, article 550](https://assta.org/proceedings/ICPhS2019Microsite/pdf/full-paper_550.pdf) (contenu connu par résumé de recherche ; PDF indisponible (503) au moment de la lecture)
- Graf, Cosatto, Strom & Huang (2002) « Visual Prosody » : pour la plupart des locuteurs, des motifs de mouvement simples (tête, visage) appliqués « in synchrony with the main prosodic events » (frontières, accents) — [ERA Edinburgh](https://era.ed.ac.uk/items/aece1f6f-9032-4555-adc9-0f6270f11c7e/full)
- Cavé et al. (ICSLP 1996) : les levées rapides de sourcils sont associées à une montée de F0 dans 71 % des cas seulement ; lien de choix linguistique, pas de synergie musculaire — [ISCA ICSLP 1996](https://www.isca-archive.org/icslp_1996/cave96_icslp.html)
- Réactions d'écoute (Ward) : une zone de F0 basse tard dans l'énoncé (110 ms ; seuil au 26ᵉ centile en anglais ; délai 700 ms ; récupération 800 ms) appelle une rétroaction de l'auditeur — [Ward 1998, ACL W98-0311](https://preview.aclanthology.org/fix_video/W98-0311.pdf), [Ward 1996, ICSLP](https://www.isca-archive.org/icslp_1996/ward96_icslp.html), [Ward & Tsukahara 2000, J. Pragmatics](https://www.cs.utep.edu/nigel/abstracts/jprag00.html)
- Pratique de studio : anticipations de corps/tête 4 à 6 images avant le dialogue ; le dessin ne doit jamais tomber après le son — [Brian Lemay, lip sync](https://brianlemay.com/Pages/animationschool/animation/lipsyncbook/lipsync.html)

### Inferences
- Pour des dessins 2D sur CPU, un générateur « règles + prosodie » est préférable : entrées = texte (mots porteurs : négation, insistance, énumération, adresse au public) + F0/énergie (WORLD déjà présent dans `tone.py`) + temps des mots/phonèmes (Piper). Règles : apex du geste sur la syllabe finale du groupe accentuel (spécificité française) et sur les pics d'énergie ; préparation du geste 4–6 images avant ; hochements sur les accents principaux ; sourcils sur une partie (pas toutes) des montées de F0 ; auditeur : hochement/rire déclenché par la règle de F0 basse de Ward (paramètres anglais à recalibrer pour le français).
- Les modèles appris ne sont réutilisables commercialement que si leur sortie ne passe pas par SMPL-X (ex. BVH de ZeroEGGS, mais licence ZeroEGGS non lue) ; aucun n'est retenu à ce stade.
- La banque CMU déjà indexée (gestes par étiquette) peut fournir les formes ; les règles ci-dessus fournissent le minutage.

### Gaps
- Licences non trouvées : PantoMatrix/EMAGE (page sans licence), LivelySpeaker, MambaTalk, Audio2Gestures, ZeroEGGS (fichier LICENSE introuvable aux chemins testés).
- Aucune vitesse CPU publiée pour EMAGE, SynTalker ou DiffuseStyleGesture.
- Chiffres exacts de Rohrer et al. (2019) non lus (PDF indisponible) ; paramètres de la règle de Ward non calibrés pour le français.

---

## 4. Animation faciale pilotée par l'audio pour de la 2D stylisée (Audio2Face-3D, OVR LipSync, SAiD, FaceFormer, EmoTalk, UniTalker)

### Takeaway
Aucun de ces modèles n'est nécessaire pour des bouches 2D par substitution : une piste de phonèmes exacte (Piper) + une table phonème→visème donne directement les formes. Audio2Face-3D est devenu ouvert en 2025 (SDK MIT, framework d'entraînement Apache-2.0) mais ses poids sont sous NVIDIA Open Model License et visent GPU/TensorRT ; OVR LipSync est lié aux plateformes Meta ; EmoTalk est non commercial ; FaceFormer (MIT) et UniTalker / SAiD (Apache-2.0) n'ont que le CODE vérifié.

### Cited Findings
- Audio2Face-3D v3.0 : « ready for commercial/non-commercial use » sous NVIDIA Open Model License ; sortie = tableau de flottants (peau, langue, mâchoire, yeux) ; diffusion conditionnée par une étiquette d'émotion ; « optimized to run on NVIDIA GPU » ; moteur TensorRT — [fiche nvidia/Audio2Face-3D-v3.0](https://huggingface.co/nvidia/Audio2Face-3D-v3.0)
- SDK Audio2Face-3D : MIT (2025) — [LICENSE SDK](https://github.com/NVIDIA/Audio2Face-3D-SDK/blob/main/LICENSE.txt) ; framework d'entraînement : Apache-2.0 — [LICENSE training framework](https://github.com/NVIDIA/Audio2Face-3D-training-framework/blob/main/LICENSE)
- Registre maison : Audio2Face-3D classé « hors règle par défaut » — [registre outils-puissants-d-abord](/home/user/Add-a-README-file/.claude/skills/outils-puissants-d-abord/SKILL.md)
- Licence SDK Meta (ex-Oculus SDK License) : usage seulement « in connection with MPT approved hardware and software products », pas d'œuvre dérivée (hors exemples), pas d'usage la soumettant à une licence libre ; la page ne nomme pas OVR LipSync — [Meta Platforms Technologies SDK License](https://developers.meta.com/horizon/licenses/oculussdk/)
- EmoTalk : CC BY-NC 4.0 — [LICENSE EmoTalk_release](https://github.com/psyai-net/EmoTalk_release/blob/main/LICENSE)
- FaceFormer : code MIT — [LICENSE FaceFormer](https://github.com/EvelynFan/FaceFormer/blob/main/LICENSE)
- UniTalker : code Apache-2.0 — [LICENSE UniTalker](https://github.com/X-niper/UniTalker/blob/main/LICENSE) ; SAiD : code Apache-2.0 — [LICENSE SAiD](https://github.com/yunik1004/SAiD/blob/main/LICENSE)

### Inferences
- Pour la troupe (dessins à substitution), la voie la plus juste et la plus rapide est déterministe : phonèmes Piper → 8 classes de visèmes de la spécification → piste éditable ; les modèles 3D ci-dessus n'apporteraient qu'un intermédiaire (blendshapes) à re-quantifier en dessins.
- Seul usage plausible d'Audio2Face-3D : produire hors ligne, sur GPU, des courbes de co-articulation de référence pour calibrer nos règles (licence NVIDIA à accepter explicitement).

### Gaps
- Licences des POIDS de FaceFormer, UniTalker et SAiD non vérifiées (souvent liées à VOCASET/BIWI/FLAME) ; formats de sortie exacts non relus.
- Possibilité d'exécuter Audio2Face-3D sur CPU non documentée par NVIDIA.
- Statut 2026 et texte de licence propre à OVR LipSync non trouvés.

---

## 5. Analyse de l'émotion et de la prosodie depuis l'audio (rire, émotion en français) pour piloter les expressions

### Takeaway
Les modèles ouverts d'émotion sont surtout anglais ou sous licences maison/non commerciales ; aucun modèle d'émotion français sous MIT/Apache n'a été trouvé. Dans une chaîne TTS, l'émotion est connue en amont (réalisateur, didascalies) : l'analyse audio sert plutôt au rire (détection) et à la prosodie (F0, énergie, pauses) pour le minutage des expressions.

### Cited Findings
- emotion2vec+ (large ~300 M) : « foundational models for speech emotion recognition », visant la robustesse inter-langues ; licence FunASR Model License v1.1 : usage, modification, partage libres avec attribution obligatoire ; fourni « for reference and learning purposes only » — [fiche emotion2vec_plus_large](https://huggingface.co/emotion2vec/emotion2vec_plus_large), [MODEL_LICENSE FunASR](https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE)
- SpeechBrain `emotion-recognition-wav2vec2-IEMOCAP` : apache-2.0, anglais — [API HF](https://huggingface.co/api/models/speechbrain/emotion-recognition-wav2vec2-IEMOCAP) ; `superb/wav2vec2-base-superb-er` : apache-2.0, anglais — [API HF](https://huggingface.co/api/models/superb/wav2vec2-base-superb-er)
- audEERING `wav2vec2-large-robust-12-ft-emotion-msp-dim` (arousal/valence/dominance) : cc-by-nc-sa-4.0 — [API HF](https://huggingface.co/api/models/audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim)
- `firdhokk/speech-emotion-recognition-with-openai-whisper-large-v3` : apache-2.0 (base Whisper large-v3, lourde sur CPU) — [API HF](https://huggingface.co/api/models/firdhokk/speech-emotion-recognition-with-openai-whisper-large-v3)
- Détection du rire (Gillick et al.) : code MIT ; points de contrôle entraînés sur Switchboard (corpus LDC) ; annotations d'évaluation AudioSet fournies — [LICENSE laughter-detection](https://github.com/jrgillick/laughter-detection/blob/master/LICENSE), [README](https://github.com/jrgillick/laughter-detection)
- Audio2Face-3D annonce aussi des usages de « emotion detection » — [fiche Audio2Face-3D](https://huggingface.co/nvidia/Audio2Face-3D-v3.0)
- Le dépôt utilise déjà le vocodeur WORLD pour la mélodie de voix (`tone.py`) — [plan.py du dépôt](/home/user/Add-a-README-file/workbench/scripts/blenderfilm/plan.py)

### Inferences
- Piloter les expressions par le plan (émotion de la réplique) + prosodie mesurée (F0 via WORLD, énergie RMS, pauses = segments de silence des alignements Piper) est plus fiable qu'un classifieur d'émotion anglais appliqué à du français synthétique.
- Pour les réactions de rire du public/auditeur sur un audio externe, laughter-detection (code MIT) est utilisable techniquement, mais la licence des poids (dérivés de Switchboard, LDC) reste à clarifier ; sinon détecteur maison (énergie rythmée + absence de voisement stable).

### Gaps
- Aucun modèle d'émotion vocale français sous MIT/Apache trouvé (ni jeu de données français libre pour l'affiner).
- Liste exacte des catégories d'emotion2vec+ et ses scores en français non lus.
- Licence des poids de laughter-detection non explicitée.

---

## 6. Bonnes pratiques de visèmes pour le français (jeux de visèmes, coarticulation, anticipation, tolérances ITU-R BT.1359)

### Takeaway
Les voyelles françaises se regroupent visuellement en 3 à 5 classes (étirées, ouvertes, arrondies avancées, ouvertes-arrondies) ; les nasales se rangent avec des orales différentes selon les auteurs. La pratique d'animation place la bouche 1 à 2 images AVANT le son, et la norme ITU-R BT.1359 confirme que le spectateur tolère bien mieux un son en retard (détection à −125 ms) qu'un son en avance (+45 ms).

### Cited Findings
- Classification d'Istria et al. (1982), 4 groupes : bouche ouverte A [a, ɛ = ɛ̃] ; ouverte/avancée AN [ɑ̃, ɔ, œ] ; avancée O [o = ɔ̃, u = y, ø] ; étirée I [i, e] — [Borel et al., Glossa n°120, 2016](https://glossa.fr/index.php/glossa/article/download/624/618/643)
- Dumont & Calbour (2002), 5 groupes de voyelles : [i] ; [ɔ, o, ɔ̃, y, u] ; [œ, ø] ; [ɛ, ɛ̃, e] ; [a, ɑ̃] — [Glossa 2016](https://glossa.fr/index.php/glossa/article/download/624/618/643)
- Zerling (1990), labialité en 3 degrés (105 locuteurs filmés à 50 i/s) : non labialisées [i, e, ɛ, a, ɛ̃] ; moyennement [œ, ɔ, ɑ̃] ; fortement [y, ø, u, o, ɔ̃] ; cette classification regroupe la plupart des confusions observées ; Istria fait 3 erreurs de classement, Dumont & Calbour 8 ; proposition des auteurs : déplacer /e/ avec /a, ɛ̃, ɛ/ et laisser /i/ seul — [Glossa 2016](https://glossa.fr/index.php/glossa/article/download/624/618/643)
- Visèmes français mesurés sur locuteur réel pour la synthèse (Le Goff & Benoît, ICSLP 1996 : valeurs cibles des paramètres labiaux par visème) — [ISCA ICSLP 1996](https://www.isca-archive.org/icslp_1996/goff96_icslp.html)
- ITU-R BT.1359 : seuils de détection ≈ +45 ms (son en avance) à −125 ms (son en retard) ; acceptabilité ≈ +90 ms à −185 ms ; moyennes issues de tests sur de la parole/présentateurs — [ITU-R BT.1359-0 (1998)](https://itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.1359-0-199802-S!!PDF-E.pdf) ; l'ATSC IS-191 fixe plus strict : son au plus 15 ms en avance, 45 ms en retard — [TV Technology, Managing lip sync](https://www.tvtechnology.com/opinions/managing-lip-sync-265013)
- Pratique d'animation : formes clés 1 à 2 images avant le son ; ouvrir la mâchoire 1–2 images avant ; caler sur les pics de la forme d'onde paraît en retard — [Pluralsight](https://www.pluralsight.com/resources/blog/software-development/proven-tips-animating-believable-lip-sync), [High on Films](https://www.highonfilms.com/lip-sync-animation-techniques-every-character-animator-should-know/) ; « never fall after the sound » — [Brian Lemay](https://brianlemay.com/Pages/animationschool/animation/lipsyncbook/lipsync.html)
- Rhubarb applique ses propres règles d'animation (ex. OW animé en E-F plutôt que F depuis 1.10.0 ; règles du « F » améliorées en 1.13.0) — [CHANGELOG Rhubarb](https://raw.githubusercontent.com/DanielSWolf/rhubarb-lip-sync/master/CHANGELOG.md)

### Inferences
- Table proposée (IPA espeak/Piper → classes de la spécification) : /m b p/ → M/B/P ; /f v/ → F/V ; /s z/ → S/Z ; /ʃ ʒ/ → CH/J (lèvres avancées) ; /l ʁ/ → L/R ; /t d n ɲ/ → T/D/N ; /k g ŋ/ → K/G ; voyelles : /a ɑ/ (+ /ɛ ɛ̃ e/ selon Borel 2016) → A/E ; /i/ et /j/ → I ; /y u o ɔ̃ ø/ et /w ɥ/ → O/U (forte labialité) ; /œ ɔ ɑ̃/ → O ouvert (labialité moyenne). Les éléments `ˈ`, `̃` et espaces de Piper se fusionnent au phonème précédent.
- Minutage : à 24–25 i/s une image = 40–42 ms ; décaler la piste bouche de −1 image (son « en retard » de ~40 ms) reste dans la zone non détectable (−125 ms), −2 images (~80 ms) aussi ; une avance du son au-delà de +45 ms est détectable → ne jamais retarder la bouche.
- Garantir au moins une image fermée pour chaque /m b p/ (nos mesures Piper : bilabiales de 35 à 93 ms, donc parfois plus courtes qu'une image de 40 ms) et une image lèvres-dents pour /f v/ ; anticiper l'arrondissement des voyelles O/U sur la consonne précédente (coarticulation anticipatoire — à valider visuellement).
- Écart mesurable : « décalage bouche » = début de la forme fermée − début du phonème bilabial donné par Piper ; cible −40 à −80 ms ; Rhubarb (médiane ~−50 ms, dispersion forte) sert de contrôle indépendant.

### Gaps
- Classes de visèmes CONSONANTIQUES françaises cliniques (Istria et al.) non extraites ; l'article Benoît et al. (1992) « A set of French visemes » non retrouvé en ligne.
- Pas de mesure perceptive spécifique au dessin animé (les seuils BT.1359 viennent de vidéo de présentateurs).
