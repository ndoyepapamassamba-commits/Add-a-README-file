/* Budget Famille — applique le thème et la taille du texte avant l'affichage (pas de flash clair en mode sombre) */
(function () {
  try {
    var t = localStorage.getItem('bf-theme'), g = localStorage.getItem('bf-grand');
    if (t === 'clair') document.documentElement.setAttribute('data-theme', 'light');
    else if (t === 'sombre') document.documentElement.setAttribute('data-theme', 'dark');
    if (g === '1') document.documentElement.classList.add('grand');
  } catch (e) { /* stockage indisponible : thème automatique */ }
})();
