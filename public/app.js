const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
const mobileNav = document.getElementById("mobileNav");
function toast(message){toastEl.textContent=message;toastEl.classList.add("show");setTimeout(()=>toastEl.classList.remove("show"),3200)}

/* ===== LIFE DIGITAL V3 — connecté à l'API ===== */
const VS = {pending:"En attente de vérification",verified:"Informations vérifiées",renewal_due:"Vérification à renouveler",flagged:"Information signalée",suspended:"Fiche suspendue"};
const ST = {pending_review:"En attente de relecture",published:"Publié",rejected:"Refusé",archived:"Archivé",draft:"Brouillon",received:"Reçu",reviewing:"En cours d’examen",referred:"Orienté",closed:"Clôturé",open:"Ouvert",under_review:"En cours",resolved:"Résolu",dismissed:"Rejeté"};
const ROLES = {member:"Membre",organization:"Organisation",moderator:"Modérateur",administrator:"Administrateur"};
const RANK = {member:0,organization:1,moderator:2,administrator:3};
let me = null, cfg = {registrationMode:"closed",notice:""}, categories = [], activeFilter = "Tout", renderToken = 0;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDate = d => d ? new Date(d).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}) : "";
const q = id => document.getElementById(id);
async function api(method, url, body) {
  const r = await fetch(url, {method, credentials:"same-origin", headers:{"content-type":"application/json","x-requested-with":"nevnexus"}, body: body === undefined ? undefined : JSON.stringify(body)});
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(j?.error || "Une erreur est survenue. Réessayez."); e.status = r.status; e.code = j?.code; throw e; }
  return j;
}
const get = u => api("GET", u), post = (u, b) => api("POST", u, b ?? {}), patch = (u, b) => api("PATCH", u, b ?? {}), del = (u, b) => api("DELETE", u, b);
const badge = (s) => `<span class="badge b-${esc(s)}">${esc(VS[s] || ST[s] || s)}</span>`;
const catOptions = (sel = "") => `<option value="">Sélectionner une catégorie</option>` + categories.map(c => `<option ${c.name === sel ? "selected" : ""}>${esc(c.name)}</option>`).join("");
const formError = (id, e) => { const el = q(id); if (el) { el.textContent = e.message; el.hidden = false; } };

function topActions() {
  const box = q("topActions"), mob = q("mobileAuth");
  if (me) {
    box.innerHTML = `<a class="login-link" href="/compte" data-link>${esc(me.displayName)}</a><button class="button button-small button-outline" id="logoutBtn" type="button">Déconnexion</button><button class="menu-toggle" id="menuToggle" aria-label="Ouvrir le menu">☰</button>`;
    mob.innerHTML = `<a href="/compte" data-link>Mon espace</a>` + (RANK[me.role] >= 2 ? `<a href="/admin" data-link>Modération</a>` : "");
  } else {
    box.innerHTML = `<a class="login-link" href="/connexion" data-link>Connexion</a><a class="button button-small" href="/inscription" data-link>Rejoindre <span>↗</span></a><button class="menu-toggle" id="menuToggle" aria-label="Ouvrir le menu">☰</button>`;
    mob.innerHTML = `<a href="/connexion" data-link>Connexion</a><a href="/inscription" data-link>Rejoindre</a>`;
  }
  q("menuToggle").addEventListener("click", () => mobileNav.classList.toggle("open"));
}

function pageHero(kicker, title, desc) { return `<section class="page-hero"><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(desc)}</p></section>`; }
const needLogin = (what) => `${pageHero("ESPACE PERSONNEL", "Connexion requise.", what)}<section class="content-wrap"><div class="form-card"><a class="button" href="/connexion" data-link>Se connecter ↗</a> <a class="button button-outline" href="/inscription" data-link>Créer un compte</a></div></section>`;

