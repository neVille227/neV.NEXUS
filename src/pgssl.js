// Configuration TLS PostgreSQL : le certificat du serveur est VALIDÉ par défaut.
//  PGSSL=true                       -> TLS activé avec validation du certificat
//  PGSSL_CA="-----BEGIN CERT..."    -> autorité de certification personnalisée (optionnel)
//  PGSSL_REJECT_UNAUTHORIZED=false  -> dérogation explicite et journalisée (déconseillée)
export function pgSsl(env = process.env) {
  if (env.PGSSL !== "true") return undefined;
  const ssl = { rejectUnauthorized: env.PGSSL_REJECT_UNAUTHORIZED !== "false" };
  if (!ssl.rejectUnauthorized) console.warn("[sécurité] Validation du certificat PostgreSQL DÉSACTIVÉE (PGSSL_REJECT_UNAUTHORIZED=false).");
  if (env.PGSSL_CA) ssl.ca = env.PGSSL_CA;
  return ssl;
}
