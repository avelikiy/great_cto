// The gate must not depend on the operator's commit-signing setup: test
// repositories inherit global `commit.gpgsign`, and an unreachable signing agent
// hung ssh-keygen until the release gate failed (2026-10-01).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SRC = readFileSync(new URL('../scripts/ci-local.sh', import.meta.url), 'utf8');

// Exercise the real argument parser without starting the expensive gate.
const parser = SRC.slice(SRC.indexOf('E2E=0; QUICK=0;'), SRC.indexOf('\nFAIL=0'));
const parse = (...args) => execFileSync('/bin/bash', ['-c',
  parser + '\nprintf "%s %s %s" "$E2E" "$QUICK" "$GATE_TEST_CONCURRENCY"', 'fixture', ...args], { encoding: 'utf8' });
test('gate defaults keep two root/lib test workers and every gate', () => {
  assert.equal(parse(), '0 0 2');
});
test('serial gate only changes test worker count, not full E2E selection', () => {
  assert.equal(parse('--e2e', '--serial'), '1 0 1');
  assert.equal(parse('--serial', '--e2e'), '1 0 1');
});
test('serial mode refuses ambiguous or arbitrary concurrency values', () => {
  for (const flag of ['--serial=0', '--serial=4', '--test-concurrency=0']) {
    assert.throws(() => parse(flag), error => error.status === 2);
  }
});

test('ci-local turns commit and tag signing off for every git it starts', () => {
  assert.match(SRC, /export GIT_CONFIG_KEY_\d=commit\.gpgsign\s+GIT_CONFIG_VALUE_\d=false/);
  assert.match(SRC, /export GIT_CONFIG_KEY_\d=tag\.gpgSign\s+GIT_CONFIG_VALUE_\d=false/);
  const count = Number(/export GIT_CONFIG_COUNT=(\d+)/.exec(SRC)?.[1]);
  const keys = new Set([...SRC.matchAll(/GIT_CONFIG_KEY_(\d+)=/g)].map((m) => Number(m[1])));
  assert.equal(keys.size, count, 'GIT_CONFIG_COUNT must equal the number of keys, or git ignores the extra ones');
});

test('git honours that environment over a global signing setting', () => {
  const out = execFileSync('git', ['config', '--get', 'commit.gpgsign'], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'false' },
  }).trim();
  assert.equal(out, 'false');
});

// Steps read packages/cli/dist (a gitignored build) from early on — the stranger
// install check among them. 3.46.2 built it ahead of the unit tests only, and a
// fresh worktree still failed the earlier step. The build is the first step.
test('the CLI build is the first step the gate runs', () => {
  const first = /^\s*step "([^"]+)"/m.exec(SRC)?.[1];
  assert.equal(first, 'cli build (tests import it)');
});

test('the local gate prevents Python imports from adding opaque bytecode to scanned source', () => {
  const declaration = /^export PYTHONDONTWRITEBYTECODE=1$/m.exec(SRC)?.[0];
  assert.ok(declaration);
  assert.ok(SRC.indexOf(declaration) < SRC.indexOf('step "cli build'));
  const out = execFileSync('bash', ['-c', `${declaration}; python3 -c 'import sys; print(sys.dont_write_bytecode)'`], { encoding: 'utf8' });
  assert.equal(out.trim(), 'True');
});
