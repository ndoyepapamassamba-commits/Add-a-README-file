// JEV-0 local skills: exact, deterministic answers computed without any model call (0 $).
// Every matcher is anchored on the WHOLE message: any extra context, ambiguity or unknown unit returns null and the
// request goes to the normal routing. A model is never asked to do arithmetic that code does exactly.
export interface LocalAnswer {
  skill: string;
  label: string;
  answer: string;
}
export interface LocalSkillInfo {
  id: string;
  label: string;
  examples: string[];
}
export const LOCAL_SKILLS: LocalSkillInfo[] = [
  {
    id: 'percent',
    label: 'Pourcentages',
    examples: [
      '20% de 1500',
      'augmente 1200 de 18%',
      '30 représente quel pourcentage de 120',
      'variation entre 80 et 100',
    ],
  },
  {
    id: 'units',
    label: 'Conversions d’unités',
    examples: ['12 km en miles', '70 kg en lb', '98,6 F en C', '3 h en min'],
  },
  {
    id: 'dates',
    label: 'Calcul de dates',
    examples: [
      'dans 45 jours',
      'il y a 3 mois',
      'combien de jours entre 2026-01-01 et 2026-03-15',
      'quel jour était le 04/07/2026',
    ],
  },
  {
    id: 'loan',
    label: 'Mensualité et intérêts composés',
    examples: ['mensualité 10000000 à 8% sur 5 ans', 'intérêts composés 1000 à 5% sur 10 ans'],
  },
  {
    id: 'text',
    label: 'Statistiques de texte',
    examples: ['combien de mots dans « bonjour tout le monde »'],
  },
  { id: 'base', label: 'Bases numériques', examples: ['255 en binaire', '0xFF en décimal'] },
  { id: 'json', label: 'Validation / mise en forme JSON', examples: ['formate ce json {"a":1}'] },
];

