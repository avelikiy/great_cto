#!/usr/bin/env node
/**
 * great-cto postinstall — says when the plugin is now older than the CLI.
 *
 * THE PROBLEM
 * -----------
 * great-cto ships as two things on purpose: an npm package (the `great-cto`
 * command) and a Claude Code plugin (agents, skills, commands, the board). They
 * update through different channels — `npm i -g great-cto` moves one of them and
 * nothing at all moves the other.
 *
 * So a user upgrades, sees a new version number, and runs a pipeline whose
 * agents are three releases behind. Nothing errors. The board opened, the agents
 * ran, the verdicts were written — by the old code. That is this project's
 * governing defect in its own installer: a thing that did not happen looking
 * exactly like a thing that did.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * It does not update the plugin. An npm lifecycle hook writing into
 * ~/.claude/plugins/ would reach across a project boundary into global state
 * that every other project's agents read, from a script the user never chose to
 * run — the ADR-009 case that wants a human decision, not a silent one. `npm i`
 * is not consent to rewrite the agent definitions of every project on the
 * machine.
 *
 * So it detects and it tells. The user runs one command, or does not.
 *
 * IT ALSO MUST NOT BREAK AN INSTALL
 * ---------------------------------
 * A postinstall hook that throws fails `npm i`. Every path here is wrapped, the
 * exit code is always 0, and every unknown answers "say nothing": no plugin
 * directory is a perfectly good CLI-only install, and an unreadable one is not
 * evidence of staleness.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/** Numeric semver compare. Returns >0 when a is newer. Non-numeric parts sort last. */
export function cmpVersion(a, b) {
  const parse = (v) => String(v).split('.').map((n) => (/^\d+$/.test(n) ? Number(n) : -1));
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Newest great_cto version across EVERY marketplace, not just `local`.
 *
 * Same reasoning as board-path: a user who installed the plugin from a
 * marketplace of their own is not running a broken setup, and looking in one
 * hard-coded directory would report them as having no plugin at all.
 */
export function newestPluginVersion(cacheRoot) {
  let best = null;
  let dirs;
  try { dirs = readdirSync(cacheRoot); } catch { return null; }
  for (const marketplace of dirs) {
    const base = join(cacheRoot, marketplace, 'great_cto');
    let versions;
    try { versions = readdirSync(base); } catch { continue; }
    for (const v of versions) {
      if (!/^\d/.test(v)) continue;
      if (best === null || cmpVersion(v, best) > 0) best = v;
    }
  }
  return best;
}

/**
 * @returns {{state: 'stale'|'current'|'no-plugin', cli: string, plugin: string|null}}
 *
 * Three states, and `no-plugin` is not a problem to report. Someone who wants
 * only the CLI has a correct installation, and telling them to update a plugin
 * they never installed is the false alarm that teaches people to ignore output.
 */
export function compare({ cli, plugin }) {
  if (!plugin) return { state: 'no-plugin', cli, plugin: null };
  return { state: cmpVersion(cli, plugin) > 0 ? 'stale' : 'current', cli, plugin };
}

export function message({ cli, plugin }) {
  return [
    '',
    `  great-cto ${cli} is installed, but the Claude Code plugin is still ${plugin}.`,
    '',
    '  They update separately. Until the plugin is updated, your agents, skills',
    '  and commands are the ones from ' + plugin + ' — pipelines will run, and they',
    '  will run the old definitions.',
    '',
    '  In Claude Code:  /plugin update great_cto',
    '',
  ].join('\n');
}

function main() {
  // CI installs nobody reads, and a notice there is noise in a build log.
  if (process.env.CI || process.env.GREAT_CTO_QUIET_POSTINSTALL) return;

  let cli;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    cli = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
  } catch { return; }
  if (!cli) return;

  const cacheRoot = join(homedir(), '.claude', 'plugins', 'cache');
  if (!existsSync(cacheRoot)) return;   // not a Claude Code machine — nothing to say

  const r = compare({ cli, plugin: newestPluginVersion(cacheRoot) });
  if (r.state === 'stale') process.stdout.write(message(r) + '\n');

  ensureBoard();
}

/**
 * Bring the board up, because an admin panel you have to remember to start is one
 * you find down.
 *
 * ADR-007 accepted "board always-on" in v2.86.0 and shipped `great-cto board
 * ensure` — an idempotent health gate that starts the board only if nothing is
 * answering. Nothing ever called it from an install. The decision existed, the
 * mechanism existed, and the two were never connected, so every upgrade left the
 * panel down until somebody typed the command.
 *
 * Four rules this obeys, because a postinstall hook that breaks an install is
 * worse than one that does nothing:
 *
 *   - never fail. `npm install` must succeed even if this cannot run at all.
 *   - never block. The board takes the better part of a minute to become
 *     responsive; the installer does not wait for it. Detached, unref'd, output
 *     discarded.
 *   - never in CI, and never when asked not to. Both already guard the notice
 *     above; `GREAT_CTO_NO_BOARD=1` opts out of this specifically.
 *   - never twice. `ensure` probes the port first and adopts a board that is
 *     already answering, whoever started it.
 */
function ensureBoard() {
  if (process.env.GREAT_CTO_NO_BOARD) return;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const entry = join(here, 'index.mjs');
    if (!existsSync(entry)) return;

    const child = spawn(process.execPath, [entry, 'board', 'ensure'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    process.stdout.write('  great-cto: starting the board — http://localhost:3141\n');
  } catch (e) {
    // Never fail the install — but never fail SILENTLY either. The first version
    // of this function referenced an import that was not there; the catch ate the
    // ReferenceError and the hook printed nothing, so the board simply did not
    // start and nothing said why. A swallowed error is the defect this project
    // spends most of its checks on.
    process.stdout.write(`  great-cto: could not start the board — ${e?.message || e}\n`);
    process.stdout.write('  Start it yourself with: great-cto board\n');
  }
}

// Only when run as the hook, so the pure parts above stay importable by tests.
if (process.argv[1] && process.argv[1].endsWith('postinstall.mjs')) {
  try { main(); } catch { /* an installer must never fail the install */ }
}
