// Artifact freshness was measured by AGE. AI-FIREWALL.md was 47 days old against
// a 180-day threshold — fresh by that measure — while every one of the six source
// files it invited a security reviewer to verify had been deleted six days after
// it was written. Age and accuracy are different properties, and only one of them
// was being checked.
//
// What these tests pin is the line between a claim and everything that looks like
// one. A check that flags a template's placeholder, a plan's intended file, or a
// decision record's deliberate pointer to history is a check people mute — and a
// muted check is the defect it was written to catch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceRefs, deadSourceRefs, SOURCE_DIRS } from '../../scripts/lib/source-refs.mjs';

const none = () => false;                      // nothing exists
const all = () => true;                        // everything exists
const only = (...ok) => (p) => ok.includes(p);

// ── what counts as a reference ─────────────────────────────────────────────

test('a backticked path under a source dir is a reference', () => {
  const r = sourceRefs('See `scripts/lib/foo.mjs` for details.');
  assert.equal(r.length, 1);
  assert.equal(r[0].path, 'scripts/lib/foo.mjs');
  assert.equal(r[0].line, 1);
});

test('the line number is reported so the finding is findable', () => {
  const r = sourceRefs('one\ntwo\nsee `agents/architect.md` here\n');
  assert.equal(r[0].line, 3);
});

test('prose that merely names a file is not a reference', () => {
  assert.deepEqual(sourceRefs('the scripts/lib/foo.mjs module'), [],
    'backticks are the signal that this is a path, not a phrase');
});

test('a path outside our source dirs is not our claim to check', () => {
  assert.deepEqual(deadSourceRefs('`node_modules/x/index.js` and `~/.great_cto/state.json`', { exists: none }), []);
});

test('every source dir is recognised', () => {
  for (const d of SOURCE_DIRS) {
    assert.equal(sourceRefs(`\`${d}/thing.mjs\``).length, 1, d);
  }
});

// ── the actual rule ────────────────────────────────────────────────────────

test('a cited file that does not exist is a finding', () => {
  const d = deadSourceRefs('The gate lives in `scripts/lib/gone.mjs` today.', { exists: none });
  assert.equal(d.length, 1);
  assert.equal(d[0].path, 'scripts/lib/gone.mjs');
});

test('a cited file that exists is not', () => {
  assert.deepEqual(deadSourceRefs('See `scripts/lib/here.mjs`.', { exists: all }), []);
});

test('the same dead path cited twice is one finding', () => {
  const d = deadSourceRefs('`scripts/a.mjs` and again `scripts/a.mjs`', { exists: none });
  assert.equal(d.length, 1, 'one defect, one finding — repeating a path does not repeat the problem');
});

test('a mix reports only the dead ones', () => {
  const d = deadSourceRefs('`scripts/live.mjs` and `scripts/dead.mjs`', { exists: only('scripts/live.mjs') });
  assert.deepEqual(d.map((x) => x.path), ['scripts/dead.mjs']);
});

// ── the three kinds of non-defect ──────────────────────────────────────────

test('a glob is a pattern, not a path', () => {
  assert.deepEqual(deadSourceRefs('`tests/eval/EVAL-*.md` and `agents/{name}.md`', { exists: none }), []);
});

test('a placeholder name is not a claim about our tree', () => {
  for (const p of ['tests/feature/foo.test.ts', 'skills/your-skill/SKILL.md',
                   'scripts/example.mjs', 'packages/my-app/index.ts']) {
    assert.deepEqual(deadSourceRefs(`\`${p}\``, { exists: none }), [], p);
  }
});

test('a file a document plans to create is the document working, not failing', () => {
  for (const line of [
    'add `packages/board/lib.smoke.test.mjs` (deferred — not required by this refactor)',
    'Phase 4 will add `scripts/promote-skill.mjs`',
    '**v1.4.0** — implement `scripts/promote-skill.mjs`',
    'Proposed: `scripts/lib/new-thing.mjs`',
  ]) {
    assert.deepEqual(deadSourceRefs(line, { exists: none }), [], line);
  }
});

test('a pointer deliberately anchored to history is preserved, not flagged', () => {
  // Deleting such a pointer to satisfy a linter would destroy exactly the fact
  // the decision record exists to preserve.
  for (const line of [
    'Those gates lived in `scripts/lib/autopilot-gate.mjs` when this ADR was written.',
    'commit c9c93ea9 moved `scripts/lib/connectors.mjs` out of this repo',
    '`packages/board/autopilot-api.mjs` was removed in the operate split',
    '`scripts/old.mjs` no longer exists',
  ]) {
    assert.deepEqual(deadSourceRefs(line, { exists: none }), [], line);
  }
});

test('a present-tense claim is still caught even in a document full of history', () => {
  const text = [
    '`scripts/old.mjs` was removed in June.',
    'The check runs from `scripts/lib/current.mjs` on every write.',
  ].join('\n');
  const d = deadSourceRefs(text, { exists: none });
  assert.deepEqual(d.map((x) => x.path), ['scripts/lib/current.mjs'],
    'an exemption applies to its own line, not to the whole file');
});

// ── the case this was written for ──────────────────────────────────────────

test('the AI-FIREWALL shape: a fresh document citing deleted code', () => {
  const doc = [
    '| Tool Gateway | the connector layer | `scripts/lib/connectors.mjs` |',
    '| Policy Engine | role authorization | `scripts/lib/roles.mjs` |',
    '| Decision Engine | the flow-runner | `scripts/lib/flow-runner.mjs` |',
    '| Audit Log | hash-chained | `scripts/lib/run-store.mjs` |',
  ].join('\n');
  const d = deadSourceRefs(doc, { exists: none });
  assert.equal(d.length, 4, 'every source pointer a reviewer was invited to verify');
  assert.deepEqual(d.map((x) => x.line), [1, 2, 3, 4]);
});

test('empty and malformed input yield nothing rather than throwing', () => {
  for (const t of ['', null, undefined, '`', '``', '`/`']) {
    assert.deepEqual(deadSourceRefs(t, { exists: none }), [], JSON.stringify(t));
  }
});
