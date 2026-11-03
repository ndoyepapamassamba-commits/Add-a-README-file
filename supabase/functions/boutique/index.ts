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

export interface Env { url: string; cle: string; fetch: typeof fetch; now: () => Date; openrouter?: string; modeles?: string[]; modelesFabrique?: string[]; modelesPayantsFabrique?: string[]; modelesImage?: string[] }

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
async function reglages(env: Env): Promise<{ admin_key: string | null; wave: string | null; openrouter?: string | null }> {
  if (_reglages && env.now().getTime() - _reglages.t < 60_000) return _reglages.v;
  const v = await rpc(env, "boutique_reglages", {});
  _reglages = { v: v || {}, t: env.now().getTime() };
  return _reglages.v;
}
export function _oublierCaches() { _reglages = null; _jwks = null; }
// Clé OpenRouter de rédaction : secret de la fonction, sinon celle enregistrée par le propriétaire (route /admin/ia)
async function cleIa(env: Env): Promise<string> { return env.openrouter || (await reglages(env)).openrouter || ""; }
// Documents des clients : modèles payants seulement (les modèles gratuits peuvent conserver les textes reçus)
const MODELES_DEFAUT = ["google/gemini-2.5-flash", "openai/gpt-4o-mini"];
// Fabrique (fiches de produits, sans donnée personnelle) : modèles GRATUITS seulement, aucun coût pour le propriétaire
export const MODELES_FABRIQUE = ["nvidia/nemotron-3-ultra-550b-a55b:free", "nvidia/nemotron-3.5-super-vl:free", "google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"];

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

