/** Bounded retrieval observations, never approval or semantic confidence. */
import { createHash } from 'node:crypto';
import { searchMemory, splitSections } from './memory-search.mjs';

export const RETRIEVAL_VERSION = 1;
export const contentDigest = value => createHash('sha256').update(value).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const string = (value, max) => typeof value === 'string' && value.trim().length > 0 && Buffer.byteLength(value) <= max;

/** Select original authored sections. Filename/title enrichment is not outbound text. */
export function retrievalSnapshot({ projectId, query, corpus, provider = 'none', model = 'none', limit = 30 } = {}) {
  if (!string(projectId, 256) || !string(query, 4096) || !string(provider, 128) || !string(model, 256)
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 30 || !Array.isArray(corpus)
    || corpus.length > 500) throw Error('invalid retrieval scope');
  const seen = new Set(); let bytes = 0;
  const sources = Array.from(corpus, d => {
    if (!d || !string(d.id, 1024) || seen.has(d.id) || typeof d.text !== 'string'
      || Buffer.byteLength(d.text) > 1024 * 1024 || (bytes += Buffer.byteLength(d.text)) > 8 * 1024 * 1024) throw Error('invalid retrieval corpus');
    seen.add(d.id);
    return { id: d.id, text: d.text, path: d.path ?? null, kind: d.kind ?? 'doc' };
  });
  const corpusDigest = contentDigest(JSON.stringify(sources.map(d => ({ id: d.id, hash: contentDigest(d.text) })).sort((a,b) => a.id.localeCompare(b.id))));
  const byId = new Map(sources.map(d => [d.id, d]));
  const candidates = searchMemory({ query, corpus: sources, source: 'docs', limit }).map(r => {
    const source = byId.get(r.file), section = splitSections(source.text).find(s => s.line === r.line);
    const text = section?.text ?? source.text;
    // Never silently clip a passage: removing the answer would falsify the experiment.
    if (Buffer.byteLength(text) > 16384) throw Error('selected passage exceeds outbound limit');
    return { id: source.id, sourceDigest: contentDigest(source.text), line: section?.line ?? 1,
      text, textDigest: contentDigest(text), provenance: 'authored-source', semanticScore: null, lexicalScore: r.score };
  });
  const binding = { version: RETRIEVAL_VERSION, projectId, queryDigest: contentDigest(query), corpusDigest,
    provider, model, limit, candidates: candidates.map(({id, sourceDigest, line, textDigest}) => ({id, sourceDigest, line, textDigest})) };
  return { binding, digest: contentDigest(JSON.stringify(binding)), query, candidates };
}

/** Validate the snapshot rather than trusting caller-supplied IDs/hashes/provenance. */
export function outboundRequest(snapshot) {
  const b = snapshot?.binding, candidates = snapshot?.candidates;
  if (b?.version !== RETRIEVAL_VERSION || !hex(snapshot?.digest) || contentDigest(JSON.stringify(b)) !== snapshot.digest
    || !string(snapshot.query, 4096) || contentDigest(snapshot.query) !== b.queryDigest
    || !Array.isArray(candidates) || candidates.length > 30 || candidates.length !== b.candidates?.length) throw Error('unbound retrieval snapshot');
  let bytes = 0;
  const documents = Array.from(candidates, (c, i) => {
    const bound = b.candidates[i];
    if (!c || c.provenance !== 'authored-source' || !hex(c.sourceDigest) || !string(c.text, 16384)
      || contentDigest(c.text) !== c.textDigest || !Number.isSafeInteger(c.line) || c.line < 1
      || JSON.stringify({id: c.id, sourceDigest: c.sourceDigest, line: c.line, textDigest: c.textDigest}) !== JSON.stringify(bound)
      || (bytes += Buffer.byteLength(c.text)) > 128 * 1024) throw Error('unsafe or changed outbound passage');
    return c.text;
  });
  if (!documents.length) throw Error('no candidates to refine');
  // Local IDs, project identity and source paths never become provider fields.
  return { query: snapshot.query, documents, model: b.model, top_n: documents.length };
}

/** Complete finite permutation only; scores are relevance observations, not confidence. */
export function validatedRanking(results, count) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 30 || !Array.isArray(results) || results.length !== count) throw Error('incomplete rerank response');
  const seen = new Set();
  const checked = Array.from(results, r => {
    if (!r || !Number.isSafeInteger(r.index) || r.index < 0 || r.index >= count || seen.has(r.index)
      || typeof r.relevance_score !== 'number' || !Number.isFinite(r.relevance_score)) throw Error('invalid rerank response');
    seen.add(r.index); return { index: r.index, score: r.relevance_score };
  });
  return checked.sort((a,b) => b.score - a.score || a.index - b.index);
}

