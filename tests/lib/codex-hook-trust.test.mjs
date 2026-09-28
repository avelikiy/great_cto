// codex-hook-trust — whether great_cto's guards actually run in the user's Codex.
// Key format measured on codex-cli 0.153.4 by reviewing great_cto's own hooks in a
// throwaway CODEX_HOME: great-cto@great-cto:.codex-plugin/hooks.json:pre_tool_use:<i>:<j>.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedKeys, trustedKeys, hookTrustStatus, formatStatus } from '../../scripts/lib/codex-hook-trust.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = JSON.parse(readFileSync(join(REPO, '.codex-plugin', 'hooks.json'), 'utf8'));
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });
const home = (installed) => {
  const h = mkdtempSync(join(tmpdir(), 'codex-home-'));
  made.push(h);
  if (installed) mkdirSync(join(h, 'plugins', 'cache', 'great-cto', 'great-cto', '3.45.0'), { recursive: true });
  return h;
};
const trust = (keys) => keys.map((k) => `[hooks.state."${k}"]\ntrusted_hash = "sha256:${'a'.repeat(64)}"\n`).join('\n');

test('the keys follow from the shipped hooks file, in the measured format', () => {
  assert.deepEqual(expectedKeys(HOOKS, 'great-cto@great-cto'), [
    'great-cto@great-cto:.codex-plugin/hooks.json:pre_tool_use:0:0',
    'great-cto@great-cto:.codex-plugin/hooks.json:pre_tool_use:1:0',
  ]);
  assert.deepEqual(expectedKeys({ hooks: { PostToolUse: [{ hooks: [{}, {}] }] } }, 'p@m'), ['p@m:.codex-plugin/hooks.json:post_tool_use:0:0', 'p@m:.codex-plugin/hooks.json:post_tool_use:0:1']);
});

test('trustedKeys counts a key only when it carries a trusted_hash', () => {
  const t = trustedKeys('[hooks.state]\n\n[hooks.state."a:b"]\ntrusted_hash = "sha256:0123456789abcdef0123"\n\n[hooks.state."c:d"]\nother = 1\n\n[projects."/x"]\ntrusted_hash = "sha256:0123456789abcdef0123"\n');
  assert.deepEqual([...t], ['a:b']);
});

test('not installed, not reviewed, partly reviewed, reviewed', () => {
  assert.equal(hookTrustStatus({ codexHome: home(false), hooksJson: HOOKS, configToml: '' }).state, 'not-installed');
  const h = home(true);
  const keys = expectedKeys(HOOKS, 'great-cto@great-cto');
  const none = hookTrustStatus({ codexHome: h, hooksJson: HOOKS, configToml: '' });
  assert.equal(none.state, 'not-reviewed');
  assert.match(formatStatus(none), /NOT reviewed — none of the guards run/);
  assert.equal(hookTrustStatus({ codexHome: h, hooksJson: HOOKS, configToml: trust(keys.slice(0, 1)) }).state, 'partly-reviewed');
  const all = hookTrustStatus({ codexHome: h, hooksJson: HOOKS, configToml: trust(keys) });
  assert.equal(all.state, 'reviewed');
  assert.match(formatStatus(all), /all great_cto hooks are reviewed/);
});
