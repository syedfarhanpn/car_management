import { spawn } from "node:child_process";
import net from "node:net";

/**
 * One command starts both the database and the app, so `npm run dev` stays
 * the only thing anyone has to remember.
 *
 * If something is already listening on the PGlite port we leave it alone and
 * just start Next — that covers the case where the database is already running
 * in another terminal, and avoids a second process fighting for the data
 * directory.
 */
const PORT = Number(process.env.PGLITE_PORT ?? 5433);

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 800);
  });
}

const children = [];
function run(command, args, name) {
  const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) console.error(`${name} exited with code ${code}`);
    shutdown();
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const c of children) {
    if (!c.killed) c.kill();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (await portInUse(PORT)) {
  console.log(`Database already running on port ${PORT}.`);
} else {
  run("node", ["scripts/db-server.mjs"], "database");
  // Give PGlite a moment to bind before Next starts querying it.
  await new Promise((r) => setTimeout(r, 1500));
}

run("npx", ["next", "dev"], "next");
