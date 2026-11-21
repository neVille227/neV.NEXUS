/* neV.NEXUS — applique tout de suite le thème choisi (Clair / Sombre). « Auto » = réglage de l'appareil, géré par le CSS. */
(function () {
  try { var t = localStorage.getItem('nevTheme'); if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) {}
})();
