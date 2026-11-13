#!/usr/bin/env node
/**
 * generate-plugin-hooks.mjs - writes the PLUGIN_DIR resolution into the hook commands of
 * .claude-plugin/plugin.json, so thirty-odd strings are never edited by hand.
 *
 * ADR-050 decision 7 / ARCH-plugin-activation Q5. Every hook used to begin with
 *
 *   PLUGIN_DIR=${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/ * /great_cto/ * / | ... | tail -1)}
 *
 * the highest version in any marketplace cache, which can be bytes the host pulled from a mutable
 * branch. The generated form asks the host (CLAUDE_PLUGIN_ROOT), then the admitted registration, and
 * hands the decision to scripts/lib/plugin-dir.sh, which refuses rather than guesses.
 *
 * To add a hook that needs the plugin directory, write `PLUGIN_DIR=@@PLUGIN_DIR@@` in its command and
 * run this script. The old cache-glob form is recognised once, so the migration is re-runnable.
 * Any other `PLUGIN_DIR=` assignment in a hook is refused: a form this script does not recognise
 * would otherwise keep whatever glob it carried and look generated.
 *
 * Usage:
 *   node scripts/generate-plugin-hooks.mjs                  # rewrite the manifest
 *   node scripts/generate-plugin-hooks.mjs --check          # exit 1 if it is not the generator's output
 *   node scripts/generate-plugin-hooks.mjs --manifest FILE  # another manifest (tests)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './lib/is-main.mjs';

export const TOKEN = '@@PLUGIN_DIR@@';

// The registration lookup used when the host did not set CLAUDE_PLUGIN_ROOT. It only LOCATES the
// resolver: it prints the registered path when that is a version directory directly under the
// admitted cache root, and nothing otherwise, so a path outside it is never executed. The resolver
// then validates again; this is not a second implementation of its rules. No quote characters other
// than double quotes, because the snippet sits inside single quotes in the shell.
// Deliberately the local marketplace's cache directory: it is where `great-cto init` publishes the
// admitted copy, and the only cache the registration may point into.
const LOCATOR = 'try{const h=require("os").homedir(),a=require("path"),r=a.join(h,".claude/plugins/cache/local/great_cto"),'
  + 'e=require(a.join(h,".claude/plugins/installed_plugins.json")).plugins["great_cto@local"].filter(x=>x.scope==="user"),'
  + 'p=e.length===1?e[0].installPath:"";a.dirname(p)===r&&!/^\\.\\.?$/.test(a.basename(p))?p:""}catch{""}';

/** What every generated hook starts with. `$_r` is the directory the resolver runs from. */
export const BOOTSTRAP = 'PLUGIN_DIR=$(_r="${CLAUDE_PLUGIN_ROOT:-$(node -p \'' + LOCATOR + '\' 2>/dev/null)}"; '
  + '[ -n "$_r" ] && bash "$_r/scripts/lib/plugin-dir.sh" 2>/dev/null)';

// The form being replaced, in both quotings of its last sed. Plain strings: the `${` is shell.
const EVERY_CACHE = '~/.claude/plugins/cache/*/great_cto/*/';
const AWK = 'awk -F\'/plugins/cache/\' \'{split($NF,p,"/"); print p[3], $0}\' | sort -V | tail -1 | cut -d\' \' -f2-';
const legacy = (q) => 'PLUGIN_DIR=${CLAUDE_PLUGIN_ROOT:-$(ls -d ' + EVERY_CACHE + ' 2>/dev/null | '
  + AWK + ' | sed ' + q + 's|/$||' + q + ')}';
const REPLACED = [legacy("'"), legacy('"'), 'PLUGIN_DIR=' + TOKEN];

/** A `PLUGIN_DIR=` assignment that is still there once every generated one is taken out. */
const STRAY = /(^|[^A-Za-z0-9_])PLUGIN_DIR=/;

