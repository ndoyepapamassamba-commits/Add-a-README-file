/* Calcul Chantier — applique le thème choisi avant l'affichage (évite un flash clair en mode sombre) */
(function () {
  try {
    var t = localStorage.getItem('cc-theme');
    if (t === 'clair') document.documentElement.setAttribute('data-theme', 'light');
    else if (t === 'sombre') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) { /* stockage indisponible : thème automatique */ }
})();
