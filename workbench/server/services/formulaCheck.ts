// CONTRÔLE DE GRAMMAIRE DES FORMULES EXCEL — what Excel's own parser refuses when it opens a workbook. A formula it
// cannot parse makes it repair the file (« Nous avons trouvé un problème dans le contenu… Enregistrements réparés :
// formule ») — the Open XML validator does not parse formulas at all. Typical causes in generated workbooks:
//  - a TEXT written as a formula: openpyxl (and most writers) turn any string starting with « = » into a formula, so a
//    label such as « = Total Douteux (100 %) » becomes <f> Total Douteux (100 %)</f>;
//  - French function names and « ; » argument separators (SOMME(A1;A2)) — the file format only knows the English names
//    and the comma;
//  - functions introduced after Excel 2007 written without their mandatory « _xlfn. » prefix (UNIQUE, XLOOKUP, IFS…):
//    not a repair, but a #NAME? error in Excel.
// The checker tokenises the formula, verifies the operand/operator alternation and repairs what can be repaired.

export type FormulaVerdict = { ok: true; fixed?: string } | { ok: false; reason: string };

type Tok =
  | { k: 'num' | 'str' | 'err' | 'ref' | 'name' | 'array' }
  | { k: 'func'; name: string }
  | { k: 'op'; v: string }
  | { k: '(' | ')' | ',' | 'pct' | 'sp' };

/** Functions of Excel 2010+ that the file format stores with the « _xlfn. » prefix. */
export const XLFN = new Set(
  (
    'IFS SWITCH MAXIFS MINIFS TEXTJOIN CONCAT XLOOKUP XMATCH UNIQUE FILTER SORT SORTBY SEQUENCE RANDARRAY LET LAMBDA IFNA ' +
    'FORECAST.LINEAR FORECAST.ETS STDEV.S STDEV.P VAR.S VAR.P PERCENTILE.INC PERCENTILE.EXC QUARTILE.INC QUARTILE.EXC ' +
    'RANK.EQ RANK.AVG MODE.SNGL MODE.MULT NORM.DIST NORM.INV NORM.S.DIST NORM.S.INV T.TEST T.DIST T.INV CHISQ.TEST ' +
    'DAYS ISOWEEKNUM NUMBERVALUE ARABIC BASE DECIMAL ENCODEURL WEBSERVICE FILTERXML SHEET SHEETS ISFORMULA FORMULATEXT ' +
    'AGGREGATE CEILING.MATH FLOOR.MATH CEILING.PRECISE FLOOR.PRECISE TEXTBEFORE TEXTAFTER TEXTSPLIT VSTACK HSTACK TAKE DROP ' +
    'CHOOSECOLS CHOOSEROWS TOCOL TOROW WRAPCOLS WRAPROWS EXPAND GROUPBY PIVOTBY REGEXTEST REGEXEXTRACT REGEXREPLACE ' +
    'TRIMRANGE IMAGE STOCKHISTORY BYROW BYCOL MAP REDUCE SCAN MAKEARRAY ISOMITTED VALUETOTEXT ARRAYTOTEXT COVARIANCE.P ' +
    'COVARIANCE.S BINOM.DIST BINOM.INV EXPON.DIST GAMMA.DIST GAMMA.INV LOGNORM.DIST LOGNORM.INV POISSON.DIST WEIBULL.DIST ' +
    'Z.TEST F.TEST F.DIST F.INV BETA.DIST BETA.INV CONFIDENCE.NORM CONFIDENCE.T HYPGEOM.DIST NEGBINOM.DIST SKEW.P ' +
    'DAYS360 BITAND BITOR BITXOR GCD LCM MUNIT RRI PDURATION ISOWEEKNUM UNICHAR UNICODE XOR IFERROR'
  ).split(' '),
);
// IFERROR exists since 2007 and needs no prefix: keep it out.
XLFN.delete('IFERROR');

