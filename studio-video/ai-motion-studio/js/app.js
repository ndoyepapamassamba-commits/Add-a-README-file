/* MASSAMBA AI MOTION STUDIO — interface des 9 sections (22/10/2026).
 * Studio de génération (image → vidéo, texte → vidéo, sketch V1), storyboard multiscène, médiathèque, personnages (nouvelle
 * troupe), montage (moteur de Motion Studio 2), audio et voix, historique des tâches, projets et exports, moteurs IA.
 * Règles tenues ici : aucun secret stocké (le jeton Hugging Face reste en mémoire vive) ; aucune animation locale présentée
 * comme une génération IA (nature « demo » marquée partout) ; aucun prix inventé ; aucun pourcentage inventé. */
(function () {
  'use strict';
  var M = window.MAMS, ST = M.studio, R = M.registre, F = M.fournisseurs, T = M.taches, P = M.prompt, K = M.stockage, X = M.exporteur;
  var $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return [].slice.call(document.querySelectorAll(s)); };
  var esc = ST.esc;
  var A = { mode: 'i2v', image: null, fin: null, jeton: null, demo: false, serveur: 'http://127.0.0.1:8787', srv: null, scenes: [], personnages: [],
    derniere: null, lot: [], lancees: 0, budgetMax: 0, limiteTaches: 30, caps: {}, v1: null, nomProjet: 'Mon film', exports: [], persoSel: null };

  // ------------------------------------------------------------------ utilitaires
  function heure(t) { return new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  function nomFichier(s) { return String(s || 'video').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'video'; }
  function blobDeDataUrl(u, nom) { var b = K.dataUrlVersBlob(u); try { b.name = nom || 'image.png'; } catch (e) { /* Blob figé */ } return b; }
  function confirmer(titre, html) {
    return new Promise(function (res) {
      $('#confirmTitre').textContent = titre; $('#confirmCorps').innerHTML = html; $('#confirmModal').classList.add('on');
      var fin = function (v) { $('#confirmModal').classList.remove('on'); $('#confirmOui').onclick = $('#confirmNon').onclick = null; res(v); };
      $('#confirmOui').onclick = function () { fin(true); }; $('#confirmNon').onclick = function () { fin(false); };
    });
  }
  function erreurGen(msgs) { $('#genErreurs').innerHTML = (msgs || []).map(esc).join('<br>'); }

  // ------------------------------------------------------------------ navigation
  function vue(nom) {
    $$('.nav').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-vue') === nom); });
    $$('.vue').forEach(function (v) { v.classList.toggle('on', v.getAttribute('data-vue') === nom); });
    document.body.className = document.body.className.replace(/\bvue-\S+/g, '').trim() + ' vue-' + nom;
    if (nom !== 'montage' && ST.S.playing) ST.playing(false);
    var rendus = { montage: function () { ST.renderAll(); }, medias: rendreMedias, personnages: rendrePersos, historique: rendreHistorique, moteurs: rendreRegistre, audio: rendreAudio, projets: rendreExports, storyboard: rendreScenes };
    if (rendus[nom]) rendus[nom]();
  }

  // ------------------------------------------------------------------ gestionnaire de tâches
  var gest = new T.Gestionnaire({
    executer: executer,
    surChangement: function (t) { majTaches(t); sauverPlusTard(); },
    maxTotal: 2, maxParSource: 1
  });
  async function executer(t, suivi, signal) {
    var m = R.trouver(t.modeleId), prov = F.pour(m), d = t.demande;
    if (m.voie === 'serveur') d = Object.assign({}, d, { serveurFournisseur: m.serveur, modele: m.modele });
    var opts = { jeton: A.jeton, signal: signal, serveur: A.serveur,
      surImage: function (img) { ST.ajouterImage(img, 'depart-' + t.id + '.jpg', { origine: 'genere-ia', nature: 'ia', prompt: t.prompt, modele: 'Pollinations (sana)' }, false).then(persisterMedia); },
      surId: function (id) { suivi({ etat: 'encours', idFournisseur: id }); } };
    var r = await prov.soumettre(m, d, suivi, opts);
    // consigne embarquée dans le fichier (23/10/2026) : toute vidéo reçue — Space, moteur V1, démo — porte sa consigne
    var em = await embarquerConsigne(r.video, champsConsigne(t, m, d, r)); r.video = em.blob; t.consigneEmbarquee = em.ok;
    var nature = m.voie === 'demo' ? 'demo' : 'ia';
    var nom = (nature === 'demo' ? 'DEMO-' : m.serveur === 'moteur-v1' ? 'V1-' : 'IA-') + nomFichier(t.titre || t.prompt) + '-' + t.id.slice(-4) + (r.video.type.indexOf('webm') >= 0 ? '.webm' : '.mp4');
    var med = await ST.ajouterVideo(r.video, nom, { origine: nature === 'demo' ? 'demo' : (m.serveur === 'moteur-v1' ? 'genere-local' : 'genere-ia'), nature: nature, prompt: em.consigne || t.prompt, modele: m.nom, tacheId: t.id, consigneEmbarquee: em.ok }, false);
    t.resultatMediaId = med.id; persisterMedia(med);
    if (t.sceneId) { var sc = scene(t.sceneId); if (sc) { sc.variantes.push(med.id); if (!sc.choisie) sc.choisie = med.id; rendreScenes(); } }
    return { mediaId: med.id, graine: r.graine, meta: { source: r.meta && r.meta.source } };
  }
  // ---------- CONSIGNE EMBARQUÉE (23/10/2026, « les prompts doivent être embarqués pour chaque vidéo ») : js/meta.js écrit la
  // consigne et ses réglages dans les métadonnées du fichier (MP4 : udta/ilst ; WebM : Tags), sans ré-encoder une image.
  function sketchComplet(s) {
    if (s && s.id && !(s.repliques || []).length && A.v1) s = A.v1.sketchs.filter(function (x) { return x.id === s.id; })[0] || s;
    return s || {};
  }
  function texteSketch(s) {
    s = sketchComplet(s);
    return [(s.titre || 'SKETCH') + (s.image ? ' — ' + s.image.replace(/-/g, ' ') : '')].concat((s.repliques || []).map(function (r) { return r.qui + ' : ' + r.texte + (r.chute ? ' (chute)' : ''); })).join('\n');
  }
  function champsConsigne(t, m, d, r) {
    var v1 = m.serveur === 'moteur-v1', consigne = v1 ? (d.sketchs || []).map(texteSketch).join('\n\n') : String(t.prompt || d.prompt || '');
    var graine = r && r.graine != null ? r.graine : d.graine != null ? d.graine : null;
    var desc = [m.nom + ' (' + m.fournisseur + ')', v1 ? 'sketch du moteur V1' : d.mode === 'i2v' ? 'image → vidéo' : d.mode === 't2v' ? 'texte → vidéo' : d.mode,
      d.dureeS ? d.dureeS + ' s' : null, d.format || null, graine != null ? 'graine ' + graine : null, m.voie === 'demo' ? 'DÉMO — pas une génération IA' : null].filter(Boolean).join(' · ');
    return { titre: (t.titre || consigne.split('\n')[0]).slice(0, 120), consigne: consigne, description: desc,
      massamba: { type: 'generation', consigne: consigne, modele: m.nom, modeleId: m.id, fournisseur: m.fournisseur, voie: m.voie, nature: m.voie === 'demo' ? 'demo' : 'ia',
        mode: v1 ? 'v1' : d.mode, dureeS: d.dureeS || null, format: d.format || null, largeur: d.largeur || null, hauteur: d.hauteur || null, graine: graine,
        imageDepart: !!d.image, imageFin: !!d.fin, sketchs: v1 ? (d.sketchs || []).map(sketchComplet) : undefined, tacheId: t.id, sceneId: t.sceneId || null, genereLe: new Date().toISOString() } };
  }
  async function embarquerConsigne(blob, champs) {
    if (!M.meta) return { blob: blob, ok: false, consigne: champs.consigne, erreur: 'module js/meta.js absent' };
    try { return { blob: await M.meta.embarquer(blob, champs), ok: true, consigne: champs.consigne }; }
    catch (e) { return { blob: blob, ok: false, consigne: champs.consigne, erreur: e.message }; }
  }
  function champsMontage() {
    var S = ST.S, plans = S.clips.map(function (c, i) { var m = ST.media(c.mid) || {};
      return { plan: i + 1, media: m.name || null, type: m.type || c.type, duree: Math.round((c.dur || 0) * 100) / 100, consigne: m.prompt || null, modele: m.modele || null, nature: m.nature || null, origine: m.origine || null }; });
    var lignes = plans.map(function (p) { return 'Plan ' + p.plan + ' (' + p.duree.toFixed(1).replace('.', ',') + ' s) : ' + (p.consigne || '(' + (p.origine === 'importe' ? 'média importé' : 'sans consigne') + ')') + (p.modele ? ' [' + p.modele + ']' : ''); });
    return { titre: A.nomProjet, consigne: lignes.join('\n'),
      description: 'Montage de ' + plans.length + ' plan(s) exporté par MASSAMBA AI Motion Studio' + (plans.some(function (p) { return p.nature === 'demo'; }) ? ' — contient des plans DÉMO (pas des générations IA)' : ''),
      massamba: { type: 'montage', projet: A.nomProjet, plans: plans, textes: S.texts.map(function (o) { return o.text || ''; }).filter(Boolean), sousTitres: S.subs.length, fps: S.fps, exporteLe: new Date().toISOString() } };
  }
  // ---------- EXPORT H.264 PAR LE SERVEUR LOCAL (23/10/2026) : ffmpeg (libx264 + aac) quand le navigateur n'a pas l'encodeur
  function conversionServeur() { var c = A.srv && A.srv.transcodage; return !!(c && c.h264 && c.aac); }
  async function transcoderServeur(blob, fps, surSec) {
    var t0 = Date.now(), tic = setInterval(function () { if (surSec) surSec(Math.round((Date.now() - t0) / 1000)); }, 1000);
    try {
      var r = await fetch(A.serveur + '/api/transcoder', { method: 'POST', headers: { 'Content-Type': /webm/.test(blob.type) ? 'video/webm' : 'video/mp4', 'X-Fps': String(fps || 30) }, body: blob });
      if (!r.ok) { var j = await r.json().catch(function () { return {}; }); throw new Error(j.erreur || ('Conversion H.264 refusée par le serveur local (' + r.status + ')')); }
      var ctl = null; try { ctl = JSON.parse(decodeURIComponent(r.headers.get('X-Controle') || '')); } catch (e) { ctl = null; }
      return { blob: new Blob([await r.arrayBuffer()], { type: 'video/mp4' }), ms: +(r.headers.get('X-Transcodage-Ms') || 0) || (Date.now() - t0), controle: ctl,
        version: ((A.srv.transcodage.version || '').replace(/^ffmpeg version\s*/, '').split(' ')[0]) };
    } finally { clearInterval(tic); }
  }
  // la voie serveur reçoit la demande complète (fournisseur, modèle) : on surcharge l'appel d'origine
  var soumettreServeur = F.FournisseurServeur.soumettre;
  F.FournisseurServeur.soumettre = async function (m, d, suivi, o) {
    if (m.serveur === 'moteur-v1') return soumettreV1(d, suivi, o);
    var copie = Object.assign({}, d); return soumettreServeur.call(F.FournisseurServeur, Object.assign({}, m, { serveur: m.serveur }), copie, suivi, o);
  };
  async function soumettreV1(d, suivi, o) {
    var fd = new FormData(); fd.append('demande', JSON.stringify({ fournisseur: 'moteur-v1', sketchs: d.sketchs }));
    suivi({ etat: 'envoi', message: 'Envoi au moteur V1 local' });
    var r = await fetch(A.serveur + '/api/taches', { method: 'POST', body: fd, signal: o.signal }); var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.erreur || ('Serveur local : refus (' + r.status + ')'));
    o.surId && o.surId(j.id);
    for (;;) {
      if (o.signal && o.signal.aborted) { fetch(A.serveur + '/api/taches/' + j.id, { method: 'DELETE' }).catch(function () {}); throw new Error('Génération annulée.'); }
      await new Promise(function (res) { setTimeout(res, 4000); });
      var s = await (await fetch(A.serveur + '/api/taches/' + j.id, { signal: o.signal })).json();
      if (s.etat === 'terminee') break;
      if (s.etat === 'echec' || s.etat === 'annulee') throw new Error(s.erreur || 'Moteur V1 : échec.');
      suivi({ etat: 'encours', message: s.message || 'Tournage en cours (le moteur ne donne pas de pourcentage)' });
    }
    suivi({ etat: 'finalisation', message: 'Réception de la vidéo' });
    var v = await fetch(A.serveur + '/api/taches/' + j.id + '/video', { signal: o.signal });
    if (!v.ok) throw new Error('Vidéo du moteur V1 indisponible (' + v.status + ').');
    return { video: await v.blob(), graine: null, meta: { source: 'moteur-v1' } };
  }

  function actives() { return gest.taches.filter(function (t) { return /attente|envoi|encours|finalisation/.test(t.etat); }).length; }
  function majTaches(t) {
    var n = actives(); $('#jobsChip').textContent = n + ' tâche' + (n > 1 ? 's' : '') + (n ? ' en cours' : ''); $('#jobsChip').classList.toggle('actif', n > 0);
    if (t && A.derniere === t.id) afficherEtat(t);
    if (t && t.etat === 'terminee' && A.lot.indexOf(t.id) >= 0) rendreVariantes();
    if (t && t.sceneId) rendreScenes();
    if (document.body.classList.contains('vue-historique')) rendreHistorique();
  }
  function afficherEtat(t) {
    var actif = /attente|envoi|encours|finalisation/.test(t.etat), m = R.trouver(t.modeleId) || {};
    var p = [];
    p.push('<span class="st st-' + t.etat + '">' + (actif ? '<i class="attente-anim"></i>' : '') + esc(t.libelle) + '</span>' + (t.nature === 'demo' ? ' <span class="tag demo">DÉMO — pas une génération IA</span>' : ''));
    p.push('Fournisseur : <b>' + esc(t.fournisseur) + '</b> · Modèle : <b>' + esc(t.modeleNom) + '</b> · Lancée à ' + heure(t.creeLe));
    if (t.rang != null && t.etat !== 'terminee') p.push('Rang dans la file du service : ' + t.rang + (t.attenteS ? ' · attente annoncée par le service ≈ ' + Math.round(t.attenteS) + ' s' : ''));
    if (actif) p.push(t.progression != null ? 'Progression donnée par le service : ' + Math.round(t.progression * 100) + ' %' : 'En cours — le service ne donne pas de pourcentage.');
    if (t.message) p.push(esc(t.message));
    if (t.erreur) p.push('<span class="st-echec">' + esc(t.erreur) + '</span>');
    if (t.etat === 'terminee') p.push('Durée : ' + Math.round((t.dureeMs || 0) / 1000) + ' s' + (t.resultat && t.resultat.graine != null ? ' · graine ' + t.resultat.graine : ''));
    p.push('Coût : ' + esc(t.cout || m.prix || R.PRIX_INCONNU));
    $('#genEtat').innerHTML = p.join('<br>');
    $('#btnGenAnnuler').disabled = !actif;
    if (t.etat === 'terminee' && t.resultatMediaId) montrerResultat(t.resultatMediaId);
  }
  function montrerResultat(mid) {
    var m = ST.media(mid); if (!m) return;
    var v = $('#genVideo'); v.src = m.el.src; $('#genVide').hidden = true; A.resultatCourant = mid;
    $('#btnGenAjouter').disabled = false; $('#btnGenTelecharger').disabled = false; $('#btnVariante').disabled = false;
  }
  function rendreVariantes() {
    var h = A.lot.map(function (id) { var t = gest.trouver(id); if (!t || !t.resultatMediaId) return ''; var m = ST.media(t.resultatMediaId); if (!m) return '';
      return '<div class="variante' + (A.resultatCourant === m.id ? ' sel' : '') + '" data-mid="' + m.id + '"><video src="' + m.el.src + '" muted preload="metadata"></video><span>' + esc(t.nature === 'demo' ? 'DÉMO' : 'graine ' + ((t.resultat && t.resultat.graine) != null ? t.resultat.graine : '—')) + ' · ' + (m.duree || 0).toFixed(1) + ' s</span></div>'; }).join('');
    $('#genVariantes').innerHTML = h || '<p class="empty">Aucune variante pour l’instant.</p>';
  }

  // ------------------------------------------------------------------ studio de génération
  function modelesPour(mode) {
    return R.MODELES.filter(function (m) {
      if (A.demo) return m.voie === 'demo';
      if (m.voie === 'demo') return false;
      if (mode === 'v1') return m.serveur === 'moteur-v1';
      if (m.serveur === 'moteur-v1') return false;
      var modes = m.modes || (m.fixe ? [m.fixe.t2v ? 't2v' : null, m.fixe.i2v ? 'i2v' : null] : []);
      var c = A.caps[m.id]; if (c && c.etat === 'disponible') modes = [c.capacites.t2v ? 't2v' : null, c.capacites.i2v ? 'i2v' : null];
      return modes.indexOf(mode) >= 0;
    });
  }
  function remplirModeles() {
    var sel = $('#genModele'), avant = sel.value, liste = modelesPour(A.mode);
    var groupes = { navigateur: 'Gratuits — calcul distant (quota de votre compte)', chaine: 'Gratuits — chaîne en deux étapes', serveur: 'Serveur local', demo: 'Démo' };
    var h = ''; Object.keys(groupes).forEach(function (g) {
      var l = liste.filter(function (m) { return m.voie === g; }); if (!l.length) return;
      h += '<optgroup label="' + groupes[g] + '">' + l.map(function (m) {
        var inactif = m.payant && !(A.srv && A.srv.payantAutorise && A.srv.fournisseurs[m.serveur] && A.srv.fournisseurs[m.serveur].actif);
        return '<option value="' + m.id + '"' + (inactif ? ' disabled' : '') + '>' + esc(m.nom) + (m.payant ? ' — payant' + (inactif ? ' (désactivé)' : '') : '') + '</option>';
      }).join('') + '</optgroup>';
    });
    sel.innerHTML = h;
    if (avant && liste.some(function (m) { return m.id === avant && !sel.querySelector('option[value="' + avant + '"]').disabled; })) sel.value = avant;
    majCaps();
  }
  function modeleChoisi() { return R.trouver($('#genModele').value); }
  var appelCaps = 0;   // une vérification plus ancienne (moteur changé entre-temps) ne doit jamais écraser l'affichage
  async function majCaps() {
    var n = ++appelCaps, m = modeleChoisi(), box = $('#genCaps'); if (!m) { box.textContent = 'Aucun moteur disponible pour ce mode.'; majCout(); return; }
    box.innerHTML = 'Vérification en direct de la configuration du moteur…';
    var c = m.fixe || {}, etat = m.voie === 'serveur' ? 'serveur local' : m.voie === 'demo' ? 'local' : '…', version = '';
    if (m.voie === 'navigateur') {
      var info = await F.FournisseurSpace.decrire(m, { jeton: A.jeton });
      if (!A.caps[m.id] || !(A.caps[m.id].demande > n)) { info.demande = n; A.caps[m.id] = info; }   // la vérification la plus récente l'emporte
      if (n !== appelCaps) return;
      c = info.capacites || {}; etat = info.etat; version = info.version ? ' (Gradio ' + info.version + ')' : '';
      if (info.etat !== 'disponible' && info.message) etat += ' — ' + info.message;
    }
    if (m.voie === 'serveur' && m.serveur !== 'moteur-v1') etat = A.srv ? (A.srv.fournisseurs[m.serveur] && A.srv.fournisseurs[m.serveur].actif ? 'actif sur le serveur' : 'inactif (non configuré ou payant désactivé)') : 'serveur local non joint';
    var connu = m.voie !== 'navigateur' || (A.caps[m.id] && A.caps[m.id].etat === 'disponible');
    var tag = function (ok, t) { return '<span class="tag ' + (!connu ? '' : ok ? 'ok' : 'ko') + '">' + t + (connu ? '' : ' ?') + '</span>'; };
    box.innerHTML = (m.voie === 'demo' ? '<span class="tag demo">DÉMO — animation locale, pas une génération IA</span><br>' : '') +
      tag(c.t2v, 'texte → vidéo') + tag(c.i2v, 'image → vidéo') + tag(c.fin, 'image de fin' + (c.finObligatoire ? ' (obligatoire)' : '')) + (c.audioEntree ? tag(true, 'audio en entrée') : '') + (m.serveur === 'moteur-v1' ? tag(true, 'voix + bouches synchronisées') : '') +
      (connu ? '' : '<br><b>Capacités inconnues tant que le service ne répond pas</b> (rien n’est supposé).') +
      '<br><b>État :</b> ' + esc(etat) + version + (c.dureeMin != null ? ' · <b>Durée :</b> ' + c.dureeMin + ' à ' + c.dureeMax + ' s' : c.durees ? ' · <b>Durées :</b> ' + esc([].concat(c.durees).join(', ')) : '') +
      '<br><b>Sortie :</b> ' + esc(m.sortie || '—') + '<br><b>Licence :</b> ' + esc(m.licence || '—') + '<br><b>Limites :</b> ' + esc(m.limites || '—') +
      '<br><small>Capacités ' + (m.voie === 'navigateur' ? 'lues en direct dans la configuration du service' : 'tirées de ' + esc(m.source || 'la documentation officielle')) + ' · vérifié : ' + esc(m.verifie || '—') + '</small>';
    var d = $('#genDuree'); if (c.dureeMin != null) { d.min = c.dureeMin; d.max = c.dureeMax; if (+d.value > c.dureeMax) d.value = c.dureeMax; if (+d.value < c.dureeMin) d.value = c.dureeMin; } else { d.removeAttribute('min'); d.removeAttribute('max'); }
    $('#blocFin').hidden = !c.fin; $('#blocResolution').hidden = !c.resolution; majCout();
  }
  function majCout() {
    var m = modeleChoisi(); if (!m) { $('#genCout').innerHTML = ''; return; }
    var params = A.mode === 'v1' ? 'nombre et longueur des répliques' : 'durée ' + $('#genDuree').value + ' s, format ' + $('#genFormat').value + (!$('#blocResolution').hidden ? ', qualité ' + $('#genResolution').selectedOptions[0].textContent : '');
    $('#genCout').innerHTML = '<b>Coût de génération</b><br>Fournisseur : ' + esc(m.fournisseur) + ' · Modèle : ' + esc(m.nom) + '<br>Paramètres qui influent : ' + esc(params) +
      '<br>Coût estimé : ' + esc(m.payant ? R.PRIX_INCONNU : m.prix) + (m.payant ? ' — confirmation demandée avant chaque lancement' : '') +
      '<br>Générations lancées dans cette session : ' + A.lancees + ' / ' + A.limiteTaches + (A.budgetMax > 0 ? ' · budget maximal déclaré : ' + A.budgetMax + ' USD' : '');
  }
  function dimsPour(format, qualite, img) {
    var aire = { eco: 512 * 768, std: 576 * 1024, hd: 864 * 1536 }[qualite] || 576 * 1024;
    var ar = img ? img.width / img.height : format === '9:16' ? 9 / 16 : format === '1:1' ? 1 : 16 / 9;
    var l = Math.sqrt(aire * ar), h = aire / l, r32 = function (x) { return Math.max(256, Math.round(x / 32) * 32); };
    return [r32(l), r32(h)];
  }
  function persoParId(id) {
    if (!id) return null;
    var u = A.personnages.filter(function (p) { return p.id === id; })[0]; if (u) return u;
    return toutesLesFiches().filter(function (p) { return p.id === id; })[0] || null;
  }
  async function construireDemande() {
    var m = modeleChoisi(); if (!m) throw new Error('Choisissez un moteur.');
    if (A.mode === 'v1') return { m: m, d: { mode: 'v1', sketchs: [sketchV1()], prompt: $('#v1Titre').value || 'sketch V1', titre: $('#v1Titre').value } };
    var prompt = ($('#genPromptFinal').value || $('#genPrompt').value).trim();
    var perso = persoParId($('#genPerso').value);
    if (perso && $('#genContinuite').checked && prompt.indexOf('Keep the same character') < 0) prompt += (prompt ? ' ' : '') + P.continuite({ nom: perso.nom, allure: perso.attributs || perso.allure, vetements: perso.vetements, signes: perso.signes });
    var d = { mode: A.mode, image: A.mode === 'i2v' ? A.image : null, fin: A.mode === 'i2v' && !$('#blocFin').hidden ? A.fin : null, prompt: prompt,
      dureeS: parseFloat($('#genDuree').value) || 3, format: $('#genFormat').value, graine: $('#genGraine').value === '' ? null : parseInt($('#genGraine').value, 10) };
    if (!$('#blocResolution').hidden) { var im = null; if (d.image) im = await ST.chargerImage(d.image); var wh = dimsPour(d.format, $('#genResolution').value, im); d.largeur = wh[0]; d.hauteur = wh[1]; }
    return { m: m, d: d };
  }
  async function generer(variante, sceneId, surcharge) {
    erreurGen([]);
    var q; try { q = surcharge || await construireDemande(); } catch (e) { erreurGen([e.message]); return null; }
    var m = q.m, d = q.d; if (variante) d.graine = Math.floor(Math.random() * 2147483647);
    var caps = (A.caps[m.id] && A.caps[m.id].capacites) || m.fixe || {};
    var errs = m.serveur === 'moteur-v1' ? validerV1(d) : F.valider(m, caps, d);
    if (m.voie === 'serveur' && !A.srv) errs.push('Serveur local non joint : lancez-le puis cliquez « Tester » dans Moteurs IA.');
    if (A.lancees >= A.limiteTaches) errs.push('Limite de ' + A.limiteTaches + ' générations par session atteinte (Moteurs IA → Budget et limites).');
    if (errs.length) { erreurGen(errs); return null; }
    if (m.payant) {
      if (!A.srv || !A.srv.payantAutorise) { erreurGen(['Voies payantes désactivées sur le serveur local (PAYANT_AUTORISE=0) : rien de payant par défaut.']); return null; }
      var ok = await confirmer('Génération payante', '<p>Fournisseur : <b>' + esc(m.fournisseur) + '</b><br>Modèle : <b>' + esc(m.nom) + '</b><br>Coût : <b>' + esc(R.PRIX_INCONNU) + '</b></p><p>Cette génération peut être facturée sur VOTRE compte ' + esc(m.fournisseur) + '. Budget maximal déclaré : ' + (A.budgetMax || 0) + ' USD.</p>');
      if (!ok) return null; d.confirmationCout = true;
    }
    var t;
    try { t = gest.ajouter({ modeleId: m.id, modeleNom: m.nom, fournisseur: m.fournisseur, source: m.space || m.serveur || m.id, voie: m.voie, demande: d, cout: m.payant ? R.PRIX_INCONNU : m.prix, sceneId: sceneId }); }
    catch (e) { erreurGen([e.message]); return null; }
    t.titre = d.titre || null; A.lancees++; majCout();
    if (!sceneId) { A.derniere = t.id; A.lot.push(t.id); afficherEtat(t); }
    return t;
  }

  // ---------- sketch V1
  async function chargerCatalogueV1() {
    try {
      var r = await fetch(A.serveur + '/api/v1/catalogue'); var j = await r.json(); if (!r.ok) throw new Error(j.erreur || r.status);
      A.v1 = j;
      $('#v1Scene').innerHTML = j.scenes.map(function (s) { return '<option value="' + esc(s.nom) + '">' + esc(s.nom.replace(/-/g, ' ')) + ' — ' + esc(s.acteurs.join(' et ')) + '</option>'; }).join('') || '<option value="">aucune scène préparée</option>';
      majSketchsV1();
    } catch (e) { A.v1 = null; $('#v1Scene').innerHTML = '<option value="">Serveur local / moteur V1 indisponible</option>'; $('#v1Ton').className = 'ton ko'; $('#v1Ton').textContent = 'Moteur V1 indisponible : ' + e.message + '\nLancez le serveur local (docs/GUIDE-INSTALLATION.md).'; }
  }
  function sceneV1() { return A.v1 && A.v1.scenes.filter(function (s) { return s.nom === $('#v1Scene').value; })[0]; }
  function majSketchsV1() {
    var sc = sceneV1(); if (!sc) return;
    var l = A.v1.sketchs.filter(function (s) { return s.image === sc.nom; });
    $('#v1Sketch').innerHTML = '<option value="">— écrire mon sketch —</option>' + l.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.titre) + '</option>'; }).join('');
    if (!$('#v1Repliques').children.length) { ajouterLigneV1(sc.acteurs[0], ''); ajouterLigneV1(sc.acteurs[1] || sc.acteurs[0], ''); }
    $$('#v1Repliques select').forEach(function (s) { var v = s.value; s.innerHTML = sc.acteurs.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join(''); if (sc.acteurs.indexOf(v) >= 0) s.value = v; });
  }
  function ajouterLigneV1(qui, texte, chute) {
    var sc = sceneV1(), ac = sc ? sc.acteurs : [qui || 'A'];
    var div = document.createElement('div'); div.className = 'repl';
    div.innerHTML = '<select>' + ac.map(function (a) { return '<option' + (a === qui ? ' selected' : '') + '>' + esc(a) + '</option>'; }).join('') + '</select><input type="text" value="' + esc(texte || '') + '" placeholder="Réplique"><label class="check" title="Chute"><input type="checkbox"' + (chute ? ' checked' : '') + '>chute</label><button class="x" title="Retirer">✕</button>';
    div.querySelector('.x').onclick = function () { div.remove(); };
    $('#v1Repliques').appendChild(div);
  }
  function sketchV1() {
    var id = $('#v1Sketch').value; if (id) return { id: id };
    var sc = sceneV1();
    return { titre: $('#v1Titre').value || 'SKETCH', image: sc && sc.nom, repliques: $$('#v1Repliques .repl').map(function (r) { return { qui: r.querySelector('select').value, texte: r.querySelector('input[type=text]').value.trim(), chute: r.querySelector('input[type=checkbox]').checked }; }).filter(function (r) { return r.texte; }) };
  }
  function validerV1(d) {
    var e = [], s = d.sketchs[0];
    if (!A.v1) e.push('Moteur V1 indisponible : lancez le serveur local.');
    if (!s.id && (!s.image || (s.repliques || []).length < 2)) e.push('Choisissez un sketch de la réserve ou écrivez au moins deux répliques.');
    return e;
  }
  async function controleV1() {
    var box = $('#v1Ton'); box.className = 'ton'; box.textContent = 'Contrôle par la grille de ton de la V1…';
    try { var r = await fetch(A.serveur + '/api/v1/controle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sketchs: [sketchV1()] }) }); var j = await r.json(); if (!r.ok) throw new Error(j.erreur || r.status);
      box.className = 'ton ' + (j.ok ? 'ok' : 'ko'); box.textContent = (j.ok ? '✔ Conforme à la grille de la V1\n' : '✘ Refusé par la grille de la V1 (le moteur ne tournera pas ce sketch)\n') + j.rapport; }
    catch (e) { box.className = 'ton ko'; box.textContent = 'Contrôle impossible : ' + e.message; }
  }

  function brancherGenerer() {
    $$('.segb').forEach(function (b) { b.addEventListener('click', function () {
      A.mode = b.getAttribute('data-mode'); $$('.segb').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('#blocImage').hidden = A.mode !== 'i2v'; $('#blocV1').hidden = A.mode !== 'v1';
      $$('#vueGenerer .gen-form > .grp, #genAvance, #blocResolution, .gen-form > .grid3').forEach(function (el) { if (el.id !== 'genModeleGrp') el.hidden = A.mode === 'v1' && !el.contains($('#genModele')); });
      if (A.mode === 'v1' && !A.v1) chargerCatalogueV1();
      remplirModeles();
    }); });
    var prendreImage = function (f, cible) {
      if (!f) return; if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) { erreurGen(['Format accepté : JPG, PNG ou WEBP.']); return; }
      if (cible === 'fin') { A.fin = f; $('#genFinPreview').src = URL.createObjectURL(f); $('#genFinPreview').hidden = false; }
      else { A.image = f; $('#genImagePreview').src = URL.createObjectURL(f); $('#genImagePreview').hidden = false; }
    };
    $('#genImageFile').addEventListener('change', function () { prendreImage(this.files[0]); this.value = ''; });
    $('#genFinFile').addEventListener('change', function () { prendreImage(this.files[0], 'fin'); this.value = ''; });
    $('#genFinClear').addEventListener('click', function () { A.fin = null; $('#genFinPreview').hidden = true; });
    var dz = $('#genImageDrop');
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
    dz.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files[0]) prendreImage(e.dataTransfer.files[0]); });
    $('#genImageFromLib').addEventListener('click', function () { ouvrirSelecteur(function (blob, nom) { try { blob.name = nom; } catch (e) { /* Blob figé */ } prendreImage(blob.type ? blob : new Blob([blob], { type: 'image/png' })); }); });
    $('#genModele').addEventListener('change', majCaps);
    ['#genDuree', '#genFormat', '#genResolution'].forEach(function (s) { $(s).addEventListener('change', majCout); });
    var sel = $('#genPreset'); sel.innerHTML += Object.keys(P.PRESETS).map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('');
    var cam = $('#genCamera'); cam.innerHTML += Object.keys(P.CAMERAS).map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('');
    $('#btnStructurer').addEventListener('click', function () {
      var r = P.structurer({ idee: $('#genPrompt').value, sujet: $('#genSujet').value, action: $('#genAction').value, decor: $('#genDecor').value, preset: $('#genPreset').value, camera: $('#genCamera').value,
        eclairage: $('#genLumiere').value, ambiance: $('#genAmbiance').value, mouvements: $('#genMouvements').value, contraintes: $('#genContraintes').value });
      $('#genParts').innerHTML = r.parties.map(function (p) { return '<li><b>' + esc(p.origine) + '</b> : ' + esc(p.texte) + '</li>'; }).join('');
      $('#genPromptFinal').value = r.texte;
    });
    $('#btnTraduire').addEventListener('click', async function () {
      var src = $('#genPromptFinal').value || $('#genPrompt').value; if (!src.trim()) return;
      this.disabled = true; try { $('#genPromptFinal').value = await P.traduire(src); ST.status('Traduction affichée : relisez-la avant de générer'); } catch (e) { erreurGen([e.message]); } this.disabled = false;
    });
    $('#genPrompt').addEventListener('input', function () { if (!$('#genPromptFinal').dataset.touche) $('#genPromptFinal').value = this.value; });
    $('#genPromptFinal').addEventListener('input', function () { this.dataset.touche = '1'; });
    $('#btnGenerer').addEventListener('click', function () { A.lot = []; generer(false); });
    $('#btnVariante').addEventListener('click', function () { generer(true); });
    $('#btnGenAnnuler').addEventListener('click', function () { if (A.derniere) gest.annuler(A.derniere); });
    $('#btnGenAjouter').addEventListener('click', function () { var m = ST.media(A.resultatCourant); if (!m) return; ST.S.clips.push(ST.nouveauClip(m)); ST.S.sel = ST.S.clips[ST.S.clips.length - 1].id; ST.snap(); ST.renderAll(); ST.status('Ajouté à la timeline'); vue('montage'); });
    $('#btnGenTelecharger').addEventListener('click', function () { var m = ST.media(A.resultatCourant); if (m && m.blob) ST.dl(m.blob, m.name); });
    $('#genVariantes').addEventListener('click', function (e) { var v = e.target.closest('[data-mid]'); if (v) { montrerResultat(v.getAttribute('data-mid')); rendreVariantes(); } });
    $('#v1Scene').addEventListener('change', function () { $('#v1Repliques').innerHTML = ''; majSketchsV1(); });
    $('#v1Sketch').addEventListener('change', function () {
      var s = A.v1 && A.v1.sketchs.filter(function (x) { return x.id === $('#v1Sketch').value; })[0]; $('#v1Repliques').innerHTML = '';
      if (s) { $('#v1Titre').value = s.titre; s.repliques.forEach(function (r) { ajouterLigneV1(r.qui, r.texte, r.chute); }); } else majSketchsV1();
    });
    $('#btnV1Ligne').addEventListener('click', function () { var sc = sceneV1(); ajouterLigneV1(sc ? sc.acteurs[$('#v1Repliques').children.length % sc.acteurs.length] : '', ''); });
    $('#btnV1Controle').addEventListener('click', controleV1);
  }

  // ------------------------------------------------------------------ sélecteur de média (images de la médiathèque + troupe)
  function ouvrirSelecteur(rappel) {
    var imgs = ST.S.media.filter(function (m) { return m.type === 'image' && !m.supprime; });
    var troupe = M.TROUPE_IMAGES ? Object.keys(M.TROUPE_IMAGES) : [];
    $('#pickerGrid').innerHTML = imgs.map(function (m) { return '<div class="libitem" data-pick="m:' + m.id + '"><div class="vis" style="background-image:url(' + JSON.stringify(m.img.src || '') + ')"></div><div class="meta"><b>' + esc(m.name) + '</b></div></div>'; }).join('') +
      troupe.map(function (k) { return '<div class="libitem" data-pick="t:' + esc(k) + '"><div class="vis" style="background-image:url(' + JSON.stringify(M.TROUPE_IMAGES[k]) + ')"></div><div class="meta"><b>' + esc(k.replace(/-/g, ' ')) + '</b>Nouvelle troupe</div></div>'; }).join('') || '<p class="empty">Aucune image : importez-en dans la médiathèque.</p>';
    $('#pickerModal').classList.add('on');
    $('#pickerGrid').onclick = async function (e) {
      var it = e.target.closest('[data-pick]'); if (!it) return; var v = it.getAttribute('data-pick');
      if (v.indexOf('m:') === 0) { var m = ST.media(v.slice(2)); var b = m.blob || await new Promise(function (r) { var c = document.createElement('canvas'); c.width = m.img.width; c.height = m.img.height; c.getContext('2d').drawImage(m.img, 0, 0); c.toBlob(r, 'image/png'); }); rappel(b, m.name); }
      else rappel(blobDeDataUrl(M.TROUPE_IMAGES[v.slice(2)], v.slice(2) + '.jpg'), v.slice(2) + '.jpg');
      $('#pickerModal').classList.remove('on');
    };
  }

  // ------------------------------------------------------------------ storyboard
  function scene(id) { return A.scenes.filter(function (s) { return s.id === id; })[0]; }
  function nouvelleScene(desc) { return { id: ST.uid(), description: desc || '', prompt: '', persos: [], decor: '', action: '', plan: 'Plan moyen', camera: 'Plan fixe', duree: 3, ref: null, modeleId: '', tacheId: null, variantes: [], choisie: null, dialogue: '' }; }
  function decouper(txt) {
    var blocs = String(txt).split(/\n\s*\n|(?=SC[EÈ]NE\s*\d+)/i).map(function (b) { return b.replace(/^SC[EÈ]NE\s*\d+\s*[:.\-–]?\s*/i, '').trim(); }).filter(Boolean);
    blocs.forEach(function (b) { var s = nouvelleScene(b); s.prompt = b; A.scenes.push(s); });
    rendreScenes(); sauverPlusTard();
  }
  var PLANS = ['Plan large', 'Plan moyen', 'Plan rapproché', 'Gros plan', 'Plan d’ensemble'];
  function rendreScenes() {
    var h = $('#sbScenes'); if (!h) return;
    if (!A.scenes.length) { h.innerHTML = '<p class="empty">Aucune scène. Écrivez un scénario ou ajoutez une scène.</p>'; return; }
    var persos = toutesLesFiches().concat(A.personnages);
    var modeles = R.MODELES.filter(function (m) { return (m.voie === 'navigateur' || m.voie === 'chaine' || (m.voie === 'serveur' && m.serveur !== 'moteur-v1') || m.voie === 'demo'); });
    h.innerHTML = A.scenes.map(function (s, i) {
      var t = s.tacheId ? gest.trouver(s.tacheId) : null, med = s.choisie ? ST.media(s.choisie) : null;
      return '<div class="scene" data-sid="' + s.id + '"><div class="scene-head"><span class="scene-num">' + (i + 1) + '</span><input data-k="description" value="' + esc(s.description) + '" placeholder="Description"><button class="btn ghost small" data-act="haut" title="Monter">↑</button><button class="btn ghost small" data-act="bas" title="Descendre">↓</button><button class="btn ghost small" data-act="suppr" title="Supprimer">✕</button></div>' +
        '<div class="grp"><label>Consigne visuelle</label><textarea data-k="prompt" rows="2">' + esc(s.prompt) + '</textarea></div>' +
        '<div class="grid2"><div class="grp"><label>Décor</label><input data-k="decor" value="' + esc(s.decor) + '"></div><div class="grp"><label>Action</label><input data-k="action" value="' + esc(s.action) + '"></div></div>' +
        '<div class="grid3"><div class="grp"><label>Plan</label><select data-k="plan">' + PLANS.map(function (p) { return '<option' + (p === s.plan ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
        '<div class="grp"><label>Caméra</label><select data-k="camera">' + Object.keys(P.CAMERAS).map(function (c) { return '<option' + (c === s.camera ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
        '<div class="grp"><label>Durée (s)</label><input data-k="duree" type="number" step="0.5" min="0.5" value="' + s.duree + '"></div></div>' +
        '<div class="grp"><label>Personnage(s)</label><select data-k="persos" multiple size="2">' + persos.slice(0, 400).map(function (p) { return '<option value="' + esc(p.id) + '"' + (s.persos.indexOf(p.id) >= 0 ? ' selected' : '') + '>' + esc(p.nom) + (p.lieu ? ' — ' + esc(p.lieu) : '') + '</option>'; }).join('') + '</select></div>' +
        '<div class="grp"><label>Moteur</label><select data-k="modeleId"><option value="">Automatique (image → Wan 2.2, sinon LTX-2.3)</option>' + modeles.map(function (m) { return '<option value="' + m.id + '"' + (m.id === s.modeleId ? ' selected' : '') + '>' + esc(m.nom) + '</option>'; }).join('') + '</select></div>' +
        '<div class="grp"><label>Dialogue / son</label><input data-k="dialogue" value="' + esc(s.dialogue) + '" placeholder="Réplique (devient un sous-titre à l’assemblage)"></div>' +
        '<div class="scene-media">' + (s.ref ? '<img src="' + s.ref + '" alt="référence">' : '<span class="hint">Pas d’image de référence : texte → vidéo.</span>') + '<div class="row"><label class="btn ghost small">Image de référence<input type="file" accept="image/*" data-act="ref" hidden></label>' + (s.ref ? '<button class="btn ghost small" data-act="sansref">Retirer</button>' : '') + '<button class="btn ghost small" data-act="refperso">Image du personnage</button></div></div>' +
        '<div class="hint">Statut : <b>' + esc(t ? t.libelle : (med ? 'Vidéo choisie' : 'À générer')) + '</b>' + (t && t.erreur ? ' — ' + esc(t.erreur) : '') + '</div>' +
        (s.variantes.length ? '<div class="variantes">' + s.variantes.map(function (mid) { var m = ST.media(mid); return m ? '<div class="variante' + (mid === s.choisie ? ' sel' : '') + '" data-act="choisir" data-mid="' + mid + '"><video src="' + m.el.src + '" muted preload="metadata"></video><span>' + (m.nature === 'demo' ? 'DÉMO' : 'IA') + ' · ' + (m.duree || 0).toFixed(1) + ' s</span></div>' : ''; }).join('') + '</div>' : '') +
        '<div class="row"><button class="btn small" data-act="gen">' + (s.variantes.length ? 'Régénérer (variante)' : 'Générer la scène') + '</button><button class="btn ghost small" data-act="monter"' + (s.choisie ? '' : ' disabled') + '>Remplacer dans le montage</button></div></div>';
    }).join('');
  }
  function promptScene(s) {
    var cont = s.persos.map(persoParId).filter(Boolean).map(function (p) { return P.continuite({ nom: p.nom, allure: p.attributs || p.allure, vetements: p.vetements, signes: p.signes }); }).join('. ');
    return P.structurer({ idee: s.prompt || s.description, action: s.action, decor: s.decor, camera: s.camera, contraintes: s.plan.toLowerCase() === 'gros plan' ? 'close-up shot' : s.plan === 'Plan large' ? 'wide shot' : '', continuite: cont }).texte;
  }
  async function genererScene(s) {
    var img = s.ref ? blobDeDataUrl(s.ref, 'scene-' + s.id + '.png') : null;
    var id = s.modeleId || (A.demo ? 'demo' : img ? 'wan22-i2v-rapide' : 'ltx23'); var m = R.trouver(id);
    var d = { mode: img ? 'i2v' : 't2v', image: img, prompt: promptScene(s), dureeS: s.duree, format: $('#genFormat').value, graine: null };
    var caps = (A.caps[m.id] && A.caps[m.id].capacites) || m.fixe || {};
    if (m.voie === 'navigateur' && !A.caps[m.id]) { var info = await F.FournisseurSpace.decrire(m, { jeton: A.jeton }); A.caps[m.id] = info; caps = info.capacites; }
    if (caps.resolution) { var im = img ? await ST.chargerImage(img) : null; var wh = dimsPour(d.format, 'std', im); d.largeur = wh[0]; d.hauteur = wh[1]; }
    var t = await generer(false, s.id, { m: m, d: d }); if (t) { s.tacheId = t.id; rendreScenes(); }
    return t;
  }
  function brancherStoryboard() {
    $('#btnDecouper').addEventListener('click', function () { decouper($('#sbScenario').value); });
    $('#btnSceneAjouter').addEventListener('click', function () { A.scenes.push(nouvelleScene('')); rendreScenes(); });
    var h = $('#sbScenes');
    h.addEventListener('input', function (e) { var c = e.target.closest('[data-sid]'), k = e.target.getAttribute('data-k'); if (!c || !k) return; var s = scene(c.getAttribute('data-sid')); if (k === 'persos') s.persos = [].map.call(e.target.selectedOptions, function (o) { return o.value; }); else s[k] = k === 'duree' ? parseFloat(e.target.value) || 3 : e.target.value; sauverPlusTard(); });
    h.addEventListener('change', async function (e) {
      var c = e.target.closest('[data-sid]'); if (!c) return; var s = scene(c.getAttribute('data-sid'));
      if (e.target.getAttribute('data-k') === 'persos') { s.persos = [].map.call(e.target.selectedOptions, function (o) { return o.value; }); sauverPlusTard(); }
      if (e.target.getAttribute('data-act') === 'ref' && e.target.files[0]) { s.ref = await K.blobVersDataUrl(e.target.files[0]); rendreScenes(); sauverPlusTard(); }
    });
    h.addEventListener('click', async function (e) {
      var b = e.target.closest('[data-act]'), c = e.target.closest('[data-sid]'); if (!b || !c || b.tagName === 'INPUT') return;
      var s = scene(c.getAttribute('data-sid')), i = A.scenes.indexOf(s), act = b.getAttribute('data-act');
      if (act === 'haut' && i > 0) { A.scenes.splice(i, 1); A.scenes.splice(i - 1, 0, s); }
      if (act === 'bas' && i < A.scenes.length - 1) { A.scenes.splice(i, 1); A.scenes.splice(i + 1, 0, s); }
      if (act === 'suppr') A.scenes.splice(i, 1);
      if (act === 'sansref') s.ref = null;
      if (act === 'refperso') { var p = s.persos.map(persoParId).filter(function (x) { return x && imageDuPerso(x); })[0]; if (p) s.ref = imageDuPerso(p); else ST.status('Aucune image pour les personnages de cette scène', 0, 1); }
      if (act === 'choisir') { s.choisie = b.getAttribute('data-mid'); }
      if (act === 'gen') { await genererScene(s); }
      if (act === 'monter') { placerScenes([s]); }
      rendreScenes(); sauverPlusTard();
    });
    $('#btnFilmComplet').addEventListener('click', filmComplet);
    $('#btnAssembler').addEventListener('click', function () { var l = A.scenes.filter(function (s) { return s.choisie; }); if (!l.length) { ST.status('Aucune scène n’a de vidéo', 0, 1); return; } placerScenes(l, true); vue('montage'); });
  }
  async function filmComplet() {
    var l = A.scenes.filter(function (s) { return !s.choisie; }); if (!l.length) { ST.status('Toutes les scènes ont déjà une vidéo'); return; }
    var moteurs = {}; l.forEach(function (s) { var id = s.modeleId || (A.demo ? 'demo' : s.ref ? 'wan22-i2v-rapide' : 'ltx23'); var m = R.trouver(id); moteurs[m.nom] = m; });
    var payant = Object.keys(moteurs).some(function (k) { return moteurs[k].payant; });
    var html = '<p><b>' + l.length + ' scène(s)</b> à générer, l’une après l’autre (une à la fois par service, pour ménager votre quota).</p><ul>' + Object.keys(moteurs).map(function (k) { return '<li>' + esc(k) + ' — ' + esc(moteurs[k].payant ? R.PRIX_INCONNU : moteurs[k].prix) + '</li>'; }).join('') + '</ul>' +
      '<p>Estimation du coût total : ' + (payant ? esc(R.PRIX_INCONNU) : 'gratuit en argent ; chaque scène consomme une part du quota GPU du jour, les générations au-delà échoueront proprement et pourront être relancées') + '.</p><p>Le film se construit par segments : aucun moteur ne produit un film long en une seule opération.</p>';
    if (!(await confirmer('Film complet', html))) return;
    for (var i = 0; i < l.length; i++) await genererScene(l[i]);
  }
  function placerScenes(liste, depuisZero) {
    var S = ST.S;
    liste.forEach(function (s) {
      var m = ST.media(s.choisie); if (!m) return;
      var c = S.clips.filter(function (x) { return x.sceneId === s.id; })[0];
      if (c) { c.mid = m.id; c.type = 'video'; c.dur = m.duree; c.debutSource = 0; c.preset = 'fixe'; }
      else S.clips.push(ST.nouveauClip(m, { sceneId: s.id }));
    });
    if (depuisZero) {   // ordre du storyboard + dialogues en sous-titres
      var ordre = A.scenes.map(function (s) { return s.id; });
      S.clips.sort(function (a, b) { var ia = ordre.indexOf(a.sceneId), ib = ordre.indexOf(b.sceneId); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); });
      dialoguesVersSousTitres();
    }
    ST.snap(); ST.renderAll(); ST.status(liste.length + ' scène(s) placée(s) dans le montage');
  }
  function dialoguesVersSousTitres() {
    var S = ST.S, st = ST.starts(); S.subs = S.subs.filter(function (x) { return !x.sceneId; });
    S.clips.forEach(function (c, i) { var s = c.sceneId && scene(c.sceneId); if (s && s.dialogue) S.subs.push({ id: ST.uid(), sceneId: s.id, start: st[i] + 0.2, dur: Math.max(1, ST.clipDur(c) - 0.4), text: s.dialogue }); });
  }

  // ------------------------------------------------------------------ personnages (nouvelle troupe + fiches de l'utilisateur)
  var fichesTroupe = null;
  function toutesLesFiches() {
    if (fichesTroupe) return fichesTroupe;
    fichesTroupe = [];
    (M.TROUPE || []).forEach(function (d) { d.personnages.forEach(function (p) {
      fichesTroupe.push({ id: 'troupe:' + p.id, troupe: true, nom: p.nom, lieu: d.lieu, scene: d.scene, cote: p.cote, genre: p.genre, age: p.age, metier: p.metier || '', ressort: p.ressort || '',
        allure: p.allure || '', attributs: p.allure || '', description: [p.genre, p.age ? p.age + ' ans' : '', p.metier].filter(Boolean).join(', ') + (p.ressort ? ' — ' + p.ressort : ''), vetements: '', signes: '', continuite: '', refs: [] });
    }); });
    // les duos déjà dessinés (image de référence) d'abord
    fichesTroupe.sort(function (x, y) { return (imageDuPerso(y) ? 1 : 0) - (imageDuPerso(x) ? 1 : 0); });
    return fichesTroupe;
  }
  function imageDuPerso(p) { return (p.refs && p.refs[0]) || (p.troupe && M.TROUPE_IMAGES && M.TROUPE_IMAGES[p.scene]) || (p.troupeId && M.TROUPE_IMAGES && M.TROUPE_IMAGES[(persoParId(p.troupeId) || {}).scene]) || null; }
  function rendrePersos() {
    var q = ($('#persoRecherche').value || '').toLowerCase(), avecTroupe = $('#persoTroupe').checked;
    var liste = A.personnages.concat(avecTroupe ? toutesLesFiches().filter(function (f) { return !A.personnages.some(function (u) { return u.troupeId === f.id; }); }) : []);
    liste = liste.filter(function (p) { return !q || (p.nom + ' ' + (p.lieu || '') + ' ' + (p.metier || '') + ' ' + (p.description || '')).toLowerCase().indexOf(q) >= 0; });
    $('#persoListe').innerHTML = liste.slice(0, 300).map(function (p) {
      var im = imageDuPerso(p), pos = p.cote === 'droite' ? 'right' : 'left';
      return '<div class="perso' + (A.persoSel === p.id ? ' sel' : '') + '" data-pid="' + esc(p.id) + '"><div class="av" style="' + (im ? 'background-image:url(' + JSON.stringify(im) + ');background-position:' + pos + ' center' : '') + '">' + (im ? '' : esc(p.nom.slice(0, 2))) + '</div><div><b>' + esc(p.nom) + '</b><small>' + esc(p.lieu || '') + (p.troupe ? ' · troupe' : ' · ma fiche') + '</small><small>' + esc((p.metier || p.description || '').slice(0, 70)) + '</small></div></div>';
    }).join('') || '<p class="empty">Aucun personnage.</p>';
    remplirSelectPersos();
  }
  function remplirSelectPersos() {
    var sel = $('#genPerso'), v = sel.value;
    sel.innerHTML = '<option value="">— aucun —</option>' + (A.personnages.length ? '<optgroup label="Mes fiches">' + A.personnages.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.nom) + '</option>'; }).join('') + '</optgroup>' : '') +
      '<optgroup label="Nouvelle troupe">' + toutesLesFiches().map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.nom) + ' — ' + esc(p.lieu) + '</option>'; }).join('') + '</optgroup>';
    sel.value = v;
    if (M.autopilote) M.autopilote.remplirPersos(A.personnages.concat(toutesLesFiches()));
  }
  function ficheVersForm(p) {
    A.persoSel = p ? p.id : null; $('#persoTitre').textContent = p ? (p.troupe ? 'Fiche (nouvelle troupe — « Enregistrer » crée votre copie modifiable)' : 'Ma fiche') : 'Nouvelle fiche';
    var f = function (id, v) { $(id).value = v || ''; };
    f('#pfNom', p && p.nom); f('#pfLieu', p && p.lieu); f('#pfDescription', p && p.description); f('#pfAttributs', p && (p.attributs || p.allure)); f('#pfVetements', p && p.vetements); f('#pfSignes', p && p.signes); f('#pfContinuite', p && p.continuite);
    var refs = p ? (p.refs || []).slice() : []; var im = p && imageDuPerso(p); if (im && refs.indexOf(im) < 0) refs.unshift(im);
    $('#pfRefs').innerHTML = refs.map(function (r) { return '<img src="' + r + '" alt="référence">'; }).join('') || '<span class="hint">Aucune image.</span>';
    $('#pfScenes').textContent = p ? (A.scenes.map(function (s, i) { return s.persos.indexOf(p.id) >= 0 ? 'Scène ' + (i + 1) : null; }).filter(Boolean).join(', ') || 'Aucune scène pour l’instant.') : '—';
    $('#btnPersoSupprimer').disabled = !p || !!p.troupe;
  }
  function formVersFiche() {
    var p = persoParId(A.persoSel), cible;
    if (!p || p.troupe) { cible = { id: 'perso:' + ST.uid(), refs: [], troupeId: p && p.troupe ? p.id : null, scene: p && p.scene, cote: p && p.cote }; A.personnages.push(cible); }
    else cible = p;
    cible.nom = $('#pfNom').value.trim() || 'Sans nom'; cible.lieu = $('#pfLieu').value; cible.description = $('#pfDescription').value; cible.attributs = $('#pfAttributs').value;
    cible.vetements = $('#pfVetements').value; cible.signes = $('#pfSignes').value; cible.continuite = $('#pfContinuite').value;
    if (!cible.refs.length && p && p.troupe && imageDuPerso(p)) cible.refs.push(imageDuPerso(p));
    return cible;
  }
  function brancherPersos() {
    $('#persoListe').addEventListener('click', function (e) { var it = e.target.closest('[data-pid]'); if (!it) return; ficheVersForm(persoParId(it.getAttribute('data-pid'))); rendrePersos(); });
    $('#persoRecherche').addEventListener('input', rendrePersos); $('#persoTroupe').addEventListener('change', rendrePersos);
    $('#btnPersoNouveau').addEventListener('click', function () { ficheVersForm(null); });
    $('#btnPersoEnregistrer').addEventListener('click', function () { var c = formVersFiche(); ficheVersForm(c); rendrePersos(); sauverPlusTard(); ST.status('Fiche enregistrée'); });
    $('#btnPersoSupprimer').addEventListener('click', function () { A.personnages = A.personnages.filter(function (p) { return p.id !== A.persoSel; }); ficheVersForm(null); rendrePersos(); sauverPlusTard(); });
    $('#pfRefFile').addEventListener('change', async function () { var c = formVersFiche(); for (var i = 0; i < this.files.length; i++) c.refs.push(await K.blobVersDataUrl(this.files[i])); this.value = ''; ficheVersForm(c); rendrePersos(); sauverPlusTard(); });
    $('#btnPersoImage').addEventListener('click', async function () {
      var c = formVersFiche(), desc = c.attributs || c.description || c.nom; this.disabled = true; ST.status('Image de référence en cours (Pollinations, gratuit)…', 1);
      try { var r = await fetch('https://image.pollinations.ai/prompt/' + encodeURIComponent('Full body character reference, West African, ' + desc + ', plain background, 3D animation style') + '?width=640&height=896&nologo=true&model=sana');
        if (!r.ok) throw new Error('Pollinations : ' + r.status); c.refs.push(await K.blobVersDataUrl(await r.blob())); ficheVersForm(c); rendrePersos(); sauverPlusTard(); ST.status('Image de référence créée (Pollinations, modèle « sana »)'); }
      catch (e) { ST.status('Image impossible : ' + e.message, 0, 1); }
      this.disabled = false;
    });
    $('#btnPersoUtiliser').addEventListener('click', function () {
      var p = persoParId(A.persoSel); if (!p) return; vue('generer');
      if (p.troupe) remplirSelectPersos(); $('#genPerso').value = p.id;
      var im = imageDuPerso(p); if (im) { A.image = blobDeDataUrl(im, nomFichier(p.nom) + '.png'); $('#genImagePreview').src = im; $('#genImagePreview').hidden = false; $('#modeI2V').click(); }
    });
  }

  // ------------------------------------------------------------------ médiathèque
  function rendreMedias() {
    var f = $('#libFiltre').value;
    var l = ST.S.media.filter(function (m) { if (m.supprime) return false; return f === 'tout' || (f === 'image' && m.type === 'image') || (f === 'video' && m.type === 'video') || (f === 'audio' && m.type === 'audio') || (f === 'ia' && m.type === 'video' && m.nature === 'ia') || (f === 'demo' && m.nature === 'demo'); });
    $('#libGrid').innerHTML = l.map(function (m) {
      var vis = m.type === 'video' ? '<video src="' + m.el.src + '" muted preload="metadata"></video>' : m.type === 'image' ? '' : '<div class="hint" style="padding:30px 10px">♫</div>';
      var bg = m.type === 'image' ? ' style="background-image:url(' + JSON.stringify(m.img.src || (m.img.toDataURL ? m.img.toDataURL('image/jpeg', 0.6) : '')) + ')"' : '';
      var tag = (m.nature === 'demo' ? '<span class="tag demo">DÉMO</span>' : m.origine === 'genere-ia' ? '<span class="tag ia">généré par IA</span>' : m.origine === 'genere-local' ? '<span class="tag ok">moteur local</span>' : '<span class="tag">' + esc(ST.libelleOrigine(m.origine)) + '</span>') + (m.consigneEmbarquee ? ' <span class="tag ok" title="Consigne et réglages écrits dans les métadonnées du fichier vidéo">consigne embarquée</span>' : '');
      return '<div class="libitem"><div class="vis"' + bg + '>' + vis + '</div><div class="meta"><b title="' + esc(m.name) + '">' + esc(m.name) + '</b>' + tag + (m.duree ? ' · ' + m.duree.toFixed(1) + ' s' : '') + (m.type === 'video' ? ' · ' + (m.aAudio ? 'avec son' : 'sans son') : '') + (m.prompt ? '<br><small>' + esc(m.prompt.slice(0, 90)) + '</small>' : '') + '</div>' +
        '<div class="acts">' + (m.type !== 'audio' ? '<button class="btn small" data-lib="monter" data-mid="' + m.id + '">Au montage</button>' : '') + (m.type === 'video' ? '<button class="btn ghost small" data-lib="voir" data-mid="' + m.id + '">Voir</button>' : '') + (m.prompt ? '<button class="btn ghost small" data-lib="reprendre" data-mid="' + m.id + '" title="Remettre cette consigne dans Générer">Réutiliser la consigne</button>' : '') + (m.blob ? '<button class="btn ghost small" data-lib="dl" data-mid="' + m.id + '">Télécharger</button>' : '') + '<button class="btn ghost small" data-lib="suppr" data-mid="' + m.id + '">Retirer</button></div></div>';
    }).join('') || '<p class="empty">Médiathèque vide.</p>';
  }
  function brancherMedias() {
    $('#libFiltre').addEventListener('change', rendreMedias);
    $('#libImport').addEventListener('change', function () { [].forEach.call(this.files, function (f) {
      if (/^image\//.test(f.type)) ST.ajouterImage(f, f.name, { origine: 'importe' }, false).then(function (m) { persisterMedia(m); rendreMedias(); });
      else if (/^video\//.test(f.type)) ST.ajouterVideo(f, f.name, { origine: 'importe' }, false).then(function (m) { persisterMedia(m); rendreMedias(); }).catch(function (e) { ST.status(e.message, 0, 1); });
      else if (/^audio\//.test(f.type)) ST.ajouterPisteAudio(f, f.name, 'importe');
    }); this.value = ''; });
    $('#libGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-lib]'); if (!b) return; var m = ST.media(b.getAttribute('data-mid')), a = b.getAttribute('data-lib'); if (!m) return;
      if (a === 'monter') { ST.S.clips.push(ST.nouveauClip(m)); ST.snap(); ST.renderAll(); ST.status('Ajouté à la timeline'); }
      if (a === 'voir') { vue('generer'); montrerResultat(m.id); }
      if (a === 'reprendre') { vue('generer'); if (A.mode === 'v1') document.querySelector('.segb[data-mode="t2v"]').click(); $('#genPrompt').value = m.prompt; $('#genPromptFinal').value = m.prompt; ST.status('Consigne reprise du fichier ' + m.name); }
      if (a === 'dl') ST.dl(m.blob, m.name);
      if (a === 'suppr') { m.supprime = true; ST.S.clips = ST.S.clips.filter(function (c) { return c.mid !== m.id; }); ST.snap(); ST.renderAll(); rendreMedias(); }
    });
    ST.ecouter(function (ev) { if (ev === 'media' && document.body.classList.contains('vue-medias')) rendreMedias(); });
  }

  // ------------------------------------------------------------------ audio et voix
  function rendreAudio() {
    var S = ST.S, l = [];
    var mu = ST.musique(); if (mu.blob) l.push(['♪ ' + (S.audio.name || 'musique'), 'importé']);
    var vo = ST.voix(); if (vo.blob) l.push(['🎙 voix off', 'enregistré au micro']);
    if (S.audio.gen !== 'none') l.push(['nappe « ' + S.audio.gen + ' »', 'généré localement (synthèse du navigateur)']);
    S.audioTracks.forEach(function (t) { var m = ST.media(t.mid); if (m) l.push(['♫ ' + m.name, ST.libelleOrigine(m.origine)]); });
    S.clips.forEach(function (c) { var m = ST.media(c.mid); if (m && m.type === 'video') l.push(['▶ ' + m.name, m.aAudio ? (c.muet ? 'piste audio coupée' : 'piste audio d’origine (décodée)') : 'aucune piste audio dans le fichier']); });
    $('#audioSources').innerHTML = l.map(function (x) { return '<div class="res"><span class="rnm">' + esc(x[0]) + '</span><span class="rsz">' + esc(x[1]) + '</span></div>'; }).join('') || '<p class="empty">Aucun son dans le montage.</p>';
    var v = $('#ttsVoix'); if (!v.options.length) {
      v.innerHTML = '<option value="piper:siwis">Piper « siwis » (local, gratuit) — fichier</option><option value="piper:gilles">Piper « gilles » (local, gratuit) — fichier</option>' +
        (window.speechSynthesis ? speechSynthesis.getVoices().filter(function (x) { return /^fr/i.test(x.lang); }).map(function (x) { return '<option value="nav:' + esc(x.name) + '">' + esc(x.name) + ' — écoute seulement</option>'; }).join('') : '');
    }
  }
  function brancherAudio() {
    $('#btnTts').addEventListener('click', async function () {
      var txt = $('#ttsTexte').value.trim(), v = $('#ttsVoix').value; if (!txt) return;
      if (v.indexOf('nav:') === 0) { var u = new SpeechSynthesisUtterance(txt); u.voice = speechSynthesis.getVoices().filter(function (x) { return x.name === v.slice(4); })[0]; speechSynthesis.speak(u); $('#ttsEtat').textContent = 'Écoute avec la voix du navigateur : elle ne peut pas être enregistrée dans le montage. Choisissez Piper pour un fichier.'; return; }
      this.disabled = true; $('#ttsEtat').textContent = 'Voix en cours (Piper, sur le serveur local)…';
      try { var r = await fetch(A.serveur + '/api/voix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texte: txt, voix: v.split(':')[1] }) });
        if (!r.ok) { var j = await r.json().catch(function () { return {}; }); throw new Error(j.erreur || r.status); }
        ST.ajouterPisteAudio(await r.blob(), 'voix-' + nomFichier(txt) + '.wav', 'genere-local'); $('#ttsEtat').textContent = 'Voix ajoutée au montage à la tête de lecture (généré localement, Piper).'; rendreAudio(); }
      catch (e) { $('#ttsEtat').textContent = 'Voix impossible : ' + e.message + ' — le serveur local est-il lancé ?'; }
      this.disabled = false;
    });
    $('#btnDialoguesSubs').addEventListener('click', function () { dialoguesVersSousTitres(); ST.snap(); ST.renderAll(); ST.status('Sous-titres créés depuis les dialogues du storyboard'); });
  }

  // ------------------------------------------------------------------ historique
  function rendreHistorique() {
    var f = $('#histFiltre').value;
    var l = gest.taches.filter(function (t) { return f === 'tout' || (f === 'actives' ? /attente|envoi|encours|finalisation/.test(t.etat) : t.etat === f); });
    $('#histListe').innerHTML = l.map(function (t) {
      var actif = /attente|envoi|encours|finalisation/.test(t.etat);
      return '<tr><td>' + heure(t.creeLe) + '</td><td>' + esc(t.fournisseur) + '</td><td>' + esc(t.modeleNom) + (t.nature === 'demo' ? ' <span class="tag demo">DÉMO</span>' : '') + '</td><td>' + esc(t.mode) + '</td><td class="st-' + t.etat + '">' + esc(t.libelle) + (t.erreur ? '<br><small>' + esc(t.erreur) + '</small>' : '') + '</td><td>' + esc(t.cout || '') + '</td><td>' + (t.resultatMediaId && ST.media(t.resultatMediaId) ? '<button class="btn ghost small" data-h="ouvrir" data-id="' + t.id + '">Ouvrir</button>' : '—') + '</td><td>' +
        (actif ? '<button class="btn ghost small" data-h="annuler" data-id="' + t.id + '">Annuler</button>' : (t.demande ? '<button class="btn ghost small" data-h="relancer" data-id="' + t.id + '">Relancer</button>' : '')) + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty">Aucune génération.</td></tr>';
  }
  function brancherHistorique() {
    $('#histFiltre').addEventListener('change', rendreHistorique);
    $('#histListe').addEventListener('click', function (e) {
      var b = e.target.closest('[data-h]'); if (!b) return; var id = b.getAttribute('data-id'), a = b.getAttribute('data-h');
      if (a === 'annuler') gest.annuler(id);
      if (a === 'relancer') { try { gest.relancer(id); } catch (er) { ST.status(er.message, 0, 1); } }
      if (a === 'ouvrir') { var t = gest.trouver(id); vue('generer'); A.derniere = id; afficherEtat(t); montrerResultat(t.resultatMediaId); }
      rendreHistorique();
    });
    $('#btnHistJson').addEventListener('click', function () { ST.dl(new Blob([JSON.stringify(K.sansSecrets(gest.exporter()), null, 1)], { type: 'application/json' }), 'historique-generations.json'); });
    $('#btnHistCsv').addEventListener('click', function () {
      var l = [['lancee', 'fournisseur', 'modele', 'mode', 'statut', 'cout', 'duree_s', 'erreur']].concat(gest.taches.map(function (t) { return [new Date(t.creeLe).toISOString(), t.fournisseur, t.modeleNom, t.mode, t.libelle, t.cout || '', t.dureeMs ? Math.round(t.dureeMs / 1000) : '', t.erreur || '']; }));
      ST.dl(new Blob(['﻿' + l.map(function (r) { return r.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(';'); }).join('\n')], { type: 'text/csv' }), 'historique-generations.csv');
    });
  }

  // ------------------------------------------------------------------ projet : sauvegarde, réouverture, migration, autosauvegarde
  function reglagesCourants() { var S = ST.S; return { aspect: S.aspect, quality: S.quality, fps: S.fps, bitrate: S.bitrate, grade: S.grade, fit: S.fit, vignette: S.vignette, grain: S.grain, dust: S.dust, bloom: S.bloom, shake: S.shake, letter: S.letter, audio: { vol: S.audio.vol, fadeIn: S.audio.fadeIn, fadeOut: S.audio.fadeOut, volVoice: S.audio.volVoice, gen: S.audio.gen, volGen: S.audio.volGen } }; }
  async function donneeMedia(m, enDataUrl) {
    var b = m.blob;
    if (!b && m.type === 'image') b = await new Promise(function (r) { var c = document.createElement('canvas'); c.width = m.img.width; c.height = m.img.height; c.getContext('2d').drawImage(m.img, 0, 0); c.toBlob(r, 'image/png'); });
    if (!b) return null;
    return enDataUrl ? K.blobVersDataUrl(b) : b;
  }
  /** instantané du projet : `enDataUrl` vrai pour le fichier .json (portable), faux pour IndexedDB (Blobs bruts, rapide). */
  async function instantane(enDataUrl) {
    var S = ST.S, utiles = {};
    S.clips.forEach(function (c) { utiles[c.mid] = 1; }); S.audioTracks.forEach(function (t) { utiles[t.mid] = 1; });
    A.scenes.forEach(function (s) { s.variantes.forEach(function (v) { utiles[v] = 1; }); });
    gest.taches.forEach(function (t) { if (t.resultatMediaId) utiles[t.resultatMediaId] = 1; });
    var medias = [];
    for (var i = 0; i < S.media.length; i++) {
      var m = S.media[i]; if (m.supprime && !utiles[m.id]) continue;
      var data = await donneeMedia(m, enDataUrl); if (!data) continue;
      var e = { id: m.id, nom: m.name, type: m.type, origine: m.origine, nature: m.nature, prompt: m.prompt, modele: m.modele, tacheId: m.tacheId, duree: m.duree, aAudio: m.aAudio, supprime: !!m.supprime, consigneEmbarquee: !!m.consigneEmbarquee };
      e[enDataUrl ? 'data' : 'blob'] = data; medias.push(e);
    }
    var mu = ST.musique(), vo = ST.voix();
    var p = { format: K.FORMAT, v: K.VERSION, nom: A.nomProjet, creeLe: A.creeLe || Date.now(), majLe: Date.now(), reglages: reglagesCourants(), medias: medias,
      clips: JSON.parse(JSON.stringify(S.clips)), texts: JSON.parse(JSON.stringify(S.texts)), sousTitres: JSON.parse(JSON.stringify(S.subs)), pistesAudio: JSON.parse(JSON.stringify(S.audioTracks)),
      musique: mu.blob ? { nom: S.audio.name, data: enDataUrl ? await K.blobVersDataUrl(mu.blob) : mu.blob } : null, voix: vo.blob ? { data: enDataUrl ? await K.blobVersDataUrl(vo.blob) : vo.blob } : null,
      scenes: JSON.parse(JSON.stringify(A.scenes)), personnages: JSON.parse(JSON.stringify(A.personnages)), taches: gest.exporter() };
    return K.sansSecrets(p);
  }
  function versBlob(e) { return e.blob || (e.data ? K.dataUrlVersBlob(e.data) : null); }
  async function charger(brut, source) {
    var mig = K.migrer(brut), p = mig.projet, S = ST.S;
    ST.playing(false);
    S.media.forEach(function (m) { if (m.el && m.el.pause) m.el.pause(); });
    S.media = []; S.clips = []; S.texts = []; S.subs = []; S.audioTracks = []; S.sel = null; S.selText = null; S.time = 0;
    ST.oublierMusique(); ST.oublierVoix();
    var rg = p.reglages || {}; for (var k in rg) if (k !== 'audio' && rg[k] != null) S[k] = rg[k]; if (rg.audio) for (var a in rg.audio) S.audio[a] = rg.audio[a];
    ['#selAspect', 'aspect', '#selQuality', 'quality', '#selFps', 'fps', '#selBitrate', 'bitrate', '#selGrade', 'grade', '#selFit', 'fit'].forEach(function (x, i, arr) { if (i % 2 === 0) $(x).value = String(S[arr[i + 1]]); });
    var echecs = 0;
    for (var i = 0; i < p.medias.length; i++) {
      var e = p.medias[i], b = versBlob(e); if (!b) continue;
      var info = { id: e.id, origine: e.origine, nature: e.nature, prompt: e.prompt, modele: e.modele, tacheId: e.tacheId, consigneEmbarquee: !!e.consigneEmbarquee };
      try {
        var m = e.type === 'video' ? await ST.ajouterVideo(b, e.nom, info, false) : e.type === 'audio' ? await ST.ajouterAudioMedia(b, e.nom, Object.assign(info, { duree: e.duree })) : await ST.ajouterImage(b, e.nom, info, false);
        if (e.supprime) m.supprime = true; if (e.note) m.note = e.note;
      } catch (er) { echecs++; }
    }
    S.clips = (p.clips || []).filter(function (c) { return ST.media(c.mid); }).map(function (c) { c.kf = c.kf || []; return c; });
    S.texts = p.texts || []; S.subs = p.sousTitres || []; S.audioTracks = (p.pistesAudio || []).filter(function (t) { return ST.media(t.mid); });
    if (p.musique && versBlob(p.musique)) ST.definirMusique(versBlob(p.musique), p.musique.nom || 'musique');
    if (p.voix && versBlob(p.voix)) ST.definirVoix(versBlob(p.voix));
    A.scenes = p.scenes || []; A.personnages = p.personnages || []; A.nomProjet = p.nom || 'Projet'; A.creeLe = p.creeLe; $('#projNom').value = A.nomProjet;
    gest.restaurer(p.taches || []);
    S.sel = S.clips[0] ? S.clips[0].id : null;
    ST.applySize(); ST.reinitHistorique(); ST.renderAll(); ST.render(0); rendreScenes(); majTaches(); remplirSelectPersos();
    var notes = mig.notes.concat(echecs ? [echecs + ' média(s) illisible(s) ignoré(s).'] : []);
    ST.status((source === 'auto' ? 'Projet restauré' : 'Projet ouvert') + (notes.length ? ' — ' + notes.join(' ') : ''));
    return notes;
  }
  async function sauverProjet() {
    ST.status('Préparation du fichier projet…', 1);
    var p = await instantane(true), b = new Blob([JSON.stringify(p)], { type: 'application/json' }), n = nomFichier(A.nomProjet) + '-' + Date.now() + '.massamba.json';
    ST.addResult(n, b, 'PROJET'); ST.dl(b, n); ST.status('Projet sauvegardé (' + (b.size / 1048576).toFixed(1) + ' Mo, médias compris)'); rendreExports();
  }
  function ouvrirFichierProjet(f) { var r = new FileReader(); r.onload = function () { try { charger(JSON.parse(r.result), 'fichier').catch(function (e) { ST.status(e.message, 0, 1); }); } catch (e) { ST.status('Fichier projet invalide', 0, 1); } }; r.readAsText(f); }
  var minuterie = null, restaurationFaite = false;
  function sauverPlusTard() { if (!restaurationFaite) return; clearTimeout(minuterie); minuterie = setTimeout(autoSauver, 2500); }
  async function autoSauver() { try { await K.idb.mettre('etat', 'projet', await instantane(false)); $('#projAuto').textContent = 'Sauvegarde automatique dans ce navigateur : ' + new Date().toLocaleTimeString('fr-FR'); } catch (e) { $('#projAuto').textContent = 'Sauvegarde automatique indisponible (' + e.message + ').'; } }
  function persisterMedia() { sauverPlusTard(); }
  function rendreExports() {
    var l = $$('#results .res'); $('#exportsListe').innerHTML = l.length ? l.map(function (a) { return a.outerHTML; }).join('') : '<p class="empty">Aucun export.</p>';
  }
  function brancherProjets() {
    $('#btnSaveProj').addEventListener('click', sauverProjet); $('#btnProjSauver').addEventListener('click', sauverProjet);
    $('#projFile').addEventListener('change', function () { if (this.files[0]) ouvrirFichierProjet(this.files[0]); this.value = ''; });
    $('#projFile2').addEventListener('change', function () { if (this.files[0]) ouvrirFichierProjet(this.files[0]); this.value = ''; });
    $('#projNom').addEventListener('input', function () { A.nomProjet = this.value; sauverPlusTard(); });
    $('#btnProjNouveau').addEventListener('click', async function () { if (!(await confirmer('Nouveau projet', '<p>Le projet en cours sera remplacé (pensez à le sauver). Continuer ?</p>'))) return; await charger({ format: K.FORMAT, v: K.VERSION, nom: 'Nouveau film', reglages: K.REGLAGES_DEFAUT, medias: [], clips: [], texts: [] }, 'nouveau'); autoSauver(); });
    ST.ecouter(function (ev) { if (ev === 'modifie' || ev === 'media') sauverPlusTard(); if (ev === 'resultat') rendreExports(); });
  }

  // ------------------------------------------------------------------ export final (MP4 validé / WebM)
  async function lancerExport() {
    vue('montage'); document.querySelector('.tab[data-tab="out"]').click();
    $('#progressWrap').style.display = 'block'; $('#exportRapport').innerHTML = '';
    var prog = function (p, txt) { $('#progressBar>i').style.width = Math.round(p * 100) + '%'; $('#progressTxt').textContent = Math.round(p * 100) + ' % — ' + (txt || ''); };
    try {
      var fmt = $('#selExportFormat').value;
      var r = await X.exporter({ forcerWebm: fmt === 'webm', progres: prog, nom: nomFichier(A.nomProjet), transcoder: fmt !== 'webm' && conversionServeur() ? transcoderServeur : null, consigne: champsMontage() });
      $('#exportRapport').innerHTML = '<b class="' + (r.rapport.ok ? 'ok' : 'ko') + '">' + (r.rapport.ok ? 'Export validé' : 'Export à vérifier') + '</b> — ' + esc(r.chemin) + '<br>' + r.rapport.details.map(esc).join('<br>') + (r.rapport.sources && r.rapport.sources.length ? '<br>Son mixé : ' + esc(r.rapport.sources.join(', ')) : '<br>Aucun son dans le montage.');
      ST.dl(r.blob, r.nom); ST.status(r.rapport.ok ? 'Vidéo exportée et validée' : 'Vidéo exportée — contrôles à revoir', 0, !r.rapport.ok); rendreExports();
    } catch (e) { $('#exportRapport').innerHTML = '<b class="ko">Export impossible</b> — ' + esc(e.message); ST.status('Export impossible', 0, 1); }
    setTimeout(function () { $('#progressWrap').style.display = 'none'; }, 1500);
  }

  // ------------------------------------------------------------------ moteurs IA, connexions, budget, démo
  function rendreRegistre() {
    $('#regTable').innerHTML = R.MODELES.map(function (m) {
      var info = A.caps[m.id], c = (info && info.capacites) || m.fixe || {}, etat = m.voie === 'navigateur' ? (info ? info.etat : 'non vérifié') : m.voie === 'serveur' ? (A.srv ? (m.serveur === 'moteur-v1' ? (A.srv.fournisseurs['moteur-v1'].configure ? 'disponible (local)' : 'non configuré') : (A.srv.fournisseurs[m.serveur] && A.srv.fournisseurs[m.serveur].actif ? 'actif' : 'inactif')) : 'serveur non joint') : m.voie === 'demo' ? 'local' : 'gratuit';
      var oui = function (v) { return '<td class="' + (v ? 'oui' : 'non') + '">' + (v ? 'oui' : v === false ? 'non' : '?') + '</td>'; };
      return '<tr><td>' + esc(m.fournisseur) + '</td><td>' + esc(m.nom) + '</td>' + oui(c.t2v) + oui(c.i2v) + oui(c.fin) + '<td>' + (c.dureeMin != null ? c.dureeMin + '–' + c.dureeMax + ' s' : c.durees ? esc([].concat(c.durees).join(', ')) : '—') + '</td><td>' + esc(m.sortie || '') + '</td><td>' + esc(m.prix || '') + '</td><td>' + esc(m.licence || '') + '</td><td>' + esc(m.limites || '') + '</td><td>' + esc(etat + (info && info.message ? ' — ' + info.message : '')) + '</td><td>' + esc(m.verifie || '') + '</td></tr>';
    }).join('');
  }
  async function testerServeur(silencieux) {
    A.serveur = $('#srvUrl').value.replace(/\/$/, '');
    try { var r = await fetch(A.serveur + '/api/sante'); if (!r.ok) throw new Error(r.status); A.srv = await r.json();
      var f = A.srv.fournisseurs; $('#srvEtat').innerHTML = 'Serveur joint. Voies payantes : <b>' + (A.srv.payantAutorise ? 'autorisées (plafond ' + A.srv.plafondPayantJour + '/jour)' : 'désactivées') + '</b>.<br>' + Object.keys(f).map(function (k) { return esc(f[k].nom) + ' : ' + (f[k].configure ? (f[k].actif ? 'actif' : 'configuré, inactif') : 'non configuré'); }).join(' · ') + '<br>Voix Piper locale : ' + (A.srv.voix && A.srv.voix.piper ? 'disponible' : 'absente');
    } catch (e) { A.srv = null; if (!silencieux) $('#srvEtat').textContent = 'Serveur local injoignable à ' + A.serveur + ' (' + e.message + '). Les moteurs gratuits du navigateur restent utilisables.'; }
    remplirModeles(); rendreRegistre(); majCodecs();
  }
  function majCodecs() {
    if (!X) return;
    X.codecsDisponibles(ST.canvas().width, ST.canvas().height, ST.S.fps, ST.S.bitrate).then(function (c) {
      var nav = c.chemin === 'mp4' ? 'Encodeur du navigateur : ' + c.video.codec + (c.audio ? ' + ' + c.audio.codec : ' (sans encodeur audio)') + ' — MP4 image par image.' : 'WebCodecs absent : export WebM en temps réel.';
      var h264 = c.chemin === 'mp4' && /^avc1/.test(c.video.codec);
      $('#exportCodecs').textContent = nav + (h264 ? '' : conversionServeur() ? ' Conversion H.264 + AAC par le serveur local (ffmpeg) : active.' : ' Conversion H.264 : lancez le serveur local (ffmpeg) pour l’obtenir.') + ' Consigne embarquée dans le fichier.';
    });
  }
  function brancherMoteurs() {
    $('#btnRegVerifier').addEventListener('click', async function () { this.disabled = true; for (var i = 0; i < R.MODELES.length; i++) { var m = R.MODELES[i]; if (m.voie === 'navigateur') { A.caps[m.id] = await F.FournisseurSpace.decrire(m, { jeton: A.jeton }); rendreRegistre(); } } this.disabled = false; remplirModeles(); });
    $('#btnHfVerifier').addEventListener('click', async function () {
      var j = $('#hfJeton').value.trim(); if (!j) return;
      try { var r = await fetch('https://huggingface.co/api/whoami-v2', { headers: { Authorization: 'Bearer ' + j } });
        if (r.status === 401) throw new Error('jeton refusé'); if (!r.ok) throw new Error('vérification impossible (' + r.status + ')');
        var w = await r.json(); A.jeton = j; $('#hfJeton').value = ''; $('#hfEtat').textContent = 'Compte « ' + (w.name || '?') + ' » connecté pour cette session (jeton en mémoire seulement, effacé à la fermeture de la page).'; }
      catch (e) { A.jeton = null; $('#hfEtat').textContent = 'Jeton Hugging Face : ' + e.message + '.'; }
    });
    $('#btnHfOublier').addEventListener('click', function () { A.jeton = null; $('#hfJeton').value = ''; $('#hfEtat').textContent = 'Jeton oublié. File anonyme.'; });
    $('#btnSrvTester').addEventListener('click', function () { testerServeur(false); });
    $('#budgetMax').addEventListener('change', function () { A.budgetMax = Math.max(0, parseFloat(this.value) || 0); majCout(); });
    $('#limiteTaches').addEventListener('change', function () { A.limiteTaches = Math.max(1, parseInt(this.value, 10) || 30); majCout(); });
    var basculer = function (v) { A.demo = v; $('#chkDemo').checked = v; $('#modeChip').textContent = v ? 'MODE DÉMO' : 'Moteurs réels'; $('#modeChip').classList.toggle('demo', v); remplirModeles(); };
    $('#chkDemo').addEventListener('change', function () { basculer(this.checked); });
    $('#modeChip').addEventListener('click', function () { basculer(!A.demo); });
    $('#jobsChip').addEventListener('click', function () { vue('historique'); });
  }

  // ------------------------------------------------------------------ démarrage
  function demarrer() {
    ST.init();
    $$('.nav').forEach(function (b) { b.addEventListener('click', function () { vue(b.getAttribute('data-vue')); }); });
    $('#btnHelp').addEventListener('click', function () { $('#helpModal').classList.add('on'); }); $('#btnHelpClose').addEventListener('click', function () { $('#helpModal').classList.remove('on'); });
    $('#helpModal').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('on'); });
    $('#pickerFermer').addEventListener('click', function () { $('#pickerModal').classList.remove('on'); });
    $('#btnExport').addEventListener('click', lancerExport); $('#btnExport2').addEventListener('click', lancerExport);
    brancherGenerer(); brancherStoryboard(); brancherPersos(); brancherMedias(); brancherAudio(); brancherHistorique(); brancherProjets(); brancherMoteurs();
    // Autopilote (23/10/2026) : il pilote les mêmes fonctions que l'utilisateur (storyboard, tâches, montage, export)
    if (M.autopilote) M.autopilote.brancher({ A: A, gest: gest, ST: ST, R: R, F: F, P: P, K: K, X: X, generer: generer, genererScene: genererScene, nouvelleScene: nouvelleScene,
      promptScene: promptScene, placerScenes: placerScenes, rendreScenes: rendreScenes, champsMontage: champsMontage, chargerCatalogueV1: chargerCatalogueV1,
      confirmer: confirmer, vue: vue, nomFichier: nomFichier, sauverPlusTard: sauverPlusTard,
      exporter: function (prog, consigne) { return X.exporter({ forcerWebm: false, progres: prog, nom: nomFichier(A.nomProjet), transcoder: conversionServeur() ? transcoderServeur : null, consigne: consigne }); } });
    window.addEventListener('offline', function () { ST.status('Hors ligne : les générations en cours échoueront proprement', 0, 1); });
    window.addEventListener('online', function () { ST.status('Connexion rétablie'); });
    remplirModeles(); remplirSelectPersos(); ficheVersForm(null); majTaches();
    majCodecs();
    K.idb.lire('etat', 'projet').then(function (p) { return p ? charger(p, 'auto') : null; }).catch(function () { return null; }).then(function () { restaurationFaite = true; });
    if (/^https?:/.test(location.protocol) && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) $('#srvUrl').value = location.origin;
    testerServeur(true);
    window.__MAMS_APP__ = { A: A, gest: gest, vue: vue, autopilote: M.autopilote, generer: generer, charger: charger, instantane: instantane, sauverProjet: sauverProjet, lancerExport: lancerExport, decouper: decouper, placerScenes: placerScenes, toutesLesFiches: toutesLesFiches, testerServeur: testerServeur };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
