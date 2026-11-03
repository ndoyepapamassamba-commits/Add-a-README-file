// Tests de la fonction « massamba » sous Node 22 : node --experimental-strip-types supabase/functions/massamba/test.ts
// (base PostgREST, stockage et clés publiques de GitHub simulés ; aucun appel réseau). Contrat : API-MASSAMBA.md v1.1.
import { traiter, verifierGithub, validerExemple, detecterPrive, empreinteExemple, normaliserPourCle, nettoyerTexte, prochaineExecution, slugDomaine,
  validerFichiers, validerAssemblage, objetSimple, ligneAtelier, tailleAnnoncee, partiesFusion, idTexte, lireId, isoZ, sha256Hex, _oublierCaches,
  REPO, WORKFLOW, GH_ISS, AUDIENCE, BUCKET, MAX_LECTURE, LIMITE_STOCKAGE } from "./index.ts";
import type { Env } from "./index.ts";

let echecs = 0, total = 0;
const ok = (c: unknown, m: string, d?: unknown) => { total++; if (!c) echecs++; console.log((c ? "OK     " : "ÉCHEC  ") + m + (d !== undefined && !c ? " — " + JSON.stringify(d).slice(0, 400) : "")); };
const b64url = (u: Uint8Array) => Buffer.from(u).toString("base64url");

// ------------------------------------------------------------------ Jetons façon GitHub Actions
const paire = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk: any = await crypto.subtle.exportKey("jwk", paire.publicKey);
const autre = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
let NOW = new Date("2026-11-04T01:10:00Z");
const S = Math.floor(NOW.getTime() / 1000);
const avancer = (s: number) => { NOW = new Date(NOW.getTime() + s * 1000); };
async function jeton(charge: Record<string, unknown>, cle = paire.privateKey, kid = "k1") {
  const t = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })));
  const c = b64url(new TextEncoder().encode(JSON.stringify(charge)));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cle, new TextEncoder().encode(`${t}.${c}`)));
  return `${t}.${c}.${b64url(sig)}`;
}
const bonne = { iss: GH_ISS, aud: AUDIENCE, repository: REPO, repository_owner: "ndoyepapamassamba-commits", repository_visibility: "private",
  repository_id: "987654321", repository_owner_id: "123456789", ref: "refs/heads/main", workflow_ref: WORKFLOW, event_name: "schedule",
  iat: S - 10, nbf: S - 10, exp: S + 40 * 86400 };
const JETON = await jeton(bonne);
const CLE = "cle-proprio-de-test-0123456789abcdef";

