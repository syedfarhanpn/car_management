/**
 * Environment checks, with errors that say what to do.
 *
 * A missing variable used to surface as a generic 500 — "A server error
 * occurred" — which tells whoever deployed it nothing. Every throw here names
 * the variable, where to set it, and what a valid value looks like.
 */

/** Vercel, Lambda and similar: many short-lived processes, read-only disk. */
export function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.NETLIFY ||
      process.env.CF_PAGES,
  );
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || isServerless();
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Which database driver to use.
 *
 * Defaults to `pglite` locally and `postgres` in production. The old default
 * was `pglite` everywhere, which on a serverless host meant trying to create
 * an embedded database file on a read-only filesystem — a crash on the first
 * request of every deploy, with nothing in the message to explain it.
 */
export function resolveDbDriver(): "pglite" | "postgres" {
  const explicit = process.env.DB_DRIVER;

  if (explicit === "pglite") {
    if (isServerless()) {
      throw new ConfigError(
        "DB_DRIVER=pglite cannot run on a serverless host — PGlite writes an embedded " +
          "database to disk, and the filesystem here is read-only and not shared between " +
          "invocations.\n\n" +
          "Set these in your hosting provider's environment variables:\n" +
          "  DB_DRIVER=postgres\n" +
          "  DATABASE_URL=postgres://...   (Supabase, Neon or any hosted Postgres)",
      );
    }
    return "pglite";
  }

  if (explicit === "postgres") return "postgres";
  if (explicit) {
    throw new ConfigError(`DB_DRIVER must be "postgres" or "pglite", got "${explicit}"`);
  }

  return isProduction() ? "postgres" : "pglite";
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new ConfigError(
      "DATABASE_URL is not set.\n\n" +
        (isServerless()
          ? "Add it in your hosting provider's environment variables, then redeploy.\n" +
            "With Supabase, use the CONNECTION POOLER string (port 6543), not the direct\n" +
            "connection — a serverless host opens far more connections than the direct\n" +
            "limit allows.\n\n"
          : "Add it to .env.local.\n\n") +
        "  DATABASE_URL=postgres://user:password@host:6543/postgres",
    );
  }

  if (!/^postgres(ql)?:\/\//.test(url)) {
    throw new ConfigError(
      `DATABASE_URL must start with postgres:// or postgresql:// — got "${url.slice(0, 24)}…"`,
    );
  }

  return url;
}

export function requireAuthSecret(): Uint8Array {
  const value = process.env.AUTH_SECRET;

  if (!value) {
    throw new ConfigError(
      "AUTH_SECRET is not set — sessions cannot be signed without it.\n\n" +
        "Generate one:\n" +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n\n' +
        (isServerless()
          ? "Then add it to your hosting provider's environment variables and redeploy."
          : "Then add it to .env.local as AUTH_SECRET=<the value>."),
    );
  }

  // A short secret makes the session token forgeable, which is worth refusing
  // to start over rather than quietly accepting.
  if (value.length < 32) {
    throw new ConfigError(
      `AUTH_SECRET is only ${value.length} characters. Use at least 32 — ` +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }

  if (isProduction() && value.startsWith("dev_only_change_me")) {
    throw new ConfigError(
      "AUTH_SECRET is still the development placeholder. Generate a real one before " +
        "running in production — anyone with the repo can forge a login session otherwise.",
    );
  }

  return new TextEncoder().encode(value);
}

/**
 * Connection pool size.
 *
 * On a serverless host every concurrent invocation is its own process with its
 * own pool, so a pool of 10 becomes 10 x however many functions are warm and
 * exhausts the database's connection limit under mild load. One connection per
 * invocation, through a pooler, is the shape that actually survives.
 */
export function resolvePoolMax(): number {
  const explicit = process.env.DB_POOL_MAX;
  if (explicit) {
    const n = Number(explicit);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return isServerless() ? 1 : 10;
}
