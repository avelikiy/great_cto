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
import { cpSync, mkdirSync, rmSync, existsSync, copyFileSync, readdirSync, readFileSync } from "node:fs";
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

// shared scripts the board imports at runtime — DERIVED, not hand-listed.
//
// This was a hand-maintained array of four filenames, and the board had grown to
// import six. `system-map.mjs` and `pipeline-wake.mjs` were never copied, so in
// the published package the Docs system map and the record that binds a gate
// approval to pipeline state both failed with "Cannot find module" — the second
// one silently, because that call is best-effort by design and reports its error
// into a JSON field nobody reads.
//
// It worked in the repo and not in the thing users install, which is the worst
// place for a difference to live. A list you have to remember to update is a list
// that will be wrong again, so the list is now read out of the source: every
// `../../../scripts/lib/X.mjs` the board mentions, static import or dynamic.
const boardFiles = [];
(function walkBoard(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules/.test(p)) walkBoard(p); continue; }
    if (/\.mjs$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) boardFiles.push(p);
  }
})(boardSrc);

const needed = new Set();
for (const f of boardFiles) {
  for (const m of readFileSync(f, "utf8").matchAll(/scripts\/lib\/([\w.-]+\.mjs)/g)) needed.add(m[1]);
}

// Then their own siblings, to a fixpoint.
//
// The direct scan alone was WRONG and would have shipped a broken bundle:
// `gate-plan.mjs` imports `./change-tier.mjs` and `./judge-model.mjs`, which the
// board never names itself. Dropping them for being unmentioned would have
// replaced two missing files with two different missing files — a fix that moves
// the defect rather than removing it.
for (let grew = true; grew; ) {
  grew = false;
  for (const f of [...needed]) {
    const src = join(repoRoot, "scripts", "lib", f);
    if (!existsSync(src)) continue;
    for (const m of readFileSync(src, "utf8").matchAll(/from\s+['"]\.\/([\w.-]+\.mjs)['"]|import\(\s*['"]\.\/([\w.-]+\.mjs)['"]/g)) {
      const dep = m[1] || m[2];
      if (dep && !needed.has(dep)) { needed.add(dep); grew = true; }
    }
  }
}

mkdirSync(join(out, "scripts", "lib"), { recursive: true });
const missing = [];
for (const f of [...needed].sort()) {
  const src = join(repoRoot, "scripts", "lib", f);
  if (!existsSync(src)) { missing.push(f); continue; }
  copyFileSync(src, join(out, "scripts", "lib", f));
}
// Loud, not best-effort. Shipping a bundle whose imports cannot resolve is the
// failure this block exists to prevent, so it must not be possible to do it
// quietly.
if (missing.length) {
  console.error(`bundle-board: the board imports scripts/lib files that do not exist: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`bundle-board: copied ${needed.size - missing.length} shared script(s): ${[...needed].sort().join(", ")}`);

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
