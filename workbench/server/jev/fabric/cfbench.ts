// COGNITIVE FABRIC BENCHMARK: 80 deterministic tasks (10 per category) with ground truth
// COMPUTED by the generator (never typed by hand), compared across three arms:
//   baseline (JEV OFF) · v5 (JEV FULL) · fabric (JEV FULL + Cognitive Fabric).
// Nothing here is a result: the benchmark runs only when the user starts it, and the
// analysis only reads real log entries.
import type { JevLogEntry } from '../metrics';
import { SCIENCE, differences, pairedStat, type PairedStat } from '../science';
import { qualityOfEntry } from './memory';

export type CfCategory =
  'simple' | 'intermediate' | 'complex' | 'coding' | 'data' | 'reasoning' | 'document' | 'multitool';
export const CF_CATEGORIES: CfCategory[] = [
  'simple',
  'intermediate',
  'complex',
  'coding',
  'data',
  'reasoning',
  'document',
  'multitool',
];
export const CF_LABEL: Record<CfCategory, string> = {
  simple: 'tâches simples',
  intermediate: 'tâches intermédiaires',
  complex: 'tâches complexes',
  coding: 'coding',
  data: 'data',
  reasoning: 'reasoning',
  document: 'document',
  multitool: 'multi-tool',
};

export interface CfTask {
  key: string;
  category: CfCategory;
  text: string;
  /** Ground-truth check on the final answer. */
  expect: RegExp;
  /** Workspace files written before each run. */
  files?: Record<string, string>;
  /** Files created by the task (deleted before each run). */
  outputs?: string[];
  /** Fabric category used by the expertise matrix / science analysis. */
  domain: string;
}

// deterministic PRNG so the benchmark is reproducible
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)]!;
const int = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

/** A regex accepting an integer with any thousands separators (space, nbsp, dot, comma). */
export const numRx = (n: number): RegExp => {
  const s = String(Math.abs(Math.round(n)));
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, '[\\s\\u00a0\\u202f.,]?');
  return new RegExp(`(?<![\\d])${n < 0 ? '-' : ''}${grouped}(?![\\d])`);
};
/** A decimal with 1 or 2 digits, accepting « . » or « , ». */
export const decRx = (n: number, d = 1): RegExp =>
  new RegExp(`(?<![\\d])${n.toFixed(d).replace('.', '[.,]')}(?!\\d)`);
const wordRx = (w: string) => new RegExp(`\\b${w}\\b`, 'i');

const T = (
  key: string,
  category: CfCategory,
  domain: string,
  text: string,
  expect: RegExp,
  extra: Partial<CfTask> = {},
): CfTask => ({ key, category, domain, text, expect, ...extra });

// ───────────────────────── 10 simple ─────────────────────────
const simple = (): CfTask[] => [
  T('s01', 'simple', 'chat', 'Quelle est la capitale du Sénégal ? Réponds en un mot.', wordRx('dakar')),
  T('s02', 'simple', 'chat', 'Quelle est la capitale du Mali ? Réponds en un mot.', wordRx('bamako')),
  T('s03', 'simple', 'chat', 'Combien de jours compte une semaine ? Réponds par un nombre.', /\b(7|sept)\b/i),
  T('s04', 'simple', 'chat', 'Quel est le contraire du mot « grand » ? Réponds en un mot.', wordRx('petit')),
  T('s05', 'simple', 'chat', 'Traduis « merci » en anglais. Réponds en un mot.', wordRx('thanks?( you)?')),
  T(
    's06',
    'simple',
    'chat',
    'Quelle est la monnaie commune des pays de l’UEMOA ?',
    /(franc\s*cfa|\bxof\b|cfa)/i,
  ),
  T('s07', 'simple', 'chat', 'Combien de mois compte une année ? Réponds par un nombre.', /\b(12|douze)\b/i),
  T('s08', 'simple', 'chat', 'Quelle est la planète la plus proche du Soleil ?', wordRx('mercure')),
  T('s09', 'simple', 'chat', 'Quel est le chef-lieu de la région de Thiès ?', wordRx('thi[eè]s')),
  T('s10', 'simple', 'chat', 'Écris une phrase de remerciement contenant le mot « équipe ».', /[ée]quipe/i),
];

