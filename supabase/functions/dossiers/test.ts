// Tests de la fonction « dossiers » sous Node 22 : node --experimental-strip-types supabase/functions/dossiers/test.ts
import { traiter, nettoyerDonnees, ROLES, EVENEMENTS } from "./index.ts";
import type { Env } from "./index.ts";

let echecs = 0, total = 0;
const ok = (c: unknown, m: string, d?: unknown) => { total++; if (!c) echecs++; console.log((c ? "OK     " : "ÉCHEC  ") + m + (d !== undefined && !c ? " — " + JSON.stringify(d).slice(0, 300) : "")); };
const sha = async (t: string) => { const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))); return [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); };

// Fausse base : dossiers en mémoire
const dossiers: Record<string, any> = {};
const appels: { fn: string; args: any }[] = [];
let passOk = false, limite = true;
const rpcs: Record<string, (a: any) => any> = {
  dossier_creer: (a) => { if (!limite) return { erreur: "trop" }; dossiers[a.p_id] = { id: a.p_id, app: a.p_app, titre: a.p_titre, donnees: a.p_donnees, roles: a.p_roles, statut: "ouvert", ev: [{ type: "creation", auteur: "proprio" }] }; return { id: a.p_id, empreinte: "e0" }; },
  dossier_lire: (a) => { const d = dossiers[a.p_id]; if (!d) return null; const role = Object.entries(d.roles).find(([, h]) => h === a.p_hash)?.[0]; if (!role) return null; return { id: d.id, app: d.app, titre: d.titre, donnees: { ...d.donnees }, statut: d.statut, role, evenements: d.ev }; },
  dossier_lire_interne: (a) => dossiers[a.p_id]?.donnees || null,
  dossier_evenement: (a) => { const d = dossiers[a.p_id]; const role = Object.entries(d.roles).find(([, h]) => h === a.p_hash)?.[0]; if (!role) return null; d.ev.push({ type: a.p_type, auteur: role, donnees: a.p_donnees }); if (a.p_maj) d.donnees = a.p_maj; if (a.p_statut) d.statut = a.p_statut; return { ok: true, role, empreinte: "e" + d.ev.length }; },
  dossier_photo_ajouter: (a) => ({ nom: "photo-1.jpg", sha256: "abc", role: "proprio" }),
  dossier_photo: (a) => ({ nom: a.p_nom, mime: "image/jpeg", b64: btoa("JPEGDATA") }),
  dossier_pass_valide: (a) => ({ valide: passOk }),
  tcv_hit_rate_limit: () => true,
  boutique_reglages: () => ({ openrouter: "sk-or-v1-test" }),
};
let iaCorps: any = null;
const fauxFetch = (async (url: string, init?: any) => {
  if (url.includes("openrouter.ai")) { iaCorps = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ titre: "Tissu wax", produit: "Wax 6 yards", quantite: "20", prix_unitaire: "9 000 F", prix_total: "180 000 F", acompte: "50 000 F", delai: "vendredi", points_flous: "" }) } }] }), { status: 200 }); }
  const fn = url.split("/rpc/")[1]; const args = JSON.parse(init.body); appels.push({ fn, args });
  const r = rpcs[fn] ? rpcs[fn](args) : null;
  return new Response(r === null || r === undefined ? "null" : JSON.stringify(r), { status: 200 });
}) as unknown as typeof fetch;
const env: Env = { url: "https://x.supabase.co", cle: "sb_secret_test", fetch: fauxFetch, now: () => new Date("2026-11-03T20:00:00Z") };
const req = (m: string, chemin: string, corps?: unknown) => new Request("https://x.supabase.co/functions/v1/dossiers" + chemin, { method: m, headers: { "content-type": "application/json" }, body: corps === undefined ? undefined : JSON.stringify(corps) });

// 1. Données
ok(JSON.stringify(nettoyerDonnees({ produit: "Wax", prix: 9000, "Mauvaise Clé": 1, objet: { a: 1 }, ok: true })) === '{"produit":"Wax","prix":9000,"ok":true}', "données : clés et types filtrés");
ok(ROLES.accord.join() === "proprio,partie" && ROLES.colis.join() === "proprio,livreur,destinataire", "rôles par application");

// 2. AccordAI : création, lien de l'autre partie, confirmation, correction, historique
let r = await traiter(req("POST", "/creer", { app: "accord", titre: "Commande de tissu", donnees: { produit: "Wax", prix_total: "180 000 F" } }), env);
const a = await r.json();
ok(r.status === 201 && /^D-[0-9A-Z]{10}$/.test(a.id) && a.jetons.proprio && a.jetons.partie && !a.premium, "accord créé : liens du propriétaire et de l'autre partie", a);
const cr = appels.find((x) => x.fn === "dossier_creer")!;
ok(cr.args.p_roles.proprio === await sha(a.jetons.proprio) && !JSON.stringify(cr.args).includes(a.jetons.partie), "base : seules les empreintes des liens sont gardées");
r = await traiter(req("GET", `/${a.id}?t=${a.jetons.partie}`), env);
const lu = (await r.json()).dossier;
ok(r.status === 200 && lu.role === "partie" && lu.donnees.produit === "Wax", "l'autre partie lit le dossier avec son lien");
r = await traiter(req("GET", `/${a.id}?t=${"x".repeat(32)}`), env);
ok(r.status === 404, "lien inconnu : 404");
r = await traiter(req("POST", `/${a.id}/evenement`, { t: a.jetons.partie, type: "confirmation", donnees: { commentaire: "D'accord" } }), env);
ok(r.status === 201 && dossiers[a.id].statut === "confirme", "confirmation de l'autre partie : statut « confirmé »");
r = await traiter(req("POST", `/${a.id}/evenement`, { t: a.jetons.partie, type: "modification", maj: { prix_total: "1 F" } }), env);
ok(r.status === 403 && dossiers[a.id].donnees.prix_total === "180 000 F", "l'autre partie ne peut pas modifier les données (seulement proposer une correction)");
r = await traiter(req("POST", `/${a.id}/evenement`, { t: a.jetons.partie, type: "correction", donnees: { prix_total: "170 000 F", commentaire: "remise convenue" } }), env);
ok(r.status === 201 && dossiers[a.id].statut === "a_revoir" && dossiers[a.id].donnees.prix_total === "180 000 F", "correction proposée : dossier « à revoir », données inchangées");
r = await traiter(req("POST", `/${a.id}/evenement`, { t: a.jetons.proprio, type: "acceptation", donnees: {}, maj: { produit: "Wax", prix_total: "170 000 F" } }), env);
ok(r.status === 201 && dossiers[a.id].donnees.prix_total === "170 000 F" && dossiers[a.id].statut === "confirme", "le propriétaire accepte la correction : données mises à jour");

