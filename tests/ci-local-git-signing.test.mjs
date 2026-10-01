// The gate must not depend on the operator's commit-signing setup: test
// repositories inherit global `commit.gpgsign`, and an unreachable signing agent
// hung ssh-keygen until the release gate failed (2026-10-01).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SRC = readFileSync(new URL('../scripts/ci-local.sh', import.meta.url), 'utf8');

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
