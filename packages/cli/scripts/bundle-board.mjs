#!/usr/bin/env node
// Bundle the board server into the npm package (runs on `npm pack` / `npm publish`
// via the "prepack" script). Without this, `npx great-cto board` only works when
// the great_cto plugin happens to be in ~/.claude/plugins/cache — a fresh npm
// install had no board at all (great_cto-hbu3).
//
// The bundle mirrors the repo-root layout under packages/cli/board/ because the
// board resolves its imports relative to that structure:
//   packages/board/lib/projects.mjs → ../../../scripts/lib/gate-plan.mjs
//   scripts/lib/gate-plan.mjs       → ../../packages/cli/dist/archetypes.js
//   packages/board/lib/config.mjs   → ../../../.claude-plugin/plugin.json (version badge)
import { cpSync, mkdirSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // packages/cli/scripts
const cliRoot = join(here, "..");                     // packages/cli
const repoRoot = join(cliRoot, "..", "..");           // repo root
const out = join(cliRoot, "board");

const boardSrc = join(repoRoot, "packages", "board");
if (!existsSync(join(boardSrc, "server.mjs"))) {
  // Packing from a published tarball (no repo around) — keep whatever is there.
  if (existsSync(join(out, "packages", "board", "server.mjs"))) {
    console.log("bundle-board: repo sources absent, keeping existing bundle");
    process.exit(0);
  }
  console.error("bundle-board: packages/board/server.mjs not found — run from the repo");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });

// board runtime (skip tests, the cloudflare worker, and stray tarballs)
const skip = /(\.test\.mjs$|cloudflare-worker|\.tgz$)/;
cpSync(boardSrc, join(out, "packages", "board"), {
  recursive: true,
  filter: (src) => !skip.test(src),
});

// shared scripts the board imports at runtime
mkdirSync(join(out, "scripts", "lib"), { recursive: true });
for (const f of ["gate-plan.mjs", "change-tier.mjs", "judge-model.mjs"]) {
  copyFileSync(join(repoRoot, "scripts", "lib", f), join(out, "scripts", "lib", f));
}

// gate-plan.mjs → ../../packages/cli/dist/archetypes.js
mkdirSync(join(out, "packages", "cli", "dist"), { recursive: true });
copyFileSync(
  join(cliRoot, "dist", "archetypes.js"),
  join(out, "packages", "cli", "dist", "archetypes.js"),
);

// version badge source for the board UI
mkdirSync(join(out, ".claude-plugin"), { recursive: true });
copyFileSync(
  join(repoRoot, ".claude-plugin", "plugin.json"),
  join(out, ".claude-plugin", "plugin.json"),
);

console.log("bundle-board: board bundled into packages/cli/board/");