// ------------------------------------------------------------------ Fausse base et faux stockage
const appels: { fn: string; args: any }[] = [];
const limites: Record<string, number> = {};
let exemples: { id: number; empreinte: string; donnees: any; domaine: string }[] = [];
const versions: any[] = [];
const reglages: Record<string, string> = {};
const objets = new Map<string, number>();       // chemin → taille
let rythmeOk = true, panneBase = false;
const derniereP = () => [...versions].sort((a, b) => (a.version < b.version ? 1 : -1)).find((v) => v.statut === "publiee") || null;
const rpcs: Record<string, (a: any) => any> = {
  tcv_rate_limit_count: (a) => limites[a.p_key] || 0,
  tcv_hit_rate_limit: (a) => { limites[a.p_key] = (limites[a.p_key] || 0) + 1; return a.p_key.startsWith("msb-echec:") ? limites[a.p_key] <= a.p_max : rythmeOk; },
  massamba_cle_valide: async (a) => a.p_empreinte === await sha256Hex(CLE),
  massamba_figer_depot: (a) => { if (!/^\d+$/.test(a.p_repo_id) || !/^\d+$/.test(a.p_owner_id)) return false; reglages.repo ??= a.p_repo_id; reglages.owner ??= a.p_owner_id; return reglages.repo === a.p_repo_id && reglages.owner === a.p_owner_id; },
  massamba_retirer: (a) => { const avant = exemples.length; exemples = exemples.filter((x) => !a.p_refs.includes(x.donnees.ref)); return avant - exemples.length; },
  massamba_ajouter: (a) => { let n = 0; for (const e of a.p_exemples) if (!exemples.some((x) => x.empreinte === e.empreinte)) { exemples.push({ id: exemples.length + 1, ...e }); n++; } return { ajoutes: n, doublons: a.p_exemples.length - n }; },
  massamba_borne: (a) => { const l = exemples.filter((x) => x.id > a.p_depuis).slice(0, a.p_limite); return { jusqua: l.length ? l[l.length - 1].id : null, nb: l.length }; },
  massamba_exemples_page: (a) => exemples.filter((x) => x.id > a.p_depuis && x.id <= a.p_jusqua).slice(0, a.p_limite).map((x) => ({ id: x.id, domaine: x.domaine, donnees: x.donnees })),
  massamba_compte: (a) => ({ nouveaux: exemples.filter((x) => x.id > a.p_depuis).length, dernier_id: exemples.length, derniere_publiee_le: derniereP()?.publiee_le || null }),
  massamba_etat: () => ({ nb_exemples: exemples.length, dernier_id: exemples.length, par_domaine: {}, versions: [...versions].reverse().slice(0, 10), derniere_publiee: derniereP() }),
  massamba_budget: (a) => { const l = versions.filter((v) => new Date(v.cree_le) >= new Date(a.p_debut) && new Date(v.cree_le) < new Date(a.p_fin)); return { minutes: l.reduce((s, v) => s + v.duree_minutes, 0), seances: l.length }; },
  massamba_version_creer: (a) => {
    const base = a.p_now.slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
    let v = base, i = 1; while (versions.some((x) => x.version === v)) v = base + "-" + ++i;
    const chemins: Record<string, string> = {}; for (const f of a.p_fichiers) chemins[f] = `${v}/${f}`;
    versions.push({ version: v, statut: a.p_statut, base: a.p_base, revision: a.p_revision, scores: a.p_scores, nb_exemples: a.p_nb, reste: a.p_reste, dernier_id: a.p_dernier_id,
      duree_minutes: a.p_duree, chemins, details: a.p_details, cree_le: a.p_now.replace("Z", "+00:00"), publiee_le: null });
    return { version: v, chemins };
  },
  massamba_version: (a) => versions.find((v) => v.version === a.p_version) || null,
  massamba_derniere: () => derniereP(),
  massamba_tentative: () => [...versions].sort((a, b) => (a.version < b.version ? 1 : -1))[0] || null,
  massamba_publier: (a) => { const v = versions.find((x) => x.version === a.p_version); if (!v) return null; if (v.statut === "publiee") return v; if (v.statut !== "candidat") return { erreur: "statut" }; v.statut = "publiee"; v.publiee_le = a.p_now.replace("Z", "+00:00"); v.details = { ...v.details, empreintes: a.p_empreintes, tailles: a.p_tailles }; return { ...v }; },
  massamba_rejeter: (a) => { const v = versions.find((x) => x.version === a.p_version && x.statut === "candidat"); if (!v) return null; v.statut = "rejetee"; v.details = { ...v.details, raisons: [a.p_raison] }; return v; },
  massamba_stockage: () => ({ octets: [...objets.values()].reduce((s, t) => s + t, 0), objets: objets.size }),
  massamba_publiees: (a) => [...versions].sort((x, y) => (x.version < y.version ? 1 : -1)).filter((v) => v.statut === "publiee").slice(0, a.p_n).map((v) => v.version),
  massamba_a_purger: (a) => versions.filter((v) => v.version < a.p_avant && !a.p_garder.includes(v.version) && Object.keys(v.chemins).length).map((v) => ({ version: v.version, chemins: v.chemins })),
  massamba_purge_faite: (a) => { for (const v of versions) if (a.p_versions.includes(v.version)) v.chemins = {}; return a.p_versions.length; },
  massamba_chemins_retirer: (a) => { const v = versions.find((x) => x.version === a.p_version); for (const n of a.p_noms) delete v.chemins[n]; v.details = { ...v.details, fichiers_retires: a.p_noms }; return v.chemins; },
};
const stockageAppels: { methode: string; chemin: string; corps: any; h: any }[] = [];
const fauxFetch = (async (url: string, init?: any) => {
  if (url.endsWith("/.well-known/jwks")) return new Response(JSON.stringify({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] }), { status: 200 });
  if (!init.headers.apikey) return new Response("{}", { status: 401 });
  if (url.includes("/storage/v1/")) {
    const ch = url.split("/storage/v1")[1], corps = init.body ? JSON.parse(init.body) : null;
    stockageAppels.push({ methode: init.method, chemin: ch, corps, h: init.headers });
    const m = ch.match(/^\/object\/upload\/sign\/massamba\/(.+)$/);
    if (m && init.method === "POST") return new Response(JSON.stringify({ url: `/object/upload/sign/massamba/${m[1]}?token=jeton-depot` }), { status: 200 });
    if (ch === "/object/sign/massamba" && init.method === "POST") return new Response(JSON.stringify(corps.paths.map((p: string) => ({ path: p, signedURL: `/object/sign/massamba/${p}?token=jeton-lecture`, error: null }))), { status: 200 });
    if (ch === "/object/list/massamba") { const pre = corps.prefix.replace(/\/?$/, "/"); return new Response(JSON.stringify([...objets].filter(([p]) => p.startsWith(pre)).map(([p, t]) => ({ name: p.slice(pre.length), id: "u-" + p, metadata: { size: t } }))), { status: 200 }); }
    if (ch === "/object/massamba" && init.method === "DELETE") { for (const p of corps.prefixes) objets.delete(p); return new Response("[]", { status: 200 }); }
    return new Response("{}", { status: 404 });
  }
  const fn = url.split("/rpc/")[1];
  const args = JSON.parse(init.body);
  appels.push({ fn, args });
  if (panneBase) return new Response("{}", { status: 500 });
  const r = rpcs[fn] ? await rpcs[fn](args) : null;
  return new Response(r === null || r === undefined ? "null" : JSON.stringify(r), { status: 200 });
}) as unknown as typeof fetch;
const env: Env = { url: "https://exemple.supabase.co", cle: "sb_secret_test", fetch: fauxFetch, now: () => NOW };
const req = (m: string, chemin: string, corps?: unknown, h: Record<string, string> = {}) =>
  new Request("https://exemple.supabase.co/functions/v1/massamba" + chemin, { method: m, headers: { "content-type": "application/json", ...h }, body: corps === undefined ? undefined : typeof corps === "string" ? corps : JSON.stringify(corps) });
const PROPRIO = { "x-admin-key": CLE }, ATELIER = { authorization: "Bearer " + JETON };
const ex = (q: string, r: string, plus: Record<string, unknown> = {}) => ({ messages: [{ role: "user", content: q }, { role: "assistant", content: r }], prive: false, domaine: "banque", valide_le: "2026-11-03", ...plus });

// 1. Outils
ok(nettoyerTexte("  Bonjour\r\nle​ monde  \n\n\n\nfin\u0007 ") === "Bonjour\nle monde\n\nfin", "texte nettoyé (fins de ligne, invisibles, lignes vides)");
ok(normaliserPourCle("Qu'est-ce qu'un RATIO de solvabilité ?") === "qu est ce qu un ratio de solvabilite", "forme canonique pour l'empreinte");
const e1 = await empreinteExemple([{ role: "system", content: "Tu es MASSAMBA." }, { role: "user", content: "Ratio ?" }, { role: "assistant", content: "Fonds propres / risques." }]);
const e2 = await empreinteExemple([{ role: "user", content: "ratio" }, { role: "assistant", content: "fonds propres risques" }]);
ok(/^[0-9a-f]{64}$/.test(e1) && e1 === e2, "empreinte : message système, casse, accents et ponctuation ignorés");
ok(slugDomaine("Crédit PME") === "credit-pme" && slugDomaine("") === "general" && slugDomaine("x".repeat(80)).length === 40, "domaine en identifiant court");
ok(idTexte(1234) === "000000001234" && lireId("000000001234") === 1234 && lireId("") === 0 && lireId(null) === 0 && lireId("abc") === null && lireId("-3") === null, "identifiants triables de 12 chiffres, aller et retour");
ok(isoZ("2026-11-04T02:58:00.123456+00:00") === "2026-11-04T02:58:00Z" && isoZ(null) === null, "dates au format du contrat (UTC, « Z », sans millisecondes)");
const tous = ["adaptateur.tar.gz", "massamba-lora-f16.gguf", "Modelfile.adaptateur", "Modelfile", "massamba-00001-of-00004.gguf", "massamba-q4_k_m.gguf.part-00001-of-00011"];
ok(validerFichiers(tous) === null, "noms de fichiers du contrat acceptés (archive, GGUF, Modelfile, parties gguf-split et octets)");
ok(validerFichiers(["../x.gguf"]) !== null && validerFichiers(["a/b.gguf"]) !== null && validerFichiers([]) !== null && validerFichiers(["a.gguf", "a.gguf"]) !== null && validerFichiers(["a.gguf"], false) !== null && validerFichiers([], false) === null,
  "chemins, doublons, liste vide d'une candidate, fichiers d'une séance non candidate : refusés");
