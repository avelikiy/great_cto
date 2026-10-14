import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runRetrievalPilot } from '../../scripts/retrieval-benchmark.mjs';
const protocol = JSON.parse(readFileSync(new URL('../fixtures/retrieval-pilot.json',import.meta.url),'utf8'));

test('pilot binds corpus/query/qrels and distinguishes positive, no-answer and passage evidence', () => {
  const report = runRetrievalPilot(protocol);
  assert.equal(report.positiveCount,10); assert.equal(report.noAnswerCount,2);
  assert.equal(report.rerank,'not-run'); assert.equal(report.qualityUplift,null);
  const long = report.cases.find(c => c.id==='en-passage');
  assert.equal(long.ndcg,1); assert.equal(long.answerBearing,0, 'correct document does not certify the chosen passage');
  for (const c of report.cases.filter(c => c.state==='no-answer')) assert.equal(c.ndcg,null);
  const changed = structuredClone(protocol); changed.cases[0].grades[0]=2;
  const next = runRetrievalPilot(changed);
  assert.notEqual(next.qrelsDigest,report.qrelsDigest); assert.equal(next.corpusDigest,report.corpusDigest);
  assert.throws(() => runRetrievalPilot({...protocol,cases:[{...protocol.cases[0],grades:[]}]}));
});
