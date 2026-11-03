/* AccordAI — cœur : montants, conversations WhatsApp, liens, statuts, chaîne d'empreintes.
   Sans dépendance. Fonctionne dans le navigateur (window.AC) et dans Node (require) pour les tests. */
(function (racine) {
  'use strict';
  var API = 'https://seegnylaubuularegmku.supabase.co/functions/v1/dossiers';
  var API_BOUTIQUE = 'https://seegnylaubuularegmku.supabase.co/functions/v1/boutique';
  var SITE = 'https://ndoyepapamassamba-commits.github.io/Add-a-README-file/apps/accord/';
  var LIMITE_GRATUITE = 5;      // accords créés par mois sans pass
  var MAX_PHOTOS = 4;           // photos jointes à l'extraction
  var MAX_TEXTE_IA = 19000;     // le serveur garde 20 000 caractères : on envoie les messages les plus récents
  var JOUR_MS = 86400000;
  var MENTION = 'AccordAI garde une trace datée et chaînée de ce qui a été convenu. Sa valeur en cas de litige dépend des circonstances et du droit applicable.';

  // Champs d'un accord (clés acceptées par le serveur : minuscules, chiffres, « _ »)
  var CHAMPS = [
    { cle: 'vendeur', label: 'Vendeur ou prestataire', place: 'Ex. : Atelier Ndiaye Couture' },
    { cle: 'acheteur', label: 'Client ou acheteur', place: 'Ex. : Awa Diop' },
    { cle: 'produit', label: 'Produit ou service', place: 'Ex. : 20 tenues en wax, modèle « grand boubou »' },
    { cle: 'quantite', label: 'Quantité', place: 'Ex. : 20', mode: 'decimal', court: true },
    { cle: 'prix_unitaire', label: 'Prix unitaire (F CFA)', place: 'Ex. : 9\u00a0000', montant: true, court: true },
    { cle: 'prix_total', label: 'Prix total (F CFA)', place: 'Ex. : 180\u00a0000', montant: true },
    { cle: 'acompte', label: 'Acompte versé (F CFA)', place: 'Ex. : 50\u00a0000', montant: true },
    { cle: 'delai', label: 'Délai de livraison', place: 'Ex. : vendredi 14 novembre' },
    { cle: 'lieu', label: 'Lieu de livraison (quartier ou ville)', place: 'Ex. : Marché HLM, Dakar' },
    { cle: 'engagements', label: 'Engagements de chacun', place: 'Ex. : le tailleur livre 20 tenues ; la cliente paie le reste à la livraison', zone: true },
    { cle: 'points_flous', label: 'Points à clarifier', place: 'Ex. : la couleur des boutons n\'est pas fixée', zone: true }
  ];
  var LIBELLES = { titre: 'Objet', delai_date: 'Date limite', createur: 'Créé par' };
  CHAMPS.forEach(function (c) { LIBELLES[c.cle] = c.label.replace(/ \(F CFA\)$/, '').replace(/ \(quartier ou ville\)$/, ''); });
  var CLES = CHAMPS.map(function (c) { return c.cle; }).concat(['delai_date']);

  var STATUTS = {
    ouvert: { label: 'Ouvert', aide: 'En attente de confirmation', ton: 'attente' },
    confirme: { label: 'Confirmé', aide: 'Les deux parties sont d\'accord', ton: 'ok' },
    a_revoir: { label: 'À revoir', aide: 'Une correction est proposée', ton: 'alerte' },
    livre: { label: 'Livré', aide: 'Livraison déclarée', ton: 'info' },
    recu: { label: 'Reçu', aide: 'Réception confirmée', ton: 'ok' },
    clos: { label: 'Clos', aide: 'Accord terminé', ton: 'neutre' }
  };
  var EVENEMENTS = {
    creation: 'Accord créé', confirmation: 'Accord confirmé', correction: 'Correction proposée', acceptation: 'Correction acceptée',
    modification: 'Accord modifié', note: 'Note', preuve: 'Photo ajoutée', livraison: 'Livraison déclarée', reception: 'Réception confirmée', cloture: 'Accord clos'
  };
  var PERMIS = { proprio: ['modification', 'note', 'preuve', 'livraison', 'cloture', 'acceptation'], partie: ['confirmation', 'correction', 'note', 'preuve', 'reception'] };

  // ---------- Nombres et montants ----------
  function espaces(s) { return String(s == null ? '' : s).replace(/[    ]/g, ' '); }
  // Lit le premier nombre d'un texte : « 9 000 F », « 180.000 FCFA », « 2,5 m », « 50k », « 1,5 million »
  function nombre(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = espaces(v).toLowerCase();
    var m = s.match(/(\d{1,3}(?:[ .]\d{3})+(?!\d)|\d+)(?:,(\d+)|\.(\d{1,2})(?!\d))?\s*(millions?|mille|k(?![a-z]))?/);
    if (!m) return null;
    var n = parseFloat(m[1].replace(/[ .]/g, '') + ((m[2] || m[3]) ? '.' + (m[2] || m[3]) : ''));
    if (!isFinite(n)) return null;
    if (m[4]) n *= /^million/.test(m[4]) ? 1e6 : 1e3;
    return n;
  }
  function arrondi(n) { return Math.round(n * 100) / 100; }
  function milliers(n) {
    if (n == null || !isFinite(n)) return '';
    var neg = n < 0; n = Math.abs(arrondi(n));
    var ent = Math.floor(n), dec = Math.round((n - ent) * 100);
    var s = String(ent).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    if (dec) s += ',' + (dec % 10 ? (dec < 10 ? '0' : '') + dec : String(dec / 10));
    return (neg ? '-' : '') + s;
  }
  function fcfa(n) { return n == null || !isFinite(n) ? '' : milliers(Math.round(n)) + ' F CFA'; }
  // Montant saisi : « 180000 », « 180 000 f » → « 180 000 F CFA » ; un texte avec d'autres mots reste tel quel
  function normaliserMontant(s) {
    var t = espaces(s).trim();
    if (!t) return '';
    if (/^\d[\d .,]*\s*(?:k|mille|millions?)?\s*(?:f|fr|frs|francs?|fcfa|f\s?cfa|cfa|xof)?\.?$/i.test(t)) {
      var n = nombre(t);
      if (n != null) return fcfa(n);
    }
    return t;
  }
  function calculer(d) {
    d = d || {};
    var q = nombre(d.quantite), pu = nombre(d.prix_unitaire), te = nombre(d.prix_total), ac = nombre(d.acompte);
    var calc = q != null && pu != null ? arrondi(q * pu) : null;
    var total = te != null ? te : calc;
    var ecart = calc != null && te != null && Math.abs(calc - te) > Math.max(1, Math.abs(te) * 0.005);
    return {
      quantite: q, prixUnitaire: pu, totalEcrit: te, totalCalcule: calc, total: total, acompte: ac,
      reste: total != null && ac != null ? total - ac : null, ecart: ecart, acompteTrop: ac != null && total != null && ac > total
    };
  }

  // ---------- Dates ----------
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function deux(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate()); }
  function dateValide(a, m, j) { var d = new Date(a, m - 1, j); return d.getFullYear() === a && d.getMonth() === m - 1 && d.getDate() === j ? d : null; }
  // Date explicite dans un texte de délai : « 14/11 », « 14/11/2026 », « 14 novembre », « demain », « 2026-11-14 »
  function dateDansTexte(texte, ref) {
    var s = espaces(texte).toLowerCase().normalize('NFC');
    ref = ref ? new Date(ref) : new Date();
    var base = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    var m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) { var d0 = dateValide(+m[1], +m[2], +m[3]); return d0 ? iso(d0) : ''; }
    m = s.match(/(?:^|[^\d])(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?(?!\d)/);
    var j, mo, a;
    if (m) { j = +m[1]; mo = +m[2]; a = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null; }
    else {
      m = s.match(/(?:^|[^\d])(\d{1,2})(?:er)?\s+(janv(?:ier)?|f[ée]v(?:rier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)\.?(?:\s+(\d{4}))?/);
      if (m) {
        j = +m[1]; a = m[3] ? +m[3] : null;
        var noms = [/^jan/, /^f/, /^mar/, /^avr/, /^mai/, /^juin/, /^juil/, /^ao/, /^sep/, /^oct/, /^nov/, /^d/];
        for (var k = 0; k < 12 && !mo; k++) if (noms[k].test(m[2])) mo = k + 1;
      }
    }
    if (j && mo) {
      var an = a || base.getFullYear();
      var d = dateValide(an, mo, j);
      if (d && !a && d < new Date(base.getTime() - 60 * JOUR_MS)) d = dateValide(an + 1, mo, j);
      return d ? iso(d) : '';
    }
    if (/apr[eè]s[- ]demain/.test(s)) return iso(new Date(base.getTime() + 2 * JOUR_MS));
    if (/\bdemain\b/.test(s)) return iso(new Date(base.getTime() + JOUR_MS));
    if (/aujourd/.test(s)) return iso(base);
    return '';
  }
  function dateFr(isoDate, court) {
    var m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return (+m[3] === 1 ? '1er' : String(+m[3])) + ' ' + (court ? MOIS_COURTS : MOIS)[+m[2] - 1] + ' ' + m[1];
  }
  // Date et heure d'un événement (heure de Dakar = UTC)
  function dateHeure(le) {
    var d = new Date(le);
    if (isNaN(d)) return String(le || '');
    return d.getUTCDate() + ' ' + MOIS_COURTS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ' à ' + deux(d.getUTCHours()) + ' h ' + deux(d.getUTCMinutes());
  }
  function aujourdhui(maintenant) { return iso(maintenant ? new Date(maintenant) : new Date()); }
  function moisCle(maintenant) { return aujourdhui(maintenant).slice(0, 7); }

  // ---------- Conversations WhatsApp (fichier « Exporter la discussion ») ----------
  var INVISIBLES = /[‎‏‪-‮⁦-⁩﻿]/g;
  var RE_ANDROID = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4}),?\s+(?:à\s+)?(\d{1,2})[:h.](\d{2})(?::\d{2})?\s*([ap]\.?\s?m\.?)?\s*[-–—]\s+([\s\S]*)$/i;
  var RE_IOS = /^\[(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4}),?\s+(?:à\s+)?(\d{1,2})[:h.](\d{2})(?::\d{2})?\s*([ap]\.?\s?m\.?)?\]\s*([\s\S]*)$/i;
  var RE_MEDIA = /^<?(?:médias? omis|media omitted|fichier omis|image absente|image omise|vidéo omise|audio omis|sticker omis|gif omis|document omis|image omitted|video omitted|audio omitted|sticker omitted|document omitted|gif omitted)>?$/i;
  function lireWhatsApp(brut) {
    var lignes = String(brut || '').replace(/\r\n?/g, '\n').split('\n');
    var bruts = [], courant = null;
    lignes.forEach(function (l) {
      var propre = l.replace(INVISIBLES, '');
      var m = propre.match(RE_IOS) || propre.match(RE_ANDROID);
      if (m) {
        courant = { a: +m[1], b: +m[2], an: +m[3], h: +m[4], mi: +m[5], ampm: m[6] || '', reste: m[7] };
        bruts.push(courant);
      } else if (courant) {
        courant.reste += '\n' + propre;
      }
    });
    if (!bruts.length) return { ok: false, messages: [], participants: [], texte: '' };
    // Ordre jour/mois : français par défaut ; mois/jour si un « mois » dépasse 12
    var jourEnPremier = true;
    var jourSur = bruts.some(function (x) { return x.a > 12; }), moisSur = bruts.some(function (x) { return x.b > 12; });
    if (!jourSur && (moisSur || bruts.some(function (x) { return x.ampm; }))) jourEnPremier = false; // format américain (AM/PM)
    var messages = [], noms = {};
    bruts.forEach(function (x) {
      var j = jourEnPremier ? x.a : x.b, mo = jourEnPremier ? x.b : x.a, an = x.an < 100 ? 2000 + x.an : x.an, h = x.h;
      if (x.ampm) { var pm = /^p/i.test(x.ampm); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
      var mm = x.reste.match(/^([^:\n]{1,80}?)\s?:\s([\s\S]*)$/) || x.reste.match(/^([^:\n]{1,80}?)\s?:()$/);
      if (!mm) return; // message système (chiffrement, ajout au groupe…)
      var auteur = mm[1].trim(), texte = mm[2].trim();
      if (RE_MEDIA.test(texte) || /\.(jpe?g|png|webp|opus|mp4|pdf)\s*\((?:fichier joint|file attached)\)$/i.test(texte)) texte = '[photo ou fichier]';
      if (!texte) return;
      noms[auteur] = (noms[auteur] || 0) + 1;
      messages.push({ date: an + '-' + deux(mo) + '-' + deux(j), heure: deux(h) + ':' + deux(x.mi), auteur: auteur, texte: texte });
    });
    var participants = Object.keys(noms).sort(function (p, q) { return noms[q] - noms[p]; });
    return { ok: messages.length > 0, messages: messages, participants: participants, texte: texteMessages(messages) };
  }
  function texteMessages(messages) {
    return messages.map(function (m) {
      return m.date.slice(8, 10) + '/' + m.date.slice(5, 7) + '/' + m.date.slice(0, 4) + ' ' + m.heure + ' — ' + m.auteur + ' : ' + m.texte;
    }).join('\n');
  }
  // Garde les messages les plus récents pour tenir dans la limite envoyée à l'IA
  function couperTexte(texte, max) {
    max = max || MAX_TEXTE_IA;
    texte = String(texte || '');
    if (texte.length <= max) return { texte: texte, coupe: false };
    var t = texte.slice(texte.length - max);
    var i = t.indexOf('\n');
    if (i > -1 && i < 400) t = t.slice(i + 1);
    return { texte: t, coupe: true };
  }
  // Numéros de téléphone masqués avant l'envoi à l'IA (Sénégal et numéros internationaux)
  function masquerNumeros(texte) {
    return String(texte || '')
      .replace(/(^|[^\d+])((?:(?:\+|00)\s?221[\s.\-]?)?(?:7[05678]|3[03])[\s.\-]?\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2})(?!\d)/g, function (t, avant, n) {
        return avant + '[numéro …' + n.replace(/\D/g, '').slice(-2) + ']';
      })
      .replace(/(?:\+|00)\d{1,3}(?:[\s.\-]?\d){7,12}(?![\d])/g, function (n) { return '[numéro …' + n.replace(/\D/g, '').slice(-2) + ']'; });
  }

  // ---------- Liens ----------
  // Lien d'un accord : …/apps/accord/#d=D-XXXXXXXXXX&t=<jeton> (plusieurs liens possibles dans un texte)
  function lireLiensDossier(texte) {
    var s = String(texte || ''), out = [], vus = {};
    var re = /[#&?]d=(D-[0-9A-HJKMNP-TV-Z]{10})&(?:amp;)?t=([A-Za-z0-9_-]{20,64})/g, m;
    while ((m = re.exec(s))) { var k = m[1] + m[2]; if (!vus[k]) { vus[k] = 1; out.push({ id: m[1], t: m[2] }); } }
    return out;
  }
  function lienDossier(id, jeton) { return SITE + '#d=' + id + '&t=' + jeton; }
  // Lien de la page de commande de la boutique (…/commande.html?o=TCV-XXXXXXXX&t=<jeton>) ou « TCV-… » + jeton
  function lireLienCommande(texte) {
    var s = String(texte || '').trim();
    if (!s) return null;
    var o = s.match(/[?&]o=(TCV-[0-9A-HJKMNP-TV-Z]{8})(?![0-9A-Z])/i);
    var t = s.match(/[?&](?:amp;)?t=([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/);
    if (o && t) return { o: o[1].toUpperCase(), t: t[1] };
    var m = s.match(/TCV-[0-9A-HJKMNP-TV-Z]{8}(?![0-9A-Z])/i);
    if (!m) return null;
    var reste = s.replace(m[0], ' ').replace(/https?:\/\/\S*/g, ' ');
    var j = reste.match(/(?:^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{20,64})(?![A-Za-z0-9_-])/);
    return j ? { o: m[0].toUpperCase(), t: j[1] } : null;
  }
  function messagePartage(titre, lien) {
    return 'Bonjour, voici notre accord « ' + titre + ' » sur AccordAI. Lisez-le puis confirmez (ou proposez une correction) ici : ' + lien;
  }

  // ---------- Pass ----------
  var PASS = {
    'pass-accordai-1-mois': { nom: 'Pass AccordAI 1 mois', prix: 3000, jours: 31 },
    'pass-accordai-12-mois': { nom: 'Pass AccordAI 12 mois', prix: 30000, jours: 366 }
  };
  // État du pass gardé sur le téléphone : { o, t, produit?, fin?, valide, verifieLe }
  function passActif(p, maintenant) {
    if (!p || !p.o || !p.t || p.valide === false) return false;
    var now = maintenant == null ? Date.now() : +new Date(maintenant);
    if (p.fin && Date.parse(p.fin) <= now) return false;
    return true;
  }
  function finPass(produit, payeeLe) {
    var p = PASS[produit], d = Date.parse(payeeLe);
    return p && isFinite(d) ? new Date(d + p.jours * JOUR_MS).toISOString() : null;
  }
  function creationsCeMois(compteur, maintenant) { return compteur && compteur.mois === moisCle(maintenant) ? compteur.n || 0 : 0; }
  function peutCreer(compteur, actif, maintenant) { return !!actif || creationsCeMois(compteur, maintenant) < LIMITE_GRATUITE; }

  // ---------- Dossiers : état dérivé ----------
  function trier(evs) { return (evs || []).slice().sort(function (a, b) { return (a.id || 0) - (b.id || 0); }); }
  function etat(dossier) {
    var evs = trier(dossier && dossier.evenements);
    var der = {};
    evs.forEach(function (e, i) { der[e.type] = i; });
    var ix = function (t) { return der[t] == null ? -1 : der[t]; };
    var corr = ix('correction'), resolue = Math.max(ix('acceptation'), ix('modification'));
    return {
      correction: corr > resolue ? evs[corr] : null,
      aReconfirmer: ix('modification') > ix('confirmation') && ix('confirmation') > -1,
      confirme: ix('confirmation') > -1,
      livre: ix('livraison') > -1,
      recu: ix('reception') > -1,
      clos: ix('cloture') > -1
    };
  }
  function enRetard(dossier, maintenant) {
    var d = dossier && dossier.donnees, st = dossier && dossier.statut;
    if (!d || !d.delai_date || ['livre', 'recu', 'clos'].indexOf(st) > -1) return false;
    return String(d.delai_date) < aujourdhui(maintenant);
  }
  function auteur(e, role) { return e.auteur === role ? 'Vous' : 'L\'autre partie'; }
  // Modifications proposées dans un événement (correction, modification, acceptation) : [{cle, avant, apres}]
  function changements(donnees) {
    var d = donnees || {}, out = [];
    CLES.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(d, k)) out.push({ cle: k, label: LIBELLES[k] || k, avant: d['avant_' + k] == null ? '' : String(d['avant_' + k]), apres: String(d[k]) });
    });
    return out;
  }
  // Détail lisible d'un événement : lignes de texte (écran et PDF)
  function lignesEvenement(e) {
    var d = (e && e.donnees) || {}, out = [];
    if (e.type === 'creation') {
      ['produit', 'quantite', 'prix_total', 'acompte', 'delai'].forEach(function (k) { if (d[k]) out.push(LIBELLES[k] + ' : ' + d[k]); });
    } else if (e.type === 'correction' || e.type === 'modification' || e.type === 'acceptation') {
      changements(d).forEach(function (c) { out.push(c.label + ' : ' + (c.avant || '(vide)') + ' \u2192 ' + (c.apres || '(vide)')); });
    }
    if (e.type === 'preuve') {
      if (d.legende) out.push('L\u00e9gende : ' + d.legende);
      if (d.photo) out.push('Fichier : ' + d.photo + (d.sha256 ? ' \u2014 SHA-256 ' + d.sha256 : ''));
    } else if (d.photo) out.push('Photo jointe : ' + d.photo);
    if (d.texte) out.push(String(d.texte));
    if (d.commentaire) out.push('\u00ab ' + d.commentaire + ' \u00bb');
    return out;
  }
  // Différences entre deux versions des données : donnees d'événement { cle: nouveau, avant_cle: ancien }
  function differences(avant, apres) {
    var out = {}, n = 0;
    CLES.forEach(function (k) {
      var a = avant && avant[k] != null ? String(avant[k]) : '', b = apres && apres[k] != null ? String(apres[k]) : '';
      if (a !== b) { out[k] = b; out['avant_' + k] = a; n++; }
    });
    return { donnees: out, n: n };
  }
  // Données propres d'un accord pour le serveur (textes, sans clés inconnues)
  function nettoyer(d) {
    var out = {};
    CLES.concat(['createur']).forEach(function (k) {
      var v = d && d[k];
      if (v == null) return;
      v = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 2000);
      if (v) out[k] = v;
    });
    return out;
  }

  // ---------- Chaîne d'empreintes ----------
  function hex(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; }
  function sha256(texte) {
    var c = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : null;
    if (!c) return Promise.reject(new Error('Calcul d\'empreinte indisponible sur ce navigateur.'));
    return c.subtle.digest('SHA-256', new TextEncoder().encode(texte)).then(hex);
  }
  // Vérifie les liens : 1er « précédent » = sha256(id) ; ensuite « précédent » = empreinte de l'événement d'avant
  function verifierChaine(id, evenements, fnSha) {
    var evs = trier(evenements);
    fnSha = fnSha || sha256;
    if (!evs.length) return Promise.resolve({ ok: false, n: 0, index: -1, raison: 'vide' });
    return fnSha(String(id)).then(function (origine) {
      var attendu = origine;
      for (var i = 0; i < evs.length; i++) {
        var e = evs[i];
        if (!/^[0-9a-f]{64}$/.test(String(e.empreinte || ''))) return { ok: false, n: evs.length, index: i, evenement: e, raison: 'empreinte' };
        if (e.precedent !== attendu) return { ok: false, n: evs.length, index: i, evenement: e, raison: i ? 'lien' : 'origine' };
        if (i && Date.parse(e.le) < Date.parse(evs[i - 1].le)) return { ok: false, n: evs.length, index: i, evenement: e, raison: 'ordre' };
        attendu = e.empreinte;
      }
      if (evs[0].type !== 'creation') return { ok: false, n: evs.length, index: 0, evenement: evs[0], raison: 'origine' };
      return { ok: true, n: evs.length, origine: origine, derniere: attendu };
    });
  }
  // La copie gardée sur le téléphone doit rester un début de l'historique reçu du serveur
  function comparerCopie(ancien, nouveau) {
    var a = trier(ancien), n = trier(nouveau), parId = {};
    n.forEach(function (e) { parId[e.id] = e; });
    for (var i = 0; i < a.length; i++) {
      var x = a[i], y = parId[x.id];
      if (!y || y.empreinte !== x.empreinte || y.precedent !== x.precedent) return { ok: false, index: i, evenement: x };
    }
    return { ok: true };
  }
  // Recalcul complet d'une empreinte (forme texte de Postgres : jsonb::text et timestamptz::text)
  function jsonbTexte(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return '[' + v.map(jsonbTexte).join(', ') + ']';
    var enc = new TextEncoder();
    var cles = Object.keys(v).sort(function (p, q) {
      var a = enc.encode(p), b = enc.encode(q);
      if (a.length !== b.length) return a.length - b.length;
      for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
      return 0;
    });
    return '{' + cles.map(function (k) { return JSON.stringify(k) + ': ' + jsonbTexte(v[k]); }).join(', ') + '}';
  }
  function horodatagePg(le) { return String(le || '').replace('T', ' ').replace(/([+-]\d\d):00$/, '$1'); }
  function recalculer(evenements, fnSha) {
    var evs = trier(evenements);
    fnSha = fnSha || sha256;
    var res = [];
    return evs.reduce(function (p, e) {
      return p.then(function () {
        return fnSha(e.precedent + '|' + e.type + '|' + e.auteur + '|' + jsonbTexte(e.donnees || {}) + '|' + horodatagePg(e.le)).then(function (h) { res.push(h === e.empreinte); });
      });
    }, Promise.resolve()).then(function () { return { tous: res.every(Boolean), resultats: res }; });
  }

  // ---------- Fichiers .zip (export WhatsApp sur iPhone) ----------
  // Lit le premier fichier .txt d'une archive zip (méthodes « stocké » et « deflate », via DecompressionStream)
  function lireZipTexte(buffer) {
    var v = new DataView(buffer), u8 = new Uint8Array(buffer);
    var fin = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) { if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; } }
    if (fin < 0) return Promise.reject(new Error('Archive illisible.'));
    var n = v.getUint16(fin + 10, true), p = v.getUint32(fin + 16, true), choix = null;
    for (var k = 0; k < n && p + 46 <= u8.length; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      var meth = v.getUint16(p + 10, true), taille = v.getUint32(p + 20, true), ln = v.getUint16(p + 28, true), le = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true), loc = v.getUint32(p + 42, true);
      var nom = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + ln));
      if (/\.txt$/i.test(nom) && !/^__MACOSX\//.test(nom) && (!choix || /chat/i.test(nom))) choix = { meth: meth, taille: taille, loc: loc, nom: nom };
      p += 46 + ln + le + lc;
    }
    if (!choix) return Promise.reject(new Error('Aucune conversation (.txt) dans cette archive.'));
    var debut = choix.loc + 30 + v.getUint16(choix.loc + 26, true) + v.getUint16(choix.loc + 28, true);
    var donnees = u8.subarray(debut, debut + choix.taille);
    if (choix.meth === 0) return Promise.resolve(new TextDecoder().decode(donnees));
    if (choix.meth !== 8 || typeof DecompressionStream === 'undefined') return Promise.reject(new Error('Archive non prise en charge : ouvrez le fichier .txt.'));
    var flux = new Blob([donnees]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(flux).arrayBuffer().then(function (b) { return new TextDecoder().decode(b); });
  }

  var AC = {
    API: API, API_BOUTIQUE: API_BOUTIQUE, SITE: SITE, LIMITE_GRATUITE: LIMITE_GRATUITE, MAX_PHOTOS: MAX_PHOTOS, MAX_TEXTE_IA: MAX_TEXTE_IA, MENTION: MENTION,
    CHAMPS: CHAMPS, CLES: CLES, LIBELLES: LIBELLES, STATUTS: STATUTS, EVENEMENTS: EVENEMENTS, PERMIS: PERMIS, PASS: PASS, MOIS: MOIS,
    nombre: nombre, milliers: milliers, fcfa: fcfa, normaliserMontant: normaliserMontant, calculer: calculer,
    dateDansTexte: dateDansTexte, dateFr: dateFr, dateHeure: dateHeure, aujourdhui: aujourdhui, moisCle: moisCle, iso: iso,
    lireWhatsApp: lireWhatsApp, couperTexte: couperTexte, masquerNumeros: masquerNumeros,
    lireLiensDossier: lireLiensDossier, lienDossier: lienDossier, lireLienCommande: lireLienCommande, messagePartage: messagePartage,
    passActif: passActif, finPass: finPass, creationsCeMois: creationsCeMois, peutCreer: peutCreer,
    trier: trier, etat: etat, enRetard: enRetard, auteur: auteur, changements: changements, lignesEvenement: lignesEvenement, differences: differences, nettoyer: nettoyer,
    sha256: sha256, verifierChaine: verifierChaine, comparerCopie: comparerCopie, jsonbTexte: jsonbTexte, horodatagePg: horodatagePg, recalculer: recalculer,
    lireZipTexte: lireZipTexte
  };
  if (typeof module === 'object' && module.exports) module.exports = AC;
  else racine.AC = AC;
})(typeof self !== 'undefined' ? self : this);