const NUM = String.raw`-?\d[\d\s .,]*`;
/** « 1 500,5 » · « 1.500 » · « 1,500.25 » → number (null when ambiguous / not a number). */
export function parseNum(raw: string): number | null {
  const s = raw.replace(/[\s ]/g, '');
  if (!/^-?\d[\d.,]*$/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastCom = s.lastIndexOf(',');
  let t = s;
  if (lastDot >= 0 && lastCom >= 0) {
    const dec = lastDot > lastCom ? '.' : ',';
    t = s.split(dec === '.' ? ',' : '.').join('');
    if (dec === ',') t = t.replace(',', '.');
  } else if (lastCom >= 0) {
    if ((s.match(/,/g) ?? []).length > 1) return null;
    t = s.replace(',', '.');
  } else if (lastDot >= 0) {
    if ((s.match(/\./g) ?? []).length > 1 || /^-?\d{1,3}(\.\d{3})+$/.test(s)) t = s.replace(/\./g, '');
  }
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
const fmt = (n: number, max = 6) =>
  Number(n.toPrecision(12)).toLocaleString('fr-FR', { maximumFractionDigits: max });
const out = (skill: string, label: string, body: string): LocalAnswer => ({
  skill,
  label,
  answer: `${body}\n\n_JEV-0 · compétence « ${label} » : résultat exact calculé localement, sans appel de modèle (0 $)._`,
});
const clean = (t: string) =>
  t
    .trim()
    .replace(/[?？!.]+$/, '')
    .trim();

// ───────── percentages ─────────
function percent(t: string): LocalAnswer | null {
  let m = new RegExp(
    String.raw`^(?:combien font |calcule[rz]? )?(${NUM})\s*%\s*(?:de|of|d')\s*(${NUM})$`,
    'i',
  ).exec(t);
  if (m) {
    const p = parseNum(m[1]!);
    const x = parseNum(m[2]!);
    if (p !== null && x !== null)
      return out('percent', 'Pourcentages', `${fmt(p)} % de ${fmt(x)} = **${fmt((x * p) / 100)}**`);
  }
  m = new RegExp(
    String.raw`^(augmente|majore|ajoute|diminue|réduis|reduis|retire|baisse)\s+(${NUM})\s+(?:de|d')\s*(${NUM})\s*%$`,
    'i',
  ).exec(t);
  if (m) {
    const n = parseNum(m[2]!);
    const p = parseNum(m[3]!);
    if (n !== null && p !== null) {
      const up = /^(augmente|majore|ajoute)$/i.test(m[1]!);
      const r = n * (1 + ((up ? 1 : -1) * p) / 100);
      return out('percent', 'Pourcentages', `${fmt(n)} ${up ? '+' : '−'} ${fmt(p)} % = **${fmt(r)}**`);
    }
  }
  m = new RegExp(
    String.raw`^(${NUM})\s+(?:représente|represente|est)\s+(?:quel|combien de)\s+(?:pourcentage|%|pour cent)\s+(?:de|d')\s*(${NUM})$`,
    'i',
  ).exec(t);
  if (m) {
    const a = parseNum(m[1]!);
    const b = parseNum(m[2]!);
    if (a !== null && b)
      return out('percent', 'Pourcentages', `${fmt(a)} / ${fmt(b)} = **${fmt((a / b) * 100)} %**`);
  }
  m = new RegExp(
    String.raw`^(?:variation|évolution|evolution)\s+(?:entre|de)\s+(${NUM})\s+(?:et|à|a)\s+(${NUM})$`,
    'i',
  ).exec(t);
  if (m) {
    const a = parseNum(m[1]!);
    const b = parseNum(m[2]!);
    if (a && b !== null)
      return out(
        'percent',
        'Pourcentages',
        `(${fmt(b)} − ${fmt(a)}) / ${fmt(a)} = **${fmt(((b - a) / a) * 100)} %**`,
      );
  }
  return null;
}

// ───────── units ─────────
type Dim = 'len' | 'mass' | 'vol' | 'time' | 'temp';
const UNITS: Record<string, { dim: Dim; f: number; name: string }> = {
  mm: { dim: 'len', f: 0.001, name: 'mm' },
  cm: { dim: 'len', f: 0.01, name: 'cm' },
  m: { dim: 'len', f: 1, name: 'm' },
  km: { dim: 'len', f: 1000, name: 'km' },
  in: { dim: 'len', f: 0.0254, name: 'pouces' },
  pouce: { dim: 'len', f: 0.0254, name: 'pouces' },
  pouces: { dim: 'len', f: 0.0254, name: 'pouces' },
  ft: { dim: 'len', f: 0.3048, name: 'pieds' },
  pied: { dim: 'len', f: 0.3048, name: 'pieds' },
  pieds: { dim: 'len', f: 0.3048, name: 'pieds' },
  yd: { dim: 'len', f: 0.9144, name: 'yards' },
  mi: { dim: 'len', f: 1609.344, name: 'miles' },
  mile: { dim: 'len', f: 1609.344, name: 'miles' },
  miles: { dim: 'len', f: 1609.344, name: 'miles' },
  mg: { dim: 'mass', f: 0.000001, name: 'mg' },
  g: { dim: 'mass', f: 0.001, name: 'g' },
  kg: { dim: 'mass', f: 1, name: 'kg' },
  t: { dim: 'mass', f: 1000, name: 't' },
  lb: { dim: 'mass', f: 0.45359237, name: 'lb' },
  lbs: { dim: 'mass', f: 0.45359237, name: 'lb' },
  livre: { dim: 'mass', f: 0.45359237, name: 'lb' },
  livres: { dim: 'mass', f: 0.45359237, name: 'lb' },
  oz: { dim: 'mass', f: 0.028349523125, name: 'oz' },
  ml: { dim: 'vol', f: 0.001, name: 'ml' },
  cl: { dim: 'vol', f: 0.01, name: 'cl' },
  l: { dim: 'vol', f: 1, name: 'L' },
  gal: { dim: 'vol', f: 3.785411784, name: 'gallons US' },
  gallon: { dim: 'vol', f: 3.785411784, name: 'gallons US' },
  gallons: { dim: 'vol', f: 3.785411784, name: 'gallons US' },
  s: { dim: 'time', f: 1, name: 's' },
  sec: { dim: 'time', f: 1, name: 's' },
  min: { dim: 'time', f: 60, name: 'min' },
  h: { dim: 'time', f: 3600, name: 'h' },
  j: { dim: 'time', f: 86400, name: 'jours' },
  jour: { dim: 'time', f: 86400, name: 'jours' },
  jours: { dim: 'time', f: 86400, name: 'jours' },
  sem: { dim: 'time', f: 604800, name: 'semaines' },
  semaine: { dim: 'time', f: 604800, name: 'semaines' },
  semaines: { dim: 'time', f: 604800, name: 'semaines' },
  c: { dim: 'temp', f: 1, name: '°C' },
  '°c': { dim: 'temp', f: 1, name: '°C' },
  f: { dim: 'temp', f: 1, name: '°F' },
  '°f': { dim: 'temp', f: 1, name: '°F' },
  k: { dim: 'temp', f: 1, name: 'K' },
};
const toC = (v: number, u: string) =>
  u === 'f' || u === '°f' ? ((v - 32) * 5) / 9 : u === 'k' ? v - 273.15 : v;
const fromC = (v: number, u: string) =>
  u === 'f' || u === '°f' ? (v * 9) / 5 + 32 : u === 'k' ? v + 273.15 : v;
function units(t: string): LocalAnswer | null {
  const m = new RegExp(
    String.raw`^(?:convertis?|convert|combien font)?\s*(${NUM})\s*(°?[a-zéû]+)\s+(?:en|to|vers|→)\s+(°?[a-zéû]+)$`,
    'i',
  ).exec(t);
  if (!m) return null;
  const v = parseNum(m[1]!);
  const a = m[2]!.toLowerCase();
  const b = m[3]!.toLowerCase();
  const ua = UNITS[a];
  const ub = UNITS[b];
  if (v === null || !ua || !ub || ua.dim !== ub.dim) return null;
  const r = ua.dim === 'temp' ? fromC(toC(v, a), b) : (v * ua.f) / ub.f;
  return out('units', 'Conversions d’unités', `${fmt(v)} ${ua.name} = **${fmt(r)} ${ub.name}**`);
}

// ───────── dates ─────────
function parseDate(s: string): Date | null {
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
  else if ((m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s)))
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])] as [number, number, number];
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}
const longDate = (d: Date) =>
  d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