/** French function names → English (the file format only knows the English names). */
export const FR_FUNCS: Record<string, string> = {
  SOMME: 'SUM', MOYENNE: 'AVERAGE', SI: 'IF', NB: 'COUNT', NBVAL: 'COUNTA', 'NB.VIDE': 'COUNTBLANK', RECHERCHEV: 'VLOOKUP',
  RECHERCHEH: 'HLOOKUP', RECHERCHE: 'LOOKUP', ARRONDI: 'ROUND', 'ARRONDI.SUP': 'ROUNDUP', 'ARRONDI.INF': 'ROUNDDOWN',
  SIERREUR: 'IFERROR', SOMMEPROD: 'SUMPRODUCT', 'SOMME.SI': 'SUMIF', 'SOMME.SI.ENS': 'SUMIFS', 'NB.SI': 'COUNTIF',
  'NB.SI.ENS': 'COUNTIFS', 'MOYENNE.SI': 'AVERAGEIF', 'MOYENNE.SI.ENS': 'AVERAGEIFS', CONCATENER: 'CONCATENATE',
  GAUCHE: 'LEFT', DROITE: 'RIGHT', STXT: 'MID', TEXTE: 'TEXT', AUJOURDHUI: 'TODAY', MAINTENANT: 'NOW', ANNEE: 'YEAR',
  MOIS: 'MONTH', JOUR: 'DAY', ET: 'AND', OU: 'OR', NON: 'NOT', VRAI: 'TRUE', FAUX: 'FALSE', EQUIV: 'MATCH',
  DECALER: 'OFFSET', ESTVIDE: 'ISBLANK', ESTNUM: 'ISNUMBER', ESTTEXTE: 'ISTEXT', ESTERREUR: 'ISERROR', ESTNA: 'ISNA',
  'SOUS.TOTAL': 'SUBTOTAL', 'GRANDE.VALEUR': 'LARGE', 'PETITE.VALEUR': 'SMALL', RANG: 'RANK', MEDIANE: 'MEDIAN',
  ECARTYPE: 'STDEV', ENT: 'INT', PUISSANCE: 'POWER', RACINE: 'SQRT', TRONQUE: 'TRUNC', PLAFOND: 'CEILING',
  PLANCHER: 'FLOOR', CHOISIR: 'CHOOSE', LIGNE: 'ROW', COLONNE: 'COLUMN', LIGNES: 'ROWS', COLONNES: 'COLUMNS',
  SUPPRESPACE: 'TRIM', MAJUSCULE: 'UPPER', MINUSCULE: 'LOWER', NBCAR: 'LEN', CHERCHE: 'SEARCH', TROUVE: 'FIND',
  REMPLACER: 'REPLACE', SUBSTITUE: 'SUBSTITUTE', CNUM: 'VALUE', 'FIN.MOIS': 'EOMONTH', 'MOIS.DECALER': 'EDATE',
  JOURS: 'DAYS', 'NO.SEMAINE': 'WEEKNUM', JOURSEM: 'WEEKDAY', 'SI.CONDITIONS': 'IFS', 'SI.NON.DISP': 'IFNA',
  'MAX.SI.ENS': 'MAXIFS', 'MIN.SI.ENS': 'MINIFS', 'JOINDRE.TEXTE': 'TEXTJOIN', RECHERCHEX: 'XLOOKUP', FILTRE: 'FILTER',
  TRIER: 'SORT', 'TRIER.PAR': 'SORTBY', 'SI.MULTIPLE': 'SWITCH', 'ECARTYPE.STANDARD': 'STDEV.S', 'ECARTYPE.PEARSON': 'STDEV.P',
  'CENTILE.INCLURE': 'PERCENTILE.INC', 'RANG.POURCENTAGE.INCLURE': 'PERCENTRANK.INC', 'DATEDIF': 'DATEDIF', ABS: 'ABS',
  ARRONDI_: 'ROUND', 'NB.JOURS.OUVRES': 'NETWORKDAYS', 'SERIE.JOUR.OUVRE': 'WORKDAY', 'VALEUR.NOMINALE': 'NUMBERVALUE',
  'TEXTE.AVANT': 'TEXTBEFORE', 'TEXTE.APRES': 'TEXTAFTER', 'FRACTIONNER.TEXTE': 'TEXTSPLIT', INDIRECT: 'INDIRECT',
};

