/**
 * Capture image par image dans Chromium sans écran (Playwright) et encodage H.264 par FFmpeg.
 *
 * Principe :
 * - Node évalue les sous-états de chaque image (`etatsImage`, fonction pure du temps : flou de bougé exact) ;
 * - la page de rendu (`dist/page.html`, PixiJS en WebGL logiciel SwiftShader) les dessine
 *   (`window.moteurFluide.dessiner`) puis renvoie l'image (`capturer`, JPEG q0,95 par défaut : la voie la plus
 *   rapide mesurée, 43 dB, au-dessus de la perte de x264 ; PNG sans perte en option) ;
 * - les images partent en flux vers `ffmpeg -f image2pipe` → libx264 High, yuv420p BT.709 étiqueté, CRF 18 ;
 * - le rendu est découpé en SEGMENTS (2 s par défaut) écrits chacun dans son MP4 et validés par ffprobe : après un
 *   arrêt brutal, les segments déjà valides (même clé de rendu) sont réutilisés, seuls les manquants sont rendus ;
 * - plusieurs navigateurs peuvent rendre des segments disjoints en parallèle (`paralleles`), ce qui n'est possible
 *   que parce que `evaluer` est pur ;
 * - les segments sont assemblés sans réencodage (démultiplexeur `concat`, `-c copy`).
 *
 * Rien n'est simulé : chaque image vient de la page, chaque segment est recompté par ffprobe.
 */
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { etatsImage } from '../timeline/evaluer';
import type { ApiPageRendu, EtatImage, Moteur, OptionsPageRendu, Projet } from '../timeline/types';
import { dernieresLignes, ffmpeg, ffprobeJson, FFMPEG } from './processus';
import { cheminsCites, demarrerServeur, type ServeurLocal } from './serveur';

/** Version du format de capture : la changer invalide les segments déjà rendus. */
export const VERSION_CAPTURE = 'capture@1';

/** Arguments Chromium : WebGL logiciel SwiftShader assumé (pas de GPU), sans bac à sable GPU. */
export const ARGS_NAVIGATEUR = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--mute-audio'];

/** Format des images capturées. */
export type FormatCapture = 'jpeg' | 'png';

/** Réglages de l'encodeur H.264. */
export interface ReglagesEncodage {
  crf: number;
  preset: string;
  /** `animation` convient aux aplats ; `film` aux peintures très texturées ; `aucun` pour désactiver. */
  tune: string;
  /** Fils de x264 (limiter : d'autres travaux partagent la machine). */
  fils: number;
}

export const ENCODAGE_DEFAUT: ReglagesEncodage = { crf: 18, preset: 'medium', tune: 'animation', fils: 2 };

/** Avancement de la capture. */
export interface ProgresCapture {
  faites: number;
  total: number;
  msParImage: number;
  segment: { debut: number; fin: number };
  reutilise: boolean;
}

/** Options de la capture. */
export interface OptionsCapture {
  projet: Projet;
  moteur: Moteur;
  /** Dossier de la page construite (contient `page.html`). */
  dossierPage: string;
  /** Dossier de travail (segments, références) — dans `studio-troupe/sorties/` pour les décors privés. */
  dossierTravail: string;
  /** Plage d'images `[premiere, derniere[`. */
  premiere: number;
  derniere: number;
  /** Images par segment (défaut : 2 s). */
  tailleSegment?: number;
  format?: FormatCapture;
  /** Qualité JPEG (0…1, défaut 0,95). */
  qualite?: number;
  encodage?: Partial<ReglagesEncodage>;
  /** Navigateurs en parallèle (défaut 1). */
  paralleles?: number;
  /** Images dont la capture est gardée comme référence (contrôle d'ordre et de fidélité du MP4). */
  echantillons?: readonly number[];
  argsNavigateur?: readonly string[];
  /** Fichiers supplémentaires autorisés par le serveur (en plus de ceux cités par les ressources). */
  fichiersAutorises?: readonly string[];
  /** Élément ajouté à la clé de rendu. */
  cleSupplementaire?: string;
  /** Repartir de zéro (ignorer les segments existants). */
  repartir?: boolean;
  surProgres?: (p: ProgresCapture) => void;
  /** Sous-états de l'image `n` (défaut : `etatsImage(projet, n, moteur)`). */
  etats?: (n: number) => EtatImage[];
}

