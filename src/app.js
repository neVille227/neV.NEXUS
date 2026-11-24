import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const COOKIE = "nev_session";
const SESSION_DAYS = 14;
const RANK = { member: 0, organization: 1, moderator: 2, administrator: 3 };

const hashToken = (t) => crypto.createHash("sha256").update(t).digest("hex");
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ---------- schémas de validation ----------
const txt = (min, max) => z.string().trim().min(min).max(max);
const opt = (max) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const schemas = {
  register: z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(10).max(128),
    displayName: txt(2, 60),
    accountType: z.enum(["member", "organization"]).default("member"),
    inviteCode: z.string().max(100).optional(),
    acceptTerms: z.literal(true),
  }),
  login: z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(128) }),
  profile: z.object({ displayName: txt(2, 60) }),
  password: z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(10).max(128) }),
  deleteAccount: z.object({ password: z.string().min(1).max(128) }),
  need: z.object({
    category: z.string().trim().max(60).optional().nullable(),
    subcategory: z.string().trim().max(80).optional().nullable(),
    categories: z.array(z.string().trim().max(60)).max(5).optional(),
    summary: txt(3, 120),
    description: txt(8, 2000),
    locality: opt(80),
    country: opt(60),
    nature: z.enum(["materiel", "financier", "humain", "technique", "informationnel", "autre"]).optional().nullable(),
    frequency: z.enum(["ponctuel", "occasionnel", "regulier", "permanent"]).optional().nullable(),
    priority: z.enum(["faible", "normal", "eleve", "urgent"]).default("normal"),
    supportType: z.enum(["aide_directe", "orientation", "mise_en_relation", "conseil", "formation"]).optional().nullable(),
    confidentiality: z.enum(["public", "organizations", "private"]).default("private"),
  }),
  catAdmin: z.object({
    name: txt(2, 60), description: txt(0, 300).default(""), sensitive: z.boolean().default(false),
    families: z.array(z.string().trim().max(60)).max(8).default([]),
  }),
  catPatch: z.object({ name: txt(2, 60).optional(), active: z.boolean().optional(), sensitive: z.boolean().optional(), position: z.number().int().min(0).max(1000).optional() }),
  subAdmin: z.object({ name: txt(2, 80) }),
  subPatch: z.object({ name: txt(2, 80).optional(), active: z.boolean().optional() }),
  org: z.object({
    name: txt(2, 120),
    category: z.string().trim().max(60).optional().nullable(),
    description: txt(10, 2000),
    services: txt(0, 2000).default(""),
    targetAudience: txt(0, 500).default(""),
    interventionZone: txt(0, 300).default(""),
    publicEmail: z.string().trim().email().max(254).optional().nullable().or(z.literal("")).transform((v) => v || null),
    publicPhone: opt(40),
    accessConditions: txt(0, 1000).default(""),
    locality: opt(80),
  }),
  content: z.object({
    title: txt(3, 140),
    description: txt(10, 2000),
    category: z.string().trim().max(60).optional().nullable(),
    locality: opt(80),
    deadline: z.string().datetime().optional().nullable(),
  }),
  learn: z.object({
    title: txt(3, 140), description: txt(10, 2000), topic: txt(2, 60).default("Général"),
    level: z.enum(["débutant", "intermédiaire", "avancé"]).default("débutant"),
    url: z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), "http(s) uniquement").optional().nullable().or(z.literal("")).transform((v) => v || null),
  }),
  report: z.object({
    targetType: z.enum(["organization", "resource", "opportunity", "learning_item"]),
    targetId: z.string().uuid(),
    reason: txt(5, 1000),
  }),
  orgStatus: z.object({
    status: z.enum(["pending", "verified", "renewal_due", "flagged", "suspended"]),
    note: opt(500),
  }),
  contentStatus: z.object({ status: z.enum(["pending_review", "published", "rejected", "archived"]) }),
  reportStatus: z.object({ status: z.enum(["open", "under_review", "resolved", "dismissed"]) }),
  needStatus: z.object({ status: z.enum(["received", "reviewing", "referred", "closed"]) }),
  userAdmin: z.object({ role: z.enum(["member", "organization", "moderator", "administrator"]).optional(), isActive: z.boolean().optional() }),
};

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const parse = (schema, data) => {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, "Données invalides.", "validation");
  return r.data;
};

