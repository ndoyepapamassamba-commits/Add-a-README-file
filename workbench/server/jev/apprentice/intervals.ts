// Dependency-free interval mathematics (no imports): shared by supremacy.ts and stats.ts.
export const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
export const median = (xs: number[]): number | null => percentile(xs, 0.5);
/** Sample standard deviation (n − 1); null for n < 2. */
export function stdDev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
/** Linear-interpolation percentile (p in 0–1). */
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
}

/** Inverse of the standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
export function zOf(p: number): number {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1,
    2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p > 1 - lo) return -zOf(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
  );
}
const T975: Record<number, number> = {
  1: 12.706,
  2: 4.303,
  3: 3.182,
  4: 2.776,
  5: 2.571,
  6: 2.447,
  7: 2.365,
  8: 2.306,
  9: 2.262,
  10: 2.228,
  11: 2.201,
  12: 2.179,
  13: 2.16,
  14: 2.145,
  15: 2.131,
  16: 2.12,
  17: 2.11,
  18: 2.101,
  19: 2.093,
  20: 2.086,
  25: 2.06,
  30: 2.042,
};
/** Two-sided Student t critical value: exact table at 95 %, Cornish–Fisher expansion otherwise (df ≥ 3). */
export function tCritical(df: number, conf = 0.95): number {
  const d = Math.max(1, Math.floor(df));
  if (Math.abs(conf - 0.95) < 1e-9 && T975[d]) return T975[d]!;
  const z = zOf(1 - (1 - conf) / 2);
  if (d < 3) return d === 1 ? z * 6.5 : z * 2.2; // coarse, conservative for df 1–2
  const z3 = z ** 3;
  const z5 = z ** 5;
  return (
    z +
    (z3 + z) / (4 * d) +
    (5 * z5 + 16 * z3 + 3 * z) / (96 * d ** 2) +
    (3 * z ** 7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * d ** 3)
  );
}

export interface Interval {
  value: number;
  lo: number;
  hi: number;
  n: number;
}
/** Wilson score interval for a proportion (well behaved for small n and extreme rates). */
export function wilson(k: number, n: number, conf = 0.95): Interval | null {
  if (n <= 0) return null;
  const z = zOf(1 - (1 - conf) / 2);
  const p = k / n;
  const den = 1 + z ** 2 / n;
  const centre = (p + z ** 2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z ** 2 / (4 * n ** 2))) / den;
  return { value: p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half), n };
}
/** Confidence interval of a mean (Student t); null for n < 2. */
export function meanCI(xs: number[], conf = 0.95): Interval | null {
  const n = xs.length;
  const sd = stdDev(xs);
  if (n < 2 || sd === null) return null;
  const m = mean(xs)!;
  const h = tCritical(n - 1, conf) * (sd / Math.sqrt(n));
  return { value: m, lo: m - h, hi: m + h, n };
}
/** Welch's difference of means b − a with its interval (unequal variances). */