function dates(t: string, now: Date): LocalAnswer | null {
  const L = 'Calcul de dates';
  let m = /^(?:combien de jours (?:y a-t-il )?entre|jours entre)\s+(\S+)\s+et\s+(\S+)$/i.exec(t);
  if (m) {
    const a = parseDate(m[1]!);
    const b = parseDate(m[2]!);
    if (a && b) {
      const n = Math.round((b.getTime() - a.getTime()) / 86_400_000);
      return out(
        'dates',
        L,
        `Entre le ${longDate(a)} et le ${longDate(b)} : **${fmt(Math.abs(n))} jour(s)**${n < 0 ? ' (la 2ᵉ date est antérieure)' : ''}.`,
      );
    }
  }
  m = /^quel jour (?:était|etait|est|sera)\s+le\s+(\S+)$/i.exec(t);
  if (m) {
    const d = parseDate(m[1]!);
    if (d) return out('dates', L, `Le ${m[1]} est un **${longDate(d)}**.`);
  }
  m = /^(dans|il y a)\s+(\d{1,4})\s+(jours?|semaines?|mois|ans?|années?|annees?)$/i.exec(t);
  if (m) {
    const n = Number(m[2]) * (m[1]!.toLowerCase() === 'dans' ? 1 : -1);
    const u = m[3]!.toLowerCase();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    if (u.startsWith('jour')) d.setUTCDate(d.getUTCDate() + n);
    else if (u.startsWith('semaine')) d.setUTCDate(d.getUTCDate() + 7 * n);
    else if (u === 'mois') d.setUTCMonth(d.getUTCMonth() + n);
    else d.setUTCFullYear(d.getUTCFullYear() + n);
    return out('dates', L, `${m[0]} → **${longDate(d)}** (à partir de la date de cet ordinateur).`);
  }
  return null;
}

