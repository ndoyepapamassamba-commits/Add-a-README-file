/**
 * Chargement des rigs dans Node : lecture du `rig.json` (source `moteur-fluide/rig-source@1` ou rig complet
 * `moteur-fluide/rig@1`), de l'image PNG détourée (lue SUR PLACE, jamais copiée) et de la carte des parties, puis
 * construction du `CharacterRig` (maillage, poids, groupes). Mémoïsé par chemin et date de modification.
 *
 * Node seulement (fs, pngjs) : ne pas importer depuis la page de rendu.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { CharacterRig } from '../timeline/types';
import { construireRig, FORMAT_SOURCE_RIG, validerSourceRig, type RapportRig, type SourceRig } from './construire';
import type { ImageRGBA } from './maillage';
import { validerSquelette } from './squelette';

/** Lit un PNG en RGBA 8 bits (non prémultiplié). */
export function lirePNG(chemin: string): ImageRGBA {
  const png = PNG.sync.read(readFileSync(chemin));
  return { largeur: png.width, hauteur: png.height, donnees: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) };
}

/** Écrit une image RGBA en PNG. */
export function ecrirePNG(chemin: string, image: ImageRGBA): void {
  const png = new PNG({ width: image.largeur, height: image.hauteur });
  Buffer.from(image.donnees.buffer, image.donnees.byteOffset, image.donnees.length).copy(png.data);
  writeFileSync(chemin, PNG.sync.write(png, { colorType: 6 }));
}

/** Résout un chemin relatif au dossier d'un fichier. */
function relatif(fichier: string, chemin: string): string {
  return isAbsolute(chemin) ? chemin : resolve(dirname(fichier), chemin);
}

/** Erreurs de cohérence d'un rig complet (liste vide = valide). */
export function validerRig(rig: CharacterRig): string[] {
  const e: string[] = [];
  if (rig.format !== 'moteur-fluide/rig@1') e.push(`format : « moteur-fluide/rig@1 » attendu`);
  e.push(...validerSquelette(rig.squelette));
  const m = rig.maillage;
  const n = m.positions.length / 2;
  if (m.uvs.length !== 2 * n) e.push('maillage.uvs : 2V valeurs attendues');
  if (m.influences.length !== 4 * n || m.poids.length !== 4 * n) e.push('maillage.influences / poids : 4V valeurs attendues');
  if (m.indices.length % 3 !== 0) e.push('maillage.indices : multiple de 3 attendu');
  for (const i of m.indices) if (!(i >= 0 && i < n)) {
    e.push(`maillage.indices : index hors bornes (${i})`);
    break;
  }
  const nOs = rig.squelette.os.length;
  for (let v = 0; v < n; v++) {
    let s = 0;
    for (let k = 0; k < 4; k++) {
      const j = m.influences[4 * v + k]!;
      if (j >= nOs) e.push(`maillage.influences : os ${j} inexistant (sommet ${v})`);
      if (j >= 0) s += m.poids[4 * v + k]!;
    }
    if (Math.abs(s - 1) > 1e-4) {
      e.push(`maillage.poids : somme ${s.toFixed(5)} ≠ 1 au sommet ${v}`);
      break;
    }
  }
  const total = rig.groupes.reduce((a, g) => a + g.nombreTriangles, 0);
  if (total !== m.indices.length / 3) e.push(`groupes : ${total} triangles couverts sur ${m.indices.length / 3}`);
  return e;
}

/** Résultat d'un chargement. */
export interface RigCharge {
  rig: CharacterRig;
  /** Rapport de construction (absent si le fichier était déjà un rig complet). */
  rapport?: RapportRig;
  /** Fichier lu. */
  chemin: string;
}

const CACHE = new Map<string, { cle: string; resultat: RigCharge }>();

/**
 * Charge un `rig.json` : rig source (construit à la volée, ~1 s) ou rig complet. L'image est référencée par son
 * chemin ABSOLU dans `rig.image.chemin` (lue sur place par l'export).
 */
