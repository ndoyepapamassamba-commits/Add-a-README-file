/**
 * Lecture du kit privé de décors (Node) : manifeste `decors.json` + taille des plaques, lus SUR PLACE.
 * Rien n'est copié : les chemins renvoyés pointent dans `studio-troupe/.private/kit/decors/`.
 */
import { existsSync, openSync, readFileSync, readSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InfoDecor } from '../timeline/types';

/** Racine du paquet `moteur-fluide`. */
export const RACINE_MOTEUR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Manifeste par défaut du kit privé. */
export const MANIFESTE_DECORS_DEFAUT = resolve(RACINE_MOTEUR, '..', '.private', 'kit', 'decors.json');
/** Dossier des rendus (ignoré par git). */
export const DOSSIER_SORTIES = resolve(RACINE_MOTEUR, '..', 'sorties');

/** Lit la taille d'une image JPEG ou PNG depuis son en-tête (sans décoder). */
export function tailleImage(chemin: string): { largeur: number; hauteur: number } {
  const fd = openSync(chemin, 'r');
  try {
    const tete = Buffer.alloc(64 * 1024);
    const n = readSync(fd, tete, 0, tete.length, 0);
    const b = tete.subarray(0, n);
    if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) {
      return { largeur: b.readUInt32BE(16), hauteur: b.readUInt32BE(20) };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) {
          i++;
          continue;
        }
        const marqueur = b[i + 1]!;
        const longueur = b.readUInt16BE(i + 2);
        // SOF0..SOF15 sauf DHT (C4), JPG (C8), DAC (CC)
        if (marqueur >= 0xc0 && marqueur <= 0xcf && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc) {
          return { hauteur: b.readUInt16BE(i + 5), largeur: b.readUInt16BE(i + 7) };
        }
        i += 2 + longueur;
      }
    }
    throw new Error(`Format d'image non reconnu ou en-tête trop long : ${chemin}`);
  } finally {
    closeSync(fd);
  }
}

interface EntreeManifeste {
  id: string;
  nom: string;
  fit: { mH: number; floor: number; cx: number; blur?: number };
  fichiers: Record<string, string>;
}

/**
 * Charge le manifeste du kit et renvoie les décors par identifiant. Les décors dont un fichier obligatoire manque
 * sont ignorés et listés dans `manquants`.
 */
export function chargerDecors(manifeste: string = MANIFESTE_DECORS_DEFAUT): {
  decors: Record<string, InfoDecor>;
  manquants: string[];
} {
  if (!existsSync(manifeste)) throw new Error(`Manifeste des décors introuvable : ${manifeste}`);
  const brut = JSON.parse(readFileSync(manifeste, 'utf8')) as { decors?: EntreeManifeste[] };
  const dossier = join(dirname(manifeste), 'decors');
  const decors: Record<string, InfoDecor> = {};
  const manquants: string[] = [];
  for (const e of brut.decors ?? []) {
    const f = e.fichiers;
    const chemin = (cle: string) => (f[cle] ? join(dossier, f[cle]!) : undefined);
    const obligatoires = ['src', 'plate', 'depth', 'plateDepth', 'masks'] as const;
    const chemins = obligatoires.map((k) => chemin(k));
    if (chemins.some((c) => !c || !existsSync(c))) {
      manquants.push(e.id);
      continue;
    }
    const [src, plate, depth, plateDepth, masks] = chemins as string[];
    const { largeur, hauteur } = tailleImage(plate!);
    const people = chemin('people');
    decors[e.id] = {
      id: e.id,
      nom: e.nom,
      largeur,
      hauteur,
      aspect: largeur / hauteur,
      fit: { ...e.fit },
      fichiers: {
        src: src!,
        plate: plate!,
        depth: depth!,
        plateDepth: plateDepth!,
        masks: masks!,
        ...(people && existsSync(people) ? { people } : {}),
      },
    };
  }
  return { decors, manquants };
}
