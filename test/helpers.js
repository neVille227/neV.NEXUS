import http from "node:http";
import pg from "pg";
import { migrate } from "../scripts/migrate.js";
import { createApp } from "../src/app.js";

export const DB = process.env.TEST_DATABASE_URL || "postgres://pguser@localhost:5433/nevnexus_test?host=/tmp";

export async function setup(env = {}) {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL || undefined, host: process.env.TEST_DATABASE_URL ? undefined : "/tmp", port: 5433, user: "pguser", database: "nevnexus_test" });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
  const app = createApp({ pool, env: { REGISTRATION_MODE: "invite", INVITE_CODE: "code-test", BCRYPT_COST: "4", DISABLE_RATE_LIMIT: "true", ...env } });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = async () => { await new Promise((r) => server.close(r)); await pool.end(); };
  return { pool, base, close, client: (b = base) => client(b) };
}

export function client(base) {
  let cookie = "";
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method, redirect: "manual",
      headers: { "content-type": "application/json", "x-requested-with": "nevnexus", ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) { const kv = c.split(";")[0]; cookie = kv.endsWith("=") ? "" : kv; }
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json, headers: res.headers, set };
  };
  return { get: (u) => call("GET", u), post: (u, b, h) => call("POST", u, b ?? {}, h), patch: (u, b) => call("PATCH", u, b ?? {}), del: (u, b) => call("DELETE", u, b), raw: call };
}

export const reg = (c, email, extra = {}) => c.post("/api/auth/register", { email, password: "motdepasse-solide-1", displayName: "Test User", acceptTerms: true, inviteCode: "code-test", ...extra });