export function chargerRig(chemin: string, options: { cache?: boolean } = {}): RigCharge {
  const absolu = resolve(chemin);
  if (!existsSync(absolu)) throw new Error(`Rig introuvable : ${absolu}`);
  const texte = readFileSync(absolu, 'utf8');
  const brut = JSON.parse(texte) as { format?: string };
  const cleFichiers = [texte];
  if (brut.format === FORMAT_SOURCE_RIG) {
    const s = brut as SourceRig;
    for (const f of [s.image, s.parties?.image]) {
      if (!f) continue;
      const p = relatif(absolu, f);
      if (existsSync(p)) cleFichiers.push(`${p}:${statSync(p).mtimeMs}:${statSync(p).size}`);
    }
  }
  const cle = createHash('sha256').update(cleFichiers.join('\n')).digest('hex');
  if (options.cache !== false) {
    const deja = CACHE.get(absolu);
    if (deja && deja.cle === cle) return deja.resultat;
  }
  let resultat: RigCharge;
  if (brut.format === 'moteur-fluide/rig@1') {
    const rig = brut as unknown as CharacterRig;
    rig.image = { ...rig.image, chemin: relatif(absolu, rig.image.chemin) };
    const erreurs = validerRig(rig);
    if (erreurs.length) throw new Error(`Rig invalide (${absolu}) :\n  - ${erreurs.join('\n  - ')}`);
    resultat = { rig, chemin: absolu };
  } else if (brut.format === FORMAT_SOURCE_RIG) {
    const erreurs = validerSourceRig(brut);
    if (erreurs.length) throw new Error(`Rig source invalide (${absolu}) :\n  - ${erreurs.join('\n  - ')}`);
    const source = brut as SourceRig;
    const cheminImage = relatif(absolu, source.image);
    if (!existsSync(cheminImage)) throw new Error(`Image du rig introuvable : ${cheminImage}`);
    const image = lirePNG(cheminImage);
    const parties = source.parties ? lirePNG(relatif(absolu, source.parties.image)) : undefined;
    const { rig, rapport } = construireRig(source, image, { cheminImage, ...(parties ? { parties } : {}) });
    resultat = { rig, rapport, chemin: absolu };
  } else {
    throw new Error(`Rig ${absolu} : format inconnu « ${String(brut.format)} »`);
  }
  CACHE.set(absolu, { cle, resultat });
  return resultat;
}

/**
 * Charge tous les rigs d'un dossier (chaque sous-dossier contenant un `rig.json`, ou les `*.rig.json` du dossier).
 * Renvoie les rigs par identifiant, prêts pour `Ressources.rigs`.
 */
export function chargerRigs(dossiers: readonly string[]): { rigs: Record<string, CharacterRig>; rapports: Record<string, RapportRig>; erreurs: string[] } {
  const rigs: Record<string, CharacterRig> = {};
  const rapports: Record<string, RapportRig> = {};
  const erreurs: string[] = [];
  for (const dossier of dossiers) {
    if (!existsSync(dossier)) continue;
    const candidats: string[] = [];
    for (const nom of readdirSync(dossier)) {
      const p = join(dossier, nom);
      if (statSync(p).isDirectory() && existsSync(join(p, 'rig.json'))) candidats.push(join(p, 'rig.json'));
      else if (nom.endsWith('.rig.json') || nom === 'rig.json') candidats.push(p);
    }
    for (const c of candidats) {
      try {
        const r = chargerRig(c);
        rigs[r.rig.id] = r.rig;
        if (r.rapport) rapports[r.rig.id] = r.rapport;
      } catch (err) {
        erreurs.push(`${c} : ${(err as Error).message}`);
      }
    }
  }
  return { rigs, rapports, erreurs };
}

/** Écrit un rig complet en JSON (NaN des centres CoR → null ; chemin d'image relatif au fichier écrit). */
export function ecrireRigComplet(rig: CharacterRig, chemin: string, arrondi = 1e-3): void {
  const r = (x: number): number | null => (Number.isFinite(x) ? Math.round(x / arrondi) * arrondi : null);
  const m = rig.maillage;
  const copie = {
    ...rig,
    image: { ...rig.image, chemin: rig.image.chemin },
    maillage: {
      ...m,
      positions: m.positions.map(r),
      uvs: m.uvs.map((x) => Math.round(x * 1e6) / 1e6),
      poids: m.poids.map((x) => Math.round(x * 1e6) / 1e6),
      centresRotation: m.centresRotation?.map(r),
    },
  };
  writeFileSync(chemin, JSON.stringify(copie));
}
