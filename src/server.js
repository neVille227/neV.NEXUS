import pg from "pg";
import { createApp, maintenance, ensureAdmin } from "./app.js";
import { pgSsl } from "./pgssl.js";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL manquant");
  process.exit(1);
}
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: pgSsl(),
  max: 10,
});
pool.on("error", (e) => console.error("pool", e.message));

await ensureAdmin(pool);
await maintenance(pool).catch((e) => console.error("maintenance", e.message));
setInterval(() => maintenance(pool).catch((e) => console.error("maintenance", e.message)), 6 * 3600_000).unref();

const port = Number(process.env.PORT || 3000);
createApp({ pool }).listen(port, () => console.log(`LIFE DIGITAL en écoute sur le port ${port}`));
