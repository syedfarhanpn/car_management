import { rmSync, existsSync } from "node:fs";

const dir = process.env.PGLITE_DATA_DIR ?? "./.pgdata";
if (existsSync(dir)) {
  rmSync(dir, { recursive: true, force: true });
  console.log(`Removed ${dir}. Run \`npm run db:seed\` to rebuild.`);
} else {
  console.log(`Nothing to remove at ${dir}.`);
}
