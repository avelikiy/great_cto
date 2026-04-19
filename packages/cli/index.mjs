#!/usr/bin/env node
// Entry point: loads the compiled dist/main.js.
// For local dev, run: `npm run build` first, then `node index.mjs`.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compiled = join(__dirname, "dist", "main.js");

if (!existsSync(compiled)) {
  console.error("great-cto: dist/main.js not found. Run `npm run build` first.");
  console.error("If you installed via npm, please report this at https://github.com/avelikiy/great_cto/issues");
  process.exit(1);
}

await import(compiled);
