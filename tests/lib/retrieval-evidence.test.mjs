import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrievalSnapshot, outboundRequest, refinementSession, validatedRanking, retrievalMetrics } from '../../scripts/lib/retrieval-evidence.mjs';

const corpus = [
  { id: 'private-filename', path: '/private/project/doc.md', text: '# Authored title\nIntro.\n## Recovery\nrecovery checkpoint resumes the queue' },
  { id: 'backup', text: '# Backup\nrecovery backup restores the database' },
];
const make = changes => retrievalSnapshot({ projectId: 'project-a', query: 'recovery checkpoint', corpus, provider: 'fixture', model: 'fixture-model', ...changes });
const answer = { results: [{ index: 1, relevance_score: 0.8 }, { index: 0, relevance_score: 0.3 }] };

test('snapshot selects original sections and never outbound filename enrichment', () => {
  const snapshot = make(), body = outboundRequest(snapshot);
  assert.equal(snapshot.candidates[0].line, 3);
  assert.match(body.documents[0], /## Recovery/);
  assert.equal(JSON.stringify(body).includes('private-filename'), false);
  assert.equal(JSON.stringify(body).includes('/private/project'), false);
  assert.equal(JSON.stringify(body).includes('project-a'), false);
  assert.equal(snapshot.candidates[0].semanticScore, null);
  // Authored paths/titles are not automatically scrubbed. No privacy guarantee for body text.
  assert.match(outboundRequest(make({ corpus: [{ id: 'x', text: '# recovery\n/private/authored-path checkpoint' }] })).documents[0], /authored-path/);
});

test('binding changes with project, query, source, provider, model or limits', () => {
  const snapshot = make();
  for (const change of [{ projectId: 'b' }, { query: 'recovery backup' }, { model: 'other' },
    { provider: 'other' }, { limit: 1 }, { corpus: [...corpus, { id: 'new', text: 'unrelated' }] }]) {
    assert.notEqual(make(change).digest, snapshot.digest);
  }
  const tampered = structuredClone(snapshot); tampered.candidates[0].text += '\nchanged';
  assert.throws(() => outboundRequest(tampered), /changed outbound/);
  const metadata = structuredClone(snapshot); metadata.candidates[0].provenance = 'generated';
  assert.throws(() => outboundRequest(metadata), /unsafe/);
});

test('bounded source/passage, duplicate IDs and sparse corpus fail closed', () => {
  for (const change of [{ corpus: [corpus[0], corpus[0]] }, { corpus: new Array(1) },
    { limit: 31 }, { corpus: [{ id: 'x', text: 'recovery ' + 'x'.repeat(16384) }] }]) assert.throws(() => make(change));
  assert.throws(() => outboundRequest(make({ query: 'zzyy' })), /no candidates/);
});

test('ranking requires a complete finite unique permutation', () => {
  assert.deepEqual(validatedRanking(answer.results, 2).map(r => r.index), [1,0]);
  for (const results of [[], new Array(2), [answer.results[0],answer.results[0]],
    [{ index: 0, relevance_score: NaN },answer.results[0]], [{ index: 3, relevance_score: 1 },answer.results[0]]]) assert.throws(() => validatedRanking(results,2));
});

test('manual refinement preserves baseline and forbids unapproved or repeated external sends', async () => {
  const snapshot = make(); let calls = 0;
  const session = refinementSession(snapshot, { rank: async () => { calls++; return answer; }, currentDigest: () => snapshot.digest });
  assert.equal((await session.refine({ inputDigest: snapshot.digest })).reason, 'external-not-authorized');
  const refined = await session.refine({ inputDigest: snapshot.digest, allowExternal: true });
  assert.equal(refined.status, 'refined'); assert.equal(refined.cost, null);
  assert.deepEqual(refined.baseline, snapshot.candidates.map(c => c.id));
  assert.deepEqual(refined.refined.map(r => r.id), [...refined.baseline].reverse());
  assert.equal((await session.refine({ inputDigest: snapshot.digest, allowExternal: true })).reason, 'billing-not-reconciled');
  assert.equal(calls,1);
});

test('duplicate in-flight, old response and changed project cannot replace new results', async () => {
  const snapshot = make(); let release, current = snapshot.digest, calls = 0;
  const session = refinementSession(snapshot, { rank: () => { calls++; return new Promise(r => { release = r; }); }, currentDigest: () => current });
  const pending = session.refine({ inputDigest: snapshot.digest, allowExternal: true });
  assert.equal((await session.refine({ inputDigest: snapshot.digest, allowExternal: true })).reason, 'busy');
  current = make({ projectId: 'other' }).digest; session.invalidate(); release(answer);
  assert.equal((await pending).status, 'stale'); assert.equal(session.view().refined,null); assert.equal(calls,1);
});

test('malformed response and provider failure preserve baseline without automatic retry', async () => {
  for (const rank of [async () => ({ results: [] }), async () => { throw Error('private provider details'); }]) {
    const snapshot = make(), session = refinementSession(snapshot,{ rank, currentDigest: () => snapshot.digest });
    const result = await session.refine({ inputDigest: snapshot.digest, allowExternal: true });
    assert.equal(result.status,'unavailable'); assert.deepEqual(result.baseline,snapshot.candidates.map(c => c.id));
    assert.equal(JSON.stringify(result).includes('private provider details'),false);
  }
  let calls = 0;
  const unreadable = refinementSession(make(), { rank: async () => { calls++; return answer; }, currentDigest: () => { throw Error('private diagnostic'); } });
  assert.equal((await unreadable.refine({inputDigest:make().digest,allowExternal:true})).reason,'freshness-unreadable');
  assert.equal(calls,0);
});

test('document quality differs from selected passage availability; unjudged is not zero', () => {
  const params = { corpusIds: ['a','b'], rankedIds: ['a','b'], grades: {a:3,b:3},
    passages: [{id:'a',text:'wrong section'},{id:'b',text:'checkpoint resumes'}], answerMarkers: {a:['checkpoint'],b:['checkpoint']} };
  const metrics = retrievalMetrics(params);
  assert.equal(metrics.ndcg,1); assert.equal(metrics.answerBearing,1);
  assert.equal(retrievalMetrics({...params, grades:{a:3}}).state,'unjudged');
  assert.equal(retrievalMetrics({...params, answerMarkers:{}}).answerBearing,null);
  assert.equal(retrievalMetrics({...params, grades:{a:0,b:0}}).ndcg,null);
  assert.throws(() => retrievalMetrics({...params, rankedIds:['a','a']}));
});
