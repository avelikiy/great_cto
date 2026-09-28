#!/usr/bin/env node
// codex-hook-trust — are great_cto's hooks actually running in this user's Codex?
//
// Codex runs a plugin hook only after the user reviews it once in the TUI ("Hooks need
// review … Trust all and continue"). Until then every guard great_cto ships for Codex is
// off, and nothing says so: no error, no warning, the calls simply are not checked.
// Found 2026-09-28 on the maintainer's own machine — great_cto installed for Codex, not
// one hook reviewed.
//
// What review writes (measured, codex-cli 0.153.4), in ~/.codex/config.toml:
//
//   [hooks.state."<plugin>@<marketplace>:<hooks file>:<event>:<entry>:<hook>"]
//   trusted_hash = "sha256:…"
//
// with the event in snake_case (pre_tool_use) and the two indexes counting from 0 in
// the order of the hooks file. So the keys great_cto needs follow from the shipped
// .codex-plugin/hooks.json. The hash is Codex's own business: it asks again at start
// when a hook changes, so a key with a trusted_hash is the fact that matters here.
//
// Usage: node scripts/lib/codex-hook-trust.mjs [--codex-home ~/.codex] [--json]
// Exit 0 when every hook is reviewed or great_cto is not installed for Codex; 3 when
// some are not.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const snake = (ev) => ev.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();

/** The trust keys a hooks file needs, for a plugin id like `great-cto@great-cto`. */
export function expectedKeys(hooksJson, pluginId, hooksPath = '.codex-plugin/hooks.json') {
  const keys = [];
  for (const [ev, entries] of Object.entries(hooksJson?.hooks ?? {})) {
    (entries || []).forEach((entry, i) => (entry?.hooks || []).forEach((_, j) => keys.push(`${pluginId}:${hooksPath}:${snake(ev)}:${i}:${j}`)));
  }
  return keys;
}

/** Keys under [hooks.state."…"] that carry a trusted_hash, from config.toml text. */
export function trustedKeys(configToml) {
  const out = new Set();
  let current = null;
  for (const line of String(configToml ?? '').split('\n')) {
    const h = /^\s*\[hooks\.state\."(.+)"\]\s*$/.exec(line);
    if (h) { current = h[1]; continue; }
    if (/^\s*\[/.test(line)) { current = null; continue; }
    if (current && /^\s*trusted_hash\s*=\s*"sha256:[0-9a-f]{16,}"/.test(line)) out.add(current);
  }
  return out;
}

/** Where great_cto is installed for Codex, as plugin ids (`great-cto@<marketplace>`). */
export function installedPluginIds(codexHome) {
  const cache = join(codexHome, 'plugins', 'cache');
  let markets = [];
  try { markets = readdirSync(cache); } catch { return []; }
  return markets.filter((m) => existsSync(join(cache, m, 'great-cto'))).map((m) => `great-cto@${m}`);
}

/**
 * @returns {{state:'not-installed'|'reviewed'|'not-reviewed'|'partly-reviewed', plugins:{id:string, expected:number, missing:string[]}[]}}
 */
export function hookTrustStatus({ codexHome, hooksJson, configToml }) {
  const ids = installedPluginIds(codexHome);
  if (!ids.length) return { state: 'not-installed', plugins: [] };
  const trusted = trustedKeys(configToml);
  const plugins = ids.map((id) => {
    const expected = expectedKeys(hooksJson, id);
    return { id, expected: expected.length, missing: expected.filter((k) => !trusted.has(k)) };
  });
  const missing = plugins.reduce((a, p) => a + p.missing.length, 0);
  const total = plugins.reduce((a, p) => a + p.expected, 0);
  const state = missing === 0 ? 'reviewed' : missing === total ? 'not-reviewed' : 'partly-reviewed';
  return { state, plugins };
}

export function formatStatus(s) {
  if (s.state === 'not-installed') return 'Codex: great_cto is not installed for Codex — nothing to check.';
  if (s.state === 'reviewed') return `Codex: all great_cto hooks are reviewed (${s.plugins.map((p) => `${p.id}: ${p.expected}`).join(', ')}) — the guards run.`;
  const n = s.plugins.reduce((a, p) => a + p.missing.length, 0);
  return [
    `Codex: ${n} great_cto hook(s) are NOT reviewed — ${s.state === 'not-reviewed' ? 'none of the guards run' : 'some guards do not run'} in Codex.`,
    '  Fix: start `codex` in a project, and at "Hooks need review" choose Review hooks or Trust all and continue.',
    '  Until then no destructive-command, gate-bypass or secret check runs on Codex calls.',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const a = process.argv.slice(2);
  const codexHome = a.includes('--codex-home') ? a[a.indexOf('--codex-home') + 1] : join(homedir(), '.codex');
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let hooksJson = {};
  try { hooksJson = JSON.parse(readFileSync(join(repo, '.codex-plugin', 'hooks.json'), 'utf8')); } catch { /* no hooks shipped */ }
  let configToml = '';
  try { configToml = readFileSync(join(codexHome, 'config.toml'), 'utf8'); } catch { /* no config yet */ }
  const s = hookTrustStatus({ codexHome, hooksJson, configToml });
  process.stdout.write(a.includes('--json') ? `${JSON.stringify(s, null, 2)}\n` : `${formatStatus(s)}\n`);
  process.exit(s.state === 'not-reviewed' || s.state === 'partly-reviewed' ? 3 : 0);
}
