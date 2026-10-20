// RÉFLEXES JEV (v63 — « donne à JEV des capacités jamais explorées dans l'app pour plus d'efficacité ») : des demandes
// précises reçoivent leur réponse de JEV LUI-MÊME, par ses outils gratuits, sans aucun modèle de langage — 0 jeton,
// moins d'une seconde, sources jointes. Le motif est STRICT (phrase courte, forme reconnue) : au moindre doute, la demande
// suit le chemin normal du modèle. Partie pure (testée) : reconnaître la demande et mettre la réponse en forme.

export type Reflex =
  | { kind: 'fx'; amount: number | null; from: string; to: string }
  | { kind: 'entity'; name: string; facet: 'fiche' | 'siège' | 'maison mère' | 'création' }
  | { kind: 'definition'; term: string };

/** ECB reference currencies (Frankfurter) + the CFA francs (fixed parity). */
export const ECB_CCY = new Set('EUR USD JPY BGN CZK DKK GBP HUF PLN RON SEK CHF ISK NOK TRY AUD BRL CAD CNY HKD IDR ILS INR KRW MXN MYR NZD PHP SGD THB ZAR XOF XAF'.split(' '));
const CCY_WORDS: [RegExp, string][] = [
  [/^(euros?|eur|€)$/i, 'EUR'],
  [/^(dollars?( am[ée]ricains?| us)?|usd|\$)$/i, 'USD'],
  [/^(f ?cfa|francs? cfa|xof|cfa)$/i, 'XOF'],
  [/^(xaf|francs? cfa cemac)$/i, 'XAF'],
  [/^(livres?( sterling)?|gbp|£)$/i, 'GBP'],
  [/^(yens?|jpy)$/i, 'JPY'],
  [/^(yuans?|renminbi|cny)$/i, 'CNY'],
  [/^(francs? suisses?|chf)$/i, 'CHF'],
  [/^(dollars? canadiens?|cad)$/i, 'CAD'],
  [/^(rands?|zar)$/i, 'ZAR'],
  [/^(roupies?( indiennes?)?|inr)$/i, 'INR'],
  [/^(livres? turques?|try)$/i, 'TRY'],
];
export function currencyOf(word: string): string | null {
  const w = word.trim().replace(/[.,;!?]+$/, '');
  for (const [rx, c] of CCY_WORDS) if (rx.test(w)) return c;
  const up = w.toUpperCase();
  return /^[A-Z]{3}$/.test(up) && ECB_CCY.has(up) ? up : null;
}
const num = (s: string) => Number(s.replace(/\s/g, '').replace(/,(\d{1,2})$/, '.$1').replace(/,/g, ''));
const CCY = String.raw`(euros?|eur|€|dollars?(?: am[ée]ricains?| us| canadiens?)?|usd|\$|f ?cfa|francs? cfa(?: cemac)?|francs? suisses?|xof|xaf|cfa|livres?(?: sterling| turques?)?|gbp|£|yens?|jpy|yuans?|renminbi|cny|chf|cad|rands?|zar|roupies?(?: indiennes?)?|inr|try|[a-z]{3})`;

/** Recognises a reflex request; null = let the model answer. */
export function parseReflex(raw: string): Reflex | null {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (!t || t.length > 140 || /\n/.test(raw.trim())) return null;
  // « convertis 1 500 euros en FCFA », « 100 USD en XOF », « combien font 250 000 FCFA en dollars ? »
  let m = new RegExp(String.raw`^(?:convertis|convertir|conversion de|combien (?:font|fait|valent|vaut)|change)?\s*([\d][\d\s.,]*)\s*${CCY}\s+(?:en|vers|in|to)\s+${CCY}\s*\??$`, 'i').exec(t);
  if (m) {
    const from = currencyOf(m[2]!);
    const to = currencyOf(m[3]!);
    const amount = num(m[1]!);
    if (from && to && from !== to && Number.isFinite(amount) && amount > 0) return { kind: 'fx', amount, from, to };
  }
  // « taux EUR/USD », « taux de change euro dollar », « cours du dollar en euros »
  m = new RegExp(String.raw`^(?:quel est le |donne(?:-moi)? le )?(?:taux(?: de change)?|cours)(?: (?:du|de l'|de la|des|de))?\s*${CCY}\s*(?:\/|en|contre|vers|-|à)?\s*${CCY}\s*(?:aujourd'hui|du jour|actuel)?\s*\??$`, 'i').exec(t);
  if (m) {
    const from = currencyOf(m[1]!);
    const to = currencyOf(m[2]!);
    if (from && to && from !== to) return { kind: 'fx', amount: null, from, to };
  }
  // « fiche de Ecobank », « fiche entité BOAD », « où est le siège de Sonatel ? », « maison mère de Coris Bank »
  m = /^(?:fiche(?: d['’]identit[ée]| entit[ée])?|carte d['’]identit[ée])\s+(?:de la |de l['’]|de |d['’]|du |sur la |sur |des )?(.{2,60}?)\s*\??$/i.exec(t);
  if (m) return { kind: 'entity', name: m[1]!, facet: 'fiche' };
  m = /^(?:o[ùu] (?:est|se trouve) le|quel est le) si[èe]ge (?:social )?(?:de la |de l['’]|de |d['’]|du )(.{2,60}?)\s*\??$/i.exec(t);
  if (m) return { kind: 'entity', name: m[1]!, facet: 'siège' };
  m = /^(?:quelle est la |qui est la )?(?:maison m[èe]re|soci[ée]t[ée] m[èe]re|groupe) (?:de la |de l['’]|de |d['’]|du )(.{2,60}?)\s*\??$/i.exec(t);
  if (m) return { kind: 'entity', name: m[1]!, facet: 'maison mère' };
  m = /^(?:quand a [ée]t[ée] cr[ée][ée]e?|date de cr[ée]ation (?:de la |de l['’]|de |d['’]|du ))\s*(.{2,60}?)\s*\??$/i.exec(t);
  if (m) return { kind: 'entity', name: m[1]!, facet: 'création' };
  // « définition de liquidité », « définis l'inflation » (explicit « définition » only — no guess on « c'est quoi »)
  m = /^(?:d[ée]finition (?:de la |de l['’]|de |d['’]|du |des )?|d[ée]finis (?:le |la |l['’]|les )?)(.{2,50}?)\s*\??$/i.exec(t);
  if (m && m[1]!.split(/\s+/).length <= 5) return { kind: 'definition', term: m[1]! };
  return null;
}

const fmt = (x: number, d = 2) => x.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: x < 10 ? Math.min(d, 4) : 0 });
/** The answer to an FX reflex from ECB rates for 1 `from` (r[to] = units of `to` per 1 `from`). */
export function fxAnswer(r: { from: string; to: string; amount: number | null; rate: number; date: string; derived: boolean }): string {
  const line = r.amount !== null ? `**${fmt(r.amount)} ${r.from} = ${fmt(r.amount * r.rate)} ${r.to}**` : `**1 ${r.from} = ${fmt(r.rate, 6)} ${r.to}**`;
  const inv = r.rate ? `1 ${r.to} = ${fmt(1 / r.rate, 6)} ${r.from}` : '';
  return `${line}\n\nTaux de référence de la BCE au ${r.date}${inv ? ` (soit ${inv})` : ''}${r.derived ? ' ; franc CFA par la parité fixe 1 EUR = 655,957 F CFA' : ''}.\n\n_Réponse directe de JEV : aucun modèle appelé, 0 $. Source : Banque centrale européenne (via Frankfurter)._`;
}