const assOctets = { "massamba-q4_k_m.gguf": { mode: "octets", parties: ["massamba-q4_k_m.gguf.part-00001-of-00011"], sha256: "a".repeat(64), taille: 480_000_000 } };
ok(validerAssemblage(assOctets, tous) === null && validerAssemblage({ "m.gguf": { mode: "gguf-split", parties: ["massamba-00001-of-00004.gguf"], sha256: "b".repeat(64), taille: 1 } }, tous) === null, "assemblage : modes octets et gguf-split acceptés");
ok(validerAssemblage({ "m.gguf": { mode: "zip", parties: [], sha256: "x", taille: 0 } }, tous) !== null && validerAssemblage({ "m.gguf": { ...assOctets["massamba-q4_k_m.gguf"], parties: ["absente"] } }, tous) !== null, "assemblage : mode inconnu ou partie non déclarée refusés");
ok(tailleAnnoncee(["Modelfile", "adaptateur.tar.gz", "p.part-00001-of-00002", "p.part-00002-of-00002"], { p: { mode: "octets", parties: ["p.part-00001-of-00002", "p.part-00002-of-00002"], sha256: "a".repeat(64), taille: 90 * 1024 * 1024 } }, { "adaptateur.tar.gz": 1000 }) === 65536 + 1000 + 90 * 1024 * 1024,
  "taille annoncée : tailles données, part des fichiers assemblés, Modelfile");
ok(objetSimple({ avant: 0.41, apres: 0.63, detail: { reference: { global: { n: 64, score: 0.41 }, anciens: {} }, candidat: {}, reference_est_base: false } }) && !objetSimple({ a: "x".repeat(400) }) && !objetSimple([1]), "scores : détail imbriqué de nombres accepté, longs textes refusés");
ok(prochaineExecution("17 */3 * * *", new Date("2026-11-04T01:10:00Z")) === "2026-11-04T03:17:00Z", "prochaine exécution : cron du workflow (17 */3)");
ok(prochaineExecution("30 2 * * *", new Date("2026-11-04T02:30:00Z")) === "2026-11-05T02:30:00Z" && prochaineExecution("0 4 * * 1", new Date("2026-11-04T01:10:00Z")) === "2026-11-09T04:00:00Z", "prochaine exécution : chaque nuit, jour de semaine");
ok(prochaineExecution("pas un cron", NOW) === null && prochaineExecution("99 * * * *", NOW) === null, "planification illisible : null");

// 2. Confidentialité
ok(detecterPrive("Écrivez à awa.ndiaye@exemple.sn").join() === "courriel", "courriel repéré");
ok(detecterPrive("Appelez le 77 123 45 67").join() === "telephone" && detecterPrive("ou +221 771234567").join() === "telephone" && detecterPrive("ou 771234567.").join() === "telephone", "téléphones repérés (sénégalais, international, collé)");
ok(detecterPrive("IBAN SN08 SN01 0015 2000 0538 0000 7542").includes("iban") && detecterPrive("FR7630006000011234567890189").includes("iban"), "IBAN repérés");
ok(detecterPrive("Compte 12345678901234").join() === "numero_long" && detecterPrive("Compte 00123456789012").join() === "telephone", "long numéro repéré (préfixe 00 : téléphone international)");
ok(detecterPrive("Prêt de 750 000 000 FCFA sur 36 mois au taux de 9,5 %, en 2024-2025, le 03/11/2026, ratio 12.5").length === 0, "montants, dates, années et décimaux : pas de faux positif");

// 3. Validation d'un exemple
let v: any = await validerExemple(ex("Qu'est-ce que le ratio de liquidité ?", "C'est l'actif liquide rapporté au passif exigible.", { groupe: "ratios", langue: "fr", mots_cles: ["liquidité"], id: "loc-1" }), NOW);
ok(v.ok && v.domaine === "banque" && v.donnees.valide_le === "2026-11-03" && v.donnees.groupe === "ratios" && v.donnees.ref === "loc-1" && v.donnees.source === "massamba-intelligence", "exemple valide : champs gardés, source par défaut", v);
v = await validerExemple(ex("q", "r", { prive: true }), NOW); ok(!v.ok && v.motif === "prive", "« prive »: true refusé");
v = await validerExemple(ex("q", "r", { espace: "travail" }), NOW); ok(!v.ok && v.motif === "prive", "exemple de l'espace Travail refusé");
v = await validerExemple({ messages: ex("q", "r").messages }, NOW); ok(!v.ok && v.raison === "prive_absent", "« prive » absent : refusé par prudence");
v = await validerExemple(ex("q", "r", { messages: [{ role: "assistant", content: "r" }, { role: "user", content: "q" }] }), NOW); ok(!v.ok && v.raison === "ordre_roles", "ordre des rôles vérifié");
v = await validerExemple(ex("q", "r", { messages: [{ role: "user", content: "q" }, { role: "system", content: "s" }, { role: "assistant", content: "r" }] }), NOW); ok(!v.ok && v.raison === "systeme_mal_place", "message système ailleurs qu'en tête refusé");
v = await validerExemple(ex("q", "r", { messages: [{ role: "outil", content: "q" }, { role: "assistant", content: "r" }] }), NOW); ok(!v.ok && v.raison === "message_mal_forme", "rôle inconnu refusé");
v = await validerExemple(ex("q", "x".repeat(8001)), NOW); ok(!v.ok && v.raison === "message_trop_long", "message de plus de 8 000 caractères refusé");
v = await validerExemple(ex("q", "r", { messages: Array.from({ length: 22 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "m" + i })) }), NOW); ok(!v.ok && v.raison === "trop_de_messages", "plus de 20 messages refusé");
v = await validerExemple(ex("q", "r", { valide_le: "2027-01-01" }), NOW); ok(!v.ok && v.raison === "date_future", "date de validation future refusée");
v = await validerExemple(ex("q", "r", { perime_le: "2026-01-01" }), NOW); ok(!v.ok && v.raison === "perime", "exemple périmé refusé");
v = await validerExemple(ex("Mon numéro ?", "C'est le 77 123 45 67."), NOW); ok(!v.ok && v.motif === "telephone", "téléphone dans une réponse : refusé");
v = await validerExemple(ex("q", "r", { mots_cles: ["awa@exemple.sn"] }), NOW); ok(!v.ok && v.motif === "courriel", "courriel dans les mots-clés : refusé");
ok(JSON.stringify(ligneAtelier({ id: 7, domaine: "banque", donnees: { messages: [{ role: "user", content: "q" }], source: "s", valide_le: "2026-11-03", groupe: "g", ref: "loc" } })) ===
  '{"id":"000000000007","messages":[{"role":"user","content":"q"}],"source":"s","valide_le":"2026-11-03","domaine":"banque","prive":false,"groupe":"g"}', "ligne NDJSON au format de l'atelier (identifiant triable, prive explicite, sans référence locale)");

