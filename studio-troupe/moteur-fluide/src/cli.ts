/**
 * Commande « rendre » du moteur fluide :
 *
 *   npm run rendre -- <projet.json> [--sortie f.mp4] [--fps 30] [--flou 4] [--de i] [--a j] …
 *
 * Enchaîne : validation du projet → chargement des décors (kit privé, lu sur place) et des rigs → porte qualité sur
 * l'ÉTAT du moteur (mouvement, à-coups, pieds, lèvres, caméra) → construction de la page → capture image par image
 * dans Chromium (segments repris après un arrêt) → mixage audio (voix, bruitages, musique, −14 LUFS) →
 * multiplexage MP4 → vérification intégrale (ffprobe, décodage complet, horodatage, échantillons) → porte qualité
 * sur les pixels et planche contact → rapports JSON et Markdown.
 *
 * Rien n'est simulé : sans MP4 réel, décodé et contrôlé, la commande échoue et le dit.
 *
 * Codes de sortie : 0 tout est conforme ; 1 usage ou projet invalide ; 2 erreur d'exécution ; 3 outil absent ;
 * 4 porte qualité en échec ; 5 vérification du MP4 en échec.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { creerMoteurComplet } from './assemblage';
import { collecterSources, enveloppeRms, mixerAudio, multiplexer, type RapportAudio } from './export/audio';
import { capturerVideo, ENCODAGE_DEFAUT, type FormatCapture, type ResultatCapture } from './export/capture';
import { OutilAbsent, verifierOutils, versionsOutils } from './export/processus';
import { ecrireRapportVerification, verificationEnMarkdown, verifierVideo, type RapportVerification } from './export/verifier';
import { formaterDuree, imageVersTemps, lireTimecode, nombreImages, timecode } from './noyau/temps';
import { DOSSIER_SORTIES, MANIFESTE_DECORS_DEFAUT, RACINE_MOTEUR, chargerDecors } from './outils/kit';
import { analyserPixels, plancheContact, portePixels } from './qa/pixels';
import { porteProjet, qualiteEnMarkdown, type SeuilsQualite } from './qa/porte';
import type { RapportQualite } from './qa/types';
import { chargerRig } from './rig/charger';
import { enrichirRessources } from './scene/analyse';
import { evaluer } from './timeline/evaluer';
import { validerProjet } from './timeline/projet';
import type { CharacterRig, InfoDecor, Moteur, Projet } from './timeline/types';

export const AIDE = `Moteur fluide de la troupe — rendu vérifié d'un projet en MP4 9:16

Utilisation :
  npm run rendre -- <projet.json> [options]

Sans --sortie : validation, évaluation de chaque image et porte qualité sur l'état du moteur.
Avec --sortie : rendu complet, audio, vérification du MP4, porte qualité, planche contact et rapports.

Options :
  --sortie <f.mp4>        fichier vidéo à produire (dans studio-troupe/sorties/ : les décors sont privés)
  --fps <n>               cadence de sortie (défaut : celle du projet ; 30 ou 60)
  --flou <n>              sous-images moyennées par image (flou de bougé exact ; 1 = sans flou)
  --obturateur <x>        ouverture de l'obturateur, fraction d'image (défaut : projet, 0,5 = 180°)
  --taille <LxH>          définition de sortie (défaut : projet, 1080x1920 ; 540x960 pour un aperçu)
  --de <pos> / --a <pos>  plage rendue [de, a[ : numéro d'image (« 45 »), secondes (« 1.5s ») ou timecode
                          (« 00:00:01:15 »)
  --kit <decors.json>     manifeste des décors (défaut : kit privé de studio-troupe)
  --rigs <dossier>        dossier de rigs (<id>/rig.json ou <id>.rig.json) ; répétable
  --rig <id=chemin>       rig précis pour un identifiant ; répétable
  --rig-secours <id|chemin>
                          rig utilisé pour les personnages dont le rig manque (essais avec le personnage de test)
  --capture <jpeg|png>    format des images capturées (défaut jpeg q0,95 : le plus rapide mesuré ; png sans perte)
  --qualite <x>           qualité JPEG de capture (défaut 0,95)
  --crf <n> --preset <p> --tune <t> --fils <n>
                          réglages x264 (défaut 18, medium, animation, 2 fils)
  --paralleles <n>        navigateurs en parallèle (défaut 1 ; la machine est partagée)
  --segment <n>           images par segment de reprise (défaut 2 s)
  --repartir              ignorer les segments déjà rendus
  --forcer                continuer malgré une porte qualité en échec ou un son introuvable
  --sans-porte            ne pas calculer la porte qualité sur l'état
  --sans-construction     ne pas reconstruire la page de rendu (dist/)
  --hors-sorties          autoriser une sortie hors de studio-troupe/sorties/
  --aide                  afficher cette aide

Codes de sortie : 0 conforme ; 1 usage ou projet invalide ; 2 erreur ; 3 outil absent ;
4 porte qualité en échec ; 5 vérification du MP4 en échec.
`;

/** Options lues sur la ligne de commande. */
interface Options {
  projet: string;
  sortie?: string;
  fps?: number;
  flou?: number;
  obturateur?: number;
  taille?: { largeur: number; hauteur: number };
  de?: string;
  a?: string;
  kit?: string;
  rigs: string[];
  rig: Record<string, string>;
  rigSecours?: string;
  capture: FormatCapture;
  qualite: number;
  crf: number;
  preset: string;
  tune: string;
  fils: number;
  paralleles: number;
  segment?: number;
  repartir: boolean;
  forcer: boolean;
  sansPorte: boolean;
  sansConstruction: boolean;
  horsSorties: boolean;
}

