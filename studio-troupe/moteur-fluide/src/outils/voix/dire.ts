/**
 * Voix française d'une réplique, sur ce processeur, avec les durées EXACTES de chaque phonème (lèvres calées sur la
 * voix réelle, sans alignement après coup).
 *
 *   npm run voix -- --texte "Walay, c'est pas moi qui ai mangé le poulet !" --sortie ../sorties/voix/modou-r1
 *                   [--locuteur 36] [--debit 1.0] [--modele fr_FR-mls-medium.onnx] [--python python3]
 *                   [--projet projets/pilote.json --replique r1]
 *
 * Chaîne (tout est à nous sauf le modèle de voix et onnxruntime) :
 * 1. texte → phonèmes API par NOTRE phonétiseur français (`visage/phonetique`), accents de groupe compris ;
 * 2. phonèmes → symboles du modèle (table `phoneme_id_map` du `.onnx.json`), accent lexical `ˈ` sur la dernière
 *    voyelle pleine de chaque mot plein, espaces et ponctuation comme dans les données d'entraînement ;
 * 3. synthèse par `piper_onnx.py` (onnxruntime, MIT) qui renvoie l'audio ET la durée de chaque symbole ;
 * 4. durées regroupées par phonème (marques d'accent, remplissages et espaces rattachés), pauses en `sil`,
 *    mots horodatés pour les sous-titres (découpe du texte aux espaces, comme l'affichage) ;
 * 5. **recalage sur l'énergie de la voix** : le modèle range souvent les pauses (virgule, respiration, fin de phrase)
 *    dans la durée de la voyelle qui précède. Une fin de phonème SILENCIEUSE (≥ 50 ms sous le seuil d'énergie) est
 *    rendue au silence (`sil`) : la bouche se ferme pendant les pauses au lieu de rester ouverte.
 *
 * Modèle de voix conseillé : Piper `fr_FR-mls-medium` (CC BY 4.0 : créditer « Voix : Piper fr_FR mls medium,
 * données Multilingual LibriSpeech (CC BY 4.0) »), téléchargé hors dépôt :
 *   https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/mls/medium/fr_FR-mls-medium.onnx (+ .onnx.json)
 *
 * Avec `--projet` et `--replique`, la réplique du projet reçoit `audio`, `phonemes` et `mots` (le fichier est
 * réécrit, chemin audio relatif au projet).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { encoderWav, lireWav } from '../../export/wav';
import type { Mot, Phoneme } from '../../timeline/types';
import { decouperTexte, texteVersPhonemes, VOYELLES_API, type PhoneTexte } from '../../visage/phonetique';

const ICI = dirname(fileURLToPath(import.meta.url));

/** Mots sans accent lexical (clitiques), comme dans la transcription de référence. */
const CLITIQUES = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'au', 'aux', 'à', 'a', 'et', 'ou', 'je', 'j', 'tu', 'il', 'elle',
  'on', 'nous', 'vous', 'ils', 'elles', 'me', 'm', 'te', 't', 'se', 's', 'ce', 'c', 'ne', 'n', 'qu', 'que', 'en', 'y', 'mon',
  'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses', 'notre', 'votre', 'leur', 'leurs', 'est',
]);

/** Phrase porteuse neutre autour de la réplique (découpée ensuite). */
export const PORTEUSE_AVANT = "Alors il m'a regardé et il a dit";
export const PORTEUSE_APRES = 'et puis il est parti tranquillement.';

/** Ponctuation transmise au modèle (elle porte l'intonation). */
const PONCTUATION_MODELE = new Set([',', '.', '!', '?', ';', ':']);

/** Symbole du modèle pour un phonème de notre phonétiseur. */
function symboles(ph: string): string[] {
  const norm = ph.replace(/g/g, 'ɡ').replace(/r/g, 'ʁ');
  return [...norm];
}

/** Élément de la suite d'identifiants : rôle de chaque id pour regrouper les durées. */
interface Element {
  id: number;
  role: 'debut' | 'remplissage' | 'phoneme' | 'accent' | 'espace' | 'ponctuation' | 'fin';
  /** Index du phonème (dans la transcription) pour `phoneme` et `accent`. */
  phoneme?: number;
}

