import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {createRun, reassess, reviewAll, gate, generation} from '../fixtures/ship-evidence-identity/stage2/bound-run.mjs';
import {git, commit, stored} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

test('N13 files-empty source review cannot complete using an ignored uncommitted required report', async t => {
  const f = createRun(t); const report = 'docs/qa-engineer.md';
  git(f, 'rm', '--cached', '--', report); writeFileSync(join(f.root, '.gitignore'), `${report}\n`); commit(f, 'synthetic ignored report is not committed evidence');
  assert.equal(existsSync(join(f.root, report)), true); assert.ok(readFileSync(join(f.root, report), 'utf8').trim());
  assert.equal(git(f, 'status', '--porcelain=v1', '--untracked-files=all'), ''); assert.equal(git(f, 'ls-tree', 'HEAD', '--', report), '');
  reassess(f); let failure; try {await reviewAll(f);} catch (error) {failure = error;}
  assert.match(String(failure?.code || failure?.message || f.state.reason), /UNSUPPORTED_REVIEW_OUTPUT/);
  assert.notEqual(gate(f).state, 'PASS');
  assert.equal(generation(f).records.filter(row => row.role === 'qa-engineer' && row.outcome === 'PASS').length, 0);
  assert.equal(stored(f, f.state.id).results['qa-engineer'], undefined); assert.equal(stored(f, f.state.id).approvals.length, 0);
});
test('P06 files-empty source reviews complete when required reports are tracked in the committed candidate', async t => {
  const f = createRun(t);
  for (const report of ['docs/qa-engineer.md', 'docs/security-officer.md']) {
    assert.ok(git(f, 'ls-tree', 'HEAD', '--', report)); assert.ok(readFileSync(join(f.root, report), 'utf8').trim());
  }
  reassess(f); await reviewAll(f); assert.equal(gate(f).state, 'PASS');
  assert.equal(generation(f).records.filter(row => row.outcome === 'PASS').length, 2);
  assert.equal(git(f, 'status', '--porcelain=v1', '--untracked-files=all'), '');
});
