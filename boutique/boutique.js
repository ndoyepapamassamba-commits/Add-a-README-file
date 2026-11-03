// Teranga Outils — achat (page produit), paiement Wave au montant exact, téléchargement (commande.html), recherche (index)
(function () {
  'use strict';
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var fcfa = function (n) { return Number(n || 0).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' F'; };
  function texte(el, t) { if (el) el.textContent = t; }

  // Pass des applications TERANGA (../apps/catalogue.json) : slug du produit → application à activer
  var applis = null;
  function chargerApplis() {
    if (!applis) applis = Promise.race([
      fetch('../apps/catalogue.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }),
      new Promise(function (ok) { setTimeout(ok, 5000, null); })
    ]).then(function (j) {
      var m = {};
      ((j && j.applis) || []).forEach(function (a) {
        if (!a || !/^[a-z0-9-]+$/.test(a.dossier || '')) return;
        (a.passes || []).forEach(function (p) { if (p && p.slug) m[p.slug] = { appli: a, pass: p }; });
      });
      return m;
    }).catch(function () { return {}; });
    return applis;
  }
  function el(tag, attrs, contenu) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (contenu != null) e.textContent = contenu;
    return e;
  }
  function copier(v) { return navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(v) : Promise.reject(new Error('presse-papiers')); }
  // Bloc « Ouvrir l'application et activer » d'une commande payée de pass (aussi après les 30 jours de téléchargement)
  function blocActivation(c, pa, j, t) {
    var a = pa.appli, nom = a.nom || 'l\'application', direct = a.lien_direct !== false;
    var base = '../apps/' + a.dossier + '/';
    var lien = direct ? base + '?o=' + encodeURIComponent(c.id) + '&t=' + encodeURIComponent(t) : base + (/^#\/[a-z-]+$/.test(a.ecran_pass_url || '') ? a.ecran_pass_url : '');
    var ecran = a.ecran_pass || 'l\'écran du pass';
    var s = el('section', { class: 'activation', id: 'activation', 'aria-labelledby': 'activation-titre' });
    s.appendChild(el('h2', { id: 'activation-titre' }, 'Activez ' + nom));
    var b = el('a', { class: 'btn', id: 'activer-appli', href: lien }, 'Ouvrir l\'application et activer');
    s.appendChild(b);
    var info = el('p', { id: 'activation-info' }, direct
      ? nom + ' s\'ouvre et vérifie votre commande : la version complète est activée sur ce téléphone. Internet est nécessaire une seule fois.'
      : 'Le lien de cette page est copié, puis ' + nom + ' s\'ouvre : collez le lien dans la case « Lien de votre commande » et touchez « Activer ».');
    s.appendChild(info);
    if (!direct) b.addEventListener('click', function (e) {
      e.preventDefault();
      var aller = function () { location.href = lien; };
      Promise.race([copier(location.href), new Promise(function (ok) { setTimeout(ok, 1500); })]).then(aller, aller);
    });
    var ip = el('p', { class: 'petit' });
    ip.appendChild(el('strong', null, 'Sur iPhone'));
    ip.appendChild(document.createTextNode(', si ' + nom + ' est déjà sur l\'écran d\'accueil : touchez « Copier le lien de cette page », ouvrez ' + nom +
      ' depuis l\'écran d\'accueil, allez dans ' + ecran + ', collez le lien et touchez « Activer ».'));
    s.appendChild(ip);
    var cp = el('button', { class: 'btn secondaire', type: 'button', id: 'copier-lien-commande' }, 'Copier le lien de cette page');
    cp.addEventListener('click', function () { copier(location.href).then(function () { cp.textContent = 'Lien copié'; setTimeout(function () { cp.textContent = 'Copier le lien de cette page'; }, 2000); }).catch(function () {}); });
    s.appendChild(cp);
    var n = String(j.wave || '').replace(/\D/g, '');
    if (/^\d{9}$/.test(n)) {
      var msg = 'Bonjour, j\'ai besoin d\'aide pour activer ' + nom + ' (commande ' + c.id + ').';
      s.appendChild(el('a', { class: 'btn secondaire', id: 'aide-whatsapp', href: 'https://wa.me/221' + n + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener' }, 'Aide sur WhatsApp'));
    }
    s.appendChild(el('p', { class: 'petit' }, 'Gardez le lien de cette page : il active aussi ' + nom + ' sur un nouveau téléphone' + (pa.pass && pa.pass.duree_jours ? ', pendant la durée de votre pass.' : '.')));
    return s;
  }

  // Recherche dans le catalogue
  var rech = $('#recherche');
  if (rech) rech.addEventListener('input', function () {
    var q = rech.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    document.querySelectorAll('.carte').forEach(function (c) { c.hidden = q && c.dataset.cherche.indexOf(q) < 0; });
  });

  // Photo du client (services de retouche) : réduite à 1600 px dans son navigateur avant l'envoi
  function photoReduite(fichier) {
    return new Promise(function (ok, ko) {
      if (!/^image\/(jpeg|png|webp|heic|heif)?/.test(fichier.type || 'image/')) return ko(new Error('Choisissez une photo (JPEG ou PNG).'));
      var url = URL.createObjectURL(fichier), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('Photo illisible : essayez une autre photo (JPEG ou PNG).')); };
      img.src = url;
    });
  }
  document.querySelectorAll('input[type="file"][data-photo]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var ap = document.getElementById(inp.id + '-apercu'); if (!ap) return;
      ap.textContent = '';
      if (inp.files && inp.files[0]) { var im = document.createElement('img'); im.alt = 'Votre photo'; im.src = URL.createObjectURL(inp.files[0]); ap.appendChild(im); }
    });
  });

  // Page produit : commande
  var form = $('#achat');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('#achat-msg'), btn = form.querySelector('button');
    msg.className = 'msg';
    if (!form.cgv.checked) { msg.className = 'msg erreur'; texte(msg, 'Cochez la case pour accepter les conditions de vente.'); return; }
    var reponses = {}, photos = [];
    form.querySelectorAll('[name^="r_"]').forEach(function (c) {
      if (c.type === 'file') { if (c.files && c.files[0]) photos.push({ id: c.name.slice(2), fichier: c.files[0] }); return; }
      if (String(c.value).trim()) reponses[c.name.slice(2)] = c.value;
    });
    var manque = [].slice.call(form.querySelectorAll('[name^="r_"][required]')).filter(function (c) { return !String(c.value).trim(); })[0];
    if (manque) { msg.className = 'msg erreur'; texte(msg, 'Champ à remplir : ' + (form.querySelector('label[for="' + manque.id + '"]') || {}).textContent); manque.focus(); return; }
    btn.disabled = true; texte(msg, photos.length ? 'Préparation de votre photo…' : 'Préparation de votre commande…');
    Promise.all(photos.map(function (p) { return photoReduite(p.fichier).then(function (u) { reponses[p.id] = u; }); }))
      .then(function () {
        texte(msg, 'Préparation de votre commande…');
        return fetch(API + '/commandes', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ produit: form.dataset.produit, nom: form.nom.value, cgv: true, website: form.website.value, reponses: form.dataset.type === 'generateur' ? reponses : undefined }) });
      })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok) throw new Error(x.j && x.j.message || 'Commande impossible pour le moment.');
        var c = x.j.commande;
        try { localStorage.setItem('teranga-outils-' + c.id, c.jeton); localStorage.setItem('teranga-outils-info-' + c.id, JSON.stringify({ titre: (document.querySelector('h1') || {}).textContent || '', le: Date.now() })); } catch (err) { /* navigation privée */ }
        location.href = 'commande.html?o=' + encodeURIComponent(c.id) + '&t=' + encodeURIComponent(c.jeton);
      })
      .catch(function (err) { msg.className = 'msg erreur'; texte(msg, err.message); btn.disabled = false; });
  });

  // Application installable (TERANGA) : fonctionnement hors connexion et bouton « Installer »
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(function () {});
  var invite = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); invite = e; var b = $('#installer'); if (b) b.hidden = false; });
  var bi = $('#installer-btn');
  if (bi) bi.addEventListener('click', function () { if (!invite) return; invite.prompt(); invite.userChoice.then(function () { invite = null; $('#installer').hidden = true; }); });

  // Mes commandes : liste gardée sur ce téléphone
  var lc = $('#liste-commandes');
  if (lc) {
    var ids = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); var m = /^teranga-outils-(TCV-[0-9A-Z]{8})$/.exec(k || ''); if (m) ids.push(m[1]); } } catch (e) { /* stockage indisponible */ }
    lc.textContent = '';
    if (!ids.length) { var p0 = document.createElement('p'); p0.textContent = 'Aucune commande sur ce téléphone pour le moment.'; lc.appendChild(p0); }
    ids.map(function (id) { var info = {}; try { info = JSON.parse(localStorage.getItem('teranga-outils-info-' + id) || '{}'); } catch (e) {} return { id: id, jeton: localStorage.getItem('teranga-outils-' + id), info: info }; })
      .sort(function (a, b) { return (b.info.le || 0) - (a.info.le || 0); })
      .forEach(function (o) {
        var a = document.createElement('a'); a.className = 'carte';
        a.href = 'commande.html?o=' + encodeURIComponent(o.id) + '&t=' + encodeURIComponent(o.jeton || '');
        var h = document.createElement('h3'); h.textContent = o.info.titre || o.id;
        var st = document.createElement('p'); st.textContent = (o.info.le ? new Date(o.info.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' : '') + 'Statut en cours de vérification…';
        a.append(h, st); lc.appendChild(a);
        fetch(API + '/commandes/' + encodeURIComponent(o.id) + '?t=' + encodeURIComponent(o.jeton || ''))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            var c = j && j.commande;
            if (c && c.produit && !o.info.titre) h.textContent = c.produit.titre;
            return chargerApplis().then(function (ap) {
              var pass = c && c.payee && c.produit && ap[c.produit.slug];
              st.textContent = st.textContent.replace('Statut en cours de vérification…', !c ? 'Commande expirée' : pass ? 'Payée · ouvrir pour activer l\'application' : c.purgee ? 'Expirée' : c.payee ? 'Payée · ouvrir pour télécharger' : 'En attente de paiement');
            });
          }).catch(function () { st.textContent = st.textContent.replace('Statut en cours de vérification…', 'Hors connexion'); });
      });
  }

  // Page commande : montant à envoyer, attente du paiement, téléchargements
  var zone = $('#commande');
  if (zone) {
    var p = new URLSearchParams(location.search), id = p.get('o') || '', t = p.get('t') || '';
    var minuteur = 0, essais = 0;
    var afficher = function (j, ap) {
      var c = j.commande;
      texte($('#titre-produit'), c.produit.titre);
      var pa = c.payee && c.produit && ap && ap[c.produit.slug];
      if (pa && c.purgee) {
        // Pass d'application : le mode d'emploi n'est plus téléchargeable, mais le lien active toujours l'application
        clearInterval(minuteur);
        $('#attente').hidden = true; $('#payee').hidden = true;
        if (!$('#activation')) zone.appendChild(blocActivation(c, pa, j, t));
        zone.appendChild(el('p', { class: 'petit' }, 'Le mode d\'emploi en PDF se téléchargeait pendant 30 jours après le paiement ; ce lien reste valable pour activer l\'application.'));
        return;
      }
      if (c.purgee) { zone.innerHTML = '<p class="paiement">Cette commande est expirée : les téléchargements restent ouverts 30 jours après le paiement.</p>'; return; }
      if (c.payee && c.produit.type === 'generateur') {
        $('#attente').hidden = true; $('#payee').hidden = false;
        if (!c.document) { texte($('#payee-texte'), ''); $('#redaction').hidden = false; return; }
        clearInterval(minuteur);
        $('#redaction').hidden = true; $('#document-zone').hidden = false;
        texte($('#payee-texte'), 'Votre document est prêt : lisez-le ci-dessous, copiez-le ou téléchargez-le en Word.');
        var d = c.document, z = $('#document'); z.textContent = '';
        var bloc = document.createElement('div'); bloc.className = 'document';
        var h = document.createElement('h3'); h.textContent = d.titre; bloc.appendChild(h);
        var plain = [d.titre, ''];
        d.sections.forEach(function (s) {
          if (s.titre) { var t = document.createElement('h4'); t.textContent = s.titre; bloc.appendChild(t); plain.push(s.titre); }
          (s.paragraphes || []).forEach(function (x) { var pe = document.createElement('p'); pe.textContent = x; bloc.appendChild(pe); plain.push(x); });
          if ((s.puces || []).length) { var ul = document.createElement('ul'); s.puces.forEach(function (x) { var li = document.createElement('li'); li.textContent = x; ul.appendChild(li); plain.push('• ' + x); }); bloc.appendChild(ul); }
          plain.push('');
        });
        if ((d.images || []).length) {
          var gal = document.createElement('div'); gal.className = 'galerie';
          var retouche = /^retouche-/.test(d.images[0].nom);
          d.images.forEach(function (im, i) {
            var u = API + '/commandes/' + encodeURIComponent(c.id) + '/fichiers/' + encodeURIComponent(im.nom) + '?t=' + encodeURIComponent(t);
            var fig = document.createElement('figure');
            var img = document.createElement('img'); img.src = u; img.alt = retouche ? 'Votre photo retouchée (version ' + (i + 1) + ')' : 'Votre affiche (' + im.format + ')'; img.loading = 'lazy';
            var cap = document.createElement('figcaption');
            var dl = document.createElement('a'); dl.href = u; dl.className = 'btn secondaire'; dl.setAttribute('download', im.nom);
            dl.textContent = 'Télécharger (' + (im.format === '9:16' ? 'format statut' : im.format === '1:1' ? 'format carré' : 'version ' + (i + 1)) + ')';
            cap.appendChild(dl); fig.append(img, cap); gal.appendChild(fig);
          });
          z.appendChild(gal);
          texte($('#payee-texte'), retouche ? 'Vos photos retouchées sont prêtes : téléchargez-les ci-dessous.' : 'Vos affiches sont prêtes : téléchargez-les ci-dessous, avec les textes à publier.');
        }
        z.appendChild(bloc);
        $('#copier-document').onclick = function () { var b = this; (navigator.clipboard ? navigator.clipboard.writeText(plain.join('\n')) : Promise.reject()).then(function () { b.textContent = 'Copié'; setTimeout(function () { b.textContent = 'Copier le texte'; }, 1500); }).catch(function () {}); };
        var l = $('#fichiers'); l.textContent = '';
        var a = document.createElement('a');
        a.href = API + '/commandes/' + encodeURIComponent(c.id) + '/fichiers/document.docx?t=' + encodeURIComponent(t);
        var n = document.createElement('span'); n.textContent = (c.produit.slug || 'document') + '.docx';
        var sp = document.createElement('span'); sp.textContent = 'Télécharger (Word)';
        a.append(n, sp); l.appendChild(a);
        if (c.telechargeable_jusqu_au) texte($('#jusqu'), new Date(c.telechargeable_jusqu_au).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }));
        return;
      }
      if (c.payee) {
        clearInterval(minuteur);
        $('#attente').hidden = true; $('#payee').hidden = false;
        if (pa && !$('#activation')) {
          texte($('#payee-texte'), 'Ouvrez l\'application pour activer votre ' + (pa.pass && pa.pass.titre ? pa.pass.titre.toLowerCase() : 'pass') + ' ; le mode d\'emploi (PDF) est à télécharger plus bas.');
          var pp = $('#payee .paiement'); pp.parentNode.insertBefore(blocActivation(c, pa, j, t), pp.nextSibling);
        }
        var l = $('#fichiers'); l.textContent = '';
        c.fichiers.forEach(function (f) {
          var a = document.createElement('a');
          a.href = API + '/commandes/' + encodeURIComponent(c.id) + '/fichiers/' + encodeURIComponent(f.nom) + '?t=' + encodeURIComponent(t);
          a.setAttribute('download', f.nom);
          var n = document.createElement('span'); n.textContent = f.nom;
          var s = document.createElement('span'); s.textContent = 'Télécharger (' + Math.max(1, Math.round(f.taille / 1024)) + ' Ko)';
          a.append(n, s); l.appendChild(a);
        });
        if (c.telechargeable_jusqu_au) texte($('#jusqu'), new Date(c.telechargeable_jusqu_au).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }));
        return;
      }
      $('#attente').hidden = false;
      texte($('#montant'), fcfa(c.montant));
      texte($('#numero'), j.wave || 'le numéro Wave du vendeur');
      $('#exact').hidden = c.montant === c.prix;
    };
    var lire = function () {
      Promise.all([fetch(API + '/commandes/' + encodeURIComponent(id) + '?t=' + encodeURIComponent(t))
        .then(function (r) { if (!r.ok) throw new Error('introuvable'); return r.json(); }), chargerApplis()])
        .then(function (x) { afficher(x[0], x[1]); })
        .catch(function () { if (++essais > 2) { clearInterval(minuteur); zone.innerHTML = '<p class="paiement">Commande introuvable. Vérifiez le lien reçu après votre commande.</p>'; } });
    };
    if (!/^TCV-[0-9A-Z]{8}$/.test(id) || t.length < 20) zone.innerHTML = '<p class="paiement">Lien de commande incomplet.</p>';
    else { lire(); minuteur = setInterval(lire, 10000); }
    document.querySelectorAll('[data-copier]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.dataset.copier === 'lien' ? location.href : ($('#' + b.dataset.copier).textContent || '').replace(/[^\d]/g, '');
        (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { var o = b.textContent; b.textContent = 'Copié'; setTimeout(function () { b.textContent = o; }, 1500); }).catch(function () {});
      });
    });
  }
})();
