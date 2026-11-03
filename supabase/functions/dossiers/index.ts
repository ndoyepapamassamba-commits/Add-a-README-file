// Fonction Edge « dossiers » : dossiers partagés des applications AccordAI et ColisPreuve (fichier unique, sans dépendance).
// Un dossier = des données courantes + un historique chaîné (empreintes SHA-256) + des photos de preuve. L'accès se fait par
// des liens secrets par rôle (proprio, partie, livreur, destinataire) : seules les empreintes des jetons sont gardées.
// Pass payant (commande de la boutique) pour l'extraction par l'IA et les gros volumes. Base : migration dossiers_partages.
// Tests : node --experimental-strip-types supabase/functions/dossiers/test.ts

export interface Env { url: string; cle: string; fetch: typeof fetch; now: () => Date; openrouter?: string }
const enc = new TextEncoder();
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CORS: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
const json = (s: number, b: unknown, h: Record<string, string> = {}) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h } });
const erreur = (s: number, code: string, message: string) => json(s, { erreur: code, message });
export const ROLES: Record<string, string[]> = { accord: ["proprio", "partie"], colis: ["proprio", "livreur", "destinataire"] };
export const PASS: Record<string, string[]> = { accord: ["pass-accordai-1-mois", "pass-accordai-12-mois"], colis: ["pass-colispreuve-1-mois", "pass-colispreuve-12-mois"] };
// Types d'événements permis par application et par rôle
export const EVENEMENTS: Record<string, Record<string, string[]>> = {
  accord: { proprio: ["modification", "note", "preuve", "livraison", "cloture", "acceptation"], partie: ["confirmation", "correction", "note", "preuve", "reception"] },
  colis: { proprio: ["preparation", "remise_livreur", "note", "preuve", "annulation", "modification"], livreur: ["prise_en_charge", "en_route", "tentative", "livraison", "note", "preuve"], destinataire: ["reception", "probleme", "note"] },
};
const STATUTS: Record<string, string> = { confirmation: "confirme", correction: "a_revoir", acceptation: "confirme", livraison: "livre", reception: "recu", cloture: "clos", annulation: "annule", preparation: "prepare", remise_livreur: "chez_livreur", prise_en_charge: "chez_livreur", en_route: "en_route", tentative: "tentative", probleme: "probleme" };