// 4. Jeton OIDC de GitHub (section 1 du contrat)
ok((await verifierGithub(env, JETON)).ok && reglages.repo === "987654321" && reglages.owner === "123456789", "jeton de l'atelier accepté ; repository_id et repository_owner_id figés au premier appel");
const refus = async (m: Record<string, unknown>, cle?: CryptoKey) => (await verifierGithub(env, await jeton({ ...bonne, ...m }, cle))).raison;
ok(await refus({ repository_id: "111" }) === "depot_id", "dépôt supprimé puis recréé sous le même nom (autre repository_id) : refusé");
ok(await refus({ repository_owner_id: undefined }) === "depot_id", "jeton sans repository_owner_id : refusé");
ok(await refus({ repository_visibility: "public" }) === "visibilite", "dépôt devenu public : refusé");
ok(await refus({ repository: "ndoyepapamassamba-commits/Add-a-README-file" }) === "depot", "autre dépôt du propriétaire : refusé");
ok(await refus({ repository_owner: "pirate" }) === "depot", "autre propriétaire : refusé");
ok(await refus({ aud: "teranga-boutique" }) === "aud", "audience de la boutique : refusée");
ok(await refus({ ref: "refs/heads/essai" }) === "branche", "autre branche : refusée");
ok(await refus({ workflow_ref: REPO + "/.github/workflows/autre.yml@refs/heads/main" }) === "workflow", "autre workflow du dépôt : refusé");
ok(await refus({ event_name: "pull_request" }) === "evenement", "demande de fusion : refusée");
ok(await refus({ exp: S - 61 }) === "date" && (await verifierGithub(env, await jeton({ ...bonne, exp: S - 30 }))).ok, "jeton expiré : refusé (tolérance d'horloge 60 s)");
ok(await refus({ iss: "https://faux" }) === "iss", "faux émetteur : refusé");
ok(await refus({}, autre.privateKey) === "signature", "signature d'une autre clé : refusée");
ok((await verifierGithub(env, "pas.un.jeton")).ok === false && (await verifierGithub(env, "")).ok === false, "jeton illisible : refusé");

// 5. Accès refusés
appels.length = 0;
let r = await traiter(req("GET", "/etat"), env);
ok(r.status === 401 && !appels.length, "GET /etat sans clé : 401 (sans requête en base)");
r = await traiter(req("POST", "/donnees", { exemples: [] }), env);
ok(r.status === 401, "POST /donnees sans clé : 401");
r = await traiter(req("GET", "/etat", undefined, { "x-admin-key": "mauvaise-cle-0123456789" }), env);
let j: any = await r.json();
ok(r.status === 401 && Object.keys(j).join() === "erreur,message", "GET /etat avec une mauvaise clé : 401 sans détail");
ok(!appels.some((a) => JSON.stringify(a.args).includes("mauvaise-cle")) && appels.some((a) => a.fn === "massamba_cle_valide" && /^[0-9a-f]{64}$/.test(a.args.p_empreinte)), "la clé reçue n'est jamais envoyée en base : seulement son empreinte");
r = await traiter(req("GET", "/etat", undefined, ATELIER), env);
ok(r.status === 401, "GET /etat avec le jeton de l'atelier : 401 (réservé au propriétaire)");
r = await traiter(req("GET", "/donnees?depuis=0", undefined, PROPRIO), env);
ok(r.status === 401, "GET /donnees avec la clé du propriétaire : 401 (réservé à l'atelier)");
r = await traiter(req("POST", "/versions", { statut: "echec" }, PROPRIO), env);
ok(r.status === 401, "POST /versions avec la clé du propriétaire : 401 (réservé à l'atelier)");
r = await traiter(req("POST", "/versions", { statut: "echec" }, { authorization: "Bearer " + await jeton({ ...bonne, repository: "pirate/massamba-modele" }) }), env);
ok(r.status === 401, "POST /versions avec le jeton d'un autre dépôt : 401");
for (const k of Object.keys(limites)) if (k.startsWith("msb-echec:")) limites[k] = 30;
r = await traiter(req("GET", "/etat", undefined, PROPRIO), env);
ok(r.status === 429, "trop d'essais refusés depuis la même adresse : 429, même avec la bonne clé");
for (const k of Object.keys(limites)) delete limites[k];
r = await traiter(req("OPTIONS", "/donnees"), env);
ok(r.status === 204 && /x-admin-key/.test(r.headers.get("access-control-allow-headers") || "") && /x-dernier-id/.test(r.headers.get("access-control-expose-headers") || ""), "pré-vol CORS : x-admin-key permis, x-dernier-id lisible");