// ───────────────────────── 10 intermediate ─────────────────────────
const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const intermediate = (): CfTask[] => {
  const d = new Date(Date.UTC(2026, 9, 14));
  const vowels = (w: string) => [...w.toLowerCase()].filter((c) => 'aeiouyàâäéèêëîïôöùûü'.includes(c)).length;
  const list = [12, 7, 3, 25, 9, 14, 8];
  const med = [...list].sort((a, b) => a - b)[3]!;
  const avg = [12, 15, 18, 20, 25];
  return [
    T('i01', 'intermediate', 'data', 'Quel est 18 % de 2 450 ? Donne le nombre.', decRx(18 * 24.5, 0)),
    T('i02', 'intermediate', 'data', 'Convertis 3,5 km en mètres. Donne le nombre.', numRx(3500)),
    T(
      'i03',
      'intermediate',
      'chat',
      'Quel jour de la semaine sera le 14 octobre 2026 ?',
      wordRx(WEEKDAYS[d.getUTCDay()]!),
    ),
    T(
      'i04',
      'intermediate',
      'chat',
      'Combien de voyelles (a, e, i, o, u, y, accentuées comprises) contient le mot « développement » ?',
      numRx(vowels('développement')),
    ),
    T(
      'i05',
      'intermediate',
      'data',
      `Quelle est la médiane de la liste ${list.join(', ')} ? Donne le nombre.`,
      numRx(med),
    ),
    T(
      'i06',
      'intermediate',
      'chat',
      'Trie par ordre croissant : 42, 7, 19, 3, 88. Donne la liste triée.',
      /3\D+7\D+19\D+42\D+88/,
    ),
    T(
      'i07',
      'intermediate',
      'data',
      `Quelle est la moyenne de ${avg.join(', ')} ? Donne le nombre.`,
      numRx(avg.reduce((a, b) => a + b, 0) / avg.length),
    ),
    T(
      'i08',
      'intermediate',
      'data',
      'Un prêt de 500 000 XOF à 6 % d’intérêt simple pendant 2 ans : quel est le montant total des intérêts ?',
      numRx(500000 * 0.06 * 2),
    ),
    T(
      'i09',
      'intermediate',
      'chat',
      'Combien de mots contient la phrase « la banque centrale publie son rapport annuel » ? Donne le nombre.',
      numRx(6),
    ),
    T(
      'i10',
      'intermediate',
      'data',
      'Si 12 stylos coûtent 3 600 XOF, combien coûtent 20 stylos ? Donne le montant en XOF.',
      numRx((3600 / 12) * 20),
    ),
  ];
};

// ───────────────────────── 10 complex ─────────────────────────
const complex = (): CfTask[] => {
  const pmt = (p: number, r: number, n: number) => (p * r) / (1 - Math.pow(1 + r, -n));
  const npv = (rate: number, fl: number[]) => fl.reduce((a, f, i) => a + f / Math.pow(1 + rate, i + 1), 0);
  return [
    T(
      'c01',
      'complex',
      'finance',
      'Un capital de 1 000 000 XOF est placé à 5 % d’intérêt composé annuel pendant 3 ans. Quelle est la valeur finale, arrondie à l’entier ?',
      numRx(Math.round(1_000_000 * 1.05 ** 3)),
    ),
    T(
      'c02',
      'complex',
      'finance',
      'Quelle est la mensualité (arrondie à l’entier) d’un prêt de 6 000 000 XOF sur 12 mois, au taux de 1 % par mois, remboursé par annuités constantes ?',
      numRx(Math.round(pmt(6_000_000, 0.01, 12))),
    ),
    T(
      'c03',
      'complex',
      'finance',
      'Encours total 8 500 millions XOF, impayés 680 millions XOF : quel est le ratio d’impayés en pourcentage, avec 1 décimale ?',
      decRx((680 / 8500) * 100, 1),
    ),
    T(
      'c04',
      'complex',
      'data',
      'Trois notes : 12 (coefficient 2), 15 (coefficient 3), 9 (coefficient 5). Quelle est la moyenne pondérée, avec 1 décimale ?',
      decRx((12 * 2 + 15 * 3 + 9 * 5) / 10, 1),
    ),
    T(
      'c05',
      'complex',
      'finance',
      'Coûts fixes 2 400 000 XOF, prix de vente 1 500 XOF, coût variable 900 XOF par unité : combien d’unités pour atteindre le seuil de rentabilité ?',
      numRx(2_400_000 / (1500 - 900)),
    ),
    T(
      'c06',
      'complex',
      'ifrs9',
      'Exposition 10 000 000 XOF, PD 4 %, LGD 45 % : quelle est la perte attendue (ECL = EAD × PD × LGD) ?',
      numRx(10_000_000 * 0.04 * 0.45),
    ),
    T(
      'c07',
      'complex',
      'ifrs9',
      'Trois créances : 4 000 000 (provision 2 %), 7 500 000 (provision 15 %), 2 000 000 (provision 50 %). Quel est le total des provisions en XOF ?',
      numRx(4_000_000 * 0.02 + 7_500_000 * 0.15 + 2_000_000 * 0.5),
    ),
    T(
      'c08',
      'complex',
      'finance',
      'Un chiffre d’affaires passe de 100 à 150 en 3 ans. Quel est le taux de croissance annuel moyen en %, avec 1 décimale ?',
      decRx((Math.pow(1.5, 1 / 3) - 1) * 100, 1),
    ),
    T(
      'c09',
      'complex',
      'finance',
      'Valeur actuelle nette au taux de 10 % de trois flux annuels de 1 000 000, 1 200 000 et 1 500 000 XOF (reçus à la fin de chaque année), arrondie à l’entier :',
      numRx(Math.round(npv(0.1, [1_000_000, 1_200_000, 1_500_000]))),
    ),
    T(
      'c10',
      'complex',
      'finance',
      'Convertis 2 000 EUR en XOF au taux de 655,957 puis déduis 1,5 % de frais. Quel est le montant net arrondi à l’entier ?',
      numRx(Math.round(2000 * 655.957 * 0.985)),
    ),
  ];
};

