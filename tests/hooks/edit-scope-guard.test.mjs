// The edit-scope guard turns an IMPL-BRIEF's declared scope into a hard
// constraint at write time — the piece great_cto had parsed and checked, but
// only after the fact. Denylist is a hard block; "not in the allowlist" is
// advisory unless explicitly enforced; no active brief means no enforcement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decideEditScope, activeBriefPath } from '../../scripts/hooks/edit-scope-guard.mjs';
import { parseBrief } from '../../scripts/lib/impl-brief.mjs';

// Paths are backtick-wrapped — the format impl-brief.mjs's parser reads.
const BRIEF = parseBrief(`# IMPL-BRIEF-TASK-1

## Files to modify
- \`packages/board/lib/routes.mjs\`
- \`packages/board/*.test.mjs\`

## Files NOT to modify
- \`packages/board/server.mjs\`
- \`docs/gates/**\`

## Acceptance
- board tests pass
`);

test('a denylisted file is a hard deny', () => {
  const d = decideEditScope('packages/board/server.mjs', BRIEF);
  assert.equal(d.decision, 'deny');
  assert.equal(d.kind, 'denylist');
  assert.match(d.reason, /NOT-to-modify/);
});

test('a denylist glob (docs/gates/**) is a hard deny', () => {
  const d = decideEditScope('docs/gates/GATE-arch.md', BRIEF);
  assert.equal(d.decision, 'deny');
});

test('an allowlisted file is allowed', () => {
  assert.equal(decideEditScope('packages/board/lib/routes.mjs', BRIEF).decision, 'allow');
});

test('an allowlist glob matches', () => {
  assert.equal(decideEditScope('packages/board/read-safe.test.mjs', BRIEF).decision, 'allow');
});

test('a file on neither list is advisory (warn), not blocked, by default', () => {
  const d = decideEditScope('packages/cli/src/main.ts', BRIEF);
  assert.equal(d.decision, 'warn', 'scope creep is surfaced, not blocked');
  assert.equal(d.kind, 'allowlist-advisory');
});

test('block mode upgrades an allowlist miss to a hard deny', () => {
  const d = decideEditScope('packages/cli/src/main.ts', BRIEF, { mode: 'block' });
  assert.equal(d.decision, 'deny');
  assert.equal(d.kind, 'allowlist-strict');
});

test('block mode does NOT override the denylist verdict kind', () => {
  const d = decideEditScope('packages/board/server.mjs', BRIEF, { mode: 'block' });
  assert.equal(d.decision, 'deny');
  assert.equal(d.kind, 'denylist', 'a denylist hit stays a denylist hit');
});

test('no active brief → allow (enforcement only while a brief is active)', () => {
  assert.equal(decideEditScope('anything.ts', null).decision, 'allow');
});

test('no file path → allow', () => {
  assert.equal(decideEditScope(null, BRIEF).decision, 'allow');
});

test('activeBriefPath prefers the env var', () => {
  assert.equal(
    activeBriefPath({ GREAT_CTO_ACTIVE_BRIEF: '/x/IMPL-BRIEF-9.md' }, '/repo'),
    '/x/IMPL-BRIEF-9.md',
  );
});

test('activeBriefPath reads the pointer file and resolves it against cwd', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-scope-'));
  fs.mkdirSync(path.join(dir, '.great_cto'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.great_cto', 'active-brief'), 'docs/impl-briefs/IMPL-BRIEF-3.md\n');
  try {
    assert.equal(activeBriefPath({}, dir), path.join(dir, 'docs/impl-briefs/IMPL-BRIEF-3.md'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('activeBriefPath returns null when nothing is active', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-scope-'));
  try { assert.equal(activeBriefPath({}, dir), null); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
