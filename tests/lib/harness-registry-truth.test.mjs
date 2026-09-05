/**
 * The capability registry must match the harness that is installed.
 *
 * `harness-router.mjs` declared Codex `subagents: false`. On codex-cli 0.153.4
 * that is wrong twice over: `codex doctor` reports live subagent threads, and a
 * stock `~/.codex/config.toml` carries `[features] multi_agent = true`. The
 * registry was written in June against the CLI of the day and nothing ever
 * compared it to a real install again — so we were degrading a capability the
 * harness has.
 *
 * A registry that can drift silently is worse than no registry: code branches on
 * it, and a wrong `false` removes a feature quietly while a wrong `true` breaks
 * loudly. This checks the claims that CAN be checked from the machine, and skips
 * — rather than passes — when the harness is not installed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { HARNESSES, capabilities } from '../../scripts/lib/harness-router.mjs';
const require = createRequire(import.meta.url);

/** The codex binary, or null. Not every machine has one, and that is not a pass. */
function codexBin() {
  for (const p of [join(homedir(), '.nvm/versions/node/v22.19.0/bin/codex'),
                   '/opt/homebrew/bin/codex', '/usr/local/bin/codex']) {
    if (existsSync(p)) return p;
  }
  try { return execFileSync('command', ['-v', 'codex'], { encoding: 'utf8', shell: true }).trim() || null; }
  catch { return null; }
}

test('the registry lists the harnesses the code branches on', () => {
  for (const id of ['claude-code', 'codex']) {
    assert.ok(HARNESSES[id], `${id} must be in the registry`);
  }
});

test('Codex subagents: the registry agrees with the installed CLI', (t) => {
  const bin = codexBin();
  if (!bin) return t.skip('codex is not installed — NOT CHECKED, not verified');

  let doctor = '';
  try { doctor = execFileSync(bin, ['doctor'], { encoding: 'utf8', timeout: 30000 }); }
  catch (e) { doctor = String(e.stdout || ''); }

  const cfgPath = join(homedir(), '.codex', 'config.toml');
  const cfg = existsSync(cfgPath) ? readFileSync(cfgPath, 'utf8') : '';

  // Two independent signals, either of which means the capability exists.
  const liveThreads = /subagent:thread_spawn=\d+/.test(doctor);
  const featureOn = /multi_agent\s*=\s*true/.test(cfg);
  if (!liveThreads && !featureOn) {
    return t.skip('neither doctor nor config reports multi-agent — NOT CHECKED');
  }

  assert.equal(capabilities('codex').subagents, true,
    'the installed Codex runs subagents; the registry says it does not, so we degrade a capability that exists');
});

test('Codex hooks: the registry agrees with the CLI that ships them', (t) => {
  // This asserted `false` on the evidence that no shipped plugin declares a
  // hook — absence of use read as absence of support. The binary's own JSON
  // Schema disagrees: Codex implements our hook contract, with MORE events than
  // we use (it adds PermissionRequest and PostCompact), the same wire format,
  // and `"hooks": "./hooks.json"` as a manifest key.
  const bin = codexBin();
  if (!bin) return t.skip('codex is not installed — NOT CHECKED, not verified');

  // Read it from the shipped binary rather than trusting this comment: if a
  // future Codex drops hooks, this stops asserting rather than going stale.
  const vendor = bin.replace(/\/bin\/codex$/, '')
    .replace(/\/versions\/node\/[^/]+\/bin$/, '');
  let schemaSeen = false;
  try {
    const { execFileSync } = require('node:child_process');
    const out = execFileSync('bash', ['-c',
      `strings "$(find ${JSON.stringify(vendor).slice(1, -1)} -name codex -type f -size +10M 2>/dev/null | head -1)" 2>/dev/null | grep -c PreToolUseHookSpecificOutputWire`],
      { encoding: 'utf8', timeout: 60000 });
    schemaSeen = Number(out.trim()) > 0;
  } catch { /* fall through to skip */ }
  if (!schemaSeen) return t.skip('could not read the hook schema from the binary — NOT CHECKED');

  assert.equal(capabilities('codex').hooks, true,
    'Codex ships the hook contract; declaring false degrades a capability it has');
});
