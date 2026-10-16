/**
 * Phonétique française de secours : texte → phonèmes (API) par règles, durées heuristiques, accents de groupe.
 *
 * Sert quand une réplique n'a ni phonèmes horodatés (voix de synthèse) ni alignement. Le but est une bouche
 * crédible, pas une transcription parfaite : règles graphème → phonème usuelles (digrammes, nasales, e muet,
 * consonnes finales muettes, s intervocalique, c/g doux…), petit lexique d'exceptions fréquentes à l'oral.
 * L'accent français tombe sur la dernière syllabe pleine de chaque groupe (avant une ponctuation, ou tous les
 * 4 à 7 syllabes à une frontière de mot).
 */

/** Phonème produit par la transcription (API), ou pause. */
export interface PhoneTexte {
  /** Symbole API (« a », « ʁ », « ɑ̃ »…) ou `sil` pour une pause. */
  ph: string;
  /** Index du mot d'origine (−1 pour une pause). */
  mot: number;
  /** Durée de pause propre (s) pour `sil`. */
  pause?: number;
  /** Voyelle accentuée (fin de groupe). */
  accent?: boolean;
}

const NASAL = '̃';
/** Voyelles nasales (forme composée : base + tilde combinant). */
export const AN = 'ɑ' + NASAL;
export const IN = 'ɛ' + NASAL;
export const ON = 'ɔ' + NASAL;
export const UN = 'œ' + NASAL;

/** Voyelles (API) reconnues par la transcription. */
export const VOYELLES_API = new Set(['a', 'ɑ', 'e', 'ɛ', 'ə', 'i', 'o', 'ɔ', 'u', 'y', 'ø', 'œ', AN, IN, ON, UN]);

const LETTRES_VOYELLES = 'aeiouyàâäéèêëîïôöùûüœæ';
function estVoyelleLettre(c: string | undefined): boolean {
  return c !== undefined && c !== '' && LETTRES_VOYELLES.includes(c);
}
function estConsonneLettre(c: string | undefined): boolean {
  return c !== undefined && /[a-zç]/.test(c) && !estVoyelleLettre(c);
}

/** Lexique d'exceptions (mots fréquents à l'oral, y compris nouchi courant). */
const LEXIQUE: Readonly<Record<string, string[]>> = {
  est: ['ɛ'],
  et: ['e'],
  les: ['l', 'e'],
  des: ['d', 'e'],
  mes: ['m', 'e'],
  tes: ['t', 'e'],
  ses: ['s', 'e'],
  ces: ['s', 'e'],
  un: [UN],
  une: ['y', 'n'],
  oui: ['w', 'i'],
  non: ['n', ON],
  monsieur: ['m', 'ə', 's', 'j', 'ø'],
  messieurs: ['m', 'e', 's', 'j', 'ø'],
  madame: ['m', 'a', 'd', 'a', 'm'],
  femme: ['f', 'a', 'm'],
  eh: ['e'],
  ah: ['a'],
  oh: ['o'],
  hein: [IN],
  hé: ['e'],
  quoi: ['k', 'w', 'a'],
  pourquoi: ['p', 'u', 'ʁ', 'k', 'w', 'a'],
  il: ['i', 'l'],
  ils: ['i', 'l'],
  elle: ['ɛ', 'l'],
  avec: ['a', 'v', 'ɛ', 'k'],
  tout: ['t', 'u'],
  tous: ['t', 'u', 's'],
  vous: ['v', 'u'],
  nous: ['n', 'u'],
  parce: ['p', 'a', 'ʁ', 's'],
  faut: ['f', 'o'],
  fait: ['f', 'ɛ'],
  deux: ['d', 'ø'],
  trois: ['t', 'ʁ', 'w', 'a'],
  six: ['s', 'i', 's'],
  dix: ['d', 'i', 's'],
  vingt: ['v', IN],
  cent: ['s', AN],
  mille: ['m', 'i', 'l'],
  ville: ['v', 'i', 'l'],
  fils: ['f', 'i', 's'],
  plus: ['p', 'l', 'y'],
  aujourd: ['o', 'ʒ', 'u', 'ʁ', 'd'],
  hui: ['ɥ', 'i'],
  wesh: ['w', 'ɛ', 'ʃ'],
  gbê: ['ɡ', 'b', 'ɛ'],
  djo: ['d', 'ʒ', 'o'],
  go: ['ɡ', 'o'],
  yako: ['j', 'a', 'k', 'o'],
  enjaillement: [AN, 'ʒ', 'a', 'j', 'm', AN],
  enjaillé: [AN, 'ʒ', 'a', 'j', 'e'],
};

