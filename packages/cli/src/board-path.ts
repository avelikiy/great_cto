// Board server resolution — extracted from main.ts so it is unit-testable
// (main.ts self-executes on import). See great_cto-hbu3.
import { existsSync as fsExistsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locate the board server.mjs. Order:
 *   1. dev layouts (running from a repo checkout)
 *   2. installed plugin cache — ANY marketplace under ~/.claude/plugins/cache,
 *      newest 5 versions each (not just the "local" marketplace)
 *   3. the copy bundled into the npm package by scripts/bundle-board.mjs —
 *      guaranteed fallback so a fresh `npm i -g great-cto` can run the board
 *      without the plugin installed
 */
export function findBoardServerPath(baseDir?: string, home?: string): string | undefined {
  const here = baseDir ?? dirname(fileURLToPath(import.meta.url));
  const candidates: string[] = [
    join(here, "..", "..", "board", "server.mjs"),  // packages/cli/dist (dev)
    join(here, "..", "board", "server.mjs"),         // alt dev layout
    join(here, "board", "server.mjs"),               // flat layout
  ];

  // Numeric semver sort — a plain .sort() is lexicographic and would rank
  // 2.99.0 above 2.100.0 (and once ranked 2.7.0 above 2.69.0).
  const byVer = (a: string, b: string) => {
    const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
    return (pb[0]! - pa[0]!) || (pb[1]! - pa[1]!) || (pb[2]! - pa[2]!) || 0;
  };

  const cacheRoot = join(home ?? homedir(), ".claude", "plugins", "cache");
  if (fsExistsSync(cacheRoot)) {
    try {
      for (const marketplace of readdirSync(cacheRoot)) {
        const pluginBase = join(cacheRoot, marketplace, "great_cto");
        if (!fsExistsSync(pluginBase)) continue;
        const versions = readdirSync(pluginBase).filter(v => /^\d/.test(v)).sort(byVer);
        for (const v of versions.slice(0, 5)) {
          candidates.push(join(pluginBase, v, "packages", "board", "server.mjs"));
        }
      }
    } catch { /* ignore */ }
  }

  // bundled copy (dist → ../board/packages/board/server.mjs)
  candidates.push(join(here, "..", "board", "packages", "board", "server.mjs"));

  return candidates.find(fsExistsSync);
}
