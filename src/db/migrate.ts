import "dotenv/config";
import { config } from "dotenv";
import { sslOption } from "./connection";
import { resolveDbDriver, requireDatabaseUrl } from "@/lib/env";

config({ path: ".env.local", override: true });

/**
 * Applies ./drizzle/*.sql against whichever driver is configured.
 * Safe to run repeatedly — Drizzle tracks which migrations have run.
 *
 * To set up a production database, point DATABASE_URL at it and run
 * `npm run db:deploy` from your own machine. Migrations are deliberately not
 * part of the build: a build that can't reach the database should fail loudly
 * as a migration step you ran, not silently ship a deploy against a schema
 * that was never created.
 */
export async function runMigrations() {
  const driver = resolveDbDriver();

  if (driver === "postgres") {
    const url = requireDatabaseUrl();
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      ssl: sslOption(url),
      max: 1,
    });
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await pool.end();
    return;
  }

  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(process.env.PGLITE_DATA_DIR ?? "./.pgdata");
  await client.waitReady;
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await client.close();
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("src/db/migrate.ts");
if (isDirectRun) {
  runMigrations()
    .then(() => {
      console.log("Migrations applied.");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
