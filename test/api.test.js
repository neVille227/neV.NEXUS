import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, reg } from "./helpers.js";

let ctx;
before(async () => { ctx = await setup(); });
after(async () => { await ctx.close(); });

const mkRole = async (email, role) => {
  const c = ctx.client();
  const r = await reg(c, email);
  assert.equal(r.status, 201);
  await ctx.pool.query("UPDATE users SET role = $1 WHERE lower(email) = $2", [role, email]);
  return c;
};

test("santé et configuration publique", async () => {
  const c = ctx.client();
  assert.equal((await c.get("/api/health")).json.ok, true);
  const cfg = (await c.get("/api/config")).json;
  assert.equal(cfg.registrationMode, "invite");
  assert.equal(cfg.pilotMode, true);
});

test("en-têtes de sécurité et repli SPA", async () => {
  const r = await fetch(ctx.base + "/explorer");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.match(await r.text(), /neV\.NEXUS/);
});

test("inscription : code d'invitation, mot de passe, doublon", async () => {
  const c = ctx.client();
  assert.equal((await reg(c, "a@ex.com", { inviteCode: "faux" })).status, 403);
  assert.equal((await reg(c, "a@ex.com", { password: "court" })).status, 400);
  assert.equal((await reg(c, "a@ex.com", { acceptTerms: false })).status, 400);
  const ok = await reg(c, "a@ex.com");
  assert.equal(ok.status, 201);
  assert.match(ok.set[0], /HttpOnly/);
  assert.match(ok.set[0], /SameSite=Lax/);
  assert.equal(ok.json.user.role, "member");
  assert.equal((await reg(ctx.client(), "A@EX.com")).status, 409);
  const { rows } = await ctx.pool.query("SELECT password_hash FROM users WHERE email = 'a@ex.com'");
  assert.notEqual(rows[0].password_hash, "motdepasse-solide-1");
});

test("inscriptions fermées", async () => {
  await ctx.close();
  const s = await setup({ REGISTRATION_MODE: "closed" });
  assert.equal((await reg(s.client(), "x@ex.com")).status, 403);
  await s.close();
  ctx = await setup(); // restaure la base pour les tests suivants
});

test("connexion, déconnexion et session", async () => {
  const c = ctx.client();
  await reg(c, "b@ex.com");
  assert.equal((await c.get("/api/me")).json.user.email, "b@ex.com");
  await c.post("/api/auth/logout");
  assert.equal((await c.get("/api/me")).json.user, null);
  assert.equal((await c.post("/api/auth/login", { email: "b@ex.com", password: "mauvais-mot-de-passe" })).status, 401);
  assert.equal((await c.post("/api/auth/login", { email: "inconnu@ex.com", password: "mauvais-mot-de-passe" })).status, 401);
  assert.equal((await c.post("/api/auth/login", { email: "b@ex.com", password: "motdepasse-solide-1" })).status, 200);
  const { rows } = await ctx.pool.query("SELECT token_hash FROM sessions");
  assert.ok(rows.every((r) => r.token_hash.length === 64)); // jeton haché, jamais en clair
});

