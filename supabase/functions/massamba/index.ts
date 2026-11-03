// Fonction Edge « massamba » (fichier unique, sans dépendance) : petit modèle de MASSAMBA INTELLIGENCE, l'application privée
// du propriétaire, réentraîné par GitHub Actions dans le dépôt PRIVÉ ndoyepapamassamba-commits/massamba-modele.
// Contrat avec l'atelier : API-MASSAMBA.md v1.1 (dossier « entrainement »).
// - Exemples d'entraînement : envoyés par l'application (clé du propriétaire, en-tête x-admin-key ; retirés par /donnees/retirer),
//   validés (conversation system/user/assistant), filtrés (« prive », courriels, téléphones, IBAN, longs numéros : refusés et comptés), dédoublonnés
//   (empreinte SHA-256 des messages normalisés), lus par l'atelier (jeton OIDC de GitHub Actions) en NDJSON paginé.
// - Séances (« versions » AAAAMMJJ-HHMMSS attribuées ici) : candidat (URL de dépôt signées vers le bucket privé « massamba »,
//   <version>/<fichier>) → publiée (fichiers présents avec la bonne taille, pas de régression) ; rejetee, rien_a_faire, echec
//   consignées pour le budget mensuel ; dernière version publiée avec URL de lecture signées (1 h) ; ménage du bucket (1 Go).
// La clé du propriétaire n'est jamais lue ici : son empreinte est comparée en base à celle de ADMIN_KEY.
// Base : migration 20261104000017_massamba_modele.sql. Tests : node --experimental-strip-types supabase/functions/massamba/test.ts

export const REPO = "ndoyepapamassamba-commits/massamba-modele";
export const PROPRIETAIRE = "ndoyepapamassamba-commits";
export const BRANCHE = "refs/heads/main";
export const WORKFLOW = `${REPO}/.github/workflows/entrainer.yml@${BRANCHE}`;
export const EVENEMENTS = ["schedule", "workflow_dispatch"];
export const GH_ISS = "https://token.actions.githubusercontent.com";
export const AUDIENCE = "massamba-modele";
export const BUCKET = "massamba";
// Planification de l'atelier (UTC, cron du workflow) quand la dernière séance n'en indique pas
export const PLANIFICATION_DEFAUT = "17 */3 * * *";
const JWKS_URL = `${GH_ISS}/.well-known/jwks`;
export const MAX_DONNEES = 2 * 1024 * 1024;
export const MAX_PAR_ENVOI = 2000;
export const MAX_LECTURE = 20_000;
export const MAX_MESSAGES = 20;
export const MAX_CARACTERES_MESSAGE = 8000;
export const MAX_CARACTERES_EXEMPLE = 24000;
const PAGE = 500;
// Bucket : 1 Go sur le plan gratuit, plafond ici ~900 Mio ; 50 Mio par fichier (limite du bucket) ; l'atelier envoie ≤ 45 Mo
export const LIMITE_STOCKAGE = 900 * 1024 * 1024;
export const TAILLE_MAX_FICHIER = 50 * 1024 * 1024;
export const TAILLE_SUPPOSEE = 45 * 1024 * 1024;
const DUREE_LECTURE = 3600;
const enc = new TextEncoder();
export const STATUTS_SEANCE = ["candidat", "rejetee", "rien_a_faire", "echec"];
export const RE_VERSION = /^\d{8}-\d{6}(?:-\d{1,3})?$/;

export interface Env { url: string; cle: string; fetch: typeof fetch; now: () => Date }

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, x-admin-key",
  "Access-Control-Expose-Headers": "x-dernier-id, x-nb",
};
const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
const erreur = (status: number, code: string, message: string, plus: Record<string, unknown> = {}) => json(status, { erreur: code, message, ...plus });

export function toHex(b: ArrayBuffer | Uint8Array): string {
  const v = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ""; for (const x of v) s += x.toString(16).padStart(2, "0"); return s;
}
export async function sha256Hex(t: string): Promise<string> { return toHex(await crypto.subtle.digest("SHA-256", enc.encode(t))); }
function deB64url(s: string): Uint8Array { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
const ip = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "-";
// Identifiants d'exemples : chaînes triables de 12 chiffres ; dates : ISO 8601 UTC sans millisecondes (« 2026-11-04T02:58:00Z »)
export const idTexte = (n: unknown) => String(Math.max(0, Math.floor(Number(n) || 0))).padStart(12, "0");
export function lireId(v: string | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  return /^\d{1,15}$/.test(s) ? Number(s) : null;
}
export const isoZ = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, "Z");
};