/** Description d'un segment rendu. */
export interface Segment {
  debut: number;
  fin: number;
  fichier: string;
  images: number;
  reutilise: boolean;
  msParImage: number;
  /** Part du temps passée dans la page (évaluation des états, dessin, capture) et en attente de l'encodeur (ms/image). */
  msPage?: number;
  msAttenteEncodeur?: number;
}

/** Résultat de la capture. */
export interface ResultatCapture {
  /** MP4 vidéo seule (segments assemblés). */
  video: string;
  images: number;
  premiere: number;
  derniere: number;
  segments: Segment[];
  /** Temps moyen par image rendue maintenant (ms), segments réutilisés exclus. */
  msParImage: number;
  dureeMs: number;
  rendues: number;
  reutilisees: number;
  /** Images de référence gardées : index d'image → fichier. */
  references: Record<number, string>;
  /** Empreinte (SHA-1 des octets capturés) de chaque image de la plage, dans l'ordre. */
  empreintes: string[];
  erreursConsole: string[];
  navigateur: { version: string; rendu: string };
  cle: string;
  format: FormatCapture;
  encodage: ReglagesEncodage;
}

/** Manifeste d'un segment validé. */
interface ManifesteSegment {
  version: string;
  cle: string;
  debut: number;
  fin: number;
  images: number;
  taille: number;
  empreintes: string[];
  references: Record<string, string>;
  msParImage: number;
  msPage?: number;
  msAttenteEncodeur?: number;
  date: string;
}

const pad = (n: number): string => String(n).padStart(6, '0');

/** Niveau H.264 adapté à la taille et à la cadence (4.1 pour 1080×1920 à 30 i/s, 4.2 à 60 i/s). */
export function niveauH264(largeur: number, hauteur: number, fps: number): string | null {
  const mb = Math.ceil(largeur / 16) * Math.ceil(hauteur / 16);
  const debit = mb * fps;
  const niveaux: Array<[string, number, number]> = [
    ['3.1', 3600, 108000],
    ['4.1', 8192, 245760],
    ['4.2', 8704, 522240],
    ['5.1', 36864, 983040],
    ['5.2', 36864, 2073600],
  ];
  for (const [n, maxMb, maxDebit] of niveaux) if (mb <= maxMb && debit <= maxDebit) return n;
  return null;
}

/** Arguments FFmpeg d'encodage d'un segment (entrée : images JPEG ou PNG en flux sur stdin). */
export function argsEncodage(o: { fps: number; largeur: number; hauteur: number; format: FormatCapture; encodage: ReglagesEncodage; sortie: string }): string[] {
  const e = o.encodage;
  // JPEG (JFIF) : YCbCr BT.601 pleine échelle ; PNG : RVB. Sortie : BT.709 échelle TV, étiquetée (sinon les tons
  // chair dérivent à la lecture, mesuré dans la note de recherche 05). Conversions mesurées sur une peinture du kit
  // (1080×1920, x264 crf 18, machine chargée) :
  // - JPEG → filtre `colorspace` (matrice et échelle dans l'espace YUV) : 40,8 dB, 61 ms/image de bout en bout,
  //   contre 178 ms avec `scale` (accurate_rnd + full_chroma_int) pour la même fidélité ; sans ces drapeaux, `scale`
  //   tombe à 37,5 dB ;
  // - PNG → `scale` simple : 42,0 dB (accurate_rnd + full_chroma_int n'apportent rien : 42,1 dB, deux fois plus lent).
  const filtre =
    o.format === 'jpeg'
      ? `colorspace=space=bt709:trc=bt709:primaries=bt709:range=tv:ispace=bt470bg:itrc=bt709:iprimaries=bt709:irange=pc:format=yuv420p,scale=w=${o.largeur}:h=${o.hauteur},format=yuv420p`
      : `scale=w=${o.largeur}:h=${o.hauteur}:out_color_matrix=bt709:out_range=tv:flags=bicubic,format=yuv420p`;
  const niveau = niveauH264(o.largeur, o.hauteur, o.fps);
  return [
    '-hide_banner', '-nostdin', '-y', '-v', 'error',
    '-f', 'image2pipe', '-framerate', String(o.fps), '-c:v', o.format === 'jpeg' ? 'mjpeg' : 'png', '-i', '-',
    '-vf', filtre,
    '-c:v', 'libx264', '-preset', e.preset, '-crf', String(e.crf),
    ...(e.tune && e.tune !== 'aucun' ? ['-tune', e.tune] : []),
    '-profile:v', 'high', ...(niveau ? ['-level:v', niveau] : []),
    '-g', String(Math.max(1, Math.round(o.fps * 2))), '-bf', '2', '-threads', String(Math.max(1, e.fils)),
    '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-r', String(o.fps), '-an',
    '-movflags', '+faststart',
    o.sortie,
  ];
}

