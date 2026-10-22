/* MASSAMBA AI MOTION STUDIO — fournisseurs vidéo (interface commune « VideoProvider », 22/10/2026).
 * Chaque fournisseur expose :
 *   capacites(modele)                   → ce que le modèle sait faire (lu en direct ou documenté)
 *   valider(modele, demande)             → liste d'erreurs lisibles (vide = valide)
 *   soumettre(modele, demande, suivi)    → { video: Blob, graine, meta } ; suivi({etat, rang, attenteS, progression, message})
 *   annuler(idTache)                     → quand le service le permet
 * États remontés : 'envoi' | 'encours' | 'finalisation' (le gestionnaire de tâches ajoute attente, terminee, echec, annulee).
 * Aucun pourcentage inventé : la progression n'est transmise que si le service la fournit. */
(function (racine) {
  'use strict';
  var M = racine.MAMS || {};
  var G = M.gradio || (typeof require === 'function' ? require('./gradio.js') : null);
  var R = M.registre || (typeof require === 'function' ? require('./registre.js') : null);

  var cacheDirect = {};   // id modèle → { etat, capacites, desc, cfg, t }

  function phase(p) { return p === 'envoi' ? 'envoi' : p === 'reception' ? 'finalisation' : 'encours'; }

  /** valide une demande contre les capacités réelles (et non supposées) du modèle. */
  function valider(modele, cap, d) {
    var err = [];
    if (!cap) return ['Capacités du moteur inconnues : vérifiez sa disponibilité (Paramètres).'];
    if (d.mode === 'i2v' && !cap.i2v) err.push('Ce moteur ne fait pas image → vidéo.');
    if (d.mode === 't2v' && !cap.t2v) err.push('Ce moteur ne fait pas texte → vidéo.');
    if (d.mode === 'i2v' && !d.image) err.push('Importez une image de départ.');
    if (d.fin && !cap.fin) err.push('Ce moteur n’accepte pas d’image de fin.');
    if (cap.finObligatoire && !d.fin) err.push('Ce moteur exige une image de fin.');
    if (!d.prompt || !String(d.prompt).trim()) err.push('Écrivez une consigne.');
    if (String(d.prompt || '').length > 2000) err.push('Consigne trop longue (2 000 caractères au plus).');
    if (cap.dureeMin != null && d.dureeS < cap.dureeMin) err.push('Durée minimale : ' + cap.dureeMin + ' s.');
    if (cap.dureeMax != null && d.dureeS > cap.dureeMax) err.push('Durée maximale : ' + cap.dureeMax + ' s.');
    if (d.image && d.image.size > 10 * 1024 * 1024) err.push('Image trop lourde (10 Mo au plus).');
    if (d.image && d.image.type && !/^image\/(png|jpe?g|webp)$/.test(d.image.type)) err.push('Format d’image accepté : JPG, PNG ou WEBP.');
    return err;
  }

  // ------------------------------------------------------------------ Space Gradio (gratuit, depuis le navigateur)
  var FournisseurSpace = {
    nom: 'space',
    async decrire(modele, o) {
      var c = cacheDirect[modele.id];
      if (c && Date.now() - c.t < 10 * 60 * 1000 && c.etat === 'disponible') return c;
      c = await R.verifierEnDirect(modele, G, o || {}); c.t = Date.now(); cacheDirect[modele.id] = c; return c;
    },
    async soumettre(modele, d, suivi, o) {
      o = o || {};
      var info = await this.decrire(modele, o);
      if (info.etat !== 'disponible') throw new Error(info.message || ('Moteur ' + info.etat + '.'));
      var err = valider(modele, info.capacites, d); if (err.length) throw new Error(err.join(' '));
      var largeur = d.largeur, hauteur = d.hauteur;
      var vals = R.construire(info.desc, { image: d.image, fin: d.fin, audio: d.audio, prompt: d.prompt, negatif: d.negatif, dureeS: d.dureeS,
        graine: d.graine, largeur: largeur, hauteur: hauteur, mode: d.mode, etapes: d.etapes }, modele.extra);
      var r = await G.appeler(modele.space, modele.api, vals, { cfg: info.cfg, jeton: o.jeton, signal: o.signal, fetch: o.fetch,
        onEtat: function (e) { suivi && suivi({ etat: phase(e.phase), rang: e.rang, attenteS: e.attenteS, progression: e.progression }); } });
      return { video: r.video, graine: r.graine, meta: { source: modele.space, version: info.version } };
    }
  };

  // ------------------------------------------------------------------ chaîne texte → image → vidéo (gratuite)
  var FournisseurChaine = {
    nom: 'chaine',
    async soumettre(modele, d, suivi, o) {
      o = o || {}; var f = o.fetch || fetch;
      suivi && suivi({ etat: 'envoi', message: 'Étape 1/2 : image de départ (Pollinations, gratuit)…' });
      var dims = d.format === '9:16' ? [512, 896] : d.format === '1:1' ? [768, 768] : [896, 512];
      var url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(d.promptImage || d.prompt) +
        '?width=' + dims[0] + '&height=' + dims[1] + '&nologo=true&model=sana' + (d.graine != null ? '&seed=' + d.graine : '');
      var ri = await f(url, { signal: o.signal });
      if (!ri.ok) throw new Error('Image de départ refusée par Pollinations (' + ri.status + ').');
      var img = await ri.blob(); try { img.name = 'depart-pollinations.jpg'; } catch (e) { /* Blob figé */ }
      o.surImage && o.surImage(img);
      suivi && suivi({ etat: 'encours', message: 'Étape 2/2 : animation de l’image (Wan 2.2)…' });
      var wan = R.trouver('wan22-i2v-rapide');
      var r = await FournisseurSpace.soumettre(wan, { mode: 'i2v', image: img, prompt: d.prompt, negatif: d.negatif, dureeS: d.dureeS, graine: d.graine }, suivi, o);
      r.meta.imageIntermediaire = img; r.meta.etapes = ['Pollinations (sana)', 'Wan 2.2']; return r;
    }
  };

  // ------------------------------------------------------------------ serveur local (clés secrètes côté serveur)
  var FournisseurServeur = {
    nom: 'serveur',
    base: function (o) { return (o && o.serveur) || (racine.location && /^https?:/.test(racine.location.protocol) ? '' : 'http://127.0.0.1:8787'); },
    async sante(o) {
      var f = (o && o.fetch) || fetch;
      var r = await f(this.base(o) + '/api/sante', { signal: o && o.signal });
      if (!r.ok) throw new Error('Serveur local injoignable (' + r.status + ').');
      return r.json();
    },
    async soumettre(modele, d, suivi, o) {
      o = o || {}; var f = o.fetch || fetch; var b = this.base(o);
      var fd = new FormData();
      fd.append('demande', JSON.stringify({ fournisseur: modele.serveur, modele: modele.modele || null, mode: d.mode, prompt: d.prompt, negatif: d.negatif,
        dureeS: d.dureeS, format: d.format, graine: d.graine, confirmationCout: !!d.confirmationCout }));
      if (d.image) fd.append('image', d.image, 'depart.png');
      if (d.fin) fd.append('fin', d.fin, 'fin.png');
      suivi && suivi({ etat: 'envoi' });
      var r = await f(b + '/api/taches', { method: 'POST', body: fd, signal: o.signal });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(j.erreur || ('Serveur : refus (' + r.status + ').'));
      var id = j.id; o.surId && o.surId(id);
      for (;;) {
        if (o.signal && o.signal.aborted) throw new Error('Génération annulée.');
        await new Promise(function (res) { setTimeout(res, o.intervalleMs || 3000); });
        var s = await f(b + '/api/taches/' + encodeURIComponent(id), { signal: o.signal });
        var t = await s.json();
        if (t.etat === 'terminee') break;
        if (t.etat === 'echec') throw new Error(t.erreur || 'Échec chez le fournisseur.');
        if (t.etat === 'annulee') throw new Error('Génération annulée.');
        suivi && suivi({ etat: t.etat === 'envoi' ? 'envoi' : 'encours', progression: t.progression, message: t.message });
      }
      suivi && suivi({ etat: 'finalisation' });
      var v = await f(b + '/api/taches/' + encodeURIComponent(id) + '/video', { signal: o.signal });
      if (!v.ok) throw new Error('Vidéo indisponible sur le serveur (' + v.status + ').');
      return { video: await v.blob(), graine: null, meta: { source: 'serveur:' + modele.serveur, idFournisseur: id } };
    },
    async annuler(id, o) {
      var f = (o && o.fetch) || fetch;
      await f(this.base(o) + '/api/taches/' + encodeURIComponent(id), { method: 'DELETE' });
    }
  };

  // ------------------------------------------------------------------ mode démo (honnête)
  // Fabrique un petit WebM LOCAL : zoom/panoramique sur l'image ou dégradé + bandeau « DÉMO — pas une génération IA »
  // incrusté dans chaque image. Le résultat porte nature = 'demo' et n'est jamais compté comme une génération IA.
  var FournisseurDemo = {
    nom: 'demo',
    async soumettre(modele, d, suivi, o) {
      o = o || {};
      if (typeof document === 'undefined' || !racine.MediaRecorder) throw new Error('Mode démo indisponible dans cet environnement.');
      suivi && suivi({ etat: 'envoi', message: 'Tâche simulée (démo)' });
      var img = null;
      if (d.image) img = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = URL.createObjectURL(d.image); });
      var W = d.format === '9:16' ? 360 : 640, H = d.format === '9:16' ? 640 : d.format === '1:1' ? 640 : 360;
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var g = cv.getContext('2d');
      var dur = Math.max(1, Math.min(6, Number(d.dureeS) || 3)), fps = 24;
      var flux = cv.captureStream(fps); var mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      var rec = new MediaRecorder(flux, { mimeType: mime, videoBitsPerSecond: 2500000 }); var morceaux = [];
      rec.ondataavailable = function (e) { if (e.data.size) morceaux.push(e.data); };
      var fin = new Promise(function (res) { rec.onstop = res; });
      rec.start(250); suivi && suivi({ etat: 'encours', message: 'Animation locale de démonstration' });
      var t0 = performance.now();
      await new Promise(function (res) {
        function pas() {
          var t = (performance.now() - t0) / 1000, p = Math.min(1, t / dur);
          g.fillStyle = '#05070b'; g.fillRect(0, 0, W, H);
          if (img) {
            var s = 1.05 + 0.15 * p, ar = img.width / img.height, dw, dh;
            if (ar > W / H) { dh = H * s; dw = dh * ar; } else { dw = W * s; dh = dw / ar; }
            g.drawImage(img, (W - dw) / 2 - 20 * p, (H - dh) / 2, dw, dh);
          } else {
            var lg = g.createLinearGradient(0, 0, W, H); lg.addColorStop(0, '#0b1220'); lg.addColorStop(1, 'hsl(' + (190 + 40 * p) + ',70%,35%)');
            g.fillStyle = lg; g.fillRect(0, 0, W, H);
            g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '600 ' + Math.round(W * 0.035) + 'px system-ui'; g.textAlign = 'center';
            g.fillText(String(d.prompt || '').slice(0, 48), W / 2, H / 2);
          }
          g.fillStyle = 'rgba(245,158,11,.92)'; g.fillRect(0, 0, W, Math.round(H * 0.08));
          g.fillStyle = '#111'; g.font = '800 ' + Math.round(H * 0.045) + 'px system-ui'; g.textAlign = 'left';
          g.fillText('DÉMO — animation locale, pas une génération IA', 10, Math.round(H * 0.058));
          if (t < dur && !(o.signal && o.signal.aborted)) requestAnimationFrame(pas); else res();
        }
        requestAnimationFrame(pas);
      });
      rec.stop(); await fin;
      if (o.signal && o.signal.aborted) throw new Error('Génération annulée.');
      suivi && suivi({ etat: 'finalisation' });
      return { video: new Blob(morceaux, { type: 'video/webm' }), graine: null, meta: { source: 'demo', nature: 'demo' } };
    }
  };

  function pour(modele) {
    if (!modele) return null;
    return modele.voie === 'navigateur' ? FournisseurSpace : modele.voie === 'chaine' ? FournisseurChaine
      : modele.voie === 'serveur' ? FournisseurServeur : modele.voie === 'demo' ? FournisseurDemo : null;
  }

  var API = { pour: pour, valider: valider, FournisseurSpace: FournisseurSpace, FournisseurChaine: FournisseurChaine,
    FournisseurServeur: FournisseurServeur, FournisseurDemo: FournisseurDemo, _cache: cacheDirect };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else { racine.MAMS = racine.MAMS || {}; racine.MAMS.fournisseurs = API; }
})(typeof self !== 'undefined' ? self : this);