// ───────────────────────── 10 coding (reference implementations run here) ─────────────────────────
const coding = (): CfTask[] => {
  const fib = (n: number): number => (n < 2 ? n : fib(n - 1) + fib(n - 2));
  const fact = (n: number): number => (n < 2 ? 1 : n * fact(n - 1));
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const prime = (n: number) => {
    for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
    return n > 1;
  };
  const sumSq = (n: number) => Array.from({ length: n }, (_, i) => (i + 1) ** 2).reduce((a, b) => a + b, 0);
  const rev = (s: string) => s.split(' ').reverse().join(' ');
  const arr = [4, 19, 3, 27, 8];
  const J = (what: string, call: string) =>
    `Écris une fonction JavaScript ${what} puis donne le résultat de ${call}.`;
  return [
    T(
      'k01',
      'coding',
      'code',
      J(
        'fizzbuzz(n) qui renvoie « FizzBuzz » si n est multiple de 3 et de 5, « Fizz » si multiple de 3, « Buzz » si multiple de 5, sinon n',
        'fizzbuzz(15)',
      ),
      /fizzbuzz/i,
    ),
    T(
      'k02',
      'coding',
      'code',
      J('sommeCarres(n) qui additionne les carrés de 1 à n', 'sommeCarres(10)'),
      numRx(sumSq(10)),
    ),
    T(
      'k03',
      'coding',
      'code',
      J('estPremier(n)', 'estPremier(97)'),
      prime(97) ? /\b(true|vrai|premier)\b/i : /\b(false|faux)\b/i,
    ),
    T('k04', 'coding', 'code', J('pgcd(a, b)', 'pgcd(48, 18)'), numRx(gcd(48, 18))),
    T('k05', 'coding', 'code', J('fib(n) (fib(0)=0, fib(1)=1)', 'fib(20)'), numRx(fib(20))),
    T('k06', 'coding', 'code', J('factorielle(n)', 'factorielle(10)'), numRx(fact(10))),
    T(
      'k07',
      'coding',
      'code',
      J('inverserMots(s) qui inverse l’ordre des mots d’une phrase', 'inverserMots("le chat noir")'),
      new RegExp(rev('le chat noir').replace(/ /g, '\\s+'), 'i'),
    ),
    T('k08', 'coding', 'code', J('estPalindrome(s)', 'estPalindrome("kayak")'), /\b(true|vrai)\b/i),
    T('k09', 'coding', 'code', J('maximum(tab)', `maximum([${arr.join(', ')}])`), numRx(Math.max(...arr))),
    T(
      'k10',
      'coding',
      'code',
      J('compter(s, c) qui compte les occurrences du caractère c dans s', 'compter("banana", "a")'),
      numRx(3),
    ),
  ];
};