/** Nombre d'images d'un fichier vidéo, compté en décodant (`-count_frames`). */
export async function compterImages(fichier: string): Promise<number> {
  const j = await ffprobeJson(['-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', fichier]);
  const s = (j.streams as Array<{ nb_read_frames?: string }> | undefined)?.[0];
  return Number(s?.nb_read_frames ?? Number.NaN);
}

/** Empreinte SHA-256 d'un fichier (court). */
function empreinteFichier(chemin: string): string {
  return existsSync(chemin) ? createHash('sha256').update(readFileSync(chemin)).digest('hex').slice(0, 16) : 'absent';
}

/** Clé de rendu : tout ce qui change les pixels ou l'encodage. Deux rendus de même clé donnent les mêmes segments. */
export function cleRendu(o: OptionsCapture, format: FormatCapture, qualite: number, encodage: ReglagesEncodage): string {
  const h = createHash('sha256');
  h.update(VERSION_CAPTURE);
  h.update(JSON.stringify(o.projet));
  h.update(JSON.stringify(o.moteur.ressources));
  for (const c of [...cheminsCites(o.moteur.ressources)].sort()) {
    const s = statSync(c);
    h.update(`${c}:${s.size}:${s.mtimeMs}`);
  }
  h.update(empreinteFichier(join(o.dossierPage, 'page.html')));
  h.update(empreinteFichier(join(o.dossierPage, 'page.js')));
  h.update(JSON.stringify({ format, qualite, encodage, args: o.argsNavigateur ?? ARGS_NAVIGATEUR, extra: o.cleSupplementaire ?? '' }));
  return h.digest('hex').slice(0, 24);
}

/** Fenêtre de la page de rendu (contrat `ApiPageRendu` exposé sur `window.moteurFluide`). */
interface FenetreRendu {
  moteurFluide?: ApiPageRendu;
}

/** Un navigateur et sa page de rendu initialisée. */
class Poste {
  private navigateur: Browser | null = null;
  private page: Page | null = null;
  readonly erreurs: string[] = [];
  version = '';
  rendu = '';

  constructor(
    private readonly serveur: ServeurLocal,
    private readonly optionsPage: OptionsPageRendu,
    private readonly args: readonly string[],
    private readonly graine: number,
  ) {}

  async ouvrir(): Promise<void> {
    this.navigateur = await chromium.launch({ headless: true, args: [...this.args] });
    this.version = this.navigateur.version();
    const contexte = await this.navigateur.newContext({
      viewport: { width: this.optionsPage.largeur, height: this.optionsPage.hauteur },
      deviceScaleFactor: 1,
    });
    // Aléa du navigateur figé : une bibliothèque tierce ne doit jamais rendre l'image dépendante du hasard.
    await contexte.addInitScript((graine: number) => {
      let e = graine >>> 0 || 1;
      Math.random = () => {
        e ^= e << 13;
        e >>>= 0;
        e ^= e >>> 17;
        e ^= e << 5;
        e >>>= 0;
        return e / 4294967296;
      };
    }, this.graine);
    const page = await contexte.newPage();
    this.page = page;
    page.on('pageerror', (e) => this.erreurs.push(`exception : ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') this.erreurs.push(`console : ${m.text()}`);
    });
    await page.goto(`${this.serveur.origine}/page.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => (window as unknown as FenetreRendu).moteurFluide !== undefined, undefined, { timeout: 30000 });
    this.rendu = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
      if (!gl) return 'aucun WebGL';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    });
    await page.evaluate(async (o) => {
      await (window as unknown as FenetreRendu).moteurFluide!.initialiser(o);
    }, this.optionsPage);
  }

  /** Dessine une image (moyenne des sous-états) et renvoie les octets capturés. */
  async rendre(etats: EtatImage[], format: FormatCapture, qualite: number): Promise<Buffer> {
    if (!this.page) throw new Error('Poste de capture non ouvert');
    const url = await this.page.evaluate(
      async ({ etats, format, qualite }) => {
        const api = (window as unknown as FenetreRendu).moteurFluide!;
        await api.dessiner(etats);
        return api.capturer(format, qualite);
      },
      { etats, format, qualite },
    );
    const virgule = url.indexOf(',');
    if (!url.startsWith('data:image/') || virgule < 0) throw new Error(`Capture invalide (« ${url.slice(0, 40)}… »)`);
    const attendu = format === 'png' ? 'data:image/png' : 'data:image/jpeg';
    if (!url.startsWith(attendu)) throw new Error(`Capture au mauvais format : ${url.slice(0, 30)} (attendu ${attendu})`);
    return Buffer.from(url.slice(virgule + 1), 'base64');
  }

  async fermer(): Promise<void> {
    await this.navigateur?.close().catch(() => undefined);
    this.navigateur = null;
    this.page = null;
  }
}

