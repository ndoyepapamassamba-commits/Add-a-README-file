/* MASSAMBA AI MOTION STUDIO — Autopilote (23/10/2026, « intégrer un autopilot qui fait tout du début à la fin »).
 * Une idée → écriture des plans → consignes → génération de tous les plans (chaîne de secours de moteurs gratuits) →
 * montage (ordre, transitions, sous-titres) → voix off Piper et nappe → export validé (H.264 + AAC par le serveur local
 * quand le navigateur n'a pas l'encodeur), consigne embarquée dans le fichier → rapport chronométré.
 * Voie « troupe » : un sketch du moteur V1 (voix, bouches, rires) tourné sur le serveur local, livré avec sa consigne.
 * Règles tenues : rien de payant ; un plan DÉMO reste marqué DÉMO ; l'idée de l'utilisateur est reprise mot pour mot dans
 * chaque plan et dans le fichier final ; chaque étape dit ce qu'elle a fait et combien de temps elle a pris. */
(function () {
  'use strict';
  var ETAPES = [
    { id: 'ecriture', nom: 'Écriture des plans' },
    { id: 'consignes', nom: 'Consignes de chaque plan' },
    { id: 'generation', nom: 'Génération des plans' },
    { id: 'montage', nom: 'Montage' },
    { id: 'son', nom: 'Voix, musique et sous-titres' },
    { id: 'export', nom: 'Export validé' }
  ];
  // chaîne de secours (règle « cent voies ») : moteurs gratuits essayés l'un après l'autre pour chaque plan
  var CHAINES = { i2v: ['wan22-i2v-rapide', 'ltx23'], t2v: ['ltx23', 'chaine-pollinations-wan', 'ltx-video-distille'] };
  var RYTHME = [
    { role: 'ouverture', plan: 'Plan large', camera: 'Travelling avant lent' },
    { role: 'action', plan: 'Plan moyen', camera: 'Travelling latéral' },
    { role: 'tension', plan: 'Plan rapproché', camera: 'Caméra à l’épaule' },
    { role: 'chute', plan: 'Gros plan', camera: 'Plan fixe' }
  ];
  var NAPPES = { 'Film d’action': 'epique', 'Clip musical': 'pulse', 'Comédie': 'pulse', 'Vidéo sociale verticale': 'pulse' };
  var X = null, J = null;   // contexte fourni par app.js ; état du passage en cours

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sec(ms) { return (ms / 1000).toFixed(1).replace('.', ',') + ' s'; }
  function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function arrete() { if (J && J.arret) throw new Error('Autopilote arrêté par l’utilisateur.'); }
  function sansAccents(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function mots(s) { return sansAccents(s).split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 4; }); }

  // ------------------------------------------------------------------ journal et affichage
  function etape(id, etat, detail) {
    var e = J.etapes[id]; if (!e) return;
    if (etat === 'encours' && !e.t0) e.t0 = Date.now();
    if (/fait|echec|saute/.test(etat)) e.t1 = Date.now();
    e.etat = etat; if (detail != null) e.detail = detail; rendre();
  }
  function rendre() {
    if (!J) return;
    var lib = { attente: 'en attente', encours: 'en cours', fait: 'fait', echec: 'échec', saute: 'sans objet' };
    $('#apEtapes').innerHTML = ETAPES.map(function (s, i) {
      var e = J.etapes[s.id], d = e.t0 ? sec((e.t1 || Date.now()) - e.t0) : '';
      return '<li class="ap-' + e.etat + '"><span class="ap-num">' + (i + 1) + '</span><b>' + esc(s.nom) + '</b><span class="ap-etat">' + lib[e.etat] + (d ? ' · ' + d : '') + '</span>' + (e.detail ? '<small>' + e.detail + '</small>' : '') + '</li>';
    }).join('');
    $('#apPlans').innerHTML = J.plans.length ? '<table class="ap-table"><thead><tr><th>#</th><th>Plan</th><th>Moteur</th><th>État</th><th>Durée</th></tr></thead><tbody>' + J.plans.map(function (p, i) {
      return '<tr><td>' + (i + 1) + '</td><td title="' + esc(p.consigne || '') + '">' + esc(p.plan + ' · ' + p.description).slice(0, 140) + '</td><td>' + esc(p.moteur || '—') + (p.essais && p.essais.length > 1 ? '<br><small>essayés : ' + esc(p.essais.join(' → ')) + '</small>' : '') + '</td><td>' + esc(p.etat || 'en attente') + (p.erreur ? '<br><small>' + esc(p.erreur) + '</small>' : '') + '</td><td>' + (p.ms ? sec(p.ms) : '') + '</td></tr>';
    }).join('') + '</tbody></table>' : '';
    var total = (J.t1 || Date.now()) - J.t0;
    $('#apTotal').textContent = (J.fini ? (J.ok ? 'Terminé en ' : 'Arrêté après ') : 'En cours depuis ') + sec(total);
  }

  // ------------------------------------------------------------------ 1. écriture des plans
  /** écriture par un modèle de texte gratuit (Pollinations, sans compte) ; le résultat est contrôlé, sinon découpage local. */
  async function ecrireIA(idee, n, style) {
    var ctrl = new AbortController(), minut = setTimeout(function () { ctrl.abort(); }, 25000);
    try {
      var cams = Object.keys(X.P.CAMERAS).join(' | ');
      var r = await fetch('https://text.pollinations.ai/openai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ model: 'openai-fast', messages: [
          { role: 'system', content: 'Tu es scénariste de vidéos courtes. Découpe l’idée en exactement ' + n + ' plans successifs, du plan d’ouverture à la chute. Garde les personnages, lieux et objets de l’idée, sans en inventer d’autres. Réponds UNIQUEMENT par un objet JSON : {"plans":[{"description":"ce qu’on voit, en français","action":"le mouvement principal","decor":"le lieu","camera":"une valeur parmi : ' + cams + '","plan":"Plan large | Plan moyen | Plan rapproché | Gros plan | Plan d’ensemble","narration":"une phrase courte en français pour la voix off"}]}' },
          { role: 'user', content: 'Idée : ' + idee + (style ? '\nStyle : ' + style : '') }] }) });
      if (!r.ok) throw new Error('service de texte : ' + r.status);
      var j = await r.json(), t = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      var m = /\{[\s\S]*\}/.exec(String(t || '')); if (!m) throw new Error('réponse sans JSON');
      var l = (JSON.parse(m[0]).plans || []).filter(function (p) { return p && typeof p.description === 'string' && p.description.trim(); }).slice(0, n);
      if (l.length < Math.min(n, 2)) throw new Error('moins de deux plans exploitables');
      return l.map(function (p, i) { var rb = RYTHME[i === 0 ? 0 : i === l.length - 1 ? 3 : 1 + ((i - 1) % 2)];
        return { description: p.description.trim(), action: String(p.action || '').trim(), decor: String(p.decor || '').trim(),
          camera: X.P.CAMERAS[p.camera] ? p.camera : rb.camera, plan: /^(Plan large|Plan moyen|Plan rapproché|Gros plan|Plan d’ensemble)$/.test(p.plan) ? p.plan : rb.plan,
          narration: String(p.narration || '').trim(), role: rb.role }; });
    } finally { clearTimeout(minut); }
  }
  /** découpage local (sans réseau) : les phrases de l'idée, réparties sur une grammaire de plans ouverture → chute. */
  function ecrireLocal(idee, n) {
    var ph = String(idee).split(/(?<=[.!?…])\s+|\n+/).map(function (x) { return x.trim(); }).filter(Boolean); if (!ph.length) ph = [String(idee).trim()];
    var l = [], avant = -1;
    for (var i = 0; i < n; i++) {
      var rb = RYTHME[i === 0 ? 0 : i === n - 1 ? 3 : 1 + ((i - 1) % 2)], k = ph.length >= n ? i : Math.min(ph.length - 1, Math.floor(i * ph.length / n));
      l.push({ description: ph[k], action: '', decor: '', camera: rb.camera, plan: rb.plan, narration: k !== avant ? ph[k] : '', role: rb.role }); avant = k;   // une phrase n'est dite qu'une fois
    }
    return l;
  }

  // ------------------------------------------------------------------ 3. génération d'un plan (chaîne de secours)
  async function attendreTache(t) {
    for (;;) {
      if (J.arret) { X.gest.annuler(t.id); throw new Error('Autopilote arrêté par l’utilisateur.'); }
      if (/terminee|echec|annulee/.test(t.etat)) return t;
      var p = J.plans.filter(function (x) { return x.tacheId === t.id; })[0];
      if (p) { p.etat = t.libelle + (t.rang != null ? ' · rang ' + t.rang : '') + (t.progression != null ? ' · ' + Math.round(t.progression * 100) + ' %' : ''); }
      rendre(); await dormir(400);
    }
  }
  async function genererPlan(p, s, o) {
    var chaine = o.voie === 'demo' ? ['demo'] : (s.ref ? CHAINES.i2v : CHAINES.t2v).slice();
    if (o.voie !== 'demo' && o.repliDemo) chaine.push('demo');
    p.essais = []; var t0 = Date.now();
    for (var i = 0; i < chaine.length; i++) {
      arrete();
      var m = X.R.trouver(chaine[i]); if (!m) continue;
      p.essais.push(m.nom); p.moteur = m.nom; p.etat = 'lancement'; rendre();
      s.modeleId = m.id;
      var t = await X.genererScene(s);
      if (!t) { p.erreur = ($('#genErreurs').textContent || 'demande refusée par le moteur').trim(); continue; }
      p.tacheId = t.id; p.erreur = null;
      await attendreTache(t);
      if (t.etat === 'terminee' && t.resultatMediaId) {
        p.etat = 'terminée' + (t.nature === 'demo' ? ' (DÉMO — pas une génération IA)' : ''); p.mediaId = t.resultatMediaId; p.nature = t.nature; p.ms = Date.now() - t0;
        s.choisie = t.resultatMediaId; rendre(); return true;
      }
      p.erreur = t.erreur || t.libelle; p.etat = 'échec, moteur suivant'; rendre();
    }
    p.etat = 'aucun moteur n’a rendu ce plan'; p.ms = Date.now() - t0; rendre(); return false;
  }

  // ------------------------------------------------------------------ voie troupe (moteur V1)
  function choisirSketch(idee) {
    var v1 = X.A.v1; if (!v1 || !v1.sketchs.length) return null;
    // répliques écrites « NOM : texte » dans l'idée → sketch écrit sur la scène dont les acteurs correspondent
    var lignes = String(idee).split(/\n+/).map(function (l) { var m = /^\s*([A-ZÀ-ÖØ-Ý' -]{2,30})\s*:\s*(.+)$/.exec(l); return m ? { qui: m[1].trim().toUpperCase(), texte: m[2].trim() } : null; }).filter(Boolean);
    if (lignes.length >= 2) {
      var noms = lignes.map(function (l) { return l.qui; }), sc = v1.scenes.filter(function (s) { return noms.every(function (n) { return s.acteurs.indexOf(n) >= 0; }); })[0];
      if (sc) return { sketch: { titre: String(idee).split('\n')[0].slice(0, 60).toUpperCase(), image: sc.nom, repliques: lignes.map(function (l, i) { return { qui: l.qui, texte: l.texte, chute: i === lignes.length - 1 }; }) }, raison: 'répliques écrites dans l’idée, scène « ' + sc.nom + ' »' };
    }
    var cible = mots(idee), meilleur = null, score = -1;
    v1.sketchs.forEach(function (s) {
      var bag = mots(s.titre + ' ' + s.image + ' ' + (s.acteurs || []).join(' ') + ' ' + (s.repliques || []).map(function (r) { return r.texte; }).join(' '));
      var n = cible.filter(function (w) { return bag.indexOf(w) >= 0; }).length;
      if (n > score) { score = n; meilleur = s; }
    });
    return { sketch: { id: meilleur.id }, complet: meilleur, raison: score > 0 ? score + ' mot(s) de l’idée retrouvé(s) dans « ' + meilleur.titre + ' »' : 'aucun mot commun : premier sketch de la réserve, « ' + meilleur.titre + ' »' };
  }
  async function voieTroupe(o) {
    etape('ecriture', 'encours');
    if (!X.A.v1) await X.chargerCatalogueV1();
    if (!X.A.v1) throw new Error('Moteur V1 indisponible : lancez le serveur local (docs/GUIDE-INSTALLATION.md).');
    var ch = choisirSketch(o.idee); if (!ch) throw new Error('Aucun sketch dans la réserve du moteur V1.');
    var sk = ch.complet || ch.sketch;
    J.plans = [{ plan: 'Sketch', description: (sk.titre || 'SKETCH') + ' — ' + (sk.repliques || []).length + ' répliques', consigne: '', moteur: 'Moteur V1 (local)' }];
    etape('ecriture', 'fait', esc(ch.raison));
    etape('consignes', 'encours');
    var r = await fetch(X.A.serveur + '/api/v1/controle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sketchs: [ch.sketch] }) });
    var jc = await r.json().catch(function () { return {}; });
    if (!r.ok || !jc.ok) { etape('consignes', 'echec', 'Grille de ton de la V1 : ' + esc((jc.rapport || jc.erreur || r.status + '').toString().slice(-300))); throw new Error('Sketch refusé par la grille de ton de la V1.'); }
    etape('consignes', 'fait', 'Grille de ton de la V1 : conforme');
    etape('generation', 'encours');
    var m = X.R.trouver('moteur-v1'), t = await X.generer(false, null, { m: m, d: { mode: 'v1', sketchs: [ch.sketch], prompt: sk.titre || 'sketch V1', titre: sk.titre } });
    if (!t) throw new Error(($('#genErreurs').textContent || 'tournage refusé').trim());
    J.plans[0].tacheId = t.id; await attendreTache(t);
    if (t.etat !== 'terminee') { J.plans[0].etat = t.libelle; J.plans[0].erreur = t.erreur; etape('generation', 'echec', esc(t.erreur || t.libelle)); throw new Error(t.erreur || 'Tournage V1 en échec.'); }
    J.plans[0].etat = 'terminée'; J.plans[0].ms = t.dureeMs; J.plans[0].mediaId = t.resultatMediaId;
    etape('generation', 'fait', 'Tournage du moteur V1 : ' + sec(t.dureeMs || 0));
    etape('montage', 'encours');
    var med = X.ST.media(t.resultatMediaId); X.ST.S.clips.push(X.ST.nouveauClip(med)); X.ST.snap(); X.ST.renderAll();
    etape('montage', 'fait', 'Sketch placé dans la timeline (' + (med.duree || 0).toFixed(1) + ' s)');
    etape('son', 'saute', 'Voix Piper, bouches, rires, ambiance et sous-titres faits par le moteur V1 dans la vidéo.');
    etape('export', 'encours');
    var nom = 'autopilote-' + X.nomFichier(sk.titre || 'sketch') + '-' + Date.now() + '.mp4';
    var rap = await X.X.valider(med.blob, { duree: med.duree, largeur: med.largeur, hauteur: med.hauteur, fps: 30, ext: 'mp4', aSon: true });
    var relu = window.MAMS.meta ? await window.MAMS.meta.lire(med.blob).catch(function () { return null; }) : null;
    rap.details.push((relu && relu.consigne ? '✔ ' : '✘ ') + 'consigne embarquée et relue dans le fichier');
    X.ST.addResult(nom, med.blob, 'VIDÉO MP4', rap); X.ST.dl(med.blob, nom);
    J.resultat = { blob: med.blob, nom: nom, rapport: rap, chemin: 'MP4 H.264 + AAC du moteur V1 (1080 × 1920)' };
    etape('export', rap.ok ? 'fait' : 'echec', esc(J.resultat.chemin) + '<br>' + rap.details.map(esc).join('<br>'));
  }

  // ------------------------------------------------------------------ voie générative (Spaces gratuits / démo)
  async function voieGenerative(o) {
    // 1. écriture
    etape('ecriture', 'encours');
    var n = Math.max(1, Math.min(12, Math.round(o.duree / o.dureePlan))), plans, source;
    if (o.ecritureIA) { try { plans = await ecrireIA(o.idee, n, o.style); source = 'écrits par un modèle de texte gratuit (Pollinations « openai-fast »), contrôlés'; } catch (e) { plans = null; source = 'découpage local (modèle de texte indisponible : ' + e.message + ')'; } }
    if (!plans) { plans = ecrireLocal(o.idee, n); source = source || 'découpage local de l’idée (ouverture → action → chute)'; }
    arrete();
    J.plans = plans.map(function (p) { return Object.assign({}, p); });
    etape('ecriture', 'fait', plans.length + ' plan(s) ' + esc(source));
    // relecture facultative avant le tournage (veille du 23/10/2026 : les chaînes « script → vidéo » placent une validation
    // après l'écriture ; ici elle est proposée, jamais imposée : l'Autopilote va au bout sans intervention si elle est décochée)
    if (o.relire && !(await X.confirmer('Plans écrits — tourner ?', '<ol>' + J.plans.map(function (p) { return '<li><b>' + esc(p.plan) + '</b> · ' + esc(p.camera) + ' — ' + esc(p.description) + (p.narration ? '<br><i>« ' + esc(p.narration) + ' »</i>' : '') + '</li>'; }).join('') + '</ol>'))) throw new Error('Tournage annulé à la relecture des plans.');
    // 2. consignes (l'idée d'origine reste en tête de chaque consigne)
    etape('consignes', 'encours');
    var ref = o.image ? await X.K.blobVersDataUrl(o.image) : null, scenes = [];
    J.plans.forEach(function (p) {
      var s = X.nouvelleScene(p.description); s.prompt = o.idee + (p.description && p.description !== o.idee ? ' — ' + p.description : ''); s.action = p.action !== p.description ? p.action : '';
      s.decor = p.decor || ''; s.camera = p.camera; s.plan = p.plan; s.duree = o.dureePlan; s.ref = ref; s.dialogue = o.sousTitres ? p.narration : '';
      if (o.persoId) s.persos = [o.persoId];
      s.autopilote = true; X.A.scenes.push(s); scenes.push(s); p.sceneId = s.id; p.consigne = X.promptScene(s);
    });
    if (o.style) scenes.forEach(function (s, i) { s.prompt = X.P.structurer({ idee: s.prompt, preset: o.style }).texte; J.plans[i].consigne = X.promptScene(s); });
    X.rendreScenes(); etape('consignes', 'fait', 'Consignes structurées (action → caméra → décor → style) ; idée reprise mot pour mot en tête de chaque plan.');
    // 3. génération : tous les plans lancés, le gestionnaire en mène deux à la fois (un par service)
    etape('generation', 'encours');
    var res = await Promise.all(J.plans.map(function (p, i) { return genererPlan(p, scenes[i], o).catch(function (e) { p.erreur = e.message; return false; }); }));
    arrete();
    var ok = res.filter(Boolean).length, demo = J.plans.filter(function (p) { return p.nature === 'demo'; }).length;
    if (!ok) { etape('generation', 'echec', 'Aucun plan rendu : quotas épuisés ou services hors ligne. Cochez « repli DÉMO » ou connectez votre compte Hugging Face gratuit (Moteurs IA).'); throw new Error('Aucun plan n’a pu être généré.'); }
    etape('generation', 'fait', ok + ' / ' + J.plans.length + ' plan(s) rendus' + (demo ? ' dont ' + demo + ' en DÉMO (marqués, pas des générations IA)' : ''));
    // 4. montage
    etape('montage', 'encours');
    var gardes = scenes.filter(function (s, i) { return res[i] && s.choisie; });
    X.ST.S.clips = X.ST.S.clips.filter(function (c) { return !c.sceneId || !gardes.some(function (s) { return s.id === c.sceneId; }); });
    X.placerScenes(gardes, true);
    X.ST.S.clips.forEach(function (c) { if (gardes.some(function (s) { return s.id === c.sceneId; })) { c.trans = 'fade'; c.transDur = Math.min(0.4, Math.max(0.1, (c.dur || 1) / 6)); } });
    X.ST.snap(); X.ST.renderAll();
    etape('montage', 'fait', gardes.length + ' plan(s) dans l’ordre du scénario, fondus enchaînés, durée ' + X.ST.total().toFixed(1) + ' s');
    // 5. voix, musique, sous-titres
    etape('son', 'encours');
    var det = [], st = X.ST.starts();
    if (o.sousTitres) det.push(X.ST.S.subs.filter(function (x) { return x.sceneId; }).length + ' sous-titre(s) calés sur les plans');
    if (o.voix) {
      if (X.A.srv && X.A.srv.voix && X.A.srv.voix.piper) {
        var nv = 0;
        for (var i = 0; i < X.ST.S.clips.length; i++) {
          arrete();
          var c = X.ST.S.clips[i], s = gardes.filter(function (x) { return x.id === c.sceneId; })[0], p = s && J.plans.filter(function (x) { return x.sceneId === s.id; })[0];
          if (!p || !p.narration) continue;
          try {
            var r = await fetch(X.A.serveur + '/api/voix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte: p.narration, voix: o.voixId || 'siwis' }) });
            if (!r.ok) throw new Error(r.status);
            if (await X.ST.ajouterPisteAudio(await r.blob(), 'voix-plan-' + (i + 1) + '.wav', 'genere-local', st[i] + 0.2, 0.9)) nv++;
          } catch (e) { det.push('voix du plan ' + (i + 1) + ' impossible (' + e.message + ')'); }
        }
        det.push(nv + ' voix off Piper (locale) posée(s)');
      } else det.push('voix off : serveur local ou Piper absent, film sans voix off');
    }
    if (o.musique) { var g = NAPPES[o.style] || 'calme'; X.ST.S.audio.gen = g; X.ST.S.audio.volGen = 0.14; var sg = $('#selGen'); if (sg) sg.value = g; det.push('nappe « ' + g + ' » synthétisée localement'); }
    X.ST.snap(); X.ST.renderAll();
    etape('son', 'fait', det.map(esc).join(' · ') || 'rien demandé');
    // 6. export validé, consigne embarquée
    etape('export', 'encours');
    var r2 = await X.exporter(function (pr, txt) { etape('export', 'encours', Math.round(pr * 100) + ' % — ' + esc(txt || '')); }, champsAutopilote(o));
    J.resultat = r2;
    etape('export', r2.rapport.ok ? 'fait' : 'echec', esc(r2.chemin) + '<br>' + r2.rapport.details.map(esc).join('<br>'));
    X.ST.dl(r2.blob, r2.nom);
  }
  function champsAutopilote(o) {
    var c = X.champsMontage();
    c.titre = o.titre || X.A.nomProjet; c.consigne = 'Idée : ' + o.idee + '\n' + c.consigne;
    c.description = 'Film fait par l’Autopilote de MASSAMBA AI Motion Studio — ' + c.description;
    c.massamba.type = 'autopilote'; c.massamba.idee = o.idee; c.massamba.consigne = c.consigne;
    c.massamba.reglages = { voie: o.voie, dureeCible: o.duree, format: o.format, style: o.style || null, voix: o.voix, sousTitres: o.sousTitres, musique: o.musique };
    c.massamba.plansEcrits = J.plans.map(function (p) { return { plan: p.plan, description: p.description, camera: p.camera, narration: p.narration || null, consigne: p.consigne || null, moteur: p.moteur || null, essais: p.essais || [], nature: p.nature || null }; });
    return c;
  }

  // ------------------------------------------------------------------ pilote
  async function lancer() {
    if (J && !J.fini) return;
    var o = { idee: $('#apIdee').value.trim(), voie: $('#apVoie').value, duree: Math.max(2, Math.min(60, parseFloat($('#apDuree').value) || 12)), format: $('#apFormat').value,
      style: $('#apStyle').value, image: $('#apImage').files[0] || null, persoId: $('#apPerso').value || null, voix: $('#apVoix').checked, sousTitres: $('#apSousTitres').checked,
      musique: $('#apMusique').checked, repliDemo: $('#apRepliDemo').checked, ecritureIA: $('#apEcritureIA').checked, relire: $('#apRelire').checked, titre: $('#apIdee').value.trim().split(/[.!?\n]/)[0].slice(0, 60) };
    $('#apErreur').textContent = '';
    if (!o.idee) { $('#apErreur').textContent = 'Écrivez votre idée.'; return; }
    if (o.voie === 'auto') o.voie = X.A.demo ? 'demo' : 'ia';
    if (o.voie === 'demo' && !X.A.demo) o.repliDemo = true;
    o.dureePlan = o.voie === 'troupe' ? 0 : o.image ? 4 : 3;
    if (X.ST.S.clips.length && !(await X.confirmer('Autopilote', '<p>Le montage contient déjà ' + X.ST.S.clips.length + ' plan(s). L’Autopilote ajoute son film à la suite des scènes existantes du storyboard et remplace la timeline par son montage. Continuer ?</p>'))) return;
    J = { t0: Date.now(), etapes: {}, plans: [], arret: false, fini: false, ok: false };
    ETAPES.forEach(function (s) { J.etapes[s.id] = { etat: 'attente' }; });
    if (X.ST.S.clips.length) { X.ST.S.clips = []; X.ST.S.subs = X.ST.S.subs.filter(function (x) { return !x.sceneId; }); }
    var fa = $('#selAspect'); if (fa && fa.value !== o.format) { fa.value = o.format; fa.dispatchEvent(new Event('change')); }
    X.A.nomProjet = o.titre || X.A.nomProjet; if ($('#projNom')) $('#projNom').value = X.A.nomProjet;
    $('#btnApLancer').disabled = true; $('#btnApArreter').disabled = false; $('#apResultat').hidden = true; rendre();
    var tic = setInterval(rendre, 1000);
    try {
      if (o.voie === 'troupe') await voieTroupe(o); else await voieGenerative(o);
      J.ok = !!(J.resultat && J.resultat.rapport && J.resultat.rapport.ok);
    } catch (e) {
      ETAPES.forEach(function (s) { if (J.etapes[s.id].etat === 'encours') etape(s.id, 'echec', esc(e.message)); });
      $('#apErreur').textContent = e.message;
    } finally {
      clearInterval(tic); J.fini = true; J.t1 = Date.now(); rendre();
      $('#btnApLancer').disabled = false; $('#btnApArreter').disabled = true;
      if (J.resultat) {
        $('#apResultat').hidden = false; $('#apVideo').src = URL.createObjectURL(J.resultat.blob);
        $('#apResume').innerHTML = '<b class="' + (J.resultat.rapport.ok ? 'ok' : 'ko') + '">' + (J.resultat.rapport.ok ? 'Film validé' : 'Film à vérifier') + '</b> — ' + esc(J.resultat.nom) + ' · ' + (J.resultat.blob.size / 1048576).toFixed(2) + ' Mo · fabriqué en ' + sec(J.t1 - J.t0);
        $('#apTelecharger').onclick = function () { X.ST.dl(J.resultat.blob, J.resultat.nom); };
      }
      X.sauverPlusTard();
    }
  }
  /** budget GPU gratuit affiché avant le lancement (documentation Hugging Face au 23/10/2026 : 5 min par jour pour un compte
   * gratuit, décomptées sur la durée RÉSERVÉE ; Wan 2.2 réserve ≈ 37 s par clip de 3 s en 4 étapes, mesuré dans le code du Space). */
  function estimer() {
    var v = $('#apVoie').value, d = Math.max(2, Math.min(60, parseFloat($('#apDuree').value) || 12)), img = !!($('#apImage').files && $('#apImage').files[0]);
    var n = Math.max(1, Math.min(12, Math.round(d / (img ? 4 : 3)))), e = $('#apEstim'); if (!e) return;
    if (v === 'troupe') { e.textContent = 'Un sketch du moteur V1 tourné sur le serveur local : aucun quota en ligne, durée selon le sketch (≈ 20 à 25 s).'; return; }
    if (v === 'demo' || (v === 'auto' && X && X.A.demo)) { e.textContent = n + ' plan(s) DÉMO calculés dans le navigateur : aucun quota.'; return; }
    e.textContent = n + ' plan(s) de ' + (img ? 4 : 3) + ' s.' + (img ? ' Wan 2.2 réserve ≈ 37 s de GPU par plan : ≈ ' + n * 37 + ' s sur les 300 s gratuites du jour de votre compte Hugging Face.' : ' Texte → vidéo sur LTX-2.3, puis les secours si la file est pleine ; le quota gratuit est de 300 s de GPU réservées par jour et par compte.');
  }
  function brancher(ctx) {
    X = ctx;
    ['#apVoie', '#apDuree', '#apImage'].forEach(function (id) { $(id).addEventListener('change', estimer); $(id).addEventListener('input', estimer); }); estimer();
    $('#apStyle').innerHTML = '<option value="">— aucun —</option>' + Object.keys(X.P.PRESETS).map(function (k) { return '<option' + (k === 'Vidéo sociale verticale' ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('');
    $('#btnApLancer').addEventListener('click', lancer);
    $('#btnApArreter').addEventListener('click', function () { if (J && !J.fini) { J.arret = true; $('#apErreur').textContent = 'Arrêt demandé…'; } });
    $('#btnApMontage').addEventListener('click', function () { X.vue('montage'); });
  }
  function remplirPersos(liste) {
    var sel = $('#apPerso'); if (!sel) return; var v = sel.value;
    sel.innerHTML = '<option value="">— aucun —</option>' + liste.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.nom) + (p.lieu ? ' — ' + esc(p.lieu) : '') + '</option>'; }).join(''); sel.value = v;
  }
  window.MAMS = window.MAMS || {};
  window.MAMS.autopilote = { brancher: brancher, remplirPersos: remplirPersos, etat: function () { return J; }, ecrireLocal: ecrireLocal, choisirSketch: choisirSketch, ETAPES: ETAPES, CHAINES: CHAINES };
})();
