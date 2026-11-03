// Tests de la fonction « dossiers » sous Node 22 : node --experimental-strip-types supabase/functions/dossiers/test.ts
import { traiter, nettoyerDonnees, ROLES, EVENEMENTS, PASS, STATUTS_APP, statutApres, MAX_EVENEMENTS, maxEvenements, empreinteCode } from "./index.ts";
import { readFileSync } from "node:fs";
import type { Env } from "./index.ts";

let echecs = 0, total = 0;
const ok = (c: unknown, m: string, d?: unknown) => { total++; if (!c) echecs++; console.log((c ? "OK     " : "ÉCHEC  ") + m + (d !== undefined && !c ? " — " + JSON.stringify(d).slice(0, 300) : "")); };
const sha = async (t: string) => { const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))); return [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); };

// Fausse base : dossiers en mémoire
const dossiers: Record<string, any> = {};
const appels: { fn: string; args: any }[] = [];
let passOk = false, limite = true, rythmeOk = true, plein = false;
const cles: string[] = [], compteurs: Record<string, number> = {};
const POIVRE = "9f".repeat(32);
const rpcs: Record<string, (a: any) => any> = {
  dossier_creer: (a) => { if (!limite) return { erreur: "trop" }; dossiers[a.p_id] = { id: a.p_id, app: a.p_app, titre: a.p_titre, donnees: a.p_donnees, roles: a.p_roles, statut: "ouvert", ev: [{ id: 1, type: "creation", auteur: "proprio", donnees: a.p_donnees, empreinte: "e1" }] }; return { id: a.p_id, empreinte: "e1" }; },
  dossier_lire: (a) => { const d = dossiers[a.p_id]; if (!d) return null; const role = Object.entries(d.roles).find(([, h]) => h === a.p_hash)?.[0]; if (!role) return null; return { id: d.id, app: d.app, titre: d.titre, donnees: { ...d.donnees }, statut: d.statut, role, evenements: d.ev }; },
  dossier_lire_interne: (a) => dossiers[a.p_id]?.donnees || null,
  dossier_evenement: (a) => { if (plein) return { erreur: "plein" }; const d = dossiers[a.p_id]; const role = Object.entries(d.roles).find(([, h]) => h === a.p_hash)?.[0]; if (!role) return null; d.ev.push({ id: d.ev.length + 1, type: a.p_type, auteur: role, donnees: a.p_donnees, le: a.p_now, empreinte: "e" + (d.ev.length + 1) }); if (a.p_maj) d.donnees = a.p_maj; if (a.p_statut) d.statut = a.p_statut; return { ok: true, role, empreinte: "e" + d.ev.length }; },
  dossier_photo_ajouter: (a) => ({ nom: "photo-1.jpg", sha256: "abc", role: "proprio" }),
  dossier_photo: (a) => ({ nom: a.p_nom, mime: "image/jpeg", b64: btoa("JPEGDATA") }),
  dossier_pass_valide: (a) => ({ valide: passOk }),
  tcv_hit_rate_limit: (a) => { cles.push(a.p_key); compteurs[a.p_key] = (compteurs[a.p_key] || 0) + 1; return rythmeOk && compteurs[a.p_key] <= a.p_max; },
  dossier_poivre: () => POIVRE,
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
const vueLivreur = JSON.stringify(await r.json());
ok(!/_empreinte/.test(vueLivreur) && !vueLivreur.includes(dossiers[c.id].donnees.code_remise_empreinte), "le livreur ne voit l'empreinte du code nulle part (données ni historique)", vueLivreur);
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

// Tontine : organisateur et membres (lien commun)
limite = true;
r = await traiter(req("POST", "/creer", { app: "tontine", titre: "Tontine des amies de Grand Yoff", donnees: { cotisation: 10000, frequence: "mensuelle", membres: "Awa, Fatou, Mariama, Ndèye" } }), env);
const tt = await r.json();
ok(r.status === 201 && tt.jetons.proprio && tt.jetons.membre && !tt.jetons.partie, "tontine créée : lien de l'organisatrice et lien commun des membres");
r = await traiter(req("POST", `/${tt.id}/evenement`, { t: tt.jetons.membre, type: "versement_declare", donnees: { membre: "Fatou", montant: 10000, mois: "novembre" } }), env);
ok(r.status === 201, "un membre déclare son versement");
r = await traiter(req("POST", `/${tt.id}/evenement`, { t: tt.jetons.membre, type: "versement_recu", donnees: { membre: "Fatou" } }), env);
ok(r.status === 403, "seule l'organisatrice confirme un versement");
r = await traiter(req("POST", `/${tt.id}/evenement`, { t: tt.jetons.proprio, type: "tour", donnees: { beneficiaire: "Awa", mois: "novembre" } }), env);
ok(r.status === 201 && dossiers[tt.id].statut === "en_cours", "tour attribué : tontine « en cours »");

// Rendez-vous Pro, Chantier Clair, Lot Tracé : rôles, pass, statuts
ok(ROLES.rdv.join() === "proprio,client" && ROLES.chantier.join() === "proprio,chef,temoin" && ROLES.trace.join() === "proprio,transporteur,acheteur", "rôles de Rendez-vous Pro, Chantier Clair et Lot Tracé");
ok(PASS.rdv.join() === "pass-rendez-vous-pro-1-mois,pass-rendez-vous-pro-12-mois" && PASS.chantier.join() === "pass-chantier-clair-12-mois" && PASS.trace.join() === "pass-lot-trace-12-mois", "slugs des pass des trois applications");
ok(statutApres("accord", "cloture") === "clos" && statutApres("chantier", "cloture") === "termine" && statutApres("tontine", "tour") === "en_cours" && statutApres("colis", "prise_en_charge") === "chez_livreur" &&
  statutApres("trace", "prise_en_charge") === "en_transport" && statutApres("chantier", "tour") === null && statutApres("rdv", "livraison") === null, "statuts propres à chaque application, table commune inchangée");
for (const app of ["rdv", "chantier", "trace"]) {
  appels.length = 0; passOk = true;
  r = await traiter(req("POST", "/pass", { app, pass: { o: "TCV-ABCDEFGH", t: "j".repeat(32) } }), env);
  const v = await r.json(), ap = appels.find((x) => x.fn === "dossier_pass_valide");
  ok(r.status === 200 && v.valide === true && ap?.args.p_produits.join() === PASS[app].join(), `pass ${app} : vérifié contre ses seuls produits`, ap?.args);
}
passOk = false;
r = await traiter(req("POST", "/pass", { app: "rdv", pass: {} }), env);
ok(r.status === 200 && (await r.json()).valide === false, "pass rdv vide : non valide");

// Rendez-vous Pro : page publique, demandes, réponses du professionnel
passOk = true; appels.length = 0;
r = await traiter(req("POST", "/creer", { app: "rdv", titre: "Salon Awa Coiffure", donnees: { activite: "coiffure", pas: 30, h_lun: "09:00-13:00,15:00-19:00" }, pass: { o: "TCV-ABCDEFGH", t: "j".repeat(32) } }), env);
const rv = await r.json();
ok(r.status === 201 && rv.premium === true && rv.jetons.proprio && rv.jetons.client && Object.keys(rv.jetons).length === 2 && appels.find((x) => x.fn === "dossier_creer")?.args.p_premium === true, "page de rendez-vous créée (pass) : lien du professionnel + lien public des clients", rv);
passOk = false; limite = false;
r = await traiter(req("POST", "/creer", { app: "chantier", titre: "Maison de Keur Massar", donnees: {} }), env);
ok(r.status === 429 && /pass/.test((await r.json()).message), "chantier : limite gratuite de création, message vers le pass");
limite = true;
const code = "c".repeat(24);
const demande = { nom: "Fatou Ndiaye", telephone: "77 123 45 67", service: "Tresses", prix: 10000, date: "2026-11-05", heure: "10:00", duree: 120, note: "cheveux longs" };
r = await traiter(req("POST", `/${rv.id}/evenement`, { t: rv.jetons.client, type: "demande", donnees: demande }), env);
ok(r.status === 400, "demande sans code du téléphone : refusée");
r = await traiter(req("POST", `/${rv.id}/evenement`, { t: rv.jetons.client, type: "demande", code, donnees: { nom: "F", date: "demain", heure: "10h" } }), env);
ok(r.status === 400, "demande sans jour, heure ou nom valables : refusée");
cles.length = 0;
r = await traiter(req("POST", `/${rv.id}/evenement`, { t: rv.jetons.client, type: "demande", code, donnees: { ...demande, verif: "triche" } }), env);
const dm = await r.json(), evDem = dossiers[rv.id].ev.at(-1);
ok(r.status === 201 && dossiers[rv.id].statut === "en_attente" && evDem.donnees.verif === await sha("rdv:" + code) && !JSON.stringify(evDem.donnees).includes(code) && cles.some((k) => k.startsWith("dos-rdv:" + rv.id + ":")),
  "demande du client : « en attente », code gardé en empreinte seulement, limite par adresse IP", evDem);
r = await traiter(req("GET", `/${rv.id}?t=${rv.jetons.client}`), env);
const vc = (await r.json()).dossier, evc = vc.evenements.find((e: any) => e.type === "demande");
ok(vc.role === "client" && vc.donnees.h_lun && evc.donnees.date === "2026-11-05" && evc.donnees.heure === "10:00" && evc.donnees.duree === 120 && evc.empreinte === dm.empreinte &&
  !/Fatou|77 123|cheveux|verif|Tresses/.test(JSON.stringify(vc.evenements)), "lien public : créneaux pris visibles, jamais le nom, le numéro, la note ni l'empreinte du code", vc.evenements);
r = await traiter(req("GET", `/${rv.id}?t=${rv.jetons.proprio}`), env);
const vp = (await r.json()).dossier;
ok(vp.role === "proprio" && vp.evenements.some((e: any) => e.donnees && e.donnees.nom === "Fatou Ndiaye" && e.donnees.telephone === "77 123 45 67"), "le professionnel voit le nom et le numéro laissés par le client");
for (const [type, st] of [["confirmation", "confirme"], ["report", "reporte"], ["refus", "refuse"], ["annulation", "annule"]]) {
  r = await traiter(req("POST", `/${rv.id}/evenement`, { t: rv.jetons.proprio, type, donnees: { demande: dm.empreinte, date: "2026-11-06", heure: "11:00" } }), env);
  ok(r.status === 201 && dossiers[rv.id].statut === st, `rdv : ${type} du professionnel → « ${st} »`);
}
r = await traiter(req("POST", `/${rv.id}/evenement`, { t: rv.jetons.client, type: "confirmation", code, donnees: { demande: dm.empreinte } }), env);
ok(r.status === 403, "le lien public ne confirme pas un rendez-vous");
r = await traiter(req("POST", `/${rv.id}/evenement`, { t: rv.jetons.client, type: "annulation", code: "x".repeat(24), donnees: { demande: dm.empreinte } }), env);
ok(r.status === 403 && dossiers[rv.id].ev.at(-1).auteur === "proprio", "annulation par une autre personne (mauvais code) : refusée");
r = await traiter(req("POST", `/${rv.id}/evenement`, { t: rv.jetons.client, type: "annulation", code, donnees: { demande: "e999" } }), env);
ok(r.status === 403, "annulation d'une demande inconnue : refusée");
r = await traiter(req("POST", `/${rv.id}/evenement`, { t: rv.jetons.client, type: "annulation", code, donnees: { demande: dm.empreinte } }), env);
ok(r.status === 201 && dossiers[rv.id].statut === "annule" && dossiers[rv.id].ev.at(-1).auteur === "client", "le client annule sa propre demande avec le code de son téléphone");
r = await traiter(req("POST", `/${rv.id}/evenement`, { t: rv.jetons.client, type: "note", code, donnees: { demande: dm.empreinte, texte: "Je serai en retard" } }), env);
ok(r.status === 201, "le client ajoute une note à sa demande");
r = await traiter(req("GET", `/${rv.id}?t=${rv.jetons.client}`), env);
ok(!/en retard/.test(JSON.stringify((await r.json()).dossier)), "les notes restent invisibles sur le lien public");
r = await traiter(req("POST", `/${rv.id}/evenement`, { t: rv.jetons.client, type: "modification", code, maj: { activite: "x" } }), env);
ok(r.status === 403 && dossiers[rv.id].donnees.activite === "coiffure", "le lien public ne modifie pas la page");
r = await traiter(req("POST", `/${rv.id}/evenement`, { t: rv.jetons.proprio, type: "modification", donnees: {}, maj: { activite: "coiffure", h_lun: "08:00-12:00" } }), env);
ok(r.status === 201 && dossiers[rv.id].donnees.h_lun === "08:00-12:00", "le professionnel modifie ses horaires");
rythmeOk = false;
r = await traiter(req("POST", `/${rv.id}/evenement`, { t: rv.jetons.client, type: "demande", code, donnees: demande }), env);
ok(r.status === 429, "trop de demandes depuis la même adresse : 429");
rythmeOk = true;
const jpeg = "data:image/jpeg;base64,/9j/" + "A".repeat(1000);
r = await traiter(req("POST", `/${rv.id}/photo`, { t: rv.jetons.client, photo: jpeg }), env);
ok(r.status === 403, "pas de photo sur une page de rendez-vous");

// Chaque rôle n'a que ses actions ; chaque statut est appliqué (les trois applications)
const essais: Record<string, any> = {};
for (const app of ["rdv", "chantier", "trace"]) {
  r = await traiter(req("POST", "/creer", { app, titre: "Essai " + app, donnees: {} }), env);
  const x = essais[app] = await r.json();
  const tous = [...new Set(Object.values(EVENEMENTS[app]).flat())];
  const fautes: string[] = []; let n = 0;
  const codeX = "k".repeat(20);
  let ref = "";
  if (app === "rdv") ref = (await (await traiter(req("POST", `/${x.id}/evenement`, { t: x.jetons.client, type: "demande", code: codeX, donnees: { nom: "Awa", date: "2026-11-07", heure: "09:00" } }), env)).json()).empreinte;
  for (const role of ROLES[app]) for (const type of tous) {
    const permis = EVENEMENTS[app][role].includes(type);
    const corps: any = { t: x.jetons[role], type, donnees: app === "rdv" ? { demande: ref, nom: "Awa", date: "2026-11-07", heure: "09:30" } : { texte: "essai" } };
    if (app === "rdv" && role === "client") corps.code = codeX;
    const rr = await traiter(req("POST", `/${x.id}/evenement`, corps), env);
    n++;
    if (rr.status !== (permis ? 201 : 403)) fautes.push(`${role}/${type} : ${rr.status}`);
    else if (permis && STATUTS_APP[app][type] && dossiers[x.id].statut !== STATUTS_APP[app][type]) fautes.push(`statut après ${type} : ${dossiers[x.id].statut}`);
  }
  ok(!fautes.length && n === ROLES[app].length * tous.length, `${app} : chaque rôle n'a que ses actions (${n} essais) et chaque statut est appliqué`, fautes);
}
r = await traiter(req("POST", `/${essais.chantier.id}/photo`, { t: essais.chantier.jetons.temoin, photo: jpeg, legende: "Dalle coulée" }), env);
const r2 = await traiter(req("POST", `/${essais.chantier.id}/photo`, { t: essais.chantier.jetons.proprio, photo: jpeg }), env);
ok(r.status === 201 && r2.status === 403, "chantier : le témoin ajoute une photo, pas la personne qui paie (pas de « preuve »)");
r = await traiter(req("POST", `/${essais.trace.id}/photo`, { t: essais.trace.jetons.transporteur, photo: jpeg }), env);
ok(r.status === 201, "lot tracé : le transporteur ajoute une photo");
r = await traiter(req("POST", `/${essais.trace.id}/photo`, { t: essais.trace.jetons.acheteur, photo: jpeg, legende: "Caisses abîmées à la réception" }), env);
ok(r.status === 201 && dossiers[essais.trace.id].ev.at(-1).auteur === "acheteur" && dossiers[essais.trace.id].ev.at(-1).type === "preuve", "lot tracé : l'acheteur joint une photo à ses réserves");
r = await traiter(req("POST", `/${c.id}/photo`, { t: c.jetons.destinataire, photo: jpeg }), env);
ok(r.status === 201, "colis : comportement inchangé (photo du destinataire acceptée)");

// ColisPreuve : code de remise protégé (empreinte jamais renvoyée, HMAC avec poivre, essais limités)
const hmac = async (cle: string, msg: string) => { const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(cle), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)))].map((x) => x.toString(16).padStart(2, "0")).join(""); };
r = await traiter(req("POST", "/creer", { app: "colis", titre: "Commande 0501", donnees: { client: "Awa", code_schema: 1, faux_empreinte: "x" }, code_remise: "7310" }), env);
const k1 = await r.json();
const dk = dossiers[k1.id].donnees;
ok(dk.code_schema === 2 && dk.code_remise_empreinte === await hmac(POIVRE, k1.id + ":7310") && dk.code_remise_empreinte !== await sha("code:7310") && !("faux_empreinte" in dk) &&
  dk.code_remise_empreinte === await empreinteCode(env, k1.id, "7310"), "nouveau colis : empreinte HMAC-SHA256(poivre, id:code), schéma 2, clés imposées par le téléphone écartées", dk);
