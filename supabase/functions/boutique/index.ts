// Teranga Outils — fonction Edge « boutique » (fichier unique, aucune dépendance) : catalogue public, commandes payées par
// Wave au montant unique (détection par le téléphone du propriétaire via la fonction « api », inchangée), livraison des
// fichiers au détenteur du jeton, dépôt des produits par la fabrique (jeton OIDC de GitHub Actions, aucun secret stocké),
// administration par la clé du propriétaire (ADMIN_KEY). Base : migration 20261102000008_boutique.sql.
// Testé sous Node (node --experimental-strip-types supabase/functions/boutique/test.ts) : seul Deno.serve est propre à Deno.

export const REPO = "ndoyepapamassamba-commits/Add-a-README-file";
export const BRANCHE_DEFAUT = "refs/heads/claude/innovative-revenue-website-1dqvgq";
export const WORKFLOW = `${REPO}/.github/workflows/boutique-fabrique.yml@`;
export const GH_ISS = "https://token.actions.githubusercontent.com";
export const AUDIENCE = "teranga-boutique";
const JWKS_URL = `${GH_ISS}/.well-known/jwks`;
const MAX_DEPOT = 6 * 1024 * 1024;
const MAX_JSON = 16 * 1024;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const enc = new TextEncoder();

export interface Env { url: string; cle: string; fetch: typeof fetch; now: () => Date }

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, x-admin-key",
  "Access-Control-Expose-Headers": "content-disposition",
};
const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
const erreur = (status: number, code: string, message: string) => json(status, { erreur: code, message });