class ErreurUsage extends Error {}

function nombre(v: string | undefined, nom: string, min = -Infinity, max = Infinity): number | undefined {
  if (v === undefined) return undefined;
  const x = Number(v.replace(',', '.'));
  if (!Number.isFinite(x) || x < min || x > max) throw new ErreurUsage(`--${nom} : valeur invalide « ${v} »`);
  return x;
}

/** Lit les arguments (lève `ErreurUsage` avec un message en français). */
export function lireOptions(argv: readonly string[]): Options | 'aide' {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      sortie: { type: 'string', short: 'o' },
      fps: { type: 'string' },
      flou: { type: 'string' },
      obturateur: { type: 'string' },
      taille: { type: 'string' },
      de: { type: 'string' },
      a: { type: 'string' },
      kit: { type: 'string' },
      rigs: { type: 'string', multiple: true },
      rig: { type: 'string', multiple: true },
      'rig-secours': { type: 'string' },
      capture: { type: 'string' },
      qualite: { type: 'string' },
      crf: { type: 'string' },
      preset: { type: 'string' },
      tune: { type: 'string' },
      fils: { type: 'string' },
      paralleles: { type: 'string' },
      segment: { type: 'string' },
      repartir: { type: 'boolean' },
      forcer: { type: 'boolean' },
      'sans-porte': { type: 'boolean' },
      'sans-construction': { type: 'boolean' },
      'hors-sorties': { type: 'boolean' },
      aide: { type: 'boolean', short: 'h' },
    },
  });
  if (values.aide) return 'aide';
  if (positionals.length !== 1) throw new ErreurUsage(positionals.length === 0 ? 'Projet manquant.' : `Un seul projet attendu (reçu : ${positionals.join(', ')}).`);
  const capture = (values.capture ?? 'jpeg') as FormatCapture;
  if (capture !== 'jpeg' && capture !== 'png') throw new ErreurUsage('--capture : « jpeg » ou « png »');
  let taille: Options['taille'];
  if (values.taille) {
    const m = /^(\d+)[x×](\d+)$/.exec(values.taille);
    if (!m) throw new ErreurUsage('--taille : format LxH attendu (ex. 1080x1920)');
    taille = { largeur: Number(m[1]), hauteur: Number(m[2]) };
    if (taille.largeur % 2 || taille.hauteur % 2 || taille.largeur < 16 || taille.hauteur < 16) throw new ErreurUsage('--taille : dimensions paires ≥ 16 attendues (yuv420p)');
  }
  const rig: Record<string, string> = {};
  for (const r of values.rig ?? []) {
    const i = r.indexOf('=');
    if (i <= 0) throw new ErreurUsage(`--rig : format id=chemin attendu (« ${r} »)`);
    rig[r.slice(0, i)] = resolve(r.slice(i + 1));
  }
  const o: Options = {
    projet: resolve(positionals[0]!),
    rigs: (values.rigs ?? []).map((d) => resolve(d)),
    rig,
    capture,
    qualite: nombre(values.qualite, 'qualite', 0.1, 1) ?? 0.95,
    crf: nombre(values.crf, 'crf', 0, 51) ?? ENCODAGE_DEFAUT.crf,
    preset: values.preset ?? ENCODAGE_DEFAUT.preset,
    tune: values.tune ?? ENCODAGE_DEFAUT.tune,
    fils: nombre(values.fils, 'fils', 1, 16) ?? ENCODAGE_DEFAUT.fils,
    paralleles: nombre(values.paralleles, 'paralleles', 1, 8) ?? 1,
    repartir: !!values.repartir,
    forcer: !!values.forcer,
    sansPorte: !!values['sans-porte'],
    sansConstruction: !!values['sans-construction'],
    horsSorties: !!values['hors-sorties'],
  };
  if (values.sortie) o.sortie = resolve(values.sortie);
  const fps = nombre(values.fps, 'fps', 1, 240);
  if (fps !== undefined) o.fps = fps;
  const flou = nombre(values.flou, 'flou', 1, 64);
  if (flou !== undefined) o.flou = Math.round(flou);
  const obt = nombre(values.obturateur, 'obturateur', 0, 1);
  if (obt !== undefined) o.obturateur = obt;
  if (taille) o.taille = taille;
  if (values.de !== undefined) o.de = values.de;
  if (values.a !== undefined) o.a = values.a;
  if (values.kit) o.kit = resolve(values.kit);
  if (values['rig-secours']) o.rigSecours = values['rig-secours'];
  const seg = nombre(values.segment, 'segment', 1, 100000);
  if (seg !== undefined) o.segment = Math.round(seg);
  return o;
}

