// Cost before the call (from the pricing the provider announced) + Cost Governor (modes, hard cap per production).
// An unknown or ambiguous price format is reported as « estimation incertaine » with its formula, never invented.
import type { MediaModel, ImagePrice } from './capabilities';
import type { CostMode } from './types';

export interface Estimate {
  /** null when the format cannot be priced. */
  usd: number | null;
  certain: boolean;
  formula: string;
}
const price = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// ───────── image ─────────
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
export function estimateImage(m: MediaModel, o: { n?: number; resolution?: string }): Estimate {
  const n = o.n ?? 1;
  const prices = m.pricing.image;
  if (!prices) return { usd: null, certain: false, formula: 'prix par endpoint non chargé' };
  const out = prices.filter((p) => p.billable === 'output_image');
  if (!out.length) return { usd: null, certain: false, formula: 'aucun prix de sortie annoncé' };
  if (out.every((p) => p.usd === 0)) return { usd: 0, certain: true, formula: 'modèle gratuit (0 $)' };
  const perImage = out.filter((p) => p.unit === 'image');
  if (perImage.length) {
    let chosen: ImagePrice | undefined;
    if (perImage.some((p) => p.variant)) {
      chosen = o.resolution
        ? perImage.find((p) => p.variant && norm(p.variant) === norm(o.resolution!))
        : undefined;
      if (!chosen) {
        const max = Math.max(...perImage.map((p) => p.usd));
        return {
          usd: max * n,
          certain: false,
          formula: `${n} × ${max} $ (variante de résolution ${o.resolution ?? '?'} non reconnue : plus haut tarif retenu)`,
        };
      }
    } else chosen = perImage[0];
    return {
      usd: chosen!.usd * n,
      certain: true,
      formula: `${n} × ${chosen!.usd} $ / image${chosen!.variant ? ` (${chosen!.variant})` : ''}`,
    };
  }
  const unit = out[0]!.unit;
  return {
    usd: null,
    certain: false,
    formula: `facturation à l’unité « ${unit} » (${out[0]!.usd} $) : le nombre d’unités consommées n’est connu qu’après l’appel`,
  };
}

// ───────── video ─────────
export interface VideoCostInput {
  duration: number;
  resolution?: string;
  audio?: boolean;
  mode?: 'text' | 'image';
}
export function estimateVideo(m: MediaModel, o: VideoCostInput): Estimate {
  const skus = m.pricing.skus ?? {};
  const keys = Object.keys(skus);
  if (!keys.length) return { usd: null, certain: false, formula: 'pricing_skus absent' };
  const res = o.resolution?.toLowerCase();
  const min = price(skus.minimum_cents_per_generation);
  const floor = min !== null ? min / 100 : 0;
  const withAudio = o.audio ? 'with_audio' : 'without_audio';
  const cands: [string, number][] = [];
  const tryKeys = (list: string[], mult = 1) => {
    for (const k of list) if (k in skus && price(skus[k]) !== null) cands.push([k, price(skus[k])! * mult]);
  };
  if (res) {
    tryKeys(
      [
        `${o.mode === 'image' ? 'image_to_video' : 'text_to_video'}_duration_seconds_${res}`,
        `duration_seconds_${withAudio}_${res}`,
        `duration_seconds_${res}`,
        `cents_per_second_output_${res}`,
        `cents_per_video_output_second_${res}`,
      ].filter((k) => !k.startsWith('cents')),
    );
    for (const k of [`cents_per_second_output_${res}`, `cents_per_video_output_second_${res}`])
      if (k in skus && price(skus[k]) !== null) cands.push([k, price(skus[k])! / 100]);
  }
  tryKeys([`duration_seconds_${withAudio}`, 'duration_seconds']);
  if ('cents_per_second_output' in skus && price(skus.cents_per_second_output) !== null)
    cands.push(['cents_per_second_output', price(skus.cents_per_second_output)! / 100]);
  if (cands.length) {
    const [k, p] = cands[0]!;
    const usd = Math.max(floor, p * o.duration);
    return {
      usd,
      certain: true,
      formula: `${o.duration} s × ${p} $/s (${k})${floor ? `, minimum ${floor} $` : ''}`,
    };
  }
  const tok = keys.filter((k) => k.startsWith('video_tokens'));
  if (tok.length)
    return {
      usd: null,
      certain: false,
      formula: `facturation en jetons vidéo (${tok.map((k) => `${k}=${skus[k]}`).join(', ')}) : le nombre de jetons dépend de la résolution et de la durée, connu après l’appel`,
    };
  return { usd: null, certain: false, formula: `format de prix non reconnu : ${keys.join(', ')}` };
}

// ───────── speech ─────────
/** Speech is billed per input token; tokens ≈ characters / 4 (an approximation: flagged as uncertain unless free). */
export function estimateSpeech(m: MediaModel, chars: number): Estimate {
  const p = m.pricing.tokenPrices;
  if (!p) return { usd: null, certain: false, formula: 'prix absent' };
  if (p.prompt === 0 && p.completion === 0) return { usd: 0, certain: true, formula: 'modèle gratuit (0 $)' };
  const tokens = Math.ceil(chars / 4);
  const note = p.completion > 0 ? ` + sortie audio facturée à ${p.completion} $/jeton (non prévisible)` : '';
  return {
    usd: tokens * p.prompt,
    certain: false,
    formula: `≈ ${tokens} jetons × ${p.prompt} $${note}`,
  };
}

