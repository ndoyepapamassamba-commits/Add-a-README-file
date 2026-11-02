// Tests de la fonction « boutique » sous Node 22 : node --experimental-strip-types supabase/functions/boutique/test.ts
// (base PostgREST et clés publiques de GitHub simulées ; aucun appel réseau)
import { traiter, verifierGithub, formatWave, controlerDepot, sha256Hex, egal, _oublierCaches, REPO, BRANCHE_DEFAUT, WORKFLOW, GH_ISS, AUDIENCE } from "./index.ts";
import type { Env } from "./index.ts";

let echecs = 0, total = 0;
const ok = (c: unknown, m: string, d?: unknown) => { total++; if (!c) echecs++; console.log((c ? "OK     " : "ÉCHEC  ") + m + (d !== undefined && !c ? " — " + JSON.stringify(d).slice(0, 300) : "")); };
const b64url = (u: Uint8Array) => Buffer.from(u).toString("base64url");

// Clés RSA de test et jeton façon GitHub Actions
const paire = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk: any = await crypto.subtle.exportKey("jwk", paire.publicKey);
const autre = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const NOW = new Date("2026-11-02T20:00:00Z"); const S = Math.floor(NOW.getTime() / 1000);
async function jeton(charge: Record<string, unknown>, cle = paire.privateKey, kid = "k1") {
  const t = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })));
  const c = b64url(new TextEncoder().encode(JSON.stringify(charge)));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cle, new TextEncoder().encode(`${t}.${c}`)));
  return `${t}.${c}.${b64url(sig)}`;
}
const bonne = { iss: GH_ISS, aud: AUDIENCE, repository: REPO, ref: BRANCHE_DEFAUT, workflow_ref: WORKFLOW + BRANCHE_DEFAUT, event_name: "schedule", iat: S - 10, nbf: S - 10, exp: S + 300 };

// Fausse base : enregistre les appels RPC
const appels: { fn: string; args: any }[] = [];
const reponses: Record<string, any> = {
  boutique_reglages: { admin_key: "cle-admin-de-test-0123456789abcdef0123456789", wave: "+221771234567" },
  boutique_catalogue: [{ id: "bt_budget", titre: "Budget" }],
  boutique_produit: null,
  boutique_creer_commande: { id: "TCV-X", montant: 1499, unique: true, prix: 1500, titre: "Budget" },
  boutique_commande: { id: "TCV-X", payee: true, fichiers: [{ nom: "budget.xlsx", taille: 4 }] },
  boutique_fichier: { nom: "budget.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", b64: Buffer.from("PK\x03\x04").toString("base64") },
  boutique_deposer: { id: "bt_budget", statut: "brouillon" },
  boutique_admin: { produits: [], totaux: { ventes: 0 } },
  boutique_decider: { ok: true },
};
const fauxFetch = (async (url: string, init?: any) => {
  if (url.endsWith("/.well-known/jwks")) return new Response(JSON.stringify({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] }), { status: 200 });
  const fn = url.split("/rpc/")[1];
  appels.push({ fn, args: JSON.parse(init.body) });
  if (!init.headers.apikey) return new Response("{}", { status: 401 });
  const r = reponses[fn];
  return new Response(r === null || r === undefined ? "null" : JSON.stringify(r), { status: 200 });
}) as unknown as typeof fetch;
const env: Env = { url: "https://exemple.supabase.co", cle: "sb_secret_test", fetch: fauxFetch, now: () => NOW };
const req = (m: string, chemin: string, corps?: unknown, h: Record<string, string> = {}) =>
  new Request("https://exemple.supabase.co/functions/v1/boutique" + chemin, { method: m, headers: { "content-type": "application/json", ...h }, body: corps === undefined ? undefined : JSON.stringify(corps) });

// 1. Outils
ok(formatWave("+221771234567") === "77 123 45 67" && formatWave("771234567") === "77 123 45 67" && formatWave("abc") === null, "numéro Wave affiché lisiblement");
ok(egal("abc", "abc") && !egal("abc", "abd") && !egal("abc", "ab") && !egal("", ""), "comparaison de clés à temps constant");

