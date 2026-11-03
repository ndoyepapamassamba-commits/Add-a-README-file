/* Teranga — coquille commune : barre, bandeaux (mise à jour, pass, installation), page du pass, sauvegarde,
   installation, apparence, routage et service worker. Chaque application fournit ses pages. */
(function () {
  'use strict';
  var U = window.TU, h = U.h, icone = U.icone, bouton = U.bouton, lienBouton = U.lienBouton, alerte = U.alerte, toast = U.toast;

  function creer(cfg) {
    var L = cfg.L, DB = cfg.DB;
    var E = { passes: [], licence: L.etatLicence([]), majDispo: null, majDemandee: false, installation: null, masques: {}, route: '',
      theme: 'auto', sauvegardeLe: null, activationPreRemplie: '' };
    var C = { E: E, cfg: cfg };

    function premium() { return !!(E.licence && E.licence.premium); }
    function aller(hash) { if (location.hash === hash) afficher(); else location.hash = hash; }
    function echec(e) { if (e) console.warn(e); toast('Enregistrement impossible. Réessayez.'); }
    function majLicence() {
      E.licence = L.etatLicence(E.passes, Date.now());
      var b = U.$('#badge-pass');
      if (b) {
        b.textContent = E.licence.premium ? 'Complet' : 'Gratuit';
        b.className = 'badge-pass' + (E.licence.premium ? ' complet' : '');
        b.setAttribute('aria-label', E.licence.premium ? 'Version complète, ' + E.licence.joursRestants + ' jours restants' : 'Version gratuite : voir le pass');
      }
    }

    // ---------- Cadre de page ----------
    function cadre(titre, retour, onglet) {
      var t = U.$('#titre'), r = U.$('#retour'), logo = U.$('#logo');
      t.textContent = '';
      if (titre) t.textContent = titre; else { t.appendChild(document.createTextNode(cfg.titre[0])); t.appendChild(h('b', null, cfg.titre[1])); }
      document.title = (titre ? titre + ' · ' : '') + cfg.nom;
      r.hidden = !retour; logo.hidden = !!retour;
      if (retour) r.setAttribute('href', retour);
      document.querySelectorAll('.onglets a').forEach(function (a) {
        if (a.getAttribute('data-onglet') === onglet) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      var vue = U.$('#vue'); vue.textContent = '';
      return vue;
    }

    // ---------- Bandeaux ----------
    function estInstalle() { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } }
    function estIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
    function bandeaux(route) {
      E.route = route;
      var z = U.$('#bandeaux'); z.textContent = '';
      function ajout(el) { z.appendChild(h('div', { class: 'bandeau' }, el)); }
      function fermer(cle, persistant) {
        return h('button', { type: 'button', class: 'fermer', 'aria-label': 'Fermer ce message', onclick: function () {
          E.masques[cle] = true; if (persistant) U.stockLocal(cle, String(Date.now())); bandeaux(route);
        } }, '×');
      }
      if (E.majDispo) ajout(alerte('info', 'Une nouvelle version de ' + cfg.nom + ' est prête.', [' ', bouton('Mettre à jour', 'petit', function () {
        E.majDemandee = true; var w = E.majDispo.waiting; if (w) w.postMessage({ type: 'MISE_A_JOUR' }); else location.reload();
      })]));
      if (DB.temporaire) ajout(alerte('danger', 'Ce navigateur ne garde pas les données (mode privé ?). Ouvrez ' + cfg.nom + ' dans une fenêtre normale.'));
      var Lc = E.licence, accueil = route === 'accueil';
      if (Lc.rappel && accueil && !E.masques.rappel) {
        ajout(h('div', { class: 'alerte attention', 'data-bandeau': 'rappel' }, icone('alerte'), h('div', { class: 'texte' },
          'Votre pass se termine dans ' + U.pluriel(Lc.joursRestants, 'jour') + ' (le ' + U.dateFr(Lc.fin) + '). Renouvelez-le : les jours restants s’ajoutent.'),
          lienBouton(L.urlProduit(Lc.slug), 'Renouveler', 'accent petit'), fermer('rappel')));
      } else if (Lc.expire && accueil && !E.masques.expire) {
        ajout(h('div', { class: 'alerte info', 'data-bandeau': 'expire' }, icone('info'), h('div', { class: 'texte' },
          'Votre pass a pris fin le ' + U.dateFr(Lc.fin) + '. Toutes vos données restent là et modifiables ; seule la limite gratuite revient pour les ajouts.'),
          lienBouton(L.urlProduit(Lc.slug), 'Renouveler', 'accent petit'), fermer('expire')));
      }
      if (cfg.bandeauxApp) cfg.bandeauxApp(route, ajout, fermer);
      if (accueil && !estInstalle() && !E.masques.installation && !U.stockLocal(cfg.prefixe + '-installation-masquee')) {
        if (E.installation) {
          ajout(h('div', { class: 'alerte ok' }, icone('installer'), h('div', { class: 'texte' }, 'Installez ' + cfg.nom + ' sur votre écran d’accueil : il s’ouvre comme une application, même sans Internet.'),
            bouton('Installer', 'petit', installer, null, { 'data-action': 'installer' }), fermer('installation', cfg.prefixe + '-installation-masquee')));
        } else if (estIOS()) {
          ajout(h('div', { class: 'alerte ok' }, icone('installer'), h('div', { class: 'texte' }, 'Sur iPhone : dans Safari, touchez le bouton Partager (carré avec une flèche), puis « Sur l’écran d’accueil ».'),
            fermer('installation', cfg.prefixe + '-installation-masquee')));
        }
      }
    }
    function installer() {
      if (!E.installation) { aller('#/reglages'); return; }
      var p = E.installation; E.installation = null;
      p.prompt();
      if (p.userChoice) p.userChoice.then(function () { afficher(); });
    }

    // ---------- Pass ----------
    function pagePass() {
      var vue = cadre('Mon pass', null, 'pass'); bandeaux('pass');
      var Lc = E.licence, slug = L.SLUG_DEFAUT, prod = L.PRODUITS[slug];
      var etat = h('section', { class: 'carte', 'aria-labelledby': 'pass-etat' });
      if (Lc.premium) {
        etat.appendChild(h('h2', { id: 'pass-etat' }, 'Version complète active'));
        etat.appendChild(h('p', { class: 'heros', 'data-jours': Lc.joursRestants }, U.pluriel(Lc.joursRestants, 'jour restant', 'jours restants')));
        etat.appendChild(h('p', null, 'Valable jusqu’au ' + U.dateFr(Lc.fin) + '.'));
        if (Lc.rappel) etat.appendChild(alerte('attention', 'Votre pass se termine bientôt. Renouvelez maintenant : les jours restants s’ajoutent, rien n’est perdu.', [' ', h('a', { href: L.urlProduit(Lc.slug), 'data-action': 'renouveler' }, 'Renouveler')]));
      } else if (Lc.expire) {
        etat.appendChild(h('h2', { id: 'pass-etat' }, 'Pass terminé'));
        etat.appendChild(h('p', null, 'Votre pass a pris fin le ' + U.dateFr(Lc.fin) + '. Vos données restent toutes consultables et modifiables. Seuls les nouveaux ajouts au-delà de la limite gratuite attendent un nouveau pass.'));
        etat.appendChild(lienBouton(L.urlProduit(Lc.slug), 'Renouveler', 'accent', 'etoile'));
      } else {
        etat.appendChild(h('h2', { id: 'pass-etat' }, 'Version gratuite'));
        etat.appendChild(h('p', null, cfg.offres.texteGratuit));
      }
      vue.appendChild(etat);

      vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'pass-cmp' }, h('h2', { id: 'pass-cmp' }, 'Ce que chaque version permet'),
        h('div', { class: 'offres' },
          h('div', { class: 'offre' }, h('h3', null, 'Gratuit'), h('ul', { class: 'liste-coches' }, cfg.offres.gratuit.map(function (t) { return h('li', null, t); }))),
          h('div', { class: 'offre mise-en-avant' }, h('h3', null, prod.nom + ' : ' + U.fcfa(prod.prix)),
            h('ul', { class: 'liste-coches' }, cfg.offres.complet.map(function (t) { return h('li', null, t); })),
            lienBouton(L.urlProduit(slug), 'Acheter le pass (' + U.fcfa(prod.prix) + ')', 'large accent', 'etoile', { 'data-action': 'acheter' }))),
        h('p', { class: 'discret' }, 'Paiement par Wave sur la boutique Teranga. Pas d’abonnement : rien n’est prélevé automatiquement. ' + U.fcfa(prod.prix) + ' pour ' + prod.jours + ' jours, soit ' + U.fcfa(Math.round(prod.prix / 12)) + ' par mois environ.')));

      var zone = h('textarea', { id: 'c-lien', name: 'lien', rows: 3, placeholder: 'https://…/boutique/commande.html?o=TCV-…&t=…', autocomplete: 'off', spellcheck: 'false' });
      zone.value = E.activationPreRemplie || '';
      E.activationPreRemplie = '';
      var msg = h('div', { id: 'activation-msg', role: 'status', 'aria-live': 'polite' });
      var btn = h('button', { type: 'submit', class: 'btn large' }, icone('ok'), 'Activer');
      var form = h('form', { class: 'carte', novalidate: true, 'aria-labelledby': 'pass-act', id: 'form-activation' },
        h('h2', { id: 'pass-act' }, 'Activer mon pass'),
        h('ol', { class: 'etapes' }, h('li', null, 'Payez votre pass par Wave sur la boutique.'),
          h('li', null, 'Sur la page de votre commande, touchez « Copier le lien de cette page ».'),
          h('li', null, 'Collez ce lien ci-dessous puis touchez « Activer ». Il faut Internet une seule fois.')),
        U.champ('Lien de votre commande', zone), btn, msg);
      form.addEventListener('submit', function (ev) { ev.preventDefault(); activer(zone.value, msg, btn); });
      vue.appendChild(form);

      if (E.passes.length) {
        vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'pass-hist' }, h('h2', { id: 'pass-hist' }, 'Pass activés sur ce téléphone'),
          h('ul', null, E.passes.map(function (p) {
            var pr = L.PRODUITS[p.slug];
            return h('li', null, (pr ? pr.nom : p.slug) + ' · payé le ' + U.dateFr(String(p.payeeLe).slice(0, 10)) + ' · commande ' + String(p.id || '').replace(/^(TCV-....).*/, '$1••••'));
          })),
          h('p', { class: 'discret petit' }, 'Sur un autre téléphone, collez le même lien de commande pour activer votre pass.')));
      }
    }
    function activer(texte, msg, btn) {
      msg.textContent = '';
      var c = L.lireLienCommande(texte);
      if (!c) { msg.appendChild(alerte('danger', 'Lien non reconnu. Collez le lien complet de la page de votre commande (il contient « TCV- »).')); return; }
      btn.disabled = true; msg.appendChild(alerte('info', 'Vérification en cours…'));
      fetch(L.urlVerification(c), { headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'omit' }).then(function (r) {
        if (r.status === 404) return { introuvable: true };
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (j) {
        msg.textContent = ''; btn.disabled = false;
        if (j && j.introuvable) { msg.appendChild(alerte('danger', 'Commande introuvable. Vérifiez que vous avez copié tout le lien.')); return; }
        var a = L.analyserReponse(j, Date.now());
        if (a.ok) {
          E.passes = L.ajouterPass(E.passes, a.pass);
          return DB.ecrire('passes', E.passes).then(function () {
            majLicence(); pagePass();
            U.$('#activation-msg').appendChild(alerte('ok', 'Pass activé ! Version complète jusqu’au ' + U.dateFr(E.licence.fin) + ' (' + U.pluriel(E.licence.joursRestants, 'jour') + ').'));
            toast('Pass activé.');
          });
        }
        if (a.raison === 'impayee') msg.appendChild(alerte('attention', 'Cette commande n’est pas encore payée. Ouvrez le lien de la commande, payez par Wave, puis réessayez.'));
        else if (a.raison === 'produit') msg.appendChild(alerte('danger', 'Ce lien correspond à un autre achat' + (a.titre ? ' (« ' + a.titre + ' »)' : '') + '. Collez le lien de votre commande du pass ' + cfg.nom + '.'));
        else if (a.raison === 'expiree') msg.appendChild(alerte('attention', 'Ce pass a pris fin le ' + U.dateFr(a.fin) + '. Prenez un nouveau pass pour continuer.', [' ', h('a', { href: L.urlProduit(a.pass.slug) }, 'Renouveler')]));
        else msg.appendChild(alerte('danger', 'Commande introuvable. Vérifiez le lien.'));
      }).catch(function () {
        msg.textContent = ''; btn.disabled = false;
        msg.appendChild(alerte('danger', 'Pas de connexion à Internet, ou serveur injoignable. Réessayez quand vous avez du réseau : la vérification ne se fait qu’une fois.'));
      });
    }

    // ---------- Sauvegarde ----------
    function sauvegarder(zone, avecPhotos) {
      return cfg.sauvegarde.exporter(avecPhotos).then(function (data) {
        data.app = cfg.sauvegarde.app; data.format = 1; data.version = cfg.version; data.exporteLe = new Date().toISOString();
        var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        U.offrirFichier(zone, blob, cfg.prefixe + '-sauvegarde-' + U.dateISO() + '.json', 'Sauvegarde ' + cfg.nom);
        E.sauvegardeLe = new Date().toISOString();
        return DB.ecrire('sauvegardeLe', E.sauvegardeLe);
      }).catch(echec);
    }
    function restaurer(fichier) {
      if (!fichier) return;
      var fr = new FileReader();
      fr.onload = function () {
        var obj; try { obj = JSON.parse(String(fr.result)); } catch (e) { toast('Ce fichier n’est pas une sauvegarde ' + cfg.nom + '.'); return; }
        if (!obj || obj.app !== cfg.sauvegarde.app) { toast('Ce fichier n’est pas une sauvegarde ' + cfg.nom + '.'); return; }
        var v = cfg.sauvegarde.valider(obj);
        if (!v.ok) { toast(v.erreur); return; }
        if (!confirm('Remplacer toutes les données de ce téléphone par la sauvegarde (' + v.resume + ') ?')) return;
        DB.remplacer(v.recs, v.kv, v.photos, ['passes']).then(charger).then(function () {
          appliquerTheme(); toast('Sauvegarde restaurée.'); aller('#/');
        }).catch(echec);
      };
      fr.onerror = function () { toast('Lecture du fichier impossible.'); };
      fr.readAsText(fichier);
    }

    // ---------- Réglages communs ----------
    function appliquerTheme() {
      var t = E.theme;
      if (t === 'clair' || t === 'sombre') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
      U.stockLocal(cfg.prefixe + '-theme', t === 'clair' || t === 'sombre' ? t : null);
    }
    function sectionsReglages(vue) {
      var app = h('form', { class: 'carte', 'aria-labelledby': 'r-app' }, h('h2', { id: 'r-app' }, 'Apparence'),
        U.choixRadio('theme', [{ id: 'auto', nom: 'Automatique' }, { id: 'clair', nom: 'Clair' }, { id: 'sombre', nom: 'Sombre' }], E.theme || 'auto', 'Couleurs de l’écran'));
      app.addEventListener('change', function () {
        E.theme = U.radio(app, 'theme');
        DB.ecrire('theme', E.theme).then(function () { appliquerTheme(); toast('Apparence enregistrée.'); });
      });
      vue.appendChild(app);

      var input = h('input', { type: 'file', accept: '.json,application/json', id: 'fichier-restaurer', class: 'invisible', onchange: function (ev) { restaurer(ev.target.files[0]); ev.target.value = ''; } });
      var vieux = !E.sauvegardeLe || (Date.now() - Date.parse(E.sauvegardeLe)) > 14 * 86400000;
      var zone = h('div', { id: 'fichier-pret' });
      var casePhotos = cfg.sauvegarde.photos ? h('label', { class: 'case' }, h('input', { type: 'checkbox', name: 'avecPhotos', checked: true }), 'Mettre aussi les photos (fichier plus lourd)') : null;
      vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'r-sauv' }, h('h2', { id: 'r-sauv' }, 'Sauvegarde'),
        h('p', null, 'Vos données sont seulement sur ce téléphone. Faites une sauvegarde régulièrement et gardez le fichier ailleurs (WhatsApp à vous-même, e-mail, clé USB).'),
        h('p', { class: 'discret' }, E.sauvegardeLe ? 'Dernière sauvegarde : ' + U.dateFr(E.sauvegardeLe.slice(0, 10)) + '.' : 'Aucune sauvegarde faite sur ce téléphone.'),
        vieux && cfg.aDesDonnees() ? alerte('attention', 'Pensez à faire une sauvegarde.') : null,
        casePhotos,
        h('div', { class: 'boutons' }, bouton('Faire une sauvegarde', '', function () { sauvegarder(zone, casePhotos ? casePhotos.querySelector('input').checked : false); }, 'sauvegarde', { 'data-action': 'sauvegarder' }),
          h('label', { class: 'btn secondaire', for: 'fichier-restaurer', tabindex: '0', role: 'button', onkeydown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); input.click(); } } }, icone('telecharger'), 'Restaurer une sauvegarde'), input),
        zone,
        h('p', { class: 'discret petit' }, 'Le pass n’est pas dans la sauvegarde : sur un nouveau téléphone, collez à nouveau le lien de votre commande.')));

      var inst = h('section', { class: 'carte', 'aria-labelledby': 'r-inst' }, h('h2', { id: 'r-inst' }, 'Installer l’application'));
      if (estInstalle()) inst.appendChild(h('p', null, cfg.nom + ' est installé sur ce téléphone.'));
      else if (E.installation) inst.appendChild(bouton('Installer ' + cfg.nom, '', installer, 'installer', { 'data-action': 'installer' }));
      else if (estIOS()) inst.appendChild(h('p', null, 'Sur iPhone ou iPad : ouvrez cette page dans Safari, touchez le bouton Partager (carré avec une flèche vers le haut), puis « Sur l’écran d’accueil ».'));
      else inst.appendChild(h('p', null, 'Dans Chrome : touchez le menu ⋮ en haut à droite, puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».'));
      inst.appendChild(h('p', { class: 'discret petit' }, 'Sur iPhone : Safari → bouton Partager → « Sur l’écran d’accueil ». Une fois ouverte une première fois, l’application marche sans Internet.'));
      vue.appendChild(inst);

      vue.appendChild(h('section', { class: 'carte', 'aria-labelledby': 'r-apropos' }, h('h2', { id: 'r-apropos' }, 'À propos'),
        h('p', null, cfg.nom + ' ' + cfg.version + '.'), cfg.apropos.map(function (t) { return h('p', null, t); }),
        h('div', { class: 'boutons' }, lienBouton('#/aide', 'Aide et explications', 'secondaire', 'info'),
          bouton('Tout effacer', 'danger', function () {
            if (!confirm('Effacer toutes les données de ce téléphone ?')) return;
            if (!confirm('Dernière confirmation : tout effacer définitivement ?')) return;
            DB.toutEffacer(['passes']).then(charger).then(function () { appliquerTheme(); toast('Données effacées.'); aller('#/'); }).catch(echec);
          }, 'corbeille'))));
    }

    // ---------- Chargement et routage ----------
    function charger() {
      return Promise.all([DB.lire('passes'), DB.lire('theme'), DB.lire('sauvegardeLe')]).then(function (r) {
        E.passes = Array.isArray(r[0]) ? r[0] : [];
        E.theme = r[1] || 'auto';
        E.sauvegardeLe = r[2] || null;
        majLicence();
        return cfg.charger();
      });
    }
    function afficher() {
      var hs = location.hash.replace(/^#/, '') || '/';
      var morceaux = hs.split('?'), p = morceaux[0].split('/').filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
      var q = {};
      if (morceaux[1]) morceaux[1].split('&').forEach(function (kv) { var a = kv.split('='); try { q[a[0]] = decodeURIComponent(a[1] || ''); } catch (e) { q[a[0]] = a[1]; } });
      try {
        if (p[0] === 'pass') pagePass();
        else if (!cfg.routes(p, q)) { aller('#/'); return; }
      } catch (e) {
        console.warn(e);
        var v = cadre('Oups', '#/', 'accueil');
        v.appendChild(alerte('danger', 'Cette page n’a pas pu s’afficher. Revenez à l’accueil.'));
      }
      var vue = U.$('#vue');
      if (document.activeElement === document.body || !vue.contains(document.activeElement)) { try { vue.focus({ preventScroll: true }); } catch (e) { vue.focus(); } }
      window.scrollTo(0, 0);
    }
    function demarrer() {
      DB.init(cfg.dbNom);
      try {
        var q = new URLSearchParams(location.search);
        if (q.get('o') && q.get('t')) { E.activationPreRemplie = location.href; history.replaceState(null, '', location.pathname + '#/pass'); }
      } catch (e) { /* ancien navigateur */ }
      charger().then(function () {
        appliquerTheme();
        window.addEventListener('hashchange', afficher);
        afficher();
        document.documentElement.setAttribute('data-pret', '1');
      }).catch(function (e) {
        console.warn(e);
        U.$('#vue').textContent = '';
        U.$('#vue').appendChild(alerte('danger', 'Impossible d’ouvrir le stockage du téléphone. Fermez les autres onglets de ' + cfg.nom + ' et rechargez la page.'));
      });
      setInterval(function () { var avant = E.licence.premium; majLicence(); if (avant !== E.licence.premium) afficher(); }, 3600000);
      window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); E.installation = e; if (!location.hash || location.hash === '#/' || /reglages/.test(location.hash)) afficher(); });
      window.addEventListener('appinstalled', function () { E.installation = null; toast(cfg.nom + ' est installé.'); });
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('sw.js').then(function (reg) {
            function signaler() { E.majDispo = reg; bandeaux(E.route || ''); }
            if (reg.waiting && navigator.serviceWorker.controller) signaler();
            reg.addEventListener('updatefound', function () {
              var w = reg.installing;
              if (w) w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) signaler(); });
            });
          }).catch(function () { /* hors ligne ou non pris en charge */ });
          var recharge = false;
          navigator.serviceWorker.addEventListener('controllerchange', function () { if (E.majDemandee && !recharge) { recharge = true; location.reload(); } });
        });
      }
    }

    C.premium = premium; C.aller = aller; C.echec = echec; C.cadre = cadre; C.bandeaux = bandeaux; C.afficher = afficher;
    C.sectionsReglages = sectionsReglages; C.charger = charger; C.demarrer = demarrer; C.majLicence = majLicence; C.estIOS = estIOS;
    return C;
  }
  window.TC = { creer: creer };
})();
