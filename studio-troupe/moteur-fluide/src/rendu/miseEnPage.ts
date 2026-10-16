/**
 * Mise en page des sous-titres (pure, testée dans Node) : coupure en lignes équilibrées.
 */

/** Découpe une suite de mots (largeurs connues) en lignes équilibrées d'au plus `largeurMax`. */
export function decouperLignes(largeurs: readonly number[], espace: number, largeurMax: number, maxLignes = 2): number[][] {
  const n = largeurs.length;
  if (n === 0) return [];
  const largeurLigne = (a: number, b: number): number => {
    let s = 0;
    for (let i = a; i < b; i++) s += largeurs[i]!;
    return s + Math.max(0, b - a - 1) * espace;
  };
  if (largeurLigne(0, n) <= largeurMax) return [Array.from({ length: n }, (_, i) => i)];
  if (maxLignes >= 2) {
    // Coupure en deux qui minimise la ligne la plus longue.
    let meilleure = -1;
    let score = Infinity;
    for (let k = 1; k < n; k++) {
      const s = Math.max(largeurLigne(0, k), largeurLigne(k, n));
      if (s < score) {
        score = s;
        meilleure = k;
      }
    }
    if (score <= largeurMax || maxLignes === 2) {
      return [Array.from({ length: meilleure }, (_, i) => i), Array.from({ length: n - meilleure }, (_, i) => meilleure + i)];
    }
  }
  // Remplissage glouton.
  const lignes: number[][] = [[]];
  let courante = 0;
  for (let i = 0; i < n; i++) {
    const w = largeurs[i]!;
    const ligne = lignes[lignes.length - 1]!;
    if (ligne.length > 0 && courante + espace + w > largeurMax) {
      lignes.push([i]);
      courante = w;
    } else {
      ligne.push(i);
      courante += (ligne.length > 1 ? espace : 0) + w;
    }
  }
  return lignes;
}