/** Position dans le temps → numéro d'image : « 45 » (image), « 1.5s » (secondes), « 00:00:01:15 » (timecode). */
export function lirePosition(texte: string, fps: number): number {
  const s = texte.trim();
  if (/^\d+$/.test(s)) return Number(s);
  const sec = /^(\d+(?:[.,]\d+)?)s$/.exec(s);
  if (sec) return Math.round(Number(sec[1]!.replace(',', '.')) * fps);
  if (s.includes(':')) return Math.round(lireTimecode(s, fps) * fps);
  throw new ErreurUsage(`Position illisible « ${texte} » (image « 45 », secondes « 1.5s » ou timecode « 00:00:01:15 »)`);
}

/** Racine du dépôt git qui contient le moteur (null hors dépôt). */
function racineDepot(): string | null {
  let d = RACINE_MOTEUR;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, '.git'))) return d;
    const p = dirname(d);
    if (p === d) break;
    d = p;
  }
  return null;
}

const dedans = (chemin: string, dossier: string): boolean => chemin === dossier || chemin.startsWith(dossier + sep);

/** Charge les rigs des personnages du projet (dossiers, chemins explicites, rig de secours). */
export function chargerRigsProjet(
  projet: Projet,
  o: { dossiers: readonly string[]; explicites: Readonly<Record<string, string>>; secours?: string },
): { rigs: Record<string, CharacterRig>; avertissements: string[] } {
  const rigs: Record<string, CharacterRig> = {};
  const avertissements: string[] = [];
  const chercher = (id: string): string | null => {
    if (o.explicites[id]) return o.explicites[id]!;
    for (const d of o.dossiers) {
      for (const c of [join(d, id, 'rig.json'), join(d, `${id}.rig.json`)]) if (existsSync(c)) return c;
    }
    return null;
  };
  let secours: CharacterRig | null | undefined;
  for (const id of [...new Set(projet.personnages.map((p) => p.rig))]) {
    const chemin = chercher(id);
    if (chemin) {
      const r = chargerRig(chemin).rig;
      rigs[id] = r.id === id ? r : { ...r, id };
      continue;
    }
    if (o.secours) {
      if (secours === undefined) {
        const c = existsSync(o.secours) ? resolve(o.secours) : chercher(o.secours);
        secours = c ? chargerRig(c).rig : null;
        if (!secours) avertissements.push(`rig de secours « ${o.secours} » introuvable`);
      }
      if (secours) {
        rigs[id] = { ...secours, id };
        avertissements.push(`rig « ${id} » introuvable : remplacé par le rig de secours « ${secours.id} »`);
        continue;
      }
    }
    avertissements.push(`rig « ${id} » introuvable (dossiers : ${o.dossiers.join(', ') || 'aucun'})`);
  }
  return { rigs, avertissements };
}

