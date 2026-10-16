/**
 * Détourage par clé de couleur d'un personnage généré sur fond uni (gris clair, dégradé doux) :
 *
 * 1. modèle de fond lisse (polynôme du 2e degré par canal) ajusté sur les bords, puis affiné itérativement sur les
 *    pixels reconnus comme fond ;
 * 2. pixels « comme le fond » : proches du modèle, ou OMBRE PORTÉE (même teinte, plus sombre : `I ≈ k·B`,
 *    0,45 < k < 1) ;
 * 3. le fond est la région « comme le fond » CONNECTÉE au bord de l'image (remplissage) : les zones claires
 *    enfermées dans le personnage (blanc des yeux, reflets) restent au personnage ; les vides enfermés de la couleur
 *    du fond (entre le bras et le torse) sont rendus au fond ;
 * 4. alpha affiné sur la bande de bord (projection de `I − B` sur `F − B`, avec F estimé sur les voisins sûrs),
 *    couleur décontaminée `C = (I − (1 − α)·B)/α`, poussières retirées (plus grande composante gardée).
 *
 *   npx tsx src/outils/personnage-test/detourer.ts <image.png> <sortie.png> [--reference <alpha.png>]
 *
 * Avec `--reference`, compare le masque obtenu à un masque de référence (IoU).
 */
import { parseArgs } from 'node:util';
import { ecrirePNG, lirePNG } from '../../rig/charger';
import type { ImageRGBA } from '../../rig/maillage';

/** Réglages du détourage. */
export interface OptionsDetourage {
  /** Distance couleur (0–255) sous laquelle un pixel est « fond ». Défaut 14. */
  seuilFond?: number;
  /** Distance au-dessus de laquelle un pixel est sûrement « personnage ». Défaut 34. */
  seuilPersonnage?: number;
  /** Ratio d'assombrissement minimal d'une ombre portée (k). Défaut 0,45. */
  ombreMin?: number;
  /** Écart de teinte maximal d'une ombre (0–255). Défaut 9. */
  ecartTeinteOmbre?: number;
}

/** Résultat du détourage. */
export interface Detourage {
  image: ImageRGBA;
  /** Paramètres du modèle de fond (6 par canal). */
  fond: number[][];
  /** Fraction de pixels opaques (α ≥ 0,5). */
  fractionOpaque: number;
}

/** Résout un système linéaire 6×6 (Gauss avec pivot partiel). */
function resoudre(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((l, i) => [...l, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i]![c]!) > Math.abs(M[p]![c]!)) p = i;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const piv = M[c]![c]! || 1e-12;
    for (let i = 0; i < n; i++) {
      if (i === c) continue;
      const f = M[i]![c]! / piv;
      for (let k = c; k <= n; k++) M[i]![k] = M[i]![k]! - f * M[c]![k]!;
    }
  }
  return M.map((l, i) => l[n]! / l[i]!);
}

