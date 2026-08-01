// The edit-scope guard turns an IMPL-BRIEF's declared scope into a hard
// constraint at write time — the piece great_cto had parsed and checked, but
// only after the fact. Denylist is a hard block; "not in the allowlist" is
// advisory unless explicitly enforced; no active brief means no enforcement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decideEditScope, activeBriefPath, recordSliceWrite, maxSliceFiles } from '../../scripts/hooks/edit-scope-guard.mjs';
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

// ─── volume: WHICH files vs HOW MANY ───────────────────────────────────────
//
// The scope check answered which files a slice may touch and never how many. A
// brief that allows `src/**` says yes to most of a repo, so a slice could
// rewrite two hundred files and pass every check. The two questions are
// different, and the second is the one a reviewer feels: a diff nobody can hold
// in their head gets approved on trust rather than read.

const BRIEF_PATH = '/tmp/brief-a/IMPL-BRIEF.md';

test('distinct files are counted, repeated writes to one file are not', () => {
  let st = null;
  for (let i = 0; i < 40; i++) st = recordSliceWrite(st, BRIEF_PATH, 'src/app.ts', 5).state;
  assert.equal(recordSliceWrite(st, BRIEF_PATH, 'src/app.ts', 5).count, 1,
    'editing one file forty times is not a wide change');
});

test('the count crosses the line only past the limit', () => {
  let st = null, last;
  for (let i = 1; i <= 3; i++) {
    last = recordSliceWrite(st, BRIEF_PATH, `src/f${i}.ts`, 3);
    st = last.state;
  }
  assert.equal(last.count, 3);
  assert.equal(last.exceeded, false, 'at the limit is not over it');
  last = recordSliceWrite(st, BRIEF_PATH, 'src/f4.ts', 3);
  assert.equal(last.exceeded, true);
  assert.equal(last.count, 4);
});

test('a new brief starts a new slice', () => {
  let st = null;
  for (let i = 1; i <= 5; i++) st = recordSliceWrite(st, BRIEF_PATH, `src/f${i}.ts`, 3).state;
  const next = recordSliceWrite(st, '/tmp/brief-b/IMPL-BRIEF.md', 'src/other.ts', 3);
  assert.equal(next.count, 1, 'a finished slice must not lend its count to the next one');
  assert.equal(next.exceeded, false);
});

test('the same file under two spellings counts once', () => {
  const cwd = process.cwd();
  let st = recordSliceWrite(null, BRIEF_PATH, 'src/app.ts', 10).state;
  const r = recordSliceWrite(st, BRIEF_PATH, `${cwd}/src/app.ts`, 10);
  assert.equal(r.count, 1, 'an absolute path is the same file as its relative form');
});

test('corrupt prior state is treated as a fresh slice, not a crash', () => {
  for (const junk of [undefined, null, {}, { brief: BRIEF_PATH }, { brief: BRIEF_PATH, files: 'nope' }]) {
    assert.equal(recordSliceWrite(junk, BRIEF_PATH, 'src/a.ts', 3).count, 1);
  }
});

test('the limit is configurable and 0 disables the check', () => {
  assert.equal(maxSliceFiles({}), 30, 'a default exists so the check is on without configuration');
  assert.equal(maxSliceFiles({ GREAT_CTO_MAX_SLICE_FILES: '5' }), 5);
  assert.equal(maxSliceFiles({ GREAT_CTO_MAX_SLICE_FILES: '0' }), 0);
  let st = null;
  for (let i = 1; i <= 50; i++) st = recordSliceWrite(st, BRIEF_PATH, `src/f${i}.ts`, 0).state;
  assert.equal(recordSliceWrite(st, BRIEF_PATH, 'src/f51.ts', 0).exceeded, false, '0 means no limit');
});

test('an unparseable limit falls back rather than becoming NaN', () => {
  // NaN compares false against everything, which would disable the check by accident.
  for (const bad of ['abc', '-4', 'Infinity ']) {
    assert.equal(maxSliceFiles({ GREAT_CTO_MAX_SLICE_FILES: bad }), 30, bad);
  }
});