// ───────── governor ─────────
export interface GovernorState {
  mode: CostMode;
  /** Hard cap per production, USD. Only the owner changes it. */
  cap: number;
  spent: number;
}
export interface GovernorDecision {
  allowed: boolean;
  needsConfirmation: boolean;
  /** Blocked because it would exceed the cap. */
  blocked: boolean;
  reason: string;
  projected: number | null;
}
/** Every call goes through here. A call that would exceed the cap is blocked until the owner confirms it explicitly. */
export function checkBudget(s: GovernorState, est: Estimate, confirmed = false): GovernorDecision {
  const projected = est.usd === null ? null : s.spent + est.usd;
  if (est.usd !== null && projected! > s.cap + 1e-12 && !confirmed)
    return {
      allowed: false,
      blocked: true,
      needsConfirmation: true,
      projected,
      reason: `PLAFOND : ${s.spent.toFixed(4)} $ déjà dépensés + ${est.usd.toFixed(4)} $ > plafond ${s.cap.toFixed(2)} $. Confirmation explicite requise.`,
    };
  if (est.usd === null && !est.certain && !confirmed)
    return {
      allowed: false,
      blocked: false,
      needsConfirmation: true,
      projected,
      reason: `estimation incertaine — ${est.formula}. Confirmation requise.`,
    };
  if (
    !est.certain &&
    !confirmed &&
    est.usd !== null &&
    est.usd > 0 &&
    s.mode === 'ECO' &&
    projected! > s.cap * 0.8
  )
    return {
      allowed: false,
      blocked: false,
      needsConfirmation: true,
      projected,
      reason: `estimation incertaine proche du plafond (${projected!.toFixed(4)} $ / ${s.cap.toFixed(2)} $). Confirmation requise.`,
    };
  return { allowed: true, blocked: false, needsConfirmation: false, projected, reason: 'dans le plafond' };
}

export interface Candidate {
  model: MediaModel;
  estimate: Estimate;
  /** Measured evidence for this model on this combination (null = none). */
  history: {
    n: number;
    quality: number | null;
    successRate: number | null;
    champion: boolean;
    confidence: string;
  } | null;
}
export interface Pick {
  model: MediaModel | null;
  order: Candidate[];
  explain: string[];
}
const costKey = (c: Candidate) => (c.estimate.usd === null ? Number.POSITIVE_INFINITY : c.estimate.usd);
/**
 * Selection by capability, never by a hard-coded name:
 * ECO → cheapest certain price (a validated champion wins ties and may be ≤ 25 % dearer);
 * QUALITY → measured quality when n is sufficient, else champion, else price as the only objective signal (labelled);
 * PREMIUM → champion first, then the highest announced price as a proxy (labelled — never "best" without evidence);
 * BALANCED / AUTOPILOT → champion, else cheapest.
 */
export function pickModel(cands: Candidate[], mode: CostMode): Pick {
  const explain: string[] = [];
  if (!cands.length)
    return { model: null, order: [], explain: ['aucun candidat compatible dans les capacités découvertes'] };
  const champ = cands.filter((c) => c.history?.champion);
  const byCost = [...cands].sort((a, b) => costKey(a) - costKey(b) || a.model.id.localeCompare(b.model.id));
  let order: Candidate[];
  if (mode === 'ECO') {
    const cheapest = byCost[0]!;
    const c0 = champ.sort((a, b) => costKey(a) - costKey(b))[0];
    if (c0 && costKey(c0) <= costKey(cheapest) * 1.25 + 1e-9) {
      order = [c0, ...byCost.filter((c) => c !== c0)];
      explain.push(`ECO : champion validé ${c0.model.id} (coût ≤ cheapest × 1,25)`);
    } else {
      order = byCost;
      explain.push(`ECO : modèle le moins cher dont le prix est connu en premier (${cheapest.model.id})`);
    }
  } else if (mode === 'QUALITY') {
    const measured = cands
      .filter((c) => c.history && c.history.n >= 20 && c.history.quality !== null)
      .sort((a, b) => b.history!.quality! - a.history!.quality!);
    if (measured.length) {
      order = [...measured, ...byCost.filter((c) => !measured.includes(c))];
      explain.push(`QUALITY : meilleure qualité MESURÉE (n ≥ 20) : ${measured[0]!.model.id}`);
    } else if (champ.length) {
      order = [...champ, ...byCost.filter((c) => !champ.includes(c))];
      explain.push('QUALITY : aucun échantillon suffisant ; champion validé en tête');
    } else {
      order = [...byCost]
        .reverse()
        .filter((c) => c.estimate.usd !== null)
        .concat(byCost.filter((c) => c.estimate.usd === null));
      explain.push('QUALITY : aucune qualité mesurée — le prix annoncé sert de seul indice (non prouvé)');
    }
  } else if (mode === 'PREMIUM') {
    const rest = [...byCost].reverse();
    order = [...champ, ...rest.filter((c) => !champ.includes(c))];
    explain.push(
      'PREMIUM : champion validé puis modèle le plus cher annoncé (indice de prix, non une preuve de qualité)',
    );
  } else {
    order = [...champ.sort((a, b) => costKey(a) - costKey(b)), ...byCost.filter((c) => !champ.includes(c))];
    explain.push(
      champ.length
        ? `${mode} : champion validé en premier`
        : `${mode} : aucun champion — moins cher en premier`,
    );
  }
  return { model: order[0]!.model, order, explain };
}
