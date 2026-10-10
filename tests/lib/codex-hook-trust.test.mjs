// codex-hook-trust — whether great_cto's guards actually run in the user's Codex.
// Key format measured on codex-cli 0.153.4 by reviewing great_cto's own hooks in a
// throwaway CODEX_HOME: great-cto@great-cto:.codex-plugin/hooks.json:pre_tool_use:<i>:<j>.
// 3.45.0 read the hooks from this checkout; an install stuck at 3.37.0 (no hooks) was
// then reported as "not reviewed". It reads the installed plugin now.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedKeys, trustedKeys, hookTrustStatus, formatStatus } from '../../scripts/lib/codex-hook-trust.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = JSON.parse(readFileSync(join(REPO, '.codex-plugin', 'hooks.json'), 'utf8'));
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

/** A CODEX_HOME with great_cto <version> installed; withHooks=false is what 3.37.0 looked like. */
function home(version, { withHooks = true } = {}) {
  const h = mkdtempSync(join(tmpdir(), 'codex-home-'));
  made.push(h);
  if (!version) return h;
  const dir = join(h, 'plugins', 'cache', 'great-cto', 'great-cto', version);
  mkdirSync(join(dir, '.codex-plugin'), { recursive: true });
  writeFileSync(join(dir, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: 'great-cto', version, ...(withHooks ? { hooks: './.codex-plugin/hooks.json' } : {}) }));
  if (withHooks) writeFileSync(join(dir, '.codex-plugin', 'hooks.json'), JSON.stringify(HOOKS));
  return h;
}
const trust = (keys) => keys.map((k) => `[hooks.state."${k}"]\ntrusted_hash = "sha256:${'a'.repeat(64)}"\n`).join('\n');
const KEYS = () => expectedKeys(HOOKS, 'great-cto@great-cto');

test('the keys follow from the hooks file, in the measured format', () => {
  assert.deepEqual(KEYS(), [
    'great-cto@great-cto:.codex-plugin/hooks.json:pre_tool_use:0:0',
    'great-cto@great-cto:.codex-plugin/hooks.json:pre_tool_use:1:0',
  ]);
  assert.deepEqual(expectedKeys({ hooks: { PostToolUse: [{ hooks: [{}, {}] }] } }, 'p@m', 'codex/hooks.json'), ['p@m:codex/hooks.json:post_tool_use:0:0', 'p@m:codex/hooks.json:post_tool_use:0:1']);
});

test('trustedKeys counts a key only when it carries a trusted_hash', () => {
  const t = trustedKeys('[hooks.state]\n\n[hooks.state."a:b"]\ntrusted_hash = "sha256:0123456789abcdef0123"\n\n[hooks.state."c:d"]\nother = 1\n\n[projects."/x"]\ntrusted_hash = "sha256:0123456789abcdef0123"\n');
  assert.deepEqual([...t], ['a:b']);
});

test('an install that ships no hooks says so and says upgrade — the 3.37.0 case', () => {
  const s = hookTrustStatus({ codexHome: home('3.37.0', { withHooks: false }), configToml: '', currentVersion: '3.46.0' });
  assert.equal(s.state, 'no-hooks');
  const text = formatStatus(s);
  assert.match(text, /3\.37\.0 is installed; 3\.46\.0 is out/);
  assert.match(text, /great-cto upgrade codex/);
  assert.match(text, /ships no hooks/);
  assert.doesNotMatch(text, /NOT reviewed/, 'not the wrong diagnosis 3.45.0 gave');
});

test('not installed, not reviewed, partly reviewed, reviewed — read from the installed plugin', () => {
  assert.equal(hookTrustStatus({ codexHome: home(null), configToml: '' }).state, 'not-installed');
  const h = home('3.46.0');
  const none = hookTrustStatus({ codexHome: h, configToml: '', currentVersion: '3.46.0' });
  assert.equal(none.state, 'not-reviewed');
  assert.match(formatStatus(none), /NOT reviewed — none of the guards run/);
  assert.equal(hookTrustStatus({ codexHome: h, configToml: trust(KEYS().slice(0, 1)) }).state, 'partly-reviewed');
  const all = hookTrustStatus({ codexHome: h, configToml: trust(KEYS()), currentVersion: '3.46.0' });
  assert.equal(all.state, 'reviewed');
  assert.match(formatStatus(all), /all great_cto hooks are reviewed/);
  assert.doesNotMatch(formatStatus(all), /is out/, 'current install: no lag line');
});

test('a reviewed but outdated install is reported as behind', () => {
  const s = hookTrustStatus({ codexHome: home('3.45.0'), configToml: trust(KEYS()), currentVersion: '3.46.0' });
  assert.equal(s.state, 'reviewed');
  assert.equal(s.plugins[0].behind, '3.46.0');
  assert.match(formatStatus(s), /3\.45\.0 is installed; 3\.46\.0 is out/);
});