// 6. POST /donnees : validation, confidentialité, dédoublonnage
const lot = [
  ex("Qu'est-ce que le ratio de liquidité ?", "L'actif liquide rapporté au passif exigible à court terme."),
  ex("Comment calculer une mensualité ?", "Capital × taux / (1 − (1 + taux)^−n)."),
  ex("QU'EST-CE QUE LE RATIO DE LIQUIDITÉ", "L'actif liquide rapporté au passif exigible à court terme !"),     // doublon (forme canonique)
  ex("Contact ?", "Écrivez à awa.ndiaye@exemple.sn"),
  ex("Numéro du client ?", "77 123 45 67"),
  ex("IBAN ?", "SN08 SN01 0015 2000 0538 0000 7542"),
  ex("Note privée", "secret", { prive: true }),
  { messages: [{ role: "user", content: "seul" }], prive: false },
];
appels.length = 0;
r = await traiter(req("POST", "/donnees", { exemples: lot }, PROPRIO), env);
j = await r.json();
ok(r.status === 200 && j.ajoutes === 2 && j.doublons === 1 && j.refuses === 5, "envoi : 2 ajoutés, 1 doublon, 5 refusés", j);
ok(j.motifs.courriel === 1 && j.motifs.telephone === 1 && j.motifs.iban === 1 && j.motifs.prive === 1 && j.motifs.format === 1, "refus comptés par motif (courriel, téléphone, IBAN, privé, format)", j.motifs);
ok(j.refus.map((x: any) => x.i).join() === "3,4,5,6,7" && j.empreintes.length === 2, "index des exemples refusés et empreintes des exemples gardés renvoyés");
const ins = appels.find((a) => a.fn === "massamba_ajouter")!;
ok(ins.args.p_exemples.length === 2 && !JSON.stringify(ins.args).match(/awa\.ndiaye|77 123|SN08|secret/), "rien de privé n'atteint la base", ins.args);
r = await traiter(req("POST", "/donnees", { exemples: lot.slice(0, 2) }, PROPRIO), env);
j = await r.json();
ok(j.ajoutes === 0 && j.doublons === 2 && exemples.length === 2, "nouvel envoi des mêmes exemples : doublons, rien d'ajouté");
r = await traiter(req("POST", "/donnees", { exemples: Array(2001).fill(lot[0]) }, PROPRIO), env);
ok(r.status === 413, "plus de 2 000 exemples par envoi : 413");
r = await traiter(req("POST", "/donnees", JSON.stringify({ exemples: [ex("q", "x".repeat(7000))] }).padEnd(2 * 1024 * 1024 + 10, " "), PROPRIO), env);
ok(r.status === 413, "corps de plus de 2 Mo : 413");
r = await traiter(req("POST", "/donnees", { autre: 1 }, PROPRIO), env);
ok(r.status === 400, "corps sans « exemples » : 400");
r = await traiter(req("POST", "/donnees", "pas du json", PROPRIO), env);
ok(r.status === 400, "JSON illisible : 400");
for (let i = 0; i < 5; i++) await traiter(req("POST", "/donnees", { exemples: [ex(`Question numéro ${i} sur le crédit`, `Réponse ${i}`, { domaine: i % 2 ? "Crédit PME" : "banque" })] }, PROPRIO), env);
ok(exemples.length === 7 && exemples[3].domaine === "credit-pme", "envois successifs : identifiants croissants, domaine normalisé");

// Exemple rejeté après coup : retiré du corpus par sa référence locale
await traiter(req("POST", "/donnees", { exemples: [ex("Question à retirer plus tard", "Réponse provisoire", { id: "x-retirer-1" })] }, PROPRIO), env);
ok(exemples.length === 8, "exemple avec référence locale ajouté");
r = await traiter(req("POST", "/donnees/retirer", { refs: ["x-retirer-1", "x-inconnu"] }, PROPRIO), env);
j = await r.json();
ok(r.status === 200 && j.retires === 1 && exemples.length === 7 && !exemples.some((x) => x.donnees.ref === "x-retirer-1"), "POST /donnees/retirer : l'exemple rejeté disparaît du corpus", j);
r = await traiter(req("POST", "/donnees/retirer", { refs: ["x-retirer-1"] }, ATELIER), env);
ok(r.status === 401, "retrait réservé au propriétaire (jeton de l'atelier : 401)");
r = await traiter(req("POST", "/donnees/retirer", { refs: ["../x"] }, PROPRIO), env);
ok(r.status === 400, "référence invalide : 400");

// 7. GET /donnees (atelier) : NDJSON paginé
r = await traiter(req("GET", "/donnees", undefined, ATELIER), env);
let texte = await r.text();
let lignes = texte.trim().split("\n").map((l) => JSON.parse(l));
ok(r.status === 200 && r.headers.get("content-type")!.startsWith("application/x-ndjson") && r.headers.get("x-dernier-id") === "000000000007" && lignes.length === 7, "sans « depuis » : tout le corpus, x-dernier-id = identifiant de la dernière ligne");
ok(lignes[0].id === "000000000001" && lignes[0].prive === false && lignes[0].messages[1].role === "assistant" && lignes[0].valide_le === "2026-11-03" && lignes[0].source && lignes[0].domaine === "banque", "ligne : identifiant triable, messages, source, date, domaine, prive:false");
ok(lignes.every((l, i) => !i || l.id > lignes[i - 1].id), "lignes triées par identifiant (ordre des chaînes)");
r = await traiter(req("GET", "/donnees?depuis=000000000005", undefined, ATELIER), env);
lignes = (await r.text()).trim().split("\n").map((l) => JSON.parse(l));
ok(lignes.map((l) => l.id).join() === "000000000006,000000000007" && r.headers.get("x-dernier-id") === "000000000007", "depuis=000000000005 : seulement 6 et 7");
r = await traiter(req("GET", "/donnees?depuis=000000000007", undefined, ATELIER), env);
ok((await r.text()) === "" && r.headers.get("x-dernier-id") === "", "rien de nouveau : réponse vide, x-dernier-id vide");
r = await traiter(req("GET", "/donnees?depuis=-3", undefined, ATELIER), env);
ok(r.status === 400, "depuis invalide : 400");
const sauve = exemples;
exemples = Array.from({ length: 21_050 }, (_, i) => ({ id: i + 1, empreinte: String(i), domaine: "general", donnees: { messages: [{ role: "user", content: "q" }, { role: "assistant", content: "r" }], source: "s", valide_le: "2026-11-01" } }));
let depuis = "", pages = 0, vues = 0;
for (;;) {
  r = await traiter(req("GET", "/donnees" + (depuis ? "?depuis=" + depuis : ""), undefined, ATELIER), env);
  const t = await r.text(), n = t ? t.trim().split("\n").length : 0, suivant = r.headers.get("x-dernier-id") || "";
  vues += n; pages++;
  if (!n || !suivant || suivant === depuis) break;
  depuis = suivant;
}
ok(vues === 21_050 && pages === 3 && depuis === "000000021050", "pagination du client (depuis = x-dernier-id jusqu'à réponse vide) : tout le corpus en pages de 20 000", { vues, pages, depuis });
exemples = sauve;