/** Formes élidées (c', l', d', j', m', n', s', t', qu'). */
const ELISIONS: Readonly<Record<string, string[]>> = {
  c: ['s'],
  l: ['l'],
  d: ['d'],
  j: ['ʒ'],
  m: ['m'],
  n: ['n'],
  s: ['s'],
  t: ['t'],
  qu: ['k'],
  jusqu: ['ʒ', 'y', 's', 'k'],
  lorsqu: ['l', 'ɔ', 'ʁ', 's', 'k'],
  puisqu: ['p', 'ɥ', 'i', 's', 'k'],
};

const CHIFFRES: Readonly<Record<string, string>> = {
  '0': 'zéro',
  '1': 'un',
  '2': 'deux',
  '3': 'trois',
  '4': 'quatre',
  '5': 'cinq',
  '6': 'six',
  '7': 'sept',
  '8': 'huit',
  '9': 'neuf',
  '10': 'dix',
  '100': 'cent',
  '1000': 'mille',
};

/** Durées de pause par ponctuation (s). */
const PAUSES: Readonly<Record<string, number>> = {
  ',': 0.2,
  ';': 0.26,
  ':': 0.24,
  '.': 0.38,
  '!': 0.32,
  '?': 0.32,
  '…': 0.5,
  '—': 0.25,
  '(': 0.12,
  ')': 0.12,
};

/** Est-ce que la nasale (voyelle + n/m à la position `i`) se prononce nasale ? */
function nasaleIci(mot: string, i: number): boolean {
  const c = mot[i];
  if (c !== 'n' && c !== 'm') return false;
  const suivant = mot[i + 1];
  if (suivant === undefined) return true;
  if (suivant === 'n' || suivant === 'm') return false;
  if (estVoyelleLettre(suivant) || suivant === 'h') return false;
  return true;
}