const reponses: string[] = [JSON.stringify(k1)];
for (const role of ["proprio", "livreur", "destinataire"]) {
  r = await traiter(req("GET", `/${k1.id}?t=${k1.jetons[role]}`), env);
  reponses.push(JSON.stringify(await r.json()));
}
ok(reponses.every((t) => !/_empreinte/.test(t) && !t.includes(dk.code_remise_empreinte) && !t.includes(POIVRE)) && /"code_schema":2/.test(reponses[1]),
  "aucune réponse ne contient d'empreinte secrète (même l'événement de création) ni le poivre");
r = await traiter(req("POST", `/${k1.id}/evenement`, { t: k1.jetons.proprio, type: "modification", donnees: {}, maj: { client: "Awa D.", code_schema: 1, code_remise_empreinte: await sha("code:0000") } }), env);
ok(r.status === 201 && dossiers[k1.id].donnees.client === "Awa D." && dossiers[k1.id].donnees.code_schema === 2 && dossiers[k1.id].donnees.code_remise_empreinte === dk.code_remise_empreinte,
  "modification : empreinte et schéma repris de la base (ni perdus, ni remplacés, ni rétrogradés)");
appels.length = 0;
r = await traiter(req("POST", `/${k1.id}/evenement`, { t: k1.jetons.livreur, type: "livraison", code_remise: "0000" }), env);
const ordre = appels.map((x) => x.fn + (x.fn === "tcv_hit_rate_limit" ? ":" + x.args.p_key + ":" + x.args.p_max + ":" + x.args.p_window_seconds : ""));
ok(r.status === 400 && ordre.indexOf("tcv_hit_rate_limit:dos-code:" + k1.id + ":10:86400") > -1 && ordre.indexOf("tcv_hit_rate_limit:dos-code:" + k1.id + ":10:86400") < ordre.lastIndexOf("dossier_lire_interne"),
  "essai de code compté (10 par 24 h) AVANT la comparaison", ordre);