const ERRS = ['#N/A', '#REF!', '#VALUE!', '#DIV/0!', '#NAME?', '#NUM!', '#NULL!', '#GETTING_DATA', '#SPILL!', '#CALC!'];
const NAME_START = /[A-Za-z_\\À-ɏ]/;
const NAME_CHAR = /[A-Za-z0-9_.\\?À-ɏ]/;

function tokenize(f: string): Tok[] | string {
  const out: Tok[] = [];
  let i = 0;
  const n = f.length;
  const refRe = /^(?:\$?[A-Za-z]{1,3}\$?\d{1,7}(?::\$?[A-Za-z]{1,3}\$?\d{1,7})?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d{1,7}:\$?\d{1,7})(?![A-Za-z0-9_.(])/;
  while (i < n) {
    const c = f[i]!;
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r') {
      let j = i;
      while (j < n && /\s/.test(f[j]!)) j++;
      if (out.length && out[out.length - 1]!.k !== 'sp') out.push({ k: 'sp' });
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= n) return 'chaîne non fermée';
        if (f[j] === '"') {
          if (f[j + 1] === '"') j += 2;
          else break;
        } else j++;
      }
      out.push({ k: 'str' });
      i = j + 1;
      continue;
    }
    if (c === '{') {
      const j = f.indexOf('}', i);
      if (j < 0) return 'constante matricielle non fermée';
      out.push({ k: 'array' });
      i = j + 1;
      continue;
    }
    if (c === '#') {
      const e = ERRS.find((x) => f.startsWith(x, i));
      if (!e) return 'erreur inconnue « # »';
      out.push({ k: 'err' });
      i += e.length;
      continue;
    }
    // Sheet / workbook prefix: 'Sheet name'!  or  Name!  or  [1]Sheet!
    if (c === "'") {
      let j = i + 1;
      for (;;) {
        if (j >= n) return 'nom de feuille non fermé';
        if (f[j] === "'") {
          if (f[j + 1] === "'") j += 2;
          else break;
        } else j++;
      }
      if (f[j + 1] !== '!') return 'nom de feuille sans « ! »';
      i = j + 2;
      // what follows must be a reference or a name
      const rest = f.slice(i);
      const m = refRe.exec(rest);
      if (m) {
        out.push({ k: 'ref' });
        i += m[0].length;
        continue;
      }
      let k = i;
      while (k < n && NAME_CHAR.test(f[k]!)) k++;
      if (k === i) return 'référence attendue après « ! »';
      out.push({ k: 'ref' });
      i = k;
      continue;
    }
    if (c === '[') {
      let depth = 0;
      let j = i;
      for (; j < n; j++) {
        if (f[j] === '[') depth++;
        else if (f[j] === ']') {
          depth--;
          if (!depth) break;
        }
      }
      if (depth) return 'référence structurée non fermée';
      out.push({ k: 'ref' });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(f[i + 1] ?? ''))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(f.slice(i))!;
      const rowRange = /^\$?\d{1,7}:\$?\d{1,7}(?![A-Za-z0-9_.(])/.exec(f.slice(i));
      if (rowRange) {
        out.push({ k: 'ref' });
        i += rowRange[0].length;
        continue;
      }
      out.push({ k: 'num' });
      i += m[0].length;
      continue;
    }
    if (c === '$' || NAME_START.test(c)) {
      const rest = f.slice(i);
      const m = refRe.exec(rest);
      if (m) {
        out.push({ k: 'ref' });
        i += m[0].length;
        continue;
      }
      if (c === '$') return '« $ » isolé';
      let j = i + 1;
      while (j < n && NAME_CHAR.test(f[j]!)) j++;
      const name = f.slice(i, j);
      // Sheet!ref  (unquoted sheet name)
      if (f[j] === '!') {
        i = j + 1;
        const m2 = refRe.exec(f.slice(i));
        if (m2) {
          out.push({ k: 'ref' });
          i += m2[0].length;
          continue;
        }
        let k = i;
        while (k < n && NAME_CHAR.test(f[k]!)) k++;
        if (k === i) return 'référence attendue après « ! »';
        out.push({ k: 'ref' });
        i = k;
        continue;
      }
      if (f[j] === '(') {
        out.push({ k: 'func', name: name.toUpperCase() });
        out.push({ k: '(' });
        i = j + 1;
        continue;
      }
      if (f[j] === '[') {
        // structured reference Table[Column]
        let depth = 0;
        let k = j;
        for (; k < n; k++) {
          if (f[k] === '[') depth++;
          else if (f[k] === ']') {
            depth--;
            if (!depth) break;
          }
        }
        if (depth) return 'référence structurée non fermée';
        out.push({ k: 'ref' });
        i = k + 1;
        continue;
      }
      out.push({ k: 'name' });
      i = j;
      continue;
    }
    if (c === '(' || c === ')' || c === ',') {
      out.push({ k: c });
      i++;
      continue;
    }
    if (c === '%') {
      out.push({ k: 'pct' });
      i++;
      continue;
    }
    const two = f.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      out.push({ k: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>:'.includes(c)) {
      out.push({ k: 'op', v: c });
      i++;
      continue;
    }
    if (c === ';') return 'séparateur « ; » (le format de fichier n’accepte que la virgule)';
    return `caractère inattendu « ${c} »`;
  }
  return out;
}