/** Transcription et suite d'identifiants pour le modèle. */
export function preparerEntree(
  texte: string,
  table: Record<string, number[]>,
): { phones: PhoneTexte[]; elements: Element[]; inconnus: string[] } {
  const phones = texteVersPhonemes(texte);
  const morceaux = decouperTexte(texte);
  const id = (s: string): number | undefined => table[s]?.[0];
  const PAD = id('_') ?? 0;
  const elements: Element[] = [];
  const inconnus: string[] = [];
  const pousser = (s: string, role: Element['role'], phoneme?: number): void => {
    const v = id(s);
    if (v === undefined) {
      inconnus.push(s);
      return;
    }
    elements.push({ id: v, role, ...(phoneme !== undefined ? { phoneme } : {}) });
    elements.push({ id: PAD, role: 'remplissage', ...(phoneme !== undefined ? { phoneme } : {}) });
  };
  elements.push({ id: id('^') ?? 1, role: 'debut' });
  elements.push({ id: PAD, role: 'remplissage' });
  let indexMot = 0;
  let premierMot = true;
  for (const m of morceaux) {
    if ('ponctuation' in m) {
      if (PONCTUATION_MODELE.has(m.ponctuation)) pousser(m.ponctuation, 'ponctuation');
      continue;
    }
    const indices = phones.map((p, i) => (p.mot === indexMot ? i : -1)).filter((i) => i >= 0);
    const motMin = m.mot.toLowerCase().replace(/'$/, '');
    if (!premierMot) pousser(' ', 'espace');
    premierMot = false;
    let accentue = -1;
    if (!CLITIQUES.has(motMin)) {
      for (let k = indices.length - 1; k >= 0; k--) {
        const p = phones[indices[k]!]!.ph;
        if (VOYELLES_API.has(p) && p !== 'ə') {
          accentue = indices[k]!;
          break;
        }
      }
    }
    for (const i of indices) {
      if (i === accentue) pousser('ˈ', 'accent', i);
      for (const s of symboles(phones[i]!.ph)) pousser(s, 'phoneme', i);
    }
    indexMot++;
  }
  elements.push({ id: id('$') ?? 2, role: 'fin' });
  return { phones, elements, inconnus };
}

/** Durées par id (s) → phonèmes horodatés (relatifs au début de l'audio) et pauses. */
/** Phonème horodaté avec l'index du phone de la transcription (absent pour les pauses). */
export type PhonemeIndexe = Phoneme & { i?: number };

export function regrouperDurees(phones: readonly PhoneTexte[], elements: readonly Element[], durees: readonly number[]): PhonemeIndexe[] {
  const segments = new Map<number, { debut: number; fin: number }>();
  const pauses: Array<{ debut: number; fin: number }> = [];
  let t = 0;
  let dernier = -1;
  let enPause: { debut: number; fin: number } | null = null;
  elements.forEach((e, k) => {
    const d = durees[k] ?? 0;
    const a = t;
    t += d;
    if (e.role === 'phoneme' || e.role === 'accent' || (e.role === 'remplissage' && e.phoneme !== undefined)) {
      const i = e.phoneme!;
      const s = segments.get(i);
      if (s) s.fin = t;
      else segments.set(i, { debut: a, fin: t });
      dernier = i;
      enPause = null;
      return;
    }
    if (e.role === 'espace' || e.role === 'ponctuation' || (e.role === 'remplissage' && enPause)) {
      if (e.role === 'ponctuation' || enPause) {
        if (!enPause) {
          enPause = { debut: a, fin: t };
          pauses.push(enPause);
        } else enPause.fin = t;
      } else if (dernier >= 0) {
        // Espace entre deux mots : prolonge le phonème précédent (les lèvres enchaînent).
        segments.get(dernier)!.fin = t;
      }
      return;
    }
    // Remplissage qui suit un espace : même règle.
    if (e.role === 'remplissage' && dernier >= 0) segments.get(dernier)!.fin = t;
  });
  const r: PhonemeIndexe[] = [];
  const ordre = [...segments.entries()].sort((x, y) => x[1].debut - y[1].debut);
  for (const [i, s] of ordre) {
    const p = phones[i]!;
    r.push({ ph: p.ph, debut: arrondi(s.debut), fin: arrondi(s.fin), ...(p.accent ? { accent: true } : {}), i });
  }
  for (const p of pauses) if (p.fin - p.debut >= 0.06) r.push({ ph: 'sil', debut: arrondi(p.debut), fin: arrondi(p.fin) });
  r.sort((a, b) => a.debut - b.debut);
  // Raccord : chaque phonème commence où finit le précédent (aucun trou, aucun chevauchement).
  for (let k = 1; k < r.length; k++) r[k]!.debut = r[k - 1]!.fin;
  return r.filter((p) => p.fin > p.debut);
}

const arrondi = (x: number): number => Math.round(x * 1e4) / 1e4;

/** Énergie RMS par fenêtre de `pas` s (canal moyen). */
export function energie(gauche: Float32Array, droite: Float32Array, frequence: number, pas = 0.01): number[] {
  const n = Math.max(1, Math.round(frequence * pas));
  const r: number[] = [];
  for (let a = 0; a < gauche.length; a += n) {
    let s = 0;
    const b = Math.min(gauche.length, a + n);
    for (let i = a; i < b; i++) {
      const x = 0.5 * (gauche[i]! + droite[i]!);
      s += x * x;
    }
    r.push(Math.sqrt(s / Math.max(1, b - a)));
  }
  return r;
}

const CONSONNES_OCCLUSIVES = new Set(['p', 'b', 't', 'd', 'k', 'g', 'ɡ']);

/**
 * Rend au silence les fins de phonèmes silencieuses (pauses rangées par le modèle dans la voyelle précédente).
 * `rms` : énergie par fenêtre de `pas` s. Seuil = 10 % du 90e centile de l'énergie. Les occlusives gardent leur
 * silence (c'est leur tenue). Un phonème garde au moins 40 ms.
 */
export function recalerSurEnergie(phonemes: readonly Phoneme[], rms: readonly number[], pas = 0.01, tailleMin = 0.05): Phoneme[] {
  const tri = [...rms].sort((a, b) => a - b);
  const seuil = 0.1 * (tri[Math.floor(0.9 * (tri.length - 1))] ?? 0);
  const silencieux = (t: number): boolean => (rms[Math.floor(t / pas)] ?? 0) < seuil;
  const r: Phoneme[] = [];
  for (const p of phonemes) {
    if (p.ph === 'sil' || CONSONNES_OCCLUSIVES.has(p.ph)) {
      r.push({ ...p });
      continue;
    }
    // Remonte depuis la fin tant que c'est silencieux.
    let fin = p.fin;
    while (fin - pas >= p.debut + 0.04 && silencieux(fin - pas / 2)) fin -= pas;
    if (p.fin - fin >= tailleMin) {
      r.push({ ...p, fin: arrondi(fin) });
      r.push({ ph: 'sil', debut: arrondi(fin), fin: p.fin });
    } else r.push({ ...p });
  }
  // Fusionne les silences voisins.
  const f: Phoneme[] = [];
  for (const p of r) {
    const d = f[f.length - 1];
    if (d && d.ph === 'sil' && p.ph === 'sil') d.fin = p.fin;
    else f.push(p);
  }
  return f;
}

/** Mots horodatés alignés sur la découpe du texte aux espaces (celle des sous-titres). */
export function motsHorodates(texte: string, phones: readonly PhoneTexte[], phonemes: readonly Phoneme[], decalage: number[]): Mot[] {
  // decalage[i] = index dans `phonemes` du phonème i de `phones` (−1 si absent).
  const jetons = texte.split(/\s+/).filter((j) => j.length > 0);
  const mots: Mot[] = [];
  let indexMot = 0;
  let finPrec = 0;
  for (const j of jetons) {
    const n = decouperTexte(j).filter((m) => 'mot' in m).length;
    const ph = phones
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.mot >= indexMot && p.mot < indexMot + n)
      .map(({ i }) => phonemes[decalage[i]!])
      .filter((x): x is Phoneme => !!x);
    indexMot += n;
    if (ph.length === 0) {
      mots.push({ texte: j, debut: arrondi(finPrec), fin: arrondi(finPrec) });
      continue;
    }
    const debut = Math.min(...ph.map((x) => x.debut));
    const fin = Math.max(...ph.map((x) => x.fin));
    mots.push({ texte: j, debut: arrondi(debut), fin: arrondi(fin) });
    finPrec = fin;
  }
  return mots;
}

