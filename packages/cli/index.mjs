#!/usr/bin/env node
// Entry point: loads the compiled dist/main.js.
// For local dev, run: `npm run build` first, then `node index.mjs`.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compiled = join(__dirname, "dist", "main.js");

if (!existsSync(compiled)) {
  console.error("great-cto: dist/main.js not found. Run `npm run build` first.");
  console.error("If you installed via npm, please report this at https://github.com/avelikiy/great_cto/issues");
  process.exit(1);
}

// Convert path to file:// URL — required by Node's ESM loader on Windows
// (absolute paths like "D:\\..." are not accepted as bare strings).
// Works equivalently on macOS / Linux.
await import(pathToFileURL(compiled).href);
