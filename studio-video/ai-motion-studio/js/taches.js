/* MASSAMBA AI MOTION STUDIO — gestionnaire de tâches de génération (22/10/2026).
 * États : attente → envoi → encours → finalisation → terminee | echec | annulee.
 * - double soumission bloquée (même empreinte déjà en cours) ;
 * - concurrence limitée (1 par Space gratuit pour ménager le quota, 2 au total par défaut) ;
 * - temporisation : délai maximal par tâche, puis échec lisible ;
 * - une seule reprise automatique quand la file gratuite n'a pas de GPU libre ; sinon relance manuelle ;
 * - coupure réseau détectée et dite clairement ;
 * - après actualisation : les tâches du serveur local sont reprises (identifiant conservé), celles d'un Space sont
 *   marquées « interrompues » (une session Gradio ne survit pas à la page).
 * Aucune clé n'est jamais stockée dans une tâche. */
(function (racine) {
  'use strict';
  var ETATS = ['attente', 'envoi', 'encours', 'finalisation', 'terminee', 'echec', 'annulee'];
  var LIBELLES = { attente: 'En attente', envoi: 'Envoi', encours: 'En cours', finalisation: 'Finalisation', terminee: 'Terminée', echec: 'Échec', annulee: 'Annulée' };
  var ACTIFS = { attente: 1, envoi: 1, encours: 1, finalisation: 1 };

  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /** empreinte d'une demande : modèle, mode, consigne, réglages, taille et nom des images. */
  function empreinte(modeleId, d) {
    var img = d.image ? (d.image.size + ':' + (d.image.name || '')) : '-', fin = d.fin ? (d.fin.size + ':' + (d.fin.name || '')) : '-';
    return hash([modeleId, d.mode, d.prompt, d.dureeS, d.format, d.graine, img, fin].join('|'));
  }

  function estReseau(e) {
    var m = String((e && e.message) || e || '');
    return (e && e.name === 'TypeError' && /fetch|network|load failed/i.test(m)) || /network|réseau|ERR_INTERNET|Failed to fetch/i.test(m);
  }
  function estFileSansGpu(e) { return /Aucun GPU libre|No GPU was available/i.test(String((e && e.message) || e || '')); }

  function Gestionnaire(o) {
    o = o || {};
    this.taches = [];
    this.maxTotal = o.maxTotal || 2;
    this.maxParSource = o.maxParSource || 1;
    this.delaiMaxMs = o.delaiMaxMs || 15 * 60 * 1000;
    this.repriseMs = o.repriseMs != null ? o.repriseMs : 45000;
    this.executer = o.executer;            // function(tache, suivi, signal) → Promise<résultat>
    this.surChangement = o.surChangement || function () {};
    this.enLigne = o.enLigne || function () { return typeof navigator === 'undefined' || navigator.onLine !== false; };
    this._ctrl = {};
  }

  Gestionnaire.prototype.etat = function (t, etat, extra) {
    if (ETATS.indexOf(etat) < 0) throw new Error('état inconnu ' + etat);
    var change = t.etat !== etat || ((extra && extra.message) && extra.message !== t.message);
    t.etat = etat; t.libelle = LIBELLES[etat]; t.majLe = Date.now();
    if (extra) for (var k in extra) t[k] = extra[k];
    if (change) t.journal.push({ t: t.majLe, etat: etat, message: (extra && extra.message) || null });
    this.surChangement(t, this.taches);
  };

  /** ajoute une tâche ; refuse une double soumission identique encore active. */
  Gestionnaire.prototype.ajouter = function (def) {
    var e = empreinte(def.modeleId, def.demande);
    var double = this.taches.filter(function (t) { return t.empreinte === e && ACTIFS[t.etat]; })[0];
    if (double) { var err = new Error('Cette génération est déjà en cours (tâche ' + double.id + ').'); err.code = 'double'; throw err; }
    var t = { id: uid(), empreinte: e, modeleId: def.modeleId, modeleNom: def.modeleNom, fournisseur: def.fournisseur, source: def.source || def.modeleId,
      voie: def.voie, nature: def.voie === 'demo' ? 'demo' : 'ia', mode: def.demande.mode, prompt: def.demande.prompt,
      parametres: { dureeS: def.demande.dureeS, format: def.demande.format, graine: def.demande.graine, fin: !!def.demande.fin },
      cout: def.cout || null, sceneId: def.sceneId || null, creeLe: Date.now(), journal: [], essais: 0, demande: def.demande };
    this.taches.unshift(t);
    this.etat(t, 'attente');
    this.pomper();
    return t;
  };

  Gestionnaire.prototype.actives = function (source) {
    return this.taches.filter(function (t) { return (t.etat === 'envoi' || t.etat === 'encours' || t.etat === 'finalisation') && (!source || t.source === source); }).length;
  };

  Gestionnaire.prototype.pomper = function () {
    var self = this;
    var attente = this.taches.filter(function (t) { return t.etat === 'attente' && !t.differeJusqua; }).reverse();
    attente.forEach(function (t) {
      if (self.actives() >= self.maxTotal) return;
      if (self.actives(t.source) >= self.maxParSource) return;
      self.lancer(t);
    });
  };

  Gestionnaire.prototype.lancer = function (t) {
    var self = this;
    if (!this.enLigne()) { this.etat(t, 'echec', { erreur: 'Pas de connexion réseau : relancez quand la connexion revient.' }); return; }
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : { signal: { aborted: false }, abort: function () { this.signal.aborted = true; } };
    this._ctrl[t.id] = ctrl; t.essais++; t.lanceLe = Date.now();
    this.etat(t, 'envoi');
    var minuterie = setTimeout(function () { t._delai = true; ctrl.abort(); }, this.delaiMaxMs); ctrl._minuterie = minuterie;
    Promise.resolve()
      .then(function () {
        return self.executer(t, function (s) {
          if (!ACTIFS[t.etat] || t.etat === 'attente') return;
          var ex = {}; if (s.rang != null) ex.rang = s.rang; if (s.attenteS != null) ex.attenteS = s.attenteS;
          ex.progression = s.progression != null ? s.progression : null; if (s.message) ex.message = s.message;
          if (s.idFournisseur) ex.idFournisseur = s.idFournisseur;
          self.etat(t, s.etat || 'encours', ex);
        }, ctrl.signal);
      })
      .then(function (res) {
        clearTimeout(minuterie); delete self._ctrl[t.id];
        if (t.etat === 'annulee') return;
        self.etat(t, 'terminee', { resultat: res, finLe: Date.now(), dureeMs: Date.now() - t.lanceLe, progression: null, message: null });
      }, function (e) {
        clearTimeout(minuterie); delete self._ctrl[t.id];
        if (t.etat === 'annulee') return;
        if (t._delai) { self.etat(t, 'echec', { erreur: 'Délai dépassé (' + Math.round(self.delaiMaxMs / 60000) + ' min) : le service n’a pas répondu. Relancez plus tard.' }); return; }
        if (estReseau(e) || !self.enLigne()) { self.etat(t, 'echec', { erreur: 'Connexion réseau interrompue pendant la génération : relancez quand le réseau revient.', reseau: true }); return; }
        if (estFileSansGpu(e) && t.essais < 2 && self.repriseMs >= 0) {
          self.etat(t, 'attente', { message: 'Aucun GPU libre : nouvel essai automatique dans ' + Math.round(self.repriseMs / 1000) + ' s.', differeJusqua: Date.now() + self.repriseMs });
          setTimeout(function () { t.differeJusqua = null; self.pomper(); }, self.repriseMs);
          return;
        }
        self.etat(t, 'echec', { erreur: String((e && e.message) || e) });
      })
      .then(function () { self.pomper(); });
  };

  Gestionnaire.prototype.annuler = function (id) {
    var t = this.trouver(id); if (!t || !ACTIFS[t.etat]) return false;
    var c = this._ctrl[id]; this.etat(t, 'annulee', { message: 'Annulée par l’utilisateur.' });
    if (c) { clearTimeout(c._minuterie); c.abort(); delete this._ctrl[id]; }
    this.pomper(); return true;
  };

  Gestionnaire.prototype.relancer = function (id) {
    var t = this.trouver(id); if (!t || ACTIFS[t.etat]) return null;
    if (!t.demande) throw new Error('Paramètres d’origine perdus (page actualisée) : relancez depuis le studio de génération.');
    t.erreur = null; t.essais = 0; this.etat(t, 'attente', { message: 'Relance manuelle' }); this.pomper(); return t;
  };

  Gestionnaire.prototype.trouver = function (id) { for (var i = 0; i < this.taches.length; i++) if (this.taches[i].id === id) return this.taches[i]; return null; };

  /** version enregistrable : sans Blob ni demande brute (les images restent dans la médiathèque). */
  Gestionnaire.prototype.exporter = function () {
    return this.taches.map(function (t) {
      var c = {}; for (var k in t) if (k !== 'demande' && k !== 'resultat' && k[0] !== '_') c[k] = t[k];
      c.resultatMediaId = t.resultatMediaId || null; return c;
    });
  };

  /** recharge l'historique après actualisation. */
  Gestionnaire.prototype.restaurer = function (liste) {
    var self = this;
    this.taches = (liste || []).map(function (t) {
      t.journal = t.journal || [];
      if (ACTIFS[t.etat] && !(t.voie === 'serveur' && t.idFournisseur)) {
        t.etat = 'echec'; t.libelle = LIBELLES.echec; t.erreur = 'Interrompue par l’actualisation de la page : relancez la génération.';
      }
      return t;
    });
    return this.taches.filter(function (t) { return ACTIFS[t.etat] && t.voie === 'serveur' && t.idFournisseur; });
  };

  var API = { Gestionnaire: Gestionnaire, ETATS: ETATS, LIBELLES: LIBELLES, empreinte: empreinte, estReseau: estReseau, estFileSansGpu: estFileSansGpu };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else { racine.MAMS = racine.MAMS || {}; racine.MAMS.taches = API; }
})(typeof self !== 'undefined' ? self : this);
