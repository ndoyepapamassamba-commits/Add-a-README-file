// Conformité au contrat API-MASSAMBA.md v1.1 : le VRAI client de l'atelier (depot/scripts/client_massamba.py) et la
// vérification rapide (depot/scripts/verifier_rapide.sh, curl + jq) sont exécutés contre la logique de cette fonction,
// servie en HTTP local (base, stockage et clés de GitHub simulés en mémoire, aucun appel réseau extérieur).
// node --experimental-strip-types supabase/functions/massamba/conformite.ts [dossier du dépôt massamba-modele]
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { traiter, sha256Hex, REPO, WORKFLOW, GH_ISS, AUDIENCE } from "./index.ts";
import type { Env } from "./index.ts";

const DEPOT = process.argv[2] || "/tmp/claude-0/-home-user-Add-a-README-file/65c5552d-59b7-5513-aa37-90563f96387a/scratchpad/mi/integ/entrainement/depot";
let echecs = 0, total = 0;
const ok = (c: unknown, m: string, d?: unknown) => { total++; if (!c) echecs++; console.log((c ? "OK     " : "ÉCHEC  ") + m + (d !== undefined && !c ? " — " + JSON.stringify(d).slice(0, 600) : "")); };
if (!existsSync(join(DEPOT, "scripts/client_massamba.py"))) { console.log("Dépôt de l'atelier introuvable : " + DEPOT); process.exit(2); }

// ------------------------------------------------------------------ Jeton OIDC (clé RSA de test)
const b64url = (u: Uint8Array) => Buffer.from(u).toString("base64url");
const paire = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk: any = await crypto.subtle.exportKey("jwk", paire.publicKey);
const S = Math.floor(Date.now() / 1000);
const charge = { iss: GH_ISS, aud: AUDIENCE, repository: REPO, repository_owner: "ndoyepapamassamba-commits", repository_visibility: "private", repository_id: "42", repository_owner_id: "7",
  ref: "refs/heads/main", workflow_ref: WORKFLOW, event_name: "schedule", iat: S - 5, nbf: S - 5, exp: S + 3600 };
const t = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", kid: "k1", typ: "JWT" }))), c = b64url(new TextEncoder().encode(JSON.stringify(charge)));
const JETON = `${t}.${c}.${b64url(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", paire.privateKey, new TextEncoder().encode(`${t}.${c}`))))}`;
const CLE = "cle-proprio-de-test-0123456789abcdef";

