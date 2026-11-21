/* neV.NEXUS — Visite guidée (mode visiteur) : film animé, catégories, simulateur de besoin, visiteur vs compte.
   Inspirée de la visite / du tuto / du film « Réveil » de neV.BOOSTER. Rien n'est enregistré en mode visiteur.
   NEXUSVISITE.html(categories, me) · .start() · .stop() */
(function (g) {
  'use strict';
  var doc = g.document, timers = [], off = [];
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };

  var SCENES = [
    { t: 'Une personne cherche', c: 'Une formation, une aide, un projet… mais par où commencer ?' },
    { t: 'Elle exprime son besoin', c: 'Elle le décrit simplement. Il reste privé : seules les personnes habilitées le lisent.' },
    { t: 'Le réseau s’allume', c: 'neV.NEXUS relie les personnes, les organisations et les ressources.' },
    { t: 'Chaque fiche est vérifiée', c: 'Une organisation n’apparaît que lorsque ses informations ont été vérifiées.' },
    { t: 'On oriente', c: 'La modération oriente vers la bonne ressource ou la bonne opportunité.' },
    { t: 'Avancer ensemble', c: 'Vivre, progresser, contribuer : chacun trouve sa place.' }
  ];

  function film() {
    var orgs = ''; for (var i = 0; i < 6; i++) orgs += '<i class="sv-node" style="--a:' + (i * 60) + 'deg;--k:' + i + '"></i>';
    return '<div class="sv" id="sv" data-scene="0" role="img" aria-label="Film d’explication de neV.NEXUS en 6 scènes">' +
      '<div class="sv-stage" aria-hidden="true">' +
        '<div class="sv-s s0"><span class="sv-q q1">?</span><span class="sv-q q2">?</span><span class="sv-q q3">?</span><div class="sv-person"><i></i><b></b></div></div>' +
        '<div class="sv-s s1"><div class="sv-person sm"><i></i><b></b></div><div class="sv-bubble">Je cherche une formation près de chez moi<span class="sv-lock">🔒 Privé</span></div></div>' +
        '<div class="sv-s s2"><div class="sv-hub"><img src="/img/emblem.webp" alt="" width="900" height="531"></div><div class="sv-orbit">' + orgs + '</div></div>' +
        '<div class="sv-s s3"><div class="sv-card"><b>Fiche d’organisation</b><span class="sv-st st-a">En attente</span><span class="sv-st st-b">✓ Vérifiée</span></div></div>' +
        '<div class="sv-s s4"><div class="sv-person sm"><i></i><b></b></div><svg class="sv-path" viewBox="0 0 400 100" preserveAspectRatio="none"><path d="M0 70 C120 70 140 20 240 30 S360 40 400 20"/></svg><div class="sv-card r"><b>Ressource adaptée</b><span class="sv-st st-b">✓ Vérifiée</span></div></div>' +
        '<div class="sv-s s5"><div class="sv-pillars"><span>VIVRE</span><span>PROGRESSER</span><span>CONTRIBUER</span></div></div>' +
      '</div>' +
      '<p class="sv-cap" id="svCap" aria-live="polite"></p>' +
      '<div class="sv-ui"><button type="button" class="sv-btn" id="svPlay" aria-label="Lecture / pause">❚❚</button>' +
        '<div class="sv-bar"><i id="svFill"></i></div>' +
        '<div class="sv-chap">' + SCENES.map(function (s, i) { return '<button type="button" data-sc="' + i + '" aria-label="Scène ' + (i + 1) + ' : ' + esc(s.t) + '">' + (i + 1) + '</button>'; }).join('') + '</div></div></div>';
  }

  var STEPS = [['accueil', 'Accueil'], ['film', 'Le film'], ['categories', 'Catégories'], ['essai', 'Essayer'], ['compte', 'Visiteur ou compte'], ['rejoindre', 'Rejoindre']];

  function html(cats, me) {
    var catCards = cats.map(function (c, i) {
      return '<a class="cat-card" href="/categorie?c=' + esc(c.slug) + '" data-link style="--h:' + ((g.NEXUSCATHUE && g.NEXUSCATHUE[c.slug]) || 210) + ';--i:' + i + '"><h3>' + esc(c.name) + '</h3><span class="cat-go" aria-hidden="true">↗</span></a>';
    }).join('');
    var opts = '<option value="">Choisir une catégorie</option>' + cats.map(function (c) { return '<option value="' + esc(c.slug) + '">' + esc(c.name) + '</option>'; }).join('');
    return '<div class="vi" id="vi">' +
      '<nav class="vn" id="vn" aria-label="Étapes de la visite"><span class="vn-pill">Mode visiteur</span>' +
        STEPS.map(function (s, i) { return '<a href="#' + s[0] + '" data-step="' + s[0] + '"><b>' + (i + 1) + '</b> ' + s[1] + '</a>'; }).join('') +
        '<a class="vn-cta button button-small" href="' + (me ? '/compte' : '/inscription') + '" data-link>' + (me ? 'Mon espace' : 'Créer un compte') + '</a><div class="vn-prog"><i id="vnBar"></i></div></nav>' +

      '<section class="vs" id="accueil"><div class="eyebrow">Étape 1 · Accueil</div><h1>Découvrir <em>neV.NEXUS</em> en quelques minutes</h1>' +
        '<p class="vs-lead">Sans compte, rien n’est enregistré. Vous voyez comment la plateforme relie les personnes, les organisations et les possibilités.</p>' +
        '<div class="vs-trio"><article><b>01</b><h3>Exprimer</h3><p>Dire simplement ce que l’on cherche, en toute confidentialité.</p></article><article><b>02</b><h3>Connecter</h3><p>Des organisations vérifiées, des ressources et des opportunités rassemblées.</p></article><article><b>03</b><h3>Accompagner</h3><p>Une orientation humaine, puis la mesure de ce qui aide vraiment.</p></article></div>' +
        '<a class="button" href="#film">Commencer la visite ↓</a></section>' +

      '<section class="vs" id="film"><div class="eyebrow">Étape 2 · Le film</div><h2>Du besoin à <em>l’orientation</em></h2><p class="vs-lead">Un film de 36 secondes. Touchez un numéro pour changer de scène.</p>' + film() + '</section>' +

      '<section class="vs" id="categories"><div class="eyebrow">Étape 3 · Les catégories</div><h2>Huit portes <em>d’entrée</em></h2><p class="vs-lead">Chaque catégorie a sa page : ressources, opportunités et organisations vérifiées.</p><div class="cat-grid vs-cats">' + catCards + '</div></section>' +

      '<section class="vs" id="essai"><div class="eyebrow">Étape 4 · Essayer</div><h2>Simulez <em>un besoin</em></h2><p class="vs-lead">Simulation : rien n’est envoyé ni enregistré. Elle montre ce qui se passerait avec un vrai compte.</p>' +
        '<form class="vs-sim" id="simForm"><label for="simCat">Votre besoin concerne…</label><select id="simCat">' + opts + '</select><button class="button" type="submit">Voir la suite ↗</button></form>' +
        '<ol class="vs-steps" id="simOut" aria-live="polite" hidden></ol></section>' +

      '<section class="vs" id="compte"><div class="eyebrow">Étape 5 · Visiteur ou compte</div><h2>Ce que <em>change</em> un compte</h2>' +
        '<div class="vs-cmp"><div class="cmp-c off"><h3>Visiteur</h3><ul><li>Visite guidée et film</li><li>Catégories et fiches vérifiées</li><li class="no">Pas de besoin déposé</li><li class="no">Pas d’espace personnel</li></ul></div>' +
        '<div class="cmp-c on"><h3>Avec un compte</h3><ul><li>Déposer un besoin privé et le suivre</li><li>Supprimer ses données à tout moment</li><li>Organisation : soumettre sa fiche, ses ressources et opportunités</li><li>Phase pilote : inscription sur invitation</li></ul></div></div></section>' +

      '<section class="vs vs-end" id="rejoindre"><div class="eyebrow">Étape 6 · Rejoindre</div><h2>Prêt à <em>avancer ensemble</em> ?</h2><p class="vs-lead">Une adresse électronique suffit. La phase pilote se fait sur code d’invitation.</p>' +
        '<div class="vs-cta"><a class="button" href="' + (me ? '/compte' : '/inscription') + '" data-link>' + (me ? 'Mon espace' : 'Créer mon compte') + ' ↗</a><a class="button button-outline" href="/explorer" data-link>Explorer sans compte</a></div>' +
        '<label class="vs-lite"><input type="checkbox" id="liteBox"> Mode allégé sur cet appareil <small>(moins d’animations, plus rapide, utile si la connexion est lente)</small></label></section></div>';
  }

  function start(cats) {
    stop();
    var root = doc.getElementById('vi'); if (!root) return;
    var later = function (fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; };

    /* ----- film ----- */
    var sv = doc.getElementById('sv'), cap = doc.getElementById('svCap'), play = doc.getElementById('svPlay'), fill = doc.getElementById('svFill');
    var scene = 0, playing = true, DUR = 6000, tick = null, t0 = 0, acc = 0;
    var lite = !!(g.NEXUSLITE && g.NEXUSLITE.get());
    var setScene = function (n) {
      scene = (n + SCENES.length) % SCENES.length; acc = 0; t0 = Date.now();
      sv.setAttribute('data-scene', scene); cap.textContent = SCENES[scene].t + ' — ' + SCENES[scene].c;
      sv.querySelectorAll('.sv-chap button').forEach(function (b, i) { b.classList.toggle('on', i === scene); b.classList.toggle('past', i < scene); });
    };
    var loop = function () {
      var e = acc + (playing ? Date.now() - t0 : 0);
      fill.style.width = Math.min(100, ((scene + Math.min(1, e / DUR)) / SCENES.length) * 100) + '%';
      if (playing && e >= DUR) setScene(scene + 1);
    };
    var inView = false;
    var io = ('IntersectionObserver' in g) ? new IntersectionObserver(function (en) {
      inView = en[0].isIntersecting;
      if (inView && playing) { t0 = Date.now(); } else if (!inView && playing) { acc += Date.now() - t0; t0 = Date.now(); }
    }, { threshold: .35 }) : null;
    if (io) { io.observe(sv); off.push(function () { io.disconnect(); }); } else inView = true;
    setScene(0);
    tick = setInterval(function () { if (inView || !io) loop(); }, 120);
    off.push(function () { clearInterval(tick); });
    play.addEventListener('click', function () {
      if (playing) { acc += Date.now() - t0; playing = false; play.textContent = '▶'; }
      else { t0 = Date.now(); playing = true; play.textContent = '❚❚'; }
    });
    if (lite) { playing = false; play.textContent = '▶'; }
    sv.querySelector('.sv-chap').addEventListener('click', function (e) { var b = e.target.closest('button[data-sc]'); if (b) setScene(+b.dataset.sc); });

    /* ----- navigation des étapes + barre de progression ----- */
    var links = root.querySelectorAll('.vn a[data-step]'), secs = root.querySelectorAll('.vs');
    var onScroll = function () {
      var y = g.scrollY + g.innerHeight * .35, cur = 0;
      secs.forEach(function (s, i) { if (s.offsetTop <= y) cur = i; });
      links.forEach(function (a, i) { a.classList.toggle('on', i === cur); });
      var max = doc.documentElement.scrollHeight - g.innerHeight;
      doc.getElementById('vnBar').style.width = (max > 0 ? Math.min(100, g.scrollY / max * 100) : 0) + '%';
    };
    g.addEventListener('scroll', onScroll, { passive: true }); off.push(function () { g.removeEventListener('scroll', onScroll); }); onScroll();
    root.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]'); if (!a) return;
      e.preventDefault(); var t = doc.getElementById(a.getAttribute('href').slice(1));
      if (t) t.scrollIntoView({ behavior: lite ? 'auto' : 'smooth', block: 'start' });
    });

    /* ----- simulateur de besoin : honnête, basé sur les vrais compteurs ----- */
    doc.getElementById('simForm').addEventListener('submit', function (e) {
      e.preventDefault(); e.stopPropagation();
      var slug = doc.getElementById('simCat').value, c = cats.filter(function (x) { return x.slug === slug; })[0], out = doc.getElementById('simOut');
      if (!c) { out.hidden = false; out.innerHTML = '<li><b>Choisissez d’abord une catégorie.</b></li>'; return; }
      var n = (c.resources || 0) + (c.opportunities || 0) + (c.organizations || 0);
      out.hidden = false;
      out.innerHTML = '<li><b>Votre besoin reste privé</b><span>Il n’est visible que par les personnes habilitées de la modération, et chaque lecture est journalisée.</span></li>' +
        '<li><b>La modération l’examine</b><span>Elle cherche, parmi les fiches vérifiées, ce qui correspond à « ' + esc(c.name) + ' ».</span></li>' +
        '<li><b>Vous êtes orienté·e</b><span>' + (n ? 'Aujourd’hui, cette catégorie contient ' + n + ' fiche' + (n > 1 ? 's' : '') + ' vérifiée' + (n > 1 ? 's' : '') + '. <a class="text-link" href="/categorie?c=' + esc(c.slug) + '" data-link>Voir la catégorie ↗</a>' : 'Cette catégorie n’a pas encore de contenu vérifié : les premières fiches arrivent avec les premiers partenaires.') + '</span></li>';
    });

    /* ----- mode allégé ----- */
    var lb = doc.getElementById('liteBox');
    if (lb && g.NEXUSLITE) { lb.checked = g.NEXUSLITE.get(); lb.addEventListener('change', function () { g.NEXUSLITE.set(lb.checked); if (lb.checked) { playing = false; play.textContent = '▶'; } }); }
  }
  function stop() { timers.forEach(clearTimeout); timers = []; off.forEach(function (f) { f(); }); off = []; }

  g.NEXUSVISITE = { html: html, start: start, stop: stop };
})(window);