/** Encode une suite d'images vers un MP4 (processus FFmpeg alimenté en flux, avec contre-pression). */
class Encodeur {
  private readonly p;
  private stderr = '';
  private fini: Promise<number>;
  constructor(args: string[]) {
    this.p = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    this.p.stderr.on('data', (d: Buffer) => {
      this.stderr += d.toString('utf8');
    });
    this.p.stdin.on('error', () => undefined);
    this.fini = new Promise((ok, ko) => {
      this.p.on('error', ko);
      this.p.on('close', (code) => ok(code ?? -1));
    });
  }
  async ecrire(b: Buffer): Promise<void> {
    if (this.p.exitCode !== null) throw new Error(`ffmpeg s'est arrêté : ${dernieresLignes(this.stderr)}`);
    if (!this.p.stdin.write(b)) await Promise.race([once(this.p.stdin, 'drain'), this.fini]);
  }
  async terminer(): Promise<void> {
    this.p.stdin.end();
    const code = await this.fini;
    if (code !== 0) throw new Error(`Encodage ffmpeg échoué (code ${code}) : ${dernieresLignes(this.stderr)}`);
  }
  tuer(): void {
    this.p.kill('SIGKILL');
  }
}

/** Découpe `[premiere, derniere[` en segments alignés sur des multiples de `taille`. */
export function decouperSegments(premiere: number, derniere: number, taille: number): Array<{ debut: number; fin: number }> {
  const r: Array<{ debut: number; fin: number }> = [];
  if (!(taille >= 1)) throw new Error('taille de segment invalide');
  let a = premiere;
  while (a < derniere) {
    const b = Math.min(derniere, (Math.floor(a / taille) + 1) * taille);
    r.push({ debut: a, fin: b });
    a = b;
  }
  return r;
}