// ------------------------------------------------------------------ Documents sur mesure (générateurs)
// Formulaire : [{ id, label, type: texte|paragraphe|nombre|choix|date, obligatoire?, max?, choix?, aide? }]
export function validerFormulaire(f: any): string | null {
  if (!Array.isArray(f) || f.length < 1 || f.length > 15) return "formulaire : 1 à 15 champs";
  const ids = new Set<string>();
  for (const c of f) {
    if (!c || typeof c !== "object" || !/^[a-z0-9_]{2,30}$/.test(String(c.id)) || ids.has(c.id)) return "formulaire : identifiant de champ invalide";
    ids.add(c.id);
    if (typeof c.label !== "string" || c.label.length < 2 || c.label.length > 120) return "formulaire : libellé invalide";
    if (!["texte", "paragraphe", "nombre", "choix", "date", "image"].includes(c.type)) return "formulaire : type de champ invalide";
    if (c.type === "choix" && !(Array.isArray(c.choix) && c.choix.length >= 2 && c.choix.length <= 15 && c.choix.every((x: any) => typeof x === "string" && x.length <= 80))) return "formulaire : choix invalides";
  }
  if (f.filter((c: any) => c.type === "image").length > 3) return "formulaire : 3 photos au plus";
  return null;
}
export type PhotoClient = { id: string; nom: string; mime: string; b64: string };
export function validerReponses(formulaire: any[], r: any): { ok: true; reponses: Record<string, string | number>; photos: PhotoClient[] } | { ok: false; message: string } {
  const src = r && typeof r === "object" && !Array.isArray(r) ? r : {};
  const out: Record<string, string | number> = {};
  const photos: PhotoClient[] = [];
  for (const c of formulaire) {
    let v = src[c.id];
    const vide = v === undefined || v === null || String(v).trim() === "";
    if (vide) { if (c.obligatoire) return { ok: false, message: `Champ à remplir : « ${c.label} ».` }; continue; }
    if (c.type === "image") {
      // Photo du client, déjà réduite par son navigateur : JPEG, PNG ou WebP, 3,4 Mo au plus
      const m = String(v).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!m || m[2].length < 1400 || m[2].length > 4_600_000) return { ok: false, message: `« ${c.label} » : photo invalide ou trop lourde.` };
      const nom = `source-${photos.length + 1}.${m[1] === "image/jpeg" ? "jpg" : m[1].split("/")[1]}`;
      photos.push({ id: c.id, nom, mime: m[1], b64: m[2] });
      out[c.id] = nom; continue;
    }
    if (c.type === "nombre") {
      const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n) || Math.abs(n) > 1e12) return { ok: false, message: `« ${c.label} » doit être un nombre.` };
      out[c.id] = n; continue;
    }
    v = String(v).replace(/\r/g, "").trim();
    // Textes longs possibles pour les services (correction, traduction, fiche de révision) : 15 000 caractères au plus
    const max = Math.min(Number(c.max) || (c.type === "paragraphe" ? 1500 : 150), c.type === "paragraphe" ? 15000 : 300);
    if (v.length > max) return { ok: false, message: `« ${c.label} » : ${max} caractères au plus.` };
    if (c.type === "choix" && !c.choix.includes(v)) return { ok: false, message: `« ${c.label} » : choix invalide.` };
    if (c.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, message: `« ${c.label} » : date invalide.` };
    out[c.id] = v;
  }
  if (!Object.keys(out).length) return { ok: false, message: "Remplissez le formulaire." };
  return { ok: true, reponses: out, photos };
}
// Document rédigé : { titre, sections: [{ titre?, paragraphes?: string[], puces?: string[] }] }
export function validerDocument(d: any): string | null {
  if (!d || typeof d !== "object" || typeof d.titre !== "string" || !d.titre.trim() || d.titre.length > 200) return "titre";
  if (!Array.isArray(d.sections) || d.sections.length < 1 || d.sections.length > 25) return "sections";
  let total = d.titre.length;
  for (const s of d.sections) {
    if (!s || typeof s !== "object") return "section";
    for (const k of ["paragraphes", "puces"]) if (s[k] !== undefined && !(Array.isArray(s[k]) && s[k].every((x: any) => typeof x === "string"))) return k;
    if (s.titre !== undefined && typeof s.titre !== "string") return "titre de section";
    total += String(s.titre || "").length + [...(s.paragraphes || []), ...(s.puces || [])].join("").length;
    if (!(s.paragraphes || []).length && !(s.puces || []).length) return "section vide";
  }
  return total > 60000 ? "trop long" : total < 80 ? "trop court" : null;
}
function extraireJson(t: string): any {
  const x = String(t || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try { return JSON.parse(x); } catch { /* plus bas */ }
  const a = x.indexOf("{"), b = x.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("réponse sans JSON");
  return JSON.parse(x.slice(a, b + 1));
}
const REGLES_REDACTION = "Tu rédiges en français clair et professionnel, adapté au Sénégal et à l'Afrique francophone, le document demandé par un client, à partir de SES réponses seulement. " +
  "N'invente aucun fait vérifiable (chiffres, diplômes, adresses, dates, prix) qui ne figure pas dans les réponses ; si une information manque, rédige sans elle. " +
  "Pas de conseil médical, juridique ou financier engageant, pas de promesse de résultat. " +
  "Réponds UNIQUEMENT par un objet JSON : {\"titre\": \"…\", \"sections\": [{\"titre\": \"…\", \"paragraphes\": [\"…\"], \"puces\": [\"…\"]}]}. Pas de Markdown dans les textes.";
export async function rediger(env: Env, g: { consigne: string; formulaire: any[]; reponses: Record<string, unknown>; titre: string }, cle?: string): Promise<any> {
  const k = cle || env.openrouter;
  if (!k) throw new Error("ia indisponible");
  const lignes = (g.formulaire || []).filter((c: any) => g.reponses && g.reponses[c.id] !== undefined).map((c: any) => `- ${c.label} : ${c.type === "image" ? "(photo jointe par le client)" : String(g.reponses[c.id])}`);
  const messages = [
    { role: "system", content: REGLES_REDACTION },
    { role: "user", content: `Document à rédiger : ${g.titre}.\nConsigne :\n${g.consigne}\n\nRéponses du client :\n${lignes.join("\n")}` },
  ];
  let derniere = "";
  const t0 = Date.now();
  for (const modele of env.modeles || MODELES_DEFAUT) {
    if (Date.now() - t0 > 75_000) { derniere += " | temps écoulé"; break; } // limite des fonctions Edge (150 s)
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 70000);
      const r = await env.fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: ctl.signal,
        headers: { authorization: `Bearer ${k}`, "content-type": "application/json", "x-title": "Teranga Outils" },
        body: JSON.stringify({ model: modele, messages, temperature: 0.4, max_tokens: 12000, response_format: { type: "json_object" } }) });
      clearTimeout(tm);
      if (!r.ok) { derniere = `${modele} : ${r.status}`; continue; }
      const j = await r.json();
      const d = extraireJson(j?.choices?.[0]?.message?.content || "");
      const pb = validerDocument(d);
      if (pb) { derniere = `${modele} : ${pb}`; continue; }
      return { titre: d.titre.trim(), sections: d.sections.map((s: any) => ({ titre: s.titre ? String(s.titre).trim() : undefined, paragraphes: (s.paragraphes || []).map((x: string) => x.trim()).filter(Boolean), puces: (s.puces || []).map((x: string) => x.trim()).filter(Boolean) })), modele, le: env.now().toISOString(), ...(Array.isArray(d.prompts_image) ? { prompts_image: d.prompts_image.filter((x: any) => typeof x === "string" && x.trim()).slice(0, 2).map((x: string) => x.slice(0, 2000)) } : {}) };
    } catch (e: any) { derniere = `${modele} : ${e && e.message}`; }
  }
  throw new Error("rédaction impossible (" + derniere + ")");
}

