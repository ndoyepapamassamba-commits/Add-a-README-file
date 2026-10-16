/**
 * Temps et cadence : conversion image ↔ temps sans dérive, timecode, sous-instants d'obturation (flou de bougé
 * exact). L'image `n` tombe toujours à `t = n / fps` : on ne cumule jamais de pas de temps.
 */

/** Tolérance pour absorber les erreurs d'arrondi flottant (t·fps = 2,9999999 → image 3). */
const EPS_IMAGE = 1e-6;

/** Vérifie qu'une cadence est utilisable. */
export function verifierFps(fps: number): void {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error(`Cadence invalide : ${fps} i/s`);
}

/** Instant (s) de l'image `n`. */
export function imageVersTemps(n: number, fps: number): number {
  verifierFps(fps);
  return n / fps;
}

/**
 * Image qui contient l'instant `t` (`floor`), robuste aux arrondis : `tempsVersImage(imageVersTemps(n)) === n`.
 * `mode: 'proche'` renvoie l'image la plus proche.
 */
export function tempsVersImage(t: number, fps: number, mode: 'plancher' | 'proche' = 'plancher'): number {
  verifierFps(fps);
  const x = t * fps;
  return mode === 'proche' ? Math.round(x) : Math.floor(x + EPS_IMAGE);
}

/** Nombre d'images pour couvrir `duree` secondes (`[0, duree[`). */
export function nombreImages(duree: number, fps: number): number {
  verifierFps(fps);
  return Math.max(0, Math.ceil(duree * fps - EPS_IMAGE));
}

/** Liste des instants des images `[0, nombreImages(duree)[`. */
export function instantsImages(duree: number, fps: number): number[] {
  const n = nombreImages(duree, fps);
  const r = new Array<number>(n);
  for (let i = 0; i < n; i++) r[i] = i / fps;
  return r;
}

/**
 * Sous-instants d'obturation de l'image commençant à `t` : `t + k·Δt/N`, `k = 0 … N−1`, avec
 * `Δt = obturateur / fps`. Le premier sous-instant est `t` lui-même (N = 1 → aucune moyenne).
 * Si `limite` est donnée (plan actif `[debut, fin[`), les sous-instants qui en sortent sont ramenés juste avant
 * `fin` : on ne mélange jamais deux plans de part et d'autre d'une coupe.
 */
export function sousInstants(
  t: number,
  fps: number,
  n: number,
  obturateur: number,
  limite?: { debut: number; fin: number },
): number[] {
  verifierFps(fps);
  const N = Math.max(1, Math.floor(n));
  const dt = Math.max(0, obturateur) / fps;
  const r: number[] = [];
  for (let k = 0; k < N; k++) {
    let tk = t + (k * dt) / N;
    if (limite) {
      const finMax = limite.fin - 1e-9;
      if (tk > finMax) tk = Math.max(limite.debut, finMax);
      if (tk < limite.debut) tk = limite.debut;
    }
    r.push(tk);
  }
  return r;
}

/** Timecode `HH:MM:SS:II` (II = image dans la seconde) de l'instant `t`. */
export function timecode(t: number, fps: number): string {
  verifierFps(fps);
  const fpsEntier = Math.round(fps);
  const total = tempsVersImage(Math.max(0, t), fps);
  const ii = total % fpsEntier;
  const sTotal = Math.floor(total / fpsEntier);
  const ss = sTotal % 60;
  const mm = Math.floor(sTotal / 60) % 60;
  const hh = Math.floor(sTotal / 3600);
  const p2 = (x: number) => String(x).padStart(2, '0');
  return `${p2(hh)}:${p2(mm)}:${p2(ss)}:${p2(ii)}`;
}

/** Lit un timecode `HH:MM:SS:II` (ou `MM:SS:II`, `SS:II`) et renvoie l'instant (s). */
export function lireTimecode(tc: string, fps: number): number {
  verifierFps(fps);
  const parties = tc.split(':').map((x) => Number.parseInt(x, 10));
  if (parties.length < 2 || parties.some((x) => !Number.isFinite(x) || x < 0)) {
    throw new Error(`Timecode illisible : « ${tc} »`);
  }
  const ii = parties.pop()!;
  let s = 0;
  for (const p of parties) s = s * 60 + p;
  return imageVersTemps(s * Math.round(fps) + ii, fps);
}

/** Formatage lisible `m:ss.mmm` (journaux, rapports). */
export function formaterDuree(t: number): string {
  const signe = t < 0 ? '-' : '';
  const a = Math.abs(t);
  const m = Math.floor(a / 60);
  const s = a - m * 60;
  return `${signe}${m}:${s.toFixed(3).padStart(6, '0')}`;
}