// ───────────────────────── 10 data (CSV generated, answers computed) ─────────────────────────
const AGENCES = ['Dakar', 'Thiès', 'Kaolack', 'Saint-Louis', 'Ziguinchor'];
function csvOf(seed: number, n = 24) {
  const r = rng(seed);
  const rows = Array.from({ length: n }, (_, i) => ({
    agence: pick(r, AGENCES),
    mois: pick(r, ['janvier', 'février', 'mars']),
    montant: int(r, 50, 900) * 10,
    id: i,
  }));
  return {
    rows,
    csv: `agence,mois,montant\n${rows.map((x) => `${x.agence},${x.mois},${x.montant}`).join('\n')}\n`,
  };
}
const dataTasks = (): CfTask[] => {
  const mk = (
    i: number,
    build: (rows: ReturnType<typeof csvOf>['rows']) => { q: string; rx: RegExp },
  ): CfTask => {
    const { rows, csv } = csvOf(100 + i);
    const path = `bench/cf/data${i}.csv`;
    const b = build(rows);
    return T(
      `d${String(i).padStart(2, '0')}`,
      'data',
      i % 2 ? 'excel' : 'data',
      `Dans ${path}, ${b.q}`,
      b.rx,
      { files: { [path]: csv } },
    );
  };
  const by = (rows: { agence: string; montant: number; mois: string }[], a: string) =>
    rows.filter((x) => x.agence === a).reduce((s, x) => s + x.montant, 0);
  return [
    mk(1, (r) => ({
      q: 'quel est le total des montants pour Dakar ? Donne le nombre.',
      rx: numRx(by(r, 'Dakar')),
    })),
    mk(2, (r) => ({
      q: 'quel est le montant maximum ? Donne le nombre.',
      rx: numRx(Math.max(...r.map((x) => x.montant))),
    })),
    mk(3, (r) => ({
      q: 'combien de lignes de données (hors en-tête) ? Donne le nombre.',
      rx: numRx(r.length),
    })),
    mk(4, (r) => ({
      q: 'combien de lignes ont un montant supérieur à 5 000 ? Donne le nombre.',
      rx: numRx(r.filter((x) => x.montant > 5000).length),
    })),
    mk(5, (r) => ({
      q: 'quel est le total des montants pour le mois de février ? Donne le nombre.',
      rx: numRx(r.filter((x) => x.mois === 'février').reduce((s, x) => s + x.montant, 0)),
    })),
    mk(6, (r) => {
      const tot = AGENCES.map((a) => [a, by(r, a)] as const).sort((a, b) => b[1] - a[1]);
      return {
        q: 'quelle agence a le total des montants le plus élevé ?',
        rx: new RegExp(tot[0]![0].replace('è', '[eè]'), 'i'),
      };
    }),
    mk(7, (r) => ({
      q: 'quel est le montant minimum ? Donne le nombre.',
      rx: numRx(Math.min(...r.map((x) => x.montant))),
    })),
    mk(8, (r) => ({
      q: 'combien d’agences distinctes apparaissent ? Donne le nombre.',
      rx: numRx(new Set(r.map((x) => x.agence)).size),
    })),
    mk(9, (r) => ({
      q: 'quel est le montant total de toutes les lignes ? Donne le nombre.',
      rx: numRx(r.reduce((s, x) => s + x.montant, 0)),
    })),
    mk(10, (r) => ({
      q: 'quel est le montant moyen par ligne, arrondi à l’entier ?',
      rx: numRx(Math.round(r.reduce((s, x) => s + x.montant, 0) / r.length)),
    })),
  ];
};

// ───────────────────────── 10 reasoning ─────────────────────────
const reasoning = (): CfTask[] => {
  const dow = (start: number, add: number) => WEEKDAYS[(start + add) % 7]!;
  return [
    T(
      'r01',
      'reasoning',
      'reasoning',
      'Awa a 3 ans de plus que Moussa. À eux deux ils ont 31 ans. Quel est l’âge de Moussa ?',
      numRx(14),
    ),
    T(
      'r02',
      'reasoning',
      'reasoning',
      'Un train parcourt 120 km en 1,5 heure à vitesse constante. Quelle est sa vitesse en km/h ?',
      numRx(80),
    ),
    T(
      'r03',
      'reasoning',
      'reasoning',
      'Tous les analystes sont rigoureux. Fatou est analyste. Fatou est-elle rigoureuse ? Réponds par oui ou non.',
      /\boui\b/i,
    ),
    T(
      'r04',
      'reasoning',
      'reasoning',
      'A est plus grand que B, et B est plus grand que C. Qui est le plus petit ? Réponds par une lettre.',
      /\bC\b/,
    ),
    T(
      'r05',
      'reasoning',
      'reasoning',
      'Une urne contient 2 boules rouges et 3 boules bleues. Quelle est la probabilité de tirer une boule rouge, en pourcentage ?',
      /\b40\s*%|\b0[.,]4\b|2\s*\/\s*5/,
    ),
    T(
      'r06',
      'reasoning',
      'reasoning',
      '3 ouvriers font un travail en 6 jours. Combien de jours faudrait-il à 9 ouvriers au même rythme ?',
      numRx(2),
    ),
    T(
      'r07',
      'reasoning',
      'reasoning',
      'Un prix de 100 augmente de 20 % puis diminue de 20 %. Quel est le prix final ?',
      numRx(96),
    ),
    T(
      'r08',
      'reasoning',
      'reasoning',
      'Si aujourd’hui est mercredi, quel jour serons-nous dans 45 jours ?',
      wordRx(dow(3, 45)),
    ),
    T(
      'r09',
      'reasoning',
      'reasoning',
      'Un article à 10 000 XOF bénéficie d’une remise de 10 % puis d’une remise de 5 % sur le nouveau prix. Quel est le prix final en XOF ?',
      numRx(10_000 * 0.9 * 0.95),
    ),
    T(
      'r10',
      'reasoning',
      'reasoning',
      'Quel est le nombre suivant dans la suite 2, 6, 18, 54, … ?',
      numRx(162),
    ),
  ];
};

