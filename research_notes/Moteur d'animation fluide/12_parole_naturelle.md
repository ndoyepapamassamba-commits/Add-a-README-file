# Parole naturelle et jeu piloté par la parole : quelle voix française, quelles lèvres, quel corps (banc du 16/10/2026)

Piste « parole naturelle » du moteur fluide. Elle complète la note 04 (voix et lèvres) et la note 03 (jeu
procédural). Elle répond à la demande du propriétaire : **« la fluidité des personnages, des discours, de la vidéo de
manière générale »**, au niveau Pixar/Disney.

Conventions :
- **[mesure]** : mesure faite dans ce conteneur le 16/10/2026 (4 vCPU Xeon 2,1 GHz, 15 Go de RAM, sans GPU). Le
  processeur était **partagé** avec d'autres bancs (charge moyenne 7 à 8 pendant les mesures) : tous les temps sont des
  **majorants**, et seuls les rapports entre moteurs mesurés dans la même fenêtre sont comparables.
- **[source]** : document lu, lien donné. **[code lu]** : code tiers lu pour apprendre, rien n'est copié dans le dépôt.
- `S` = `/tmp/claude-0/-home-user-Add-a-README-file/913411a4-1822-5f5b-968c-9c552d4beafd/scratchpad`. Banc :
  `S/bench-parole/`.
  - Scripts (les nôtres, hors dépôt) : `scripts/commun.py` (répliques, F0 YIN, traits prosodiques, juges),
    `synth_piper_kokoro.py`, `synth_pocket.py`, `synth_chatterbox.py` (notre boucle de génération ONNX),
    `evaluer.py` (UTMOS + CER + prosodie), `aligner.py` (alignement forcé), `proto_jeu.py` (partition de jeu).
  - Sons produits : `S/bench-parole/audio/*.wav`, rapports `rapport_*.json`, `evaluation.json`, `alignement.json`,
    `partitions_jeu.json`.
- Les deux répliques du banc :
  - **ivoirien** : « Walay, c'est pas moi qui ai mangé le poulet ! »
  - **colère** : « Ah non, ça c'est trop ! Rends-moi mon argent tout de suite, sinon ça va gâter ! »

Pour aller vite : le tableau de synthèse est en Q2, le plan fichier par fichier en fin de note.

---

## Q1. Quelles voix françaises naturelles, sur ce CPU, utilisables commercialement, avec une voix par personnage ?

### Takeaway
Quatre candidats tiennent la contrainte de licence et ont été **mesurés ici** : Piper mls, Kokoro, **Pocket TTS
(Kyutai)** et **Chatterbox Multilingual**.
- **Pocket TTS français** est la découverte du banc :
  - 100 M de paramètres ;
  - poids **CC-BY 4.0**, code **MIT** ;
  - 25 voix préréglées sous licence commerciale (CC0 ou CC-BY) ;
  - **plus rapide que le temps réel sur 2 fils**, même sur ce CPU chargé.
- **Chatterbox** est le seul modèle avec un **bouton d'émotion** (`exaggeration`) et le clonage libre (MIT). Il coûte
  10 à 12 fois le temps réel ici.
- **Qwen3-TTS** (Apache-2.0, émotion par consigne en langue naturelle) n'a pas pu être mesuré : 2,5 Go, et le disque
  était au plancher de 4 Go.

Aucun de ces modèles « neuronaux naturels » ne donne les durées des phonèmes. Ils passent donc par l'**alignement
forcé** (Q3).

### Cited Findings
**Licences vérifiées le 16/10/2026** (cartes Hugging Face et métadonnées des paquets)