export function toHex(b: ArrayBuffer | Uint8Array): string {
  const v = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ""; for (const x of v) s += x.toString(16).padStart(2, "0"); return s;
}
export async function sha256Hex(t: string): Promise<string> { return toHex(await crypto.subtle.digest("SHA-256", enc.encode(t))); }
export function egal(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || !a.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function b64url(bytes: Uint8Array): string { let s = ""; for (const x of bytes) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function deB64url(s: string): Uint8Array { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
export function nouvelId(): string { let s = "TCV-"; for (const b of crypto.getRandomValues(new Uint8Array(8))) s += CROCKFORD[b & 31]; return s; }
export function nouveauJeton(): string { return b64url(crypto.getRandomValues(new Uint8Array(24))); }
export function formatWave(n: string | null): string | null {
  const d = String(n || "").replace(/\D/g, "").replace(/^221(?=\d{9}$)/, "");
  return /^\d{9}$/.test(d) ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : null;
}

// ------------------------------------------------------------------ Base (RPC PostgREST, clé de service)
async function rpc(env: Env, fn: string, args: Record<string, unknown>): Promise<any> {
  const h: Record<string, string> = { "content-type": "application/json", apikey: env.cle };
  if (env.cle.startsWith("eyJ")) h.authorization = `Bearer ${env.cle}`;
  const r = await env.fetch(`${env.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(args) });
  if (!r.ok) { console.error(`[boutique] ${fn} : ${r.status}`); throw new Error("base"); }
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
let _reglages: { v: any; t: number } | null = null;
async function reglages(env: Env): Promise<{ admin_key: string | null; wave: string | null }> {
  if (_reglages && env.now().getTime() - _reglages.t < 60_000) return _reglages.v;
  const v = await rpc(env, "boutique_reglages", {});
  _reglages = { v: v || {}, t: env.now().getTime() };
  return _reglages.v;
}
export function _oublierCaches() { _reglages = null; _jwks = null; }

async function lireJson(req: Request, max: number): Promise<any> {
  const t = await req.text();
  if (t.length > max) throw Object.assign(new Error("trop gros"), { status: 413 });
  try { const v = JSON.parse(t); if (v && typeof v === "object" && !Array.isArray(v)) return v; } catch { /* plus bas */ }
  throw Object.assign(new Error("json"), { status: 400 });
}
function ip(req: Request): string { return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "-"; }

// ------------------------------------------------------------------ Jeton OIDC de GitHub Actions (fabrique)
let _jwks: { cles: any[]; t: number } | null = null;
async function cleGithub(env: Env, kid: string): Promise<any | null> {
  const frais = _jwks && env.now().getTime() - _jwks.t < 3600_000;
  let k = frais ? _jwks!.cles.find((x) => x.kid === kid) : null;
  if (k) return k;
  const r = await env.fetch(JWKS_URL, { headers: { accept: "application/json" } });
  if (!r.ok) return null;
  const j = await r.json();
  _jwks = { cles: Array.isArray(j?.keys) ? j.keys : [], t: env.now().getTime() };
  return _jwks.cles.find((x) => x.kid === kid) || null;
}
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
  if (!(charge.exp > maintenant) || !(charge.iat <= maintenant + 60) || (charge.nbf && charge.nbf > maintenant + 60)) return { ok: false, raison: "date" };
  if (charge.repository !== REPO || charge.ref !== BRANCHE_DEFAUT) return { ok: false, raison: "depot" };
  if (typeof charge.workflow_ref !== "string" || !charge.workflow_ref.startsWith(WORKFLOW)) return { ok: false, raison: "workflow" };
  if (!["schedule", "workflow_dispatch"].includes(charge.event_name)) return { ok: false, raison: "evenement" };
  return { ok: true, charge };
}

// ------------------------------------------------------------------ Contrôle d'un produit déposé
const INTERDITS = /\b(attestation|certificat|diplome|fiche de paie|bulletin de salaire|ordonnance|medicament|diagnostic medical|posologie|casino|paris sportifs?|pari|crypto|bitcoin|forex|arme|adulte|sexe|faux|contrefa)/;
const sansAcc = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function controlerDepot(b: any): string | null {
  const p = b?.produit, f = b?.fichiers;
  if (!p || typeof p !== "object") return "produit manquant";
  for (const k of ["slug", "titre", "domaine", "accroche", "description"]) if (typeof p[k] !== "string" || !p[k].trim()) return `${k} manquant`;
  if (!Number.isInteger(p.prix) || p.prix < 500 || p.prix > 9500) return "prix";
  if (!Array.isArray(f) || f.length < 1 || f.length > 5) return "fichiers";
  const texte = sansAcc([p.titre, p.domaine, p.accroche, p.description, JSON.stringify(p.points || []), JSON.stringify(p.faq || [])].join(" "));
  if (INTERDITS.test(texte)) return "sujet interdit";
  if (!p.controle || p.controle.ok !== true) return "contrôles de la fabrique non réussis";
  return null;
}

// ------------------------------------------------------------------ Routes
export async function traiter(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const chemin = url.pathname.replace(/^.*?\/boutique(?=\/|$)/, "") || "/";
  const now = env.now();
  try {
    if (req.method === "GET" && chemin === "/catalogue") {
      return json(200, { produits: (await rpc(env, "boutique_catalogue", {})) || [] }, { "cache-control": "public, max-age=60" });
    }
    if (req.method === "GET" && chemin === "/config") {
      const r = await reglages(env);
      return json(200, { wave: formatWave(r.wave) }, { "cache-control": "public, max-age=300" });
    }
    let m = chemin.match(/^\/produits\/(bt_[a-z0-9_]{2,60})$/);
    if (req.method === "GET" && m) {
      const p = await rpc(env, "boutique_produit", { p_id: m[1] });
      return p ? json(200, { produit: p }, { "cache-control": "public, max-age=60" }) : erreur(404, "introuvable", "Ce produit n'est pas en vente.");
    }
    if (req.method === "POST" && chemin === "/commandes") {
      const b = await lireJson(req, MAX_JSON);
      if (b.website) return erreur(400, "validation", "Votre demande n'a pas pu être traitée.");
      const produit = String(b.produit || "");
      const nom = String(b.nom || "").trim().replace(/\s+/g, " ");
      if (!/^bt_[a-z0-9_]{2,60}$/.test(produit)) return erreur(400, "produit", "Produit inconnu.");
      if (!/^[\p{L}][\p{L} '’.-]{1,79}$/u.test(nom)) return erreur(400, "nom", "Indiquez votre nom (lettres seulement).");
      if (b.cgv !== true) return erreur(400, "cgv", "Acceptez les conditions de vente pour continuer.");
      const r = await reglages(env);
      const id = nouvelId(), jeton = nouveauJeton();
      const res = await rpc(env, "boutique_creer_commande", {
        p_produit: produit, p_order_id: id, p_token_hash: await sha256Hex(jeton),
        p_buyer: { fullName: nom, acceptedAt: now.toISOString(), cgvVersion: "boutique-2026-11-02" },
        p_ip_hash: (await sha256Hex(`bt-ip:${r.admin_key || ""}:${ip(req)}`)).slice(0, 32), p_now: now.toISOString(),
      });
      if (!res || res.erreur === "indisponible") return erreur(404, "indisponible", "Ce produit n'est plus en vente.");
      if (res.erreur === "trop") return erreur(429, "trop", "Trop de commandes en peu de temps. Réessayez dans une heure.");
      return json(201, { commande: { ...res, jeton }, wave: formatWave(r.wave) });
    }
    m = chemin.match(/^\/commandes\/(TCV-[0-9A-HJKMNP-TV-Z]{8})(\/fichiers\/([A-Za-z0-9][A-Za-z0-9._-]{0,79}))?$/);
    if (req.method === "GET" && m) {
      const t = url.searchParams.get("t") || "";
      if (t.length < 20 || t.length > 64) return erreur(404, "introuvable", "Commande introuvable.");
      const h = await sha256Hex(t);
      if (!m[3]) {
        const c = await rpc(env, "boutique_commande", { p_order_id: m[1], p_token_hash: h, p_now: now.toISOString() });
        if (!c) return erreur(404, "introuvable", "Commande introuvable.");
        const r = await reglages(env);
        return json(200, { commande: c, wave: formatWave(r.wave) });
      }
      const f = await rpc(env, "boutique_fichier", { p_order_id: m[1], p_token_hash: h, p_nom: m[3], p_now: now.toISOString() });
      if (!f) return erreur(404, "introuvable", "Fichier introuvable ou commande non payée.");
      if (f.erreur === "trop") return erreur(429, "trop", "Trop de téléchargements aujourd'hui. Réessayez demain.");
      const bin = atob(String(f.b64).replace(/\s+/g, "")); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
      return new Response(o, { status: 200, headers: { ...CORS, "content-type": f.mime || "application/octet-stream", "content-disposition": `attachment; filename="${f.nom}"`, "cache-control": "no-store, private", "x-content-type-options": "nosniff" } });
    }
    if (req.method === "GET" && chemin === "/fabrique/fiches") {
      const v = await verifierGithub(env, (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
      if (!v.ok) { console.warn(`[boutique] fiches refusées : ${v.raison}`); return erreur(401, "refuse", "Accès refusé."); }
      return json(200, { fiches: (await rpc(env, "boutique_fiches_attente", {})) || [] });
    }
    if (req.method === "POST" && chemin === "/depot") {
      const auth = req.headers.get("authorization") || "";
      const v = await verifierGithub(env, auth.replace(/^Bearer\s+/i, ""));
      if (!v.ok) { console.warn(`[boutique] dépôt refusé : ${v.raison}`); return erreur(401, "refuse", "Accès refusé."); }
      const b = await lireJson(req, MAX_DEPOT);
      const pb = controlerDepot(b);
      if (pb) return erreur(400, "controle", pb);
      const res = await rpc(env, "boutique_deposer", { p_produit: { ...b.produit, source: "fabrique" }, p_fichiers: b.fichiers, p_now: now.toISOString() });
      if (!res || res.erreur) return erreur(409, "depot", (res && res.erreur) || "dépôt impossible");
      const ficheId = Number(b.fiche_id);
      if (Number.isInteger(ficheId) && ficheId > 0) res.fiche = await rpc(env, "boutique_fiche_deposee", { p_fiche_id: ficheId, p_produit: res.id, p_now: now.toISOString() });
      return json(201, res);
    }
    if (chemin === "/admin" || chemin === "/admin/decider") {
      const r = await reglages(env);
      const k = req.headers.get("x-admin-key") || "";
      if (!r.admin_key || !egal(k.trim(), r.admin_key)) return erreur(404, "introuvable", "Ressource introuvable.");
      if (req.method === "GET" && chemin === "/admin") return json(200, await rpc(env, "boutique_admin", { p_now: now.toISOString() }));
      if (req.method === "POST" && chemin === "/admin/decider") {
        const b = await lireJson(req, MAX_JSON);
        if (!/^bt_[a-z0-9_]{2,60}$/.test(String(b.id || "")) || !["publier", "refuser", "retirer"].includes(b.action)) return erreur(400, "validation", "Demande invalide.");
        return json(200, await rpc(env, "boutique_decider", { p_id: b.id, p_action: b.action, p_now: now.toISOString() }));
      }
    }
    return erreur(404, "introuvable", "Ressource introuvable.");
  } catch (e: any) {
    if (e && e.status) return erreur(e.status, "requete", e.status === 413 ? "Envoi trop volumineux." : "Demande illisible.");
    console.error("[boutique]", e && e.message);
    return erreur(503, "indisponible", "Service momentanément indisponible. Réessayez dans un instant.");
  }
}

// ------------------------------------------------------------------ Démarrage (Supabase Edge, Deno)
declare const Deno: any;
if (typeof Deno !== "undefined" && Deno.serve) {
  const cleService = (() => {
    const l = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
    if (l) return l;
    try { const j = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); return typeof j.default === "string" ? j.default : ""; } catch { return ""; }
  })();
  const env: Env = { url: Deno.env.get("SUPABASE_URL") || "", cle: cleService, fetch: fetch.bind(globalThis), now: () => new Date() };
  Deno.serve((req: Request) => traiter(req, env));
}
