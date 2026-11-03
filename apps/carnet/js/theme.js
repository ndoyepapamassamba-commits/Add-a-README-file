/* Carnet Boutique — applique le thème et la taille du texte avant l'affichage (pas d'éclair blanc en mode sombre) */
(function () {
  try {
    var t = localStorage.getItem('cb-theme'), d = document.documentElement;
    if (t === 'clair') d.setAttribute('data-theme', 'light'); else if (t === 'sombre') d.setAttribute('data-theme', 'dark');
    if (localStorage.getItem('cb-taille') === 'grande') d.setAttribute('data-taille', 'grande');
  } catch (e) { /* stockage indisponible : réglages automatiques */ }
})();
