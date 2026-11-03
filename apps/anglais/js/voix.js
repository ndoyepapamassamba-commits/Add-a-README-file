/* Anglais du Métier — voix du téléphone : lecture à voix haute (speechSynthesis) et reconnaissance de la parole
   (si le navigateur la propose). Tout est facultatif : l'application marche sans. */
(function () {
  'use strict';
  var synth = null;
  try { synth = window.speechSynthesis || null; } catch (e) { synth = null; }
  var liste = [];
  var enCours = [];   // garde une référence aux phrases en cours (sinon certains navigateurs les oublient)
  function charger() { try { liste = synth ? (synth.getVoices() || []) : []; } catch (e) { liste = []; } return liste; }
  if (synth) {
    charger();
    try { synth.addEventListener('voiceschanged', charger); } catch (e) { try { synth.onvoiceschanged = charger; } catch (e2) {} }
  }
  function langue(v) { return String(v && v.lang || '').replace('_', '-').toLowerCase(); }
  // Meilleure voix pour « en-GB » : accent exact d'abord, puis même langue ; voix du téléphone (hors ligne) en priorité.
  function choisir(pref) {
    if (!liste.length) charger();
    var p = String(pref || 'en-GB').toLowerCase(), base = p.split('-')[0];
    var note = function (v) { return (v.localService ? 2 : 0) + (v['default'] ? 1 : 0); };
    var exact = liste.filter(function (v) { return langue(v) === p; }).sort(function (a, b) { return note(b) - note(a); });
    if (exact.length) return exact[0];
    var meme = liste.filter(function (v) { return langue(v).split('-')[0] === base; }).sort(function (a, b) { return note(b) - note(a); });
    return meme[0] || null;
  }
  function accentDisponible(pref) { var v = choisir(pref); return !!v && langue(v) === String(pref).toLowerCase(); }
  var jeton = 0;
  // Dit un texte. o : { lang, vitesse, fin, debut }. Renvoie une fonction d'arrêt.
  function dire(texte, o) {
    o = o || {};
    var monJeton = ++jeton;
    if (!synth || !window.SpeechSynthesisUtterance) { if (o.fin) setTimeout(function () { o.fin(false); }, 0); return function () {}; }
    var u = new SpeechSynthesisUtterance(String(texte));
    var v = choisir(o.lang || 'en-GB');
    if (v) { u.voice = v; u.lang = String(v.lang).replace('_', '-'); } else u.lang = o.lang || 'en-GB';
    u.rate = o.vitesse || 1;
    u.pitch = 1;
    var fini = false;
    var terminer = function (ok) {
      if (fini) return; fini = true;
      enCours = enCours.filter(function (x) { return x !== u; });
      if (o.fin && monJeton === jeton) o.fin(ok);
    };
    u.onstart = function () { if (o.debut) o.debut(); };
    u.onend = function () { terminer(true); };
    u.onerror = function () { terminer(false); };
    enCours.push(u);
    try {
      if (synth.speaking || synth.pending) synth.cancel();
      synth.speak(u);
      if (synth.paused) synth.resume();
    } catch (e) { terminer(false); }
    return function () { jeton++; try { synth.cancel(); } catch (e) {} };
  }
  // Dit plusieurs morceaux à la suite : [{ texte, lang, pause }]
  function suite(morceaux, o) {
    o = o || {};
    var i = 0, arrete = false, minuteur = 0, stop = function () {};
    var suivant = function () {
      if (arrete) return;
      if (i >= morceaux.length) { if (o.fin) o.fin(); return; }
      var m = morceaux[i++];
      if (o.morceau) o.morceau(i - 1, m);
      stop = dire(m.texte, { lang: m.lang, vitesse: m.vitesse || o.vitesse, fin: function () {
        if (arrete) return;
        minuteur = setTimeout(suivant, m.pause == null ? 350 : m.pause);
      } });
    };
    suivant();
    return function () { arrete = true; clearTimeout(minuteur); stop(); arreter(); };
  }
  function arreter() { jeton++; try { if (synth) synth.cancel(); } catch (e) {} }

  var Reco = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  // Écoute une phrase. o : { lang, resultat(alternatives[]), erreur(code), fin() }. Renvoie une fonction d'arrêt.
  function ecouter(o) {
    if (!Reco) { if (o.erreur) o.erreur('indisponible'); return function () {}; }
    var r;
    try { r = new Reco(); } catch (e) { if (o.erreur) o.erreur('indisponible'); return function () {}; }
    r.lang = o.lang || 'en-GB';
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 3;
    var recu = false;
    r.onresult = function (e) {
      var alts = [];
      try {
        var res = e.results[e.results.length - 1];
        for (var i = 0; i < res.length; i++) if (res[i] && res[i].transcript) alts.push(res[i].transcript);
      } catch (x) {}
      recu = true;
      if (o.resultat) o.resultat(alts);
    };
    r.onerror = function (e) { if (o.erreur) o.erreur(e && e.error || 'erreur'); };
    r.onend = function () { if (o.fin) o.fin(recu); };
    try { r.start(); } catch (e) { if (o.erreur) o.erreur('demarrage'); }
    return function () { try { r.stop(); } catch (e) {} };
  }

  window.Voix = {
    synthese: !!(synth && window.SpeechSynthesisUtterance),
    reconnaissance: !!Reco,
    choisir: choisir, accentDisponible: accentDisponible, dire: dire, suite: suite, arreter: arreter, ecouter: ecouter,
    voix: function () { return charger(); }
  };
})();
