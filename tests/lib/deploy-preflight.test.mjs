// devops printed `Required env vars from .great_cto/PROJECT.md stack: …` and
// then carried on. It announced the requirement and never checked it — the same
// shape as every other defect found this week: a step that runs every time and
// cannot fail.
//
// The eval caught it attempting a staging deploy with DATABASE_URL, API_KEY and
// REDIS_URL missing. A deploy is user-reachable and expensive to undo, and one
// that boots against an empty DATABASE_URL does not fail loudly — it connects to
// whatever the default turns out to be.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredVars, checkEnv, explain } from '../../scripts/lib/deploy-preflight.mjs';

const PROJECT_MD = `# Project

## Stack
- Node 22, Postgres

## Env
- \`DATABASE_URL\` — primary store
- \`API_KEY\` — upstream auth
- \`REDIS_URL\` — cache

## Deps
- none
`;

// ── reading the declaration ────────────────────────────────────────────────

test('required names are read from the Env section', () => {
  assert.deepEqual(requiredVars(PROJECT_MD).sort(), ['API_KEY', 'DATABASE_URL', 'REDIS_URL']);
});

test('the Env section ends at the next heading', () => {
  assert.ok(!requiredVars(PROJECT_MD).includes('NONE'), 'a later section is not part of Env');
});

test('an `env:` key form is read too, because both are in the wild', () => {
  assert.deepEqual(requiredVars('env: DATABASE_URL, API_KEY\n').sort(), ['API_KEY', 'DATABASE_URL']);
  assert.deepEqual(requiredVars('required-env: STRIPE_SECRET\n'), ['STRIPE_SECRET']);
});

test('a project declaring nothing yields nothing — silence is not a pass', () => {
  assert.deepEqual(requiredVars('# Project\n\n## Stack\n- Node\n'), []);
  assert.deepEqual(requiredVars(''), []);
  assert.deepEqual(requiredVars(null), []);
});

// ── the check ──────────────────────────────────────────────────────────────

test('every variable set is a pass', () => {
  const r = checkEnv(['A', 'B'], { A: 'x', B: 'y' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.present.sort(), ['A', 'B']);
});

test('a missing variable refuses the deploy', () => {
  const r = checkEnv(['DATABASE_URL', 'API_KEY'], { DATABASE_URL: 'postgres://…' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['API_KEY']);
});

test('an empty or whitespace value is missing, not set', () => {
  const r = checkEnv(['A', 'B'], { A: '', B: '   ' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.sort(), ['A', 'B'], 'an empty string is the absence of a value');
});

test('a placeholder is treated as missing', () => {
  // `API_KEY=CHANGEME` is not a value; it is the absence of one wearing a
  // value's clothes, and a check that accepts it passes exactly when it matters.
  for (const v of ['CHANGEME', 'changeme', 'TODO', 'xxx', 'placeholder', 'your-key-here', '<secret>', 'null']) {
    const r = checkEnv(['K'], { K: v });
    assert.equal(r.ok, false, v);
    assert.equal(r.placeholder[0].name, 'K');
  }
});

test('a real value that merely looks odd is accepted', () => {
  // Rejecting anything unusual would make the check unusable; only the known
  // stand-ins are refused.
  for (const v of ['sk-live-abc123', 'postgres://u:p@h/db', 'null-island-key', 'todo-list-service']) {
    assert.equal(checkEnv(['K'], { K: v }).ok, true, v);
  }
});

test('the secret value is never echoed back', () => {
  const r = checkEnv(['K'], { K: 'CHANGEME' });
  assert.equal(r.placeholder[0].value, '<placeholder>',
    'a preflight that prints secrets to a deploy log has created the leak it was guarding');
  assert.ok(!JSON.stringify(r).includes('CHANGEME'));
});

// ── the message ────────────────────────────────────────────────────────────

test('the refusal names what is missing and why it matters', () => {
  const out = explain(checkEnv(['DATABASE_URL', 'API_KEY'], { API_KEY: 'CHANGEME' }), { target: 'staging' });
  assert.match(out, /REFUSING to deploy to staging/);
  assert.match(out, /DATABASE_URL/);
  assert.match(out, /API_KEY/);
  assert.match(out, /whatever the default turns out to be/,
    'the consequence is stated, because "missing var" alone reads as a formality');
});

test('a pass says how many were checked, not just that it passed', () => {
  const out = explain(checkEnv(['A', 'B'], { A: '1', B: '2' }));
  assert.match(out, /2 required variable/);
});

// ── the case from the eval ─────────────────────────────────────────────────

test('the eval case: three secrets missing at staging deploy', () => {
  const r = checkEnv(requiredVars(PROJECT_MD), {});
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.sort(), ['API_KEY', 'DATABASE_URL', 'REDIS_URL']);
});
