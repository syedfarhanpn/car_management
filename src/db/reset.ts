import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { sql } from "drizzle-orm";
import { getDb } from "./index";

/**
 * Drops and recreates the public schema.
 *
 * Done over SQL rather than by deleting the data directory, because the
 * database now runs as a socket server that holds that directory open — and
 * because this is the same operation that would work against Supabase.
 */
async function main() {
  const db = await getDb();
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`create schema public`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  console.log("Schema dropped. Run `npm run db:seed` to rebuild.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