for (let i = 0; i < 8; i++) await traiter(req("POST", `/${k1.id}/evenement`, { t: k1.jetons.livreur, type: "livraison", code_remise: String(1000 + i) }), env);
r = await traiter(req("POST", `/${k1.id}/evenement`, { t: k1.jetons.livreur, type: "livraison", code_remise: "7310" }), env);
ok(r.status === 201 && dossiers[k1.id].statut === "livre", "10e essai avec le bon code : livraison acceptée (schéma 2)");
r = await traiter(req("POST", `/${k1.id}/evenement`, { t: k1.jetons.livreur, type: "livraison", code_remise: "7310" }), env);
const bloque = await r.json();
ok(r.status === 429 && /24 heures/.test(bloque.message) && dossiers[k1.id].ev.filter((e: any) => e.type === "livraison").length === 1, "au-delà de 10 essais en 24 h : refusé même avec le bon code, message clair", bloque);
// Ancien dossier (schéma 1, sans « code_schema ») : le code reste vérifié comme avant
const ancienJeton = "l".repeat(32), ancienId = "D-ANC1ENNE00".replace(/[^0-9A-HJKMNP-TV-Z-]/g, "0");
dossiers[ancienId] = { id: ancienId, app: "colis", titre: "Ancien colis", donnees: { client: "Fatou", code_remise_empreinte: await sha("code:4821") }, roles: { proprio: "x", livreur: await sha(ancienJeton), destinataire: "y" }, statut: "ouvert", ev: [{ id: 1, type: "creation", auteur: "proprio", donnees: { code_remise_empreinte: await sha("code:4821") }, empreinte: "e1" }] };
r = await traiter(req("POST", `/${ancienId}/evenement`, { t: ancienJeton, type: "livraison", code_remise: "1111" }), env);
const r2b = await traiter(req("POST", `/${ancienId}/evenement`, { t: ancienJeton, type: "livraison", code_remise: "4821" }), env);
r = await traiter(req("GET", `/${ancienId}?t=${ancienJeton}`), env);
ok(r2b.status === 201 && dossiers[ancienId].statut === "livre" && !/_empreinte/.test(JSON.stringify(await r.json())), "ancien colis (schéma 1) : bon code accepté, mauvais refusé, empreinte jamais renvoyée");

