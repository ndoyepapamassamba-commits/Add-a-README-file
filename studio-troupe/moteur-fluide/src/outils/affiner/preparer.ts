/**
 * Préparation d'un personnage de la troupe pour le rendu final, depuis son dossier privé
 * (`studio-troupe/.private/personnages/<id>/`, lu sur place) :
 *
 * 1. **maillage fin aux frontières des parties** : là où deux parties qui bougent l'une par rapport à l'autre se
 *    touchent dans le dessin (bras contre le torse, jambes contre le bassin, tête contre le cou), le pas du maillage
 *    descend à ≈ 1,2 px. Les triangles ne chevauchent plus la frontière que de ≈ 1 px : quand le bras s'écarte, il
 *    n'emporte plus de « dents » de t-shirt et n'en laisse plus sur le flanc ;
 * 2. **calque « dessous »** (si `rgba_dessous.png`, `dessous_zone.png` et `dessous_zone_os.png` existent) : torse
 *    comblé derrière les bras, dessiné sous tout le reste et porté rigidement par l'os du corps — lever un bras ne
 *    laisse plus de trou ;
 * 3. **texture affinée** (`affiner.ts`) : définition réelle du dessin restituée et agrandie (Real-ESRGAN anime ou
 *    bicubique), bord d'alpha lissé.
 *
 *   npm run preparer -- <dossier du personnage> --sortie <dossier> [--methode esrgan|bicubique] [--facteur 2]
 *                       [--sd-cli <binaire>] [--modele <.pth>] [--pas-frontiere 1.2]
 *
 * Écrit `<sortie>/<id>.texture.png` et `<sortie>/rig.json` (rig complet). Les dessins sont privés : écrire dans
 * `studio-troupe/sorties/cache/personnages/<id>/` (ignoré par git), jamais dans le dépôt.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ecrirePNG, ecrireRigComplet, lirePNG, validerRig } from '../../rig/charger';
import { construireRig, type SourceRig } from '../../rig/construire';
import { construireMaillage, type ImageRGBA, type ZoneDensite } from '../../rig/maillage';
import type { CharacterRig } from '../../timeline/types';
import { agrandirBicubique, alphaNet, avecAlpha, facteurPixels, opaque, reduireBoite, remplirSousAlpha } from './texture';

/** Chaînes de parties qui bougent l'une par rapport à l'autre (les autres os appartiennent au corps). */
const CHAINES: Record<string, readonly string[]> = {
  brasG: ['brasG', 'avantBrasG', 'mainG'],
  brasD: ['brasD', 'avantBrasD', 'mainD'],
  jambeG: ['cuisseG', 'jambeG', 'piedG'],
  jambeD: ['cuisseD', 'jambeD', 'piedD'],
  tete: ['tete'],
};

/**
 * Zones de densité le long des frontières entre chaînes de la carte des parties (canal rouge = index + 1 dans
 * `os`). Une zone tous les `espacement` px de frontière.
 */
export function zonesFrontieres(parties: ImageRGBA, os: readonly string[], pas = 2, espacement = 3): ZoneDensite[] {
  const chaineDe = new Map<number, string>();
  os.forEach((nom, i) => {
    const c = Object.entries(CHAINES).find(([, l]) => l.includes(nom));
    chaineDe.set(i + 1, c ? c[0] : 'corps');
  });
  const L = parties.largeur;
  const H = parties.hauteur;
  const lab = (x: number, y: number): string | null => {
    if (x < 0 || y < 0 || x >= L || y >= H) return null;
    const v = parties.donnees[4 * (y * L + x)]!;
    return v > 0 ? (chaineDe.get(v) ?? 'corps') : null;
  };
  const zones: ZoneDensite[] = [];
  const pris = new Uint8Array(L * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) {
      const a = lab(x, y);
      if (!a) continue;
      const b = lab(x + 1, y) ?? a;
      const c = lab(x, y + 1) ?? a;
      if (a === b && a === c) continue;
      // Une zone au plus par carré `espacement × espacement`.
      const cx = Math.floor(x / espacement);
      const cy = Math.floor(y / espacement);
      const k = cy * Math.ceil(L / espacement) + cx;
      if (pris[k]) continue;
      pris[k] = 1;
      zones.push({ centre: { x: x + 0.5, y: y + 0.5 }, rayon: 5 * pas, pas });
    }
  }
  return zones;
}

/**
 * Épaules en fondu : la région d'un os d'épaule (épaule → bras) suit l'épaule près du bras, puis rend son poids
 * progressivement au torse en allant vers le cou. Sans cela, monter l'épaule (haussement, posture d'émotion)
 * décale d'un bloc toute la région étiquetée « épaule » et le haut du t-shirt se découpe en marches d'escalier.
 * Les sommets modifiés passent en mélange linéaire (centre de rotation `NaN`). Renvoie le nombre de sommets adoucis.
 */