// 3. Extraction par l'IA : pass requis
r = await traiter(req("POST", "/extraire", { texte: "Je te prends 20 wax à 9000", pass: { o: "TCV-ABCDEFGH", t: "j".repeat(32) } }), env);
ok(r.status === 402, "extraction sans pass valide : refusée (402)");
passOk = true;
r = await traiter(req("POST", "/extraire", { texte: "Je te prends 20 wax à 9000, acompte 50000, livraison vendredi", photos: ["data:image/jpeg;base64,/9j/AAAA"], pass: { o: "TCV-ABCDEFGH", t: "j".repeat(32) } }), env);
const ex = await r.json();
ok(r.status === 200 && ex.accord.prix_total === "180 000 F" && ex.accord.quantite === "20", "extraction avec pass : champs de l'accord", ex);
ok(Array.isArray(iaCorps.messages[1].content) && iaCorps.messages[1].content[1].image_url.url.startsWith("data:image/jpeg") && /UNIQUEMENT ce qui y est dit/.test(iaCorps.messages[0].content), "extraction : photos jointes, consigne « ne rien inventer »");

// 4. ColisPreuve : code de remise vérifié, rôles
passOk = false;
r = await traiter(req("POST", "/creer", { app: "colis", titre: "Commande 0412", donnees: { client: "Fatou", quartier: "Liberté 6" }, code_remise: "4821" }), env);
const c = await r.json();
ok(r.status === 201 && c.jetons.livreur && c.jetons.destinataire && dossiers[c.id].donnees.code_remise_empreinte && !JSON.stringify(dossiers[c.id].donnees).includes("4821"), "colis créé : liens livreur et destinataire, code de remise jamais en clair");
r = await traiter(req("GET", `/${c.id}?t=${c.jetons.livreur}`), env);
ok(!("code_remise_empreinte" in (await r.json()).dossier.donnees), "le livreur ne voit pas l'empreinte du code");
r = await traiter(req("POST", `/${c.id}/evenement`, { t: c.jetons.destinataire, type: "livraison" }), env);
ok(r.status === 403, "le destinataire ne peut pas déclarer la livraison");
r = await traiter(req("POST", `/${c.id}/evenement`, { t: c.jetons.livreur, type: "livraison", code_remise: "0000" }), env);
ok(r.status === 400 && dossiers[c.id].statut !== "livre", "livraison avec un mauvais code : refusée");
r = await traiter(req("POST", `/${c.id}/evenement`, { t: c.jetons.livreur, type: "livraison", code_remise: "4821", donnees: { lieu: "Liberté 6" } }), env);
ok(r.status === 201 && dossiers[c.id].statut === "livre" && dossiers[c.id].ev.at(-1).donnees.code_verifie === true, "livraison avec le bon code : « livré », code vérifié noté");
r = await traiter(req("POST", `/${c.id}/evenement`, { t: c.jetons.destinataire, type: "reception", donnees: { commentaire: "Bien reçu" } }), env);
ok(r.status === 201 && dossiers[c.id].statut === "recu", "réception confirmée par le destinataire");
r = await traiter(req("POST", `/${c.id}/photo`, { t: c.jetons.proprio, photo: "data:image/jpeg;base64,/9j/" + "A".repeat(1000), legende: "Colis avant départ" }), env);
ok(r.status === 201 && (await r.json()).photo === "photo-1.jpg" && dossiers[c.id].ev.at(-1).type === "preuve", "photo de preuve ajoutée et inscrite à l'historique");
r = await traiter(req("GET", `/${c.id}/photos/photo-1.jpg?t=${c.jetons.destinataire}`), env);
ok(r.status === 200 && r.headers.get("content-type") === "image/jpeg", "photo visible avec un lien du dossier");
limite = false;
r = await traiter(req("POST", "/creer", { app: "colis", titre: "Encore un", donnees: {} }), env);
ok(r.status === 429 && /pass/.test((await r.json()).message), "limite gratuite atteinte : message clair vers le pass");
ok(EVENEMENTS.colis.livreur.includes("livraison") && !EVENEMENTS.colis.destinataire.includes("livraison"), "événements permis par rôle");

console.log(`BILAN ${total - echecs}/${total}`);
if (echecs) process.exit(1);
