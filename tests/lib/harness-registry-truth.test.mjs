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
import { HARNESSES, capabilities } from '../../scripts/lib/harness-router.mjs';

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

test('a capability we cannot verify is not silently asserted', () => {
  // Hooks are the open question from Phase 0: the config key parses, no shipped
  // plugin uses one, and whether `exit 2` blocks is unknown. Claiming `true`
  // would make secret-scan — a BLOCKING guard — look portable when it is not.
  assert.equal(capabilities('codex').hooks, false,
    'until Phase 0 answers the hook payload and the exit-2 signal, hooks must read as absent');
});