export function createApp({ pool, env = process.env } = {}) {
  const app = express();
  const isProd = env.NODE_ENV === "production";
  const regMode = () => (env.REGISTRATION_MODE || "invite").toLowerCase(); // closed | invite | open
  const bcryptCost = Number(env.BCRYPT_COST || 12);
  const dummyHash = bcrypt.hashSync("dummy-password-for-timing", bcryptCost);
  const limitsOn = env.DISABLE_RATE_LIMIT !== "true";

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
  }));
  app.use(express.json({ limit: "20kb" }));

  const audit = (actor, action, targetType, targetId, metadata = {}) =>
    pool.query("INSERT INTO audit_logs(actor_user_id, action, target_type, target_id, metadata) VALUES ($1,$2,$3,$4,$5)",
      [actor ?? null, action, targetType ?? null, targetId ?? null, metadata]);

  // ---------- limitation de débit ----------
  const mk = (windowMs, max) => (limitsOn ? rateLimit({ windowMs, limit: max, standardHeaders: true, legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: "Trop de tentatives. Réessayez plus tard.", code: "rate_limited" }) }) : (req, res, next) => next());
  const apiLimiter = mk(60_000, 240);
  const authLimiter = mk(15 * 60_000, 20);
  const writeLimiter = mk(60_000, 30);
  app.use("/api", apiLimiter);

  // ---------- protection CSRF : en-tête personnalisé + JSON pour toute écriture ----------
  app.use("/api", (req, res, next) => {
    if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      if (req.get("x-requested-with") !== "nevnexus") return next(new HttpError(403, "Requête refusée.", "csrf"));
    }
    next();
  });

  // ---------- sessions ----------
  const cookies = (req) => Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
  const setCookie = (res, value, maxAgeSec) =>
    res.append("Set-Cookie", `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${isProd ? "; Secure" : ""}`);
  async function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString("base64url");
    await pool.query("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1,$2, NOW() + ($3 || ' days')::interval)", [hashToken(token), userId, String(SESSION_DAYS)]);
    setCookie(res, token, SESSION_DAYS * 86400);
  }
  app.use("/api", wrap(async (req, res, next) => {
    const token = cookies(req)[COOKIE];
    req.user = null;
    if (token) {
      const { rows } = await pool.query(
        `SELECT u.id, u.email, u.display_name, u.role, u.is_active FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > NOW()`, [hashToken(token)]);
      if (rows[0]?.is_active) req.user = rows[0];
    }
    next();
  }));
  const requireAuth = (req, res, next) => (req.user ? next() : next(new HttpError(401, "Connexion requise.", "auth")));
  const requireRole = (role) => (req, res, next) =>
    !req.user ? next(new HttpError(401, "Connexion requise.", "auth"))
      : RANK[req.user.role] >= RANK[role] ? next() : next(new HttpError(403, "Accès refusé.", "forbidden"));
  const publicUser = (u) => ({ id: u.id, email: u.email, displayName: u.display_name, role: u.role });

  const categoryId = async (name) => {
    if (!name) return null;
    const { rows } = await pool.query("SELECT id FROM categories WHERE name = $1 AND active", [name]);
    return rows[0]?.id ?? null;
  };
  const idParam = (req) => {
    if (!z.string().uuid().safeParse(req.params.id).success) throw new HttpError(404, "Introuvable.", "not_found");
    return req.params.id;
  };

  // ---------- public ----------
  app.get("/api/health", wrap(async (req, res) => { await pool.query("SELECT 1"); res.json({ ok: true }); }));
  app.get("/api/config", (req, res) => res.json({
    registrationMode: regMode(),
    pilotMode: true,
    notice: "Version pilote : service en test supervisé, ne saisissez aucune information sensible.",
  }));
  const CAT_SQL = `(SELECT COUNT(*)::int FROM resources r JOIN organizations o ON o.id = r.organization_id
          WHERE r.category_id = c.id AND r.status = 'published' AND o.verification_status IN ('verified','renewal_due')) AS resources,
        (SELECT COUNT(*)::int FROM opportunities p JOIN organizations o ON o.id = p.organization_id
          WHERE p.category_id = c.id AND p.status = 'published' AND o.verification_status IN ('verified','renewal_due')
            AND (p.deadline IS NULL OR p.deadline > NOW())) AS opportunities,
        (SELECT COUNT(*)::int FROM organizations o
          WHERE o.category_id = c.id AND o.verification_status IN ('verified','renewal_due')) AS organizations`;
  const slugify = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const loadCatalogue = async (all) => {
    const cats = (await pool.query(`SELECT c.id, c.name, c.slug, c.position, c.active, c.sensitive,
        ${CAT_SQL},
        COALESCE((SELECT json_agg(f.slug ORDER BY cf.position) FROM category_families cf JOIN families f ON f.id = cf.family_id WHERE cf.category_id = c.id), '[]') AS families,
        COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'active', s.active) ORDER BY s.position, s.name)
                  FROM subcategories s WHERE s.category_id = c.id ${all ? "" : "AND s.active"}), '[]') AS subcategories
      FROM categories c ${all ? "" : "WHERE c.active"} ORDER BY c.position, c.name`)).rows;
    const families = (await pool.query(`SELECT f.slug, f.name, f.description,
        COALESCE((SELECT json_agg(c.slug ORDER BY cf.position) FROM category_families cf JOIN categories c ON c.id = cf.category_id WHERE cf.family_id = f.id ${all ? "" : "AND c.active"}), '[]') AS categories
      FROM families f ORDER BY f.position`)).rows;
    return { families, categories: cats };
  };
  app.get("/api/categories", wrap(async (req, res) => { res.json((await loadCatalogue(false)).categories); }));
  app.get("/api/catalogue", wrap(async (req, res) => { res.json(await loadCatalogue(false)); }));


  const searchClause = (q, cols, params) => {
    if (!q) return "";
    params.push(`%${String(q).slice(0, 80).replace(/[%_\\]/g, "\\$&")}%`);
    return " AND (" + cols.map((c) => `${c} ILIKE $${params.length}`).join(" OR ") + ")";
  };
  const pageLimit = (req) => Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 50);

  app.get("/api/resources", wrap(async (req, res) => {
    const params = []; let where = "r.status = 'published' AND o.verification_status IN ('verified','renewal_due')";
    if (req.query.category) { params.push(String(req.query.category)); where += ` AND c.name = $${params.length}`; }
    where += searchClause(req.query.q, ["r.title", "r.description", "r.locality", "o.name"], params);
    params.push(pageLimit(req));
    const { rows } = await pool.query(
      `SELECT r.id, r.title, r.description, r.locality, c.name AS category, o.id AS organization_id, o.name AS organization,
              o.verification_status, o.last_verified_at
         FROM resources r JOIN organizations o ON o.id = r.organization_id LEFT JOIN categories c ON c.id = r.category_id
        WHERE ${where} ORDER BY r.published_at DESC NULLS LAST LIMIT $${params.length}`, params);
    res.json(rows);
  }));
  app.get("/api/opportunities", wrap(async (req, res) => {
    const params = []; let where = "p.status = 'published' AND o.verification_status IN ('verified','renewal_due') AND (p.deadline IS NULL OR p.deadline > NOW())";
    if (req.query.category) { params.push(String(req.query.category)); where += ` AND c.name = $${params.length}`; }
    where += searchClause(req.query.q, ["p.title", "p.description", "p.locality", "o.name"], params);
    params.push(pageLimit(req));
    const { rows } = await pool.query(
      `SELECT p.id, p.title, p.description, p.locality, p.deadline, c.name AS category, o.id AS organization_id, o.name AS organization,
              o.verification_status, o.last_verified_at
         FROM opportunities p JOIN organizations o ON o.id = p.organization_id LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${where} ORDER BY p.published_at DESC NULLS LAST LIMIT $${params.length}`, params);
    res.json(rows);
  }));
  app.get("/api/learn", wrap(async (req, res) => {
    const params = []; let where = "status = 'published'";
    where += searchClause(req.query.q, ["title", "description", "topic"], params);
    params.push(pageLimit(req));
    res.json((await pool.query(`SELECT id, title, description, topic, level, url FROM learning_items WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params)).rows);
  }));
  const ORG_PUBLIC = `o.id, o.name, c.name AS category, o.description, o.services, o.target_audience, o.intervention_zone,
     o.public_email, o.public_phone, o.access_conditions, o.locality, o.verification_status, o.last_verified_at`;
  app.get("/api/organizations", wrap(async (req, res) => {
    const params = []; let where = "o.verification_status IN ('verified','renewal_due')";
    if (req.query.category) { params.push(String(req.query.category)); where += ` AND c.name = $${params.length}`; }
    where += searchClause(req.query.q, ["o.name", "o.description", "o.services", "o.locality"], params);
    params.push(pageLimit(req));
    res.json((await pool.query(`SELECT ${ORG_PUBLIC} FROM organizations o LEFT JOIN categories c ON c.id = o.category_id WHERE ${where} ORDER BY o.name LIMIT $${params.length}`, params)).rows);
  }));
  app.get("/api/organizations/:id", wrap(async (req, res) => {
    const id = idParam(req);
    const { rows } = await pool.query(`SELECT ${ORG_PUBLIC} FROM organizations o LEFT JOIN categories c ON c.id = o.category_id
      WHERE o.id = $1 AND o.verification_status IN ('verified','renewal_due')`, [id]);
    if (!rows[0]) throw new HttpError(404, "Introuvable.", "not_found");
    res.json(rows[0]);
  }));
  app.post("/api/reports", writeLimiter, wrap(async (req, res) => {
    const d = parse(schemas.report, req.body);
    const table = { organization: "organizations", resource: "resources", opportunity: "opportunities", learning_item: "learning_items" }[d.targetType];
    const exists = await pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [d.targetId]);
    if (!exists.rowCount) throw new HttpError(404, "Élément introuvable.", "not_found");
    const { rows } = await pool.query("INSERT INTO reports(reporter_user_id, target_type, target_id, reason) VALUES ($1,$2,$3,$4) RETURNING id", [req.user?.id ?? null, d.targetType, d.targetId, d.reason]);
    if (d.targetType === "organization") {
      // Une fiche n'est marquée « signalée » qu'à partir de 2 signalements ouverts, pour limiter les abus.
      await pool.query(`UPDATE organizations SET verification_status = 'flagged', updated_at = NOW()
        WHERE id = $1 AND verification_status IN ('verified','renewal_due')
          AND (SELECT COUNT(*) FROM reports WHERE target_type = 'organization' AND target_id = $1 AND status = 'open') >= 2`, [d.targetId]);
    }
    res.status(201).json({ id: rows[0].id });
  }));

  // ---------- comptes ----------
  app.post("/api/auth/register", authLimiter, wrap(async (req, res) => {
    const d = parse(schemas.register, req.body);
    const mode = regMode();
    if (mode === "closed") throw new HttpError(403, "Les inscriptions sont fermées pour le moment.", "registration_closed");
    if (mode === "invite" && !(env.INVITE_CODE && d.inviteCode && safeEq(d.inviteCode, env.INVITE_CODE)))
      throw new HttpError(403, "Code d'invitation invalide.", "invite_invalid");
    const hash = await bcrypt.hash(d.password, bcryptCost);
    try {
      const { rows } = await pool.query("INSERT INTO users(email, password_hash, display_name, role) VALUES ($1,$2,$3,$4) RETURNING id, email, display_name, role",
        [d.email, hash, d.displayName, d.accountType]);
      await audit(rows[0].id, "user.register", "user", rows[0].id);
      await startSession(res, rows[0].id);
      res.status(201).json({ user: publicUser(rows[0]) });
    } catch (e) {
      if (e.code === "23505") throw new HttpError(409, "Impossible de créer ce compte avec ces informations.", "conflict");
      throw e;
    }
  }));
  app.post("/api/auth/login", authLimiter, wrap(async (req, res) => {
    const d = parse(schemas.login, req.body);
    const { rows } = await pool.query("SELECT id, email, display_name, role, is_active, password_hash FROM users WHERE lower(email) = $1", [d.email]);
    const u = rows[0];
    const ok = await bcrypt.compare(d.password, u ? u.password_hash : dummyHash);
    if (!u || !ok || !u.is_active) throw new HttpError(401, "Identifiants incorrects.", "bad_credentials");
    await startSession(res, u.id);
    await audit(u.id, "user.login", "user", u.id);
    res.json({ user: publicUser(u) });
  }));
  app.post("/api/auth/logout", wrap(async (req, res) => {
    const token = cookies(req)[COOKIE];
    if (token) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
    setCookie(res, "", 0);
    res.json({ ok: true });
  }));
  app.get("/api/me", (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
  app.patch("/api/me", requireAuth, wrap(async (req, res) => {
    const d = parse(schemas.profile, req.body);
    await pool.query("UPDATE users SET display_name = $1, updated_at = NOW() WHERE id = $2", [d.displayName, req.user.id]);
    res.json({ user: { ...publicUser(req.user), displayName: d.displayName } });
  }));
  app.post("/api/me/password", requireAuth, authLimiter, wrap(async (req, res) => {
    const d = parse(schemas.password, req.body);
    const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    if (!(await bcrypt.compare(d.currentPassword, rows[0].password_hash))) throw new HttpError(401, "Mot de passe actuel incorrect.", "bad_credentials");
    await pool.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [await bcrypt.hash(d.newPassword, bcryptCost), req.user.id]);
    const keep = hashToken(cookies(req)[COOKIE]);
    await pool.query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", [req.user.id, keep]);
    await audit(req.user.id, "user.password_change", "user", req.user.id);
    res.json({ ok: true });
  }));
  // Droit à l'effacement : supprime le compte, les sessions et les besoins (cascade).
  app.delete("/api/me", requireAuth, authLimiter, wrap(async (req, res) => {
    const d = parse(schemas.deleteAccount, req.body);
    const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    if (!(await bcrypt.compare(d.password, rows[0].password_hash))) throw new HttpError(401, "Mot de passe incorrect.", "bad_credentials");
    await audit(req.user.id, "user.delete", "user", req.user.id);
    await pool.query("DELETE FROM users WHERE id = $1", [req.user.id]);
    setCookie(res, "", 0);
    res.json({ ok: true });
  }));

  // ---------- besoins (HELP) : privés ----------
  app.post("/api/needs", requireAuth, writeLimiter, wrap(async (req, res) => {
    const d = parse(schemas.need, req.body);
    // une ou plusieurs catégories ; sans choix, « Autres besoins » (toujours disponible)
    const wanted = [...new Set([d.category, ...(d.categories || [])].filter(Boolean))];
    let cats = wanted.length ? (await pool.query("SELECT id, name, sensitive FROM categories WHERE name = ANY($1) AND active", [wanted])).rows : [];
    cats.sort((x, y) => wanted.indexOf(x.name) - wanted.indexOf(y.name));
    if (!cats.length) cats = (await pool.query("SELECT id, name, sensitive FROM categories WHERE slug = 'autres-besoins'")).rows;
    const sensitive = cats.some((c) => c.sensitive);
    const confidentiality = sensitive ? "private" : d.confidentiality;   // demandes sensibles : confidentialité renforcée
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(`INSERT INTO needs(user_id, category_id, summary, description, locality, country, nature, frequency, priority, support_type, confidentiality)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, status, created_at`,
        [req.user.id, cats[0]?.id ?? null, d.summary, d.description, d.locality, d.country, d.nature ?? null, d.frequency ?? null, d.priority, d.supportType ?? null, confidentiality]);
      for (const [i, c] of cats.entries()) {
        let sub = null;
        if (i === 0 && d.subcategory) sub = (await client.query("SELECT id FROM subcategories WHERE category_id = $1 AND name = $2 AND active", [c.id, d.subcategory])).rows[0]?.id ?? null;
        await client.query("INSERT INTO need_categories(need_id, category_id, subcategory_id) VALUES ($1,$2,$3)", [rows[0].id, c.id, sub]);
      }
      await client.query("COMMIT");
      res.status(201).json({ ...rows[0], confidentiality, sensitive, categories: cats.map((c) => c.name) });
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  }));

  app.get("/api/me/needs", requireAuth, wrap(async (req, res) => {
    res.json((await pool.query(`SELECT n.id, n.summary, n.description, n.locality, n.country, n.nature, n.frequency, n.priority, n.support_type, n.confidentiality, n.status, n.created_at, c.name AS category,
      COALESCE((SELECT json_agg(json_build_object('category', k.name, 'subcategory', s.name) ORDER BY k.position) FROM need_categories nc JOIN categories k ON k.id = nc.category_id LEFT JOIN subcategories s ON s.id = nc.subcategory_id WHERE nc.need_id = n.id), '[]') AS categories
      FROM needs n LEFT JOIN categories c ON c.id = n.category_id WHERE n.user_id = $1 ORDER BY n.created_at DESC`, [req.user.id])).rows);
  }));
  app.delete("/api/me/needs/:id", requireAuth, wrap(async (req, res) => {
    const r = await pool.query("DELETE FROM needs WHERE id = $1 AND user_id = $2", [idParam(req), req.user.id]);
    if (!r.rowCount) throw new HttpError(404, "Introuvable.", "not_found");
    res.json({ ok: true });
  }));

  // ---------- espace organisation ----------
  const canManageOrgs = (req, res, next) =>
    !req.user ? next(new HttpError(401, "Connexion requise.", "auth"))
      : RANK[req.user.role] >= RANK.organization ? next() : next(new HttpError(403, "Un compte organisation est requis.", "forbidden"));
  const ownOrg = async (req) => {
    const id = idParam(req);
    const { rows } = await pool.query("SELECT * FROM organizations WHERE id = $1", [id]);
    const o = rows[0];
    if (!o || (o.owner_user_id !== req.user.id && RANK[req.user.role] < RANK.moderator)) throw new HttpError(404, "Introuvable.", "not_found");
    return o;
  };
  app.post("/api/organizations", canManageOrgs, writeLimiter, wrap(async (req, res) => {
    const d = parse(schemas.org, req.body);
    const { rows } = await pool.query(
      `INSERT INTO organizations(owner_user_id, name, category_id, description, services, target_audience, intervention_zone, public_email, public_phone, access_conditions, locality)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, verification_status`,
      [req.user.id, d.name, await categoryId(d.category), d.description, d.services, d.targetAudience, d.interventionZone, d.publicEmail, d.publicPhone, d.accessConditions, d.locality]);
    await audit(req.user.id, "organization.submit", "organization", rows[0].id);
    res.status(201).json(rows[0]);
  }));
  app.get("/api/me/organizations", canManageOrgs, wrap(async (req, res) => {
    res.json((await pool.query(`SELECT o.*, c.name AS category FROM organizations o LEFT JOIN categories c ON c.id = o.category_id
      WHERE o.owner_user_id = $1 ORDER BY o.created_at DESC`, [req.user.id])).rows);
  }));
  app.patch("/api/organizations/:id", canManageOrgs, writeLimiter, wrap(async (req, res) => {
    const o = await ownOrg(req);
    const d = parse(schemas.org, req.body);
    // Toute modification d'une fiche vérifiée relance la vérification (Dossier §4.7).
    const status = ["verified", "renewal_due", "flagged"].includes(o.verification_status) ? "pending" : o.verification_status;
    await pool.query(
      `UPDATE organizations SET name=$1, category_id=$2, description=$3, services=$4, target_audience=$5, intervention_zone=$6,
         public_email=$7, public_phone=$8, access_conditions=$9, locality=$10, verification_status=$11, updated_at=NOW() WHERE id=$12`,
      [d.name, await categoryId(d.category), d.description, d.services, d.targetAudience, d.interventionZone, d.publicEmail, d.publicPhone, d.accessConditions, d.locality, status, o.id]);
    await audit(req.user.id, "organization.update", "organization", o.id);
    res.json({ id: o.id, verification_status: status });
  }));
  for (const [kind, table, path_] of [["resource", "resources", "resources"], ["opportunity", "opportunities", "opportunities"]]) {
    app.post(`/api/organizations/:id/${path_}`, canManageOrgs, writeLimiter, wrap(async (req, res) => {
      const o = await ownOrg(req);
      if (o.verification_status === "suspended") throw new HttpError(403, "Cette organisation est suspendue.", "forbidden");
      const d = parse(schemas.content, req.body);
      const cols = kind === "opportunity" ? "organization_id, category_id, title, description, locality, deadline" : "organization_id, category_id, title, description, locality";
      const vals = [o.id, await categoryId(d.category), d.title, d.description, d.locality];
      if (kind === "opportunity") vals.push(d.deadline ?? null);
      const { rows } = await pool.query(`INSERT INTO ${table}(${cols}) VALUES (${vals.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING id, status`, vals);
      await audit(req.user.id, `${kind}.submit`, kind, rows[0].id);
      res.status(201).json(rows[0]);
    }));
  }
  app.get("/api/me/content", canManageOrgs, wrap(async (req, res) => {
    const q = (t) => pool.query(`SELECT x.id, x.title, x.status, x.created_at, o.name AS organization FROM ${t} x JOIN organizations o ON o.id = x.organization_id WHERE o.owner_user_id = $1 ORDER BY x.created_at DESC`, [req.user.id]);
    res.json({ resources: (await q("resources")).rows, opportunities: (await q("opportunities")).rows });
  }));

  // ---------- modération et administration ----------
  const mod = requireRole("moderator");
  app.get("/api/admin/queue", mod, wrap(async (req, res) => {
    const one = async (sql) => (await pool.query(sql)).rows;
    res.json({
      organizations: await one(`SELECT o.id, o.name, o.description, o.services, o.public_email, o.verification_status, o.moderation_note, o.created_at, u.email AS owner_email
        FROM organizations o LEFT JOIN users u ON u.id = o.owner_user_id WHERE o.verification_status IN ('pending','flagged','renewal_due') ORDER BY o.created_at LIMIT 100`),
      resources: await one(`SELECT r.id, r.title, r.description, o.name AS organization, o.verification_status FROM resources r JOIN organizations o ON o.id = r.organization_id WHERE r.status = 'pending_review' ORDER BY r.created_at LIMIT 100`),
      opportunities: await one(`SELECT p.id, p.title, p.description, o.name AS organization, o.verification_status FROM opportunities p JOIN organizations o ON o.id = p.organization_id WHERE p.status = 'pending_review' ORDER BY p.created_at LIMIT 100`),
      reports: await one(`SELECT id, target_type, target_id, reason, status, created_at FROM reports WHERE status IN ('open','under_review') ORDER BY created_at LIMIT 100`),
      needs: await one(`SELECT n.id, n.summary, n.status, n.priority, n.created_at, c.name AS category FROM needs n LEFT JOIN categories c ON c.id = n.category_id WHERE n.status IN ('received','reviewing') ORDER BY CASE n.priority WHEN 'urgent' THEN 0 WHEN 'eleve' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, n.created_at LIMIT 100`),
    });
  }));
  app.get("/api/admin/needs/:id", mod, wrap(async (req, res) => {
    const { rows } = await pool.query(`SELECT n.id, n.summary, n.description, n.locality, n.country, n.nature, n.frequency, n.priority, n.support_type, n.confidentiality, n.status, n.created_at, c.name AS category,
      COALESCE((SELECT json_agg(json_build_object('category', k.name, 'subcategory', s.name) ORDER BY k.position) FROM need_categories nc JOIN categories k ON k.id = nc.category_id LEFT JOIN subcategories s ON s.id = nc.subcategory_id WHERE nc.need_id = n.id), '[]') AS categories FROM needs n LEFT JOIN categories c ON c.id = n.category_id WHERE n.id = $1`, [idParam(req)]);
    if (!rows[0]) throw new HttpError(404, "Introuvable.", "not_found");
    await audit(req.user.id, "need.view", "need", rows[0].id);
    res.json(rows[0]);
  }));
  app.patch("/api/admin/needs/:id", mod, wrap(async (req, res) => {
    const d = parse(schemas.needStatus, req.body);
    const r = await pool.query("UPDATE needs SET status = $1 WHERE id = $2", [d.status, idParam(req)]);
    if (!r.rowCount) throw new HttpError(404, "Introuvable.", "not_found");
    await audit(req.user.id, "need.status", "need", req.params.id, { status: d.status });
    res.json({ ok: true });
  }));
  app.patch("/api/admin/organizations/:id", mod, wrap(async (req, res) => {
    const d = parse(schemas.orgStatus, req.body);
    const verified = d.status === "verified";
    const r = await pool.query(
      `UPDATE organizations SET verification_status=$1, moderation_note=$2, updated_at=NOW(),
         last_verified_at = CASE WHEN $3 THEN NOW() ELSE last_verified_at END, verified_by = CASE WHEN $3 THEN $4::uuid ELSE verified_by END WHERE id=$5`,
      [d.status, d.note, verified, req.user.id, idParam(req)]);
    if (!r.rowCount) throw new HttpError(404, "Introuvable.", "not_found");
    await audit(req.user.id, "organization.status", "organization", req.params.id, { status: d.status });
    res.json({ ok: true });
  }));
  for (const [table, kind] of [["resources", "resource"], ["opportunities", "opportunity"], ["learning_items", "learning_item"]]) {
    app.patch(`/api/admin/${table === "learning_items" ? "learn" : table}/:id`, mod, wrap(async (req, res) => {
      const d = parse(schemas.contentStatus, req.body);
      const published = table === "learning_items" ? "" : ", published_at = CASE WHEN $1 = 'published' THEN NOW() ELSE published_at END";
      const r = await pool.query(`UPDATE ${table} SET status = $1, updated_at = NOW()${published} WHERE id = $2`, [d.status, idParam(req)]);
      if (!r.rowCount) throw new HttpError(404, "Introuvable.", "not_found");
      await audit(req.user.id, `${kind}.status`, kind, req.params.id, { status: d.status });
      res.json({ ok: true });
    }));
  }
  app.post("/api/admin/learn", mod, wrap(async (req, res) => {
    const d = parse(schemas.learn, req.body);
    const { rows } = await pool.query("INSERT INTO learning_items(created_by, title, description, topic, level, url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [req.user.id, d.title, d.description, d.topic, d.level, d.url]);
    await audit(req.user.id, "learning_item.create", "learning_item", rows[0].id);
    res.status(201).json(rows[0]);
  }));
  app.patch("/api/admin/reports/:id", mod, wrap(async (req, res) => {
    const d = parse(schemas.reportStatus, req.body);
    const r = await pool.query("UPDATE reports SET status = $1 WHERE id = $2", [d.status, idParam(req)]);
    if (!r.rowCount) throw new HttpError(404, "Introuvable.", "not_found");
    await audit(req.user.id, "report.status", "report", req.params.id, { status: d.status });
    res.json({ ok: true });
  }));
  const adm = requireRole("administrator");
  app.get("/api/admin/users", adm, wrap(async (req, res) => {
    res.json((await pool.query("SELECT id, email, display_name, role, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 200")).rows);
  }));
  app.patch("/api/admin/users/:id", adm, wrap(async (req, res) => {
    const d = parse(schemas.userAdmin, req.body);
    const id = idParam(req);
    if (id === req.user.id) throw new HttpError(400, "Vous ne pouvez pas modifier votre propre compte ici.", "validation");
    const r = await pool.query("UPDATE users SET role = COALESCE($1, role), is_active = COALESCE($2, is_active), updated_at = NOW() WHERE id = $3", [d.role ?? null, d.isActive ?? null, id]);
    if (!r.rowCount) throw new HttpError(404, "Introuvable.", "not_found");
    if (d.isActive === false) await pool.query("DELETE FROM sessions WHERE user_id = $1", [id]);
    await audit(req.user.id, "user.admin_update", "user", id, d);
    res.json({ ok: true });
  }));
  // catalogue : ajout, modification, désactivation (administrateurs)
  app.get("/api/admin/catalogue", adm, wrap(async (req, res) => { res.json(await loadCatalogue(true)); }));
  app.post("/api/admin/categories", adm, wrap(async (req, res) => {
    const d = parse(schemas.catAdmin, req.body), slug = slugify(d.name);
    if (!slug) throw new HttpError(400, "Nom invalide.", "validation");
    const pos = (await pool.query("SELECT COALESCE(MAX(position),0)+1 AS p FROM categories WHERE slug <> 'autres-besoins'")).rows[0].p;
    try {
      const { rows } = await pool.query("INSERT INTO categories(name, slug, position, sensitive) VALUES ($1,$2,$3,$4) RETURNING id, name, slug", [d.name, slug, pos, d.sensitive]);
      for (const f of d.families) await pool.query("INSERT INTO category_families(category_id, family_id, position) SELECT $1, id, 99 FROM families WHERE slug = $2", [rows[0].id, f]);
      await audit(req.user.id, "category.create", "category", rows[0].id, { name: d.name });
      res.status(201).json(rows[0]);
    } catch (e) { if (e.code === "23505") throw new HttpError(409, "Cette catégorie existe déjà.", "conflict"); throw e; }
  }));
  app.patch("/api/admin/categories/:id", adm, wrap(async (req, res) => {
    const d = parse(schemas.catPatch, req.body), id = idParam(req);
    const cur = (await pool.query("SELECT slug FROM categories WHERE id = $1", [id])).rows[0];
    if (!cur) throw new HttpError(404, "Introuvable.", "not_found");
    if (cur.slug === "autres-besoins" && (d.active === false || d.name)) throw new HttpError(400, "« Autres besoins » doit toujours rester accessible.", "validation");
    try {
      await pool.query("UPDATE categories SET name = COALESCE($1,name), slug = COALESCE($2,slug), active = COALESCE($3,active), sensitive = COALESCE($4,sensitive), position = COALESCE($5,position) WHERE id = $6",
        [d.name ?? null, d.name ? slugify(d.name) : null, d.active ?? null, d.sensitive ?? null, d.position ?? null, id]);
    } catch (e) { if (e.code === "23505") throw new HttpError(409, "Ce nom est déjà utilisé.", "conflict"); throw e; }
    await audit(req.user.id, "category.update", "category", id, d);
    res.json({ ok: true });
  }));
  app.post("/api/admin/categories/:id/subcategories", adm, wrap(async (req, res) => {
    const d = parse(schemas.subAdmin, req.body), id = idParam(req), slug = slugify(d.name);
    if (!slug) throw new HttpError(400, "Nom invalide.", "validation");
    if (!(await pool.query("SELECT 1 FROM categories WHERE id = $1", [id])).rowCount) throw new HttpError(404, "Introuvable.", "not_found");
    try {
      const { rows } = await pool.query("INSERT INTO subcategories(category_id, name, slug, position) SELECT $1, $2, $3, COALESCE(MAX(position),0)+1 FROM subcategories WHERE category_id = $1 RETURNING id, name, slug", [id, d.name, slug]);
      await audit(req.user.id, "subcategory.create", "category", id, { name: d.name });
      res.status(201).json(rows[0]);
    } catch (e) { if (e.code === "23505") throw new HttpError(409, "Cette sous-catégorie existe déjà.", "conflict"); throw e; }
  }));
  app.patch("/api/admin/subcategories/:id", adm, wrap(async (req, res) => {
    const d = parse(schemas.subPatch, req.body), id = idParam(req);
    try {
      const r = await pool.query("UPDATE subcategories SET name = COALESCE($1,name), slug = COALESCE($2,slug), active = COALESCE($3,active) WHERE id = $4", [d.name ?? null, d.name ? slugify(d.name) : null, d.active ?? null, id]);
      if (!r.rowCount) throw new HttpError(404, "Introuvable.", "not_found");
    } catch (e) { if (e.code === "23505") throw new HttpError(409, "Ce nom est déjà utilisé.", "conflict"); throw e; }
    await audit(req.user.id, "subcategory.update", "subcategory", id, d);
    res.json({ ok: true });
  }));
  app.get("/api/admin/audit", adm, wrap(async (req, res) => {
    res.json((await pool.query(`SELECT a.id, a.action, a.target_type, a.target_id, a.metadata, a.created_at, u.email AS actor
      FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.id DESC LIMIT 200`)).rows);
  }));

  app.use("/api", (req, res) => res.status(404).json({ error: "Introuvable.", code: "not_found" }));

  // ---------- front statique + repli SPA ----------
  app.use(express.static(publicDir, { index: false, maxAge: isProd ? "1h" : 0 }));
  app.get("*", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

  // ---------- erreurs ----------
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
    if (err.type === "entity.parse.failed" || err.type === "entity.too.large") return res.status(400).json({ error: "Requête invalide.", code: "bad_request" });
    console.error(err);
    res.status(500).json({ error: "Erreur interne.", code: "internal" });
  });
  return app;
}

// Tâches d'entretien : sessions expirées, besoins arrivés au terme de conservation, vérifications à renouveler (180 jours).
export async function maintenance(pool) {
  await pool.query("DELETE FROM sessions WHERE expires_at < NOW()");
  await pool.query("DELETE FROM needs WHERE retention_until < NOW()");
  await pool.query("UPDATE organizations SET verification_status = 'renewal_due' WHERE verification_status = 'verified' AND last_verified_at < NOW() - INTERVAL '180 days'");
}

export async function ensureAdmin(pool, env = process.env) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const exists = await pool.query("SELECT 1 FROM users WHERE lower(email) = $1", [email]);
  if (exists.rowCount) return;
  await pool.query("INSERT INTO users(email, password_hash, display_name, role) VALUES ($1,$2,'Administration','administrator')",
    [email, await bcrypt.hash(env.ADMIN_PASSWORD, Number(env.BCRYPT_COST || 12))]);
  console.log("compte administrateur initial créé");
}