// ------------------------------------------------------------------ Base (RPC PostgREST) et stockage (API Storage), clé de service
function enTetes(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { apikey: env.cle, ...extra };
  if (env.cle.startsWith("eyJ")) h.authorization = `Bearer ${env.cle}`;
  return h;
}
async function rpc(env: Env, fn: string, args: Record<string, unknown>): Promise<any> {
  const r = await env.fetch(`${env.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: enTetes(env, { "content-type": "application/json" }), body: JSON.stringify(args) });
  if (!r.ok) { console.error(`[massamba] ${fn} : ${r.status}`); throw new Error("base"); }
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const cheminUrl = (p: string) => p.split("/").map(encodeURIComponent).join("/");
async function stockage(env: Env, methode: string, chemin: string, corps?: unknown, extra: Record<string, string> = {}): Promise<any> {
  const r = await env.fetch(`${env.url}/storage/v1${chemin}`, { method: methode, headers: enTetes(env, { "content-type": "application/json", ...extra }), body: corps === undefined ? undefined : JSON.stringify(corps) });
  if (!r.ok) { console.error(`[massamba] stockage ${methode} ${chemin.split("?")[0]} : ${r.status}`); throw new Error("stockage"); }
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
// URL de dépôt signée (2 h, PUT du fichier brut ; un nouvel essai remplace le fichier)
export async function urlDepot(env: Env, chemin: string): Promise<string> {
  const j = await stockage(env, "POST", `/object/upload/sign/${BUCKET}/${cheminUrl(chemin)}`, {}, { "x-upsert": "true" });
  if (!j || typeof j.url !== "string") throw new Error("stockage");
  return `${env.url}/storage/v1${j.url.startsWith("/") ? "" : "/"}${j.url}`;
}
// URL de lecture signées (1 h)
export async function urlsLecture(env: Env, chemins: string[], duree = DUREE_LECTURE): Promise<Record<string, string>> {
  if (!chemins.length) return {};
  const j = await stockage(env, "POST", `/object/sign/${BUCKET}`, { expiresIn: duree, paths: chemins });
  const out: Record<string, string> = {};
  for (const x of Array.isArray(j) ? j : []) if (x && !x.error && typeof x.signedURL === "string" && typeof x.path === "string") out[x.path] = `${env.url}/storage/v1${x.signedURL.startsWith("/") ? "" : "/"}${x.signedURL}`;
  return out;
}
// Fichiers présents dans le dossier <version> : nom → taille
export async function fichiersPresents(env: Env, dossier: string): Promise<Record<string, number>> {
  const j = await stockage(env, "POST", `/object/list/${BUCKET}`, { prefix: dossier, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } });
  const out: Record<string, number> = {};
  for (const x of Array.isArray(j) ? j : []) if (x && typeof x.name === "string" && x.id) out[x.name] = Number(x.metadata && x.metadata.size) || 0;
  return out;
}
async function effacer(env: Env, chemins: string[]): Promise<void> {
  for (let i = 0; i < chemins.length; i += 100) await stockage(env, "DELETE", `/object/${BUCKET}`, { prefixes: chemins.slice(i, i + 100) });
}

// Efface les fichiers des versions antérieures à « avant » (sauf « garder ») et vide leurs chemins ; métadonnées et scores restent
async function purger(env: Env, now: Date, avant: string, garder: string[]): Promise<string[]> {
  const liste = ((await rpc(env, "massamba_a_purger", { p_avant: avant, p_garder: garder })) || []) as { version: string; chemins: Record<string, string> }[];
  if (!liste.length) return [];
  await effacer(env, liste.flatMap((x) => Object.values(x.chemins || {})));
  await rpc(env, "massamba_purge_faite", { p_versions: liste.map((x) => x.version), p_now: now.toISOString() });
  return liste.map((x) => x.version);
}
const occupe = async (env: Env) => Number(((await rpc(env, "massamba_stockage", {})) || {}).octets) || 0;
// Parties d'un modèle fusionné (gguf-split ou octets) : reconstructibles, ce sont elles qui pèsent (~450 Mo)
export const RE_PARTIE = /-\d{5}-of-\d{5}\.gguf$|\.part-\d{5}-of-\d{5}$/;
export function partiesFusion(v: any): string[] {
  const noms = new Set<string>();
  for (const a of Object.values((v && v.details && v.details.assemblage) || {}) as any[]) for (const p of (a && a.parties) || []) noms.add(String(p));
  for (const n of Object.keys((v && v.chemins) || {})) if (RE_PARTIE.test(n)) noms.add(n);
  return [...noms].filter((n) => v && v.chemins && v.chemins[n]);
}
// Place pour une nouvelle séance candidate, par étapes : 1) fichiers des versions autres que les deux dernières publiées
// (candidates abandonnées, anciennes) ; 2) ceux de l'avant-dernière publiée ; 3) le modèle fusionné de la dernière publiée
// (son adaptateur et ses Modelfile restent : l'atelier les a déjà relus, l'installation pour Ollama < 0.34.1 reste possible).
export async function fairePlace(env: Env, now: Date, annonce: number): Promise<{ ok: boolean; octets: number; purgees: string[]; fusion_retiree?: string }> {
  let octets = await occupe(env);
  const purgees: string[] = [];
  if (octets + annonce <= LIMITE_STOCKAGE) return { ok: true, octets, purgees };
  const pub = ((await rpc(env, "massamba_publiees", { p_n: 2 })) || []) as string[];
  for (const garder of [pub.slice(0, 2), pub.slice(0, 1)]) {
    purgees.push(...await purger(env, now, "99999999-999999-999", garder));
    octets = await occupe(env);
    if (octets + annonce <= LIMITE_STOCKAGE) return { ok: true, octets, purgees };
  }
  const derniere = pub.length ? await rpc(env, "massamba_version", { p_version: pub[0] }) : null;
  const parties = partiesFusion(derniere);
  if (parties.length) {
    await effacer(env, parties.map((n) => derniere.chemins[n]));
    await rpc(env, "massamba_chemins_retirer", { p_version: derniere.version, p_noms: parties, p_now: now.toISOString() });
    octets = await occupe(env);
    if (octets + annonce <= LIMITE_STOCKAGE) return { ok: true, octets, purgees, fusion_retiree: derniere.version };
  }
  return { ok: false, octets, purgees };
}

async function lireJson(req: Request, max: number, vide = false): Promise<any> {
  const t = await req.text();
  if (t.length > max) throw Object.assign(new Error("trop gros"), { status: 413 });
  if (vide && !t.trim()) return {};
  try { const v = JSON.parse(t); if (v && typeof v === "object" && !Array.isArray(v)) return v; } catch { /* plus bas */ }
  throw Object.assign(new Error("json"), { status: 400 });
}

// ------------------------------------------------------------------ Jeton OIDC de GitHub Actions (atelier d'entraînement)
let _jwks: { cles: any[]; t: number } | null = null;
export function _oublierCaches() { _jwks = null; }
async function cleGithub(env: Env, kid: string): Promise<any | null> {
  const frais = _jwks && env.now().getTime() - _jwks.t < 3600_000;
  const k = frais ? _jwks!.cles.find((x) => x.kid === kid) : null;
  if (k) return k;
  const r = await env.fetch(JWKS_URL, { headers: { accept: "application/json" } });
  if (!r.ok) return null;
  const j = await r.json();
  _jwks = { cles: Array.isArray(j?.keys) ? j.keys : [], t: env.now().getTime() };
  return _jwks.cles.find((x) => x.kid === kid) || null;
}
// Contrôles de la section 1 du contrat ; repository_id et repository_owner_id figés en base au premier appel accepté
export async function verifierGithub(env: Env, jeton: string): Promise<{ ok: boolean; raison?: string; charge?: any }> {
  const p = String(jeton || "").split(".");
  if (p.length !== 3) return { ok: false, raison: "format" };
  let tete: any, charge: any;
  try { tete = JSON.parse(new TextDecoder().decode(deB64url(p[0]))); charge = JSON.parse(new TextDecoder().decode(deB64url(p[1]))); } catch { return { ok: false, raison: "format" }; }
  if (tete.alg !== "RS256" || !tete.kid) return { ok: false, raison: "alg" };
  const jwk = await cleGithub(env, tete.kid);
  if (!jwk) return { ok: false, raison: "cle" };
  const cle = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cle, deB64url(p[2]), enc.encode(`${p[0]}.${p[1]}`));
  if (!ok) return { ok: false, raison: "signature" };
  const maintenant = Math.floor(env.now().getTime() / 1000);
  if (charge.iss !== GH_ISS) return { ok: false, raison: "iss" };
  const aud = Array.isArray(charge.aud) ? charge.aud : [charge.aud];
  if (!aud.includes(AUDIENCE)) return { ok: false, raison: "aud" };
  if (!(charge.exp > maintenant - 60) || !(charge.iat <= maintenant + 60) || (charge.nbf && charge.nbf > maintenant + 60)) return { ok: false, raison: "date" };
  if (charge.repository !== REPO || (charge.repository_owner !== undefined && charge.repository_owner !== PROPRIETAIRE)) return { ok: false, raison: "depot" };
  if (charge.repository_visibility !== "private") return { ok: false, raison: "visibilite" };
  if (charge.ref !== BRANCHE) return { ok: false, raison: "branche" };
  if (typeof charge.workflow_ref !== "string" || !charge.workflow_ref.startsWith(WORKFLOW)) return { ok: false, raison: "workflow" };
  if (!EVENEMENTS.includes(charge.event_name)) return { ok: false, raison: "evenement" };
  if (!(await rpc(env, "massamba_figer_depot", { p_repo_id: String(charge.repository_id ?? ""), p_owner_id: String(charge.repository_owner_id ?? "") }))) return { ok: false, raison: "depot_id" };
  return { ok: true, charge };
}

// ------------------------------------------------------------------ Accès : atelier (OIDC) et/ou propriétaire (x-admin-key)
const MAX_ECHECS = 30;
async function autoriser(req: Request, env: Env, accepte: { atelier?: boolean; proprio?: boolean }): Promise<{ qui: "atelier" | "proprio" } | Response> {
  const now = env.now().toISOString();
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const cle = (req.headers.get("x-admin-key") || "").trim();
  const viaJeton = !!(accepte.atelier && bearer);
  const viaCle = !viaJeton && !!(accepte.proprio && cle);
  if (!viaJeton && !viaCle) return erreur(401, "refuse", "Accès refusé.");
  const cleIp = "msb-echec:" + (await sha256Hex("msb-ip:" + ip(req))).slice(0, 32);
  if ((Number(await rpc(env, "tcv_rate_limit_count", { p_key: cleIp, p_window_seconds: 3600, p_now: now })) || 0) >= MAX_ECHECS)
    return erreur(429, "trop", "Trop d'essais refusés. Réessayez dans une heure.");
  let bon = false, raison = "cle";
  if (viaJeton) { const v = await verifierGithub(env, bearer); bon = v.ok; raison = v.raison || ""; }
  else if (cle.length >= 16 && cle.length <= 256) bon = (await rpc(env, "massamba_cle_valide", { p_empreinte: await sha256Hex(cle) })) === true;
  if (!bon) {
    console.warn(`[massamba] accès refusé : ${viaJeton ? "jeton " + raison : "clé"}`);
    await rpc(env, "tcv_hit_rate_limit", { p_key: cleIp, p_window_seconds: 3600, p_max: MAX_ECHECS, p_now: now }).catch(() => null);
    return erreur(401, "refuse", "Accès refusé.");
  }
  const rythme = viaJeton ? { k: "msb-atelier", max: 600 } : { k: "msb-proprio", max: 2400 };
  if (!(await rpc(env, "tcv_hit_rate_limit", { p_key: rythme.k, p_window_seconds: 3600, p_max: rythme.max, p_now: now })))
    return erreur(429, "trop", "Trop de demandes. Réessayez dans un moment.");
  return { qui: viaJeton ? "atelier" : "proprio" };
}

// ------------------------------------------------------------------ Exemples : validation, confidentialité, empreinte
const ROLES = ["system", "user", "assistant"];
// Texte propre : NFC, fins de ligne Unix, sans caractères de contrôle ni invisibles, espaces de fin retirés, 2 lignes vides au plus
export function nettoyerTexte(s: string): string {
  return String(s).normalize("NFC").replace(/\r\n?/g, "\n").replace(/(?![\n\t])[\p{Cc}\p{Cf}\p{Cs}\p{Co}]/gu, "")
    .split("\n").map((l) => l.replace(/\s+$/u, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
// Forme canonique pour l'empreinte : minuscules, sans accents ni ponctuation (même règle que scripts/donnees.py de l'atelier)
export function normaliserPourCle(s: string): string {
  return String(s).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/ß/g, "ss").replace(/[^\p{L}\p{N}_]+/gu, " ").replace(/\s+/g, " ").trim();
}
// Empreinte d'un exemple : messages hors système, « rôle:texte normalisé » séparés par U+001F (les 24 premiers caractères
// sont la « clé » de l'atelier)
export async function empreinteExemple(messages: { role: string; content: string }[]): Promise<string> {
  return sha256Hex(messages.filter((m) => m.role !== "system").map((m) => m.role + ":" + normaliserPourCle(m.content)).join("\x1f"));
}
const RE_COURRIEL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/;
const RE_IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g;
const RE_SUITE_CHIFFRES = /(?<![\p{L}\p{N}_+])(?:\+|00)?\d[\d   .\-()\/]{5,}\d(?![\p{L}\p{N}_])/gu;
const RE_DATE = /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})$/;
const RE_MONTANT = /^\d{1,3}(?:[   .,]\d{3})+(?:,\d+)?$/;
const RE_DECIMAL = /^\d+[.,]\d+$/;
function classerSuiteChiffres(c: string): string | null {
  const s = c.trim(), chiffres = s.replace(/\D/g, "");
  if (RE_DATE.test(s) || RE_MONTANT.test(s) || RE_DECIMAL.test(s)) return null;
  const groupes = s.replace(/^\++/, "").split(/[   .\-()\/]+/).filter(Boolean);
  if (groupes.length && groupes.every((g) => g.length === 4 && +g >= 1900 && +g <= 2100)) return null; // liste d'années
  if ((s.startsWith("+") || s.startsWith("00")) && chiffres.length >= 8 && chiffres.length <= 15) return "telephone";
  if (chiffres.length >= 9 && groupes.length >= 3 && groupes.every((g) => g.length >= 1 && g.length <= 4) && groupes.filter((g) => g.length === 2).length >= 2) return "telephone";
  if (chiffres.length >= 10) return "numero_long";
  if (chiffres.length === 9 && groupes.length === 1) return "telephone";
  return null;
}
// Données personnelles repérées dans un texte : courriel, telephone, iban, numero_long (triées)
export function detecterPrive(texte: string): string[] {
  const t = String(texte || ""), r = new Set<string>();
  if (RE_COURRIEL.test(t)) r.add("courriel");
  for (const m of t.matchAll(RE_IBAN)) if ((m[0].match(/\d/g) || []).length >= 6) r.add("iban");
  for (const m of t.matchAll(RE_SUITE_CHIFFRES)) { const g = classerSuiteChiffres(m[0]); if (g) r.add(g); }
  return [...r].sort();
}
const dateIso = (d: Date) => d.toISOString().slice(0, 10);
function lireDate(v: unknown): string | null {
  const m = typeof v === "string" ? v.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
export function slugDomaine(v: unknown): string {
  const s = String(v ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return s || "general";
}
export type Refus = { ok: false; motif: string; raison?: string };
export type Accepte = { ok: true; empreinte: string; domaine: string; donnees: Record<string, unknown> };
// Un exemple (format de l'atelier) : { messages, prive: false, domaine, source?, valide_le?, perime_le?, groupe?, langue?, mots_cles?, id? }
export async function validerExemple(e: any, maintenant: Date): Promise<Accepte | Refus> {
  const format = (raison: string): Refus => ({ ok: false, motif: "format", raison });
  if (!e || typeof e !== "object" || Array.isArray(e)) return format("pas_un_objet");
  if (e.prive === true || e.confidentiel === true || e.espace === "travail") return { ok: false, motif: "prive" };
  if (e.prive !== false) return format("prive_absent");
  const msgs = e.messages;
  if (!Array.isArray(msgs) || !msgs.length) return format("messages_absents");
  if (msgs.length > MAX_MESSAGES) return format("trop_de_messages");
  const propres: { role: string; content: string }[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (!m || typeof m !== "object" || !ROLES.includes(m.role) || typeof m.content !== "string") return format("message_mal_forme");
    const c = nettoyerTexte(m.content);
    if (!c) return format("message_vide");
    if (c.length > MAX_CARACTERES_MESSAGE) return format("message_trop_long");
    if (m.role === "system" && i !== 0) return format("systeme_mal_place");
    propres.push({ role: m.role, content: c });
  }
  const corps = propres[0].role === "system" ? propres.slice(1) : propres;
  if (corps.length < 2 || corps.length % 2) return format("ordre_roles");
  for (let i = 0; i < corps.length; i++) if (corps[i].role !== (i % 2 === 0 ? "user" : "assistant")) return format("ordre_roles");
  if (propres.reduce((s, m) => s + m.content.length, 0) > MAX_CARACTERES_EXEMPLE) return format("exemple_trop_long");
  const aujourdhui = dateIso(maintenant), demain = dateIso(new Date(maintenant.getTime() + 86400_000));
  let valide = aujourdhui;
  if (e.valide_le !== undefined && e.valide_le !== null) {
    const d = lireDate(e.valide_le);
    if (!d) return format("date_invalide");
    if (d > demain) return format("date_future");
    valide = d;
  }
  const donnees: Record<string, unknown> = { messages: propres, source: typeof e.source === "string" && e.source.trim() ? e.source.trim().slice(0, 200) : "massamba-intelligence", valide_le: valide };
  if (e.perime_le !== undefined && e.perime_le !== null) {
    const p = lireDate(e.perime_le);
    if (!p) return format("date_invalide");
    if (p < aujourdhui) return format("perime");
    donnees.perime_le = p;
  }
  for (const k of ["groupe", "langue"]) {
    if (e[k] === undefined || e[k] === null) continue;
    if (typeof e[k] !== "string" || !e[k].trim()) return format(k + "_invalide");
    donnees[k] = e[k].trim().slice(0, 120);
  }
  if (e.mots_cles !== undefined && e.mots_cles !== null) {
    if (!Array.isArray(e.mots_cles) || !e.mots_cles.every((x: unknown) => typeof x === "string")) return format("mots_cles_invalides");
    donnees.mots_cles = e.mots_cles.map((x: string) => nettoyerTexte(x).slice(0, 100)).filter(Boolean).slice(0, 20);
  }
  if (typeof e.id === "string" && e.id.trim()) donnees.ref = e.id.trim().slice(0, 120);
  // Confidentialité : tout le texte qui partirait à l'entraînement
  const textes = [...propres.map((m) => m.content), ...((donnees.mots_cles as string[]) || []), String(donnees.groupe || "")];
  const trouves = [...new Set(textes.flatMap(detecterPrive))].sort();
  if (trouves.length) return { ok: false, motif: trouves[0], raison: trouves.join(",") };
  return { ok: true, empreinte: await empreinteExemple(propres), domaine: slugDomaine(e.domaine), donnees };
}
// Ligne NDJSON lue par l'atelier (format de docs/FORMAT.md : identifiant triable en texte, « prive » explicite)
export function ligneAtelier(x: { id: number; domaine: string; donnees: any }): Record<string, unknown> {
  const d = x.donnees || {};
  const l: Record<string, unknown> = { id: idTexte(x.id), messages: d.messages, source: d.source || "massamba-intelligence", valide_le: d.valide_le, domaine: x.domaine, prive: false };
  for (const k of ["perime_le", "groupe", "langue", "mots_cles"]) if (d[k] !== undefined) l[k] = d[k];
  return l;
}

// ------------------------------------------------------------------ Séances et versions
// Noms de fichiers sans chemin : adaptateur.tar.gz, massamba-lora-f16.gguf, Modelfile, Modelfile.adaptateur,
// massamba-00001-of-00004.gguf, massamba-q4_k_m.gguf.part-00001-of-00011…
const RE_FICHIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
export function validerFichiers(f: unknown, candidat = true): string | null {
  if (!Array.isArray(f)) return "fichiers : liste attendue";
  if (!candidat) return f.length ? "fichiers : seulement pour une séance « candidat »" : null;
  if (f.length < 1 || f.length > 60) return "fichiers : 1 à 60 noms";
  if (!f.every((x) => typeof x === "string" && RE_FICHIER.test(x) && !x.includes(".."))) return "fichiers : nom invalide";
  if (new Set(f).size !== f.length) return "fichiers : doublon";
  return null;
}
// Objet JSON de nombres (scores, détail des scores) : nombres, booléens, null, textes courts ; profondeur et taille bornées
export function objetSimple(o: unknown, maxOctets = 32_000, profondeur = 5): boolean {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  if (JSON.stringify(o).length > maxOctets) return false;
  const ents = Object.entries(o as Record<string, unknown>);
  if (ents.length > 60) return false;
  return ents.every(([k, v]) => /^[A-Za-z0-9_.-]{1,60}$/.test(k) && (v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) ||
    (typeof v === "string" && v.length <= 60) || (Array.isArray(v) && v.length <= 60 && v.every((x) => (typeof x === "number" && Number.isFinite(x)) || (typeof x === "string" && x.length <= 60))) ||
    (profondeur > 0 && objetSimple(v, maxOctets, profondeur - 1))));
}
// assemblage : { "<fichier logique>": { mode: "gguf-split" | "octets", parties: [noms ⊂ fichiers], sha256, taille } }
export function validerAssemblage(a: unknown, fichiers: string[]): string | null {
  if (a === undefined || a === null) return null;
  if (typeof a !== "object" || Array.isArray(a)) return "assemblage : objet attendu";
  const ents = Object.entries(a as Record<string, any>);
  if (ents.length > 10) return "assemblage : 10 fichiers au plus";
  for (const [nom, x] of ents) {
    if (!RE_FICHIER.test(nom) || nom.includes("..")) return "assemblage : nom invalide";
    if (!x || typeof x !== "object" || !["gguf-split", "octets"].includes(x.mode)) return "assemblage : mode gguf-split ou octets";
    if (!Array.isArray(x.parties) || x.parties.length < 1 || x.parties.length > 60 || !x.parties.every((p: unknown) => typeof p === "string" && fichiers.includes(p))) return "assemblage : parties absentes de « fichiers »";
    if (typeof x.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(x.sha256)) return "assemblage : sha256 invalide";
    if (!Number.isSafeInteger(x.taille) || x.taille <= 0) return "assemblage : taille invalide";
  }
  return null;
}
// Taille annoncée d'une séance candidate : tailles données, sinon part du fichier assemblé, Modelfile 64 Kio, sinon 45 Mio
export function tailleAnnoncee(fichiers: string[], assemblage: Record<string, any> | undefined, tailles: Record<string, number> | undefined): number {
  const parPartie: Record<string, number> = {};
  for (const a of Object.values(assemblage || {})) for (const p of a.parties) parPartie[p] = Math.ceil(a.taille / a.parties.length);
  return fichiers.reduce((t, f) => t + (tailles?.[f] || parPartie[f] || (/^Modelfile/.test(f) ? 65536 : TAILLE_SUPPOSEE)), 0);
}
const RE_CRON = /^\s*\S+\s+\S+\s+\S+\s+\S+\s+\S+\s*$/;
function champCron(t: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of t.split(",")) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) return null;
    let a = min, b = max;
    if (m[1] !== "*") { const [x, y] = m[1].split("-").map(Number); a = x; b = y === undefined ? (m[2] ? max : x) : y; }
    const pas = m[2] ? +m[2] : 1;
    if (a < min || b > max || a > b || pas < 1) return null;
    for (let v = a; v <= b; v += pas) out.add(v);
  }
  return out;
}
// Prochaine exécution d'une planification cron (5 champs, UTC, comme GitHub Actions) après « apres » ; null si illisible
export function prochaineExecution(cron: string, apres: Date): string | null {
  if (!RE_CRON.test(String(cron || ""))) return null;
  const [mi, h, jm, mo, js] = cron.trim().split(/\s+/);
  const M = champCron(mi, 0, 59), H = champCron(h, 0, 23), JM = champCron(jm, 1, 31), MO = champCron(mo, 1, 12), JS0 = champCron(js, 0, 7);
  if (!M || !H || !JM || !MO || !JS0) return null;
  const JS = new Set([...JS0].map((x) => x % 7));
  const jmLibre = jm === "*", jsLibre = js === "*";
  let t = Math.floor(apres.getTime() / 60000) * 60000 + 60000;
  for (let i = 0; i < 60 * 24 * 32; i++, t += 60000) {
    const d = new Date(t);
    if (!M.has(d.getUTCMinutes()) || !H.has(d.getUTCHours()) || !MO.has(d.getUTCMonth() + 1)) continue;
    const okJm = JM.has(d.getUTCDate()), okJs = JS.has(d.getUTCDay());
    if (jmLibre && jsLibre ? true : jmLibre ? okJs : jsLibre ? okJm : okJm || okJs) return isoZ(d);
  }
  return null;
}
const entier = (v: unknown, min: number, max: number): number | null => (v === undefined || v === null ? 0 : Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? v as number : null);
// Vue publique d'une séance (dates au format du contrat, identifiants d'exemples en texte)
function vueSeance(v: any): Record<string, unknown> {
  return { version: v.version, statut: v.statut, base: v.base, revision: v.revision ?? null, scores: v.scores || {}, nb_exemples: v.nb_exemples, reste: v.reste,
    dernier_id: idTexte(v.dernier_id), duree_minutes: Number(v.duree_minutes) || 0, cree_le: isoZ(v.cree_le), publiee_le: isoZ(v.publiee_le),
    fichiers: Object.keys(v.chemins || {}), raisons: (v.details && v.details.raisons) || [] };
}

// ------------------------------------------------------------------ Routes
const moisCivil = (now: Date) => ({ debut: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), fin: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) });
export async function traiter(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const chemin = url.pathname.replace(/^.*?\/massamba(?=\/|$)/, "") || "/";
  const now = env.now();
  try {
    // Envoi d'exemples validés par le propriétaire depuis son application
    if (req.method === "POST" && chemin === "/donnees") {
      const a = await autoriser(req, env, { proprio: true }); if (a instanceof Response) return a;
      const b = await lireJson(req, MAX_DONNEES);
      if (!Array.isArray(b.exemples)) return erreur(400, "exemples", "Envoyez { exemples: [...] }.");
      if (b.exemples.length > MAX_PAR_ENVOI) return erreur(413, "trop", `${MAX_PAR_ENVOI} exemples au plus par envoi.`);
      const motifs: Record<string, number> = {}, refus: { i: number; motif: string; raison?: string }[] = [];
      const lignes: { empreinte: string; donnees: unknown; domaine: string }[] = [], vues = new Set<string>();
      let doublonsEnvoi = 0;
      for (let i = 0; i < b.exemples.length; i++) {
        const v = await validerExemple(b.exemples[i], now);
        if (!v.ok) { motifs[v.motif] = (motifs[v.motif] || 0) + 1; if (refus.length < 200) refus.push({ i, motif: v.motif, ...(v.raison ? { raison: v.raison } : {}) }); continue; }
        if (vues.has(v.empreinte)) { doublonsEnvoi++; continue; }
        vues.add(v.empreinte);
        lignes.push({ empreinte: v.empreinte, donnees: v.donnees, domaine: v.domaine });
      }
      const res = lignes.length ? await rpc(env, "massamba_ajouter", { p_exemples: lignes, p_now: now.toISOString() }) : { ajoutes: 0, doublons: 0 };
      if (res && res.erreur === "plein") return erreur(507, "plein", "Réserve d'exemples pleine (50 000) : faites le ménage avant d'en ajouter.");
      const refuses = b.exemples.length - lignes.length - doublonsEnvoi;
      return json(200, { ajoutes: res.ajoutes || 0, doublons: (res.doublons || 0) + doublonsEnvoi, refuses, motifs, refus, empreintes: lignes.map((l) => l.empreinte) });
    }
    // Exemple rejeté après coup par le propriétaire (événement « mi-savoir-exemple-retire ») : il disparaît du corpus
    if (req.method === "POST" && chemin === "/donnees/retirer") {
      const a = await autoriser(req, env, { proprio: true }); if (a instanceof Response) return a;
      const b = await lireJson(req, 64_000);
      const refs = b.refs;
      if (!Array.isArray(refs) || !refs.length || refs.length > 500 || !refs.every((x: unknown) => typeof x === "string" && /^[\w.:-]{1,120}$/.test(x))) return erreur(400, "refs", "Envoyez { refs: [identifiants] } (500 au plus).");
      const n = await rpc(env, "massamba_retirer", { p_refs: refs });
      return json(200, { retires: Number(n) || 0 });
    }
    // Corpus pour l'atelier : NDJSON des exemples d'identifiant > depuis (20 000 par page), x-dernier-id = dernière ligne
    if (req.method === "GET" && chemin === "/donnees") {
      const a = await autoriser(req, env, { atelier: true }); if (a instanceof Response) return a;
      const depuis = lireId(url.searchParams.get("depuis"));
      if (depuis === null) return erreur(400, "depuis", "Paramètre « depuis » invalide.");
      const lim = Math.min(MAX_LECTURE, Math.max(1, Number(url.searchParams.get("limite")) || MAX_LECTURE));
      const borne = await rpc(env, "massamba_borne", { p_depuis: depuis, p_limite: lim });
      const nb = Number(borne && borne.nb) || 0, jusqua = nb ? Number(borne.jusqua) : depuis;
      let curseur = depuis;
      const flux = new ReadableStream<Uint8Array>({
        async pull(ctl) {
          if (curseur >= jusqua) { ctl.close(); return; }
          const page = await rpc(env, "massamba_exemples_page", { p_depuis: curseur, p_jusqua: jusqua, p_limite: PAGE });
          if (!Array.isArray(page) || !page.length) { ctl.close(); return; }
          let t = "";
          for (const x of page) { t += JSON.stringify(ligneAtelier(x)) + "\n"; curseur = Number(x.id); }
          ctl.enqueue(enc.encode(t));
        },
      });
      return new Response(flux, { status: 200, headers: { ...CORS, "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-dernier-id": nb ? idTexte(jusqua) : "", "x-nb": String(nb) } });
    }
    // Vérification rapide (toutes les 3 h) : nouveaux exemples depuis un identifiant (le total sans « depuis »)
    if (req.method === "GET" && chemin === "/donnees/compte") {
      const a = await autoriser(req, env, { atelier: true, proprio: true }); if (a instanceof Response) return a;
      const depuis = lireId(url.searchParams.get("depuis"));
      if (depuis === null) return erreur(400, "depuis", "Paramètre « depuis » invalide.");
      const c = (await rpc(env, "massamba_compte", { p_depuis: depuis })) || {};
      return json(200, { nouveaux: Number(c.nouveaux) || 0, dernier_id: idTexte(c.dernier_id), derniere_publiee_le: isoZ(c.derniere_publiee_le) });
    }
    // Budget de minutes de GitHub Actions du mois civil UTC (toutes les séances consignées, quel que soit le statut)
    if (req.method === "GET" && chemin === "/versions/budget") {
      const a = await autoriser(req, env, { atelier: true, proprio: true }); if (a instanceof Response) return a;
      const { debut, fin } = moisCivil(now);
      const b = (await rpc(env, "massamba_budget", { p_debut: debut.toISOString(), p_fin: fin.toISOString() })) || {};
      const minutes = Number(b.minutes) || 0;
      return json(200, { mois: debut.toISOString().slice(0, 7), minutes, seances: Number(b.seances) || 0, minutes_mois: minutes });
    }
    // Tableau de bord du propriétaire
    if (req.method === "GET" && chemin === "/etat") {
      const a = await autoriser(req, env, { proprio: true }); if (a instanceof Response) return a;
      const e = (await rpc(env, "massamba_etat", {})) || {};
      const versions = (Array.isArray(e.versions) ? e.versions : []).map(vueSeance);
      const brutes = Array.isArray(e.versions) ? e.versions : [];
      const planification = (brutes.find((v: any) => v && v.details && typeof v.details.planification === "string") || { details: {} }).details.planification || PLANIFICATION_DEFAUT;
      const { debut, fin } = moisCivil(now);
      const budget = (await rpc(env, "massamba_budget", { p_debut: debut.toISOString(), p_fin: fin.toISOString() }).catch(() => null)) || {};
      const octets = await occupe(env).catch(() => null);
      return json(200, { nb_exemples: Number(e.nb_exemples) || 0, dernier_id: idTexte(e.dernier_id), par_domaine: e.par_domaine || {}, versions,
        derniere_publiee: e.derniere_publiee ? vueSeance(e.derniere_publiee) : null, planification, prochaine_execution: prochaineExecution(planification, now),
        minutes_mois: Number(budget.minutes) || 0, seances_mois: Number(budget.seances) || 0, stockage: { octets, limite: LIMITE_STOCKAGE }, maintenant: isoZ(now) });
    }
    // Consigner une séance (toutes) ; une « candidat » reçoit une URL de dépôt signée par fichier
    if (req.method === "POST" && chemin === "/versions") {
      const a = await autoriser(req, env, { atelier: true }); if (a instanceof Response) return a;
      const b = await lireJson(req, 64_000);
      const statut = String(b.statut || "");
      if (!STATUTS_SEANCE.includes(statut)) return erreur(400, "statut", "Statut : candidat, rejetee, rien_a_faire ou echec.");
      const candidat = statut === "candidat";
      const base = typeof b.base === "string" ? b.base.trim() : "";
      if (base ? !/^[A-Za-z0-9][A-Za-z0-9._\/:-]{1,199}$/.test(base) : candidat) return erreur(400, "base", "Modèle de base invalide.");
      if (b.revision !== undefined && b.revision !== null && !(typeof b.revision === "string" && /^[A-Za-z0-9._-]{0,100}$/.test(b.revision))) return erreur(400, "revision", "Révision invalide.");
      const fichiers = b.fichiers === undefined || b.fichiers === null ? [] : b.fichiers;
      const pbF = validerFichiers(fichiers, candidat); if (pbF) return erreur(400, "fichiers", pbF);
      const scores = b.scores === undefined || b.scores === null ? {} : b.scores;
      if (!objetSimple(scores)) return erreur(400, "scores", "Scores invalides (nombres seulement).");
      const nb = entier(b.nb_exemples, 0, 10_000_000), reste = entier(b.reste, 0, 10_000_000), rejeu = entier(b.rejeu, 0, 10_000_000);
      if (nb === null || reste === null || rejeu === null) return erreur(400, "nombres", "nb_exemples, rejeu ou reste invalide.");
      const duree = b.duree_minutes === undefined || b.duree_minutes === null ? 0 : Number(b.duree_minutes);
      if (typeof b.duree_minutes === "string" || !Number.isFinite(duree) || duree < 0 || duree > 100_000) return erreur(400, "duree_minutes", "Durée invalide.");
      const dernierId = lireId(b.dernier_id === undefined || b.dernier_id === null ? "" : String(b.dernier_id));
      if (dernierId === null) return erreur(400, "dernier_id", "dernier_id invalide.");
      const pbA = validerAssemblage(b.assemblage, fichiers); if (pbA) return erreur(400, "assemblage", pbA);
      const details: Record<string, unknown> = { rejeu };
      if (b.assemblage) details.assemblage = b.assemblage;
      if (b.depart !== undefined && b.depart !== null && b.depart !== "") { if (typeof b.depart !== "string" || !RE_VERSION.test(b.depart)) return erreur(400, "depart", "depart invalide."); details.depart = b.depart; }
      if (b.raisons !== undefined && b.raisons !== null) {
        if (!Array.isArray(b.raisons) || b.raisons.length > 20 || !b.raisons.every((x: unknown) => typeof x === "string" && x.length <= 300)) return erreur(400, "raisons", "Raisons invalides.");
        details.raisons = b.raisons;
      }
      if (b.run !== undefined && b.run !== null) {
        const r = b.run;
        if (typeof r === "string" ? !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+/.test(r) : !(r && typeof r === "object" && !Array.isArray(r) && Object.entries(r).length <= 6 && Object.entries(r).every(([k, v]) => /^[a-z_]{1,20}$/.test(k) && /^[\w.:\/-]{0,200}$/.test(String(v)))))
          return erreur(400, "run", "run invalide.");
        details.run = r;
      }
      if (b.planification !== undefined && b.planification !== null) { if (typeof b.planification !== "string" || !prochaineExecution(b.planification, now)) return erreur(400, "planification", "Planification cron invalide."); details.planification = b.planification.trim(); }
      if (b.base_ollama !== undefined && b.base_ollama !== null) { if (typeof b.base_ollama !== "string" || !/^[a-z0-9][a-z0-9._\/:-]{1,99}$/i.test(b.base_ollama)) return erreur(400, "base_ollama", "Nom Ollama invalide."); details.base_ollama = b.base_ollama; }
      if (b.tailles !== undefined && b.tailles !== null) {
        const t = b.tailles;
        if (!(t && typeof t === "object" && !Array.isArray(t) && Object.entries(t).every(([f, v]) => fichiers.includes(f) && Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= TAILLE_MAX_FICHIER)))
          return erreur(400, "tailles", "Tailles invalides (50 Mio au plus par fichier).");
        details.tailles_annoncees = t;
      }
      if (!(await rpc(env, "tcv_hit_rate_limit", { p_key: "msb-versions", p_window_seconds: 86400, p_max: 48, p_now: now.toISOString() })))
        return erreur(429, "trop", "Trop de séances consignées aujourd'hui.");
      let place: Awaited<ReturnType<typeof fairePlace>> | null = null;
      if (candidat) {
        // Stockage : place occupée + tailles annoncées sous le plafond, après ménage si besoin
        const annonce = tailleAnnoncee(fichiers, b.assemblage, b.tailles);
        if (annonce > LIMITE_STOCKAGE) return erreur(507, "stockage", "Version trop lourde pour le bucket (900 Mio au plus).", { annonce, limite: LIMITE_STOCKAGE });
        place = await fairePlace(env, now, annonce);
        if (!place.ok) return erreur(507, "stockage", "Bucket plein : la nouvelle version ne tient pas sous 900 Mio, même après ménage.", { octets: place.octets, annonce, limite: LIMITE_STOCKAGE, purgees: place.purgees });
      }
      const v = await rpc(env, "massamba_version_creer", { p_statut: statut, p_base: base, p_revision: b.revision || null, p_scores: scores, p_nb: nb, p_reste: reste,
        p_dernier_id: dernierId, p_duree: duree, p_fichiers: fichiers, p_details: details, p_now: now.toISOString() });
      if (!v || !v.version) return erreur(503, "indisponible", "Séance non consignée.");
      const televersements: Record<string, string> = {};
      for (const [f, p] of Object.entries((v.chemins || {}) as Record<string, string>)) televersements[f] = await urlDepot(env, p);
      return json(201, { version: v.version, statut, televersements, methode: "PUT", expire_dans_s: 7200, ...(place ? { purgees: place.purgees, ...(place.fusion_retiree ? { fusion_retiree: place.fusion_retiree } : {}) } : {}) });
    }
    // Dernière version publiée (+ dernière tentative) : URL de lecture signées (1 h)
    if (req.method === "GET" && chemin === "/versions/derniere") {
      const a = await autoriser(req, env, { atelier: true, proprio: true }); if (a instanceof Response) return a;
      const [v, t] = await Promise.all([rpc(env, "massamba_derniere", {}), rpc(env, "massamba_tentative", {})]);
      const tentative = t ? { version: t.version, statut: t.statut, cree_le: isoZ(t.cree_le), dernier_id: idTexte(t.dernier_id) } : null;
      if (!v) return json(200, { version: null, fichiers: {}, derniere_tentative: tentative });
      const chemins = (v.chemins || {}) as Record<string, string>;
      const signees = await urlsLecture(env, Object.values(chemins));
      const fichiers: Record<string, string> = {};
      for (const [f, p] of Object.entries(chemins)) if (signees[p]) fichiers[f] = signees[p];
      const d = v.details || {};
      return json(200, { version: v.version, base: v.base, revision: v.revision ?? null, publiee_le: isoZ(v.publiee_le), cree_le: isoZ(v.cree_le), scores: v.scores || {},
        nb_exemples: v.nb_exemples, reste: v.reste, dernier_id: idTexte(v.dernier_id), fichiers, empreintes: d.empreintes || {}, tailles: d.tailles || {},
        assemblage: d.assemblage || {}, base_ollama: d.base_ollama || null, fichiers_retires: d.fichiers_retires || [],
        expire_le: isoZ(new Date(now.getTime() + DUREE_LECTURE * 1000)), derniere_tentative: tentative });
    }
    // Publication d'une candidate : tous les fichiers présents, avec la bonne taille ; idempotente
    const m = chemin.match(/^\/versions\/([^/]+)\/publier$/);
    if (req.method === "POST" && m) {
      const a = await autoriser(req, env, { atelier: true }); if (a instanceof Response) return a;
      const n = decodeURIComponent(m[1]);
      if (!RE_VERSION.test(n)) return erreur(404, "introuvable", "Version inconnue.");
      const b = await lireJson(req, 64_000, true);
      const empreintes = b.empreintes ?? {}, tailles = b.tailles ?? {};
      if (!(empreintes && typeof empreintes === "object" && !Array.isArray(empreintes) && Object.values(empreintes).every((x) => typeof x === "string" && /^[0-9a-f]{64}$/.test(x)))) return erreur(400, "empreintes", "Empreintes SHA-256 invalides.");
      if (!(tailles && typeof tailles === "object" && !Array.isArray(tailles) && Object.values(tailles).every((x) => Number.isSafeInteger(x) && (x as number) >= 0))) return erreur(400, "tailles", "Tailles invalides.");
      if (b.scores !== undefined && b.scores !== null && !objetSimple(b.scores)) return erreur(400, "scores", "Scores invalides.");
      const v = await rpc(env, "massamba_version", { p_version: n });
      if (!v) return erreur(404, "introuvable", "Version inconnue.");
      if (v.statut === "publiee") return json(200, { version: v.version, publiee_le: isoZ(v.publiee_le) });
      if (v.statut !== "candidat") return erreur(409, "statut", `Séance « ${v.statut} » : rien à publier.`, { statut: v.statut });
      const chemins = (v.chemins || {}) as Record<string, string>;
      if (!Object.keys(chemins).length) return erreur(409, "fichiers", "Aucun fichier attendu pour cette version.");
      if (Object.keys(empreintes).some((f) => !chemins[f]) || Object.keys(tailles).some((f) => !chemins[f])) return erreur(409, "fichiers", "Empreinte ou taille d'un fichier non annoncé.");
      const presents = await fichiersPresents(env, n);
      const manquants = Object.keys(chemins).filter((f) => !(presents[f] > 0));
      if (manquants.length) return erreur(409, "fichiers", "Fichiers manquants : " + manquants.join(", "), { manquants });
      const attendues: Record<string, number> = { ...((v.details && v.details.tailles_annoncees) || {}), ...tailles };
      const mauvaises = Object.keys(attendues).filter((f) => presents[f] !== attendues[f]);
      if (mauvaises.length) return erreur(409, "taille", "Taille inattendue : " + mauvaises.join(", "), { fichiers: mauvaises });
      const scores = { ...(v.scores || {}), ...(b.scores || {}) };
      if (typeof scores.apres === "number" && typeof scores.avant_derniere === "number" && scores.apres < scores.avant_derniere) {
        await rpc(env, "massamba_rejeter", { p_version: n, p_raison: `régression : ${scores.apres} < ${scores.avant_derniere}` });
        return erreur(409, "regression", `Score en baisse (${scores.apres} < ${scores.avant_derniere}) : version rejetée.`);
      }
      const precedente = await rpc(env, "massamba_derniere", {});
      const r = await rpc(env, "massamba_publier", { p_version: n, p_empreintes: empreintes, p_tailles: tailles, p_now: now.toISOString() });
      if (!r || r.erreur) return erreur(409, "statut", "Version déjà traitée.");
      // Ménage : seuls les fichiers de cette version et de la précédente publiée (retour arrière) restent dans le bucket
      let purgees: string[] = [];
      try { purgees = await purger(env, now, n, precedente && precedente.version < n ? [precedente.version] : []); }
      catch (e: any) { console.error("[massamba] ménage :", e && e.message); }
      return json(200, { version: n, publiee_le: isoZ(r.publiee_le), purgees });
    }
    return erreur(404, "introuvable", "Ressource introuvable.");
  } catch (e: any) {
    if (e && e.status) return erreur(e.status, "requete", e.status === 413 ? "Envoi trop volumineux." : "Demande illisible.");
    console.error("[massamba]", e && e.message);
    return erreur(503, "indisponible", "Service momentanément indisponible. Réessayez dans un instant.");
  }
}

// ------------------------------------------------------------------ Démarrage (Supabase Edge, Deno)
declare const Deno: any;
if (typeof Deno !== "undefined" && Deno.serve) {
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || (() => { try { const j = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); return typeof j.default === "string" ? j.default : ""; } catch { return ""; } })();
  const env: Env = { url: (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, ""), cle, fetch: fetch.bind(globalThis), now: () => new Date() };
  Deno.serve((req: Request) => traiter(req, env));
}
