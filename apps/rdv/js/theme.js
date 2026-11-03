/* Rendez-vous Pro — thème choisi (auto / clair / sombre), appliqué avant l'affichage pour éviter un flash. */
(function () {
  try {
    var t = localStorage.getItem('rdvpro-theme');
    if (t === 'clair' || t === 'sombre') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* stockage bloqué : thème du téléphone */ }
})();