// 2. Jeton OIDC de GitHub
ok((await verifierGithub(env, await jeton(bonne))).ok, "jeton de la fabrique (workflow, dépôt et branche attendus) : accepté");
const refus = async (m: Record<string, unknown>, cle?: CryptoKey) => (await verifierGithub(env, await jeton({ ...bonne, ...m }, cle))).raison;
ok(await refus({ repository: "pirate/depot" }) === "depot", "autre dépôt : refusé");
ok(await refus({ ref: "refs/heads/autre" }) === "depot", "autre branche : refusée");
ok(await refus({ workflow_ref: REPO + "/.github/workflows/autre.yml@" + BRANCHE_DEFAUT }) === "workflow", "autre workflow : refusé");
ok(await refus({ event_name: "pull_request" }) === "evenement", "demande de fusion : refusée");
ok(await refus({ exp: S - 1 }) === "date", "jeton expiré : refusé");
ok(await refus({ aud: "autre" }) === "aud", "mauvaise audience : refusée");
ok(await refus({ iss: "https://faux" }) === "iss", "faux émetteur : refusé");
ok(await refus({}, autre.privateKey) === "signature", "signature d'une autre clé : refusée");
ok((await verifierGithub(env, "pas.un.jeton")).ok === false && (await verifierGithub(env, "")).ok === false, "jeton illisible : refusé");

// 3. Routes publiques
let r = await traiter(req("GET", "/catalogue"), env);
ok(r.status === 200 && (await r.json()).produits.length === 1 && r.headers.get("access-control-allow-origin") === "*", "GET /catalogue");
r = await traiter(req("GET", "/config"), env);
ok(r.status === 200 && (await r.json()).wave === "77 123 45 67", "GET /config : numéro Wave seulement (jamais la clé d'administration)");
r = await traiter(req("GET", "/produits/bt_inconnu"), env);
ok(r.status === 404, "produit hors vente : 404");
r = await traiter(req("POST", "/commandes", { produit: "bt_budget", nom: "Awa Ndiaye", cgv: true, website: "spam" }), env);
ok(r.status === 400, "piège à robots rempli : refusé");
r = await traiter(req("POST", "/commandes", { produit: "bt_budget", nom: "A1<script>", cgv: true }), env);
ok(r.status === 400 && (await r.json()).erreur === "nom", "nom invalide : refusé");
r = await traiter(req("POST", "/commandes", { produit: "bt_budget", nom: "Awa Ndiaye" }), env);
ok(r.status === 400 && (await r.json()).erreur === "cgv", "conditions non acceptées : refusé");
appels.length = 0;
r = await traiter(req("POST", "/commandes", { produit: "bt_budget", nom: "Awa  Ndiaye", cgv: true }, { "x-forwarded-for": "41.82.1.2" }), env);
const cm = await r.json(); const ap = appels.find((a) => a.fn === "boutique_creer_commande")!;
ok(r.status === 201 && cm.commande.montant === 1499 && cm.commande.jeton.length >= 30 && cm.wave === "77 123 45 67", "commande créée : montant unique, jeton, numéro Wave", cm);
ok(/^TCV-[0-9A-HJKMNP-TV-Z]{8}$/.test(ap.args.p_order_id) && ap.args.p_token_hash === await sha256Hex(cm.commande.jeton) && ap.args.p_buyer.fullName === "Awa Ndiaye" && ap.args.p_ip_hash.length === 32 && !JSON.stringify(ap.args).includes("41.82"), "base : identifiant TCV, empreinte du jeton (jamais le jeton), adresse IP masquée", ap.args);
reponses.boutique_creer_commande = { erreur: "trop" };
r = await traiter(req("POST", "/commandes", { produit: "bt_budget", nom: "Awa", cgv: true }), env);
ok(r.status === 429, "trop de commandes : 429");
appels.length = 0;
r = await traiter(req("GET", "/commandes/TCV-ABCDEFGH?t=" + cm.commande.jeton), env);
ok(r.status === 200 && (await r.json()).commande.payee === true && appels.find((a) => a.fn === "boutique_commande")!.args.p_token_hash === await sha256Hex(cm.commande.jeton), "suivi de commande avec le jeton");
r = await traiter(req("GET", "/commandes/TCV-ABCDEFGH?t=court"), env);
ok(r.status === 404, "jeton absent ou trop court : 404");
r = await traiter(req("GET", "/commandes/TCV-ABCDEFGH/fichiers/budget.xlsx?t=" + cm.commande.jeton), env);
const octets = new Uint8Array(await r.arrayBuffer());
ok(r.status === 200 && octets[0] === 0x50 && octets[1] === 0x4b && /attachment; filename="budget.xlsx"/.test(r.headers.get("content-disposition") || "") && r.headers.get("cache-control") === "no-store, private", "téléchargement du fichier payé");
r = await traiter(req("GET", "/commandes/TCV-ABCDEFGH/fichiers/..%2Fsecret?t=" + cm.commande.jeton), env);
ok(r.status === 404, "nom de fichier piégé : 404");
reponses.boutique_fichier = null;
r = await traiter(req("GET", "/commandes/TCV-ABCDEFGH/fichiers/budget.xlsx?t=" + cm.commande.jeton), env);
ok(r.status === 404, "commande non payée : aucun fichier");

