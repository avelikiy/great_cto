/**
 * The Work Packet List, read mechanically.
 *
 * `decomposition_matrix_required = true` has been in the orchestrator contract
 * since it was written, and the only thing that ever happened as a result was
 * that the words got printed at SubagentStart. Nothing read a matrix, so a run
 * with no matrix at all and a run with a good one were the same run.
 *
 * The overlap checker already existed and already proves "why parallel-safe"
 * mechanically — but it eats a hand-written lanes.json, and building that by
 * hand from the table is exactly the step people skip. This closes that gap:
 * the table itself is the input.
 *
 * Three states throughout. `absent` (no table) and `malformed` (a table that
 * cannot be read) must never render the same, because one means "write one" and
 * the other means "fix the one you wrote".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWpl, lanesFromWpl, checkWpl } from '../../scripts/lib/wpl.mjs';

const GOOD = `
## Work Packet List — auth

| # | Name | Class | Owned files | Depends on | Agent | Acceptance criterion |
|---|------|-------|------------|-----------|-------|---------------------|
| 1 | Research auth | Research | (read-only) | — | Explore | 3+ options listed |
| 2 | Implement auth | Implementation | src/auth/*.ts | Packet 1 | senior-dev | Tests green |
| 3 | Implement schema | Implementation | migrations/*.sql | Packet 1 | senior-dev | Migration clean |
| 4 | QA | Verification | (read-only) | Packets 2, 3 | qa-engineer | QA report PASS |
`;

test('a well-formed WPL parses into packets', () => {
  const r = parseWpl(GOOD);
  assert.equal(r.state, 'parsed');
  assert.equal(r.packets.length, 4);
  assert.equal(r.packets[1].name, 'Implement auth');
  assert.equal(r.packets[1].cls, 'Implementation');
  assert.deepEqual(r.packets[1].files, ['src/auth/*.ts']);
});

test('no table at all is absent — not malformed, not empty-but-fine', () => {
  const r = parseWpl('# A plan\n\nWe will do the thing, then the other thing.');
  assert.equal(r.state, 'absent');
  assert.equal(r.packets.length, 0);
});

test('a table missing the columns the contract names is malformed', () => {
  // "There is a table" is not "there is a decomposition matrix". A table with no
  // write-zone column cannot answer the only question the matrix exists for.
  const r = parseWpl(`
| # | Name | Agent |
|---|------|-------|
| 1 | Do it | senior-dev |
`);
  assert.equal(r.state, 'malformed');
  assert.match(r.problems.join(' '), /Owned files|column/i);
});

test('read-only packets claim no lanes', () => {
  // Research and Verification read; only Implementation writes. Treating
  // "(read-only)" as an owned path would make every research packet collide.
  const lanes = lanesFromWpl(parseWpl(GOOD).packets);
  assert.equal(lanes.length, 2);
  assert.deepEqual(lanes.map((l) => l.files).flat(), ['src/auth/*.ts', 'migrations/*.sql']);
});

test('several files in one cell become several claims', () => {
  const r = parseWpl(`
| # | Name | Class | Owned files | Depends on | Agent | Acceptance criterion |
|---|------|-------|------------|-----------|-------|---------------------|
| 1 | Both | Implementation | src/a.ts, src/b.ts | — | senior-dev | green |
`);
  assert.deepEqual(r.packets[0].files, ['src/a.ts', 'src/b.ts']);
});

test('disjoint write zones pass the check', () => {
  const v = checkWpl(GOOD);
  assert.equal(v.ok, true);
  assert.equal(v.state, 'parsed');
  assert.equal(v.conflicts.length, 0);
});

test('overlapping write zones fail the check and name the file', () => {
  const v = checkWpl(`
| # | Name | Class | Owned files | Depends on | Agent | Acceptance criterion |
|---|------|-------|------------|-----------|-------|---------------------|
| 1 | A | Implementation | src/auth/login.ts | — | senior-dev | green |
| 2 | B | Implementation | src/auth/*.ts | — | senior-dev | green |
`);
  assert.equal(v.ok, false);
  assert.match(JSON.stringify(v.conflicts), /login\.ts/,
    'the glob must be expanded — a line-level compare misses src/auth/*.ts vs src/auth/login.ts');
});

test('an absent matrix is not ok, and says which of the two problems it is', () => {
  const v = checkWpl('no table here');
  assert.equal(v.ok, false);
  assert.equal(v.state, 'absent');
  assert.match(v.summary, /no Work Packet List|absent/i);
  assert.doesNotMatch(v.summary, /overlap/i, 'a missing matrix is not an overlap finding');
});

test('a single implementation packet needs no overlap check but still parses', () => {
  const v = checkWpl(`
| # | Name | Class | Owned files | Depends on | Agent | Acceptance criterion |
|---|------|-------|------------|-----------|-------|---------------------|
| 1 | Only | Implementation | src/a.ts | — | senior-dev | green |
`);
  assert.equal(v.ok, true);
  assert.equal(v.lanes, 1);
});

test('the matrix as CLAUDE.md spells it is read too', () => {
  // CLAUDE.md: `Stream | Write-zone (files/dirs) | Depends on | Why parallel-safe`.
  // coordinator.md emits the WPL spelling and says the two are the same table.
  // Knowing only one of them means calling the other "absent" — reporting "no
  // matrix" at a document that is nothing but the matrix.
  const r = parseWpl(`
| Stream | Write-zone (files/dirs) | Depends on | Why parallel-safe |
|--------|------------------------|------------|-------------------|
| auth   | src/auth/*.ts          | —          | no shared state   |
| schema | migrations/*.sql       | —          | no shared state   |
`);
  assert.equal(r.state, 'parsed');
  assert.equal(r.packets.length, 2);
  assert.equal(r.packets[0].name, 'auth');
  assert.deepEqual(r.packets[0].files, ['src/auth/*.ts']);
  assert.equal(checkWpl(`
| Stream | Write-zone | Depends on | Why parallel-safe |
|--------|-----------|------------|-------------------|
| a | src/auth/*.ts | — | disjoint |
| b | src/auth/login.ts | — | disjoint |
`).ok, false, 'the overlap must be caught in this spelling too');
});

test('a read-only cell claims no lane even with no Class column', () => {
  // In the CLAUDE.md spelling there IS no Class column, so the cell is the only
  // thing that can say a stream does not write. Without this the string
  // "(read-only)" becomes a path, and every reading stream collides with every
  // other one — burying real findings under noise.
  const lanes = lanesFromWpl(parseWpl(`
| Stream | Write-zone | Depends on | Why parallel-safe |
|--------|-----------|------------|-------------------|
| research-a | (read-only) | — | reads only |
| research-b | (read-only) | — | reads only |
| build | src/a.ts | — | sole writer |
`).packets);
  assert.equal(lanes.length, 1, 'only the writing stream claims a lane');
  assert.equal(lanes[0].lane, 'build');
});