// 8. GET /donnees/compte (vérification toutes les 3 h)
r = await traiter(req("GET", "/donnees/compte?depuis=000000000005", undefined, ATELIER), env);
j = await r.json();
ok(r.status === 200 && j.nouveaux === 2 && j.dernier_id === "000000000007" && j.derniere_publiee_le === null, "compte depuis 5 : 2 nouveaux, dernier identifiant", j);
r = await traiter(req("GET", "/donnees/compte", undefined, ATELIER), env);
ok((await r.json()).nouveaux === 7, "compte sans « depuis » : le total");
r = await traiter(req("GET", "/donnees/compte?depuis=5"), env);
ok(r.status === 401, "compte sans jeton : 401");

// 9. Dernière version : aucune encore
r = await traiter(req("GET", "/versions/derniere", undefined, ATELIER), env);
j = await r.json();
ok(r.status === 200 && j.version === null && j.derniere_tentative === null && JSON.stringify(j.fichiers) === "{}", "aucune version : 200, version null, derniere_tentative null", j);

// 10. Séances : rien_a_faire, echec, rejetee (consignées pour le budget, sans fichiers)
r = await traiter(req("POST", "/versions", { statut: "rien_a_faire", base: "Qwen/Qwen3-0.6B", duree_minutes: 3.5, dernier_id: "000000000007", fichiers: [] }, ATELIER), env);
j = await r.json();
ok(r.status === 201 && j.version === "20261104-011000" && JSON.stringify(j.televersements) === "{}", "séance « rien_a_faire » : version AAAAMMJJ-HHMMSS attribuée par le serveur, aucun téléversement", j);
r = await traiter(req("POST", "/versions", { statut: "echec", duree_minutes: 12.25 }, ATELIER), env);
j = await r.json();
ok(r.status === 201 && j.version === "20261104-011000-2", "même seconde : suffixe -2 (reste triable)", j);
r = await traiter(req("POST", "/versions", { statut: "rejetee", base: "Qwen/Qwen3-0.6B", duree_minutes: 40, fichiers: ["adaptateur.tar.gz"] }, ATELIER), env);
ok(r.status === 400 && (await r.json()).erreur === "fichiers", "séance rejetée avec des fichiers : 400");
avancer(60);
r = await traiter(req("POST", "/versions", { statut: "rejetee", base: "Qwen/Qwen3-0.6B", revision: "abc123", duree_minutes: 40, dernier_id: "000000000007", fichiers: [], raisons: ["score global en baisse : 0.400 < 0.410"],
  scores: { avant: 0.41, apres: 0.40, detail: { reference: { global: { n: 64, score: 0.41 } } } }, run: { id: "1234567890", tentative: "1" } }, ATELIER), env);
j = await r.json();
ok(r.status === 201 && versions[2].statut === "rejetee" && versions[2].details.raisons.length === 1 && versions[2].details.run.id === "1234567890", "séance « rejetee » consignée avec ses raisons et son exécution", j);
r = await traiter(req("POST", "/versions", { statut: "publiee" }, ATELIER), env);
ok(r.status === 400, "statut inconnu : 400");
r = await traiter(req("POST", "/versions", { statut: "echec", duree_minutes: "beaucoup" }, ATELIER), env);
ok(r.status === 400, "durée illisible : 400");
r = await traiter(req("POST", "/versions", { statut: "echec", scores: { exemple: "x".repeat(200) } }, ATELIER), env);
ok(r.status === 400, "texte d'exemple dans les scores : 400");
r = await traiter(req("GET", "/versions/derniere", undefined, ATELIER), env);
j = await r.json();
ok(j.version === null && j.derniere_tentative.version === "20261104-011100" && j.derniere_tentative.statut === "rejetee" && j.derniere_tentative.cree_le === "2026-11-04T01:11:00Z" && j.derniere_tentative.dernier_id === "000000000007",
  "derniere_tentative : version, statut, cree_le (format du contrat), dernier_id", j);

// 11. Séance candidate : téléversements, publication, idempotence
avancer(3600);
const fichiersV = ["adaptateur.tar.gz", "massamba-lora-f16.gguf", "Modelfile.adaptateur", "Modelfile", "massamba-q4_k_m.gguf.part-00001-of-00002", "massamba-q4_k_m.gguf.part-00002-of-00002"];
const assV = { "massamba-q4_k_m.gguf": { mode: "octets", parties: fichiersV.slice(4), sha256: "c".repeat(64), taille: 1500 } };
const corpsCand = { statut: "candidat", base: "Qwen/Qwen3-0.6B", revision: "abc123", scores: { avant: 0.41, apres: 0.63, detail: { reference: { global: { n: 64, score: 0.41 } }, candidat: { global: { n: 64, score: 0.63 } }, reference_est_base: true } },
  nb_exemples: 57, rejeu: 57, reste: 0, duree_minutes: 46.0, dernier_id: "000000000007", depart: "", fichiers: fichiersV, assemblage: assV, raisons: [], run: { id: "1234567891", tentative: "1" } };