// ------------------------------------------------------------------ Base et stockage en mémoire
let exemples: any[] = [];
const versions: any[] = [], reglages: Record<string, string> = {}, objets = new Map<string, Buffer>(), limites: Record<string, number> = {};
const tri = () => [...versions].sort((a, b) => (a.version < b.version ? 1 : -1));
const rpcs: Record<string, (a: any) => any> = {
  tcv_rate_limit_count: (a) => limites[a.p_key] || 0,
  tcv_hit_rate_limit: (a) => { limites[a.p_key] = (limites[a.p_key] || 0) + 1; return true; },
  massamba_cle_valide: async (a) => a.p_empreinte === await sha256Hex(CLE),
  massamba_figer_depot: (a) => { reglages.r ??= a.p_repo_id; reglages.o ??= a.p_owner_id; return reglages.r === a.p_repo_id && reglages.o === a.p_owner_id; },
  massamba_ajouter: (a) => { let n = 0; for (const e of a.p_exemples) if (!exemples.some((x) => x.empreinte === e.empreinte)) { exemples.push({ id: exemples.length + 1, ...e }); n++; } return { ajoutes: n, doublons: a.p_exemples.length - n }; },
  massamba_borne: (a) => { const l = exemples.filter((x) => x.id > a.p_depuis).slice(0, a.p_limite); return { jusqua: l.length ? l[l.length - 1].id : null, nb: l.length }; },
  massamba_exemples_page: (a) => exemples.filter((x) => x.id > a.p_depuis && x.id <= a.p_jusqua).slice(0, a.p_limite).map((x) => ({ id: x.id, domaine: x.domaine, donnees: x.donnees })),
  massamba_compte: (a) => ({ nouveaux: exemples.filter((x) => x.id > a.p_depuis).length, dernier_id: exemples.length, derniere_publiee_le: tri().find((v) => v.statut === "publiee")?.publiee_le || null }),
  massamba_budget: (a) => { const l = versions.filter((v) => v.cree_le >= a.p_debut && v.cree_le < a.p_fin); return { minutes: l.reduce((s, v) => s + v.duree_minutes, 0), seances: l.length }; },
  massamba_version_creer: (a) => {
    const base = a.p_now.slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
    let v = base, i = 1; while (versions.some((x) => x.version === v)) v = base + "-" + ++i;
    const chemins: Record<string, string> = {}; for (const f of a.p_fichiers) chemins[f] = `${v}/${f}`;
    versions.push({ version: v, statut: a.p_statut, base: a.p_base, revision: a.p_revision, scores: a.p_scores, nb_exemples: a.p_nb, reste: a.p_reste, dernier_id: a.p_dernier_id, duree_minutes: a.p_duree, chemins, details: a.p_details, cree_le: a.p_now, publiee_le: null });
    return { version: v, chemins };
  },
  massamba_version: (a) => versions.find((v) => v.version === a.p_version) || null,
  massamba_derniere: () => tri().find((v) => v.statut === "publiee") || null,
  massamba_tentative: () => tri()[0] || null,
  massamba_publier: (a) => { const v = versions.find((x) => x.version === a.p_version); if (!v) return null; if (v.statut === "publiee") return v; if (v.statut !== "candidat") return { erreur: "statut" }; v.statut = "publiee"; v.publiee_le = a.p_now; v.details = { ...v.details, empreintes: a.p_empreintes, tailles: a.p_tailles }; return v; },
  massamba_rejeter: () => null,
  massamba_stockage: () => ({ octets: [...objets.values()].reduce((s, b) => s + b.length, 0) }),
  massamba_publiees: (a) => tri().filter((v) => v.statut === "publiee").slice(0, a.p_n).map((v) => v.version),
  massamba_a_purger: (a) => versions.filter((v) => v.version < a.p_avant && !a.p_garder.includes(v.version) && Object.keys(v.chemins).length).map((v) => ({ version: v.version, chemins: v.chemins })),
  massamba_purge_faite: (a) => { for (const v of versions) if (a.p_versions.includes(v.version)) v.chemins = {}; return a.p_versions.length; },
  massamba_chemins_retirer: () => ({}),
};
let BASE_URL = "";
const fauxFetch = (async (url: string, init?: any) => {
  if (url.endsWith("/.well-known/jwks")) return new Response(JSON.stringify({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] }), { status: 200 });
  const u = new URL(url), corps = init && init.body ? JSON.parse(init.body) : null;
  if (u.pathname.startsWith("/rest/v1/rpc/")) { const r = await rpcs[u.pathname.slice(13)](corps); return new Response(r === null || r === undefined ? "null" : JSON.stringify(r), { status: 200 }); }
  let m = u.pathname.match(/^\/storage\/v1\/object\/upload\/sign\/massamba\/(.+)$/);
  if (m) return new Response(JSON.stringify({ url: `/object/upload/sign/massamba/${m[1]}?token=depot` }), { status: 200 });
  if (u.pathname === "/storage/v1/object/sign/massamba") return new Response(JSON.stringify(corps.paths.map((p: string) => ({ path: p, signedURL: `/object/sign/massamba/${p}?token=lecture`, error: null }))), { status: 200 });
  if (u.pathname === "/storage/v1/object/list/massamba") { const pre = corps.prefix + "/"; return new Response(JSON.stringify([...objets].filter(([p]) => p.startsWith(pre)).map(([p, b]) => ({ name: p.slice(pre.length), id: p, metadata: { size: b.length } }))), { status: 200 }); }
  if (u.pathname === "/storage/v1/object/massamba" && init.method === "DELETE") { for (const p of corps.prefixes) objets.delete(p); return new Response("[]", { status: 200 }); }
  return new Response("{}", { status: 404 });
}) as unknown as typeof fetch;
const env: Env = { url: "", cle: "sb_secret_test", fetch: fauxFetch, now: () => new Date() };
const journal: string[] = [];

