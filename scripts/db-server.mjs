import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

/**
 * PGlite behind a Postgres socket.
 *
 * PGlite is a single embedded database with one writer. That is fine for a
 * script, but Next.js dev runs server code across several workers and each one
 * tried to open the same data directory — which ends in a WASM abort, not a
 * clean error.
 *
 * Running it as a socket server fixes the shape of the problem rather than
 * papering over it: ONE process owns the database, and everything else talks
 * to it over the normal Postgres wire protocol through node-postgres. Local
 * dev then uses exactly the same driver and connection code as production
 * against Supabase, so there is no dev-only path left to surprise us.
 */
const DATA_DIR = process.env.PGLITE_DATA_DIR ?? "./.pgdata";
const PORT = Number(process.env.PGLITE_PORT ?? 5433);

const db = await PGlite.create(DATA_DIR);
const server = new PGLiteSocketServer({
  db,
  port: PORT,
  host: "127.0.0.1",
  /**
   * Defaults to 1, which silently drops every connection a node-postgres pool
   * opens beyond the first — surfacing as "Connection terminated unexpectedly"
   * on the very first query. The server still runs one query at a time
   * internally; this only governs how many idle sockets it will hold.
   */
  maxConnections: 20,
});

await server.start();
console.log(`PGlite listening on postgres://postgres@127.0.0.1:${PORT}  (data: ${DATA_DIR})`);

async function shutdown() {
  await server.stop();
  await db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
