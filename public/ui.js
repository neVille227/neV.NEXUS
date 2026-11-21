/* neV.NEXUS — Réglages (feuille superposée) : apparence Auto / Clair / Sombre, mode allégé, guide, liens utiles.
   NEXUSUI.openSettings() */
(function (g) {
  'use strict';
  var doc = g.document, dlg = null;
  var get = function () { try { return g.localStorage.getItem('nevTheme') || 'auto'; } catch (e) { return 'auto'; } };
  function apply(t) {
    try { t === 'auto' ? g.localStorage.removeItem('nevTheme') : g.localStorage.setItem('nevTheme', t); } catch (e) {}
    var r = doc.documentElement; if (t === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t);
    /* la barre du navigateur suit le thème */
    var dark = t === 'dark' || (t === 'auto' && g.matchMedia && g.matchMedia('(prefers-color-scheme: dark)').matches);
    doc.querySelectorAll('meta[name=theme-color]').forEach(function (m, i) { if (i) m.remove(); else { m.removeAttribute('media'); m.setAttribute('content', dark ? '#050c1c' : '#f5f5f7'); } });
  }
  function build() {
    dlg = doc.createElement('dialog'); dlg.className = 'dlg sheet'; dlg.setAttribute('aria-labelledby', 'setT');
    var cur = get(), lite = g.NEXUSLITE && g.NEXUSLITE.get();
    var opt = function (v, l) { return '<label><input type="radio" name="theme" value="' + v + '"' + (cur === v ? ' checked' : '') + '><span>' + l + '</span></label>'; };
    var chev = '<svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg>';
    dlg.innerHTML = '<div class="dlg-head"><h2 id="setT">Réglages</h2><button class="button button-small" type="button" data-close>OK</button></div>' +
      '<div class="dlg-sec">Apparence</div><div class="seg" role="radiogroup" aria-label="Apparence">' + opt('auto', 'Auto') + opt('light', 'Clair') + opt('dark', 'Sombre') + '</div>' +
      '<div class="dlg-sec">Performance</div><label class="sw"><span>Mode allégé<small>Moins d’animations, plus rapide sur une connexion ou un appareil lent.</small></span><input type="checkbox" id="setLite"' + (lite ? ' checked' : '') + '></label>' +
      '<div class="dlg-sec">Aide</div><ul class="glist"><li><button type="button" data-guide><span>Faire le tour du site<small>Guide en 7 étapes</small></span>' + chev + '</button></li>' +
      '<li><a href="/visite" data-link><span>Visite guidée<small>Film et simulateur, sans compte</small></span>' + chev + '</a></li>' +
      '<li><button type="button" data-intro><span>Revoir l’animation d’ouverture</span>' + chev + '</button></li></ul>' +
      '<div class="dlg-sec">À propos</div><ul class="glist"><li><a href="/a-propos" data-link><span>À propos de neV.NEXUS</span>' + chev + '</a></li><li><a href="/confidentialite" data-link><span>Confidentialité</span>' + chev + '</a></li><li><a href="/contact" data-link><span>Contact</span>' + chev + '</a></li></ul>';
    doc.body.appendChild(dlg);
    dlg.addEventListener('change', function (e) {
      if (e.target.name === 'theme') apply(e.target.value);
      if (e.target.id === 'setLite') g.NEXUSLITE.set(e.target.checked);
    });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
      if (e.target.closest('a[data-link]')) return dlg.close();      /* la navigation est gérée par l'application */
      if (e.target.closest('[data-guide]')) { dlg.close(); g.NEXUSGUIDE && g.NEXUSGUIDE.open(0); }
      if (e.target.closest('[data-intro]')) { dlg.close(); try { g.sessionStorage.removeItem('nevIntroSeen'); } catch (x) {} g.history.pushState({}, '', '/'); g.dispatchEvent(new PopStateEvent('popstate')); }
    });
  }
  function openSettings() {
    if (dlg) dlg.remove(); build();
    try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
  }
  doc.addEventListener('click', function (e) { if (e.target.closest('[data-settings]')) { e.preventDefault(); openSettings(); } });
  g.NEXUSUI = { openSettings: openSettings };
})(window);