test("protection CSRF : en-tête obligatoire sur les écritures", async () => {
  const c = ctx.client();
  const r = await fetch(ctx.base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(r.status, 403);
  assert.equal((await c.raw("POST", "/api/auth/login", { email: "x@ex.com", password: "x" }, { "x-requested-with": "autre" })).status, 403);
});

test("besoins : privés, propres à chaque utilisateur", async () => {
  const a = ctx.client(), b = ctx.client(), anon = ctx.client();
  await reg(a, "need-a@ex.com"); await reg(b, "need-b@ex.com");
  assert.equal((await anon.post("/api/needs", { summary: "Formation", description: "Je cherche une formation" })).status, 401);
  const created = await a.post("/api/needs", { category: "Éducation et formation", summary: "Formation", description: "Je cherche une formation en informatique" });
  assert.equal(created.status, 201);
  assert.equal((await a.get("/api/me/needs")).json.length, 1);
  assert.equal((await b.get("/api/me/needs")).json.length, 0);
  assert.equal((await b.del(`/api/me/needs/${created.json.id}`)).status, 404);
  assert.equal((await a.post("/api/needs", { summary: "x", description: "court" })).status, 400);
  assert.equal((await a.del(`/api/me/needs/${created.json.id}`)).status, 200);
});

test("cycle organisation : soumission, vérification, publication, modification, suspension", async () => {
  const member = ctx.client();
  await reg(member, "m1@ex.com");
  const orgBody = { name: "Association Test", category: "Relations humaines et solidarité", description: "Une association de démonstration.", services: "Orientation", interventionZone: "Abomey-Calavi", locality: "Abomey-Calavi" };
  assert.equal((await member.post("/api/organizations", orgBody)).status, 403);

  const owner = ctx.client();
  await reg(owner, "org1@ex.com", { accountType: "organization" });
  const sub = await owner.post("/api/organizations", orgBody);
  assert.equal(sub.status, 201);
  assert.equal(sub.json.verification_status, "pending");
  const orgId = sub.json.id;

  const anon = ctx.client();
  assert.equal((await anon.get("/api/organizations")).json.length, 0);
  assert.equal((await anon.get(`/api/organizations/${orgId}`)).status, 404);

  const res1 = await owner.post(`/api/organizations/${orgId}/resources`, { title: "Point d'orientation", description: "Accueil et orientation des habitants.", category: "Développement personnel" });
  assert.equal(res1.status, 201);
  assert.equal(res1.json.status, "pending_review");

  // un utilisateur sans droits ne peut pas modérer
  assert.equal((await owner.patch(`/api/admin/organizations/${orgId}`, { status: "verified" })).status, 403);
  assert.equal((await owner.get("/api/admin/queue")).status, 403);

  const moderator = await mkRole("mod1@ex.com", "moderator");
  const queue = (await moderator.get("/api/admin/queue")).json;
  assert.equal(queue.organizations.length, 1);
  assert.equal(queue.resources.length, 1);

  assert.equal((await moderator.patch(`/api/admin/organizations/${orgId}`, { status: "verified" })).status, 200);
  const pubOrg = (await anon.get(`/api/organizations/${orgId}`)).json;
  assert.equal(pubOrg.verification_status, "verified");
  assert.ok(pubOrg.last_verified_at);
  assert.equal((await anon.get("/api/resources")).json.length, 0); // ressource non publiée

  assert.equal((await moderator.patch(`/api/admin/resources/${res1.json.id}`, { status: "published" })).status, 200);
  const list = (await anon.get("/api/resources?q=orientation")).json;
  assert.equal(list.length, 1);
  assert.equal(list[0].organization, "Association Test");
  assert.equal((await anon.get("/api/resources?category=Éducation%20et%20formation")).json.length, 0);

  // les compteurs de catégories reflètent uniquement le contenu public
  const cats = (await anon.get("/api/categories")).json;
  const orient = cats.find((c) => c.slug === "developpement-personnel"), assoc = cats.find((c) => c.slug === "relations-humaines-et-solidarite");
  assert.equal(orient.resources, 1);
  assert.equal(assoc.organizations, 1);
  assert.equal(cats.find((c) => c.slug === "education-et-formation").resources, 0);

  // modifier une fiche vérifiée relance la vérification et la retire de l'affichage
  const upd = await owner.patch(`/api/organizations/${orgId}`, { ...orgBody, description: "Description modifiée de la fiche." });
  assert.equal(upd.json.verification_status, "pending");
  assert.equal((await anon.get("/api/resources")).json.length, 0);

  await moderator.patch(`/api/admin/organizations/${orgId}`, { status: "verified" });
  assert.equal((await anon.get("/api/resources")).json.length, 1);
  await moderator.patch(`/api/admin/organizations/${orgId}`, { status: "suspended", note: "Test" });
  assert.equal((await anon.get("/api/resources")).json.length, 0);
  assert.equal((await owner.post(`/api/organizations/${orgId}/opportunities`, { title: "Offre", description: "Description suffisante." })).status, 403);

  // un autre compte organisation ne peut pas modifier cette fiche
  const other = ctx.client();
  await reg(other, "org2@ex.com", { accountType: "organization" });
  assert.equal((await other.patch(`/api/organizations/${orgId}`, orgBody)).status, 404);
});

test("opportunités : délai expiré non affiché", async () => {
  const owner = ctx.client(); await reg(owner, "org3@ex.com", { accountType: "organization" });
  const mod = await mkRole("mod2@ex.com", "moderator");
  const o = (await owner.post("/api/organizations", { name: "Org 3", description: "Organisation de test numéro trois." })).json;
  await mod.patch(`/api/admin/organizations/${o.id}`, { status: "verified" });
  const past = await owner.post(`/api/organizations/${o.id}/opportunities`, { title: "Passée", description: "Offre déjà expirée.", deadline: "2020-01-01T00:00:00Z" });
  const future = await owner.post(`/api/organizations/${o.id}/opportunities`, { title: "À venir", description: "Offre encore ouverte.", deadline: "2099-01-01T00:00:00Z" });
  await mod.patch(`/api/admin/opportunities/${past.json.id}`, { status: "published" });
  await mod.patch(`/api/admin/opportunities/${future.json.id}`, { status: "published" });
  const titles = (await ctx.client().get("/api/opportunities")).json.map((x) => x.title);
  assert.deepEqual(titles, ["À venir"]);
});

test("LEARN : création par modérateur, lecture publique", async () => {
  const mod = await mkRole("mod3@ex.com", "moderator");
  const member = ctx.client(); await reg(member, "m3@ex.com");
  assert.equal((await member.post("/api/admin/learn", { title: "Premiers pas", description: "Introduction au numérique." })).status, 403);
  assert.equal((await mod.post("/api/admin/learn", { title: "Premiers pas", description: "Introduction au numérique.", url: "https://exemple.org/cours" })).status, 201);
  assert.equal((await ctx.client().get("/api/learn")).json[0].title, "Premiers pas");
  assert.equal((await mod.post("/api/admin/learn", { title: "Lien", description: "Lien dangereux ici.", url: "javascript:alert(1)" })).status, 400);
});

test("signalements : 2 signalements marquent la fiche « signalée »", async () => {
  const owner = ctx.client(); await reg(owner, "org4@ex.com", { accountType: "organization" });
  const mod = await mkRole("mod4@ex.com", "moderator");
  const o = (await owner.post("/api/organizations", { name: "Org 4", description: "Organisation de test numéro quatre." })).json;
  await mod.patch(`/api/admin/organizations/${o.id}`, { status: "verified" });
  const anon = ctx.client();
  assert.equal((await anon.post("/api/reports", { targetType: "organization", targetId: o.id, reason: "Numéro incorrect" })).status, 201);
  assert.equal((await anon.get(`/api/organizations/${o.id}`)).status, 200);
  await anon.post("/api/reports", { targetType: "organization", targetId: o.id, reason: "Informations périmées" });
  assert.equal((await anon.get(`/api/organizations/${o.id}`)).status, 404);
  assert.equal((await anon.post("/api/reports", { targetType: "organization", targetId: "00000000-0000-4000-8000-000000000000", reason: "Inexistant" })).status, 404);
  assert.equal((await mod.get("/api/admin/queue")).json.reports.length >= 2, true);
});

test("administration : rôles, désactivation, audit", async () => {
  const admin = await mkRole("admin1@ex.com", "administrator");
  const mod = await mkRole("mod5@ex.com", "moderator");
  assert.equal((await mod.get("/api/admin/users")).status, 403);
  const users = (await admin.get("/api/admin/users")).json;
  assert.ok(users.length > 3);
  assert.ok(users.every((u) => !("password_hash" in u)));
  const victim = ctx.client(); await reg(victim, "victim@ex.com");
  const vid = users.find((u) => u.email === "mod5@ex.com").id;
  assert.equal((await admin.patch(`/api/admin/users/${vid}`, { isActive: false })).status, 200);
  assert.equal((await mod.get("/api/me")).json.user, null); // sessions révoquées
  assert.equal((await mod.post("/api/auth/login", { email: "mod5@ex.com", password: "motdepasse-solide-1" })).status, 401);
  const self = users.find((u) => u.email === "admin1@ex.com").id;
  assert.equal((await admin.patch(`/api/admin/users/${self}`, { role: "member" })).status, 400);
  const log = (await admin.get("/api/admin/audit")).json;
  assert.ok(log.some((l) => l.action === "user.admin_update"));
});

test("droit à l'effacement : suppression du compte et des besoins", async () => {
  const c = ctx.client(); await reg(c, "del@ex.com");
  await c.post("/api/needs", { summary: "Besoin", description: "Un besoin à supprimer ensuite." });
  assert.equal((await c.del("/api/me", { password: "faux-mot-de-passe" })).status, 401);
  assert.equal((await c.del("/api/me", { password: "motdepasse-solide-1" })).status, 200);
  const { rows } = await ctx.pool.query("SELECT (SELECT COUNT(*) FROM users WHERE email = 'del@ex.com')::int AS u, (SELECT COUNT(*) FROM needs WHERE summary = 'Besoin')::int AS n");
  assert.deepEqual(rows[0], { u: 0, n: 0 });
});

test("changement de mot de passe", async () => {
  const c = ctx.client(); await reg(c, "pw@ex.com");
  assert.equal((await c.post("/api/me/password", { currentPassword: "faux", newPassword: "nouveau-mot-de-passe-2" })).status, 401);
  assert.equal((await c.post("/api/me/password", { currentPassword: "motdepasse-solide-1", newPassword: "nouveau-mot-de-passe-2" })).status, 200);
  const d = ctx.client();
  assert.equal((await d.post("/api/auth/login", { email: "pw@ex.com", password: "nouveau-mot-de-passe-2" })).status, 200);
});

test("robustesse : identifiants invalides, recherche avec caractères spéciaux, JSON cassé", async () => {
  const c = ctx.client();
  assert.equal((await c.get("/api/organizations/pas-un-uuid")).status, 404);
  assert.equal((await c.get("/api/resources?q=%25%27%3B%20DROP%20TABLE%20users%3B--")).status, 200);
  const r = await fetch(ctx.base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "nevnexus" }, body: "{pas du json" });
  assert.equal(r.status, 400);
  const big = await fetch(ctx.base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "nevnexus" }, body: JSON.stringify({ x: "a".repeat(30000) }) });
  assert.equal(big.status, 400);
  assert.equal((await c.get("/api/inconnu")).status, 404);
  assert.equal((await ctx.pool.query("SELECT COUNT(*)::int AS n FROM users")).rows[0].n > 0, true);
});

