import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local", override: true });

/**
 * Applies ./drizzle/*.sql against whichever driver DB_DRIVER selects.
 * Safe to run repeatedly - Drizzle tracks which migrations have run.
 */
export async function runMigrations() {
  const driver = process.env.DB_DRIVER ?? "pglite";

  if (driver === "postgres") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DB_DRIVER=postgres requires DATABASE_URL");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      ssl: url.includes("localhost") ? false : { rejectUnauthorized: false },
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
      console.error(err);
      process.exit(1);
    });
}
