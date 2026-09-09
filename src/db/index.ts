import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { sslOption } from "./connection";

export * as schema from "./schema";

/**
 * ONE SCHEMA, TWO DRIVERS.
 *
 *   DB_DRIVER=pglite    embedded Postgres (WASM), data in ./.pgdata
 *                       Zero install. This is what makes the demo runnable on
 *                       any machine without Docker or a Postgres service.
 *
 *   DB_DRIVER=postgres  real Postgres / Supabase via DATABASE_URL.
 *
 * PGlite is genuine Postgres, not a shim, so the schema, constraints, enums
 * and transactions all behave identically. Moving to Supabase is a change to
 * two environment variables, not a rewrite.
 *
 * Both drivers expose the same Drizzle query API, so the app code below never
 * knows or cares which one is active.
 */
export type DB = PgliteDatabase<typeof schema>;

declare global {
  // Survives Next.js hot reload. Without this, every edit in dev opens a new
  // PGlite instance against the same data directory and they fight over the lock.
  // eslint-disable-next-line no-var
  var __pitstopDb: Promise<DB> | undefined;
}

const DATA_DIR = process.env.PGLITE_DATA_DIR ?? "./.pgdata";

async function createDb(): Promise<DB> {
  const driver = process.env.DB_DRIVER ?? "pglite";

  if (driver === "postgres") {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DB_DRIVER=postgres requires DATABASE_URL to be set in .env.local");
    }
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      // Supabase and most managed Postgres require TLS; a local socket has none.
      ssl: sslOption(url),
      // Kept below the dev socket server's connection limit, and comfortably
      // under Supabase's pooler limit on small plans.
      max: Number(process.env.DB_POOL_MAX ?? 10),
    });
    return drizzle(pool, { schema }) as unknown as DB;
  }

  const { drizzle } = await import("drizzle-orm/pglite");
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(DATA_DIR);
  await client.waitReady;
  return drizzle(serialize(client), { schema });
}

/**
 * PGlite is a SINGLE embedded Postgres connection, and it is not safe to have
 * two queries in flight on it at once. A Next.js request easily does that on
 * its own - the layout, the page and a server action can all query in parallel
 * - and the symptom is ugly: a query intermittently returns nothing, so the
 * session lookup fails and the user gets bounced to the login screen at random.
 *
 * This funnels every call through one promise chain. `depth` lets calls made
 * from inside a transaction bypass the queue, since the transaction already
 * holds it - without that, the first statement inside a transaction would wait
 * forever on a lock its own caller is holding.
 *
 * Only PGlite needs this. The node-postgres path uses a real connection pool
 * and this wrapper is never applied to it.
 */
function serialize<T extends object>(client: T): T {
  let chain: Promise<unknown> = Promise.resolve();
  let depth = 0;

  const enqueue = <R>(fn: () => Promise<R>): Promise<R> => {
    if (depth > 0) return fn();
    const result = chain.then(fn, fn);
    chain = result.catch(() => undefined);
    return result;
  };

  const c = client as Record<string, unknown>;
  for (const method of ["query", "exec"]) {
    const original = c[method];
    if (typeof original !== "function") continue;
    const bound = (original as (...a: unknown[]) => Promise<unknown>).bind(client);
    c[method] = (...args: unknown[]) => enqueue(() => bound(...args));
  }

  const originalTx = c.transaction;
  if (typeof originalTx === "function") {
    const boundTx = (originalTx as (...a: unknown[]) => Promise<unknown>).bind(client);
    c.transaction = (...args: unknown[]) =>
      enqueue(async () => {
        depth += 1;
        try {
          return await boundTx(...args);
        } finally {
          depth -= 1;
        }
      });
  }

  return client;
}

export function getDb(): Promise<DB> {
  if (!globalThis.__pitstopDb) {
    globalThis.__pitstopDb = createDb();
  }
  return globalThis.__pitstopDb;
}
