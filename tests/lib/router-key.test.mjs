// A user who installs the plugin has no way to discover that a key exists. The
// README mentions OpenRouter once without saying where the key goes, and the
// router's own hint names a file it is not read from. Nothing breaks without one
// — every stage is scored `unverifiable` — but "not connected" and "nothing to
// check" read the same from the board.
//
// This module writes a credential, so most of what is asserted below is about
// not losing one: the file it writes holds other keys, and a careless `cat >`
// destroyed it once already.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { status, writeKey, looksLikeKey, fingerprint, parseEnv } from '../../scripts/lib/router-key.mjs';

const KEY = 'sk-or-v1-abcdefghijklmnopqrstuvwxyz01';
const home = (contents = null) => {
  const h = mkdtempSync(join(tmpdir(), 'gcto-key-'));
  mkdirSync(join(h, '.great_cto'), { recursive: true });
  if (contents != null) writeFileSync(join(h, '.great_cto', 'secrets.env'), contents);
  return h;
};
const secrets = (h) => readFileSync(join(h, '.great_cto', 'secrets.env'), 'utf8');

test('writing a key preserves every other line in the file', () => {
  const h = home('# a note\nOTHER_KEY=keep-me\nGREAT_CTO_ROUTER_MODEL=z-ai/glm-5.3-flash\n');
  const r = writeKey(KEY, { home: h });
  assert.equal(r.ok, true);
  const after = secrets(h);
  assert.match(after, /OTHER_KEY=keep-me/, 'a neighbouring credential must survive');
  assert.match(after, /GREAT_CTO_ROUTER_MODEL=z-ai\/glm-5\.3-flash/);
  assert.match(after, /# a note/, 'and so must the comments');
});

test('an existing key is replaced in place, not appended beside itself', () => {
  const h = home(`OPENROUTER_API_KEY=sk-or-v1-oldoldoldoldoldoldold\nOTHER=x\n`);
  const r = writeKey(KEY, { home: h });
  assert.equal(r.replaced, true);
  const lines = secrets(h).split('\n').filter((l) => l.startsWith('OPENROUTER_API_KEY='));
  assert.equal(lines.length, 1, 'two definitions would leave which one wins to the parser');
  assert.match(lines[0], /abcdefghij/);
});

test('the file is backed up before it is touched', () => {
  const h = home('OPENROUTER_API_KEY=sk-or-v1-oldoldoldoldoldoldold\n');
  const r = writeKey(KEY, { home: h });
  assert.ok(r.backup && existsSync(r.backup), 'a key that is gone cannot be recovered from anywhere');
  assert.match(readFileSync(r.backup, 'utf8'), /oldoldold/, 'and the backup holds the OLD value');
});

test('a first-time write needs no backup and creates the file', () => {
  const h = mkdtempSync(join(tmpdir(), 'gcto-key-empty-'));
  const r = writeKey(KEY, { home: h });
  assert.equal(r.ok, true);
  assert.equal(r.backup, null);
  assert.match(secrets(h), /OPENROUTER_API_KEY=/);
});

test('the secrets file is not world-readable', () => {
  const h = home('X=1\n');
  writeKey(KEY, { home: h });
  assert.equal(statSync(join(h, '.great_cto', 'secrets.env')).mode & 0o077, 0,
    'a credential file readable by other users is a credential that leaked');
});

test('a malformed key is refused before anything is written', () => {
  const h = home('OPENROUTER_API_KEY=sk-or-v1-keepthisone000000000\n');
  for (const bad of ['', '   ', 'not-a-key', 'sk-or-short', 'sk-or-v1-with space inside']) {
    const r = writeKey(bad, { home: h });
    assert.equal(r.ok, false, JSON.stringify(bad));
  }
  assert.match(secrets(h), /keepthisone/, 'and the existing key is untouched');
  assert.equal(readdirSync(join(h, '.great_cto')).filter((f) => f.includes('.bak-')).length, 0,
    'a refused write should not litter backups either');
});

test('status finds a key without returning it', () => {
  const h = home(`OPENROUTER_API_KEY=${KEY}\nGREAT_CTO_ROUTER_MODEL=z-ai/glm-5.3-flash\n`);
  const s = status({ cwd: h, env: {} });
  // The homedir is not overridable in status(), so assert on the parser it uses.
  const vars = parseEnv(secrets(h));
  assert.equal(vars.get('OPENROUTER_API_KEY'), KEY);
  assert.equal(fingerprint(KEY), 'sk-or-v1…yz01');
  assert.ok(!JSON.stringify(s).includes(KEY), 'the full key must never appear in a status payload');
});

test('the environment wins over a file, and says so', () => {
  const s = status({ cwd: mkdtempSync(join(tmpdir(), 'gcto-key-none-')), env: { OPENROUTER_API_KEY: KEY } });
  assert.equal(s.state, 'present');
  assert.equal(s.from, 'environment');
  assert.equal(s.fingerprint, 'sk-or-v1…yz01');
  assert.ok(!JSON.stringify(s).includes(KEY));
});

test('no key is `absent`, and an unreadable file is neither present nor absent', () => {
  const empty = mkdtempSync(join(tmpdir(), 'gcto-key-none-'));
  const s = status({ cwd: empty, env: {} });
  assert.ok(['absent', 'present'].includes(s.state));
  // The third state exists because telling an operator "no key" when the answer
  // is "I could not look" sends them to set a key they already have.
  assert.equal(typeof s.problems, 'object');
});

test('shape validation does not pretend to know a key is live', () => {
  assert.equal(looksLikeKey(KEY).ok, true);
  assert.match(looksLikeKey('ghp_something').why, /begin with/);
});