/** Détoure une image RGB(A) sur fond uni. */
export function detourer(source: ImageRGBA, options: OptionsDetourage = {}): Detourage {
  const { largeur: L, hauteur: H, donnees: d } = source;
  const n = L * H;
  const tFond = options.seuilFond ?? 14;
  const tPerso = options.seuilPersonnage ?? 34;
  const kMin = options.ombreMin ?? 0.45;
  const ecartOmbre = options.ecartTeinteOmbre ?? 9;
  const base = (x: number, y: number): number[] => {
    const u = x / L - 0.5;
    const v = y / H - 0.5;
    return [1, u, v, u * u, u * v, v * v];
  };
  // 1. Modèle de fond : ajustement initial sur une bande de bord, puis itérations.
  let estFond = new Uint8Array(n);
  const bande = Math.round(Math.min(L, H) * 0.02);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) if (x < bande || y < bande || x >= L - bande || y >= H - bande) estFond[y * L + x] = 1;
  let coeffs: number[][] = [[], [], []];
  const B = new Float32Array(3 * n);
  for (let iter = 0; iter < 4; iter++) {
    const AtA = Array.from({ length: 6 }, () => new Array(6).fill(0) as number[]);
    const Atb = [new Array(6).fill(0) as number[], new Array(6).fill(0) as number[], new Array(6).fill(0) as number[]];
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < L; x += 2) {
        const i = y * L + x;
        if (!estFond[i]) continue;
        const f = base(x, y);
        for (let a = 0; a < 6; a++) {
          for (let b = 0; b < 6; b++) AtA[a]![b] = AtA[a]![b]! + f[a]! * f[b]!;
          for (let c = 0; c < 3; c++) Atb[c]![a] = Atb[c]![a]! + f[a]! * d[4 * i + c]!;
        }
      }
    }
    for (let a = 0; a < 6; a++) AtA[a]![a] = AtA[a]![a]! + 1e-6;
    coeffs = [0, 1, 2].map((c) => resoudre(AtA, Atb[c]!));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < L; x++) {
        const f = base(x, y);
        for (let c = 0; c < 3; c++) {
          let s = 0;
          for (let a = 0; a < 6; a++) s += coeffs[c]![a]! * f[a]!;
          B[3 * (y * L + x) + c] = s;
        }
      }
    }
    const suivant = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const dr = d[4 * i]! - B[3 * i]!;
      const dg = d[4 * i + 1]! - B[3 * i + 1]!;
      const db = d[4 * i + 2]! - B[3 * i + 2]!;
      suivant[i] = Math.hypot(dr, dg, db) < tFond ? 1 : 0;
    }
    estFond = suivant;
  }
  // 2. Distance au fond, ombres comprises.
  const dist = new Float32Array(n);
  const commeFond = new Uint8Array(n);
  const ratio = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[4 * i]!;
    const g = d[4 * i + 1]!;
    const b = d[4 * i + 2]!;
    const br = B[3 * i]!;
    const bg = B[3 * i + 1]!;
    const bb = B[3 * i + 2]!;
    const k = (r * br + g * bg + b * bb) / (br * br + bg * bg + bb * bb);
    ratio[i] = k;
    const ecart = Math.hypot(r - k * br, g - k * bg, b - k * bb);
    const brute = Math.hypot(r - br, g - bg, b - bb);
    const ombre = k > kMin && k < 1.0 && ecart < ecartOmbre;
    dist[i] = ombre ? Math.min(brute, ecart * 1.5) : brute;
    commeFond[i] = dist[i]! < tFond ? 1 : 0;
  }
  // 3. Fond = région « comme le fond » connectée au bord.
  const fond = new Uint8Array(n);
  const pile: number[] = [];
  const pousser = (i: number): void => {
    if (!fond[i] && commeFond[i]) {
      fond[i] = 1;
      pile.push(i);
    }
  };
  for (let x = 0; x < L; x++) {
    pousser(x);
    pousser((H - 1) * L + x);
  }
  for (let y = 0; y < H; y++) {
    pousser(y * L);
    pousser(y * L + L - 1);
  }
  while (pile.length) {
    const i = pile.pop()!;
    const x = i % L;
    const y = (i - x) / L;
    if (x > 0) pousser(i - 1);
    if (x < L - 1) pousser(i + 1);
    if (y > 0) pousser(i - L);
    if (y < H - 1) pousser(i + L);
  }
  // Vides enfermés de la couleur du fond (k ≈ 1, pas plus clairs : ce ne sont pas des blancs d'yeux) → fond.
  const vu = new Uint8Array(n);
  for (let depart = 0; depart < n; depart++) {
    if (fond[depart] || vu[depart] || !commeFond[depart]) continue;
    const region: number[] = [];
    const q = [depart];
    vu[depart] = 1;
    let somK = 0;
    while (q.length) {
      const i = q.pop()!;
      region.push(i);
      somK += ratio[i]!;
      const x = i % L;
      const voisins = [x > 0 ? i - 1 : -1, x < L - 1 ? i + 1 : -1, i - L, i + L];
      for (const j of voisins) {
        if (j < 0 || j >= n || vu[j] || fond[j] || !commeFond[j]) continue;
        vu[j] = 1;
        q.push(j);
      }
    }
    const kMoyen = somK / region.length;
    if (region.length >= 60 && kMoyen > 0.93 && kMoyen < 1.03) for (const i of region) fond[i] = 1;
  }
  // 4. Alpha : sûr (1) loin du fond, 0 sur le fond, projection sur la bande de bord.
  // Seuls les pixels à moins de 2 px du fond (bande de bord) sont affinés : l'intérieur (blanc des yeux compris)
  // reste opaque, le fond transparent.
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) alpha[i] = fond[i] ? 0 : 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) {
      const i = y * L + x;
      if (fond[i]) continue;
      let pres = false;
      for (let dy = -2; dy <= 2 && !pres; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < L && yy < H && fond[yy * L + xx]) {
            pres = true;
            break;
          }
        }
      }
      if (pres && dist[i]! < 3 * tPerso) alpha[i] = -1; // −1 = à affiner
    }
  }
  const sortie = new Uint8Array(4 * n);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) {
      const i = y * L + x;
      let a = alpha[i]!;
      let F: [number, number, number] = [d[4 * i]!, d[4 * i + 1]!, d[4 * i + 2]!];
      if (a < 0) {
        // F estimé : moyenne des pixels sûrs du personnage à moins de 4 px.
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let sn = 0;
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= L || yy >= H) continue;
            const j = yy * L + xx;
            if (alpha[j] === 1) {
              sr += d[4 * j]!;
              sg += d[4 * j + 1]!;
              sb += d[4 * j + 2]!;
              sn++;
            }
          }
        }
        const br = B[3 * i]!;
        const bg = B[3 * i + 1]!;
        const bb = B[3 * i + 2]!;
        if (sn > 0) {
          F = [sr / sn, sg / sn, sb / sn];
          const fx = F[0] - br;
          const fy = F[1] - bg;
          const fz = F[2] - bb;
          const l2 = fx * fx + fy * fy + fz * fz;
          a = l2 > 1 ? ((d[4 * i]! - br) * fx + (d[4 * i + 1]! - bg) * fy + (d[4 * i + 2]! - bb) * fz) / l2 : 1;
        } else a = Math.min(1, dist[i]! / tPerso);
        a = Math.min(1, Math.max(0, a));
        if (a > 0.02) {
          // Décontamination : retirer la part de fond.
          F = [
            Math.min(255, Math.max(0, (d[4 * i]! - (1 - a) * br) / a)),
            Math.min(255, Math.max(0, (d[4 * i + 1]! - (1 - a) * bg) / a)),
            Math.min(255, Math.max(0, (d[4 * i + 2]! - (1 - a) * bb) / a)),
          ];
        }
      }
      sortie[4 * i] = Math.round(F[0]);
      sortie[4 * i + 1] = Math.round(F[1]);
      sortie[4 * i + 2] = Math.round(F[2]);
      sortie[4 * i + 3] = Math.round(255 * Math.max(0, a));
    }
  }
  // Poussières : garder la plus grande composante (α ≥ 0,5) et ce qui la touche.
  const etiquette = new Int32Array(n).fill(-1);
  const tailles: number[] = [];
  for (let depart = 0; depart < n; depart++) {
    if (sortie[4 * depart + 3]! < 128 || etiquette[depart]! >= 0) continue;
    const id = tailles.length;
    let taille = 0;
    const q = [depart];
    etiquette[depart] = id;
    while (q.length) {
      const i = q.pop()!;
      taille++;
      const x = i % L;
      for (const j of [x > 0 ? i - 1 : -1, x < L - 1 ? i + 1 : -1, i - L, i + L]) {
        if (j < 0 || j >= n || etiquette[j]! >= 0 || sortie[4 * j + 3]! < 128) continue;
        etiquette[j] = id;
        q.push(j);
      }
    }
    tailles.push(taille);
  }
  const principale = tailles.indexOf(Math.max(...tailles));
  let opaques = 0;
  for (let i = 0; i < n; i++) {
    const e = etiquette[i]!;
    if (e >= 0 && e !== principale && tailles[e]! < 0.02 * tailles[principale]!) sortie[4 * i + 3] = 0;
    if (sortie[4 * i + 3]! >= 128) opaques++;
  }
  return { image: { largeur: L, hauteur: H, donnees: sortie }, fond: coeffs, fractionOpaque: opaques / n };
}