// Fichier Word (.docx) sans bibliothèque : zip « stocké » + XML WordprocessingML minimal
const TABLE_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b: Uint8Array): number { let c = 0xffffffff; for (const x of b) c = TABLE_CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function zip(fichiers: { nom: string; donnees: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let decalage = 0;
  for (const f of fichiers) {
    const nom = enc.encode(f.nom), crc = crc32(f.donnees), n = f.donnees.length;
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
    loc.setUint16(10, 0, true); loc.setUint16(12, 0x21, true); loc.setUint32(14, crc, true); loc.setUint32(18, n, true); loc.setUint32(22, n, true);
    loc.setUint16(26, nom.length, true); loc.setUint16(28, 0, true);
    parts.push(new Uint8Array(loc.buffer), nom, f.donnees);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, 0, true); cen.setUint16(14, 0x21, true); cen.setUint32(16, crc, true); cen.setUint32(20, n, true); cen.setUint32(24, n, true);
    cen.setUint16(28, nom.length, true); cen.setUint32(42, decalage, true);
    central.push(new Uint8Array(cen.buffer), nom);
    decalage += 30 + nom.length + n;
  }
  const tailleCentral = central.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true); fin.setUint32(16, decalage, true);
  const tout = [...parts, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(tout.reduce((s, x) => s + x.length, 0));
  let i = 0; for (const x of tout) { out.set(x, i); i += x.length; }
  return out;
}
const xmlEsc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
export function docx(d: any): Uint8Array {
  const par = (texte: string, style?: string, ind = false) => `<w:p>${style || ind ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${ind ? '<w:ind w:left="360" w:hanging="240"/>' : ""}</w:pPr>` : ""}<w:r><w:t xml:space="preserve">${xmlEsc(texte)}</w:t></w:r></w:p>`;
  let corps = par(d.titre, "Titre");
  for (const s of d.sections) {
    if (s.titre) corps += par(s.titre, "Titre1");
    for (const p of s.paragraphes || []) corps += par(p);
    for (const p of s.puces || []) corps += par("• " + p, undefined, true);
  }
  corps += par("Document rédigé par Teranga Outils à partir de vos réponses. Relisez-le et adaptez-le avant usage.", "Note");
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${corps}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Titre"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="0B6E4F"/><w:sz w:val="36"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="0B6E4F"/><w:sz w:val="26"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="360"/></w:pPr><w:rPr><w:i/><w:color w:val="59635E"/><w:sz w:val="18"/></w:rPr></w:style></w:styles>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return zip([{ nom: "[Content_Types].xml", donnees: enc.encode(types) }, { nom: "_rels/.rels", donnees: enc.encode(rels) },
    { nom: "word/document.xml", donnees: enc.encode(document) }, { nom: "word/_rels/document.xml.rels", donnees: enc.encode(docRels) },
    { nom: "word/styles.xml", donnees: enc.encode(styles) }]);
}
// Commande payée d'un générateur sans document : rédaction (une seule à la fois)
// Services qui livrent des images (affiches) : modèle d'images d'OpenRouter, quelques francs par image
export const MODELES_IMAGE = ["google/gemini-2.5-flash-image", "google/gemini-3.1-flash-image"];
export async function imager(env: Env, cle: string, prompt: string, format: string | null, sources: string[] = []): Promise<{ mime: string; b64: string }> {
  let derniere = "";
  for (const modele of env.modelesImage || MODELES_IMAGE) {
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 55000);
      const r = await env.fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: ctl.signal,
        headers: { authorization: `Bearer ${cle}`, "content-type": "application/json", "x-title": "Teranga Outils" },
        body: JSON.stringify({ model: modele, messages: [{ role: "user", content: sources.length ? [{ type: "text", text: prompt }, ...sources.map((u) => ({ type: "image_url", image_url: { url: u } }))] : prompt }], modalities: ["image", "text"], ...(format ? { image_config: { aspect_ratio: format } } : {}) }) });
      clearTimeout(tm);
      if (!r.ok) { derniere = `${modele} : ${r.status}`; continue; }
      const j = await r.json();
      const url = String(j?.choices?.[0]?.message?.images?.[0]?.image_url?.url || "");
      const m = url.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (!m || m[2].length < 2000) { derniere = `${modele} : pas d'image`; continue; }
      return { mime: m[1], b64: m[2] };
    } catch (e: any) { derniere = `${modele} : ${e && e.name === "AbortError" ? "délai" : e && e.message}`; }
  }
  throw new Error("image impossible (" + derniere + ")");
}
async function genererSiBesoin(env: Env, c: any, id: string, h: string): Promise<any> {
  if (!c || !c.a_generer) return c;
  const g = await rpc(env, "boutique_generation_reserver", { p_order_id: id, p_token_hash: h, p_now: env.now().toISOString() });
  if (!g || g.occupe) return { ...c, en_redaction: true };
  try {
    const cle = await cleIa(env);
    const d = await rediger(env, g, cle);
    if (g.sortie === "image") {
      // Affiches : format statut (9:16) puis format carré (1:1) ; au moins une image, sinon nouvel essai plus tard
      // Photos envoyées par le client (retouche) : deux propositions au format d'origine ; sinon affiches 9:16 et 1:1
      const sources: string[] = [];
      for (const c of (g.formulaire || []).filter((x: any) => x.type === "image")) {
        const nom = g.reponses && g.reponses[c.id];
        if (!nom) continue;
        const ph = await rpc(env, "boutique_commande_image", { p_order_id: id, p_token_hash: h, p_nom: String(nom), p_now: env.now().toISOString() }).catch(() => null);
        if (ph && ph.b64) sources.push(`data:${ph.mime};base64,${ph.b64}`);
      }
      const prompts = (d.prompts_image || []).length ? d.prompts_image : [`${sources.length ? "Edit the attached photo professionally" : "Professional advertising poster"}. ${g.titre}. ${JSON.stringify(g.reponses).slice(0, 1500)}`];
      const formats: (string | null)[] = sources.length ? [null, null] : ["9:16", "1:1"], images: { nom: string; format: string }[] = [], t0 = Date.now();
      for (let i = 0; i < Math.min(2, Math.max(prompts.length, 2)); i++) {
        if (Date.now() - t0 > 60_000) break;
        const im = await imager(env, cle, prompts[Math.min(i, prompts.length - 1)], formats[i], sources).catch(() => null);
        if (!im) continue;
        const nom = `${sources.length ? "retouche" : "affiche"}-${i + 1}.${im.mime === "image/jpeg" ? "jpg" : im.mime.split("/")[1]}`;
        if (await rpc(env, "boutique_commande_image_ajouter", { p_order_id: id, p_nom: nom, p_mime: im.mime, p_b64: im.b64 })) images.push({ nom, format: formats[i] || "original" });
      }
      if (!images.length) throw new Error("aucune image créée");
      d.images = images;
    }
    delete d.prompts_image;
    await rpc(env, "boutique_generation_enregistrer", { p_order_id: id, p_document: d });
    return { ...c, document: d, a_generer: false };
  } catch (e: any) {
    console.error("[boutique] rédaction :", e && e.message);
    await rpc(env, "boutique_generation_enregistrer", { p_order_id: id, p_document: { essais: (g.essais || 0) + 1, erreur: String(e && e.message).slice(0, 200) } });
    return { ...c, en_redaction: true };
  }
}

