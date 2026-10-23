// PONT LOCAL SANS SAISIE (23/10/2026, « il y a énormément dans les réglages des champs vides, il faut les renseigner »
// + capture « rea — error · Failed to fetch … (CORS) » avec un code d'appairage vide). Veille : Jupyter imprime une URL
// porteuse du jeton et ouvre le navigateur (jupyter-server, « Security in the Jupyter Server ») ; Chrome 142 (Local
// Network Access) peut bloquer l'appel d'une page vers 127.0.0.1 avec le même « Failed to fetch » qu'un serveur arrêté.
// Créé ici :
//  - BALISE : le pont écrit massamba-pont-code.js à côté de l'application (port, code, battement toutes les 5 s) ;
//    l'app le charge par une balise <script> comme le paquet de compétences — un fichier local lu par une page
//    locale, que le contrôle réseau de Chrome ne touche pas — et s'appaire seule : aucun code à taper ;
//  - DIAGNOSTIC EXACT : la balise dit si le pont tourne. Fetch qui échoue + balise vivante = le navigateur bloque
//    l'accès local (et on dit où l'autoriser) ; balise absente ou figée = pont arrêté (et on dit comment le lancer) ;
//  - PAGE SERVIE PAR LE PONT : ouverte depuis http://127.0.0.1:<port>/, l'app demande son code au pont en même
//    origine (/appairage, refusé à tout autre site par Sec-Fetch-Site) — plan B quand le navigateur bloque file://.
import { connect, disconnect, mcpState } from './mcp';
import { useStore } from './store';
import type { McpServerDef } from './types';

export const BEACON_FILE = 'massamba-pont-code.js';
export const DEFAULT_PORT = 7821;
/** A beacon older than this is a bridge that stopped without saying so (closed window, crash). */
const STALE_MS = 15_000;

export interface PontBeacon {
  running: boolean;
  port: number;
  code?: string;
  version?: string;
  /** Last heartbeat (ms since epoch). */
  alive: number;
  dossier?: string;
}
declare global {
  interface Window {
    MASSAMBA_PONT?: PontBeacon;
  }
}

/**
 * Loads the beacon written by the bridge next to the app (fresh copy each time); null when there is none. The app is
 * delivered with a resting beacon (running: false) that the bridge overwrites, so this never logs a missing file.
 */
export function readBeacon(timeoutMs = 2500): Promise<PontBeacon | null> {
  if (typeof document === 'undefined' || servedByBridge()) return Promise.resolve(null);
  return new Promise((resolve) => {
    delete window.MASSAMBA_PONT;
    const s = document.createElement('script');
    let done = false;
    const end = (v: PontBeacon | null) => {
      if (done) return;
      done = true;
      s.remove();
      resolve(v);
    };
    s.src = `${BEACON_FILE}?t=${Date.now()}`;
    s.onload = () => end(window.MASSAMBA_PONT ?? null);
    s.onerror = () => end(null);
    setTimeout(() => end(null), timeoutMs);
    document.head.appendChild(s);
  });
}
export const beaconAlive = (b: PontBeacon | null, now = Date.now()): b is PontBeacon =>
  Boolean(b?.running && b.code && now - b.alive < STALE_MS);

/** The app opened FROM the bridge (http://127.0.0.1:<port>/ redirects to …html?pont): its own origin is the bridge. */
export const servedByBridge = () =>
  typeof location !== 'undefined' &&
  location.protocol === 'http:' &&
  /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname) &&
  new URLSearchParams(location.search).has('pont');