export const AIDE = `Voix française d'une réplique, avec durées exactes des phonèmes

Utilisation :
  npm run voix -- --texte "<réplique>" --sortie <chemin sans extension> [options]

Options :
  --locuteur <n>          locuteur du modèle (défaut 36 : voix d'homme grave et nette du modèle mls)
  --debit <x>             facteur de durée (défaut 1 ; 1,1 = plus lent)
  --modele <f.onnx>       modèle de voix Piper (ou variable MOTEUR_VOIX ; le .onnx.json doit être à côté)
  --python <binaire>      Python avec onnxruntime, onnx et numpy (ou variable MOTEUR_PYTHON ; défaut python3)
  --fils <n>              fils de calcul (défaut 2)
  --graine <n>            graine de la synthèse (défaut 7 ; même graine, même voix au bit près)
  --sans-porteuse         synthèse directe (par défaut, la réplique est dite au milieu d'une phrase porteuse
                          neutre puis découpée par les durées : le modèle ne « babille » plus en début d'énoncé)
  --projet <p.json> --replique <id>
                          écrit audio, phonèmes et mots dans la réplique du projet

Écrit <sortie>.wav (22 050 Hz mono) et <sortie>.json (phonèmes, mots, durée).
Crédit à afficher pour la voix mls : « Voix : Piper fr_FR mls medium (CC BY 4.0) ».
`;