/* ----- cartes publiques ----- */
function resultCard(x, kind) {
  const org = x.organization ? `<div class="result-meta">${x.organization_id ? `<a class="text-link" href="/organisation?id=${esc(x.organization_id)}" data-link>${esc(x.organization)}</a>` : esc(x.organization)} ${badge(x.verification_status)}</div>` : "";
  const place = x.locality ? `<div class="result-meta">⌖ ${esc(x.locality)}${x.deadline ? ` · Jusqu’au ${esc(fmtDate(x.deadline))}` : ""}</div>` : (x.deadline ? `<div class="result-meta">Jusqu’au ${esc(fmtDate(x.deadline))}</div>` : "");
  return `<article class="result-card"><span class="tag">${esc(x.category || x.topic || "Ressource")}</span><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p>${place}${org}<div class="card-actions">${x.url ? `<a class="text-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Ouvrir la ressource ↗</a>` : ""}<button class="link-btn" data-report="${kind}:${esc(x.id)}" type="button">Signaler une erreur</button></div></article>`;
}
function listPage(kicker, title, desc, kind, withFilters = true) {
  return async () => `${pageHero(kicker, title, desc)}<section class="content-wrap"><div class="search-panel"><input id="listSearch" type="search" placeholder="Rechercher…" aria-label="Rechercher" maxlength="80"><button class="button button-small" id="searchButton" type="button">Rechercher</button></div>${withFilters ? `<div class="filter-row">${["Tout", ...categories.map(c => c.name)].map(x => `<button class="filter ${activeFilter === x ? "active" : ""}" data-filter="${esc(x)}" type="button">${esc(x)}</button>`).join("")}</div>` : ""}<div id="listResults" class="result-grid" aria-live="polite"></div><p class="result-meta">Seules les fiches dont les informations ont été vérifiées sont affichées. Une erreur ? Utilisez « Signaler ».</p></section>`;
}
async function loadList(kind) {
  const holder = q("listResults"); if (!holder) return;
  const params = new URLSearchParams(); const s = q("listSearch")?.value.trim();
  if (s) params.set("q", s); if (activeFilter !== "Tout" && kind !== "learn") params.set("category", activeFilter);
  holder.innerHTML = `<div class="empty">Chargement…</div>`;
  try {
    const rows = await get(`/api/${kind === "organization" ? "organizations" : kind === "resource" ? "resources" : kind === "opportunity" ? "opportunities" : "learn"}?${params}`);
    holder.innerHTML = rows.length ? rows.map(x => kind === "organization" ? orgCard(x) : resultCard(x, kind === "learn" ? "learning_item" : kind)).join("") : `<div class="empty">Aucun contenu publié ne correspond à cette recherche pour le moment. Le répertoire s’enrichit au fil des vérifications.</div>`;
  } catch (e) { holder.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
const orgCard = o => `<article class="result-card"><span class="tag">${esc(o.category || "Organisation")}</span><h3>${esc(o.name)}</h3><p>${esc(o.description)}</p>${o.locality ? `<div class="result-meta">⌖ ${esc(o.locality)}</div>` : ""}<div class="result-meta">${badge(o.verification_status)}</div><div class="card-actions"><a class="text-link" href="/organisation?id=${esc(o.id)}" data-link>Voir la fiche ↗</a></div></article>`;

async function organizationPage() {
  const id = new URLSearchParams(location.search).get("id");
  try {
    const o = await get(`/api/organizations/${encodeURIComponent(id || "")}`);
    const row = (k, v) => v ? `<div class="kv"><dt>${k}</dt><dd>${esc(v)}</dd></div>` : "";
    return `${pageHero("ORGANISATION", o.name, o.category || "Fiche d’organisation")}<section class="content-wrap"><div class="info-card wide"><p>${esc(o.description)}</p><dl>${row("Services proposés", o.services)}${row("Public concerné", o.target_audience)}${row("Zone d’intervention", o.intervention_zone)}${row("Conditions d’accès", o.access_conditions)}${row("E-mail public", o.public_email)}${row("Téléphone public", o.public_phone)}${row("Localité", o.locality)}</dl><p>${badge(o.verification_status)} <span class="result-meta">Dernière vérification : ${esc(fmtDate(o.last_verified_at) || "—")}</span></p><div class="card-actions"><button class="link-btn" data-report="organization:${esc(o.id)}" type="button">Signaler une information incorrecte</button><a class="text-link" href="/organisations" data-link>← Toutes les organisations</a></div></div></section>`;
  } catch { return `<section class="not-found"><h1>Fiche introuvable.</h1><p class="hero-copy">Cette fiche n’existe pas ou n’est pas publiée.</p><a class="button" href="/organisations" data-link>Voir les organisations</a></section>`; }
}

/* ----- besoin (HELP) ----- */
async function needPage() {
  if (!me) return needLogin("Pour déposer une demande d’orientation, créez un compte ou connectez-vous. Votre demande reste privée.");
  return `${pageHero("HELP", "Faire connaître un besoin.", "Décrivez votre recherche en quelques mots. Une personne habilitée de l’équipe pourra vous orienter.")}<section class="content-wrap"><form class="form-card" id="needForm"><div class="field"><label for="needCat">Nature du besoin</label><select id="needCat">${catOptions(new URLSearchParams(location.search).get("c") || "")}</select></div><div class="field"><label for="needSummary">Résumé (en une phrase)</label><input id="needSummary" required minlength="3" maxlength="120"></div><div class="field"><label for="needText">Votre besoin</label><textarea id="needText" minlength="8" maxlength="2000" required placeholder="Expliquez ce que vous recherchez…"></textarea></div><div class="field"><label for="needLoc">Localité (facultatif)</label><input id="needLoc" maxlength="80"></div><div class="notice">Votre demande est privée : seules les personnes habilitées de l’équipe peuvent la lire pour vous orienter. Elle est conservée 12 mois au maximum et vous pouvez la supprimer à tout moment depuis votre espace. N’indiquez ni mot de passe, ni données de santé, ni numéro d’identité.</div><p class="form-error" id="needErr" role="alert" hidden></p><div style="margin-top:20px"><button class="button" type="submit">Envoyer ma demande ↗</button></div></form></section>`;
}

/* ----- comptes ----- */
async function registerPage() {
  if (me) return `<section class="not-found"><h1>Vous êtes déjà connecté.</h1><a class="button" href="/compte" data-link>Mon espace</a></section>`;
  if (cfg.registrationMode === "closed") return `${pageHero("REJOINDRE neV.NEXUS", "Inscriptions fermées.", "La plateforme est en phase pilote. Les inscriptions ne sont pas ouvertes pour le moment.")}<section class="content-wrap"><div class="notice">Ouverture progressive prévue après validation juridique, sécurité et supervision du pilote.</div></section>`;
  const invite = cfg.registrationMode === "invite";
  return `${pageHero("REJOINDRE neV.NEXUS", "Créer un compte.", invite ? "Phase pilote : l’inscription se fait sur invitation, avec un code fourni par l’équipe." : "Créez votre espace personnel.")}<section class="content-wrap"><form class="form-card" id="registerForm"><div class="field"><label for="rName">Nom affiché</label><input id="rName" required minlength="2" maxlength="60" autocomplete="nickname"></div><div class="field"><label for="rEmail">Adresse électronique</label><input id="rEmail" type="email" required maxlength="254" autocomplete="email"></div><div class="field"><label for="rPass">Mot de passe (10 caractères minimum)</label><input id="rPass" type="password" required minlength="10" maxlength="128" autocomplete="new-password"></div><div class="field"><label for="rType">Type de compte</label><select id="rType"><option value="member">Personne (membre)</option><option value="organization">Organisation ou association</option></select></div>${invite ? `<div class="field"><label for="rInvite">Code d’invitation</label><input id="rInvite" required maxlength="100" autocomplete="off"></div>` : ""}<label class="check"><input type="checkbox" id="rTerms" required> J’ai lu la <a href="/confidentialite" data-link>politique de confidentialité</a> et j’accepte que mes données soient traitées pour faire fonctionner mon compte.</label><p class="form-error" id="rErr" role="alert" hidden></p><div style="margin-top:20px"><button class="button" type="submit">Créer mon compte ↗</button></div></form></section>`;
}
async function loginPage() {
  if (me) return `<section class="not-found"><h1>Vous êtes déjà connecté.</h1><a class="button" href="/compte" data-link>Mon espace</a></section>`;
  return `${pageHero("ESPACE PERSONNEL", "Se connecter.", "Accédez à vos demandes et à votre espace.")}<section class="content-wrap"><form class="form-card" id="loginForm"><div class="field"><label for="lEmail">Adresse électronique</label><input id="lEmail" type="email" required autocomplete="email"></div><div class="field"><label for="lPass">Mot de passe</label><input id="lPass" type="password" required autocomplete="current-password"></div><p class="form-error" id="lErr" role="alert" hidden></p><div style="margin-top:20px"><button class="button" type="submit">Se connecter ↗</button></div></form></section>`;
}

async function accountPage() {
  if (!me) return needLogin("Connectez-vous pour accéder à votre espace.");
  const needs = await get("/api/me/needs");
  let html = `${pageHero("MON ESPACE", `Bonjour, ${me.displayName}.`, `${ROLES[me.role]} · ${me.email}`)}<section class="content-wrap">`;
  if (RANK[me.role] >= 2) html += `<div class="notice" style="margin-bottom:20px">Vous avez accès à la <a class="text-link" href="/admin" data-link>console de modération</a>.</div>`;
  html += `<h2 class="sec">Mes demandes</h2>` + (needs.length ? `<div class="result-grid">${needs.map(n => `<article class="result-card"><span class="tag">${esc(n.category || "Besoin")}</span><h3>${esc(n.summary)}</h3><p>${esc(n.description)}</p><div class="result-meta">${badge(n.status)} · ${esc(fmtDate(n.created_at))}</div><div class="card-actions"><button class="link-btn" data-del-need="${esc(n.id)}" type="button">Supprimer</button></div></article>`).join("")}</div>` : `<div class="empty">Aucune demande. <a class="text-link" href="/besoin" data-link>Faire connaître un besoin ↗</a></div>`);
  if (RANK[me.role] >= 1) {
    const [orgs, content] = await Promise.all([get("/api/me/organizations"), get("/api/me/content")]);
    html += `<h2 class="sec">Mes organisations</h2>` + (orgs.length ? `<div class="result-grid">${orgs.map(o => `<article class="result-card"><span class="tag">${esc(o.category || "Organisation")}</span><h3>${esc(o.name)}</h3><p>${esc(o.description)}</p><div class="result-meta">${badge(o.verification_status)}</div>${o.moderation_note ? `<div class="result-meta">Note de l’équipe : ${esc(o.moderation_note)}</div>` : ""}</article>`).join("")}</div>` : `<div class="empty">Aucune organisation soumise.</div>`);
    html += `<details class="panel"><summary>Soumettre une organisation</summary><form class="form-card" id="orgForm"><div class="field"><label>Nom officiel</label><input id="oName" required minlength="2" maxlength="120"></div><div class="field"><label>Catégorie</label><select id="oCat">${catOptions()}</select></div><div class="field"><label>Présentation</label><textarea id="oDesc" required minlength="10" maxlength="2000"></textarea></div><div class="field"><label>Services proposés</label><textarea id="oServ" maxlength="2000"></textarea></div><div class="field"><label>Public concerné</label><input id="oAud" maxlength="500"></div><div class="field"><label>Zone d’intervention</label><input id="oZone" maxlength="300"></div><div class="field"><label>Localité</label><input id="oLoc" maxlength="80"></div><div class="field"><label>E-mail public (facultatif)</label><input id="oMail" type="email" maxlength="254"></div><div class="field"><label>Téléphone public (facultatif)</label><input id="oTel" maxlength="40"></div><div class="field"><label>Conditions d’accès</label><textarea id="oAcc" maxlength="1000"></textarea></div><div class="notice">La fiche sera examinée par l’équipe avant toute publication. Elle n’est jamais déclarée « vérifiée » automatiquement.</div><p class="form-error" id="oErr" role="alert" hidden></p><button class="button" type="submit" style="margin-top:16px">Soumettre pour vérification ↗</button></form></details>`;
    const active = orgs.filter(o => o.verification_status !== "suspended");
    if (active.length) html += `<details class="panel"><summary>Proposer une ressource ou une opportunité</summary><form class="form-card" id="contentForm"><div class="field"><label>Organisation</label><select id="cOrg">${active.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("")}</select></div><div class="field"><label>Type</label><select id="cKind"><option value="resources">Ressource</option><option value="opportunities">Opportunité</option></select></div><div class="field"><label>Titre</label><input id="cTitle" required minlength="3" maxlength="140"></div><div class="field"><label>Description</label><textarea id="cDesc" required minlength="10" maxlength="2000"></textarea></div><div class="field"><label>Catégorie</label><select id="cCat">${catOptions()}</select></div><div class="field"><label>Localité</label><input id="cLoc" maxlength="80"></div><div class="field"><label>Date limite (opportunité, facultatif)</label><input id="cDate" type="date"></div><p class="form-error" id="cErr" role="alert" hidden></p><button class="button" type="submit" style="margin-top:16px">Envoyer pour relecture ↗</button></form></details>`;
    const items = [...content.resources.map(x => ({...x, t: "Ressource"})), ...content.opportunities.map(x => ({...x, t: "Opportunité"}))];
    if (items.length) html += `<h2 class="sec">Mes contenus</h2><div class="list">${items.map(x => `<div class="row"><span>${esc(x.t)} — ${esc(x.title)} <em>(${esc(x.organization)})</em></span>${badge(x.status)}</div>`).join("")}</div>`;
  }
  html += `<h2 class="sec">Mon compte</h2><div class="two-col"><form class="info-card" id="pwForm"><h3>Changer de mot de passe</h3><div class="field"><label>Mot de passe actuel</label><input id="pwOld" type="password" required autocomplete="current-password"></div><div class="field"><label>Nouveau mot de passe (10 caractères minimum)</label><input id="pwNew" type="password" required minlength="10" autocomplete="new-password"></div><p class="form-error" id="pwErr" role="alert" hidden></p><button class="button button-small" type="submit">Modifier</button></form><form class="info-card" id="delForm"><h3>Supprimer mon compte</h3><p>Votre compte, vos sessions et vos demandes sont définitivement supprimés.</p><div class="field"><label>Mot de passe</label><input id="delPw" type="password" required autocomplete="current-password"></div><p class="form-error" id="delErr" role="alert" hidden></p><button class="button button-small button-outline" type="submit">Supprimer définitivement</button></form></div></section>`;
  return html;
}

/* ----- console de modération ----- */
async function adminPage() {
  if (!me) return needLogin("Cette console est réservée à l’équipe de modération.");
  if (RANK[me.role] < 2) return `<section class="not-found"><h1>Accès refusé.</h1><a class="button" href="/" data-link>Accueil</a></section>`;
  const Q = await get("/api/admin/queue");
  const btn = (act, label) => `<button class="link-btn" data-act="${act}" type="button">${label}</button>`;
  const sec = (t, rows) => `<h2 class="sec">${t} (${rows.length})</h2>` + (rows.length ? `<div class="list">${rows.join("")}</div>` : `<div class="empty">Rien à traiter.</div>`);
  let h = `${pageHero("MODÉRATION", "Console de modération.", "Chaque action est enregistrée dans le journal d’audit.")}<section class="content-wrap"><div id="adminMsg" class="notice" hidden></div>`;
  h += sec("Organisations à examiner", Q.organizations.map(o => `<div class="row col"><div><strong>${esc(o.name)}</strong> ${badge(o.verification_status)}<br><small>${esc(o.owner_email || "")}</small><p>${esc(o.description)}</p>${o.services ? `<p><em>Services :</em> ${esc(o.services)}</p>` : ""}</div><div class="acts">${btn(`org:${o.id}:verified`, "Marquer vérifiée")}${btn(`org:${o.id}:pending`, "Remettre en attente")}${btn(`org:${o.id}:flagged`, "Signaler")}${btn(`org:${o.id}:suspended`, "Suspendre")}</div></div>`));
  const pub = (kind) => x => `<div class="row col"><div><strong>${esc(x.title)}</strong> <em>(${esc(x.organization)})</em> ${badge(x.verification_status)}<p>${esc(x.description)}</p></div><div class="acts">${btn(`${kind}:${x.id}:published`, "Publier")}${btn(`${kind}:${x.id}:rejected`, "Refuser")}</div></div>`;
  h += sec("Ressources à relire", Q.resources.map(pub("resources")));
  h += sec("Opportunités à relire", Q.opportunities.map(pub("opportunities")));
  h += sec("Signalements", Q.reports.map(r => `<div class="row col"><div>${esc(r.target_type)} <small>${esc(r.target_id)}</small><p>${esc(r.reason)}</p></div><div class="acts">${btn(`report:${r.id}:under_review`, "En cours")}${btn(`report:${r.id}:resolved`, "Résolu")}${btn(`report:${r.id}:dismissed`, "Rejeter")}</div></div>`));
  h += sec("Demandes (besoins) à orienter", Q.needs.map(n => `<div class="row col"><div><strong>${esc(n.summary)}</strong> ${badge(n.status)} <small>${esc(n.category || "")}</small></div><div class="acts">${btn(`needview:${n.id}`, "Lire")}${btn(`need:${n.id}:reviewing`, "En cours")}${btn(`need:${n.id}:referred`, "Orientée")}${btn(`need:${n.id}:closed`, "Clôturer")}</div></div>`));
  h += `<details class="panel"><summary>Publier un contenu LEARN</summary><form class="form-card" id="learnForm"><div class="field"><label>Titre</label><input id="lnTitle" required minlength="3" maxlength="140"></div><div class="field"><label>Description</label><textarea id="lnDesc" required minlength="10" maxlength="2000"></textarea></div><div class="field"><label>Thème</label><input id="lnTopic" maxlength="60" value="Compétences numériques"></div><div class="field"><label>Niveau</label><select id="lnLevel"><option>débutant</option><option>intermédiaire</option><option>avancé</option></select></div><div class="field"><label>Lien (http/https, facultatif)</label><input id="lnUrl" type="url" maxlength="500"></div><p class="form-error" id="lnErr" role="alert" hidden></p><button class="button" type="submit" style="margin-top:16px">Publier ↗</button></form></details>`;
  if (me.role === "administrator") {
    const users = await get("/api/admin/users");
    h += `<h2 class="sec">Utilisateurs</h2><div class="list">${users.map(u => `<div class="row"><span>${esc(u.display_name)} — ${esc(u.email)} ${u.is_active ? "" : "<em>(désactivé)</em>"}</span><span class="acts">${u.id === me.id ? "<small>vous</small>" : `<select data-role="${esc(u.id)}" aria-label="Rôle">${Object.keys(ROLES).map(r => `<option value="${r}" ${r === u.role ? "selected" : ""}>${ROLES[r]}</option>`).join("")}</select>${btn(`user:${u.id}:${u.is_active ? "off" : "on"}`, u.is_active ? "Désactiver" : "Réactiver")}`}</span></div>`).join("")}</div>`;
  }
  return h + `</section>`;
}

/* ----- pages statiques ----- */
const home = async () => NEXUSLANDING.html(me);

const CAT = {
  "orientation": {h:205, d:"Trouver son chemin : repères, conseils et personnes pour s’orienter.", i:'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'},
  "formation": {h:222, d:"Se former, apprendre un métier, développer de nouvelles compétences.", i:'<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.3 2.7 3 6 3s6-1.7 6-3v-4.5"/>'},
  "association": {h:190, d:"Rejoindre des associations et des collectifs près de chez vous.", i:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 14c2.8 0 5 1.7 5 4.5"/>'},
  "opportunite": {h:262, d:"Bourses, stages, emplois, appels à candidatures et occasions à saisir.", i:'<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/>'},
  "accompagnement": {h:175, d:"Être accompagné, conseillé et soutenu dans ses démarches.", i:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'},
  "services-sociaux": {h:240, d:"Accéder aux services sociaux, à la santé et aux aides disponibles.", i:'<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="m9 12 2 2 4-4"/>'},
  "entrepreneuriat": {h:215, d:"Lancer et développer un projet : conseils, financements, réseaux.", i:'<path d="M5 19c0-4 2-7 5-9l4-4c3-1 5-1 6-1 0 1 0 3-1 6l-4 4c-2 3-5 5-9 5z"/><circle cx="15" cy="9" r="1.4"/>'},
  "initiative-communautaire": {h:198, d:"Participer à des projets utiles à la communauté, ou en lancer un.", i:'<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M12 7.2v4.3M12 11.5l-6 4.5M12 11.5l6 4.5"/>'}
};
window.NEXUSCATHUE = Object.fromEntries(Object.entries(CAT).map(([k, v]) => [k, v.h]));
const catMeta = c => CAT[c.slug] || {h:210, d:"", i:'<circle cx="12" cy="12" r="8"/>'};
const catIcon = c => `<span class="cat-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${catMeta(c).i}</svg></span>`;
const plural = (n, s, p) => `${n} ${n > 1 ? p : s}`;
const catCounts = c => { const parts = []; if (c.resources) parts.push(plural(c.resources, "ressource", "ressources")); if (c.opportunities) parts.push(plural(c.opportunities, "opportunité", "opportunités")); if (c.organizations) parts.push(plural(c.organizations, "organisation", "organisations")); return parts; };

async function explorerPage() {
  try { categories = await get("/api/categories"); } catch {}
  const cards = categories.map((c, i) => { const m = catMeta(c), n = catCounts(c);
    return `<a class="cat-card" href="/categorie?c=${esc(c.slug)}" data-link style="--h:${m.h};--i:${i}">${catIcon(c)}<span class="cat-go" aria-hidden="true">↗</span><h3>${esc(c.name)}</h3><p>${esc(m.d)}</p><div class="cat-count">${n.length ? esc(n.join(" · ")) : "Premiers contenus bientôt"}</div></a>`; }).join("");
  return `<section class="ex-hero"><div class="eyebrow">EXPLORER</div><h1>Que cherchez-vous&nbsp;?</h1><p>Choisissez une catégorie pour découvrir les ressources, les opportunités et les organisations vérifiées qui s’y rattachent.</p><form class="ex-search" id="exSearch" role="search"><input type="search" name="q" placeholder="Rechercher une ressource, un mot-clé…" aria-label="Rechercher" maxlength="80"><button class="button button-small" type="submit">Rechercher</button></form></section><section class="content-wrap" style="padding-top:10px"><div class="cat-grid">${cards}</div><div class="ex-band"><div><b>Vous ne trouvez pas ce qu’il vous faut ?</b><span>Décrivez votre besoin : il reste privé et la modération vous oriente.</span></div><a class="button" href="/besoin" data-link>Déposer un besoin ↗</a></div></section>`;
}
async function categoryPage() {
  const slug = new URLSearchParams(location.search).get("c");
  try { categories = await get("/api/categories"); } catch {}
  const c = categories.find(x => x.slug === slug);
  if (!c) return `<section class="not-found"><h1>Catégorie introuvable.</h1><a class="button" href="/explorer" data-link>Toutes les catégories</a></section>`;
  const m = catMeta(c), n = catCounts(c), qs = new URLSearchParams({category: c.name, limit: 12});
  const [res, opp, org] = await Promise.all([get(`/api/resources?${qs}`).catch(() => []), get(`/api/opportunities?${qs}`).catch(() => []), get(`/api/organizations?${qs}`).catch(() => [])]);
  const sec = (title, rows, fn, empty) => `<div class="cp-sec"><h2>${title}<small>${rows.length ? plural(rows.length, "fiche", "fiches") : ""}</small></h2>${rows.length ? `<div class="result-grid">${rows.map(fn).join("")}</div>` : `<div class="empty">${empty}</div>`}</div>`;
  const chips = categories.filter(x => x.slug !== slug).map(x => `<a href="/categorie?c=${esc(x.slug)}" data-link style="--h:${catMeta(x).h}">${esc(x.name)}</a>`).join("");
  return `<section class="cp-hero" style="--h:${m.h}"><a class="cp-back" href="/explorer" data-link>← Toutes les catégories</a><div class="cp-head">${catIcon(c)}<div><h1>${esc(c.name)}</h1><p>${esc(m.d)}</p></div></div><div class="cp-stats"><span>${esc(n.length ? n.join(" · ") : "Premiers contenus bientôt")}</span></div></section><section class="content-wrap" style="padding-top:0">${sec("Ressources", res, x => resultCard(x, "resource"), "Aucune ressource publiée dans cette catégorie pour le moment.")}${sec("Opportunités", opp, x => resultCard(x, "opportunity"), "Aucune opportunité ouverte dans cette catégorie pour le moment.")}${sec("Organisations", org, orgCard, "Aucune organisation vérifiée dans cette catégorie pour le moment.")}<div class="ex-band"><div><b>Une ressource ou une organisation à proposer&nbsp;?</b><span>Les fiches sont relues avant publication.</span></div><div><a class="button" href="/besoin?c=${encodeURIComponent(c.name)}" data-link>Déposer un besoin</a> <a class="button button-outline" href="/inscription" data-link>Rejoindre ↗</a></div></div><div class="cat-chips">${chips}</div></section>`;
}
const about = async () => `${pageHero("À PROPOS", "Connecter les personnes. Créer des possibilités.", "neV.NEXUS est un projet conçu pour rapprocher les personnes, les organisations, les ressources et les opportunités.")}<section class="content-wrap"><div class="two-col"><article class="info-card"><span class="tag">Notre raison d’être</span><h3>Faciliter les connexions utiles</h3><p>Rendre les ressources plus accessibles, soutenir les initiatives et favoriser la coopération.</p></article><article class="info-card"><span class="tag">Nos piliers</span><h3>Vivre · Progresser · Contribuer</h3><p>Trois orientations complémentaires qui structurent la vision de neV.NEXUS.</p></article></div></section>`;
const generic = (title, kicker, desc) => async () => `${pageHero(kicker, title, desc)}<section class="content-wrap"><div class="notice">Cet espace est prévu dans la vision de neV.NEXUS. Son contenu et ses fonctionnalités seront activés progressivement, après validation et développement.</div></section>`;
const privacy = async () => `${pageHero("CONFIDENTIALITÉ", "La confiance commence par la transparence.", "Voici, simplement, ce que fait cette version pilote avec vos données.")}<section class="content-wrap"><div class="notice" style="margin-bottom:22px">Version pilote : ce texte décrit le fonctionnement actuel du service. Il sera complété et validé juridiquement (Code du numérique béninois, APDP) avant toute ouverture publique.</div><div class="two-col"><article class="info-card"><h3>Données collectées</h3><p>Adresse électronique, nom affiché et mot de passe (conservé uniquement sous forme chiffrée irréversible). Pour un besoin déposé : son texte et la localité facultative. Pour une organisation : les informations de sa fiche. Aucune autre donnée personnelle n’est demandée.</p></article><article class="info-card"><h3>Finalités</h3><p>Faire fonctionner votre compte, vous orienter vers des ressources, modérer les contenus et assurer la sécurité du service. Rien n’est vendu ni utilisé à des fins publicitaires.</p></article><article class="info-card"><h3>Qui peut voir quoi</h3><p>Vos demandes sont privées : seules les personnes habilitées de l’équipe de modération peuvent les lire, et chaque consultation est journalisée. Les coordonnées d’une organisation ne sont publiques que si elle les a indiquées comme telles.</p></article><article class="info-card"><h3>Durée et suppression</h3><p>Les demandes sont supprimées automatiquement après 12 mois. Vous pouvez supprimer une demande ou votre compte complet à tout moment depuis « Mon espace ».</p></article></div></section>`;

const routes = {
  "/": home,
  "/explorer": explorerPage,
  "/categorie": categoryPage,
  "/visite": async () => { try { categories = await get("/api/categories"); } catch {} return NEXUSVISITE.html(categories, me); },
  "/rechercher": listPage("SEARCH", "Résultats de recherche", "Ressources proposées par des organisations vérifiées.", "resource"),
  "/ressources": listPage("RESOURCES", "Ressources utiles", "Retrouvez des ressources classées pour faciliter vos recherches.", "resource"),
  "/besoin": needPage,
  "/opportunites": listPage("OPPORTUNITIES", "Des possibilités à découvrir.", "Occasions de se former, de contribuer et de développer des initiatives.", "opportunity"),
  "/apprendre": listPage("LEARN", "Apprendre, comprendre, progresser.", "Ressources pédagogiques pour développer ses compétences.", "learn", false),
  "/organisations": listPage("COMMUNITY", "Les organisations au cœur du réseau.", "Associations, structures et initiatives dont les informations ont été vérifiées.", "organization"),
  "/organisation": organizationPage,
  "/projets": generic("Les initiatives en mouvement.", "PROJECTS", "Un espace destiné à faire connaître les projets et encourager les contributions."),
  "/assistance": generic("Comment pouvons-nous vous orienter ?", "ASSIST", "Retrouvez des repères pour comprendre les espaces et le fonctionnement de neV.NEXUS."),
  "/inscription": registerPage, "/connexion": loginPage, "/compte": accountPage, "/admin": adminPage,
  "/a-propos": about, "/confidentialite": privacy,
  "/contact": generic("Entrer en contact.", "CONTACT", "Les canaux de contact officiels seront publiés après leur mise en place."),
  "/inscription-organisation": async () => registerPage(),
};
const listKind = {"/rechercher":"resource","/ressources":"resource","/opportunites":"opportunity","/apprendre":"learn","/organisations":"organization"};
function currentPath() { return location.pathname.replace(/\/+$/, "") || "/"; }
const full = () => currentPath() + location.search;

async function render(path = currentPath()) {
  const tok = ++renderToken;
  const factory = routes[path];
  let html;
  try {
    const view = factory || (async () => `<section class="not-found"><div class="eyebrow" style="justify-content:center">ERREUR 404</div><h1>Cette page n’existe pas.</h1><a class="button" href="/" data-link>Revenir à l’accueil</a></section>`);
    html = await view();
    if (typeof html === "function") html = await html();
  } catch (e) {
    if (e.status === 401) { me = null; topActions(); html = needLogin("Votre session a expiré. Reconnectez-vous."); }
    else html = `<section class="not-found"><h1>Une erreur est survenue.</h1><p class="hero-copy">${esc(e.message)}</p><a class="button" href="/" data-link>Accueil</a></section>`;
  }
  if (tok !== renderToken) return;
  app.innerHTML = `<div class="page-transition">${html}</div>`;
  document.querySelectorAll(".desktop-nav a").forEach(a => a.classList.toggle("active", a.getAttribute("href") === path));
  mobileNav.classList.remove("open");
  document.title = "neV.NEXUS — Connecter les possibilités";
  NEXUSLANDING.stop(); NEXUSVISITE.stop();
  document.body.classList.toggle("landing", path === "/");
  document.body.classList.toggle("dark", path === "/" || path === "/explorer" || path === "/categorie" || path === "/visite");
  if (path === "/") NEXUSLANDING.start({onExplore: p => navigate(p)});
  if (path === "/visite") NEXUSVISITE.start(categories);
  if (path === "/rechercher") { const s = new URLSearchParams(location.search).get("q"); if (s && q("listSearch")) q("listSearch").value = s; }
  if (listKind[path]) { loadList(listKind[path]); }
  window.scrollTo({top: 0, behavior: "instant"}); app.focus({preventScroll: true});
}
function navigate(target, playIntro = false) {
  const u = new URL(target, location.origin); const p = u.pathname.replace(/\/+$/, "") || "/";
  if (p + u.search === full()) { window.scrollTo({top: 0, behavior: "smooth"}); return; }
  app.firstElementChild?.classList.add("page-out");
  setTimeout(() => { history.pushState({}, "", p + u.search); render(p); }, 140);
}

/* ----- dialogue de signalement ----- */
function askReason() {
  return new Promise(res => {
    const d = document.createElement("dialog"); d.className = "dlg";
    d.innerHTML = `<form method="dialog"><h3>Signaler une information</h3><p class="result-meta">Décrivez l’erreur constatée (5 caractères minimum). Aucun nom n’est nécessaire.</p><textarea id="dlgReason" maxlength="1000" required minlength="5" rows="4"></textarea><div class="acts" style="margin-top:12px"><button class="button button-small" value="ok">Envoyer</button><button class="button button-small button-outline" value="cancel" formnovalidate>Annuler</button></div></form>`;
    document.body.appendChild(d); d.showModal();
    d.addEventListener("close", () => { const v = d.returnValue === "ok" ? q("dlgReason").value.trim() : null; d.remove(); res(v); });
  });
}

/* ----- événements ----- */
document.addEventListener("click", async e => {
  const a = e.target.closest("a[data-link]");
  if (a) { const u = new URL(a.href); if (u.origin !== location.origin) return; e.preventDefault(); navigate(u.pathname + u.search, u.pathname === "/"); return; }
  const t = e.target.closest("button"); if (!t) return;
  try {
    if (t.id === "logoutBtn") { await post("/api/auth/logout"); me = null; topActions(); toast("Vous êtes déconnecté."); navigate("/"); }
    else if (t.id === "searchButton") loadList(listKind[currentPath()]);
    else if (t.dataset.filter !== undefined) { activeFilter = t.dataset.filter; document.querySelectorAll("[data-filter]").forEach(x => x.classList.toggle("active", x === t)); loadList(listKind[currentPath()]); }
    else if (t.dataset.report) {
      const [targetType, targetId] = t.dataset.report.split(":"); const reason = await askReason(); if (!reason) return;
      await post("/api/reports", {targetType, targetId, reason}); toast("Merci, votre signalement a été transmis à l’équipe.");
    }
    else if (t.dataset.delNeed) { if (confirm("Supprimer cette demande ?")) { await del(`/api/me/needs/${t.dataset.delNeed}`); render(); } }
    else if (t.dataset.act) await adminAction(t.dataset.act);
  } catch (err) { toast(err.message); }
});
async function adminAction(act) {
  const [k, id, val] = act.split(":");
  if (k === "needview") { const n = await get(`/api/admin/needs/${id}`); const m = q("adminMsg"); m.hidden = false; m.innerHTML = `<strong>${esc(n.summary)}</strong><br>${esc(n.description)}<br><small>${esc(n.category || "")} ${esc(n.locality || "")}</small>`; return; }
  if (k === "org") { const note = val === "verified" || val === "pending" ? null : prompt("Note interne (facultatif) :") || null; await patch(`/api/admin/organizations/${id}`, {status: val, note}); }
  else if (k === "resources" || k === "opportunities") await patch(`/api/admin/${k}/${id}`, {status: val});
  else if (k === "report") await patch(`/api/admin/reports/${id}`, {status: val});
  else if (k === "need") await patch(`/api/admin/needs/${id}`, {status: val});
  else if (k === "user") await patch(`/api/admin/users/${id}`, {isActive: val === "on"});
  toast("Action enregistrée."); render();
}
document.addEventListener("change", async e => {
  if (e.target.dataset.role) { try { await patch(`/api/admin/users/${e.target.dataset.role}`, {role: e.target.value}); toast("Rôle mis à jour."); } catch (err) { toast(err.message); render(); } }
});
document.addEventListener("submit", async e => {
  if (e.target.getAttribute("method") === "dialog") return;
  e.preventDefault(); const f = e.target.id; const v = id => q(id)?.value.trim() ?? "";
  const btn = e.target.querySelector("button[type=submit]"); if (btn) btn.disabled = true;
  try {
    if (f === "exSearch") { const s = e.target.q.value.trim(); navigate("/rechercher" + (s ? "?q=" + encodeURIComponent(s) : "")); }
    else if (f === "registerForm") { const r = await post("/api/auth/register", {displayName: v("rName"), email: v("rEmail"), password: q("rPass").value, accountType: v("rType"), inviteCode: q("rInvite") ? v("rInvite") : undefined, acceptTerms: q("rTerms").checked}); me = r.user; topActions(); toast("Compte créé. Bienvenue !"); navigate("/compte"); }
    else if (f === "loginForm") { const r = await post("/api/auth/login", {email: v("lEmail"), password: q("lPass").value}); me = r.user; topActions(); navigate("/compte"); }
    else if (f === "needForm") { await post("/api/needs", {category: v("needCat") || null, summary: v("needSummary"), description: v("needText"), locality: v("needLoc") || null}); toast("Votre demande a bien été enregistrée."); navigate("/compte"); }
    else if (f === "orgForm") { await post("/api/organizations", {name: v("oName"), category: v("oCat") || null, description: v("oDesc"), services: v("oServ"), targetAudience: v("oAud"), interventionZone: v("oZone"), locality: v("oLoc") || null, publicEmail: v("oMail") || null, publicPhone: v("oTel") || null, accessConditions: v("oAcc")}); toast("Fiche soumise. Elle sera examinée avant publication."); render(); }
    else if (f === "contentForm") { const kind = v("cKind"); const body = {title: v("cTitle"), description: v("cDesc"), category: v("cCat") || null, locality: v("cLoc") || null}; if (kind === "opportunities" && v("cDate")) body.deadline = new Date(v("cDate") + "T23:59:59Z").toISOString(); await post(`/api/organizations/${v("cOrg")}/${kind}`, body); toast("Envoyé pour relecture."); render(); }
    else if (f === "pwForm") { await post("/api/me/password", {currentPassword: q("pwOld").value, newPassword: q("pwNew").value}); toast("Mot de passe modifié."); e.target.reset(); }
    else if (f === "delForm") { if (!confirm("Supprimer définitivement votre compte ?")) return; await del("/api/me", {password: q("delPw").value}); me = null; topActions(); toast("Compte supprimé."); navigate("/"); }
    else if (f === "learnForm") { await post("/api/admin/learn", {title: v("lnTitle"), description: v("lnDesc"), topic: v("lnTopic") || "Général", level: v("lnLevel"), url: v("lnUrl") || null}); toast("Contenu publié."); e.target.reset(); }
  } catch (err) {
    const errId = {registerForm:"rErr", loginForm:"lErr", needForm:"needErr", orgForm:"oErr", contentForm:"cErr", pwForm:"pwErr", delForm:"delErr", learnForm:"lnErr"}[f];
    err.message = err.code === "validation" ? "Vérifiez les champs : certaines informations sont invalides ou trop courtes." : err.message;
    formError(errId, err);
  } finally { if (btn) btn.disabled = false; }
});
window.addEventListener("popstate", () => render(currentPath()));

(async function init() {
  try { [cfg, categories, {user: me}] = await Promise.all([get("/api/config"), get("/api/categories"), get("/api/me")]); } catch {}
  if (cfg.notice) { const b = q("pilotBanner"); b.textContent = cfg.notice; b.hidden = false; }
  topActions();
  await render();
})();