| Moteur | Code | Poids | Voix utilisables commercialement | Français | Durées | Émotion | Clonage |
|---|---|---|---|---|---|---|---|
| Piper `fr_FR-mls-medium` | notre appel onnxruntime (MIT) | CC-BY 4.0 | 125 locuteurs MLS (CC-BY 4.0) | natif | **exactes, 11,6 ms** | non | non |
| Kokoro-82M | Apache-2.0 | Apache-2.0 | `ff_siwis` seule (SIWIS, CC-BY 4.0) | natif, 1 voix | `pred_dur`, 25 ms | non | non |
| **Pocket TTS** `french` (6 couches) | **MIT** (`pocket-tts` 3.3.0) | **CC-BY 4.0** | voix préréglées : `estelle` (enregistrement Kyutai, CC0), `marius`, `javert` (dons CC0), `alba` (CC-BY), voix VCTK (CC-BY), voice-zero (CC0) | natif | non | par la voix de référence | dépôt séparé à accès contrôlé |
| **Chatterbox Multilingual** | MIT | MIT (export ONNX `onnx-community`, MIT) | toute référence **dont on a les droits** | 23 langues dont fr | non | **`exaggeration` 0,25–2** | oui, ~10 s de référence |
| Qwen3-TTS 0.6B CustomVoice / Base | Apache-2.0 | Apache-2.0 | 9 voix préréglées, **aucune francophone native** | oui | non | consigne en langue naturelle | oui (Base, 3 s) |