test("limitation de débit sur la connexion", async () => {
  await ctx.close();
  const s = await setup({ DISABLE_RATE_LIMIT: "false" });
  const c = s.client();
  let last;
  for (let i = 0; i < 22; i++) last = await c.post("/api/auth/login", { email: "x@ex.com", password: "faux" });
  assert.equal(last.status, 429);
  await s.close();
  ctx = await setup();
});

test("entretien : expirations et renouvellement de vérification", async () => {
  const { maintenance } = await import("../src/app.js");
  const owner = ctx.client(); await reg(owner, "org9@ex.com", { accountType: "organization" });
  const o = (await owner.post("/api/organizations", { name: "Org 9", description: "Organisation de test numéro neuf." })).json;
  await ctx.pool.query("UPDATE organizations SET verification_status='verified', last_verified_at = NOW() - INTERVAL '200 days' WHERE id = $1", [o.id]);
  const u = (await ctx.pool.query("SELECT id FROM users WHERE email = 'org9@ex.com'")).rows[0].id;
  await ctx.pool.query("INSERT INTO needs(user_id, summary, description, retention_until) VALUES ($1,'vieux','besoin expiré', NOW() - INTERVAL '1 day')", [u]);
  await maintenance(ctx.pool);
  assert.equal((await ctx.pool.query("SELECT verification_status s FROM organizations WHERE id = $1", [o.id])).rows[0].s, "renewal_due");
  assert.equal((await ctx.pool.query("SELECT COUNT(*)::int n FROM needs WHERE summary = 'vieux'")).rows[0].n, 0);
});