/** Indices des images échantillonnées pour la vérification (centres répartis et débuts de plans, avec voisins). */
export function choisirEchantillons(premiere: number, derniere: number, coupes: readonly number[], nombreCentres = 6): number[] {
  const N = derniere - premiere;
  const centres = new Set<number>();
  for (let i = 0; i < nombreCentres; i++) centres.add(premiere + Math.floor(((i + 0.5) * N) / nombreCentres));
  for (const c of coupes.slice(0, 4)) if (c > premiere && c < derniere - 1) centres.add(c + 1);
  const r = new Set<number>();
  for (const c of centres) for (const k of [c - 1, c, c + 1]) if (k >= premiere && k < derniere) r.add(k);
  return [...r].sort((a, b) => a - b);
}

/** Première image de chaque plan (sauf le premier). */
function coupesDuProjet(projet: Projet): number[] {
  return projet.plans.slice(1).map((p) => Math.ceil(p.debut * projet.fps - 1e-9));
}

/** Images où un effet plein cadre (fondu, flash, désaturation) varie : la lumière y change exprès. */
function imagesAEffets(projet: Projet, moteur: Moteur, premiere: number, derniere: number): number[] {
  const r: number[] = [];
  let prec: { fondu: number; flash: number; desaturation: number } | null = null;
  for (let n = premiere; n < derniere; n++) {
    const e = evaluer(projet, imageVersTemps(n, projet.fps), moteur).effets;
    if (prec && (Math.abs(e.fondu - prec.fondu) > 0.003 || e.flash > 0 || prec.flash > 0 || Math.abs(e.desaturation - prec.desaturation) > 0.01)) r.push(n);
    prec = e;
  }
  return r;
}

const ms = (x: number): string => (x >= 60000 ? `${Math.floor(x / 60000)} min ${Math.round((x % 60000) / 1000)} s` : `${(x / 1000).toFixed(1)} s`);

/** Rapport final de la commande. */
export interface RapportRendu {
  version: 'moteur-fluide/rapport@1';
  date: string;
  projet: { fichier: string; titre: string; empreinte: string };
  reglages: Record<string, unknown>;
  plage: { premiere: number; derniere: number; images: number; debut: string; fin: string };
  verdict: 'CONFORME' | 'NON CONFORME';
  etapes: Record<string, number>;
  avertissements: string[];
  porteEtats: RapportQualite | null;
  capture: Omit<ResultatCapture, 'empreintes' | 'references'> | null;
  audio: RapportAudio | null;
  verification: RapportVerification | null;
  portePixels: RapportQualite | null;
  planche: string | null;
  sortie: string | null;
  outils: ReturnType<typeof versionsOutils>;
}