async function sha256Hex(t: string): Promise<string> { const b = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(t))); let s = ""; for (const x of b) s += x.toString(16).padStart(2, "0"); return s; }
function b64url(bytes: Uint8Array): string { let s = ""; for (const x of bytes) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
export const nouvelId = () => { let s = "D-"; for (const b of crypto.getRandomValues(new Uint8Array(10))) s += CROCKFORD[b & 31]; return s; };
export const nouveauJeton = () => b64url(crypto.getRandomValues(new Uint8Array(24)));
export const codeRemise = () => String(1000 + (crypto.getRandomValues(new Uint16Array(1))[0] % 9000));

async function rpc(env: Env, fn: string, args: Record<string, unknown>): Promise<any> {
  const h: Record<string, string> = { "content-type": "application/json", apikey: env.cle };
  if (env.cle.startsWith("eyJ")) h.authorization = `Bearer ${env.cle}`;
  const r = await env.fetch(`${env.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(args) });
  if (!r.ok) { console.error(`[dossiers] ${fn} : ${r.status}`); throw new Error("base"); }
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
async function lireJson(req: Request, max: number): Promise<any> {
  const t = await req.text();
  if (t.length > max) throw Object.assign(new Error("trop gros"), { status: 413 });
  try { const v = JSON.parse(t); if (v && typeof v === "object" && !Array.isArray(v)) return v; } catch { /* plus bas */ }
  throw Object.assign(new Error("json"), { status: 400 });
}
const ip = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "-";
const propre = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
// Données libres d'un dossier ou d'un événement : objet plat de textes et nombres, taille bornée, sans fichiers
export function nettoyerDonnees(d: any, maxCles = 40): Record<string, string | number | boolean> | null {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(d).slice(0, maxCles)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = propre(v, 2000);
  }
  return JSON.stringify(out).length <= 20000 ? out : null;
}

// Pass d'application : « o » (identifiant de commande) + « t » (jeton) d'une commande payée de la boutique
async function passValide(env: Env, app: string, pass: any): Promise<boolean> {
  if (!pass || !/^TCV-[0-9A-HJKMNP-TV-Z]{8}$/.test(String(pass.o || "")) || String(pass.t || "").length < 20) return false;
  const v = await rpc(env, "dossier_pass_valide", { p_order_id: pass.o, p_token_hash: await sha256Hex(String(pass.t)), p_produits: PASS[app], p_now: env.now().toISOString() }).catch(() => null);
  return !!(v && v.valide);
}
async function cleIa(env: Env): Promise<string> {
  if (env.openrouter) return env.openrouter;
  const r = await rpc(env, "boutique_reglages", {}).catch(() => null);
  return (r && r.openrouter) || "";
}

// Extraction d'un accord (AccordAI) depuis une conversation collée et/ou des photos : modèle payant bon marché
export const CONSIGNE_ACCORD = "Tu lis une conversation commerciale (WhatsApp, SMS, notes) ou des photos (devis, bon de commande, capture) entre deux parties au Sénégal. " +
  "Extrais UNIQUEMENT ce qui y est dit, sans rien inventer ni compléter. Réponds par un objet JSON : {\"titre\": \"objet court de l'accord\", " +
  "\"vendeur\": \"…\", \"acheteur\": \"…\", \"produit\": \"…\", \"quantite\": \"…\", \"prix_unitaire\": \"…\", \"prix_total\": \"…\", \"acompte\": \"…\", " +
  "\"delai\": \"…\", \"lieu\": \"…\", \"engagements\": \"engagements de chaque partie, une phrase chacun\", \"points_flous\": \"ce qui n'est pas clair ou manque\"}. " +
  "Laisse une valeur vide \"\" si l'information n'apparaît pas. Montants tels qu'écrits (F CFA). Pas de conseil juridique.";
export async function extraireAccord(env: Env, cle: string, texte: string, photos: string[]): Promise<any> {
  const contenu: any = photos.length ? [{ type: "text", text: `Conversation ou notes :\n${texte || "(aucune)"}` }, ...photos.map((u) => ({ type: "image_url", image_url: { url: u } }))] : `Conversation ou notes :\n${texte}`;
  let derniere = "";
  for (const modele of ["google/gemini-2.5-flash", "openai/gpt-4o-mini"]) {
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 60000);
      const r = await env.fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: ctl.signal,
        headers: { authorization: `Bearer ${cle}`, "content-type": "application/json", "x-title": "AccordAI" },
        body: JSON.stringify({ model: modele, temperature: 0.1, max_tokens: 1500, response_format: { type: "json_object" }, messages: [{ role: "system", content: CONSIGNE_ACCORD }, { role: "user", content: contenu }] }) });
      clearTimeout(tm);
      if (!r.ok) { derniere = `${modele} : ${r.status}`; continue; }
      const j = await r.json();
      const t = String(j?.choices?.[0]?.message?.content || "").replace(/^```(?:json)?\s*|\s*```$/g, "");
      const d = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
      const propres = nettoyerDonnees(d, 20);
      if (propres) return propres;
      derniere = `${modele} : réponse illisible`;
    } catch (e: any) { derniere = `${modele} : ${e && e.message}`; }
  }
  throw new Error("extraction impossible (" + derniere + ")");
}

export async function traiter(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const chemin = url.pathname.replace(/^.*?\/dossiers(?=\/|$)/, "") || "/";
  const now = env.now();
  try {
    // Création : renvoie les liens secrets de chaque rôle (montrés une seule fois)
    if (req.method === "POST" && chemin === "/creer") {
      const b = await lireJson(req, 40_000);
      const app = String(b.app || "");
      if (!ROLES[app]) return erreur(400, "app", "Application inconnue.");
      const titre = propre(b.titre, 140);
      if (titre.length < 2) return erreur(400, "titre", "Donnez un titre au dossier.");
      const donnees = nettoyerDonnees(b.donnees || {});
      if (!donnees) return erreur(400, "donnees", "Données invalides.");
      if (app === "colis") donnees.code_remise_empreinte = await sha256Hex("code:" + (b.code_remise || ""));
      const premium = await passValide(env, app, b.pass);
      const id = nouvelId(), jetons: Record<string, string> = {}, roles: Record<string, string> = {};
      for (const r of ROLES[app]) { jetons[r] = nouveauJeton(); roles[r] = await sha256Hex(jetons[r]); }
      const res = await rpc(env, "dossier_creer", { p_id: id, p_app: app, p_titre: titre, p_donnees: donnees, p_roles: roles,
        p_ip_hash: (await sha256Hex("dos-ip:" + ip(req))).slice(0, 32), p_premium: premium, p_now: now.toISOString() });
      if (!res || res.erreur === "trop") return erreur(429, "trop", premium ? "Trop de dossiers aujourd'hui." : "Limite gratuite atteinte aujourd'hui : activez le pass pour continuer.");
      return json(201, { id, jetons, premium, empreinte: res.empreinte });
    }
    let m = chemin.match(/^\/(D-[0-9A-HJKMNP-TV-Z]{10})(\/evenement|\/photo|\/photos\/(photo-[0-9]{1,2}\.(?:jpg|png|webp)))?$/);
    if (m) {
      const t = (req.method === "GET" ? url.searchParams.get("t") : null) || "";
      if (req.method === "GET" && !m[2]) {
        if (t.length < 20 || t.length > 64) return erreur(404, "introuvable", "Dossier introuvable.");
        const d = await rpc(env, "dossier_lire", { p_id: m[1], p_hash: await sha256Hex(t) });
        if (!d) return erreur(404, "introuvable", "Dossier introuvable ou lien expiré.");
        if (d.donnees) delete d.donnees.code_remise_empreinte;
        return json(200, { dossier: d });
      }
      if (req.method === "GET" && m[3]) {
        if (t.length < 20 || t.length > 64) return erreur(404, "introuvable", "Photo introuvable.");
        const ph = await rpc(env, "dossier_photo", { p_id: m[1], p_hash: await sha256Hex(t), p_nom: m[3] });
        if (!ph) return erreur(404, "introuvable", "Photo introuvable.");
        const bin = atob(ph.b64); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
        return new Response(o, { status: 200, headers: { ...CORS, "content-type": ph.mime, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
      }
      if (req.method === "POST" && m[2] === "/evenement") {
        const b = await lireJson(req, 40_000);
        const jeton = String(b.t || ""); if (jeton.length < 20 || jeton.length > 64) return erreur(404, "introuvable", "Dossier introuvable.");
        const h = await sha256Hex(jeton);
        const d = await rpc(env, "dossier_lire", { p_id: m[1], p_hash: h });
        if (!d) return erreur(404, "introuvable", "Dossier introuvable ou lien expiré.");
        const type = String(b.type || "");
        if (!(EVENEMENTS[d.app]?.[d.role] || []).includes(type)) return erreur(403, "type", "Action non permise pour ce lien.");
        const donnees = nettoyerDonnees(b.donnees || {}, 30);
        if (!donnees) return erreur(400, "donnees", "Données invalides.");
        let maj: any = null;
        if (d.role === "proprio" && (type === "modification" || type === "acceptation") && b.maj) {
          maj = nettoyerDonnees(b.maj); if (!maj) return erreur(400, "donnees", "Données invalides.");
          const empreinte = (await rpc(env, "dossier_lire_interne", { p_id: m[1] }).catch(() => null))?.code_remise_empreinte;
          if (empreinte) maj.code_remise_empreinte = empreinte;
        }
        // Livraison d'un colis : le code donné par le destinataire est vérifié (empreinte), jamais stocké en clair
        if (d.app === "colis" && type === "livraison") {
          const attendu = (await rpc(env, "dossier_lire_interne", { p_id: m[1] }))?.code_remise_empreinte;
          const bon = attendu && attendu === await sha256Hex("code:" + String(b.code_remise || ""));
          donnees.code_verifie = !!bon;
          if (!bon) return erreur(400, "code", "Code de remise incorrect : demandez-le au destinataire.");
        }
        const res = await rpc(env, "dossier_evenement", { p_id: m[1], p_hash: h, p_type: type, p_donnees: donnees, p_maj: maj, p_statut: STATUTS[type] || null, p_now: now.toISOString() });
        if (!res) return erreur(404, "introuvable", "Dossier introuvable.");
        if (res.erreur === "trop") return erreur(429, "trop", "Trop d'actions aujourd'hui sur ce dossier.");
        if (res.erreur === "plein") return erreur(409, "plein", "Ce dossier est complet.");
        if (res.erreur) return erreur(403, res.erreur, "Action non permise pour ce lien.");
        return json(201, res);
      }
      if (req.method === "POST" && m[2] === "/photo") {
        const b = await lireJson(req, 2_200_000);
        const jeton = String(b.t || ""); if (jeton.length < 20 || jeton.length > 64) return erreur(404, "introuvable", "Dossier introuvable.");
        const mm = String(b.photo || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
        if (!mm) return erreur(400, "photo", "Photo invalide.");
        const h = await sha256Hex(jeton);
        const res = await rpc(env, "dossier_photo_ajouter", { p_id: m[1], p_hash: h, p_mime: mm[1], p_b64: mm[2], p_now: now.toISOString() });
        if (!res) return erreur(404, "introuvable", "Dossier introuvable.");
        if (res.erreur) return erreur(400, res.erreur, res.erreur === "plein" ? "30 photos au plus par dossier." : "Photo refusée (format ou taille).");
        const ev = await rpc(env, "dossier_evenement", { p_id: m[1], p_hash: h, p_type: "preuve", p_donnees: { photo: res.nom, sha256: res.sha256, legende: propre(b.legende, 200) }, p_maj: null, p_statut: null, p_now: now.toISOString() });
        return json(201, { photo: res.nom, sha256: res.sha256, evenement: ev });
      }
    }
    // Extraction par l'IA (AccordAI) : pass requis (coût réel), photos jointes possibles
    if (req.method === "POST" && chemin === "/extraire") {
      const b = await lireJson(req, 5_000_000);
      if (!(await passValide(env, "accord", b.pass))) return erreur(402, "pass", "L'extraction automatique fait partie du pass AccordAI.");
      if (!(await rpc(env, "tcv_hit_rate_limit", { p_key: "dos-ia:" + String(b.pass.o), p_window_seconds: 86400, p_max: 60, p_now: now.toISOString() }).catch(() => false)))
        return erreur(429, "trop", "Trop d'extractions aujourd'hui.");
      const texte = propre(b.texte, 20000);
      const photos = (Array.isArray(b.photos) ? b.photos : []).slice(0, 4).filter((u: any) => typeof u === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u) && u.length < 2_000_000);
      if (!texte && !photos.length) return erreur(400, "vide", "Collez une conversation ou ajoutez une photo.");
      const cle = await cleIa(env);
      if (!cle) return erreur(503, "ia", "Extraction momentanément indisponible.");
      return json(200, { accord: await extraireAccord(env, cle, texte, photos) });
    }
    if (req.method === "POST" && chemin === "/pass") {
      const b = await lireJson(req, 4000);
      if (!ROLES[String(b.app)]) return erreur(400, "app", "Application inconnue.");
      return json(200, { valide: await passValide(env, String(b.app), b.pass) });
    }
    return erreur(404, "introuvable", "Ressource introuvable.");
  } catch (e: any) {
    if (e && e.status) return erreur(e.status, "requete", e.status === 413 ? "Envoi trop volumineux." : "Demande illisible.");
    console.error("[dossiers]", e && e.message);
    return erreur(503, "indisponible", "Service momentanément indisponible.");
  }
}

declare const Deno: any;
if (typeof Deno !== "undefined" && Deno.serve) {
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; } })();
  const env: Env = { url: Deno.env.get("SUPABASE_URL") || "", cle, fetch: fetch.bind(globalThis), now: () => new Date(), openrouter: Deno.env.get("OPENROUTER_API_KEY") || "" };
  Deno.serve((req: Request) => traiter(req, env));
}