// ------------------------------------------------------------------ Serveur HTTP local
const serveur = createServer(async (req, rep) => {
  const morceaux: Buffer[] = []; for await (const x of req) morceaux.push(x as Buffer);
  const corps = Buffer.concat(morceaux), u = new URL(req.url || "/", BASE_URL);
  try {
    if (u.pathname === "/oidc") {
      const bon = req.headers.authorization === "bearer porteur-test" && u.searchParams.get("audience") === AUDIENCE;
      rep.writeHead(bon ? 200 : 403, { "content-type": "application/json" }); rep.end(JSON.stringify(bon ? { value: JETON } : {})); return;
    }
    let m = u.pathname.match(/^\/storage\/v1\/object\/upload\/sign\/massamba\/(.+)$/);
    if (m && req.method === "PUT") { const ok = u.searchParams.get("token") === "depot"; if (ok) objets.set(decodeURIComponent(m[1]), corps); journal.push(`PUT ${m[1]} ${req.headers["content-type"]} ${req.headers["x-upsert"]}`); rep.writeHead(ok ? 200 : 403, { "content-type": "application/json" }); rep.end(JSON.stringify({ Key: "massamba/" + m[1] })); return; }
    m = u.pathname.match(/^\/storage\/v1\/object\/sign\/massamba\/(.+)$/);
    if (m && req.method === "GET") { const b = objets.get(decodeURIComponent(m[1])); rep.writeHead(b && u.searchParams.get("token") === "lecture" ? 200 : 400); rep.end(b || ""); return; }
    if (u.pathname.startsWith("/functions/v1/massamba")) {
      journal.push(`${req.method} ${u.pathname.replace("/functions/v1/massamba", "")}${u.search}`);
      const h = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") h.set(k, v);
      const r = await traiter(new Request(BASE_URL + req.url, { method: req.method, headers: h, body: ["GET", "HEAD"].includes(req.method || "") ? undefined : corps }), env);
      const o: Record<string, string> = {}; r.headers.forEach((v, k) => { o[k] = v; });
      rep.writeHead(r.status, o); rep.end(Buffer.from(await r.arrayBuffer())); return;
    }
    rep.writeHead(404); rep.end();
  } catch (e: any) { rep.writeHead(500); rep.end(String(e && e.message)); }
});
await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", () => ok()));
BASE_URL = `http://127.0.0.1:${(serveur.address() as any).port}`;
env.url = BASE_URL;
const API = BASE_URL + "/functions/v1/massamba";

// Exemples validés envoyés par l'application (clé du propriétaire)
const ex = (i: number) => ({ messages: [{ role: "system", content: "Tu es MASSAMBA local." }, { role: "user", content: `Comment calculer le ratio numéro ${i} ?` }, { role: "assistant", content: `On divise A${i} par B${i}.` }],
  prive: false, domaine: "banque", source: "massamba-intelligence", valide_le: new Date().toISOString().slice(0, 10), groupe: "ratios-" + (i % 3), langue: "fr", mots_cles: ["ratio"] });
let r = await traiter(new Request(API + "/donnees", { method: "POST", headers: { "x-admin-key": CLE, "content-type": "application/json" }, body: JSON.stringify({ exemples: Array.from({ length: 35 }, (_, i) => ex(i)) }) }), env);
ok(r.status === 200 && (await r.json()).ajoutes === 35, "35 exemples validés envoyés par l'application");

