/* PouletPilot — applique le thème choisi avant l'affichage (évite un flash clair en mode sombre) */
(function () {
  try {
    var t = localStorage.getItem('pp-theme');
    if (t === 'clair' || t === 'sombre') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* stockage indisponible : thème automatique */ }
})();