// ───────── loans & compound interest ─────────
function loan(t: string): LocalAnswer | null {
  const L = 'Mensualité et intérêts composés';
  let m = new RegExp(
    String.raw`^mensualit[ée]s?\s+(?:de\s+)?(${NUM})\s*(?:[a-zA-Z€$]{0,5})\s*(?:à|a|au taux de)\s*(${NUM})\s*%\s*(?:sur|pendant)\s*(\d{1,3})\s*(ans?|mois)$`,
    'i',
  ).exec(t);
  if (m) {
    const P = parseNum(m[1]!);
    const rate = parseNum(m[2]!);
    const n = Number(m[3]) * (/^an/i.test(m[4]!) ? 12 : 1);
    if (P !== null && rate !== null && n > 0) {
      const r = rate / 100 / 12;
      const pmt = r === 0 ? P / n : (P * r) / (1 - (1 + r) ** -n);
      return out(
        'loan',
        L,
        `Prêt ${fmt(P)} à ${fmt(rate)} % sur ${n} mois (amortissement constant, taux annuel/12) :\n- Mensualité : **${fmt(pmt, 2)}**\n- Coût total des intérêts : **${fmt(pmt * n - P, 2)}**\n- Total remboursé : ${fmt(pmt * n, 2)}`,
      );
    }
  }
  m = new RegExp(
    String.raw`^int[ée]r[êe]ts? compos[ée]s?\s+(${NUM})\s*(?:[a-zA-Z€$]{0,5})\s*(?:à|a|au taux de)\s*(${NUM})\s*%\s*(?:sur|pendant)\s*(\d{1,3})\s*ans?$`,
    'i',
  ).exec(t);
  if (m) {
    const P = parseNum(m[1]!);
    const rate = parseNum(m[2]!);
    const y = Number(m[3]);
    if (P !== null && rate !== null) {
      const fv = P * (1 + rate / 100) ** y;
      return out(
        'loan',
        L,
        `${fmt(P)} à ${fmt(rate)} % composé annuellement pendant ${y} an(s) :\n- Capital final : **${fmt(fv, 2)}**\n- Intérêts cumulés : **${fmt(fv - P, 2)}**`,
      );
    }
  }
  return null;
}

// ───────── text statistics ─────────
function textStats(t: string): LocalAnswer | null {
  const m =
    /^combien de (mots|caractères|caracteres|lettres|lignes)(?: y a-t-il)?\s+(?:dans|contient|compte)\s+[«"“]([\s\S]+)[»"”]$/i.exec(
      t,
    );
  if (!m) return null;
  const s = m[2]!;
  const k = m[1]!.toLowerCase();
  const n =
    k === 'mots'
      ? (s.trim().match(/\S+/g) ?? []).length
      : k === 'lignes'
        ? s.split(/\r?\n/).length
        : k === 'lettres'
          ? (s.match(/\p{L}/gu) ?? []).length
          : [...s].length;
  return out('text', 'Statistiques de texte', `Le texte contient **${fmt(n)} ${k}**.`);
}

// ───────── numeric bases ─────────
function bases(t: string): LocalAnswer | null {
  let m = /^(?:convertis?\s+)?(\d{1,15})\s+en\s+(binaire|hexad[ée]cimal|hexa|octal)$/i.exec(t);
  if (m) {
    const n = Number(m[1]);
    const k = m[2]!.toLowerCase();
    const [b, name, pre] =
      k === 'binaire' ? [2, 'binaire', '0b'] : k === 'octal' ? [8, 'octal', '0o'] : [16, 'hexadécimal', '0x'];
    return out(
      'base',
      'Bases numériques',
      `${n} en ${name} = **${pre}${n.toString(b as number).toUpperCase()}**`,
    );
  }
  m = /^(?:convertis?\s+)?(0x[0-9a-f]{1,12}|0b[01]{1,48}|0o[0-7]{1,16})\s+en\s+d[ée]cimal$/i.exec(t);
  if (m) return out('base', 'Bases numériques', `${m[1]} = **${Number(m[1])}** en décimal`);
  return null;
}

// ───────── JSON ─────────
function json(text: string): LocalAnswer | null {
  const m =
    /^(?:formate|formater|valide|valider|vérifie|verifie|indente)\s+(?:ce\s+|le\s+)?json\s*:?\s*([\s\S]+)$/i.exec(
      text.trim(),
    );
  if (!m) return null;
  try {
    return out(
      'json',
      'Validation / mise en forme JSON',
      `JSON **valide**.\n\n\`\`\`json\n${JSON.stringify(JSON.parse(m[1]!), null, 2)}\n\`\`\``,
    );
  } catch (e) {
    return out('json', 'Validation / mise en forme JSON', `JSON **invalide** : ${(e as Error).message}`);
  }
}

/** First matching local skill, or null (→ normal routing). */
export function localSkill(text: string, now = new Date()): LocalAnswer | null {
  const j = json(text);
  if (j) return j;
  const t = clean(text);
  if (!t || t.length > 200) return null;
  return percent(t) ?? units(t) ?? dates(t, now) ?? loan(t) ?? textStats(clean(text.trim())) ?? bases(t);
}