/** Transcription d'un mot (minuscules, sans ponctuation). */
export function motVersPhonemes(motBrut: string): string[] {
  const mot = motBrut.normalize('NFC').toLowerCase();
  if (mot === '') return [];
  const lex = LEXIQUE[mot];
  if (lex) return [...lex];
  if (/^\d+$/.test(mot)) {
    const ecrit = CHIFFRES[mot];
    if (ecrit) return motVersPhonemes(ecrit);
    return mot.split('').flatMap((c) => motVersPhonemes(CHIFFRES[c] ?? ''));
  }
  const r: string[] = [];
  const n = mot.length;
  const fin = (i: number): boolean => i >= n;
  const reste = (i: number): string => mot.slice(i);
  const monosyllabe = mot.replace(/[^aeiouyàâäéèêëîïôöùûüœ]+/g, ' ').trim().split(/\s+/).length <= 1;
  let i = 0;
  const pousser = (...ph: string[]): void => {
    for (const p of ph) if (r[r.length - 1] !== p || VOYELLES_API.has(p)) r.push(p);
  };
  while (i < n) {
    const c = mot[i]!;
    const s = reste(i);
    const prec = i > 0 ? mot[i - 1] : undefined;
    // ── Groupes de voyelles ──
    if (s.startsWith('eaux') || s.startsWith('eau')) {
      pousser('o');
      i += s.startsWith('eaux') ? 4 : 3;
      continue;
    }
    if (/^aient$/.test(s) || /^ais$|^ait$/.test(s)) {
      pousser('ɛ');
      i = n;
      continue;
    }
    if (s.startsWith('ouille')) {
      pousser('u', 'j');
      i += 6;
      continue;
    }
    if (s.startsWith('aille') || (s.startsWith('ail') && fin(i + 3))) {
      pousser('a', 'j');
      i += s.startsWith('aille') ? 5 : 3;
      continue;
    }
    if (s.startsWith('eille') || (s.startsWith('eil') && fin(i + 3))) {
      pousser('ɛ', 'j');
      i += s.startsWith('eille') ? 5 : 3;
      continue;
    }
    if (s.startsWith('euil')) {
      pousser('œ', 'j');
      i += s.startsWith('euille') ? 6 : 4;
      continue;
    }
    if (s.startsWith('ill') && i > 0 && !estVoyelleLettre(prec)) {
      pousser('i', 'j');
      i += s.startsWith('ille') ? 4 : 3;
      continue;
    }
    if (s.startsWith('oin') && nasaleIci(mot, i + 2)) {
      pousser('w', IN);
      i += 3;
      continue;
    }
    if (s.startsWith('oi') || s.startsWith('oî')) {
      pousser('w', 'a');
      i += 2;
      continue;
    }
    if (s.startsWith('oy')) {
      pousser('w', 'a', 'j');
      i += 2;
      continue;
    }
    if (s.startsWith('ou') || s.startsWith('où') || s.startsWith('oû')) {
      pousser(estVoyelleLettre(mot[i + 2]) && mot[i + 2] !== 'e' ? 'w' : 'u');
      i += 2;
      continue;
    }
    if (s.startsWith('au')) {
      pousser('o');
      i += 2;
      continue;
    }
    if ((s.startsWith('ain') || s.startsWith('aim') || s.startsWith('ein')) && nasaleIci(mot, i + 2)) {
      pousser(IN);
      i += 3;
      continue;
    }
    if (s.startsWith('ai') || s.startsWith('ei') || s.startsWith('aî')) {
      pousser('ɛ');
      i += 2;
      continue;
    }
    if (s.startsWith('ay')) {
      pousser('ɛ', 'j');
      i += 2;
      continue;
    }
    if (s.startsWith('œu') || s.startsWith('eu')) {
      pousser('ø');
      i += 2;
      continue;
    }
    if (s.startsWith('ien') && nasaleIci(mot, i + 2)) {
      pousser('j', IN);
      i += 3;
      continue;
    }
    if (s.startsWith('tion') && i > 0 && prec !== 's') {
      pousser('s', 'j', ON);
      i += 4;
      continue;
    }
    // ── Nasales ──
    if ((c === 'a' || c === 'e') && nasaleIci(mot, i + 1)) {
      // « -ent » final des verbes au pluriel : on garde la nasale (choix sûr pour la bouche).
      pousser(AN);
      i += 2;
      continue;
    }
    if ((c === 'i' || c === 'y') && nasaleIci(mot, i + 1)) {
      pousser(IN);
      i += 2;
      continue;
    }
    if (c === 'o' && nasaleIci(mot, i + 1)) {
      pousser(ON);
      i += 2;
      continue;
    }
    if (c === 'u' && nasaleIci(mot, i + 1)) {
      pousser(UN);
      i += 2;
      continue;
    }
    // ── Voyelles simples ──
    if (c === 'é') {
      pousser('e');
      i++;
      continue;
    }
    if (c === 'è' || c === 'ê' || c === 'ë') {
      pousser('ɛ');
      i++;
      continue;
    }
    if (c === 'a' || c === 'à' || c === 'â' || c === 'ä') {
      pousser('a');
      i++;
      continue;
    }
    if (c === 'î' || c === 'ï') {
      pousser('i');
      i++;
      continue;
    }
    if (c === 'i') {
      pousser(estVoyelleLettre(mot[i + 1]) && mot[i + 1] !== 'e' ? 'j' : 'i');
      i++;
      continue;
    }
    if (c === 'ô' || c === 'ö') {
      pousser('o');
      i++;
      continue;
    }
    if (c === 'o') {
      const finMot = fin(i + 1) || /^(s|t|x|z)$/.test(reste(i + 1));
      pousser(finMot ? 'o' : 'ɔ');
      i++;
      continue;
    }
    if (c === 'ù' || c === 'û') {
      pousser('u');
      i++;
      continue;
    }
    if (c === 'u' || c === 'ü') {
      // « gu », « qu » : déjà consommés plus bas ; « ui » → ɥi.
      pousser(mot[i + 1] === 'i' ? 'ɥ' : 'y');
      i++;
      continue;
    }
    if (c === 'y') {
      if (estVoyelleLettre(prec) && estVoyelleLettre(mot[i + 1])) pousser('j');
      else if (i === 0 && estVoyelleLettre(mot[i + 1])) pousser('j');
      else pousser('i');
      i++;
      continue;
    }
    if (c === 'œ' || c === 'æ') {
      pousser(c === 'œ' ? 'œ' : 'e');
      i++;
      continue;
    }
    if (c === 'e') {
      const apres = reste(i + 1);
      if (fin(i + 1)) {
        if (monosyllabe) pousser('ə');
        i++;
        continue;
      }
      if (apres === 's' || apres === 'nt') {
        if (monosyllabe) pousser('e');
        i = n;
        continue;
      }
      if ((apres === 'r' || apres === 'z') && n > 2) {
        pousser('e');
        i = n;
        continue;
      }
      if (apres === 't') {
        pousser('ɛ');
        i = n;
        continue;
      }
      if (mot[i + 1] === 'x' || (estConsonneLettre(mot[i + 1]) && estConsonneLettre(mot[i + 2]) && mot[i + 2] !== 'r' && mot[i + 2] !== 'l')) {
        pousser('ɛ');
        i++;
        continue;
      }
      if (estConsonneLettre(mot[i + 1]) && fin(i + 2) && !/[sdtxzgp]/.test(mot[i + 1]!)) {
        pousser('ɛ');
        i++;
        continue;
      }
      pousser(i === 0 ? 'e' : 'ə');
      i++;
      continue;
    }
    // ── Consonnes ──
    if (s.startsWith('ch')) {
      pousser('ʃ');
      i += 2;
      continue;
    }
    if (s.startsWith('ph')) {
      pousser('f');
      i += 2;
      continue;
    }
    if (s.startsWith('th')) {
      pousser('t');
      i += 2;
      continue;
    }
    if (s.startsWith('gn')) {
      pousser('ɲ');
      i += 2;
      continue;
    }
    if (s.startsWith('qu')) {
      pousser('k');
      i += 2;
      continue;
    }
    if (s.startsWith('gu') && /[eiyéèê]/.test(mot[i + 2] ?? '')) {
      pousser('ɡ');
      i += 2;
      continue;
    }
    if (s.startsWith('ge') && /[aou]/.test(mot[i + 2] ?? '')) {
      pousser('ʒ');
      i += 2;
      continue;
    }
    if (c === 'g') {
      if (fin(i + 1)) {
        i++;
        continue;
      }
      pousser(/[eiyéèêë]/.test(mot[i + 1] ?? '') ? 'ʒ' : 'ɡ');
      i += mot[i + 1] === 'g' ? 2 : 1;
      continue;
    }
    if (s.startsWith('sc') && /[eiyéè]/.test(mot[i + 2] ?? '')) {
      pousser('s');
      i += 2;
      continue;
    }
    if (c === 'c') {
      if (fin(i + 1) && i > 0 && !estVoyelleLettre(prec) && prec !== 'r') {
        i++;
        continue;
      }
      pousser(/[eiyéèêë]/.test(mot[i + 1] ?? '') ? 's' : 'k');
      i += mot[i + 1] === 'c' || mot[i + 1] === 'k' ? 2 : 1;
      continue;
    }
    if (c === 'ç') {
      pousser('s');
      i++;
      continue;
    }
    if (c === 's') {
      if (mot[i + 1] === 's') {
        pousser('s');
        i += 2;
        continue;
      }
      if (fin(i + 1)) {
        i++;
        continue;
      }
      pousser(estVoyelleLettre(prec) && estVoyelleLettre(mot[i + 1]) ? 'z' : 's');
      i++;
      continue;
    }
    if (c === 'x') {
      if (fin(i + 1)) {
        i++;
        continue;
      }
      if (i === 1 && prec === 'e' && estVoyelleLettre(mot[i + 1])) pousser('ɡ', 'z');
      else pousser('k', 's');
      i++;
      continue;
    }
    if (c === 'h') {
      i++;
      continue;
    }
    if (c === 'j') {
      pousser('ʒ');
      i++;
      continue;
    }
    if (c === 'r') {
      pousser('ʁ');
      i += mot[i + 1] === 'r' ? 2 : 1;
      continue;
    }
    if (c === 'w') {
      pousser('w');
      i++;
      continue;
    }
    if (c === 'k' || c === 'q') {
      pousser('k');
      i++;
      continue;
    }
    if (c === 'z') {
      if (fin(i + 1) && n > 2) {
        i++;
        continue;
      }
      pousser('z');
      i++;
      continue;
    }
    if (c === 'd' || c === 't' || c === 'p') {
      if (fin(i + 1) && n > 1) {
        i++;
        continue;
      }
      pousser(c);
      i += mot[i + 1] === c ? 2 : 1;
      continue;
    }
    if (c === 'b' || c === 'f' || c === 'l' || c === 'm' || c === 'n' || c === 'v') {
      pousser(c);
      i += mot[i + 1] === c ? 2 : 1;
      continue;
    }
    i++; // caractère inconnu : ignoré
  }
  return r;
}