/** @param {string} command one hook command */
export function expandHookCommand(command) {
  let out = command;
  for (const form of REPLACED) out = out.split(form).join(BOOTSTRAP);
  if (STRAY.test(out.split(BOOTSTRAP).join(''))) {
    throw new Error('a PLUGIN_DIR assignment of a form this generator does not know: write PLUGIN_DIR=' + TOKEN
      + ' and run scripts/generate-plugin-hooks.mjs. Command starts: ' + command.slice(0, 100));
  }
  // The assignment's status is now the resolver's, so only a plain `;` may follow it: a `&&` chain
  // would start short-circuiting where the old assignment always succeeded.
  for (let at = out.indexOf(BOOTSTRAP); at >= 0; at = out.indexOf(BOOTSTRAP, at + BOOTSTRAP.length)) {
    if (!/^\s*;/.test(out.slice(at + BOOTSTRAP.length))) {
      throw new Error('PLUGIN_DIR must be followed by `;`, not chained. Command starts: ' + command.slice(0, 100));
    }
  }
  return out;
}

const escapeNonAscii = (json) => json.replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
/** The manifest as the file already writes it: two-space indent, non-ASCII as \uXXXX, final newline. */
const serialize = (manifest) => escapeNonAscii(JSON.stringify(manifest, null, 2)) + '\n';

/** Every hook command with where it sits, e.g. `hooks.SessionStart[0].hooks[2]`. */
function* hookCommands(manifest) {
  for (const [event, groups] of Object.entries(manifest.hooks ?? {})) {
    for (const [g, group] of (groups ?? []).entries()) {
      for (const [h, hook] of (group.hooks ?? []).entries()) {
        if (typeof hook.command === 'string') yield { where: `hooks.${event}[${g}].hooks[${h}]`, hook };
      }
    }
  }
}

/** @param {string} text the manifest */
export function generateManifestText(text) {
  const manifest = JSON.parse(text);
  for (const { hook } of hookCommands(manifest)) hook.command = expandHookCommand(hook.command);
  return serialize(manifest);
}

/** What is wrong with a manifest, as a list of sentences; empty when it is exactly the generator's output. */
export function checkManifestText(text) {
  let manifest;
  try { manifest = JSON.parse(text); } catch { return ['plugin.json is not valid JSON']; }
  const problems = [];
  for (const { where, hook } of hookCommands(manifest)) {
    const command = hook.command;
    if (command.includes(TOKEN)) problems.push(`${where}: the ${TOKEN} token was not expanded; run scripts/generate-plugin-hooks.mjs`);
    if (STRAY.test(command.split(BOOTSTRAP).join(''))) problems.push(`${where}: PLUGIN_DIR is resolved by hand; it must come from the generator`);
    if (/ls -d [^;|]*plugins\/cache\/\*/.test(command)) problems.push(`${where}: lists the plugin cache (PLUGIN_DIR must come from the generator)`);
  }
  try {
    if (generateManifestText(text) !== text) problems.push('plugin.json differs from the generator\'s output: run node scripts/generate-plugin-hooks.mjs');
  } catch (error) { problems.push(error.message); }
  return problems;
}

function main(argv) {
  const check = argv.includes('--check');
  const at = argv.indexOf('--manifest');
  const file = at >= 0 ? path.resolve(argv[at + 1] ?? '') : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.claude-plugin', 'plugin.json');
  const text = fs.readFileSync(file, 'utf8');
  if (check) {
    const problems = checkManifestText(text);
    for (const problem of problems) process.stderr.write(`generate-plugin-hooks: ${file}: ${problem}\n`);
    return problems.length ? 1 : 0;
  }
  const next = generateManifestText(text);
  if (next === text) { process.stdout.write(`generate-plugin-hooks: ${file} is already generated\n`); return 0; }
  fs.writeFileSync(file, next);
  process.stdout.write(`generate-plugin-hooks: rewrote ${file}\n`);
  return 0;
}

if (isMainModule(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`generate-plugin-hooks: ${error.message}\n`); process.exitCode = 1; }
}
