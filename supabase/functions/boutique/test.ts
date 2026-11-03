// Tests de la fonction « boutique » sous Node 22 : node --experimental-strip-types supabase/functions/boutique/test.ts
// (base PostgREST et clés publiques de GitHub simulées ; aucun appel réseau)
import { traiter, verifierGithub, formatWave, controlerDepot, sha256Hex, egal, _oublierCaches, validerReponses, validerFormulaire, validerDocument, rediger, docx, REPO, BRANCHE_DEFAUT, WORKFLOW, GH_ISS, AUDIENCE } from "./index.ts";
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

const FORM = [{ id: "bien", label: "Type de bien", type: "choix", choix: ["Appartement", "Maison"], obligatoire: true }, { id: "quartier", label: "Quartier", type: "texte", obligatoire: true, max: 60 }, { id: "loyer", label: "Loyer", type: "nombre" }, { id: "atouts", label: "Atouts", type: "paragraphe", max: 300 }];
const DOC = { titre: "Appartement F3 à louer à Ouakam", sections: [{ titre: "Le bien", paragraphes: ["Bel appartement lumineux de trois pièces, proche de la mer et des commerces."], puces: ["Deux chambres", "Cuisine équipée"] }] };
// Fausse base : enregistre les appels RPC
const appels: { fn: string; args: any }[] = [];
const reponses: Record<string, any> = {
  boutique_reglages: { admin_key: "cle-admin-de-test-0123456789abcdef0123456789", wave: "+221771234567" },
  boutique_catalogue: [{ id: "bt_budget", titre: "Budget" }],
  boutique_produit: (a: any) => a.p_id === "bt_budget" ? { id: "bt_budget", type: "fichier" } : a.p_id === "bt_annonce" ? { id: "bt_annonce", type: "generateur", formulaire: FORM } : null,
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
  const r0 = reponses[fn];
  const r = typeof r0 === "function" ? r0(JSON.parse(init.body)) : r0;
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

// 7. Documents sur mesure (clé de rédaction enregistrée par le propriétaire)
reponses.boutique_reglages = { ...reponses.boutique_reglages, openrouter: "sk-or-v1-" + "c".repeat(40) };
_oublierCaches();
ok(validerFormulaire(FORM) === null && validerFormulaire([{ id: "x", label: "Nom", type: "texte" }]) !== null && validerFormulaire([{ id: "ab", label: "Choix", type: "choix", choix: ["un"] }]) !== null, "formulaire d'un générateur validé (identifiants, types, choix)");
const v1 = validerReponses(FORM, { bien: "Appartement", quartier: "  Ouakam ", loyer: "150 000", atouts: "Vue mer" }) as any;
ok(v1.ok && v1.reponses.quartier === "Ouakam" && v1.reponses.loyer === 150000, "réponses nettoyées (espaces, nombre « 150 000 »)", v1);
ok(!(validerReponses(FORM, { bien: "Appartement" }) as any).ok && !(validerReponses(FORM, { bien: "Château", quartier: "X" }) as any).ok && !(validerReponses(FORM, { bien: "Maison", quartier: "x".repeat(61) }) as any).ok && !(validerReponses(FORM, { bien: "Maison", quartier: "Y", loyer: "beaucoup" }) as any).ok, "réponses refusées : champ obligatoire vide, choix inconnu, trop long, nombre invalide");
ok(validerDocument(DOC) === null && validerDocument({ titre: "x", sections: [] }) !== null && validerDocument({ titre: "Titre", sections: [{ titre: "Vide" }] }) !== null, "document rédigé : structure contrôlée");
r = await traiter(req("POST", "/commandes", { produit: "bt_annonce", nom: "Awa Ndiaye", cgv: true, reponses: { bien: "Appartement" } }), env);
ok(r.status === 400 && /Quartier/.test((await r.json()).message), "commande d'un document sans réponse obligatoire : refusée avec le champ manquant");
reponses.boutique_creer_commande = { id: "TCV-Y", montant: 1949, unique: true, prix: 2000, titre: "Annonce", type: "generateur" };
appels.length = 0;
r = await traiter(req("POST", "/commandes", { produit: "bt_annonce", nom: "Awa Ndiaye", cgv: true, reponses: { bien: "Maison", quartier: "Mermoz", loyer: "300000", pirate: "x" } }), env);
const cg = appels.find((a) => a.fn === "boutique_creer_commande")!;
ok(r.status === 201 && cg.args.p_input.quartier === "Mermoz" && cg.args.p_input.loyer === 300000 && !("pirate" in cg.args.p_input), "commande d'un document : réponses validées enregistrées (champ inconnu ignoré)", cg.args.p_input);
// Rédaction à la réception du paiement : premier modèle en panne, second répond (JSON dans un bloc de code)
let ia = 0;
const envIa: Env = { ...env, openrouter: "sk-test", modeles: ["modele/a", "modele/b"], fetch: (async (url: string, init?: any) => {
  if (url.includes("openrouter.ai")) { ia++; const m = JSON.parse(init.body).model; if (m === "modele/a") return new Response("{}", { status: 500 }); return new Response(JSON.stringify({ choices: [{ message: { content: "```json\n" + JSON.stringify(DOC) + "\n```" } }] }), { status: 200 }); }
  return fauxFetch(url, init);
}) as unknown as typeof fetch };
reponses.boutique_commande = { id: "TCV-ABCDEFGH", payee: true, a_generer: true, produit: { slug: "annonce", type: "generateur" } };
reponses.boutique_generation_reserver = { consigne: "Rédige une annonce immobilière claire.", formulaire: FORM, reponses: { bien: "Maison", quartier: "Mermoz" }, titre: "Annonce", essais: 0 };
reponses.boutique_generation_enregistrer = true;
appels.length = 0;
r = await traiter(req("GET", "/commandes/TCV-ABCDEFGH?t=" + cm.commande.jeton), envIa);
const jg = await r.json(); const en = appels.find((a) => a.fn === "boutique_generation_enregistrer");
ok(r.status === 200 && jg.commande.document.titre === DOC.titre && en && en.args.p_document.modele === "modele/b" && ia === 2, "paiement reçu : document rédigé (modèle de secours), enregistré et renvoyé", jg);
reponses.boutique_generation_reserver = { occupe: true };
r = await traiter(req("GET", "/commandes/TCV-ABCDEFGH?t=" + cm.commande.jeton), envIa);
ok((await r.json()).commande.en_redaction === true && ia === 2, "rédaction déjà en cours ailleurs : pas de second appel au modèle");
reponses.boutique_generation_reserver = { consigne: "Rédige une annonce immobilière claire.", formulaire: FORM, reponses: {}, titre: "Annonce", essais: 1 };
appels.length = 0;
r = await traiter(req("GET", "/commandes/TCV-ABCDEFGH?t=" + cm.commande.jeton), { ...envIa, fetch: (async (url: string, init?: any) => url.includes("openrouter.ai") ? new Response("{}", { status: 503 }) : fauxFetch(url, init)) as unknown as typeof fetch });
const ec = appels.find((a) => a.fn === "boutique_generation_enregistrer");
ok((await r.json()).commande.en_redaction === true && ec && ec.args.p_document.essais === 2, "modèles indisponibles : nouvel essai au prochain passage (compteur d'essais)");
reponses.boutique_commande = { id: "TCV-ABCDEFGH", payee: true, document: DOC, produit: { slug: "annonce-immobiliere", type: "generateur" } };
r = await traiter(req("GET", "/commandes/TCV-ABCDEFGH/fichiers/document.docx?t=" + cm.commande.jeton), env);
const word = new Uint8Array(await r.arrayBuffer());
ok(r.status === 200 && word[0] === 0x50 && word[1] === 0x4b && /annonce-immobiliere\.docx/.test(r.headers.get("content-disposition") || ""), "document Word téléchargeable une fois rédigé");
const fs = await import("node:fs"); fs.writeFileSync(process.env.DOCX_ESSAI || "/tmp/essai-boutique.docx", docx({ titre: "Essai <&> accentué", sections: [{ titre: "Section", paragraphes: ["Paragraphe é à ç « guillemets »"], puces: ["Puce 1", "Puce 2"] }] }));
// Dépôt d'un générateur par la fabrique
const gen = { ...produit, slug: "annonce-immobiliere", formulaire: FORM, consigne: "Rédige une annonce immobilière claire et attractive à partir des réponses, sans rien inventer.", exemple: DOC };
reponses.boutique_deposer_generateur = { id: "bt_annonce_immobiliere", statut: "brouillon" };
r = await traiter(req("POST", "/depot-generateur", { produit: gen }), env);
ok(r.status === 401, "dépôt de générateur sans jeton GitHub : refusé");
r = await traiter(req("POST", "/depot-generateur", { produit: { ...gen, exemple: { titre: "x", sections: [] } } }, { authorization: tj }), env);
ok(r.status === 400, "générateur sans exemple valable : refusé");
r = await traiter(req("POST", "/depot-generateur", { produit: gen }, { authorization: tj }), env);
ok(r.status === 201, "générateur valable : déposé en brouillon");
r = await traiter(req("GET", "/etat"), envIa);
ok((await r.json()).redaction === true, "état : rédaction disponible (sans jamais exposer la clé)");
// Sans clé : documents sur mesure masqués et non commandables ; activation par le propriétaire
reponses.boutique_reglages = { admin_key: reponses.boutique_reglages.admin_key, wave: reponses.boutique_reglages.wave };
_oublierCaches();
reponses.boutique_catalogue = [{ id: "bt_budget", type: "fichier" }, { id: "bt_annonce", type: "generateur" }];
r = await traiter(req("GET", "/catalogue"), env);
ok((await r.json()).produits.map((p: any) => p.id).join() === "bt_budget", "sans clé de rédaction : documents sur mesure masqués du catalogue");
r = await traiter(req("POST", "/commandes", { produit: "bt_annonce", nom: "Awa Ndiaye", cgv: true, reponses: { bien: "Maison", quartier: "Mermoz" } }), env);
ok(r.status === 503, "sans clé de rédaction : commande d'un document sur mesure refusée (rien n'est encaissé)");
const ADM = { "x-admin-key": reponses.boutique_reglages.admin_key };
r = await traiter(req("POST", "/admin/ia", { cle: "sk-or-v1-" + "a".repeat(40) }), env);
ok(r.status === 404, "activation sans clé d'administration : refusée");
r = await traiter(req("POST", "/admin/ia", { cle: "pas-une-cle" }, ADM), env);
ok(r.status === 400, "activation avec une clé mal formée : refusée");
let verifCle = 0;
const envCle: Env = { ...env, fetch: (async (url: string, init?: any) => { if (url.endsWith("/api/v1/key")) { verifCle++; return new Response("{}", { status: init.headers.authorization.endsWith("a".repeat(40)) ? 200 : 401 }); } return fauxFetch(url, init); }) as unknown as typeof fetch };
reponses.boutique_definir_cle_ia = true;
appels.length = 0;
r = await traiter(req("POST", "/admin/ia", { cle: "sk-or-v1-" + "b".repeat(40) }, ADM), envCle);
ok(r.status === 400 && !appels.some((a) => a.fn === "boutique_definir_cle_ia"), "clé refusée par OpenRouter : rien n'est enregistré");
r = await traiter(req("POST", "/admin/ia", { cle: "sk-or-v1-" + "a".repeat(40) }, ADM), envCle);
const rj = await r.json();
ok(r.status === 200 && rj.ok && !JSON.stringify(rj).includes("aaaa") && appels.some((a) => a.fn === "boutique_definir_cle_ia") && verifCle === 2, "clé valide : vérifiée auprès d'OpenRouter, enregistrée, jamais renvoyée", rj);
reponses.boutique_reglages = { ...reponses.boutique_reglages, openrouter: "sk-or-v1-" + "a".repeat(40) };
_oublierCaches();
r = await traiter(req("GET", "/catalogue"), env);
ok((await r.json()).produits.length === 2, "clé enregistrée : documents sur mesure visibles");

// Fabrique : modèle de langue par le serveur (GitHub Models a fermé), modèles gratuits seulement
reponses.boutique_admin = { produits: [{ titre: "Budget" }, { titre: "Annonce" }], totaux: {} };
r = await traiter(req("GET", "/fabrique/fiches", undefined, { authorization: tj }), env);
ok((await r.json()).titres.join() === "Budget,Annonce", "fiches : titres de tous les produits (même masqués) pour éviter les doublons");
const MSG = { messages: [{ role: "system", content: "Tu écris des fiches." }, { role: "user", content: "Une fiche." }], json: true };
r = await traiter(req("POST", "/fabrique/modele", MSG), env);
ok(r.status === 401, "modèle pour la fabrique sans jeton GitHub : refusé");
r = await traiter(req("POST", "/fabrique/modele", { messages: [{ role: "assistant", content: "x" }] }, { authorization: tj }), env);
ok(r.status === 400, "modèle : messages invalides refusés");
const vus: { m: string; a: string; f: any }[] = [];
let echouerPremier = true;
const envFab: Env = { ...env, modelesFabrique: ["payant/modele", "gratuit/a:free", "gratuit/b:free"], fetch: (async (url: string, init?: any) => {
  if (url.includes("openrouter.ai/api/v1/chat")) { const c = JSON.parse(init.body); vus.push({ m: c.model, a: init.headers.authorization, f: c.response_format }); if (echouerPremier && vus.length === 1) return new Response("{}", { status: 429 }); return new Response(JSON.stringify({ choices: [{ message: { content: '{"titre":"ok"}' } }] }), { status: 200 }); }
  return fauxFetch(url, init); }) as unknown as typeof fetch };
r = await traiter(req("POST", "/fabrique/modele", MSG, { authorization: tj }), envFab);
const mj = await r.json();
ok(r.status === 200 && mj.contenu === '{"titre":"ok"}' && mj.modele === "gratuit/b:free" && vus.map((v) => v.m).join() === "gratuit/a:free,gratuit/b:free", "modèle : modèles gratuits d'abord (un modèle payant de la liste gratuite est ignoré), repli sur le suivant", { mj, vus });
ok(vus.every((v) => v.a === "Bearer sk-or-v1-" + "a".repeat(40) && v.f && v.f.type === "json_object"), "modèle : clé du propriétaire côté serveur, format JSON demandé");
vus.length = 0; echouerPremier = false;
r = await traiter(req("POST", "/fabrique/modele", { ...MSG, depart: 1 }, { authorization: tj }), envFab);
ok(r.status === 200 && vus[0].m === "gratuit/b:free", "modèle : « depart » fait tourner le premier modèle essayé", vus);
// Gratuits indisponibles : repli payant bon marché, plafonné par jour
const vus2: string[] = [];
const envRepli: Env = { ...env, modelesFabrique: ["gratuit/a:free"], modelesPayantsFabrique: ["payant/x", "payant/y"], fetch: (async (url: string, init?: any) => {
  if (url.includes("openrouter.ai/api/v1/chat")) { const m = JSON.parse(init.body).model; vus2.push(m); if (m !== "payant/y") return new Response("{}", { status: 429 }); return new Response(JSON.stringify({ choices: [{ message: { content: '{"titre":"payé"}' } }] }), { status: 200 }); }
  return fauxFetch(url, init); }) as unknown as typeof fetch };
reponses.tcv_hit_rate_limit = true;
r = await traiter(req("POST", "/fabrique/modele", MSG, { authorization: tj }), envRepli);
const pj = await r.json();
ok(r.status === 200 && pj.payant === true && pj.modele === "payant/y" && vus2.join() === "gratuit/a:free,payant/x,payant/y", "modèle : gratuits épuisés → repli payant bon marché", { pj, vus2 });
ok(appels.filter((x) => x.fn === "tcv_hit_rate_limit").every((x) => x.args.p_key === "fab-payant" && x.args.p_max === 30 && x.args.p_window_seconds === 86400), "repli payant : plafond de 30 appels par jour");
vus2.length = 0; reponses.tcv_hit_rate_limit = false;
r = await traiter(req("POST", "/fabrique/modele", MSG, { authorization: tj }), envRepli);
ok(r.status === 502 && !vus2.some((m) => m.startsWith("payant/")) && /plafond payant/.test((await r.json()).message), "repli payant : plafond du jour atteint → aucun appel payant", vus2);
vus2.length = 0; reponses.tcv_hit_rate_limit = true;
r = await traiter(req("POST", "/fabrique/modele", { ...MSG, payant: false }, { authorization: tj }), envRepli);
ok(r.status === 502 && vus2.join() === "gratuit/a:free", "« payant: false » : jamais de modèle payant", vus2);
reponses.boutique_reglages = { admin_key: reponses.boutique_reglages.admin_key, wave: reponses.boutique_reglages.wave };
_oublierCaches();
r = await traiter(req("POST", "/fabrique/modele", MSG, { authorization: tj }), envFab);
ok(r.status === 503, "modèle : sans clé OpenRouter, refus clair (503)");

console.log(`BILAN ${total - echecs}/${total}`);
if (echecs) process.exit(1);
