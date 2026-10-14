#!/usr/bin/env node
/** Local frozen lexical/passage measurement; never sends data or calls a judge. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { contentDigest, retrievalSnapshot, retrievalMetrics } from './lib/retrieval-evidence.mjs';

export function runRetrievalPilot(protocol) {
  if (protocol?.version !== 1 || !Array.isArray(protocol.cases) || protocol.cases.length > 100
    || !Array.isArray(protocol.corpus) || new Set(protocol.cases.map(c => c.id)).size !== protocol.cases.length) throw Error('invalid pilot protocol');
  const ids = protocol.corpus.map(d => d.id);
  const cases = protocol.cases.map(c => {
    if (!Array.isArray(c.grades) || c.grades.length !== ids.length) throw Error('incomplete explicit qrels');
    const started = performance.now();
    const snapshot = retrievalSnapshot({ projectId:'synthetic-pilot', query:c.query, corpus:protocol.corpus });
    const rankedIds = snapshot.candidates.map(p => p.id), grades = Object.fromEntries(ids.map((id,i) => [id,c.grades[i]]));
    const markers = Object.fromEntries(ids.map(id => [id,c.markers?.[id] ?? []]));
    return { id:c.id, group:c.group, inputDigest:snapshot.digest, rankedIds,
      ...retrievalMetrics({ corpusIds:ids, rankedIds, grades, passages:snapshot.candidates, answerMarkers:markers }),
      latencyMs:performance.now()-started };
  });
  const positives = cases.filter(c => c.state === 'judged');
  return { version:1, protocolDigest:contentDigest(JSON.stringify(protocol)), annotation:protocol.annotation,
    corpusDigest:contentDigest(JSON.stringify(protocol.corpus)), queryDigest:contentDigest(JSON.stringify(protocol.cases.map(({id,query}) => ({id,query})))),
    qrelsDigest:contentDigest(JSON.stringify(protocol.cases.map(({id,grades,markers}) => ({id,grades,markers})))),
    hostExecution:'not-run', rerank:'not-run', cost:null, qualityUplift:null, cases,
    positiveCount:positives.length, noAnswerCount:cases.filter(c => c.state==='no-answer').length,
    hitAt1:positives.length ? positives.reduce((n,c) => n+c.hitAt1,0)/positives.length : null,
    meanNdcg:positives.length ? positives.reduce((n,c) => n+c.ndcg,0)/positives.length : null };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const source = new URL('../tests/fixtures/retrieval-pilot.json',import.meta.url);
  console.log(JSON.stringify(runRetrievalPilot(JSON.parse(readFileSync(source,'utf8'))),null,2));
}