// ───────────────────────── 10 document ─────────────────────────
const NAMES = ['Sahel Conseil', 'Baobab Services', 'Teranga Logistique', 'Delta Finance', 'Kora Systèmes'];
const documentTasks = (): CfTask[] => {
  const mk = (
    i: number,
    ask: (f: { dur: number; montant: number; preavis: number; client: string; pays: string }) => {
      q: string;
      rx: RegExp;
    },
  ): CfTask => {
    const r = rng(500 + i);
    const f = {
      dur: pick(r, [12, 18, 24, 36]),
      montant: int(r, 8, 90) * 100_000,
      preavis: pick(r, [30, 45, 60, 90]),
      client: pick(r, NAMES),
      pays: pick(r, ['Sénégal', 'Mali', 'Côte d’Ivoire', 'Burkina Faso']),
    };
    const path = `bench/cf/doc${i}.md`;
    const text = `# Contrat de prestation\n\nArticle 1 — Parties : le prestataire ${NAMES[(i + 2) % 5]} et le client ${f.client}, établi au ${f.pays}.\n\nArticle 2 — Durée : le contrat est conclu pour ${f.dur} mois à compter de la signature.\n\nArticle 3 — Prix : ${f.montant.toLocaleString('fr-FR')} XOF par an, payable à terme échu.\n\nArticle 4 — Résiliation : chaque partie peut résilier moyennant un préavis de ${f.preavis} jours.\n\nArticle 5 — Confidentialité : les parties s’engagent à garder les informations confidentielles.\n`;
    const a = ask(f);
    return T(
      `m${String(i).padStart(2, '0')}`,
      'document',
      'document',
      `Lis ${path} et réponds : ${a.q}`,
      a.rx,
      { files: { [path]: text } },
    );
  };
  return [
    mk(1, (f) => ({ q: 'quelle est la durée du contrat en mois ?', rx: numRx(f.dur) })),
    mk(2, (f) => ({ q: 'quel est le prix annuel en XOF ?', rx: numRx(f.montant) })),
    mk(3, (f) => ({ q: 'quel est le préavis de résiliation en jours ?', rx: numRx(f.preavis) })),
    mk(4, (f) => ({
      q: 'quel est le nom du client ?',
      rx: new RegExp(f.client.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&').replace('è', '[eè]'), 'i'),
    })),
    mk(5, (f) => ({
      q: 'dans quel pays le client est-il établi ?',
      rx: new RegExp(f.pays.replace('’', "[’']"), 'i'),
    })),
    mk(6, (f) => ({
      q: 'quel est le prix total sur toute la durée du contrat, en XOF ? (prix annuel × durée en années)',
      rx: numRx((f.montant * f.dur) / 12),
    })),
    mk(7, (f) => ({
      q: `le préavis est-il supérieur à 40 jours ? Réponds par oui ou non.`,
      rx: f.preavis > 40 ? /\boui\b/i : /\bnon\b/i,
    })),
    mk(8, () => ({ q: 'combien d’articles contient le contrat ? Donne le nombre.', rx: numRx(5) })),
    mk(9, (f) => ({
      q: 'la durée est-elle d’au moins 2 ans ? Réponds par oui ou non.',
      rx: f.dur >= 24 ? /\boui\b/i : /\bnon\b/i,
    })),
    mk(10, (f) => ({
      q: 'quel est le prix mensuel moyen en XOF (prix annuel ÷ 12), arrondi à l’entier ?',
      rx: numRx(Math.round(f.montant / 12)),
    })),
  ];
};

// ───────────────────────── 10 multi-tool ─────────────────────────
const multitool = (): CfTask[] => {
  const a = csvOf(900, 10);
  const b = csvOf(901, 10);
  const sum = (rows: { montant: number }[]) => rows.reduce((s, x) => s + x.montant, 0);
  const nums = [17, 23, 9];
  const filtered = a.rows.filter((x) => x.agence === 'Dakar');
  return [
    T(
      't01',
      'multitool',
      'tool_heavy',
      'Lis bench/cf/mt1a.csv et bench/cf/mt1b.csv, additionne le total des montants des deux fichiers, écris le résultat dans bench/cf/out1.txt, puis donne le total.',
      numRx(sum(a.rows) + sum(b.rows)),
      { files: { 'bench/cf/mt1a.csv': a.csv, 'bench/cf/mt1b.csv': b.csv }, outputs: ['bench/cf/out1.txt'] },
    ),
    T(
      't02',
      'multitool',
      'tool_heavy',
      'Crée les fichiers bench/cf/x1.txt, bench/cf/x2.txt et bench/cf/x3.txt contenant « un », « deux », « trois », puis liste le dossier bench/cf et dis combien de ces trois fichiers existent.',
      /\b(3|trois)\b/i,
      { outputs: ['bench/cf/x1.txt', 'bench/cf/x2.txt', 'bench/cf/x3.txt'] },
    ),
    T(
      't03',
      'multitool',
      'tool_heavy',
      'Lis bench/cf/mt3.json et donne la valeur de la clé « seuil ».',
      numRx(4200),
      { files: { 'bench/cf/mt3.json': JSON.stringify({ projet: 'ALPHA', seuil: 4200, actif: true }) } },
    ),
    T(
      't04',
      'multitool',
      'tool_heavy',
      'Lis bench/cf/mt4a.txt et bench/cf/mt4b.txt. Lequel est le plus long en nombre de caractères ? Réponds « a » ou « b ».',
      /\bb\b/i,
      {
        files: {
          'bench/cf/mt4a.txt': 'Court texte.',
          'bench/cf/mt4b.txt':
            'Un texte nettement plus long que le premier, avec plusieurs mots supplémentaires.',
        },
      },
    ),
    T(
      't05',
      'multitool',
      'tool_heavy',
      'Écris dans bench/cf/out5.txt les carrés de 1 à 5 séparés par des virgules, relis le fichier, et donne la somme de ces carrés.',
      numRx(55),
      { outputs: ['bench/cf/out5.txt'] },
    ),
    T(
      't06',
      'multitool',
      'tool_heavy',
      'Parmi bench/cf/mt6a.txt, bench/cf/mt6b.txt et bench/cf/mt6c.txt, lesquels contiennent le mot « risque » ? Donne les lettres a, b ou c.',
      /\ba\b[\s\S]*\bc\b|\bc\b[\s\S]*\ba\b/i,
      {
        files: {
          'bench/cf/mt6a.txt': 'Le risque de crédit augmente.',
          'bench/cf/mt6b.txt': 'Rien à signaler ce mois-ci.',
          'bench/cf/mt6c.txt': 'Un risque opérationnel est noté.',
        },
      },
    ),
    T(
      't07',
      'multitool',
      'tool_heavy',
      'Dans bench/cf/mt7.csv, garde les lignes de l’agence Dakar, écris-les dans bench/cf/out7.csv, puis donne le nombre de lignes gardées.',
      numRx(filtered.length),
      { files: { 'bench/cf/mt7.csv': a.csv }, outputs: ['bench/cf/out7.csv'] },
    ),
    T(
      't08',
      'multitool',
      'tool_heavy',
      'Lis bench/cf/mt8.csv, calcule la moyenne des montants (arrondie à l’entier), écris « moyenne: X » dans bench/cf/out8.txt et donne X.',
      numRx(Math.round(sum(b.rows) / b.rows.length)),
      { files: { 'bench/cf/mt8.csv': b.csv }, outputs: ['bench/cf/out8.txt'] },
    ),
    T(
      't09',
      'multitool',
      'tool_heavy',
      'Lis bench/cf/mt9.txt, écris sa version en MAJUSCULES dans bench/cf/out9.txt et recopie ce texte en majuscules dans ta réponse.',
      /RAPPORT MENSUEL VALID[ÉE]/,
      { files: { 'bench/cf/mt9.txt': 'rapport mensuel validé' }, outputs: ['bench/cf/out9.txt'] },
    ),
    T(
      't10',
      'multitool',
      'tool_heavy',
      'Lis les nombres dans bench/cf/mt10a.txt, bench/cf/mt10b.txt et bench/cf/mt10c.txt et donne leur produit.',
      numRx(nums[0]! * nums[1]! * nums[2]!),
      {
        files: {
          'bench/cf/mt10a.txt': String(nums[0]),
          'bench/cf/mt10b.txt': String(nums[1]),
          'bench/cf/mt10c.txt': String(nums[2]),
        },
      },
    ),
  ];
};

/** The 80 tasks. Deterministic: the same call always returns the same prompts, files and expected answers. */
export const cfBenchTasks = (): CfTask[] => [
  ...simple(),
  ...intermediate(),
  ...complex(),
  ...coding(),
  ...dataTasks(),
  ...reasoning(),
  ...documentTasks(),
  ...multitool(),
];

// ───────────────────────── arms analysis ─────────────────────────

export type Arm = 'baseline' | 'v5' | 'fabric';
export const ARMS: Arm[] = ['baseline', 'v5', 'fabric'];
export const ARM_LABEL: Record<Arm, string> = {
  baseline: 'BASELINE (JEV OFF)',
  v5: 'JEV V5',
  fabric: 'JEV COGNITIVE FABRIC',
};

export interface ArmSummary {
  arm: Arm;
  n: number;
  successRate: number | null;
  quality: number | null;
  tokens: number | null;
  cost: number | null;
  costPerSuccess: number | null;
  latencyMs: number | null;
  jevCost: number;
}
export interface ArmComparison {
  from: Arm;
  to: Arm;
  pairs: number;
  label: 'MEASURED' | 'INSUFFICIENT_SAMPLE';
  dSuccess: PairedStat;
  dQuality: PairedStat;
  dTokens: PairedStat;
  dCost: PairedStat;
  dLatency: PairedStat;
  costPerSuccessChange: number | null;
  verdict: 'improves' | 'neutral' | 'worsens' | 'insufficient';
  reasons: string[];
}
export interface ArmsReport {
  arms: ArmSummary[];
  comparisons: ArmComparison[];
  byCategory: Record<string, { arms: ArmSummary[]; comparisons: ArmComparison[] }>;
  nonComparable: { groupId: string; arm: Arm; reasons: string[] }[];
  groups: number;
  tasks: number;
  models: string[];
}

const total = (e: JevLogEntry) => e.acct?.totalCost ?? e.cost + e.jevCost;
const toks = (e: JevLogEntry) => e.acct?.totalTokens ?? e.tokensIn + e.tokensOut;

function summarize(arm: Arm, es: JevLogEntry[]): ArmSummary {
  const j = es.filter((e) => e.success !== null);
  const ok = j.filter((e) => e.success).length;
  const q = es.map(qualityOfEntry).filter((x): x is number => x !== null);
  const cost = es.reduce((a, e) => a + total(e), 0);
  return {
    arm,
    n: es.length,
    successRate: j.length ? ok / j.length : null,
    quality: q.length ? q.reduce((a, b) => a + b, 0) / q.length : null,
    tokens: es.length ? es.reduce((a, e) => a + toks(e), 0) / es.length : null,
    cost: es.length ? cost / es.length : null,
    costPerSuccess: ok ? cost / ok : null,
    latencyMs: es.length ? es.reduce((a, e) => a + e.latencyMs, 0) / es.length : null,
    jevCost: es.reduce((a, e) => a + (e.acct?.jevCost ?? e.jevCost), 0),
  };
}

function compare(from: Arm, to: Arm, pairs: { a: JevLogEntry; b: JevLogEntry }[]): ArmComparison {
  const succ = (e: JevLogEntry) => (e.success === null ? null : e.success ? 1 : 0);
  const both = (f: (e: JevLogEntry) => number | null) =>
    pairs.flatMap((p) => {
      const x = f(p.a);
      const y = f(p.b);
      return x === null || y === null ? [] : [y - x];
    });
  const sa = summarize(
    from,
    pairs.map((p) => p.a),
  );
  const sb = summarize(
    to,
    pairs.map((p) => p.b),
  );
  const change =
    sa.costPerSuccess !== null && sb.costPerSuccess !== null && sa.costPerSuccess > 0
      ? (sb.costPerSuccess - sa.costPerSuccess) / sa.costPerSuccess
      : null;
  const dS = pairedStat(both(succ));
  const dQ = pairedStat(both(qualityOfEntry));
  const reasons: string[] = [];
  let verdict: ArmComparison['verdict'] = 'neutral';
  if (pairs.length < SCIENCE.minPairs) {
    verdict = 'insufficient';
    reasons.push(`n = ${pairs.length} < ${SCIENCE.minPairs} paires`);
  } else {
    const bad =
      (dS.meanDelta ?? 0) < -SCIENCE.successTolerance ||
      (dQ.n >= 3 && (dQ.meanDelta ?? 0) < -SCIENCE.qualityTolerance) ||
      (change !== null && change >= SCIENCE.neutralBand);
    if (bad) {
      verdict = 'worsens';
      if ((dS.meanDelta ?? 0) < -SCIENCE.successTolerance)
        reasons.push(`réussite ${((dS.meanDelta ?? 0) * 100).toFixed(0)} pts`);
      if (dQ.n >= 3 && (dQ.meanDelta ?? 0) < -SCIENCE.qualityTolerance)
        reasons.push(`qualité ${dQ.meanDelta!.toFixed(1)} pts`);
      if (change !== null && change >= SCIENCE.neutralBand)
        reasons.push(`coût / réussie +${(change * 100).toFixed(0)} %`);
    } else if (
      (change !== null && change <= -SCIENCE.neutralBand) ||
      (dS.meanDelta ?? 0) >= SCIENCE.successTolerance ||
      (dQ.n >= 3 && (dQ.meanDelta ?? 0) >= 2)
    ) {
      verdict = 'improves';
      if (change !== null && change <= -SCIENCE.neutralBand)
        reasons.push(`coût / réussie ${(change * 100).toFixed(0)} %`);
      if ((dS.meanDelta ?? 0) >= SCIENCE.successTolerance)
        reasons.push(`réussite +${((dS.meanDelta ?? 0) * 100).toFixed(0)} pts`);
      if (dQ.n >= 3 && (dQ.meanDelta ?? 0) >= 2) reasons.push(`qualité +${dQ.meanDelta!.toFixed(1)} pts`);
    } else reasons.push(`variations dans ±${SCIENCE.neutralBand * 100} % et tolérances`);
  }
  return {
    from,
    to,
    pairs: pairs.length,
    label: pairs.length < SCIENCE.minPairs ? 'INSUFFICIENT_SAMPLE' : 'MEASURED',
    dSuccess: dS,
    dQuality: dQ,
    dTokens: pairedStat(pairs.map((p) => toks(p.b) - toks(p.a))),
    dCost: pairedStat(pairs.map((p) => total(p.b) - total(p.a))),
    dLatency: pairedStat(pairs.map((p) => p.b.latencyMs - p.a.latencyMs)),
    costPerSuccessChange: change,
    verdict,
    reasons,
  };
}

/** BASELINE vs JEV V5 vs JEV COGNITIVE FABRIC, paired by group (same task, same repetition, same controlled variables). */
export function analyzeArms(log: JevLogEntry[]): ArmsReport {
  const es = log.filter((e) => e.fabric?.kind === 'cfbench' && e.experiment);
  const groups = new Map<string, Partial<Record<Arm, JevLogEntry>>>();
  for (const e of es)
    groups.set(e.fabric!.groupId, { ...(groups.get(e.fabric!.groupId) ?? {}), [e.fabric!.arm as Arm]: e });
  const nonComparable: ArmsReport['nonComparable'] = [];
  const pairsOf = (from: Arm, to: Arm, only?: string) => {
    const out: { a: JevLogEntry; b: JevLogEntry }[] = [];
    for (const [gid, g] of groups) {
      const a = g[from];
      const b = g[to];
      if (!a || !b || (only && a.fabric!.category !== only)) continue;
      const d = differences(a.experiment!, b.experiment!);
      if (d.length) {
        if (!nonComparable.some((n) => n.groupId === gid && n.arm === to))
          nonComparable.push({ groupId: gid, arm: to, reasons: d });
        continue;
      }
      out.push({ a, b });
    }
    return out;
  };
  const pairs = (
    [
      ['baseline', 'v5'],
      ['baseline', 'fabric'],
      ['v5', 'fabric'],
    ] as [Arm, Arm][]
  ).map(([f, t]) => ({ f, t, p: pairsOf(f, t) }));
  const complete = [...groups.values()].filter((g) => ARMS.every((a) => g[a]));
  const arms = ARMS.map((arm) =>
    summarize(
      arm,
      complete.map((g) => g[arm]!),
    ),
  );
  const byCategory: ArmsReport['byCategory'] = {};
  for (const c of [...new Set(es.map((e) => e.fabric!.category!).filter(Boolean))]) {
    const cg = complete.filter((g) => g.baseline!.fabric!.category === c);
    byCategory[c] = {
      arms: ARMS.map((arm) =>
        summarize(
          arm,
          cg.map((g) => g[arm]!),
        ),
      ),
      comparisons: (
        [
          ['baseline', 'v5'],
          ['baseline', 'fabric'],
          ['v5', 'fabric'],
        ] as [Arm, Arm][]
      ).map(([f, t]) => compare(f, t, pairsOf(f, t, c))),
    };
  }
  return {
    arms,
    comparisons: pairs.map(({ f, t, p }) => compare(f, t, p)),
    byCategory,
    nonComparable,
    groups: groups.size,
    tasks: new Set(es.map((e) => e.fabric!.taskKey)).size,
    models: [...new Set(es.map((e) => e.model))],
  };
}