// ------------------------------------------------------------------ Routes
export async function traiter(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const chemin = url.pathname.replace(/^.*?\/boutique(?=\/|$)/, "") || "/";
  const now = env.now();
  try {
    if (req.method === "GET" && chemin === "/catalogue") {
      // Documents sur mesure visibles seulement quand la rédaction est possible
      const ia = !!(await cleIa(env));
      const liste = ((await rpc(env, "boutique_catalogue", {})) || []).filter((p: any) => ia || p.type !== "generateur");
      return json(200, { produits: liste }, { "cache-control": "public, max-age=60" });
    }
    if (req.method === "GET" && chemin === "/config") {
      const r = await reglages(env);
      return json(200, { wave: formatWave(r.wave) }, { "cache-control": "public, max-age=300" });
    }
    let m = chemin.match(/^\/produits\/(bt_[a-z0-9_]{2,60})$/);
    if (req.method === "GET" && m) {
      const p = await rpc(env, "boutique_produit", { p_id: m[1] });
      const visible = p && (p.type !== "generateur" || !!(await cleIa(env)));
      return visible ? json(200, { produit: p }, { "cache-control": "public, max-age=60" }) : erreur(404, "introuvable", "Ce produit n'est pas en vente.");
    }
    if (req.method === "POST" && chemin === "/commandes") {
      const b = await lireJson(req, 5 * 1024 * 1024); // textes longs et photos des services de retouche
      if (b.website) return erreur(400, "validation", "Votre demande n'a pas pu être traitée.");
      const produit = String(b.produit || "");
      const nom = String(b.nom || "").trim().replace(/\s+/g, " ");
      if (!/^bt_[a-z0-9_]{2,60}$/.test(produit)) return erreur(400, "produit", "Produit inconnu.");
      if (!/^[\p{L}][\p{L} '’.-]{1,79}$/u.test(nom)) return erreur(400, "nom", "Indiquez votre nom (lettres seulement).");
      if (b.cgv !== true) return erreur(400, "cgv", "Acceptez les conditions de vente pour continuer.");
      const r = await reglages(env);
      const fiche = await rpc(env, "boutique_produit", { p_id: produit });
      if (!fiche) return erreur(404, "indisponible", "Ce produit n'est plus en vente.");
      let input: Record<string, string | number> | null = null;
      let photos: PhotoClient[] = [];
      if (fiche.type === "generateur") {
        if (!(await cleIa(env))) return erreur(503, "indisponible", "Ce document sur mesure sera disponible très bientôt.");
        const v = validerReponses(fiche.formulaire || [], b.reponses);
        if (!v.ok) return erreur(400, "reponses", v.message);
        input = v.reponses;
        photos = v.photos;
      }
      const id = nouvelId(), jeton = nouveauJeton();
      const res = await rpc(env, "boutique_creer_commande", {
        p_input: input,
        p_produit: produit, p_order_id: id, p_token_hash: await sha256Hex(jeton),
        p_buyer: { fullName: nom, acceptedAt: now.toISOString(), cgvVersion: "boutique-2026-11-02" },
        p_ip_hash: (await sha256Hex(`bt-ip:${r.admin_key || ""}:${ip(req)}`)).slice(0, 32), p_now: now.toISOString(),
      });
      if (!res || res.erreur === "indisponible") return erreur(404, "indisponible", "Ce produit n'est plus en vente.");
      if (res.erreur === "trop") return erreur(429, "trop", "Trop de commandes en peu de temps. Réessayez dans une heure.");
      for (const ph of photos) {
        const okPh = await rpc(env, "boutique_commande_source_ajouter", { p_order_id: id, p_nom: ph.nom, p_mime: ph.mime, p_b64: ph.b64 });
        if (!okPh) return erreur(400, "photo", "Votre photo n'a pas pu être enregistrée. Réessayez avec une autre photo.");
      }
      return json(201, { commande: { ...res, jeton }, wave: formatWave(r.wave) });
    }
    m = chemin.match(/^\/commandes\/(TCV-[0-9A-HJKMNP-TV-Z]{8})(\/fichiers\/([A-Za-z0-9][A-Za-z0-9._-]{0,79}))?$/);
    if (req.method === "GET" && m) {
      const t = url.searchParams.get("t") || "";
      if (t.length < 20 || t.length > 64) return erreur(404, "introuvable", "Commande introuvable.");
      const h = await sha256Hex(t);
      if (!m[3]) {
        let c = await rpc(env, "boutique_commande", { p_order_id: m[1], p_token_hash: h, p_now: now.toISOString() });
        if (!c) return erreur(404, "introuvable", "Commande introuvable.");
        c = await genererSiBesoin(env, c, m[1], h);
        const r = await reglages(env);
        return json(200, { commande: c, wave: formatWave(r.wave) });
      }
      if (/^(affiche|retouche|source)-\d\.(png|jpg|webp)$/.test(m[3])) {
        const im = await rpc(env, "boutique_commande_image", { p_order_id: m[1], p_token_hash: h, p_nom: m[3], p_now: now.toISOString() });
        if (!im) return erreur(404, "introuvable", "Image introuvable ou commande non payée.");
        if (im.erreur === "trop") return erreur(429, "trop", "Trop de téléchargements aujourd'hui. Réessayez demain.");
        const bin = atob(String(im.b64).replace(/\s+/g, "")); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
        return new Response(o, { status: 200, headers: { ...CORS, "content-type": im.mime, "content-disposition": `inline; filename="${im.nom}"`, "cache-control": "no-store, private", "x-content-type-options": "nosniff" } });
      }
      if (m[3] === "document.docx") {
        const c = await rpc(env, "boutique_commande", { p_order_id: m[1], p_token_hash: h, p_now: now.toISOString() });
        if (!c || !c.document) return erreur(404, "introuvable", "Document pas encore prêt ou commande non payée.");
        const nom = (String(c.produit.slug || "document").slice(0, 60)) + ".docx";
        return new Response(docx(c.document), { status: 200, headers: { ...CORS, "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": `attachment; filename="${nom}"`, "cache-control": "no-store, private", "x-content-type-options": "nosniff" } });
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
      const adm = await rpc(env, "boutique_admin", { p_now: now.toISOString() }).catch(() => null);
      return json(200, { fiches: (await rpc(env, "boutique_fiches_attente", {})) || [], titres: ((adm && adm.produits) || []).map((p: any) => p.titre).filter(Boolean) });
    }
    if (req.method === "POST" && chemin === "/fabrique/modele") {
      // Modèle de langue pour la fabrique (GitHub Models a fermé le 30 juillet 2026) : modèles gratuits d'OpenRouter avec la clé
      // du propriétaire, puis repli payant bon marché plafonné par jour. Durée bornée (limite des fonctions Edge).
      const v = await verifierGithub(env, (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
      if (!v.ok) { console.warn(`[boutique] modèle refusé : ${v.raison}`); return erreur(401, "refuse", "Accès refusé."); }
      const b = await lireJson(req, 120_000);
      const msgs = b.messages;
      if (!Array.isArray(msgs) || msgs.length < 1 || msgs.length > 6 || !msgs.every((m: any) => m && (m.role === "system" || m.role === "user") && typeof m.content === "string" && m.content.length > 0 && m.content.length <= 40000)) return erreur(400, "messages", "Messages invalides.");
      const k = await cleIa(env);
      if (!k) return erreur(503, "ia", "Rédaction non activée : aucune clé OpenRouter.");
      const liste = (env.modelesFabrique || MODELES_FABRIQUE).filter((m) => m.endsWith(":free"));
      const depart = Number.isInteger(b.depart) ? Math.abs(b.depart) % Math.max(1, liste.length) : 0;
      const ordre = [...liste.slice(depart), ...liste.slice(0, depart)];
      const t0 = Date.now(), essais: string[] = [];
      const essayer = async (modele: string, delai: number): Promise<string | null> => {
        try {
          const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), delai);
          const r = await env.fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", signal: ctl.signal,
            headers: { authorization: `Bearer ${k}`, "content-type": "application/json", "x-title": "Teranga Outils (fabrique)" },
            body: JSON.stringify({ model: modele, messages: msgs, temperature: typeof b.temperature === "number" ? Math.min(1.2, Math.max(0, b.temperature)) : 0.7, max_tokens: 8000, ...(b.json ? { response_format: { type: "json_object" } } : {}) }) });
          clearTimeout(tm);
          if (!r.ok) { essais.push(`${modele} : ${r.status}`); return null; }
          const j = await r.json().catch(() => null);
          const c = String(j?.choices?.[0]?.message?.content || "");
          if (!c.trim()) { essais.push(`${modele} : vide`); return null; }
          return c;
        } catch (e: any) { essais.push(`${modele} : ${e && e.name === "AbortError" ? "délai" : e && e.message}`); return null; }
      };
      // 1. Modèles gratuits (70 s au plus en tout), 2. repli sur un modèle payant bon marché (fiches sans donnée personnelle),
      // plafonné à 30 appels par jour pour que la dépense reste négligeable (quelques francs par produit).
      for (const modele of ordre) {
        const reste = 70_000 - (Date.now() - t0);
        if (reste < 12_000) { essais.push("temps des modèles gratuits écoulé"); break; }
        const c = await essayer(modele, Math.min(60_000, reste));
        if (c) return json(200, { contenu: c, modele, payant: false });
      }
      if (b.payant !== false) {
        for (const modele of (env.modelesPayantsFabrique || MODELES_DEFAUT).filter((m) => !m.endsWith(":free"))) {
          const reste = 140_000 - (Date.now() - t0);
          if (reste < 15_000) { essais.push("temps écoulé"); break; }
          const permis = await rpc(env, "tcv_hit_rate_limit", { p_key: "fab-payant", p_window_seconds: 86400, p_max: 30, p_now: now.toISOString() }).catch(() => false);
          if (!permis) { essais.push("plafond payant du jour atteint"); break; }
          const c = await essayer(modele, Math.min(65_000, reste));
          if (c) return json(200, { contenu: c, modele, payant: true });
        }
      }
      return erreur(502, "modeles", ("Aucun modèle n'a répondu : " + essais.join(" | ")).slice(0, 400));
    }
    if (req.method === "GET" && chemin === "/etat") {
      return json(200, { redaction: !!(await cleIa(env)) });
    }
    if (req.method === "POST" && chemin === "/depot-generateur") {
      const v = await verifierGithub(env, (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
      if (!v.ok) { console.warn(`[boutique] dépôt de générateur refusé : ${v.raison}`); return erreur(401, "refuse", "Accès refusé."); }
      const b = await lireJson(req, 200_000);
      const p = b.produit || {};
      const pb = controlerDepot({ produit: p, fichiers: [{}] }) || validerFormulaire(p.formulaire) || (typeof p.consigne !== "string" || p.consigne.length < 50 || p.consigne.length > 6000 ? "consigne" : null) || (validerDocument(p.exemple) ? "exemple : " + validerDocument(p.exemple) : null);
      if (pb) return erreur(400, "controle", pb);
      const res = await rpc(env, "boutique_deposer_generateur", { p_produit: { ...p, source: "fabrique" }, p_now: now.toISOString() });
      if (!res || res.erreur) return erreur(409, "depot", (res && res.erreur) || "dépôt impossible");
      const ficheId = Number(b.fiche_id);
      if (Number.isInteger(ficheId) && ficheId > 0) res.fiche = await rpc(env, "boutique_fiche_deposee", { p_fiche_id: ficheId, p_produit: res.id, p_now: now.toISOString() });
      return json(201, res);
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
    if (chemin === "/admin" || chemin === "/admin/decider" || chemin === "/admin/ia") {
      const r = await reglages(env);
      const k = req.headers.get("x-admin-key") || "";
      if (!r.admin_key || !egal(k.trim(), r.admin_key)) return erreur(404, "introuvable", "Ressource introuvable.");
      if (req.method === "GET" && chemin === "/admin") return json(200, await rpc(env, "boutique_admin", { p_now: now.toISOString() }));
      if (req.method === "POST" && chemin === "/admin/ia") {
        const b = await lireJson(req, MAX_JSON);
        const cle = String(b.cle || "").trim();
        if (!/^sk-or-[A-Za-z0-9_-]{20,200}$/.test(cle)) return erreur(400, "cle", "Clé OpenRouter invalide.");
        const t = await env.fetch("https://openrouter.ai/api/v1/key", { headers: { authorization: `Bearer ${cle}` } }).catch(() => null);
        if (!t || !t.ok) return erreur(400, "cle", "OpenRouter refuse cette clé.");
        const ok = await rpc(env, "boutique_definir_cle_ia", { p_cle: cle });
        _reglages = null;
        return ok ? json(200, { ok: true, redaction: true }) : erreur(400, "cle", "Clé OpenRouter invalide.");
      }
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
  const modeles = (Deno.env.get("BOUTIQUE_LLM_MODELES") || MODELES_DEFAUT.join(",")).split(",").map((x: string) => x.trim()).filter(Boolean);
  const env: Env = { url: Deno.env.get("SUPABASE_URL") || "", cle: cleService, fetch: fetch.bind(globalThis), now: () => new Date(), openrouter: Deno.env.get("OPENROUTER_API_KEY") || "", modeles };
  Deno.serve((req: Request) => traiter(req, env));
}