/** Operand / operator alternation (Excel's grammar, including the intersection operator — a space between two references). */
function grammar(toks: Tok[]): string | null {
  let depth = 0;
  let expectOperand = true;
  let prev: Tok | null = null;
  const argStack: number[] = []; // depth at which each function call opened
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.k === 'sp') {
      // intersection: an operand, a space, an operand (reference-like only)
      const next = toks[i + 1];
      if (!expectOperand && next && prev && isOperand(next) && isOperand(prev)) {
        if (!refLike(prev) || !refLike(next)) return 'deux termes juxtaposés sans opérateur';
        expectOperand = true;
      }
      continue;
    }
    if (t.k === 'func') {
      if (!expectOperand) return 'fonction juxtaposée à un terme';
      prev = t;
      continue; // the '(' that follows opens its arguments
    }
    if (t.k === '(') {
      if (!expectOperand && prev?.k !== 'func') return 'parenthèse ouvrante après un terme';
      depth++;
      if (prev?.k === 'func') argStack.push(depth);
      expectOperand = true;
      prev = t;
      continue;
    }
    if (t.k === ')') {
      if (!depth) return 'parenthèse fermante en trop';
      // an empty argument list SUM() or a trailing empty argument IF(a,b,) is allowed by Excel
      if (expectOperand && !(prev?.k === '(' || prev?.k === ',')) return 'terme attendu avant « ) »';
      if (argStack[argStack.length - 1] === depth) argStack.pop();
      depth--;
      expectOperand = false;
      prev = t;
      continue;
    }
    if (t.k === ',') {
      if (!argStack.length || argStack[argStack.length - 1] !== depth) return 'virgule hors d’une liste d’arguments';
      expectOperand = true;
      prev = t;
      continue;
    }
    if (t.k === 'pct') {
      if (expectOperand) return '« % » sans terme';
      prev = t;
      continue;
    }
    if (t.k === 'op') {
      if (expectOperand) {
        if (t.v === '-' || t.v === '+') {
          prev = t;
          continue; // unary sign
        }
        return `opérateur « ${t.v} » sans terme à gauche`;
      }
      expectOperand = true;
      prev = t;
      continue;
    }
    // operand
    if (!expectOperand) return 'deux termes juxtaposés sans opérateur';
    expectOperand = false;
    prev = t;
  }
  if (depth) return 'parenthèse non fermée';
  if (expectOperand) return prev ? 'formule incomplète' : 'formule vide';
  return null;
}
const isOperand = (t: Tok) => t.k === 'num' || t.k === 'str' || t.k === 'err' || t.k === 'ref' || t.k === 'name' || t.k === 'array' || t.k === ')' || t.k === 'func';
const refLike = (t: Tok) => t.k === 'ref' || t.k === 'name' || t.k === ')' || t.k === 'func';