/** In-memory cooperative fencing. No durable billing journal or exactly-once guarantee. */
export function refinementSession(snapshot, { rank, currentDigest, external = true } = {}) {
  if (typeof rank !== 'function' || typeof currentDigest !== 'function') throw Error('refinement adapter and freshness probe required');
  const frozen = structuredClone(snapshot);
  outboundRequest(frozen);
  let generation = 0, busy = false, sent = false, refined = null, status = 'baseline';
  const fresh = () => { try { return currentDigest() === frozen.digest; } catch { return null; } };
  const view = () => ({ status, baseline: frozen.candidates.map(c => c.id), refined: refined && structuredClone(refined),
    cost: null, costState: 'not-measured', inputDigest: frozen.digest });
  return {
    view,
    invalidate() { generation++; status = 'stale'; refined = null; },
    async refine({ inputDigest, allowExternal = false } = {}) {
      if (busy) return { ...view(), reason: 'busy' };
      const freshness = fresh();
      if (freshness === null) return { ...view(), status: 'unavailable', reason: 'freshness-unreadable' };
      if (status === 'stale' || inputDigest !== frozen.digest || !freshness) return { ...view(), status: 'stale', reason: 'input-changed' };
      if (external && allowExternal !== true) return { ...view(), reason: 'external-not-authorized' };
      if (external && sent) return { ...view(), reason: 'billing-not-reconciled' };
      const epoch = generation; busy = true; status = 'running';
      sent = true;
      try {
        const response = await rank(outboundRequest(frozen));
        const after = fresh();
        if (after === null || epoch !== generation || !after) { status = after === null ? 'unavailable' : 'stale'; refined = null; return view(); }
        const order = validatedRanking(response?.results, frozen.candidates.length);
        refined = order.map(r => ({ id: frozen.candidates[r.index].id, relevanceScore: r.score })); status = 'refined';
      } catch {
        // Do not leak provider errors, payloads or credentials. No automatic retry.
        status = epoch !== generation || fresh() === false ? 'stale' : 'unavailable'; refined = null;
      } finally { busy = false; }
      return view();
    },
  };
}

/** Full qrels required; unjudged and no-answer are not manufactured zero-quality scores. */
export function retrievalMetrics({ corpusIds, rankedIds, grades, passages = [], answerMarkers = {}, k = 10 } = {}) {
  if (!Array.isArray(corpusIds) || corpusIds.length > 500 || !Array.isArray(rankedIds) || rankedIds.length > 30 || !grades || !Number.isSafeInteger(k) || k < 1 || k > 30
    || new Set(corpusIds).size !== corpusIds.length || new Set(rankedIds).size !== rankedIds.length
    || rankedIds.some(id => !corpusIds.includes(id))) throw Error('invalid benchmark membership');
  if (corpusIds.some(id => !Object.hasOwn(grades,id) || !Number.isInteger(grades[id]) || grades[id] < 0 || grades[id] > 3)) return { state: 'unjudged', hitAt1: null, recall: null, ndcg: null, answerBearing: null };
  const relevant = corpusIds.filter(id => grades[id] >= 2), top = rankedIds.slice(0,k);
  if (!relevant.length) return { state: 'no-answer', hitAt1: null, recall: null, ndcg: null, answerBearing: null, candidateCount: rankedIds.length };
  const dcg = values => values.reduce((sum, grade, i) => sum + (2 ** grade - 1) / Math.log2(i+2), 0);
  const ideal = dcg(corpusIds.map(id => grades[id]).sort((a,b) => b-a).slice(0,k));
  const byId = new Map(passages.map(p => [p.id, p.text]));
  const judgedPassages = top.every(id => Object.hasOwn(answerMarkers,id) && typeof byId.get(id) === 'string');
  return { state: 'judged', hitAt1: grades[top[0]] >= 2 ? 1 : 0,
    recall: relevant.filter(id => rankedIds.includes(id)).length / relevant.length,
    ndcg: ideal ? dcg(top.map(id => grades[id])) / ideal : null,
    answerBearing: !judgedPassages ? null : top.filter(id => Array.isArray(answerMarkers[id]) && answerMarkers[id].length > 0
      && answerMarkers[id].every(marker => typeof marker === 'string' && marker.length > 0 && byId.get(id).includes(marker))).length };
}
