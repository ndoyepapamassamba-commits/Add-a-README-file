// JEV COGNITIVE OS — DISAGREEMENT LOCALIZATION and ADAPTIVE COUNCIL.
// When two answers differ, JEV finds WHERE (which claim, which number) and asks a targeted question about that point only,
// instead of starting the whole mission again.
export interface DisagreementPoint {
  kind: 'number' | 'claim';
  a: string;
  b: string;
  context: string;
}
export interface DisagreementReport {
  agreement: number;
  points: DisagreementPoint[];
  /** The two answers agree on everything checked. */
  converged: boolean;
  verifyPrompt: string | null;
}
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s.,%-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const sents = (t: string) =>
  t
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
const nums = (s: string) =>
  (s.match(/-?\d[\d\s]*(?:[.,]\d+)?\s?%?/g) ?? [])
    .map((x) => x.replace(/\s/g, '').replace(',', '.'))
    .filter((x) => x.length > 0);
const words = (s: string) =>
  new Set(
    norm(s)
      .split(' ')
      .filter((w) => w.length > 3),
  );
const jacc = (a: Set<string>, b: Set<string>) => {
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return a.size + b.size - i ? i / (a.size + b.size - i) : 1;
};
/** Aligns each sentence of A with its closest sentence of B; differing numbers or unmatched claims are the disagreement points. */
export function localizeDisagreement(a: string, b: string): DisagreementReport {
  const A = sents(a);
  const B = sents(b);
  const points: DisagreementPoint[] = [];
  let agree = 0;
  const usedB = new Set<number>();
  for (const sa of A) {
    let best = -1;
    let bs = 0;
    B.forEach((sb, j) => {
      const s = jacc(words(sa), words(sb));
      if (s > bs && !usedB.has(j)) {
        bs = s;
        best = j;
      }
    });
    if (best < 0 || bs < 0.35) {
      points.push({
        kind: 'claim',
        a: sa.slice(0, 160),
        b: '',
        context: 'affirmation absente de l’autre réponse',
      });
      continue;
    }
    usedB.add(best);
    const na = nums(sa);
    const nb = nums(B[best]!);
    const diff = na.filter((x) => !nb.includes(x)).concat(nb.filter((x) => !na.includes(x)));
    if (diff.length)
      points.push({ kind: 'number', a: na.join(' ; '), b: nb.join(' ; '), context: sa.slice(0, 120) });
    else agree++;
  }
  B.forEach((sb, j) => {
    if (!usedB.has(j))
      points.push({
        kind: 'claim',
        a: '',
        b: sb.slice(0, 160),
        context: 'affirmation absente de la première réponse',
      });
  });
  const total = Math.max(1, A.length + B.filter((_, j) => !usedB.has(j)).length);
  const agreement = agree / total;
  const numeric = points.filter((p) => p.kind === 'number').slice(0, 3);
  const verifyPrompt = points.length
    ? `Deux réponses divergent sur ${points.length} point(s). Vérifie UNIQUEMENT : ${points
        .slice(0, 4)
        .map((p) =>
          p.kind === 'number'
            ? `« ${p.context} » (valeurs : ${p.a} vs ${p.b})`
            : `« ${(p.a || p.b).slice(0, 100)} »`,
        )
        .join(' ; ')}. Réponds par point : correct / incorrect + la valeur juste.`
    : null;
  void numeric;
  return { agreement, points, converged: points.length === 0, verifyPrompt };
}

export type CouncilSize = 1 | 2 | 3;
/** How many models are worth calling: 1 unless the stakes and the expected disagreement justify more. */
export function adaptiveCouncil(o: {
  risk: 'low' | 'normal' | 'high';
  ambiguity: number;
  difficulty: number;
  historicalVariance: number | null;
  criticalDeliverable?: boolean;
}): { size: CouncilSize; why: string } {
  if (o.risk === 'low' && o.difficulty < 0.55)
    return { size: 1, why: 'enjeu faible : un seul modèle suffit' };
  const v = o.historicalVariance;
  if (o.risk === 'high' && (o.criticalDeliverable || (v !== null && v >= 12)))
    return {
      size: 3,
      why:
        v !== null && v >= 12
          ? `forte variance historique entre modèles (${v.toFixed(0)} pts) et enjeu élevé`
          : 'livrable critique',
    };
  if (o.risk === 'high' || (v !== null && v >= 8) || o.ambiguity >= 0.6)
    return { size: 2, why: 'enjeu élevé ou désaccord probable : un second avis ciblé' };
  return { size: 1, why: 'aucun signe de désaccord probable' };
}
