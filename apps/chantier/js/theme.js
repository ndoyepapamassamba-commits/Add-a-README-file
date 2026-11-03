/* Chantier Clair — thème choisi (clair / sombre / auto), appliqué avant l'affichage pour éviter un flash. */
(function () {
  try {
    var t = localStorage.getItem('chantierclair-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* stockage bloqué : thème du téléphone */ }
})();