// 4. Administration
r = await traiter(req("GET", "/admin"), env);
ok(r.status === 404, "administration sans clé : comme une route inconnue");
r = await traiter(req("GET", "/admin", undefined, { "x-admin-key": "mauvaise" }), env);
ok(r.status === 404, "mauvaise clé : refusée");
r = await traiter(req("GET", "/admin", undefined, { "x-admin-key": reponses.boutique_reglages.admin_key }), env);
ok(r.status === 200, "bonne clé : tableau de la boutique");
r = await traiter(req("POST", "/admin/decider", { id: "bt_budget", action: "supprimer" }, { "x-admin-key": reponses.boutique_reglages.admin_key }), env);
ok(r.status === 400, "action inconnue : refusée");
r = await traiter(req("POST", "/admin/decider", { id: "bt_budget", action: "refuser" }, { "x-admin-key": reponses.boutique_reglages.admin_key }), env);
ok(r.status === 200 && (await r.json()).ok === true, "refuser un brouillon");

// 5. Dépôt par la fabrique
const produit = { slug: "budget-familial", titre: "Budget familial mensuel", domaine: "Finances personnelles", accroche: "Suivez vos dépenses du foyer facilement.", description: "Un classeur complet…".padEnd(120, "."), prix: 1500, points: [], faq: [], controle: { ok: true } };
const fichiers = [{ nom: "budget.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", b64: "UEsDBA==" }];
r = await traiter(req("POST", "/depot", { produit, fichiers }), env);
ok(r.status === 401, "dépôt sans jeton GitHub : refusé");
r = await traiter(req("POST", "/depot", { produit, fichiers }, { authorization: "Bearer " + await jeton({ ...bonne, repository: "pirate/x" }) }), env);
ok(r.status === 401, "dépôt avec un jeton d'un autre dépôt : refusé");
const tj = "Bearer " + await jeton(bonne);
r = await traiter(req("POST", "/depot", { produit: { ...produit, titre: "Attestation de travail à remplir" }, fichiers }, { authorization: tj }), env);
ok(r.status === 400 && /sujet interdit/.test((await r.json()).message), "sujet interdit (attestation) : refusé");
r = await traiter(req("POST", "/depot", { produit: { ...produit, controle: { ok: false } }, fichiers }, { authorization: tj }), env);
ok(r.status === 400, "produit dont les contrôles ont échoué : refusé");
appels.length = 0;
r = await traiter(req("POST", "/depot", { produit, fichiers }, { authorization: tj }), env);
ok(r.status === 201 && appels.find((a) => a.fn === "boutique_deposer")!.args.p_produit.source === "fabrique", "dépôt valide : brouillon créé");
ok(controlerDepot({ produit: { ...produit, prix: 20000 }, fichiers }) === "prix", "prix hors bornes : refusé");
reponses.boutique_fiches_attente = [{ id: 3, fiche: { titre: "x" } }];
reponses.boutique_fiche_deposee = { ok: true, publication: "immediate" };
r = await traiter(req("GET", "/fabrique/fiches"), env);
ok(r.status === 401, "fiches en attente sans jeton GitHub : refusées");
r = await traiter(req("GET", "/fabrique/fiches", undefined, { authorization: tj }), env);
ok(r.status === 200 && (await r.json()).fiches[0].id === 3, "fiches en attente lues par la fabrique");
appels.length = 0;
r = await traiter(req("POST", "/depot", { produit, fichiers, fiche_id: 3 }, { authorization: tj }), env);
const dp = await r.json(); const fa = appels.find((a) => a.fn === "boutique_fiche_deposee");
ok(r.status === 201 && fa && fa.args.p_fiche_id === 3 && fa.args.p_produit === "bt_budget" && dp.fiche.publication === "immediate", "dépôt d'une fiche : fiche marquée faite (publication immédiate si demandée)", dp);

// 6. Divers
r = await traiter(req("GET", "/inconnu"), env);
ok(r.status === 404, "route inconnue : 404");
r = await traiter(new Request("https://x/functions/v1/boutique/commandes", { method: "POST", body: "{pas du json" }), env);
ok(r.status === 400, "JSON illisible : 400");
const envKo: Env = { ...env, fetch: (async () => new Response("err", { status: 500 })) as unknown as typeof fetch };
_oublierCaches();
r = await traiter(req("GET", "/catalogue"), envKo);
ok(r.status === 503, "base indisponible : 503 sans détail");
r = await traiter(new Request("https://x/functions/v1/boutique/catalogue", { method: "OPTIONS" }), env);
ok(r.status === 204, "pré-vol CORS");

console.log(`BILAN ${total - echecs}/${total}`);
if (echecs) process.exit(1);