r = await traiter(req("POST", "/versions", { ...corpsCand, fichiers: ["../../etc.gguf"] }, ATELIER), env);
ok(r.status === 400, "nom de fichier avec chemin : 400");
r = await traiter(req("POST", "/versions", { ...corpsCand, assemblage: { "m.gguf": { mode: "octets", parties: ["inconnue"], sha256: "c".repeat(64), taille: 1 } } }, ATELIER), env);
ok(r.status === 400 && (await r.json()).erreur === "assemblage", "assemblage dont une partie n'est pas déclarée : 400");
stockageAppels.length = 0;
r = await traiter(req("POST", "/versions", corpsCand, ATELIER), env);
j = await r.json();
const V1 = j.version;
ok(r.status === 201 && V1 === "20261104-021100" && Object.keys(j.televersements).length === 6 && j.televersements["Modelfile"] === `https://exemple.supabase.co/storage/v1/object/upload/sign/massamba/${V1}/Modelfile?token=jeton-depot`, "candidate : une URL PUT signée par nom de « fichiers »", j);
ok(stockageAppels.every((s) => s.h.apikey === "sb_secret_test" && !s.h.authorization) && stockageAppels.some((s) => s.h["x-upsert"] === "true"), "stockage appelé avec la clé de service (en-tête apikey seul), dépôt remplaçable (x-upsert)");
ok(versions[3].details.assemblage["massamba-q4_k_m.gguf"].mode === "octets" && versions[3].dernier_id === 7 && versions[3].duree_minutes === 46, "assemblage, dernier_id et durée gardés");
r = await traiter(req("GET", "/versions/derniere", undefined, ATELIER), env);
j = await r.json();
ok(j.version === null && j.derniere_tentative.statut === "candidat", "candidate jamais publiée : invisible pour « derniere »");
const tailles: Record<string, number> = { "adaptateur.tar.gz": 900, "massamba-lora-f16.gguf": 400, "Modelfile.adaptateur": 80, "Modelfile": 120, [fichiersV[4]]: 1000, [fichiersV[5]]: 500 };
const empreintes = Object.fromEntries(fichiersV.map((f, i) => [f, String(i).repeat(64)]));
r = await traiter(req("POST", `/versions/${V1}/publier`, { empreintes, tailles }, ATELIER), env);
j = await r.json();
ok(r.status === 409 && j.manquants.length === 6 && versions[3].statut === "candidat", "publication avant les PUT : 409, reste candidate", j);
for (const f of fichiersV) objets.set(`${V1}/${f}`, tailles[f]);
objets.set(`${V1}/Modelfile`, 119);
r = await traiter(req("POST", `/versions/${V1}/publier`, { empreintes, tailles }, ATELIER), env);
j = await r.json();
ok(r.status === 409 && j.erreur === "taille" && j.fichiers.join() === "Modelfile", "taille déposée différente de la taille annoncée : 409", j);
objets.set(`${V1}/Modelfile`, 120);
r = await traiter(req("POST", `/versions/${V1}/publier`, { empreintes, tailles }, PROPRIO), env);
ok(r.status === 401, "publication avec la clé du propriétaire : 401 (réservée à l'atelier)");
avancer(120);
r = await traiter(req("POST", `/versions/${V1}/publier`, { empreintes, tailles }, ATELIER), env);
j = await r.json();
ok(r.status === 200 && j.version === V1 && j.publiee_le === "2026-11-04T02:13:00Z" && versions[3].statut === "publiee" && versions[3].details.empreintes["Modelfile"], "publication : {version, publiee_le}, empreintes gardées", j);
avancer(60);
r = await traiter(req("POST", `/versions/${V1}/publier`, { empreintes, tailles }, ATELIER), env);
j = await r.json();
ok(r.status === 200 && j.publiee_le === "2026-11-04T02:13:00Z", "publication idempotente : même réponse au second appel");
r = await traiter(req("POST", `/versions/${encodeURIComponent("20261104-011100")}/publier`, {}, ATELIER), env);
ok(r.status === 409, "publier une séance rejetée : 409");
r = await traiter(req("POST", "/versions/20991231-000000/publier", {}, ATELIER), env);
ok(r.status === 404, "version inconnue : 404");

// GET /versions/derniere : atelier et propriétaire
r = await traiter(req("GET", "/versions/derniere", undefined, ATELIER), env);
j = await r.json();
ok(r.status === 200 && j.version === V1 && j.base === "Qwen/Qwen3-0.6B" && j.revision === "abc123" && j.publiee_le === "2026-11-04T02:13:00Z" && j.reste === 0 && j.dernier_id === "000000000007" && j.nb_exemples === 57 && j.scores.apres === 0.63,
  "derniere : version, base, revision, publiee_le, reste, dernier_id, nb_exemples, scores", j);
ok(Object.keys(j.fichiers).length === 6 && j.fichiers["adaptateur.tar.gz"] === `https://exemple.supabase.co/storage/v1/object/sign/massamba/${V1}/adaptateur.tar.gz?token=jeton-lecture` && j.empreintes["Modelfile"] && j.assemblage["massamba-q4_k_m.gguf"].parties.length === 2,
  "derniere : URL de lecture signées, empreintes, assemblage recopié");
ok(j.derniere_tentative.version === V1 && j.derniere_tentative.statut === "publiee" && j.expire_le === "2026-11-04T03:14:00Z", "derniere : dernière tentative = la version publiée ; URL valables 1 h", j);
ok(stockageAppels.find((s) => s.chemin === "/object/sign/massamba")!.corps.expiresIn === 3600, "signature demandée pour 1 h");
r = await traiter(req("GET", "/versions/derniere", undefined, PROPRIO), env);
ok(r.status === 200 && (await r.json()).version === V1, "derniere : aussi pour le propriétaire (installation dans Ollama)");
r = await traiter(req("GET", "/versions/derniere"), env);
ok(r.status === 401, "derniere sans accès : 401");
r = await traiter(req("GET", "/donnees/compte?depuis=000000000007", undefined, ATELIER), env);
ok((await r.json()).derniere_publiee_le === "2026-11-04T02:13:00Z", "compte : date de la dernière publication au format du contrat");

// Régression signalée par les scores : rejetée à la publication
avancer(3600);
r = await traiter(req("POST", "/versions", { ...corpsCand, scores: { apres: 0.58, avant_derniere: 0.63 }, duree_minutes: 30 }, ATELIER), env);
const V2 = (await r.json()).version;
for (const f of fichiersV) objets.set(`${V2}/${f}`, tailles[f]);
r = await traiter(req("POST", `/versions/${V2}/publier`, { empreintes, tailles }, ATELIER), env);
j = await r.json();
ok(r.status === 409 && j.erreur === "regression" && versions[4].statut === "rejetee" && /régression/.test(versions[4].details.raisons[0]), "score en baisse (0,58 < 0,63) : 409, séance rejetée avec sa raison", j);

// Publications suivantes : ménage du bucket (garde la nouvelle et la précédente publiée)
const pubs: string[] = [], purges: string[][] = [];
for (let k = 0; k < 2; k++) {
  avancer(3600);
  r = await traiter(req("POST", "/versions", { ...corpsCand, duree_minutes: 20 }, ATELIER), env);
  const V = (await r.json()).version; pubs.push(V);
  for (const f of fichiersV) objets.set(`${V}/${f}`, tailles[f]);
  r = await traiter(req("POST", `/versions/${V}/publier`, { empreintes, tailles }, ATELIER), env);
  j = await r.json(); purges.push(j.purgees);
  ok(r.status === 200 && j.version === V, `publication ${k + 2}`, j);
}
ok(purges[0].join() === V2 && purges[1].join() === V1 && ![...objets.keys()].some((p) => p.startsWith(V1) || p.startsWith(V2)) && [...objets.keys()].some((p) => p.startsWith(pubs[0])) && [...objets.keys()].some((p) => p.startsWith(pubs[1])),
  "ménage : la rejetée puis la plus ancienne publiée effacées ; les deux dernières publiées gardées", purges);
