/* neV.NEXUS — ouverture cinématique : la planète se lève derrière, le logo se révèle devant, puis « Explorer ».
   Même déroulé que l'ouverture de neV.BOOSTER (trait de lumière → logo → nom → slogan), aux couleurs de neV.NEXUS.
   NEXUSLANDING.html(me) · .start({ onExplore }) · .stop() */
(function (g) {
  'use strict';
  var doc = g.document, ctl = null;
  var reduced = !!(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var seen = function () { try { return !!g.sessionStorage.getItem('nevIntroSeen'); } catch (e) { return false; } };
  var mark = function () { try { g.sessionStorage.setItem('nevIntroSeen', '1'); } catch (e) {} };

  /* mode allégé : moins d'animations, utile sur connexion lente ou appareil modeste */
  var LK = 'nevLite';
  var NL = { get: function () { try { return g.localStorage.getItem(LK) === '1'; } catch (e) { return false; } },
    set: function (on) { try { on ? g.localStorage.setItem(LK, '1') : g.localStorage.removeItem(LK); } catch (e) {} NL.apply(); },
    apply: function () { doc.body.classList.toggle('lite', NL.get()); try { doc.dispatchEvent(new CustomEvent('nevlite')); } catch (e) {} } };
  g.NEXUSLITE = NL; NL.apply();

  function html(me) {
    return '<section class="lp" id="lp" aria-label="neV.NEXUS — Connecting People, Creating Opportunities">' +
      '<div class="lp-stars" id="lpStars" aria-hidden="true"><i class="lp-shoot"></i></div>' +
      '<div class="lp-halo" aria-hidden="true"></div>' +
      '<div class="lp-planet" aria-hidden="true"><div class="lp-par"><img src="/img/planet.webp" alt="" width="1920" height="293" decoding="async"></div></div>' +
      '<div class="lp-sweep" aria-hidden="true"></div>' +
      '<div class="lp-logo" id="lpLogo"><div class="lp-float">' +
        '<div class="lp-stage" aria-hidden="true"><i class="lp-line"></i><i class="lp-ring"></i><i class="lp-ring r2"></i>' +
          '<img class="lp-emblem" src="/img/emblem.webp" alt="" width="900" height="531" decoding="async"></div>' +
        '<h1 class="lp-word"><span class="sr-only">neV.NEXUS</span><img src="/img/word.webp" alt="" aria-hidden="true" width="1100" height="136" decoding="async"></h1>' +
        '<p class="lp-tag"><span class="sr-only">Connecting People, Creating Opportunities</span><img src="/img/tagline.webp" alt="" aria-hidden="true" width="1300" height="49" decoding="async"></p>' +
      '</div></div>' +
      '<div class="lp-cta"><a class="lp-btn" id="exploreBtn" href="/explorer" data-link>Explorer <span aria-hidden="true">↗</span></a>' +
        '<p class="lp-sub">Ressources · Opportunités · Organisations vérifiées</p>' +
        '<a class="lp-visit" href="/visite" data-link>▶ Visite guidée</a></div>' +
      '<button class="lp-skip" id="lpSkip" type="button">Passer ›</button>' +
      '<nav class="lp-foot" aria-label="Liens"><a href="/a-propos" data-link>À propos</a>' +
        (me ? '<a href="/compte" data-link>Mon espace</a>' : '<a href="/connexion" data-link>Connexion</a>') +
        '<a href="/confidentialite" data-link>Confidentialité</a><button type="button" class="lp-set" data-settings>Réglages</button></nav>' +
      '<i class="lp-flash" aria-hidden="true"></i></section>';
  }

  function stars(box) {
    var n = g.innerWidth < 640 ? 38 : 80, out = '';
    for (var i = 0; i < n; i++) {
      var r = function (a, b) { return (a + Math.random() * (b - a)); };
      out += '<i style="--x:' + r(0, 100).toFixed(1) + '%;--y:' + r(0, 78).toFixed(1) + '%;--s:' + r(1, 2.6).toFixed(1) + 'px;--o:' + r(.35, 1).toFixed(2) + ';--t:' + r(3, 8).toFixed(1) + 's;--d:-' + r(0, 8).toFixed(1) + 's"></i>';
    }
    box.insertAdjacentHTML('beforeend', out);
  }

  function start(opts) {
    stop();
    var lp = doc.getElementById('lp'); if (!lp) return;
    opts = opts || {};
    var timers = [], off = [], leaving = false;
    var later = function (fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; };
    if (!NL.get()) stars(doc.getElementById('lpStars'));

    var quick = reduced || seen() || NL.get();
    if (quick) { lp.classList.add('settled'); lp.classList.add('done'); }
    else {
      lp.classList.add('play'); mark();
      later(function () { lp.classList.add('done'); }, 4700);    // le bouton « Passer » disparaît quand tout est en place
    }
    doc.addEventListener('nevlite', function onl() { if (!doc.getElementById('lp')) { doc.removeEventListener('nevlite', onl); return; } if (NL.get()) { lp.classList.remove('play'); lp.classList.add('settled', 'done'); } });
    doc.getElementById('lpSkip').addEventListener('click', function () { lp.classList.remove('play'); lp.classList.add('settled', 'done'); });

    /* parallaxe douce : la planète et le logo suivent le pointeur / l'inclinaison de l'appareil, en sens opposés */
    var par = function (x, y) { lp.style.setProperty('--mx', (x - 0.5).toFixed(3)); lp.style.setProperty('--my', (y - 0.5).toFixed(3)); };
    var mv = function (e) { par(e.clientX / g.innerWidth, e.clientY / g.innerHeight); };
    var ori = function (e) { if (e.gamma != null) par(0.5 + Math.max(-30, Math.min(30, e.gamma)) / 100, 0.5 + Math.max(-30, Math.min(30, (e.beta || 45) - 45)) / 120); };
    if (!reduced) { g.addEventListener('pointermove', mv, { passive: true }); g.addEventListener('deviceorientation', ori, { passive: true }); }
    off.push(function () { g.removeEventListener('pointermove', mv); g.removeEventListener('deviceorientation', ori); });

    /* « Explorer » : éclat bleu puis flou, avant d'ouvrir la page des catégories */
    doc.getElementById('exploreBtn').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (leaving) return; leaving = true;
      lp.classList.add('leaving');
      later(function () { if (opts.onExplore) opts.onExplore('/explorer'); }, reduced ? 0 : 650);
    });
    ctl = { stop: function () { timers.forEach(clearTimeout); off.forEach(function (f) { f(); }); } };
  }
  function stop() { if (ctl) { ctl.stop(); ctl = null; } }

  g.NEXUSLANDING = { html: html, start: start, stop: stop };
})(window);