const executer = (cmd: string, args: string[], envx: Record<string, string>) => new Promise<{ code: number; sortie: string; err: string }>((ok) => {
  const p = spawn(cmd, args, { env: { ...process.env, NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost", ...envx } });
  let sortie = "", err = ""; p.stdout.on("data", (d) => { sortie += d; }); p.stderr.on("data", (d) => { err += d; });
  p.on("close", (code) => ok({ code: code ?? -1, sortie, err }));
});
const dossier = mkdtempSync(join(tmpdir(), "massamba-conf-"));

// 1. Vérification rapide (curl + jq) : aucune version, 35 nouveaux → entraîner
const sortie1 = join(dossier, "sortie1.txt");
let x = await executer("bash", [join(DEPOT, "scripts/verifier_rapide.sh")], { MASSAMBA_API: API, ACTIONS_ID_TOKEN_REQUEST_URL: BASE_URL + "/oidc?api-version=2.0", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "porteur-test", GITHUB_OUTPUT: sortie1 });
const o1 = existsSync(sortie1) ? readFileSync(sortie1, "utf8") : "";
ok(x.code === 0 && /entrainer=oui/.test(o1), "verifier_rapide.sh contre la fonction : aucune version, 35 nouveaux → entraîner", { code: x.code, o1, s: x.sortie.slice(-300), e: x.err.slice(-300) });

// 2. Le client Python de l'atelier, de bout en bout
const pilote = join(dossier, "pilote.py");
writeFileSync(pilote, `
import json, os, sys, tarfile, io, hashlib
sys.path.insert(0, ${JSON.stringify(join(DEPOT, "scripts"))})
from client_massamba import ClientMassamba, decouper_octets, sha256_fichier
import donnees as D
cl = ClientMassamba(base=${JSON.stringify(API)}, jeton=lambda: ${JSON.stringify(JETON)}, essais=1, pause=0.1)
tmp = ${JSON.stringify(dossier)}
out = {}
d = cl.derniere(); out["derniere0"] = {"version": d.get("version"), "tentative": d.get("derniere_tentative"), "fichiers": d.get("fichiers")}
out["compte0"] = cl.compte()
out["budget0"] = cl.budget()
n, dernier = cl.donnees(os.path.join(tmp, "corpus.jsonl"))
out["donnees"] = [n, dernier]
valides, raisons = 0, []
for l in open(os.path.join(tmp, "corpus.jsonl"), encoding="utf-8"):
    try:
        D.valider(json.loads(l)); valides += 1
    except D.ExempleInvalide as e:
        raisons.append(e.raison)
out["valides"] = [valides, raisons[:3]]
out["rien"] = cl.creer_version({"statut": "rien_a_faire", "base": "Qwen/Qwen3-0.6B", "duree_minutes": 1.5, "dernier_id": dernier, "fichiers": []})
# Paquet d'une séance candidate : modèle fusionné coupé en parties d'octets
chemins = {}
modele = os.path.join(tmp, "massamba-q4_k_m.gguf")
with open(modele, "wb") as f: f.write(b"GGUF" + os.urandom(2_500_000))
parties = decouper_octets(modele, 1_000_000)
for p in parties: chemins[os.path.basename(p)] = p
for nom, contenu in (("massamba-lora-f16.gguf", b"GGUF" + os.urandom(50_000)), ("Modelfile", b'FROM ./massamba-q4_k_m.gguf\\nSYSTEM """Tu es MASSAMBA local."""\\n'), ("Modelfile.adaptateur", b"FROM qwen3:0.6b\\nADAPTER ./massamba-lora-f16.gguf\\n")):
    p = os.path.join(tmp, nom); open(p, "wb").write(contenu); chemins[nom] = p
archive = os.path.join(tmp, "adaptateur.tar.gz")
with tarfile.open(archive, "w:gz") as t:
    data = b'{"r": 16}'; ti = tarfile.TarInfo("massamba-x/peft/adapter_config.json"); ti.size = len(data); t.addfile(ti, io.BytesIO(data))
chemins["adaptateur.tar.gz"] = archive
corps = {"statut": "candidat", "base": "Qwen/Qwen3-0.6B", "revision": "c0ffee", "scores": {"avant": 0.41, "apres": 0.63, "detail": {"reference": {"global": {"n": 64, "score": 0.41}, "anciens": {}, "nouveaux": {}, "controle": {}}, "candidat": {"global": {"n": 64, "score": 0.63}}, "reference_est_base": True}},
         "nb_exemples": n, "rejeu": 0, "reste": 0, "duree_minutes": 46.0, "dernier_id": dernier, "depart": "", "fichiers": sorted(chemins),
         "assemblage": {"massamba-q4_k_m.gguf": {"mode": "octets", "parties": [os.path.basename(p) for p in parties], "sha256": sha256_fichier(modele), "taille": os.path.getsize(modele)}},
         "raisons": [], "run": {"id": "1234567890", "tentative": "1"}}
r = cl.creer_version(corps)
out["candidat"] = {"version": r.get("version"), "urls": sorted(r.get("televersements", {}))}
for nom, url in r["televersements"].items(): cl.televerser(url, chemins[nom])
emp = {nom: sha256_fichier(p) for nom, p in chemins.items()}; tai = {nom: os.path.getsize(p) for nom, p in chemins.items()}
out["publier"] = cl.publier(r["version"], emp, tai)
out["publier2"] = cl.publier(r["version"], emp, tai)
d = cl.derniere()
out["derniere1"] = {k: d.get(k) for k in ("version", "base", "revision", "publiee_le", "reste", "dernier_id", "nb_exemples")}
out["derniere1"]["tentative"] = d.get("derniere_tentative"); out["derniere1"]["n_fichiers"] = len(d.get("fichiers") or {})
recolle = os.path.join(tmp, "recolle.gguf")
out["recolle"] = [cl.telecharger_fichier(d, "massamba-q4_k_m.gguf", recolle), sha256_fichier(recolle) == sha256_fichier(modele)]
out["archive"] = cl.telecharger_fichier(d, "adaptateur.tar.gz", os.path.join(tmp, "a.tar.gz"))
out["compte1"] = cl.compte(dernier)
out["budget1"] = cl.budget()
print(json.dumps(out))
`);
x = await executer("python3", ["-I", pilote], {});
let o: any = null;
try { o = JSON.parse(x.sortie.trim().split("\n").pop() || ""); } catch { /* plus bas */ }
ok(x.code === 0 && o, "client_massamba.py s'exécute de bout en bout contre la fonction", { code: x.code, e: x.err.slice(-800) });
if (o) {
  ok(o.derniere0.version === null && o.derniere0.tentative === null && JSON.stringify(o.derniere0.fichiers) === "{}", "derniere() sans version : version None, pas de tentative", o.derniere0);
  ok(o.compte0.nouveaux === 35 && o.compte0.dernier_id === "000000000035", "compte() : 35 nouveaux, dernier_id triable", o.compte0);
  ok(typeof o.budget0.mois === "string" && o.budget0.minutes === 0, "budget() : mois et minutes", o.budget0);
  ok(o.donnees[0] === 35 && o.donnees[1] === "000000000035", "donnees() : 35 lignes (pages jusqu'à réponse vide), curseur = x-dernier-id", o.donnees);
  ok(o.valides[0] === 35, "chaque ligne passe le validateur de l'atelier (donnees.valider)", o.valides);
  ok(/^\d{8}-\d{6}$/.test(o.rien.version) && JSON.stringify(o.rien.televersements) === "{}", "creer_version(rien_a_faire) : version attribuée, aucun téléversement", o.rien);
  ok(/^\d{8}-\d{6}(-\d+)?$/.test(o.candidat.version) && o.candidat.urls.length === 7, "creer_version(candidat) : une URL par fichier (parties comprises)", o.candidat);
  ok(o.publier.version === o.candidat.version && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(o.publier.publiee_le) && o.publier2.publiee_le === o.publier.publiee_le, "publier() : {version, publiee_le} au format du contrat, idempotent", [o.publier, o.publier2]);
  ok(o.derniere1.version === o.candidat.version && o.derniere1.publiee_le === o.publier.publiee_le && o.derniere1.reste === 0 && o.derniere1.dernier_id === "000000000035" && o.derniere1.n_fichiers === 7 && o.derniere1.tentative.statut === "publiee",
    "derniere() après publication : champs obligatoires de la vérification rapide", o.derniere1);
  ok(o.recolle[0] === true && o.recolle[1] === true && o.archive === true, "telecharger_fichier() : parties d'octets recollées, SHA-256 vérifié ; archive téléchargée", o);
  ok(o.compte1.nouveaux === 0, "compte(dernier_id) après l'entraînement : rien de nouveau");
  ok(o.budget1.minutes === 47.5 && o.budget1.seances === 2, "budget() : toutes les séances comptent (1,5 + 46 min)", o.budget1);
}
ok(journal.filter((l) => l.startsWith("PUT ")).every((l) => / application\/octet-stream true$/.test(l)), "PUT sur les URL signées : octets bruts, x-upsert", journal.filter((l) => l.startsWith("PUT ")).slice(0, 2));

// 3. Vérification rapide après publication : publiée à l'instant, aucun nouvel exemple → ne pas entraîner
const sortie2 = join(dossier, "sortie2.txt");
x = await executer("bash", [join(DEPOT, "scripts/verifier_rapide.sh")], { MASSAMBA_API: API, ACTIONS_ID_TOKEN_REQUEST_URL: BASE_URL + "/oidc?api-version=2.0", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "porteur-test", GITHUB_OUTPUT: sortie2 });
const o2 = existsSync(sortie2) ? readFileSync(sortie2, "utf8") : "";
ok(x.code === 0 && /entrainer=non/.test(o2) && /aucun nouvel exemple/.test(o2), "verifier_rapide.sh après publication : aucun nouvel exemple → ne pas entraîner", { o2, s: x.sortie.slice(-300), e: x.err.slice(-300) });

serveur.close();
console.log(`BILAN ${total - echecs}/${total}`);
if (echecs) process.exit(1);