/** « ; » → « , » and French names → English, outside string literals. */
function frenchToEnglish(f: string): string {
  let out = '';
  let i = 0;
  while (i < f.length) {
    const c = f[i]!;
    if (c === '"') {
      let j = i + 1;
      while (j < f.length && !(f[j] === '"' && f[j + 1] !== '"')) j += f[j] === '"' ? 2 : 1;
      out += f.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < f.length && !(f[j] === "'" && f[j + 1] !== "'")) j += f[j] === "'" ? 2 : 1;
      out += f.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ';') {
      out += ',';
      i++;
      continue;
    }
    if (NAME_START.test(c)) {
      let j = i + 1;
      while (j < f.length && NAME_CHAR.test(f[j]!)) j++;
      const name = f.slice(i, j);
      const en = f[j] === '(' ? FR_FUNCS[name.toUpperCase()] : undefined;
      out += en ?? name;
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Adds the « _xlfn. » prefix to the functions that need it (outside strings). */
function prefixXlfn(f: string): string {
  let out = '';
  let i = 0;
  while (i < f.length) {
    const c = f[i]!;
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < f.length && !(f[j] === q && f[j + 1] !== q)) j += f[j] === q ? 2 : 1;
      out += f.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (NAME_START.test(c) && !(i > 0 && NAME_CHAR.test(f[i - 1]!))) {
      let j = i + 1;
      while (j < f.length && NAME_CHAR.test(f[j]!)) j++;
      const name = f.slice(i, j);
      if (f[j] === '(' && XLFN.has(name.toUpperCase()) && !/_xlfn\.$/i.test(out)) out += '_xlfn.' + name;
      else out += name;
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Verdict on one formula (file-format text, without the leading « = »). `names` = the workbook's defined and table
 * names: a formula made only of unknown words (« Encours total ») is a text, not an intersection of names.
 */
export function checkFormula(formula: string, names: Set<string> = new Set()): FormulaVerdict {
  let f = formula;
  if (!f.trim()) return { ok: false, reason: 'formule vide' };
  let toks = tokenize(f);
  if (typeof toks === 'string' && /;/.test(f)) {
    const fr = frenchToEnglish(f);
    const t2 = tokenize(fr);
    if (typeof t2 !== 'string' && !grammar(t2)) {
      f = fr;
      toks = t2;
    }
  }
  if (typeof toks === 'string') return { ok: false, reason: toks };
  const g = grammar(toks);
  if (g) return { ok: false, reason: g };
  // only words (and spaces) that are not defined names → a sentence, not a formula
  const words = toks.filter((t) => t.k !== 'sp');
  if (words.length && words.every((t) => t.k === 'name')) {
    const txt = f.trim().split(/\s+/);
    const known = txt.every((w) => names.has(w) || /^(TRUE|FALSE)$/i.test(w));
    if (!known) return { ok: false, reason: 'texte sans référence ni fonction' };
  }
  // French names without « ; » (SOMME(A1:A3)) — accepted by the grammar, refused by Excel (#NAME?) → translated
  if (toks.some((t) => t.k === 'func' && FR_FUNCS[t.name] && FR_FUNCS[t.name] !== t.name)) f = frenchToEnglish(f);
  const withPrefix = prefixXlfn(f);
  if (withPrefix !== formula) return { ok: true, fixed: withPrefix };
  return { ok: true };
}
