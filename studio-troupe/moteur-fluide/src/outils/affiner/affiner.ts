/**
 * Affinage de la texture d'un personnage : un dessin petit ou agrandi « au plus proche voisin » (pixels visibles,
 * effet « lego » une fois agrandi à l'écran) est remplacé par une texture plus fine du MÊME cadre. Le maillage, le
 * squelette, les poids et les ancrages du visage ne changent pas (ils restent dans le repère du dessin d'origine :
 * `rig.image.largeur/hauteur` gardent la taille logique) ; seule l'image lue par la page de rendu change.
 *
 *   npm run affiner -- <rig.json> --sortie ../sorties/cache/affiner/<id> [--methode esrgan|bicubique] [--facteur 2]
 *                      [--sd-cli <binaire>] [--modele <RealESRGAN_x4plus_anime_6B.pth>] [--fils 2]
 *
 * Méthodes :
 * - `esrgan` : agrandisseur neuronal Real-ESRGAN « anime 6B » (poids BSD-3-Clause) exécuté par le binaire
 *   `sd-cli` de stable-diffusion.cpp (MIT), en processus séparé, sur processeur. Outils EXTERNES, non fournis : chemins
 *   par `--sd-cli` / `--modele` ou les variables `MOTEUR_SD_CLI` / `MOTEUR_ESRGAN`.
 * - `bicubique` : sans outil externe (plus doux, moins net).
 *
 * Étapes : couleur remplie sous les zones transparentes (pas de liseré au bord) → retour à la définition native si le
 * dessin avait été agrandi ×2 au plus proche voisin → agrandissement → alpha agrandi en bicubique puis rendu net
 * mais adouci. Écrit `<dossier>/texture.png` et `<dossier>/rig.json` (rig complet qui pointe vers la texture).
 *
 * Les personnages de la troupe sont PRIVÉS : la sortie doit rester hors du dépôt, dans
 * `studio-troupe/sorties/cache/affiner/<id>/` (ignoré par git). `outils/affiner/preparer.ts` (maillage fin aux
 * coutures + calque « dessous » + cette texture) écrit, lui, dans `sorties/cache/personnages/<id>/`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chargerRig, ecrireRigComplet, ecrirePNG, lirePNG } from '../../rig/charger';
import { agrandirBicubique, alphaNet, avecAlpha, facteurPixels, flouAlpha, opaque, partBlocsIdentiques, reduireBoite, remplirSousAlpha } from './texture';

const AIDE = `Affinage de la texture d'un personnage (même cadre, plus de définition)

  npm run affiner -- <rig.json> --sortie ../sorties/cache/affiner/<id> [options]

Options :
  --methode <esrgan|bicubique>  agrandisseur (défaut : esrgan si sd-cli et le modèle sont trouvés, sinon bicubique)
  --facteur <n>                 définition finale / définition du dessin (défaut 2)
  --reduction <1|2>             définition native (défaut : détectée ; 2 = dessin agrandi ×2 au plus proche voisin)
  --sd-cli <binaire>            binaire sd-cli de stable-diffusion.cpp (ou MOTEUR_SD_CLI)
  --modele <fichier.pth>        poids Real-ESRGAN ×4 (ou MOTEUR_ESRGAN)
  --fils <n>                    fils de calcul (défaut 2 : la machine est partagée)
`;

async function principal(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      sortie: { type: 'string' },
      methode: { type: 'string' },
      facteur: { type: 'string' },
      reduction: { type: 'string' },
      'sd-cli': { type: 'string' },
      modele: { type: 'string' },
      fils: { type: 'string' },
      aide: { type: 'boolean', short: 'h' },
    },
  });
  if (values.aide || positionals.length !== 1 || !values.sortie) {
    console.log(AIDE);
    return values.aide ? 0 : 1;
  }
  const { rig } = chargerRig(positionals[0]!);
  const sortie = resolve(values.sortie);
  mkdirSync(sortie, { recursive: true });
  const facteur = Math.max(1, Math.round(Number(values.facteur ?? 2)));
  const fils = Math.max(1, Math.round(Number(values.fils ?? 2)));
  const sdCli = values['sd-cli'] ?? process.env['MOTEUR_SD_CLI'];
  const modele = values.modele ?? process.env['MOTEUR_ESRGAN'];
  const esrganDispo = !!sdCli && existsSync(sdCli) && !!modele && existsSync(modele);
  const methode = values.methode ?? (esrganDispo ? 'esrgan' : 'bicubique');
  if (methode === 'esrgan' && !esrganDispo) {
    console.error('Méthode esrgan : binaire sd-cli ou modèle Real-ESRGAN introuvable (--sd-cli, --modele, ou MOTEUR_SD_CLI / MOTEUR_ESRGAN).');
    return 3;
  }

  const t0 = performance.now();
  const image = lirePNG(rig.image.chemin);
  const part = partBlocsIdentiques(image);
  const reduction = values.reduction ? Math.max(1, Math.round(Number(values.reduction))) : facteurPixels(image);
  const L = image.largeur * facteur;
  const H = image.hauteur * facteur;
  console.log(`Dessin ${image.largeur}×${image.hauteur} (blocs 2×2 identiques : ${(100 * part).toFixed(0)} % → définition native ÷${reduction}) → ${L}×${H}, méthode ${methode}`);

  const rempli = remplirSousAlpha(image);
  const natif = reduireBoite(rempli, reduction);
  let couleur;
  if (methode === 'esrgan') {
    const tmp = mkdtempSync(join(tmpdir(), 'affiner-'));
    try {
      const entree = join(tmp, 'entree.png');
      const resultat = join(tmp, 'sortie.png');
      ecrirePNG(entree, opaque(natif));
      const r = spawnSync(sdCli!, ['-M', 'upscale', '--upscale-model', modele!, '-i', entree, '-o', resultat, '-t', String(fils)], { encoding: 'utf8' });
      if (r.status !== 0 || !existsSync(resultat)) throw new Error(`sd-cli a échoué (code ${r.status}) : ${(r.stderr || r.stdout).slice(-800)}`);
      const grand = lirePNG(resultat);
      couleur = grand.largeur === L && grand.hauteur === H ? grand : agrandirBicubique(opaque(grand), L, H);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  } else {
    couleur = agrandirBicubique(opaque(natif), L, H);
  }
  // Alpha : depuis la définition native, agrandi en bicubique, marches arrondies par un flou léger, puis bord net
  // mais adouci (≈ 1 px de transition à la définition finale).
  const alphaNatif = reduireBoite(image, reduction);
  const alpha = alphaNet(flouAlpha(agrandirBicubique(alphaNatif, L, H), Math.max(1, Math.round((facteur * reduction) / 2))), 0.38, 0.62);
  const texture = avecAlpha(couleur, alpha);
  const cheminTexture = join(sortie, 'texture.png');
  ecrirePNG(cheminTexture, texture);

  const affine = {
    ...rig,
    image: { chemin: 'texture.png', largeur: rig.image.largeur, hauteur: rig.image.hauteur },
    provenance: {
      source: `${rig.provenance?.source ?? rig.nom} — texture affinée (${methode === 'esrgan' ? 'Real-ESRGAN anime 6B ×4, BSD-3-Clause, via stable-diffusion.cpp' : 'bicubique'})`,
      licence: rig.provenance?.licence ?? 'voir le dessin d’origine',
    },
  };
  ecrireRigComplet(affine, join(sortie, 'rig.json'));
  console.log(`Texture : ${cheminTexture} ; rig : ${join(sortie, 'rig.json')} (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  return 0;
}

process.exitCode = await principal(process.argv.slice(2));
