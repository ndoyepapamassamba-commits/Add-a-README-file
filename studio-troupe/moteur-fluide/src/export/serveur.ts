/**
 * Petit serveur HTTP local (127.0.0.1, port libre) pour la capture : sert la page de rendu construite (`dist/`) et
 * les images des ressources LUES SUR PLACE (rigs, décors du kit privé), sans jamais les copier.
 *
 * Sécurité : seuls les fichiers de `dist/` et les chemins absolus présents dans les ressources (liste blanche) sont
 * servis ; tout le reste répond 404. Le serveur n'écoute que sur la boucle locale.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, isAbsolute, join, normalize, resolve, sep } from 'node:path';

/** Préfixe d'URL des ressources (`OptionsPageRendu.urlRessources` = origine + ce préfixe). */
export const PREFIXE_RESSOURCES = '/ressources';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

/** Serveur démarré. */
export interface ServeurLocal {
  /** Origine, par exemple `http://127.0.0.1:41234`. */
  origine: string;
  /** URL des ressources à passer à la page (`urlRessources`). */
  urlRessources: string;
  /** Requêtes refusées (404), pour le rapport. */
  refusees: string[];
  fermer(): Promise<void>;
}

/** Tous les chemins absolus de fichiers existants cités (récursivement) dans un objet de ressources. */
export function cheminsCites(objet: unknown, max = 100000): Set<string> {
  const vus = new Set<string>();
  const pile: unknown[] = [objet];
  let n = 0;
  while (pile.length && n++ < max) {
    const o = pile.pop();
    if (typeof o === 'string') {
      if (isAbsolute(o) && o.length < 4096 && existsSync(o) && statSync(o).isFile()) vus.add(normalize(o));
    } else if (Array.isArray(o)) {
      // Les grands tableaux de nombres (maillages) ne contiennent pas de chemins.
      if (o.length > 0 && typeof o[0] === 'number') continue;
      for (const x of o) pile.push(x);
    } else if (o && typeof o === 'object') {
      for (const v of Object.values(o as Record<string, unknown>)) pile.push(v);
    }
  }
  return vus;
}

/**
 * Démarre le serveur. `dossierPage` = dossier de la page construite (`dist/`), `autorises` = chemins absolus des
 * fichiers de ressources servis sous `/ressources/<chemin encodé>`.
 */
export async function demarrerServeur(dossierPage: string, autorises: Iterable<string>): Promise<ServeurLocal> {
  const racinePage = resolve(dossierPage);
  const liste = new Set<string>([...autorises].map((c) => normalize(c)));
  const refusees: string[] = [];
  const serveur: Server = createServer((req, res) => {
    const refuser = (code = 404): void => {
      if (refusees.length < 200) refusees.push(req.url ?? '');
      res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('introuvable');
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return refuser(405);
    let chemin: string;
    try {
      const url = new URL(req.url ?? '/', 'http://local');
      const p = decodeURIComponent(url.pathname);
      if (url.pathname.startsWith(`${PREFIXE_RESSOURCES}/`)) {
        chemin = normalize(decodeURIComponent(url.pathname.slice(PREFIXE_RESSOURCES.length + 1)));
        if (!liste.has(chemin)) return refuser();
      } else {
        chemin = normalize(join(racinePage, p === '/' ? 'page.html' : p));
        if (chemin !== racinePage && !chemin.startsWith(racinePage + sep)) return refuser();
      }
    } catch {
      return refuser(400);
    }
    if (!existsSync(chemin) || !statSync(chemin).isFile()) return refuser();
    res.writeHead(200, {
      'content-type': TYPES[extname(chemin).toLowerCase()] ?? 'application/octet-stream',
      'content-length': statSync(chemin).size,
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(chemin).pipe(res);
  });
  await new Promise<void>((ok, ko) => {
    serveur.once('error', ko);
    serveur.listen(0, '127.0.0.1', () => ok());
  });
  const port = (serveur.address() as AddressInfo).port;
  const origine = `http://127.0.0.1:${port}`;
  return {
    origine,
    urlRessources: `${origine}${PREFIXE_RESSOURCES}`,
    refusees,
    fermer: () =>
      new Promise<void>((ok) => {
        serveur.closeAllConnections();
        serveur.close(() => ok());
      }),
  };
}