// Nombre d'actions par dossier : même table dans la fonction Edge et dans la fonction SQL (migration)
ok(maxEvenements("tontine") === 3000 && maxEvenements("chantier") === 3000 && maxEvenements("rdv") === 1500 &&
  ["accord", "colis", "trace"].every((a) => maxEvenements(a) === 400), "plafond par application : tontine et chantier 3 000, rdv 1 500, accord/colis/trace 400");
const sql = readFileSync(new URL("../../migrations/20261104000016_dossiers_rdv_chantier_trace.sql", import.meta.url), "utf8");
const casSql = sql.match(/case v_d\.app ((?:when '\w+' then \d+ )+)else (\d+) end/);
const tableSql: Record<string, number> = {};
for (const w of (casSql?.[1] || "").matchAll(/when '(\w+)' then (\d+)/g)) tableSql[w[1]] = +w[2];
ok(casSql && +casSql[2] === 400 && JSON.stringify(tableSql) === JSON.stringify(MAX_EVENEMENTS) && /'dos-ev:' \|\| p_id, 86400, 300/.test(sql) && !/delete/i.test(sql),
  "migration : mêmes plafonds que la fonction Edge, 300 par jour inchangé, sans le mot DELETE", { tableSql, MAX_EVENEMENTS });
plein = true;
r = await traiter(req("POST", `/${tt.id}/evenement`, { t: tt.jetons.membre, type: "note", donnees: { texte: "x" } }), env);
const rp = await r.json();
r = await traiter(req("POST", `/${a.id}/evenement`, { t: a.jetons.partie, type: "note", donnees: { texte: "x" } }), env);
ok(rp.erreur === "plein" && /3 000 actions/.test(rp.message) && r.status === 409 && /400 actions/.test((await r.json()).message), "dossier plein : 409 avec le plafond de l'application");
plein = false;

console.log(`BILAN ${total - echecs}/${total}`);
if (echecs) process.exit(1);