ok(versions[3].statut === "publiee" && !Object.keys(versions[3].chemins).length && versions[3].scores.apres === 0.63, "versions purgées : métadonnées et scores gardés");

// 12. Budget et état
r = await traiter(req("GET", "/versions/budget", undefined, ATELIER), env);
j = await r.json();
ok(r.status === 200 && j.mois === "2026-11" && j.minutes === 3.5 + 12.25 + 40 + 46 + 30 + 20 + 20 && j.seances === 7, "budget : somme des durées de TOUTES les séances du mois (tout statut)", j);
const NOWsauve = NOW;
NOW = new Date("2026-12-01T00:30:00Z");
r = await traiter(req("GET", "/versions/budget", undefined, ATELIER), env);
ok((await r.json()).minutes === 0, "nouveau mois civil UTC : budget remis à zéro");
NOW = NOWsauve;
r = await traiter(req("GET", "/etat", undefined, PROPRIO), env);
j = await r.json();
ok(r.status === 200 && j.nb_exemples === 7 && j.versions.length === 7 && j.derniere_publiee.version === pubs[1] && j.planification === "17 */3 * * *" && j.prochaine_execution === "2026-11-04T06:17:00Z" && j.minutes_mois === 171.75,
  "état : exemples, séances, dernière publiée, prochaine exécution (cron du workflow), minutes du mois", j);
ok(j.versions[0].cree_le.endsWith("Z") && j.versions.some((x: any) => x.statut === "rien_a_faire") && j.stockage.limite === LIMITE_STOCKAGE && j.stockage.octets === 6000, "état : statuts des séances, place occupée du bucket", j.stockage);

// 13. Stockage (1 Go gratuit, plafond 900 Mio) : ménage avant une candidate, refus si la place manque encore
const Mo = 1024 * 1024;
const gros = (V: string, partie: number) => { for (const f of fichiersV) objets.set(`${V}/${f}`, f.includes(".part-") ? partie * Mo : f.startsWith("Modelfile") ? 1000 : 20 * Mo); };
const annonceLourde = (partiesMo: number) => ({ ...corpsCand, tailles: { "adaptateur.tar.gz": 20 * Mo, "massamba-lora-f16.gguf": 20 * Mo }, assemblage: { "massamba-q4_k_m.gguf": { ...assV["massamba-q4_k_m.gguf"], taille: partiesMo * Mo } } });
gros(pubs[0], 130); gros(pubs[1], 130);    // ~300 Mio par version publiée : 600 Mio occupés
avancer(3600);
r = await traiter(req("POST", "/versions", annonceLourde(280), ATELIER), env);       // 320 Mio annoncés : 920 > 900
j = await r.json();
const V5 = j.version;
ok(r.status === 201 && j.purgees.join() === pubs[0] && !j.fusion_retiree && [...objets.keys()].filter((p) => p.startsWith(pubs[1])).length === 6,
  "plein : l'avant-dernière publiée est effacée, la dernière gardée entière, candidate acceptée", { purgees: j.purgees, f: j.fusion_retiree, pubs });
gros(pubs[1], 230);                         // dernière publiée ~500 Mio (Qwen3-0.6B Q4_K_M) ; la candidate V5 abandonnée (1 octet par fichier)
for (const f of fichiersV) objets.set(`${V5}/${f}`, 1);
avancer(3600);
r = await traiter(req("POST", "/versions", annonceLourde(460), ATELIER), env);       // 500 Mio annoncés : 1 000 > 900
j = await r.json();
ok(r.status === 201 && j.purgees.join() === V5 && j.fusion_retiree === pubs[1] && [...objets.keys()].filter((p) => p.startsWith(pubs[1])).map((p) => p.split("/")[1]).sort().join() === "Modelfile,Modelfile.adaptateur,adaptateur.tar.gz,massamba-lora-f16.gguf",
  "deux modèles de ~500 Mio ne tiennent pas : candidate abandonnée effacée, puis le modèle fusionné de la dernière publiée (adaptateur et Modelfile gardés)", { purgees: j.purgees, f: j.fusion_retiree });
r = await traiter(req("GET", "/versions/derniere", undefined, PROPRIO), env);
j = await r.json();
ok(j.version === pubs[1] && Object.keys(j.fichiers).length === 4 && j.fichiers_retires.length === 2, "derniere : fichiers restants et liste des fichiers retirés", j);
ok(partiesFusion({ chemins: { "a-00001-of-00002.gguf": "x", "Modelfile": "y" }, details: {} }).join() === "a-00001-of-00002.gguf", "parties gguf-split reconnues sans assemblage");
r = await traiter(req("POST", "/versions", { ...corpsCand, assemblage: { "massamba-q4_k_m.gguf": { ...assV["massamba-q4_k_m.gguf"], taille: 950 * Mo } } }, ATELIER), env);
j = await r.json();
ok(r.status === 507 && j.erreur === "stockage", "version plus lourde que le plafond à elle seule : 507", j);
r = await traiter(req("POST", "/versions", { ...corpsCand, tailles: { "adaptateur.tar.gz": 51 * Mo } }, ATELIER), env);
ok(r.status === 400 && (await r.json()).erreur === "tailles", "fichier annoncé de plus de 50 Mio : 400");

// 14. Divers
rythmeOk = false;
r = await traiter(req("GET", "/etat", undefined, PROPRIO), env);
ok(r.status === 429, "rythme dépassé : 429");
rythmeOk = true;
panneBase = true;
r = await traiter(req("GET", "/etat", undefined, PROPRIO), env);
ok(r.status === 503 && (await r.json()).erreur === "indisponible", "base en panne : 503 sans détail");
panneBase = false;
r = await traiter(req("GET", "/inconnue", undefined, PROPRIO), env);
ok(r.status === 404, "route inconnue : 404");
_oublierCaches();
ok((await verifierGithub(env, JETON)).ok, "cache des clés de GitHub vidé puis rechargé");
ok(BUCKET === "massamba" && MAX_LECTURE === 20_000, "bucket « massamba », pages de 20 000");

console.log(`BILAN ${total - echecs}/${total}`);
if (echecs) process.exit(1);
