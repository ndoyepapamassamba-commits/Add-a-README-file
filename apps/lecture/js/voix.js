/* Lecture Facile — lecture à voix haute avec la voix française du téléphone (speechSynthesis).
   Signale chaque mot prononcé quand le navigateur le permet (événement « boundary »). Facultatif : l'appli marche sans. */
(function () {
  'use strict';
  var synth = null;
  try { synth = window.speechSynthesis || null; } catch (e) { synth = null; }
  var liste = [], enCours = [], jeton = 0;
  function charger() { try { liste = synth ? (synth.getVoices() || []) : []; } catch (e) { liste = []; } return liste; }
  if (synth) {
    charger();
    try { synth.addEventListener('voiceschanged', charger); } catch (e) { try { synth.onvoiceschanged = charger; } catch (e2) {} }
  }
  function langue(v) { return String(v && v.lang || '').replace('_', '-').toLowerCase(); }
  function voixFrancaises() { if (!liste.length) charger(); return liste.filter(function (v) { return langue(v).split('-')[0] === 'fr'; }); }
  // Voix choisie (par son nom), sinon français de France, sinon une voix française ; voix du téléphone en priorité.
  function choisir(nom) {
    var fr = voixFrancaises();
    if (nom) for (var i = 0; i < fr.length; i++) if (fr[i].name === nom) return fr[i];
    var note = function (v) { return (langue(v) === 'fr-fr' ? 4 : 0) + (v.localService ? 2 : 0) + (v['default'] ? 1 : 0); };
    return fr.slice().sort(function (a, b) { return note(b) - note(a); })[0] || null;
  }
  // o : { vitesse, voix (nom), debut(), mot(charIndex), fin(ok) }. Renvoie une fonction d'arrêt.
  function dire(texte, o) {
    o = o || {};
    var monJeton = ++jeton;
    if (!synth || !window.SpeechSynthesisUtterance) { if (o.fin) setTimeout(function () { o.fin(false); }, 0); return function () {}; }
    var u = new SpeechSynthesisUtterance(String(texte));
    var v = choisir(o.voix);
    if (v) { u.voice = v; u.lang = String(v.lang).replace('_', '-'); } else u.lang = 'fr-FR';
    u.rate = o.vitesse || 1;
    u.pitch = 1;
    var fini = false;
    var terminer = function (ok) {
      if (fini) return; fini = true;
      enCours = enCours.filter(function (x) { return x !== u; });
      if (o.fin && monJeton === jeton) o.fin(ok);
    };
    u.onstart = function () { if (o.debut && monJeton === jeton) o.debut(); };
    u.onboundary = function (e) {
      if (monJeton !== jeton || !o.mot) return;
      if (e && (e.name === 'word' || e.name == null) && typeof e.charIndex === 'number') o.mot(e.charIndex);
    };
    u.onend = function () { terminer(true); };
    u.onerror = function () { terminer(false); };
    enCours.push(u);
    try {
      if (synth.speaking || synth.pending) synth.cancel();
      synth.speak(u);
      if (synth.paused) synth.resume();
    } catch (e) { terminer(false); }
    return function () { arreter(); };
  }
  function arreter() { jeton++; try { if (synth) synth.cancel(); } catch (e) {} }

  window.Voix = {
    synthese: !!(synth && window.SpeechSynthesisUtterance),
    voixFrancaises: voixFrancaises, choisir: choisir, dire: dire, arreter: arreter
  };
})();