Sources :
- Pocket TTS : [carte HF kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts) (CC-BY-4.0, langues
  en/fr/de/pt/it/es, « uses only 2 CPU cores ») ; [voix et licences, kyutai/tts-voices](https://huggingface.co/kyutai/tts-voices)
  (dons « licensed as CC0 », VCTK et alba « CC BY 4.0 », **Expresso et EARS « Non-commercial use only »**).
  - Les voix préréglées `cosette` (Expresso) et `jean` (EARS) sont donc **interdites** chez nous.
  - Le dépôt avec clonage (`kyutai/pocket-tts`) est **à accès contrôlé**. Il interdit « voice impersonation or cloning
    without explicit and lawful consent ».
  - Le dépôt **sans clonage** (`kyutai/pocket-tts-without-voice-cloning`) est libre d'accès. C'est lui qui a servi au
    banc : le paquet bascule tout seul dessus.
- Chatterbox : [carte HF ResembleAI/chatterbox](https://huggingface.co/ResembleAI/chatterbox) (MIT, filigrane Perth) ;
  [export ONNX](https://huggingface.co/onnx-community/chatterbox-multilingual-ONNX) (MIT, conseil : `exaggeration`
  0,5 par défaut, « around 0.7 or higher » pour le dramatique, qui « tends to speed up speech »).
  - Le `default_voice.wav` du dépôt n'a **pas de provenance documentée** : il n'est pas utilisé.
- Qwen3-TTS : [carte 0.6B CustomVoice](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice) (9 timbres, « we
  recommend using each speaker's native language », consigne d'émotion). Poids : 1,81 Go + tokeniseur de parole
  0,68 Go (API HF).
- Écartés :
  - Supertonic 2 : français, ONNX de 268 Mo, très rapide, mais **OpenRAIL-M** (restrictions d'usage, hors de notre
    liste) — [carte](https://huggingface.co/Supertone/supertonic-2) ;
  - NeuTTS nano french : licence « other » ;
  - Kyutai TTS 1.6B (CC-BY) : trop lourd pour le CPU ;
  - XTTS-v2 et F5-TTS : non commerciaux (note 04).

**Références de clonage sans risque de licence** [source]
- Le dépôt `kyutai/tts-voices` fournit 35 extraits **CML-TTS français** nettoyés (« enhanced »). CML-TTS est sous
  **CC-BY 4.0** et vient de livres audio LibriVox.
- Le même dépôt fournit 228 voix de **dons** (CC0), dont les donneurs ont **explicitement** accepté l'usage TTS.
- Pour le banc, deux extraits CML-TTS ont servi (F0 médiane mesurée) : un homme, `2114` (118 Hz), et une femme, `5830`
  (234 Hz). Une voix Piper mls 36 (CC-BY) a aussi servi de référence.

### Inferences
- **Casting** : une voix distincte par personnage s'obtient de trois façons, par ordre de propreté juridique :
  1. voix préréglées Pocket (CC0/CC-BY) et locuteurs Piper (CC-BY) ;
  2. dons CC0 de Kyutai clonés ;
  3. voix du propriétaire ou de comédiens **avec accord écrit**, clonées.

  Les extraits LibriVox sont légalement sous CC-BY, mais leurs lecteurs n'ont pas consenti au clonage : on ne les
  utilise que pour le banc.
- Crédit à afficher (CC-BY) : « Voix : Kyutai Pocket TTS (CC BY 4.0) ; voix préréglées CC0/CC BY » et/ou « Piper
  fr_FR mls (CC BY 4.0) ».

### Gaps
- Qwen3-TTS non mesuré (disque). Le chiffre tiers de la note 04 (RTF ≈ 3 en int8 sur 4 vCPU) reste la seule donnée.
- La qualité du dépôt Pocket **avec clonage** n'a pas été testée : il faut un compte HF et l'accord aux conditions
  d'accès. C'est au propriétaire de le faire.
- La variante Pocket **24 couches** (`french_24l`, 672 Mo, « higher quality but slower ») n'a pas été téléchargée,
  faute de disque.

---

@@Q2@@

---

@@Q3@@

---

## Q4. Jeu piloté par la parole : que faut-il ajouter à ce que le moteur fait déjà ?

### Takeaway
Le moteur sait déjà beaucoup de choses, mais **toutes à partir des seules durées** des phonèmes :
- accents (voyelle marquée ou 1,5 fois plus longue que la médiane) ;
- levées de sourcils sur un accent sur trois ;
- battements de main groupés en unités ;
- petit hochement sur chaque accent ;
- inspiration avant chaque phrase.

Il lui manque quatre choses pour que le corps « entende » vraiment la voix :
1. la **mélodie et l'énergie réelles** de la voix (F0, intensité), surtout avec un TTS sans durées ou une voix enregistrée ;
2. la **ponctuation du visage** aux frontières : clignements, respiration audible, regard de passage de tour ;
3. une **écoute active** de l'auditeur : hochements sur indice, clignements entraînés, micro-expression en miroir ;
4. des **gestes de sens** (lexique ivoirien : « moi », « walay », « pas ») et des **styles d'émotion**. En colère, par
   exemple : coups de menton, froncement qui se creuse sur les accents, pas de levée de sourcils.

### Cited Findings
**Ce que fait le moteur aujourd'hui** [code lu, notre dépôt]
- `src/visage/parole.ts` : accents depuis les phonèmes. Ce sont ceux marqués `accent`, sinon la dernière voyelle avant
  une pause et les voyelles 1,5 fois plus longues que la médiane. Une question donne force 1 au dernier accent.
- `src/visage/sourcils.ts` : levée sur environ 1 accent sur 3 (hachage). Montée de 0,27 s, pic 100 ms avant l'accent,
  tenue de 150 ms, retour en 0,3 s.
- `src/visage/yeux.ts` + `index.ts` : clignements en processus de Poisson. Le taux est de 21/min en parlant,
  9/min en écoutant, 15/min au repos. Il y a des clignements forcés aux actions et aux grands changements de regard,
  mais **aucune préférence pour les frontières de phrase**.
- `src/visage/index.ts` : la bouche est en **avance de 40 ms** sur le son (`AVANCE_BOUCHE`). L'entrée en parole est un
  fondu de 120 ms.
- `src/anim/actions.ts`, recette `parler` (implicite pendant chaque réplique) :
  - unités gestuelles : pas de retour au repos entre deux accents à moins de 1,2 s ;
  - préparation 350 ms avant ;
  - apex d'avant-bras à `accent − 30 ms` ;
  - tangage de tête de 0,3 × force ;
  - inspiration (épaules, buste) 400 ms avant chaque phrase.
- `src/anim/couches.ts` : un auditeur présent **regarde** le locuteur (implicite `regarder`). Il ne fait rien d'autre.

**La bouche bouge avant la voix** [source]
- Chandrasekaran et al. (2009) : le mouvement de la bouche précède la voix de **100 à 300 ms**, de façon constante.
  L'aire d'ouverture de la bouche suit l'enveloppe acoustique, et les deux sont modulées entre **2 et 7 Hz** (rythme
  syllabique) — [PLoS Comput Biol, PMC2700967](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2700967/).
- Notre fondu d'entrée de 120 ms est donc dans la fourchette basse. La forme du premier visème doit se préparer pendant
  ce fondu, et pas seulement l'ouverture.

**Clignements aux frontières et entraînement de l'auditeur** [source]
- Nakano & Kitazawa (2010) : l'auditeur cligne **0,25 à 0,5 s après** le clignement du locuteur. Cet entraînement n'est
  déclenché que par les clignements du locuteur **en fin de phrase et pendant les pauses**, et il disparaît sans le
  son — [Exp Brain Res 2010, PMC2817301](https://pmc.ncbi.nlm.nih.gov/articles/PMC2817301).
- Hömke, Holler & Levinson (2017, 2018) :
  - les clignements de l'auditeur tombent aux **fins d'unités** du locuteur, là où se donne la rétroaction ;
  - les **clignements longs** (seuil 410 ms ; stimuli de 208 ms contre 607 ms) accompagnent plus souvent les
    hochements et les « mm » ;
  - face à des clignements longs, les locuteurs font des réponses nettement **plus courtes** : c'est un signal perçu.
  - [PLoS ONE 2018, PMC6291193](https://pmc.ncbi.nlm.nih.gov/articles/PMC6291193/) ;
    [EMCA wiki, RLSI 2017](https://emcawiki.net/Hoemke-Holler-Levinson2017)

**Respiration** [source]
- Székely et al. (ICASSP 2020) : intégrer la respiration à la synthèse aide le **naturel** et la **mémorisation**. Elle
  découpe le message en morceaux plus faciles à comprendre. Mais recopier les respirations « disfluentes » des données
  peut nuire — [PDF KTH](https://www.speech.kth.se/tts-demos/szekely2020breathing.pdf).
- Les auditeurs jugent les respirations synthétiques de VITS **moins naturelles** quand on leur demande d'y prêter
  attention — [arXiv 2402.00288](https://arxiv.org/html/2402.00288v2). Une respiration doit donc être **discrète**
  (niveau bas, filtrée) et placée là où un humain respire : avant un énoncé, et dans les pauses longues.

**Tête et émotion** [source]
- Busso et al. (2007) : les mouvements de tête de la parole émotionnelle diffèrent nettement de ceux de la parole
  neutre par l'**activation, l'amplitude et la vitesse**. La tête porte de l'information sur la catégorie d'émotion, et
  on peut synthétiser ces mouvements depuis des traits prosodiques —
  [IEEE TASLP 2007](https://msp.utdallas.edu/publications/Busso_2007.pdf).
- Rappels des notes 03 et 04 : primitives de hochement de Graf (^ 42 %, ~ 18 %, / 20 %), alignement français des
  battements sur l'accent final de groupe (Rohrer et al.), sourcils 270 ms avant l'accent, auditeur sur F0 basse
  ≥ 110 ms (Ward & Tsukahara), Hadar (tête en mouvement 89,9 % du temps en parlant, 12,8 % en écoutant).

**Regard et passage de tour** [source]
- Kendon (1967) : le locuteur **détourne** le regard en début de tour et **regarde** l'auditeur en fin de tour, pour
  céder la parole. Les répliques de Rutter et al. (1978) ne l'ont confirmé que partiellement —
  [Frontiers 2021, revue](https://pmc.ncbi.nlm.nih.gov/articles/PMC8058470).
- On n'en fait donc qu'une **tendance douce** : regard détourné au début d'une réplique longue (≥ 2,5 s), retour au
  destinataire sur la dernière seconde.

**Mimétisme facial** [source]
- Les réactions faciales rapides (zygomatique pour la joie, corrugateur pour la colère) apparaissent **300 à 400 ms**
  après le visage vu (Dimberg & Thunberg 1998, cités par
  [Frontiers 2016, PMC4886692](https://pmc.ncbi.nlm.nih.gov/articles/PMC4886692)). Le travail de 2000 montre la même
  réaction pour des visages présentés sans être vus consciemment.

### Inferences
- **Une seule source d'événements prosodiques** pour tout le corps : `prosodie.ts` produit accents (avec une
  proéminence continue), frontières, questions, zones de F0 basse et enveloppe d'énergie. Visage, gestes, auditeur et
  respiration lisent tous cette même liste. Aujourd'hui chaque module refait son petit calcul.
- **Proéminence française** = durée (log, normalisée) + pic de F0 + pic d'énergie, plus un **bonus de fin de groupe**
  (accent final obligatoire) et un malus pour le schwa. Elle remplace la règle « 1,5 × médiane ». Le prototype (Q5)
  retrouve « -lay », « moi » et « -let » sur la réplique ivoirienne.
- **Bouche** : avance de 40 ms conservée pendant la parole (sous le seuil BT.1359), mais **pré-forme** du premier
  visème de 150 ms (100 à 300 ms selon Chandrasekaran). Mâchoire modulée par l'**énergie** réelle (axe JA du modèle
  JALI), et plus seulement par l'émotion et le volume du projet. Une syllabe forte s'ouvre plus.
- **Clignements** : un clignement de frontière par pause d'au moins 150 ms, avec une probabilité de 0,6, placé 0 à
  80 ms après le début de la pause. Jamais à moins de 150 ms d'un accent fort, et jamais pendant une fermeture M/B/P
  en gros plan. Chez l'auditeur : un clignement **entraîné** 0,25 à 0,5 s plus tard, et un clignement **long**
  (600 ms) couplé à un hochement d'écoute une fois sur deux.
- **Respiration** : inspiration **visible** (déjà là) **et audible** (nouvelle). On ajoute un son d'inspiration de
  250 à 400 ms, à −26 dB sous la voix, avant un énoncé qui suit au moins 0,6 s de silence, et une reprise courte dans
  les pauses de 350 ms ou plus. On ne l'ajoute que si le TTS n'a pas déjà respiré : on la détecte par énergie et
  spectre dans les 500 ms qui précèdent la voix.
- **Gestes de sens** : un petit lexique ivoirien choisit la forme du geste quand un mot porteur tombe sur un accent ou
  à côté :
  - « moi » : main sur la poitrine ;
  - « walay » ou « wallahi » : main sur le cœur (serment) ;
  - « toi » ou « tu » : pointer le destinataire ;
  - « pas » ou « non » : secouer la tête, paume de refus ;
  - « trop » : mains au ciel ;
  - « rends » : paume tendue ;
  - « argent » : frotter les doigts.

  Les autres accents gardent le battement. C'est l'idée de BEAT et du « gesture lexicon », réduite à une table que le
  propriétaire peut compléter.
- **Style d'émotion** (Busso) : un facteur d'**activation** par émotion multiplie amplitudes et vitesses, par exemple
  colère × 1,5, joie × 1,2, tristesse × 0,6. Il change aussi le **type** de primitive : en colère, coups de menton vers
  l'avant à la place des hochements, et froncement qui se creuse sur les accents à la place des levées de sourcils.
- **Auditeur** : mouvement de tête ≤ 15 % de celui du locuteur (Hadar). Le reste est ponctuel :
  - hochement de 3 à 6° 200 ms après une zone de F0 basse ou une fin de groupe, au plus un toutes les 1,5 s ;
  - clignement entraîné ;
  - micro-expression en miroir de l'émotion du locuteur, à 30 %, 300 à 400 ms après son emphase la plus forte ;
  - **prise** (take) 100 à 250 ms après la dernière syllabe d'une chute.
- **Regard** : détourné au début d'une réplique longue, retour au destinataire sur la dernière seconde, clignement de
  fin d'énoncé. C'est la ponctuation du passage de tour.

### Gaps
- Aucune de ces règles n'a été mesurée sur du **français ivoirien** filmé. Les probabilités viennent de l'anglais, du
  néerlandais et du japonais. Les valeurs sont des points de départ à régler à l'œil sur les sketches du propriétaire.
- Le lexique de gestes est une proposition. Il faut le valider avec le propriétaire, qui connaît les gestes de ses
  personnages.
- Le chiffre d'Argyle (l'auditeur regarde environ 75 % du temps, le locuteur environ 40 %) est souvent cité, mais nous
  ne l'avons pas confirmé dans une source primaire. Il n'est pas utilisé.

---

@@Q5@@

---

## Plan fichier par fichier

Règles du chantier :
- Contrat `src/timeline/types.ts` : **champs optionnels seulement**.
- Sans les nouveaux champs, le rendu reste **identique** : mêmes accents, mêmes clignements, mêmes gestes. Les tests
  existants ne bougent pas.
- **On ne touche pas** à `src/rig/arap.ts`, `src/anim/bvh.ts`, `src/anim/reciblage.ts` ni à l'action `mocap` (chantier
  Animated Drawings en parallèle).
- Dans `src/anim/actions.ts`, partagé, la seule modification est le corps de la recette `parler`. On la fait **après**
  la fusion de l'autre chantier.

### A. Voix : `src/outils/voix/*` (outils locaux, Python appelé en processus séparé, comme aujourd'hui)

| Fichier | Statut | Rôle |
|---|---|---|
| `moteurs.ts` | nouveau | Registre des moteurs : `{id, licence, credit, durees: 'exactes'∣'alignement', rtfAttendu, voix[]}` pour `piper-mls`, `pocket-fr`, `chatterbox-fr`. Il **refuse** toute voix marquée non commerciale (`cosette`, `jean`, tout `expresso/`, `ears/`) et toute référence de clonage sans licence déclarée. Il génère la ligne de crédit. |
| `dire.ts` | modifié | Nouvelles options `--moteur`, `--voix`, `--emotion`, `--exageration`. Le défaut reste Piper. Si le moteur n'a pas de durées, on appelle `aligner.py`. Dans tous les cas on appelle `analyse.ts`, puis on fusionne `audio`, `phonemes`, `mots`, **`prosodie`**, **`respirations`** et **`voix`** dans la réplique. Cache par hachage `(moteur, voix, texte, réglages, graine)`. |
| `pocket_tts.py` | nouveau | Voix préréglée ou état de voix `.safetensors` exporté (clonage), 2 fils, WAV 24 kHz. Avec `copy_state=True`, l'état de voix est réutilisé entre répliques. Graine fixée via `torch.manual_seed`. |
| `chatterbox_onnx.py` | nouveau | Notre boucle ONNX (celle du banc) : LM q4, échantillonnage graine, `exaggeration` dérivée de `emotion` × intensité. Référence de clonage **≤ 5 s** : le décodeur traite référence + sortie, donc une référence courte coupe son coût (Q2). Réservé aux répliques marquées « émotion forte ». |
| `aligner.py` | nouveau | wav2vec2 xlsr-53-espeak-cv-ft (Apache-2.0) + notre Viterbi CTC, entrée = phones de **notre** phonétiseur (`visage/phonetique`, plus besoin d'espeak), sortie = `Phoneme[]` au pas de 20 ms. **Porte** : PER libre ≤ 0,35 et confiance ≥ 0,2, sinon nouvel essai avec une autre graine ou repli sur Piper. |
| `analyse.ts` | nouveau | En TypeScript pur, sur le WAV via `export/wav.ts` : F0 par YIN et énergie RMS au pas de 10 ms. Détection des respirations déjà présentes dans la voix (énergie faible, bruit large bande dans les 500 ms avant la voix). Sortie compacte : `prosodie: { pas: 0.01, f0: number[] (Hz, 0 = non voisé), energie: number[] (dB) }`. |
| `piper_onnx.py` | inchangé | Reste le moteur d'aperçu instantané, avec les durées exactes. |

### B. Contrat : `src/timeline/types.ts` (ajouts optionnels)
```ts
interface Replique {
  // …existant…
  /** Mélodie et énergie de la voix (outil voix), au pas `pas` (s). */
  prosodie?: { pas: number; f0: number[]; energie: number[] };
  /** Respirations (instants relatifs au début, s) : son synthétisé + inspiration visible. */
  respirations?: Array<{ t: number; duree: number; force: number }>;
  /** Moteur et voix qui ont produit l'audio (crédits, cache). */
  voix?: { moteur: string; id: string; exageration?: number };
  /** Intensité de l'émotion (0…1, défaut 0,5) : amplitude du jeu et exagération de la voix. */
  intensite?: number;
}
interface DeclarationPersonnage {
  // …existant…
  /** Casting vocal par défaut. */
  voix?: { moteur: string; id: string; debit?: number; hauteur?: number };
}
```

### C. Visage : `src/visage/*`

| Fichier | Statut | Changement |
|---|---|---|
| `prosodie.ts` | **nouveau** | `evenementsProsodiques(piste) → { syllabes[{t, mot, proeminence, finGroupe}], accents[{t, force, type: 'final'∣'initial'∣'emphase', mot}], frontieres[{debut, fin, type: 'virgule'∣'fin'∣'question'}], question, f0Basse[t], enveloppe(t) }`. Proéminence = 0,4·z(log durée) + 0,35·z(pic F0) + 0,25·z(pic énergie) + 0,6 en fin de groupe − 0,8 pour un schwa. Accents = maxima ≥ 0,5, espacés d'au moins 300 ms. **Sans `prosodie`** dans la réplique, il retombe sur la règle actuelle des durées, avec le même résultat qu'aujourd'hui. Pur, mis en cache par réplique. |
| `parole.ts` | modifié | `PisteParole` gagne `evenements` (de `prosodie.ts`). `accents` en devient un dérivé : même forme qu'avant, donc rétrocompatible. |
| `visemes.ts` / `bouche.ts` | modifié | **Pré-forme** du premier visème sur 150 ms avant la voix (aujourd'hui, seul un fondu d'ouverture de 120 ms existe). **Mâchoire modulée par l'énergie** : `ja ×= 0,8 + 0,4·enveloppe(t)`, borné. L'avance de 40 ms et les fermetures M/B/P garanties sont inchangées. |
| `sourcils.ts` | modifié | Les levées vont aux accents les plus **proéminents** (et non plus « 1 sur 3 par hachage »), plus les questions. Style d'émotion : en `colere`, le froncement se creuse sur les accents au lieu de lever. |
| `yeux.ts` / `index.ts` | modifié | Clignements **de frontière** (p = 0,6 par pause ≥ 150 ms, 0 à 80 ms après son début), ajoutés aux `forces`. Interdits à ±150 ms d'un accent fort et pendant une fermeture M/B/P en gros plan. Auditeur : clignement **entraîné** 0,25 à 0,5 s après celui du locuteur, et clignement **long** (0,6 s) couplé à un hochement d'écoute sur deux. Regard du locuteur : détourné au début d'une réplique de 2,5 s ou plus, retour au destinataire sur la dernière seconde. |
| `expression.ts` | modifié | Micro-expression **en miroir** chez l'auditeur : poids de l'émotion du locuteur × 0,3 pendant 400 ms, 300 à 400 ms après son emphase maximale. |

### D. Corps : `src/anim/*`

| Fichier | Statut | Changement |
|---|---|---|
| `gestes-parole.ts` | **nouveau** | Planificateur pur, `planifierGestes(evenements, {emotion, intensite, exageration, destinataire, sens}) → { unites[{preparation, strokes[{apex, forme, amplitude, cote}], retraction}], tete[{t, primitive: '^'∣'~'∣'/'∣'coupMenton'∣'secouer', amplitude}], buste[…], souffles[…] }`. Contenu : unités gestuelles (moins de 1,2 s entre accents), apex = accent − 30 ms (fenêtre de −200 à +60 ms), préparation 350 ms, rétraction 450 ms, primitives de Graf tirées par hachage, facteur d'activation par émotion (colère 1,5, joie 1,2, tristesse 0,6), et **lexique de gestes** (`moi`, `walay`, `toi`, `pas`/`non`, `trop`, `rends`, `argent`…), extensible dans le projet. |
| `ecoute.ts` | **nouveau** | Réactions de l'auditeur depuis les événements du locuteur : hochements d'écoute (F0 basse ≥ 110 ms ou fin de groupe, +200 ms, au plus un toutes les 1,5 s, 3 à 6°), prise 100 à 250 ms après la dernière syllabe d'une chute, immobilité relative (≤ 15 % du locuteur). |
| `actions.ts` | modifié (minimal) | La recette `parler` **consomme** le plan de `gestes-parole.ts` et dessine les formes : battement, main sur la poitrine, pointer, paume, secouer. Nouvelle recette `ecouter` (couche `additif`, priorité basse) qui consomme `ecoute.ts`. Identifiants et alias inchangés. |
| `couches.ts` | modifié | Implicite `ecouter` pour chaque personnage présent qui ne parle pas. `ParamsRecette` gagne `evenements?` (optionnel), passé à `parler` et `ecouter`. |
| `reglages.ts` | modifié | Constantes nommées : activation par émotion, probabilités de Graf, délais d'écoute, seuils de pause. |

### E. Son : `src/export/*`

| Fichier | Statut | Changement |
|---|---|---|
| `sfx.ts` | modifié | Nouveau bruitage `inspiration` (et `expiration`) : bruit rose filtré passe-bande de 400 à 2 500 Hz, enveloppe montée 60 %, tenue, chute 40 %, 250 à 400 ms, déterministe. Aucun échantillon tiers. |
| `audio.ts` | modifié | `collecterSources` ajoute une source `synth:inspiration` par entrée de `replique.respirations`, à −26 dB sous la voix. Rien ne change si le champ est absent. |

### F. Qualité : `src/qa/*` et tests
- Nouvelles métriques :
  - **synchro geste-accent** : 100 % des apex de battement dans [−200, +60] ms de leur accent ;
  - **clignements de frontière** : au moins 40 % des pauses ≥ 150 ms ont un clignement du locuteur dans les 200 ms ;
  - **écoute** : l'auditeur ne dépasse jamais 15 % de l'énergie de mouvement de tête du locuteur, sauf pendant une
    prise ;
  - **voix** : CER ASR ≤ 0,15, PER d'alignement ≤ 0,35, UTMOS ≥ 3,0, sinon nouvel essai.
- Tests vitest :
  - `prosodie.test.ts` : F0 et énergie synthétiques donnent les bons accents ; sans `prosodie`, le résultat est
    identique à l'actuel ;
  - `gestes-parole.test.ts` : apex, unités, lexique, style de la colère ;
  - `ecoute.test.ts` : cadence maximale, délais ;
  - `yeux` : clignements de frontière et interdits M/B/P.

### G. Ordre de construction (chaque étape livrable seule)
1. `analyse.ts` + `prosodie.ts` + champs optionnels, en rétrocompatible. Mesurable tout de suite sur les voix Piper.
2. `aligner.py` + `pocket_tts.py` + `moteurs.ts` + `dire.ts --moteur pocket` : voix plus naturelles avec lèvres exactes.
3. Clignements de frontière, pré-forme de bouche, mâchoire à l'énergie : petits changements, gros effet en gros plan.
4. `gestes-parole.ts` + lexique, puis branchement dans `parler`, après la fusion du chantier mocap.
5. `ecoute.ts` + recette `ecouter` + micro-expressions en miroir.
6. Respirations audibles (`sfx.ts`, `audio.ts`).
7. `chatterbox_onnx.py` pour les répliques à forte émotion. Puis Qwen3-TTS si le disque le permet.
