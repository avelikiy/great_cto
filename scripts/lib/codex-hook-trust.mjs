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
// Exit 0 when every hook is reviewed and the install is current, or great_cto is not
// installed for Codex; 3 otherwise (not reviewed, no hooks installed, or behind).

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

/** Where great_cto is installed for Codex: plugin id, newest installed version and its directory. */
export function installedPlugins(codexHome) {
  const cache = join(codexHome, 'plugins', 'cache');
  let markets = [];
  try { markets = readdirSync(cache); } catch { return []; }
  const key = (v) => v.split('.').map((n) => parseInt(n, 10) || 0);
  const newest = (vs) => vs.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; }).at(-1);
  const out = [];
  for (const m of markets) {
    let versions = [];
    try { versions = readdirSync(join(cache, m, 'great-cto')).filter((v) => /^\d+\.\d+\.\d+/.test(v)); } catch { continue; }
    if (!versions.length) continue;
    const version = newest(versions);
    out.push({ id: `great-cto@${m}`, version, dir: join(cache, m, 'great-cto', version) });
  }
  return out;
}

/** The hooks file an installed plugin declares, read from ITS manifest — not from this checkout. */
function installedHooks(dir) {
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(dir, '.codex-plugin', 'plugin.json'), 'utf8')); } catch { return null; }
  if (typeof manifest.hooks !== 'string') return null;
  const rel = manifest.hooks.replace(/^\.\//, '');
  try { return { rel, json: JSON.parse(readFileSync(join(dir, rel), 'utf8')) }; } catch { return null; }
}

/**
 * What Codex actually runs. The 3.45.0 version derived the keys from THIS checkout's
 * hooks file, so an install stuck at 3.37.0 — which ships no hooks at all — was reported
 * as "2 hooks not reviewed". It reads the installed plugin now, and says when that
 * install is behind.
 * @returns {{state:'not-installed'|'no-hooks'|'reviewed'|'not-reviewed'|'partly-reviewed', plugins:object[]}}
 */
export function hookTrustStatus({ codexHome, configToml, currentVersion = null }) {
  const installed = installedPlugins(codexHome);
  if (!installed.length) return { state: 'not-installed', plugins: [] };
  const trusted = trustedKeys(configToml);
  const plugins = installed.map((p) => {
    const hooks = installedHooks(p.dir);
    const expected = hooks ? expectedKeys(hooks.json, p.id, hooks.rel) : [];
    const behind = currentVersion && versionLt(p.version, currentVersion) ? currentVersion : null;
    return { id: p.id, version: p.version, behind, hasHooks: !!hooks, expected: expected.length, missing: expected.filter((k) => !trusted.has(k)) };
  });
  if (plugins.every((p) => !p.hasHooks)) return { state: 'no-hooks', plugins };
  const missing = plugins.reduce((a, p) => a + p.missing.length, 0);
  const total = plugins.reduce((a, p) => a + p.expected, 0);
  const state = missing === 0 ? 'reviewed' : missing === total ? 'not-reviewed' : 'partly-reviewed';
  return { state, plugins };
}

function versionLt(a, b) {
  const x = a.split('.').map(Number); const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
}

export function formatStatus(s) {
  if (s.state === 'not-installed') return 'Codex: great_cto is not installed for Codex — nothing to check.';
  const lines = [];
  for (const p of s.plugins.filter((x) => x.behind)) {
    lines.push(`Codex: great_cto ${p.version} is installed; ${p.behind} is out. Codex does not refresh it by itself.`);
    lines.push('  Fix: great-cto upgrade codex   (or: codex plugin marketplace upgrade great-cto)');
  }
  if (s.state === 'no-hooks') {
    lines.push('Codex: the installed great_cto ships no hooks — no guard runs in Codex until it is upgraded.');
    return lines.join('\n');
  }
  if (s.state === 'reviewed') {
    lines.push(`Codex: all great_cto hooks are reviewed (${s.plugins.map((p) => `${p.id} ${p.version}: ${p.expected}`).join(', ')}) — the guards run.`);
    return lines.join('\n');
  }
  const n = s.plugins.reduce((a, p) => a + p.missing.length, 0);
  lines.push(
    `Codex: ${n} great_cto hook(s) are NOT reviewed — ${s.state === 'not-reviewed' ? 'none of the guards run' : 'some guards do not run'} in Codex.`,
    '  Fix: start `codex` in a project, and at "Hooks need review" choose Review hooks or Trust all and continue.',
    '  Until then no destructive-command, gate-bypass or secret check runs on Codex calls.',
  );
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const a = process.argv.slice(2);
  const codexHome = a.includes('--codex-home') ? a[a.indexOf('--codex-home') + 1] : join(homedir(), '.codex');
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let currentVersion = null;
  try { currentVersion = JSON.parse(readFileSync(join(repo, '.codex-plugin', 'plugin.json'), 'utf8')).version || null; } catch { /* unknown */ }
  let configToml = '';
  try { configToml = readFileSync(join(codexHome, 'config.toml'), 'utf8'); } catch { /* no config yet */ }
  const s = hookTrustStatus({ codexHome, configToml, currentVersion });
  process.stdout.write(a.includes('--json') ? `${JSON.stringify(s, null, 2)}\n` : `${formatStatus(s)}\n`);
  const behind = s.plugins.some((p) => p.behind);
  process.exit(s.state === 'not-reviewed' || s.state === 'partly-reviewed' || s.state === 'no-hooks' || behind ? 3 : 0);
}