/** IoU de deux masques (α ≥ 128). */
export function iouMasques(a: ImageRGBA, b: ImageRGBA, canalB: 'alpha' | 'gris' = 'alpha'): number {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < a.largeur * a.hauteur; i++) {
    const ma = a.donnees[4 * i + 3]! >= 128;
    const mb = (canalB === 'alpha' ? b.donnees[4 * i + 3]! : b.donnees[4 * i]!) >= 128;
    if (ma && mb) inter++;
    if (ma || mb) uni++;
  }
  return uni ? inter / uni : 1;
}

function principal(): number {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { reference: { type: 'string' }, aide: { type: 'boolean', short: 'h' } } });
  if (values.aide || positionals.length < 2) {
    console.log('Utilisation : npx tsx src/outils/personnage-test/detourer.ts <image.png> <sortie.png> [--reference <alpha.png>]');
    return values.aide ? 0 : 1;
  }
  const t0 = performance.now();
  const r = detourer(lirePNG(positionals[0]!));
  ecrirePNG(positionals[1]!, r.image);
  console.log(`Détourage : ${positionals[1]} (${(100 * r.fractionOpaque).toFixed(2)} % opaque) en ${((performance.now() - t0) / 1000).toFixed(2)} s`);
  if (values.reference) {
    const ref = lirePNG(values.reference);
    const gris = ref.donnees[3] === 255 && ref.donnees.some((_, i) => i % 4 === 3 && ref.donnees[i] !== 255) === false;
    console.log(`IoU avec la référence : ${iouMasques(r.image, ref, gris ? 'gris' : 'alpha').toFixed(4)}`);
  }
  return 0;
}

if (process.argv[1] && /detourer\.ts$/.test(process.argv[1])) process.exitCode = principal();