test("catalogue central : 30 catégories, 8 familles, sous-catégories", async () => {
  const anon = ctx.client();
  const cat = (await anon.get("/api/catalogue")).json;
  assert.equal(cat.categories.length, 30);
  assert.equal(cat.families.length, 8);
  assert.equal(cat.categories.every((c) => c.subcategories.length >= 5), true);
  assert.equal(cat.categories.some((c) => c.slug === "autres-besoins"), true);
  // chaque catégorie apparaît dans au moins une famille
  const placed = new Set(cat.families.flatMap((f) => f.categories));
  assert.equal(cat.categories.every((c) => placed.has(c.slug)), true);
  const logement = cat.categories.find((c) => c.slug === "logement-et-habitat");
  assert.equal(logement.subcategories.some((s) => s.name === "Recherche de logement"), true);
});

test("besoin détaillé : plusieurs catégories, confidentialité renforcée, « Autres besoins » par défaut", async () => {
  const u = ctx.client(); await reg(u, "need-full@ex.com");
  const full = await u.post("/api/needs", { category: "Logement et habitat", subcategory: "Recherche de logement", categories: ["Finances et ressources économiques", "Inexistante"],
    summary: "Trouver un logement", description: "Je cherche un logement près de mon travail.", country: "Bénin", locality: "Abomey-Calavi",
    nature: "materiel", frequency: "ponctuel", priority: "eleve", supportType: "orientation", confidentiality: "public" });
  assert.equal(full.status, 201);
  assert.deepEqual(full.json.categories, ["Logement et habitat", "Finances et ressources économiques"]);
  assert.equal(full.json.confidentiality, "public");
  // catégorie sensible : confidentialité forcée à « privée »
  const sens = await u.post("/api/needs", { category: "Santé mentale et bien-être", summary: "Besoin d'écoute", description: "J'ai besoin de parler à quelqu'un.", confidentiality: "public" });
  assert.equal(sens.json.confidentiality, "private");
  assert.equal(sens.json.sensitive, true);
  // sans catégorie : « Autres besoins »
  const none = await u.post("/api/needs", { summary: "Autre chose", description: "Une demande qui ne rentre dans aucune case." });
  assert.deepEqual(none.json.categories, ["Autres besoins"]);
  const mine = (await u.get("/api/me/needs")).json;
  const f = mine.find((n) => n.summary === "Trouver un logement");
  assert.equal(f.priority, "eleve"); assert.equal(f.categories.length, 2); assert.equal(f.categories[0].subcategory, "Recherche de logement");
  assert.equal((await u.post("/api/needs", { summary: "x", description: "description valide", priority: "critique" })).status, 400);
});

