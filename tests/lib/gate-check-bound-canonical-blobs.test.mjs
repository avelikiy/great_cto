import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {stableDigest} from '../../scripts/lib/ship-evidence-identity.mjs';
import {canonical} from '../fixtures/ship-evidence-identity/synthetic.mjs';
import {createRun, reassess, generation} from '../fixtures/ship-evidence-identity/stage2/bound-run.mjs';
import {scenario, sha} from '../fixtures/ship-evidence-identity/stage2/harness.mjs';

test('P07 actual raw snapshot blobs preserve numeric and Unicode codepoint canonical key ordering', t => {
  const f = createRun(t);
  const tricky = {'2': 'two', '10': 'ten', '\u{10000}': 'supplementary', '\uE000': 'bmp'};
  const tasks = [{id: 'synthetic:numeric-unicode-task', status: 'closed', labels: [], metadata: tricky}];
  const rawRecord = {v: 1, agent: 'qa-engineer', verdict: 'PASS', metadata: tricky};
  const journals = [{journalId: 'synthetic-numeric-unicode.log', originId: f.registration.journalOriginId, snapshotId: 'synthetic:canonical-snapshot', complete: true,
    records: [{rawDigest: sha(canonical(rawRecord)), outcome: 'PASS', role: 'qa-engineer', rawRecord}]}];
  scenario(f, {tasks, journals}); reassess(f);
  const captured = generation(f);
  for (const [field, payload] of [['taskSnapshotDigest', tasks], ['journalSnapshotDigest', journals]]) {
    const expectedBytes = canonical(payload), expectedDigest = stableDigest(payload);
    assert.equal(sha(expectedBytes), expectedDigest, 'independent canonical writer and frozen Stage1 oracle agree');
    assert.ok(expectedBytes.indexOf('"10":') < expectedBytes.indexOf('"2":'), 'lexical codepoint ordering of numeric-looking keys');
    assert.ok(expectedBytes.indexOf('"\uE000":') < expectedBytes.indexOf('"\u{10000}":'), 'BMP key precedes supplementary codepoint');
    assert.equal(captured[field], expectedDigest);
    const bytes = readFileSync(join(f.store, 'runs', f.state.id, 'blobs', `${captured[field]}.json`));
    assert.equal(bytes.toString('utf8'), expectedBytes, 'writer must not round-trip sorted numeric keys through an ordinary object');
    assert.equal(sha(bytes), expectedDigest); assert.deepEqual(JSON.parse(bytes), payload, 'complete raw values preserved');
  }
});