export function adoucirEpaules(rig: CharacterRig): number {
  const os = rig.squelette.os;
  const index = new Map(os.map((o, i) => [o.nom, i]));
  const m = rig.maillage;
  let n = 0;
  for (const c of ['G', 'D']) {
    const ie = index.get('epaule' + c);
    const bras = os[index.get('bras' + c) ?? -1];
    if (ie === undefined || !bras) continue;
    const parent = os[ie]!.parent;
    const it = parent ? index.get(parent) : undefined;
    if (it === undefined) continue;
    const L = Math.max(8, os[ie]!.longueur);
    for (let v = 0; v < m.positions.length / 2; v++) {
      let ke = -1;
      let kt = -1;
      let libre = -1;
      for (let k = 0; k < 4; k++) {
        const j = m.influences[4 * v + k]!;
        if (j === ie) ke = k;
        else if (j === it) kt = k;
        else if (j < 0 && libre < 0) libre = k;
      }
      if (ke < 0) continue;
      const d = Math.hypot(m.positions[2 * v]! - bras.pivot.x, m.positions[2 * v + 1]! - bras.pivot.y);
      const u = Math.min(1, Math.max(0, (1.4 * L - d) / L));
      const garde = u * u * (3 - 2 * u);
      if (garde >= 0.999) continue;
      const w = m.poids[4 * v + ke]!;
      const rendu = w * (1 - garde);
      if (kt < 0 && libre < 0) {
        // Aucune case pour le torse : le poids de l'épaule passe en entier au plus proche des deux.
        if (garde < 0.5) m.influences[4 * v + ke] = it;
      } else {
        const cible = kt >= 0 ? kt : libre;
        m.influences[4 * v + cible] = it;
        m.poids[4 * v + cible] = (kt >= 0 ? m.poids[4 * v + cible]! : 0) + rendu;
        m.poids[4 * v + ke] = w - rendu;
      }
      if (m.centresRotation) {
        m.centresRotation[2 * v] = Number.NaN;
        m.centresRotation[2 * v + 1] = Number.NaN;
      }
      n++;
    }
  }
  return n;
}

/** Ajoute le calque « dessous » : atlas [image | dessous] et groupe rigide sur l'os du corps, derrière tout. */
export function ajouterDessous(rig: CharacterRig, image: ImageRGBA, dessous: ImageRGBA, zone: ImageRGBA, zoneOs: ImageRGBA, osParties: readonly string[]): { rig: CharacterRig; atlas: ImageRGBA } {
  const W = image.largeur;
  const H = image.hauteur;
  const atlas = new Uint8Array(4 * 2 * W * H);
  for (let y = 0; y < H; y++) {
    atlas.set(image.donnees.subarray(4 * y * W, 4 * (y + 1) * W), 4 * (y * 2 * W));
    atlas.set(dessous.donnees.subarray(4 * y * W, 4 * (y + 1) * W), 4 * (y * 2 * W + W));
  }
  const mz = construireMaillage(zone, { pas: 6 });
  const indexOs = new Map(rig.squelette.os.map((o, i) => [o.nom, i]));
  const torse = indexOs.get('torse') ?? 0;
  const osDe = (x: number, y: number): number => {
    for (let r = 0; r <= 4; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xi = Math.round(x) + dx;
          const yi = Math.round(y) + dy;
          if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
          const v = zoneOs.donnees[4 * (yi * W + xi)]!;
          if (v > 0) return indexOs.get(osParties[v - 1]!) ?? torse;
        }
    return torse;
  };
  const out: CharacterRig = structuredClone(rig);
  const m = out.maillage;
  const n0 = m.positions.length / 2;
  const t0 = m.indices.length / 3;
  m.uvs = m.uvs.map((u, i) => (i % 2 === 0 ? u / 2 : u));
  for (let v = 0; v < mz.positions.length / 2; v++) {
    const x = mz.positions[2 * v]!;
    const y = mz.positions[2 * v + 1]!;
    const o = osDe(x, y);
    m.positions.push(x, y);
    m.uvs.push((x + W) / (2 * W), y / H);
    m.influences.push(o, -1, -1, -1);
    m.poids.push(1, 0, 0, 0);
    m.centresRotation?.push(Number.NaN, Number.NaN);
    m.partie?.push(o);
  }
  for (const i of mz.triangles) m.indices.push(i + n0);
  out.groupes.push({ nom: 'dessous', premierTriangle: t0, nombreTriangles: mz.triangles.length / 3, ordre: -1, os: 'torse' });
  out.image = { chemin: rig.image.chemin, largeur: 2 * W, hauteur: H };
  return { rig: out, atlas: { largeur: 2 * W, hauteur: H, donnees: atlas } };
}