test("catalogue : administration réservée aux administrateurs, « Autres besoins » protégé", async () => {
  const user = ctx.client(), admin = ctx.client();
  await reg(user, "cat-user@ex.com"); await reg(admin, "cat-admin@ex.com");
  await ctx.pool.query("UPDATE users SET role = 'administrator' WHERE email = 'cat-admin@ex.com'");
  assert.equal((await user.post("/api/admin/categories", { name: "Nouvelle catégorie" })).status, 403);
  const created = await admin.post("/api/admin/categories", { name: "Mobilité douce", families: ["vie-pratique"] });
  assert.equal(created.status, 201);
  assert.equal((await admin.post("/api/admin/categories", { name: "Mobilité douce" })).status, 409);
  const sub = await admin.post(`/api/admin/categories/${created.json.id}/subcategories`, { name: "Vélo" });
  assert.equal(sub.status, 201);
  let pub = (await ctx.client().get("/api/catalogue")).json;
  assert.equal(pub.categories.length, 31);
  assert.equal(pub.families.find((f) => f.slug === "vie-pratique").categories.includes("mobilite-douce"), true);
  assert.equal((await admin.patch(`/api/admin/categories/${created.json.id}`, { active: false })).status, 200);
  pub = (await ctx.client().get("/api/catalogue")).json;
  assert.equal(pub.categories.length, 30);
  const other = pub.categories.find((c) => c.slug === "autres-besoins");
  assert.equal((await admin.patch(`/api/admin/categories/${other.id}`, { active: false })).status, 400);
});