/** Same-origin pairing when the bridge served the page. */
async function sameOriginPairing(): Promise<{ port: number; code: string } | null> {
  if (!servedByBridge()) return null;
  try {
    const r = await fetch('/appairage', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { port?: number; code?: string };
    return j.code ? { port: Number(j.port) || Number(location.port) || DEFAULT_PORT, code: j.code } : null;
  } catch {
    return null;
  }
}

export function bridgeDefs(port: number, code: string): McpServerDef[] {
  const base = servedByBridge() ? location.origin : `http://127.0.0.1:${port}`;
  const headers = { Authorization: `Bearer ${code}` };
  return [
    {
      name: 'rea',
      url: `${base}/rea`,
      headers,
      enabled: true,
      autoApprove: true,
      description:
        'REA sur votre ordinateur (pont local) : démontage d’apps, paquets, binaires, WASM, SQLite, captures.',
    },
    {
      name: 'poste',
      url: `${base}/poste`,
      headers,
      enabled: true,
      autoApprove: false,
      description:
        'Votre ordinateur (pont local) : shell réel et fichiers du dossier choisi — chaque action vous est demandée.',
    },
  ];
}
/** Code and port of the saved pairing (so the fields are never shown empty once paired). */
export function savedPairing(): { port: number; code: string } | null {
  const d = useStore.getState().mcp.find((m) => m.name === 'poste');
  if (!d) return null;
  const code = /^Bearer (.+)$/.exec(d.headers?.Authorization ?? '')?.[1] ?? '';
  const port = Number(/:(\d+)\//.exec(d.url)?.[1]) || DEFAULT_PORT;
  return code ? { port, code } : null;
}

export async function pairBridge(port: number, code: string): Promise<boolean> {
  const defs = bridgeDefs(port, code);
  const st = useStore.getState();
  st.setMcp([...st.mcp.filter((m) => m.name !== 'rea' && m.name !== 'poste'), ...defs]);
  for (const d of defs) {
    await disconnect(d.name);
    await connect(d);
  }
  return defs.every((d) => mcpState(d.name).status === 'connected');
}

export type BridgeState = 'connected' | 'connecting' | 'stopped' | 'blocked' | 'badcode' | 'never';
export interface BridgeDiag {
  state: BridgeState;
  message: string;
  beacon: PontBeacon | null;
}
export const LAUNCH_HINT =
  'Double-cliquez « Lancer le pont » dans le dossier de l’application (ou, dans un terminal : node massamba-pont.mjs). La Workbench se connecte seule — aucun code à taper.';

/** Where the bridge stands, in words the user can act on (never a bare « Failed to fetch »). */
export async function diagnoseBridge(): Promise<BridgeDiag> {
  const poste = mcpState('poste');
  const beacon = await readBeacon();
  if (poste.status === 'connected')
    return {
      state: 'connected',
      message: 'Pont connecté : REA et votre ordinateur sont disponibles.',
      beacon,
    };
  if (poste.status === 'connecting') return { state: 'connecting', message: 'Connexion au pont…', beacon };
  const saved = savedPairing();
  if (/401|code d’appairage/i.test(poste.error ?? ''))
    return {
      state: 'badcode',
      message: 'Le pont a changé de code. Relancez-le : la Workbench reprend le nouveau code toute seule.',
      beacon,
    };
  if (beaconAlive(beacon) && poste.status === 'error')
    return {
      state: 'blocked',
      message: `Le pont tourne (port ${beacon.port}) mais le navigateur bloque l’accès local. Chrome / Edge : cliquez l’icône à gauche de l’adresse → « Accès au réseau local » → Autoriser, puis « Réessayer ». Ou ouvrez la Workbench par le pont : http://127.0.0.1:${beacon.port}/`,
      beacon,
    };
  if (!saved && !beaconAlive(beacon))
    return { state: 'never', message: `Pont non démarré. ${LAUNCH_HINT}`, beacon };
  const when = beacon?.alive
    ? ` (dernier signe de vie ${new Date(beacon.alive).toLocaleTimeString('fr-FR')})`
    : '';
  return { state: 'stopped', message: `Pont arrêté${when}. ${LAUNCH_HINT}`, beacon };
}

/**
 * Start-up and periodic step: when the bridge runs (beacon alive, or the page served by the bridge), pair with it —
 * new code or new port included — without the user typing anything. Returns true when connected.
 */
export async function autoBridge(): Promise<boolean> {
  if (mcpState('poste').status === 'connected' && mcpState('rea').status === 'connected') return true;
  const local = await sameOriginPairing();
  const b = local ? null : await readBeacon();
  const target = local ?? (beaconAlive(b) ? { port: b.port, code: b.code! } : null);
  if (!target) return false;
  return pairBridge(target.port, target.code);
}

let timer: ReturnType<typeof setInterval> | null = null;
/**
 * Start-up: pair at once when the bridge runs; then keep trying in the background (every 10 s) only while a bridge is
 * expected — already paired once, or seen running — so an app that never uses the bridge never polls.
 */
export async function watchBridge(): Promise<void> {
  if (timer || typeof window === 'undefined') return;
  // The beacon file present (even at rest) means the bridge lives next to this app: reading it again is silent.
  const present = servedByBridge() || savedPairing() !== null || (await readBeacon()) !== null;
  const ok = await autoBridge();
  if (ok || present)
    timer = setInterval(() => {
      if (mcpState('poste').status === 'connected') return;
      void autoBridge();
    }, 10_000);
}