/** Assemble des segments MP4 (même encodage) sans réencoder. */
export async function assemblerSegments(fichiers: readonly string[], sortie: string): Promise<void> {
  const liste = `${sortie}.liste.txt`;
  writeFileSync(liste, fichiers.map((f) => `file '${resolve(f).replace(/'/g, `'\\''`)}'`).join('\n') + '\n');
  const tmp = `${sortie}.tmp.mp4`;
  await ffmpeg(['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', liste, '-c', 'copy', '-movflags', '+faststart', tmp]);
  renameSync(tmp, sortie);
  rmSync(liste, { force: true });
}

/**
 * Rend la plage d'images et produit un MP4 vidéo seule. Reprend un rendu interrompu (segments valides réutilisés).
 */
export async function capturerVideo(o: OptionsCapture): Promise<ResultatCapture> {
  const debutChrono = performance.now();
  const projet = o.projet;
  const fps = projet.fps;
  const largeur = projet.sortie.largeur;
  const hauteur = projet.sortie.hauteur;
  const format = o.format ?? 'jpeg';
  const qualite = o.qualite ?? 0.95;
  const encodage: ReglagesEncodage = { ...ENCODAGE_DEFAUT, ...(o.encodage ?? {}) };
  if (!(o.derniere > o.premiere)) throw new Error('capturerVideo : plage vide');
  if (!existsSync(join(o.dossierPage, 'page.html'))) throw new Error(`Page de rendu absente : ${join(o.dossierPage, 'page.html')} (lancer « npm run build »)`);
  const cle = cleRendu(o, format, qualite, encodage);
  const dossierSeg = join(o.dossierTravail, 'segments');
  const dossierRef = join(o.dossierTravail, 'references');
  if (o.repartir) {
    rmSync(dossierSeg, { recursive: true, force: true });
    rmSync(dossierRef, { recursive: true, force: true });
  }
  mkdirSync(dossierSeg, { recursive: true });
  mkdirSync(dossierRef, { recursive: true });
  const ext = format === 'png' ? 'png' : 'jpg';
  const echantillons = new Set(o.echantillons ?? []);
  const etatsDe = o.etats ?? ((n: number) => etatsImage(projet, n, o.moteur));

  const plan = decouperSegments(o.premiere, o.derniere, Math.max(1, Math.round(o.tailleSegment ?? fps * 2)));
  const nom = (s: { debut: number; fin: number }) => join(dossierSeg, `seg-${pad(s.debut)}-${pad(s.fin)}`);
  const manifestes = new Map<number, ManifesteSegment>();
  const aFaire: Array<{ debut: number; fin: number }> = [];
  for (const s of plan) {
    const base = nom(s);
    let ok = false;
    if (existsSync(`${base}.json`) && existsSync(`${base}.mp4`)) {
      try {
        const m = JSON.parse(readFileSync(`${base}.json`, 'utf8')) as ManifesteSegment;
        ok = m.version === VERSION_CAPTURE && m.cle === cle && m.debut === s.debut && m.fin === s.fin && m.images === s.fin - s.debut && statSync(`${base}.mp4`).size === m.taille;
        if (ok) manifestes.set(s.debut, m);
      } catch {
        ok = false;
      }
    }
    if (!ok) aFaire.push(s);
  }

  const segments: Segment[] = [];
  const erreursConsole: string[] = [];
  let navigateur = { version: '', rendu: '' };
  let rendues = 0;
  let msRendu = 0;
  let faites = 0;
  const total = o.derniere - o.premiere;
  for (const s of plan) {
    if (!manifestes.has(s.debut)) continue;
    faites += s.fin - s.debut;
    o.surProgres?.({ faites, total, msParImage: 0, segment: s, reutilise: true });
  }

  if (aFaire.length > 0) {
    const autorises = new Set([...cheminsCites(o.moteur.ressources), ...(o.fichiersAutorises ?? [])]);
    const serveur = await demarrerServeur(o.dossierPage, autorises);
    const optionsPage: OptionsPageRendu = {
      largeur,
      hauteur,
      ressources: o.moteur.ressources,
      urlRessources: serveur.urlRessources,
      ...(projet.sortie.fond ? { fond: projet.sortie.fond } : {}),
    };
    const nPostes = Math.max(1, Math.min(o.paralleles ?? 1, aFaire.length));
    const postes: Poste[] = [];
    const file = [...aFaire];
    let arret: Error | null = null;
    /** Termine un segment : fin de l'encodage, recomptage ffprobe, renommage, manifeste (en parallèle du suivant). */
    const finaliserSegment = async (
      s: { debut: number; fin: number },
      enc: Encodeur,
      tmp: string,
      infos: { empreintes: string[]; references: Record<string, string>; ms: number; msPage: number; msEncodeur: number },
    ): Promise<void> => {
      const base = nom(s);
      try {
        await enc.terminer();
      } catch (e) {
        rmSync(tmp, { force: true });
        throw e;
      }
      const images = await compterImages(tmp);
      if (images !== s.fin - s.debut) throw new Error(`Segment ${s.debut}–${s.fin} : ${images} images décodées au lieu de ${s.fin - s.debut}`);
      renameSync(tmp, `${base}.mp4`);
      const manifeste: ManifesteSegment = {
        version: VERSION_CAPTURE,
        cle,
        debut: s.debut,
        fin: s.fin,
        images,
        taille: statSync(`${base}.mp4`).size,
        empreintes: infos.empreintes,
        references: infos.references,
        msParImage: infos.ms / images,
        msPage: infos.msPage / images,
        msAttenteEncodeur: infos.msEncodeur / images,
        date: new Date().toISOString(),
      };
      writeFileSync(`${base}.json.tmp`, JSON.stringify(manifeste));
      renameSync(`${base}.json.tmp`, `${base}.json`);
      manifestes.set(s.debut, manifeste);
    };
    const travailleur = async (poste: Poste): Promise<void> => {
      await poste.ouvrir();
      if (!navigateur.version) navigateur = { version: poste.version, rendu: poste.rendu };
      // Au plus deux segments en fin d'encodage par poste : la page commence le segment suivant pendant que x264
      // vide son anticipation (rc-lookahead) sur le précédent.
      const enCours: Array<Promise<void>> = [];
      let erreur: unknown = null;
      try {
        while (!arret) {
          const s = file.shift();
          if (!s) break;
          const tmp = `${nom(s)}.tmp.mp4`;
          const enc = new Encodeur(argsEncodage({ fps, largeur, hauteur, format, encodage, sortie: tmp }));
          const empreintes: string[] = [];
          const references: Record<string, string> = {};
          const t0 = performance.now();
          let msPage = 0;
          let msEncodeur = 0;
          try {
            for (let n = s.debut; n < s.fin; n++) {
              if (arret) throw arret;
              const a = performance.now();
              const octets = await poste.rendre(etatsDe(n), format, qualite);
              msPage += performance.now() - a;
              empreintes.push(createHash('sha1').update(octets).digest('hex'));
              if (echantillons.has(n)) {
                const ref = join(dossierRef, `${cle}-${pad(n)}.${ext}`);
                writeFileSync(ref, octets);
                references[String(n)] = ref;
              }
              const b = performance.now();
              await enc.ecrire(octets);
              msEncodeur += performance.now() - b;
              faites++;
              rendues++;
              o.surProgres?.({ faites, total, msParImage: (performance.now() - t0) / (n - s.debut + 1), segment: s, reutilise: false });
            }
          } catch (e) {
            enc.tuer();
            rmSync(tmp, { force: true });
            throw e;
          }
          const ms = performance.now() - t0;
          msRendu += ms;
          enCours.push(finaliserSegment(s, enc, tmp, { empreintes, references, ms, msPage, msEncodeur }));
          if (enCours.length >= 2) await enCours.shift();
        }
      } catch (e) {
        erreur = e;
      }
      // Les segments déjà capturés finissent leur encodage même après une erreur (ils serviront à la reprise).
      const fin = await Promise.allSettled(enCours);
      if (erreur) throw erreur;
      const echec = fin.find((x) => x.status === 'rejected');
      if (echec && echec.status === 'rejected') throw echec.reason;
    };
    try {
      for (let i = 0; i < nPostes; i++) {
        postes.push(new Poste(serveur, optionsPage, o.argsNavigateur ?? ARGS_NAVIGATEUR, (projet.sortie.graine >>> 0) + 1));
      }
      const r = await Promise.allSettled(
        postes.map((p) =>
          travailleur(p).catch((e: unknown) => {
            arret = arret ?? (e instanceof Error ? e : new Error(String(e)));
            throw e;
          }),
        ),
      );
      const echec = r.find((x) => x.status === 'rejected');
      if (echec && echec.status === 'rejected') throw echec.reason;
    } finally {
      for (const p of postes) {
        erreursConsole.push(...p.erreurs);
        await p.fermer();
      }
      await serveur.fermer();
      if (serveur.refusees.length) erreursConsole.push(...serveur.refusees.map((u) => `ressource refusée par le serveur local : ${u}`));
    }
  }

  const empreintes: string[] = [];
  const references: Record<number, string> = {};
  for (const s of plan) {
    const m = manifestes.get(s.debut);
    if (!m) throw new Error(`Segment ${s.debut}–${s.fin} manquant après le rendu`);
    const reutilise = !aFaire.some((a) => a.debut === s.debut);
    segments.push({
      debut: s.debut,
      fin: s.fin,
      fichier: `${nom(s)}.mp4`,
      images: m.images,
      reutilise,
      msParImage: m.msParImage,
      ...(m.msPage !== undefined ? { msPage: m.msPage } : {}),
      ...(m.msAttenteEncodeur !== undefined ? { msAttenteEncodeur: m.msAttenteEncodeur } : {}),
    });
    empreintes.push(...m.empreintes);
    for (const [k, v] of Object.entries(m.references)) if (existsSync(v)) references[Number(k)] = v;
  }
  const video = join(o.dossierTravail, 'video.mp4');
  await assemblerSegments(
    segments.map((s) => s.fichier),
    video,
  );
  return {
    video,
    images: total,
    premiere: o.premiere,
    derniere: o.derniere,
    segments,
    msParImage: rendues > 0 ? msRendu / rendues : 0,
    dureeMs: performance.now() - debutChrono,
    rendues,
    reutilisees: total - rendues,
    references,
    empreintes,
    erreursConsole,
    navigateur,
    cle,
    format,
    encodage,
  };
}
