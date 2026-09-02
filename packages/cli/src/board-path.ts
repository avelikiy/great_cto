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
 *
 * WITH ONE CORRECTION TO THAT ORDER, and it is why this comment is long.
 *
 * The plugin cache used to win unconditionally. So `npm i -g great-cto@NEW`
 * installed a new CLI carrying a new bundled board, and `great-cto board` then
 * launched the OLD board out of the plugin cache — because a plugin directory
 * existed and came first in the list. The operator upgraded, the CLI reported
 * the new version, and the screen kept serving the old one. Nothing said so.
 *
 * The list is still the list; what changed is that a STALE plugin no longer
 * beats the bundle. When the newest installed plugin is OLDER than the running
 * CLI, the bundled board — which ships inside that CLI and is therefore exactly
 * as new as it is — wins. An equal or newer plugin still wins, because a plugin
 * install is the richer one: it carries agents, skills and commands the npm
 * package does not.
 *
 * @param cliVersion the running CLI's version. Omitted → previous behaviour, so
 *   a caller that cannot determine it never gets a silently different answer.
 */
export function findBoardServerPath(baseDir?: string, home?: string, cliVersion?: string): string | undefined {
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

  const pluginCandidates: string[] = [];
  let newestPlugin: string | null = null;
  const cacheRoot = join(home ?? homedir(), ".claude", "plugins", "cache");
  if (fsExistsSync(cacheRoot)) {
    try {
      for (const marketplace of readdirSync(cacheRoot)) {
        // Two directory names, because there are two installers. `npx great-cto`
        // writes great_cto/; a marketplace install uses the plugin manifest's
        // name, which is kebab-case (the Claude.ai marketplace requires it). A
        // machine can hold either or both, so neither may be assumed.
        for (const dirName of ["great_cto", "great-cto"]) {
          const pluginBase = join(cacheRoot, marketplace, dirName);
          if (!fsExistsSync(pluginBase)) continue;
          const versions = readdirSync(pluginBase).filter(v => /^\d/.test(v)).sort(byVer);
          for (const v of versions.slice(0, 5)) {
            pluginCandidates.push(join(pluginBase, v, "packages", "board", "server.mjs"));
          }
          if (versions[0] && (!newestPlugin || byVer(versions[0], newestPlugin) < 0)) newestPlugin = versions[0];
        }
      }
    } catch { /* ignore */ }
  }

  // bundled copy (dist → ../board/packages/board/server.mjs)
  const bundled = join(here, "..", "board", "packages", "board", "server.mjs");

  // A plugin OLDER than the running CLI does not get to answer for it.
  const pluginIsStale = !!(cliVersion && newestPlugin && byVer(newestPlugin, cliVersion) > 0);
  if (pluginIsStale) candidates.push(bundled, ...pluginCandidates);
  else candidates.push(...pluginCandidates, bundled);

  return candidates.find(fsExistsSync);
}