/** Flou gaussien séparable du canal alpha (contours en escalier → courbes), bords prolongés. */
export function flouAlpha(img: ImageRGBA, sigma: number): ImageRGBA {
  if (sigma <= 0) return img;
  const { largeur: L, hauteur: H } = img;
  const r = Math.ceil(3 * sigma);
  const k = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  const somme = k.reduce((a, b) => a + b, 0);
  const tmp = new Float32Array(L * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += k[i + r]! * img.donnees[4 * (y * L + Math.min(L - 1, Math.max(0, x + i))) + 3]!;
      tmp[y * L + x] = a / somme;
    }
  const out = { largeur: L, hauteur: H, donnees: new Uint8Array(img.donnees) };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += k[i + r]! * tmp[Math.min(H - 1, Math.max(0, y + i)) * L + x]!;
      out.donnees[4 * (y * L + x) + 3] = Math.round(a / somme);
    }
  return out;
}

/** Réglages de l'affinage de la texture. */
export interface OptionsTexture {
  methode: 'esrgan' | 'bicubique';
  facteur: number;
  sdCli?: string;
  modele?: string;
  fils: number;
  /** Dossier où garder l'agrandissement ESRGAN (réutilisé à entrée et modèle identiques). */
  cache: string;
}

/**
 * Texture affinée du même cadre, `facteur ×` plus grande : couleur remplie sous la transparence, définition native,
 * agrandissement (Real-ESRGAN par sd-cli, ou bicubique), alpha natif agrandi, flou d'un demi-pixel natif puis bord net.
 */
export function affinerTexture(image: ImageRGBA, o: OptionsTexture): { image: ImageRGBA; reduction: number; methode: string } {
  const reduction = facteurPixels(image);
  const L = image.largeur * o.facteur;
  const H = image.hauteur * o.facteur;
  const natif = reduireBoite(remplirSousAlpha(image), reduction);
  let couleur: ImageRGBA;
  let methode = 'bicubique';
  if (o.methode === 'esrgan') {
    if (!o.sdCli || !existsSync(o.sdCli) || !o.modele || !existsSync(o.modele)) throw new Error('esrgan : sd-cli ou modèle Real-ESRGAN introuvable (--sd-cli, --modele)');
    const entree = opaque(natif);
    const empreinte = createHash('sha256').update(entree.donnees).update(basename(o.modele)).digest('hex').slice(0, 16);
    const fEntree = join(o.cache, `esrgan-${empreinte}.entree.png`);
    const fSortie = join(o.cache, `esrgan-${empreinte}.png`);
    if (!existsSync(fSortie)) {
      ecrirePNG(fEntree, entree);
      const r = spawnSync(o.sdCli, ['-M', 'upscale', '--upscale-model', o.modele, '-i', fEntree, '-o', fSortie, '-t', String(o.fils)], { encoding: 'utf8' });
      if (r.status !== 0 || !existsSync(fSortie)) throw new Error(`sd-cli a échoué (code ${r.status}) : ${(r.stderr || r.stdout).slice(-800)}`);
    }
    const grand = lirePNG(fSortie);
    couleur = grand.largeur === L && grand.hauteur === H ? grand : agrandirBicubique(opaque(grand), L, H);
    methode = 'Real-ESRGAN x4plus anime 6B (sd-cli)';
  } else {
    couleur = agrandirBicubique(opaque(natif), L, H);
  }
  const alpha = alphaNet(flouAlpha(agrandirBicubique(reduireBoite(image, reduction), L, H), 0.55 * o.facteur * reduction), 0.42, 0.58);
  return { image: avecAlpha(couleur, alpha), reduction, methode };
}

export const AIDE = `Préparation d'un personnage pour le rendu (maillage fin aux frontières, calque dessous, texture affinée)

Utilisation :
  npm run preparer -- <dossier du personnage> --sortie <dossier> [options]

Options :
  --methode <esrgan|bicubique>  agrandissement de la texture (défaut esrgan si sd-cli et le modèle sont trouvés)
  --facteur <n>                 agrandissement de la texture (défaut 2)
  --sd-cli <binaire>            ou variable MOTEUR_SD_CLI
  --modele <fichier.pth>        RealESRGAN_x4plus_anime_6B.pth, ou variable MOTEUR_ESRGAN
  --pas-frontiere <px>          pas du maillage aux frontières des parties (défaut 1,2)
  --sans-dessous                ne pas ajouter le calque « dessous »
  --sans-fondu-epaules          garder les épaules rigides (par défaut, leur poids revient au torse vers le cou)
  --bande-min <px>              largeur minimale des bandes de mélange des poids aux articulations (défaut du rig : 6)
  --fils <n>                    fils de calcul (défaut 2)
`;