async function principal(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      texte: { type: 'string' },
      sortie: { type: 'string', short: 'o' },
      locuteur: { type: 'string' },
      debit: { type: 'string' },
      modele: { type: 'string' },
      python: { type: 'string' },
      fils: { type: 'string' },
      graine: { type: 'string' },
      projet: { type: 'string' },
      replique: { type: 'string' },
      'sans-porteuse': { type: 'boolean' },
      aide: { type: 'boolean', short: 'h' },
    },
  });
  let texte = values.texte;
  const projetChemin = values.projet ? resolve(values.projet) : null;
  let projet: { pistes: { dialogue: Array<Record<string, unknown>> } } | null = null;
  let replique: Record<string, unknown> | null = null;
  if (projetChemin) {
    projet = JSON.parse(readFileSync(projetChemin, 'utf8'));
    replique = projet!.pistes.dialogue.find((r) => r.id === values.replique) ?? null;
    if (!replique) {
      console.error(`Réplique « ${values.replique ?? ''} » introuvable dans ${projetChemin}`);
      return 1;
    }
    texte ??= String(replique.texte);
  }
  if (values.aide || !texte || !values.sortie) {
    console.log(AIDE);
    return values.aide ? 0 : 1;
  }
  const modele = resolve(values.modele ?? process.env.MOTEUR_VOIX ?? '');
  if (!existsSync(modele) || !existsSync(`${modele}.json`)) {
    console.error(`Modèle de voix introuvable : ${modele} (+ .json). Voir --aide.`);
    return 3;
  }
  const config = JSON.parse(readFileSync(`${modele}.json`, 'utf8')) as { phoneme_id_map: Record<string, number[]>; audio: { sample_rate: number } };
  // Phrase porteuse (remède mesuré au babillage du modèle sur les répliques courtes ou les débuts d'énoncé) : la
  // réplique est dite AU MILIEU d'une phrase neutre, puis découpée exactement par les durées.
  const avecPorteuse = values['sans-porteuse'] !== true;
  const nbMots = (t: string): number => decouperTexte(t).filter((m) => 'mot' in m).length;
  const texteSynthese = avecPorteuse ? `${PORTEUSE_AVANT}, ${texte} ${PORTEUSE_APRES}` : texte;
  const motDebut = avecPorteuse ? nbMots(PORTEUSE_AVANT) : 0;
  const motFin = motDebut + nbMots(texte);
  const { phones, elements, inconnus } = preparerEntree(texteSynthese, config.phoneme_id_map);
  if (inconnus.length) console.warn(`avertissement — symboles absents du modèle, ignorés : ${[...new Set(inconnus)].join(' ')}`);
  const sortie = resolve(values.sortie);
  mkdirSync(dirname(sortie), { recursive: true });
  const wav = `${sortie}.wav`;
  const requete = {
    modele,
    ids: elements.map((e) => e.id),
    locuteur: Number(values.locuteur ?? 36),
    echelles: [0.333, Number(values.debit ?? 1), 0.333],
    fils: Number(values.fils ?? 2),
    graine: Number(values.graine ?? 7),
    wav,
    frequence: config.audio.sample_rate,
  };
  const python = values.python ?? process.env.MOTEUR_PYTHON ?? 'python3';
  const t0 = performance.now();
  const r = spawnSync(python, ['-I', resolve(ICI, 'piper_onnx.py')], { input: JSON.stringify(requete), encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) {
    console.error(`Synthèse impossible (${python}) : ${(r.stderr || r.stdout).slice(-800)}`);
    return 2;
  }
  const rep = JSON.parse(r.stdout) as { frequence: number; hop: number; durees: number[]; echantillons: number };
  const pas = rep.hop / rep.frequence;
  const brut = regrouperDurees(phones, elements, rep.durees.map((d) => d * pas));
  // Phonèmes de la réplique seule (hors porteuse), puis découpe de l'audio à ±30 ms, fondus de 10 ms.
  const dedans = (q: PhonemeIndexe): boolean => q.i !== undefined && phones[q.i]!.mot >= motDebut && phones[q.i]!.mot < motFin;
  const premier = brut.findIndex(dedans);
  let dernier = -1;
  brut.forEach((q, k) => {
    if (dedans(q)) dernier = k;
  });
  if (premier < 0) throw new Error('aucun phonème de la réplique dans la synthèse');
  const signalComplet = lireWav(wav);
  const fe = signalComplet.frequence;
  const a = Math.max(0, brut[premier]!.debut - 0.03);
  const b = Math.min(signalComplet.gauche.length / fe, brut[dernier]!.fin + 0.03);
  const ia = Math.round(a * fe);
  const ib = Math.round(b * fe);
  const fondu = Math.round(0.01 * fe);
  const couper = (x: Float32Array): Float32Array => {
    const y = x.slice(ia, ib);
    for (let k = 0; k < fondu && k < y.length; k++) {
      y[k]! *= k / fondu;
      y[y.length - 1 - k]! *= k / fondu;
    }
    return y;
  };
  const signal = { frequence: fe, gauche: couper(signalComplet.gauche), droite: couper(signalComplet.droite) };
  writeFileSync(wav, encoderWav(signal));
  const decoupes: Phoneme[] = brut
    .slice(premier, dernier + 1)
    .map(({ i: _i, ...q }) => ({ ...q, debut: arrondi(q.debut - a), fin: arrondi(q.fin - a) }));
  const phonemes = recalerSurEnergie(decoupes, energie(signal.gauche, signal.droite, fe));
  // Transcription de la réplique seule (index de mots ramenés à 0) pour les mots horodatés.
  const phonesTexte = phones.filter((q) => q.mot >= motDebut && q.mot < motFin).map((q) => ({ ...q, mot: q.mot - motDebut }));
  const decalage = phonesTexte.map((p, i) => {
    let k = -1;
    let n = 0;
    for (let j = 0; j <= i; j++) if (phonesTexte[j]!.ph !== 'sil') n++;
    if (p.ph === 'sil') return -1;
    for (let j = 0, c = 0; j < phonemes.length; j++) {
      if (phonemes[j]!.ph === 'sil') continue;
      c++;
      if (c === n) {
        k = j;
        break;
      }
    }
    return k;
  });
  const mots = motsHorodates(texte, phonesTexte, phonemes, decalage);
  const duree = signal.gauche.length / fe;
  const resultat = { texte, locuteur: requete.locuteur, audio: basename(wav), duree: arrondi(duree), phonemes, mots };
  writeFileSync(`${sortie}.json`, JSON.stringify(resultat, null, 1));
  console.log(`Voix : ${wav} (${duree.toFixed(2)} s, ${phonemes.length} phonèmes, synthèse ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  console.log(`Phonèmes et mots : ${sortie}.json`);
  if (projet && replique && projetChemin) {
    replique.audio = relative(dirname(projetChemin), wav);
    replique.phonemes = phonemes;
    replique.mots = mots;
    writeFileSync(projetChemin, `${JSON.stringify(projet, null, 2)}\n`);
    console.log(`Projet mis à jour : ${projetChemin} (réplique ${String(replique.id)})`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2)).then(
    (c) => (process.exitCode = c),
    (e: unknown) => {
      console.error(`Erreur : ${(e as Error).message}`);
      process.exitCode = 2;
    },
  );
}