function rapportEnMarkdown(r: RapportRendu): string {
  const l: string[] = [];
  l.push(`# Rendu « ${r.projet.titre} » — ${r.verdict}`);
  l.push('');
  l.push(`- Projet : \`${r.projet.fichier}\` (empreinte ${r.projet.empreinte})`);
  if (r.sortie) l.push(`- Vidéo : \`${r.sortie}\``);
  if (r.planche) l.push(`- Planche contact : \`${r.planche}\``);
  l.push(`- Plage : images ${r.plage.premiere} → ${r.plage.derniere} (${r.plage.images} images, ${r.plage.debut} → ${r.plage.fin})`);
  l.push(`- Réglages : ${Object.entries(r.reglages).map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' ; ')}`);
  l.push(`- Durées : ${Object.entries(r.etapes).map(([k, v]) => `${k} ${ms(v)}`).join(' ; ')}`);
  if (r.capture) {
    const c = r.capture;
    const pages = c.segments.filter((x) => !x.reutilise && x.msPage !== undefined);
    const msPage = pages.length ? pages.reduce((a, x) => a + x.msPage! * x.images, 0) / pages.reduce((a, x) => a + x.images, 0) : 0;
    l.push(
      `- Capture : ${c.rendues} images rendues${c.rendues ? ` (${c.msParImage.toFixed(0)} ms/image, dont ${msPage.toFixed(0)} ms dans la page)` : ''}, ${c.reutilisees} reprises de segments déjà rendus ; ${c.segments.length} segment(s)` +
        `${c.navigateur.version ? ` ; navigateur ${c.navigateur.version} (${c.navigateur.rendu})` : ''} ; capture ${c.format}${c.format === 'jpeg' ? ' q0,95' : ' sans perte'} ; x264 crf ${c.encodage.crf} ${c.encodage.preset} ${c.encodage.tune}`,
    );
    if (c.erreursConsole.length) l.push(`- Console de la page : ${c.erreursConsole.length} message(s) d'erreur — ${c.erreursConsole.slice(0, 5).join(' | ')}`);
  }
  if (r.audio) {
    const a = r.audio;
    l.push(`- Audio : ${a.sources.length} source(s), mode ${a.mode}${a.apres ? `, ${a.apres.integre.toFixed(1)} LUFS, crête ${a.apres.creteVraie.toFixed(1)} dBTP` : ''}`);
  }
  if (r.avertissements.length) {
    l.push('');
    l.push('### Avertissements');
    for (const a of r.avertissements) l.push(`- ${a}`);
  }
  if (r.porteEtats) {
    l.push('');
    l.push(qualiteEnMarkdown(r.porteEtats, 'Porte qualité sur l’état du moteur'));
  }
  if (r.verification) {
    l.push('');
    l.push(verificationEnMarkdown(r.verification));
  }
  if (r.portePixels) {
    l.push('');
    l.push(qualiteEnMarkdown(r.portePixels, 'Porte qualité sur les pixels'));
  }
  l.push('');
  l.push(`Outils : ${r.outils.ffmpeg}`);
  return `${l.join('\n')}\n`;
}

/** Programme principal. Renvoie le code de sortie. */
export async function principal(argv: readonly string[]): Promise<number> {
  let o: Options;
  try {
    const lu = lireOptions(argv);
    if (lu === 'aide') {
      console.log(AIDE);
      return 0;
    }
    o = lu;
  } catch (e) {
    console.error(`${(e as Error).message}\n`);
    console.error(AIDE);
    return 1;
  }
  try {
    return await executerRendu(o);
  } catch (e) {
    if (e instanceof OutilAbsent) {
      console.error(e.message);
      return 3;
    }
    if (e instanceof ErreurUsage) {
      console.error(e.message);
      return 1;
    }
    console.error(`Erreur : ${(e as Error).stack ?? String(e)}`);
    return 2;
  }
}