async function principal(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      sortie: { type: 'string', short: 'o' },
      methode: { type: 'string' },
      facteur: { type: 'string' },
      'sd-cli': { type: 'string' },
      modele: { type: 'string' },
      'pas-frontiere': { type: 'string' },
      'sans-dessous': { type: 'boolean' },
      'bande-min': { type: 'string' },
      'sans-fondu-epaules': { type: 'boolean' },
      fils: { type: 'string' },
      aide: { type: 'boolean', short: 'h' },
    },
  });
  if (values.aide || positionals.length !== 1 || !values.sortie) {
    console.log(AIDE);
    return values.aide ? 0 : 1;
  }
  const t0 = performance.now();
  const dossier = resolve(positionals[0]!);
  const source = JSON.parse(readFileSync(join(dossier, 'rig.json'), 'utf8')) as SourceRig;
  if (source.format !== 'moteur-fluide/rig-source@1') throw new Error(`${dossier}/rig.json : rig source attendu (moteur-fluide/rig-source@1)`);
  const cheminImage = resolve(dossier, source.image);
  const image = lirePNG(cheminImage);
  const parties = source.parties ? lirePNG(resolve(dossier, source.parties.image)) : undefined;
  const pas = Number(values['pas-frontiere'] ?? 1.2);
  const zonesF = parties && source.parties ? zonesFrontieres(parties, source.parties.os, pas) : [];
  const bandeMin = values['bande-min'] !== undefined ? Number(values['bande-min']) : undefined;
  const enrichie: SourceRig = {
    ...source,
    maillage: { ...(source.maillage ?? {}), zones: [...(source.maillage?.zones ?? []), ...zonesF] },
    ...(bandeMin !== undefined ? { poids: { ...(source.poids ?? {}), bandeMin } } : {}),
  };
  const { rig: base, rapport } = construireRig(enrichie, image, { cheminImage, ...(parties ? { parties } : {}) });
  console.log(`Maillage : ${rapport.maillage.sommets} sommets, ${rapport.maillage.triangles} triangles (${zonesF.length} zones de frontière au pas ${pas} px)`);
  if (!values['sans-fondu-epaules']) console.log(`Épaules en fondu : ${adoucirEpaules(base)} sommets`);
  let rig = base;
  let texture: ImageRGBA = image;
  const fichiersDessous = ['rgba_dessous.png', 'dessous_zone.png', 'dessous_zone_os.png'].map((f) => join(dossier, f));
  if (!values['sans-dessous'] && source.parties && fichiersDessous.every((f) => existsSync(f))) {
    const [d, z, zo] = fichiersDessous.map((f) => lirePNG(f)) as [ImageRGBA, ImageRGBA, ImageRGBA];
    const r = ajouterDessous(base, image, d, z, zo, source.parties.os);
    rig = r.rig;
    texture = r.atlas;
    console.log(`Calque dessous : ${rig.groupes.find((g) => g.nom === 'dessous')!.nombreTriangles} triangles`);
  }
  const sdCli = values['sd-cli'] ?? process.env.MOTEUR_SD_CLI;
  const modele = values.modele ?? process.env.MOTEUR_ESRGAN;
  const methode = (values.methode ?? (sdCli && modele && existsSync(sdCli) && existsSync(modele) ? 'esrgan' : 'bicubique')) as OptionsTexture['methode'];
  const facteur = Number(values.facteur ?? 2);
  const sortie = resolve(values.sortie);
  mkdirSync(sortie, { recursive: true });
  const a = affinerTexture(texture, { methode, facteur, ...(sdCli ? { sdCli } : {}), ...(modele ? { modele } : {}), fils: Number(values.fils ?? 2), cache: sortie });
  const nomTexture = `${rig.id}.texture.png`;
  ecrirePNG(join(sortie, nomTexture), a.image);
  const final: CharacterRig = {
    ...rig,
    image: { ...rig.image, chemin: nomTexture },
    ...(rig.provenance
      ? { provenance: { ...rig.provenance, source: `${rig.provenance.source} ; préparé par outils/affiner/preparer (frontières au pas ${pas} px, texture ×${facteur} ${a.methode})` } }
      : {}),
  };
  const erreurs = validerRig({ ...final, image: { ...final.image, chemin: join(sortie, nomTexture) } });
  if (erreurs.length) throw new Error(`Rig préparé invalide :\n  - ${erreurs.join('\n  - ')}`);
  ecrireRigComplet(final, join(sortie, 'rig.json'));
  console.log(`Texture : ${join(sortie, nomTexture)} (${a.image.largeur}×${a.image.hauteur}, ${a.methode})`);
  console.log(`Rig : ${join(sortie, 'rig.json')} — préparé en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2)).then(
    (c) => (process.exitCode = c),
    (e: unknown) => {
      console.error(`Erreur : ${(e as Error).message}`);
      process.exitCode = 2;
    },
  );
}