/** Découpe un texte en mots et ponctuations (les apostrophes séparent l'élision du mot). */
export function decouperTexte(texte: string): Array<{ mot: string } | { ponctuation: string }> {
  const t = texte.normalize('NFC').replace(/[’‘`´]/g, "'").replace(/\.\.\./g, '…');
  const r: Array<{ mot: string } | { ponctuation: string }> = [];
  const re = /([A-Za-zÀ-ÖØ-öø-ÿŒœÆæ0-9]+'?)|([,;:.!?…—()])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    if (m[1]) r.push({ mot: m[1] });
    else if (m[2]) r.push({ ponctuation: m[2] });
  }
  return r;
}

/**
 * Transcription d'un texte : phonèmes API, pauses aux ponctuations, accents de fin de groupe (et tous les 4 à 7
 * syllabes à une frontière de mot dans les longs groupes).
 */
export function texteVersPhonemes(texte: string): PhoneTexte[] {
  const morceaux = decouperTexte(texte);
  const r: PhoneTexte[] = [];
  let indexMot = 0;
  for (const m of morceaux) {
    if ('ponctuation' in m) {
      const p = PAUSES[m.ponctuation] ?? 0.2;
      const dernier = r[r.length - 1];
      if (dernier && dernier.ph === 'sil') dernier.pause = Math.max(dernier.pause ?? 0, p);
      else if (r.length > 0) r.push({ ph: 'sil', mot: -1, pause: p });
      continue;
    }
    let mot = m.mot.toLowerCase();
    let phs: string[];
    if (mot.endsWith("'")) {
      mot = mot.slice(0, -1);
      phs = ELISIONS[mot] ? [...ELISIONS[mot]!] : motVersPhonemes(mot);
    } else phs = motVersPhonemes(mot);
    for (const ph of phs) r.push({ ph, mot: indexMot });
    indexMot++;
  }
  marquerAccents(r);
  return r;
}

/** Marque l'accent sur la dernière voyelle pleine de chaque groupe (et coupe les groupes trop longs). */
function marquerAccents(phs: PhoneTexte[]): void {
  let groupe: number[] = [];
  const fermer = (): void => {
    for (let k = groupe.length - 1; k >= 0; k--) {
      const p = phs[groupe[k]!]!;
      if (VOYELLES_API.has(p.ph) && p.ph !== 'ə') {
        p.accent = true;
        break;
      }
    }
    groupe = [];
  };
  let syllabes = 0;
  for (let i = 0; i < phs.length; i++) {
    const p = phs[i]!;
    if (p.ph === 'sil') {
      fermer();
      syllabes = 0;
      continue;
    }
    groupe.push(i);
    if (VOYELLES_API.has(p.ph)) syllabes++;
    const suivant = phs[i + 1];
    const finMot = !suivant || suivant.mot !== p.mot;
    if (finMot && syllabes >= 5 && suivant && suivant.ph !== 'sil') {
      fermer();
      syllabes = 0;
    }
  }
  fermer();
}

/** Classe articulatoire d'un phonème (durées). */
function classe(ph: string): 'voyelle' | 'nasaleV' | 'schwa' | 'occlusive' | 'fricative' | 'nasale' | 'liquide' | 'glissante' | 'pause' {
  if (ph === 'sil') return 'pause';
  if (ph === 'ə') return 'schwa';
  if (ph === AN || ph === IN || ph === ON || ph === UN) return 'nasaleV';
  if (VOYELLES_API.has(ph)) return 'voyelle';
  if ('pbtdkɡg'.includes(ph)) return 'occlusive';
  if ('fvszʃʒ'.includes(ph)) return 'fricative';
  if ('mnɲŋ'.includes(ph)) return 'nasale';
  if ('lʁr'.includes(ph)) return 'liquide';
  return 'glissante';
}

const DUREE_CLASSE: Readonly<Record<ReturnType<typeof classe>, number>> = {
  voyelle: 0.085,
  nasaleV: 0.105,
  schwa: 0.055,
  occlusive: 0.062,
  fricative: 0.08,
  nasale: 0.066,
  liquide: 0.056,
  glissante: 0.046,
  pause: 0.2,
};

/** Durées heuristiques (s) d'une suite de phonèmes : classe × accent (× 1,7), dernière voyelle × 1,9. */
export function dureesHeuristiques(phs: readonly PhoneTexte[]): number[] {
  let derniereVoyelle = -1;
  phs.forEach((p, i) => {
    if (VOYELLES_API.has(p.ph)) derniereVoyelle = i;
  });
  return phs.map((p, i) => {
    if (p.ph === 'sil') return p.pause ?? DUREE_CLASSE.pause;
    let d = DUREE_CLASSE[classe(p.ph)];
    if (p.accent) d *= 1.7;
    if (i === derniereVoyelle) d *= 1.9 / (p.accent ? 1.7 : 1);
    return d;
  });
}

/** Phonème horodaté produit par le secours (relatif au début de la réplique). */
export interface PhonemeEstime {
  ph: string;
  debut: number;
  fin: number;
  accent?: boolean;
  mot: number;
}

/**
 * Phonèmes horodatés d'un texte, sur `[debut, fin]` (s, relatifs) : durées heuristiques mises à l'échelle pour
 * remplir l'intervalle (les pauses s'étirent deux fois moins que les sons). Sans `fin`, débit naturel.
 */
export function phonemesDepuisTexte(texte: string, debut = 0, fin?: number): PhonemeEstime[] {
  const phs = texteVersPhonemes(texte);
  // Pas de pause finale ni initiale.
  while (phs.length > 0 && phs[phs.length - 1]!.ph === 'sil') phs.pop();
  while (phs.length > 0 && phs[0]!.ph === 'sil') phs.shift();
  if (phs.length === 0) return [];
  const d = dureesHeuristiques(phs);
  let echelleSons = 1;
  let echellePauses = 1;
  if (fin !== undefined && fin > debut) {
    const sons = d.reduce((s, x, i) => s + (phs[i]!.ph === 'sil' ? 0 : x), 0);
    const pauses = d.reduce((s, x, i) => s + (phs[i]!.ph === 'sil' ? x : 0), 0);
    const cible = fin - debut;
    // Résout sons·k + pauses·(1 + (k − 1)/2) = cible.
    const k = (cible - pauses / 2) / (sons + pauses / 2);
    echelleSons = Math.max(0.2, k);
    echellePauses = Math.max(0.1, 1 + (echelleSons - 1) / 2);
    const total = sons * echelleSons + pauses * echellePauses;
    const corr = cible / total;
    echelleSons *= corr;
    echellePauses *= corr;
  }
  const r: PhonemeEstime[] = [];
  let t = debut;
  phs.forEach((p, i) => {
    const duree = d[i]! * (p.ph === 'sil' ? echellePauses : echelleSons);
    const e: PhonemeEstime = { ph: p.ph, debut: t, fin: t + duree, mot: p.mot };
    if (p.accent) e.accent = true;
    r.push(e);
    t += duree;
  });
  return r;
}