async function executerRendu(o: Options): Promise<number> {
  const chrono: Record<string, number> = {};
  const etape = async <T>(nom: string, f: () => Promise<T> | T): Promise<T> => {
    const t0 = performance.now();
    try {
      return await f();
    } finally {
      chrono[nom] = performance.now() - t0;
    }
  };
  const avertissements: string[] = [];
  const avertir = (m: string): void => {
    avertissements.push(m);
    console.warn(`avertissement — ${m}`);
  };

  // 1. Projet
  if (!existsSync(o.projet)) throw new ErreurUsage(`Projet introuvable : ${o.projet}`);
  const texte = readFileSync(o.projet, 'utf8');
  const valide = validerProjet(JSON.parse(texte));
  for (const a of valide.avertissements) avertir(a);
  if (!valide.ok || !valide.projet) {
    console.error(`Projet invalide (${valide.erreurs.length} erreur(s)) :`);
    for (const e of valide.erreurs) console.error(`  - ${e}`);
    return 1;
  }
  const projet: Projet = structuredClone(valide.projet);
  if (o.fps) projet.fps = o.fps;
  if (o.flou) projet.sortie.sousImages = o.flou;
  if (o.obturateur !== undefined) projet.sortie.obturateur = o.obturateur;
  if (o.taille) {
    projet.sortie.largeur = o.taille.largeur;
    projet.sortie.hauteur = o.taille.hauteur;
  }
  const fps = projet.fps;
  const total = nombreImages(projet.duree, fps);
  const premiere = o.de !== undefined ? lirePosition(o.de, fps) : 0;
  const derniere = Math.min(total, o.a !== undefined ? lirePosition(o.a, fps) : total);
  if (!(derniere > premiere) || premiere < 0) throw new ErreurUsage(`Plage vide ou invalide : [${premiere}, ${derniere}[ (projet : ${total} images)`);

  // 2. Ressources
  let decors: Record<string, InfoDecor> = {};
  const manifeste = o.kit ?? MANIFESTE_DECORS_DEFAUT;
  if (existsSync(manifeste)) {
    decors = chargerDecors(manifeste).decors;
    for (const p of projet.plans) if (!decors[p.decor]) avertir(`décor « ${p.decor} » absent du kit (plan ${p.id})`);
  } else avertir(`kit des décors introuvable (${manifeste})`);
  const dossiersRigs = o.rigs.length ? o.rigs : [join(RACINE_MOTEUR, 'assets-test'), resolve(RACINE_MOTEUR, '..', '.private', 'personnages')];
  const { rigs, avertissements: avRigs } = await etape('rigs', () =>
    chargerRigsProjet(projet, { dossiers: dossiersRigs, explicites: o.rig, ...(o.rigSecours ? { secours: o.rigSecours } : {}) }),
  );
  for (const a of avRigs) avertir(a);
  let ressources = { rigs, decors };
  try {
    ressources = await etape('analyse des décors', () => enrichirRessources(ressources, [...new Set(projet.plans.map((p) => p.decor))]));
  } catch (e) {
    avertir(`analyse des décors impossible (${(e as Error).message.split('\n')[0]}) : rendu sans étalonnage fin`);
  }
  const moteur = creerMoteurComplet(ressources);

  console.log(`Projet « ${projet.titre} » — ${projet.sortie.largeur}×${projet.sortie.hauteur}, ${fps} i/s, flou ${projet.sortie.sousImages} sous-image(s)`);
  console.log(`  durée ${formaterDuree(projet.duree)} ; plans ${projet.plans.length} ; personnages ${projet.personnages.length} ; rigs chargés ${Object.keys(rigs).join(', ') || 'aucun'}`);
  console.log(`  plage : images ${premiere} → ${derniere} (${timecode(imageVersTemps(premiere, fps), fps)} → ${timecode(imageVersTemps(derniere, fps), fps)})`);

  const base = o.sortie ? o.sortie.replace(/\.mp4$/i, '') : null;
  const travail = base ? `${base}.travail` : null;
  if (o.sortie) {
    const depot = racineDepot();
    if (!o.horsSorties && depot && dedans(o.sortie, depot) && !dedans(o.sortie, resolve(DOSSIER_SORTIES))) {
      throw new ErreurUsage(
        `Sortie refusée : ${o.sortie} est dans le dépôt mais hors de ${DOSSIER_SORTIES} (les rendus utilisent les décors privés). ` +
          `Choisir ${join(DOSSIER_SORTIES, basename(o.sortie))} ou ajouter --hors-sorties.`,
      );
    }
    if (!o.sortie.toLowerCase().endsWith('.mp4')) throw new ErreurUsage('--sortie : un fichier .mp4 est attendu');
    mkdirSync(travail!, { recursive: true });
    verifierOutils();
  }

  // 3. Audio (sources) et enveloppes des voix pour la synchro labiale
  const dossierTravailAudio = travail ?? join(DOSSIER_SORTIES, 'cache', 'audio');
  const collecte = await etape('sources audio', () => collecterSources(projet, { dossierProjet: dirname(o.projet), dossierTravail: dossierTravailAudio }));
  for (const m of collecte.manquants) avertir(m);
  if (collecte.manquants.length && o.sortie && !o.forcer) {
    console.error('Sons introuvables : rendu arrêté (--forcer pour continuer sans eux).');
    return 1;
  }
  const enveloppes: Record<string, Float64Array> = {};
  for (const s of collecte.sources) {
    if (s.type !== 'voix' || !s.personnage) continue;
    const env = await enveloppeRms(s.fichier, fps);
    const decalage = Math.round(s.debut * fps);
    const cible = (enveloppes[s.personnage] ??= new Float64Array(total + 1));
    for (let k = 0; k < env.length; k++) {
      const n = k + decalage;
      if (n >= 0 && n < cible.length) cible[n] = Math.max(cible[n]!, env[k]! * s.volume);
    }
  }

  // 4. Porte qualité sur l'état
  let porteEtats: RapportQualite | null = null;
  if (!o.sansPorte) {
    porteEtats = await etape('porte qualité (état)', () => porteProjet(projet, moteur, { premiere, derniere, enveloppes }));
    const echecs = porteEtats.mesures.filter((m) => !m.ok && m.bloquant !== false);
    console.log(`Porte qualité sur l'état : ${porteEtats.verdict} (${porteEtats.mesures.length} critères, ${echecs.length} échec(s))`);
    for (const m of echecs) console.log(`  ÉCHEC ${m.personnage ? `[${m.personnage}] ` : ''}${m.nom} : ${Number.isInteger(m.valeur) ? m.valeur : m.valeur.toFixed(3)}${m.unite ? ` ${m.unite}` : ''} (seuil ${m.seuil})${m.detail ? ` — ${m.detail}` : ''}`);
  }
  const empreinteProjet = createHash('sha256').update(JSON.stringify(projet)).digest('hex').slice(0, 16);
  const rapport: RapportRendu = {
    version: 'moteur-fluide/rapport@1',
    date: new Date().toISOString(),
    projet: { fichier: o.projet, titre: projet.titre, empreinte: empreinteProjet },
    reglages: {
      taille: `${projet.sortie.largeur}x${projet.sortie.hauteur}`,
      fps,
      flou: projet.sortie.sousImages,
      obturateur: projet.sortie.obturateur,
      capture: o.capture,
      qualite: o.qualite,
      x264: { crf: o.crf, preset: o.preset, tune: o.tune, fils: o.fils },
      paralleles: o.paralleles,
    },
    plage: { premiere, derniere, images: derniere - premiere, debut: timecode(imageVersTemps(premiere, fps), fps), fin: timecode(imageVersTemps(derniere, fps), fps) },
    verdict: 'NON CONFORME',
    etapes: chrono,
    avertissements,
    porteEtats,
    capture: null,
    audio: null,
    verification: null,
    portePixels: null,
    planche: null,
    sortie: null,
    outils: versionsOutils(),
  };
  const ecrireRapports = (): void => {
    if (!base) return;
    writeFileSync(`${base}.rapport.json`, JSON.stringify(rapport, (_k, v: unknown) => (v instanceof Float64Array ? undefined : v), 2));
    writeFileSync(`${base}.rapport.md`, rapportEnMarkdown(rapport));
    console.log(`Rapports : ${base}.rapport.md (+ .json)`);
  };

  if (!o.sortie) {
    rapport.verdict = porteEtats && porteEtats.verdict === 'FAIL' ? 'NON CONFORME' : 'CONFORME';
    console.log('Aucun MP4 demandé (--sortie) : vérification de l’état seulement.');
    return porteEtats?.verdict === 'FAIL' ? 4 : 0;
  }
  if (porteEtats?.verdict === 'FAIL' && !o.forcer) {
    console.error('Porte qualité en échec : rendu arrêté avant la capture (--forcer pour rendre quand même).');
    ecrireRapports();
    return 4;
  }

  // 5. Page de rendu
  if (!o.sansConstruction) {
    await etape('construction de la page', () => {
      const r = spawnSync(process.execPath, [join(RACINE_MOTEUR, 'scripts', 'construire-page.mjs')], { cwd: RACINE_MOTEUR, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`Construction de la page impossible : ${r.stderr || r.stdout}`);
    });
  }

  // 6. Capture
  const coupes = coupesDuProjet(projet).filter((c) => c > premiere && c < derniere);
  let dernierAffichage = 0;
  const capture = await etape('capture', () =>
    capturerVideo({
      projet,
      moteur,
      dossierPage: join(RACINE_MOTEUR, 'dist'),
      dossierTravail: travail!,
      premiere,
      derniere,
      ...(o.segment ? { tailleSegment: o.segment } : {}),
      format: o.capture,
      qualite: o.qualite,
      encodage: { crf: o.crf, preset: o.preset, tune: o.tune, fils: o.fils },
      paralleles: o.paralleles,
      echantillons: choisirEchantillons(premiere, derniere, coupes),
      repartir: o.repartir,
      surProgres: (p) => {
        const maintenant = performance.now();
        if (p.reutilise) {
          if (p.faites === p.total || maintenant - dernierAffichage >= 4000) console.log(`  capture ${p.faites}/${p.total} (segments déjà rendus, repris)`);
          dernierAffichage = maintenant;
          return;
        }
        if (p.faites < p.total && maintenant - dernierAffichage < 4000) return;
        dernierAffichage = maintenant;
        const reste = p.msParImage > 0 ? ` ; reste ≈ ${ms(((p.total - p.faites) * p.msParImage) / Math.max(1, o.paralleles))}` : '';
        console.log(`  capture ${p.faites}/${p.total}${p.reutilise ? ' (segments repris)' : ` ; ${p.msParImage.toFixed(0)} ms/image`}${reste}`);
      },
    }),
  );
  const { empreintes: _e, references: _r, ...resumeCapture } = capture;
  rapport.capture = resumeCapture;
  for (const m of capture.erreursConsole.slice(0, 20)) avertir(`page de rendu — ${m}`);
  console.log(
    capture.rendues > 0
      ? `Capture : ${capture.rendues} image(s) rendue(s) à ${capture.msParImage.toFixed(0)} ms/image, ${capture.reutilisees} reprise(s) ; ${capture.navigateur.rendu}`
      : `Capture : les ${capture.reutilisees} images viennent de segments déjà rendus (même clé de rendu)`,
  );

  // 7. Audio
  const t0 = imageVersTemps(premiere, fps);
  const t1 = imageVersTemps(derniere, fps);
  const wav = join(travail!, 'mix.wav');
  const audio = await etape('mixage audio', () => mixerAudio({ sources: collecte.sources, debut: t0, fin: t1, sortie: wav }));
  rapport.audio = audio;
  console.log(`Audio : ${audio.sources.length} source(s), ${audio.mode}${audio.apres ? `, ${audio.apres.integre.toFixed(1)} LUFS` : ''}`);

  // 8. Multiplexage
  await etape('multiplexage', () => multiplexer({ video: capture.video, audio: wav, sortie: o.sortie!, titre: projet.titre }));
  rapport.sortie = o.sortie;

  // 9. Vérification
  const verification = await etape('vérification', () =>
    verifierVideo(o.sortie!, {
      largeur: projet.sortie.largeur,
      hauteur: projet.sortie.hauteur,
      fps,
      images: derniere - premiere,
      audio: true,
      audioSilencieux: audio.mode === 'silence',
      premiereImage: premiere,
      references: capture.references,
      empreintes: capture.empreintes,
    }),
  );
  rapport.verification = verification;
  ecrireRapportVerification(verification, `${base}.verification`);
  console.log(`Vérification du MP4 : ${verification.ok ? 'CONFORME' : 'NON CONFORME'}`);
  for (const c of verification.controles.filter((x) => !x.ok)) console.log(`  ${c.bloquant ? 'ÉCHEC' : 'avertissement'} ${c.nom} : ${c.valeur} (attendu ${c.attendu})`);

  // 10. Pixels et planche contact
  const gels = projet.pistes.camera.filter((c) => c.type === 'gel').map((c) => ({ debut: c.debut, fin: c.debut + c.duree }));
  const effets = imagesAEffets(projet, moteur, premiere, derniere);
  const pixels = await etape('porte qualité (pixels)', () => analyserPixels(o.sortie!, { fps, premiereImage: premiere, coupes, gels, effets }));
  rapport.portePixels = portePixels(pixels, fps);
  console.log(`Porte qualité sur les pixels : ${rapport.portePixels.verdict} (dynamique ${pixels.dynamique.toFixed(2)}, figé max ${pixels.figeMax.toFixed(2)} s)`);
  const planche = `${base}.planche.png`;
  await etape('planche contact', () => plancheContact(o.sortie!, planche, { fps, images: derniere - premiere, premiereImage: premiere }));
  rapport.planche = planche;

  const qaOk = (!porteEtats || porteEtats.verdict === 'PASS') && rapport.portePixels.verdict === 'PASS';
  rapport.verdict = verification.ok && qaOk ? 'CONFORME' : 'NON CONFORME';
  ecrireRapports();
  console.log(`Résultat : ${rapport.verdict} — ${o.sortie} (${relative(process.cwd(), planche) || planche})`);
  if (!verification.ok) return 5;
  return qaOk ? 0 : 4;
}

export type { SeuilsQualite };
