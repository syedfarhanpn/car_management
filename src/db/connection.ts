/**
 * Decide whether a Postgres connection should negotiate TLS.
 *
 * Managed Postgres (Supabase, Neon, RDS) requires it. A local server — the
 * PGlite socket in dev, or a Postgres on the same machine — does not offer it
 * at all, and asking produces "The server does not support SSL connections"
 * rather than a graceful downgrade.
 *
 * Matching on the hostname rather than the literal string "localhost" is the
 * point: 127.0.0.1 and ::1 are just as local, and were the reason this failed
 * the first time.
 */
export function shouldUseSsl(connectionString: string): boolean {
  try {
    const url = new URL(connectionString);
    if (url.searchParams.get("sslmode") === "disable") return false;
    if (url.searchParams.get("sslmode") === "require") return true;

    const host = url.hostname.replace(/^\[|\]$/g, "");
    const local =
      host === "localhost" ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host.endsWith(".localhost") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host);

    return !local;
  } catch {
    // Not a parseable URL — assume a managed host and keep TLS on.
    return true;
  }
}

export function sslOption(connectionString: string) {
  return shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false;
}
