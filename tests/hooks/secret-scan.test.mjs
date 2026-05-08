// Tests for scripts/hooks/secret-scan.mjs
//
// Run with:  node --test tests/hooks/secret-scan.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '../../scripts/hooks/secret-scan.mjs');

function run(payload) {
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, GREAT_CTO_DISABLE_SECRET_SCAN: '' },
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('clean content passes (exit 0)', () => {
  const r = run({
    tool_name: 'Write',
    tool_input: { file_path: '/tmp/foo.ts', content: 'export const x = 1;' },
  });
  assert.equal(r.exit, 0);
});

test('AWS Access Key ID is blocked', () => {
  // Build the fixture at runtime to keep our source clean of pattern-matching strings.
  const fakeKey = 'AKIA' + 'IOSFODNN7' + 'EXAMPLE';
  const r = run({
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/foo.ts',
      content: `const KEY = "${fakeKey}";`,
    },
  });
  assert.equal(r.exit, 2);
  assert.match(r.stderr, /AWS Access Key ID/);
});

test('GitHub PAT classic is blocked', () => {
  // Use a single-string fixture so the regex sees ghp_ + 36 alphanumeric.
  const fakeToken = 'ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
  const r = run({
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/foo.ts',
      content: `const TOK = "${fakeToken}";`,
    },
  });
  assert.equal(r.exit, 2);
  assert.match(r.stderr, /GitHub PAT/);
});

test('Stripe live key is blocked', () => {
  const fakeKey = 'sk_' + 'live_' + 'aBcDeFgHiJkLmNoPqRsTuVwX';
  const r = run({
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/foo.ts',
      content: `const STRIPE = "${fakeKey}";`,
    },
  });
  assert.equal(r.exit, 2);
  assert.match(r.stderr, /Stripe/);
});

test('OpenAI API key is blocked', () => {
  const fakeKey = 'sk-' + 'proj-' + 'aBcDeFgHiJkLmNoPqRsTuVwXyZ012345';
  const r = run({
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/foo.ts',
      content: `const OPENAI = "${fakeKey}";`,
    },
  });
  assert.equal(r.exit, 2);
  assert.match(r.stderr, /OpenAI/);
});

test('Anthropic API key is blocked', () => {
  const fakeKey = 'sk-' + 'ant-api03-' + 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789';
  const r = run({
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/foo.ts',
      content: `const A = "${fakeKey}";`,
    },
  });
  assert.equal(r.exit, 2);
  assert.match(r.stderr, /Anthropic/);
});

test('PEM private key is blocked', () => {
  const r = run({
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/foo.ts',
      content: '-----BEGIN RSA PRIVATE KEY-----\nMIIE...',
    },
  });
  assert.equal(r.exit, 2);
  assert.match(r.stderr, /PEM/);
});

test('test/fixtures path is allowlisted', () => {
  const r = run({
    tool_name: 'Write',
    tool_input: {
      file_path: '/repo/tests/fixtures/sample.ts',
      content: 'const KEY = "' + 'AKIA' + 'IOSFODNN7' + 'EXAMPLE' + '";',
    },
  });
  assert.equal(r.exit, 0);
});

test('.example file is allowlisted', () => {
  const r = run({
    tool_name: 'Write',
    tool_input: {
      file_path: '/repo/.env.example',
      content: 'AWS_ACCESS_KEY_ID=' + 'AKIA' + 'IOSFODNN7' + 'EXAMPLE' + '',
    },
  });
  assert.equal(r.exit, 0);
});

test('opt-out comment respected', () => {
  const r = run({
    tool_name: 'Write',
    tool_input: {
      file_path: '/tmp/foo.ts',
      content: '// great_cto:allow-secrets\nconst K = "' + 'AKIA' + 'IOSFODNN7' + 'EXAMPLE' + '";',
    },
  });
  assert.equal(r.exit, 0);
});

test('env var opt-out respected', () => {
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/foo.ts', content: '' + 'AKIA' + 'IOSFODNN7' + 'EXAMPLE' + '' },
    }),
    encoding: 'utf8',
    env: { ...process.env, GREAT_CTO_DISABLE_SECRET_SCAN: '1' },
  });
  assert.equal(r.status, 0);
});

test('Edit (new_string) is scanned', () => {
  const r = run({
    tool_name: 'Edit',
    tool_input: {
      file_path: '/tmp/foo.ts',
      old_string: 'foo',
      new_string: '' + 'AKIA' + 'IOSFODNN7' + 'EXAMPLE' + '',
    },
  });
  assert.equal(r.exit, 2);
});

test('MultiEdit edits are scanned', () => {
  const r = run({
    tool_name: 'MultiEdit',
    tool_input: {
      file_path: '/tmp/foo.ts',
      edits: [
        { old_string: 'a', new_string: 'safe' },
        { old_string: 'b', new_string: '' + 'AKIA' + 'IOSFODNN7' + 'EXAMPLE' + '' },
      ],
    },
  });
  assert.equal(r.exit, 2);
});

test('empty stdin passes', () => {
  const r = spawnSync('node', [HOOK], { input: '', encoding: 'utf8' });
  assert.equal(r.status, 0);
});

test('malformed JSON passes (defensive)', () => {
  const r = spawnSync('node', [HOOK], { input: 'not-json', encoding: 'utf8' });
  assert.equal(r.status, 0);
});
