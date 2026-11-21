/* neV.NEXUS — guide du premier passage, bouton « ? » et bouton ⚡ « mode allégé » sur toutes les pages.
   Même principe que le guide de NEHODO.22 : une invitation discrète à la première visite, un tour en 7 étapes
   avec mise en évidence du menu, et un bouton pour le rouvrir à tout moment. */
(function (g) {
  'use strict';
  var doc = g.document, KEY = 'nevGuide', card = null, prompt = null, i = 0, hl = null;
  var lite = function () { return g.NEXUSLITE && g.NEXUSLITE.get(); };

  var STEPS = [
    { t: 'Bienvenue sur neV.NEXUS', p: 'Ici, les personnes trouvent des ressources, des opportunités et des organisations vérifiées. Ce tour dure 30 secondes.', icon: 'N' },
    { t: 'Explorer par catégorie', p: 'Huit catégories : orientation, formation, association, opportunité, accompagnement, services sociaux, entrepreneuriat, initiative communautaire. Chacune a sa page.', go: ['/explorer', 'Explorer les catégories'], hl: '/explorer' },
    { t: 'Des fiches vérifiées', p: 'Une organisation n’apparaît qu’après vérification. Son statut est toujours visible : Vérifiée, À renouveler, Signalée… Une erreur ? Le bouton « Signaler » est sur chaque fiche.', go: ['/organisations', 'Voir les organisations'], hl: '/organisations' },
    { t: 'Un besoin, en privé', p: 'Vous ne trouvez pas ? Décrivez votre besoin en quelques mots. Il reste privé : seules les personnes habilitées le lisent pour vous orienter. Un compte est nécessaire.', go: ['/besoin', 'Déposer un besoin'] },
    { t: 'La visite guidée', p: 'Un film de 36 secondes et un simulateur pour comprendre, sans compte et sans rien enregistrer.', go: ['/visite', 'Lancer la visite'], hl: '/visite' },
    { t: 'Rejoindre le pilote', p: 'La phase pilote se fait sur code d’invitation. Une organisation peut aussi soumettre sa fiche, relue avant publication.', go: ['/inscription', 'Créer un compte'] },
    { t: 'Aide et mode allégé', p: 'Le bouton ⚡ coupe les animations si votre appareil ou votre connexion est lent. Le bouton « ? » rouvre ce guide à tout moment.' }
  ];

  function clearHl() { if (hl) { hl.classList.remove('tuto-hl'); hl = null; } }
  function seen() { try { g.localStorage.setItem(KEY, '1'); } catch (e) {} }
  function removePrompt() { if (prompt) { prompt.remove(); prompt = null; } }

  function build() {
    card = doc.createElement('div'); card.className = 'tuto'; card.hidden = true;
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-labelledby', 'tuto-t');
    card.innerHTML = '<button class="tuto-x" type="button" aria-label="Fermer le guide">×</button><span class="tuto-icon" id="tuto-icon"></span>' +
      '<p class="eyebrow" id="tuto-count"></p><h2 id="tuto-t"></h2><p id="tuto-p"></p><a class="text-link" id="tuto-go" href="#" data-link hidden></a>' +
      '<div class="tuto-dots" id="tuto-dots"></div><div class="tuto-nav"><button class="button button-outline" type="button" id="tuto-prev">Précédent</button><button class="button" type="button" id="tuto-next">Suivant</button></div>';
    doc.body.appendChild(card);
    card.querySelector('.tuto-x').addEventListener('click', close);
    card.querySelector('#tuto-prev').addEventListener('click', function () { step(i - 1); });
    card.querySelector('#tuto-next').addEventListener('click', function () { i >= STEPS.length - 1 ? close() : step(i + 1); });
    card.querySelector('#tuto-go').addEventListener('click', function () { if (g.innerWidth < 700) close(); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && card && !card.hidden) close(); });
  }
  function step(n) {
    i = Math.max(0, Math.min(STEPS.length - 1, n)); var s = STEPS[i], q = function (id) { return card.querySelector(id); };
    q('#tuto-icon').textContent = s.icon || (i + 1);
    q('#tuto-count').textContent = 'GUIDE · ' + (i + 1) + ' / ' + STEPS.length;
    q('#tuto-t').textContent = s.t; q('#tuto-p').textContent = s.p;
    var go = q('#tuto-go'); if (s.go) { go.hidden = false; go.setAttribute('href', s.go[0]); go.textContent = s.go[1] + ' →'; } else go.hidden = true;
    var d = q('#tuto-dots'); d.textContent = ''; STEPS.forEach(function (_, k) { var e = doc.createElement('i'); if (k === i) e.className = 'is-on'; d.appendChild(e); });
    q('#tuto-prev').disabled = i === 0; q('#tuto-next').textContent = i === STEPS.length - 1 ? 'Terminer' : 'Suivant';
    clearHl(); if (s.hl) { var t = doc.querySelector('.desktop-nav a[href="' + s.hl + '"]'); if (t && t.offsetParent) { t.classList.add('tuto-hl'); hl = t; } }
  }
  function open(n) { if (!card) build(); removePrompt(); card.hidden = false; step(n || 0); card.querySelector('#tuto-next').focus({ preventScroll: true }); }
  function close() { if (card) card.hidden = true; clearHl(); seen(); }

  function invite() {
    if (prompt || (card && !card.hidden)) return;
    prompt = doc.createElement('div'); prompt.className = 'tuto-invite';
    prompt.innerHTML = '<p><strong>Première visite ?</strong> Je vous fais faire le tour du site en 30 secondes.</p><div><button class="button button-small" type="button" data-yes>Faire le tour</button><button class="button button-small button-outline" type="button" data-no>Non merci</button></div>';
    doc.body.appendChild(prompt);
    prompt.querySelector('[data-yes]').addEventListener('click', function () { open(0); });
    prompt.querySelector('[data-no]').addEventListener('click', function () { removePrompt(); seen(); });
  }
  /* on attend que l'ouverture animée soit terminée avant d'inviter */
  function waitReady(done) {
    var n = 0, t = setInterval(function () {
      var lp = doc.getElementById('lp'), busy = lp && !lp.classList.contains('done');
      if (!busy || ++n > 40) { clearInterval(t); setTimeout(done, 1500); }
    }, 500);
  }

  function weak() { var n = g.navigator, c = n.connection || {}; return (n.deviceMemory && n.deviceMemory <= 2) || (n.hardwareConcurrency && n.hardwareConcurrency <= 2) || c.saveData === true || /(^|-)2g$|3g/.test(c.effectiveType || ''); }

  function init() {
    var done = null, lt = null; try { done = g.localStorage.getItem(KEY); lt = g.localStorage.getItem('nevLite'); } catch (e) {}
    var tour = function () { if (!done) invite(); };
    if (lt === null && weak()) {
      waitReady(function () {
        var p = doc.createElement('div'); p.className = 'tuto-invite';
        p.innerHTML = '<p><strong>Appareil un peu lent ?</strong> Le mode allégé coupe les animations pour que le site reste fluide.</p><div><button class="button button-small" type="button" data-y>Activer</button><button class="button button-small button-outline" type="button" data-n>Non merci</button></div>';
        doc.body.appendChild(p);
        p.querySelector('[data-y]').addEventListener('click', function () { g.NEXUSLITE.set(true); p.remove(); tour(); });
        p.querySelector('[data-n]').addEventListener('click', function () { try { g.localStorage.setItem('nevLite', '0'); } catch (e) {} p.remove(); tour(); });
      });
    } else if (!done) waitReady(invite);
    if (new URLSearchParams(g.location.search).get('guide') === '1') open(0);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
  g.NEXUSGUIDE = { open: open };
})(window);
