import { createHash } from 'node:crypto';

const MAX_BYTES = 16777216;
const negative = value => ['FAIL', 'BLOCKED', 'REJECTED', 'UNKNOWN'].includes(value);
const cpOrder = (a, b) => {
  const aa = Array.from(a, c => c.codePointAt(0)), bb = Array.from(b, c => c.codePointAt(0));
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return aa.length - bb.length;
};
const bytes = s => Buffer.byteLength(s, 'utf8');
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;

// Inspect descriptors, never property values: getters are not evidence.
function snapshot(value, depth = 0, ancestors = new Set()) {
  if (depth > 32) throw new TypeError('JSON depth exceeds limit');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (bytes(value) > 262144) throw new TypeError('JSON string exceeds limit');
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || (!Array.isArray(value) && !plain(value)) || ancestors.has(value)) throw new TypeError('Invalid JSON data');
  ancestors.add(value);
  const desc = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(desc).some(k => typeof k !== 'string')) throw new TypeError('Symbol key');
  const array = Array.isArray(value), out = array ? [] : {};
  const keys = Object.keys(desc);
  if (array && (!Number.isSafeInteger(desc.length?.value) || keys.length !== desc.length.value + 1)) throw new TypeError('Sparse or extended array');
  for (const key of keys) {
    if (array && key === 'length') continue;
    if (['__proto__', 'prototype', 'constructor'].includes(key) || bytes(key) > 262144) throw new TypeError('Invalid JSON key');
    const d = desc[key];
    if (!('value' in d) || !d.enumerable || (array && !/^(0|[1-9][0-9]*)$/.test(key))) throw new TypeError('Invalid JSON descriptor');
    out[key] = snapshot(d.value, depth + 1, ancestors);
  }
  ancestors.delete(value);
  return out;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plain(value)) return `{${Object.keys(value).sort(cpOrder).map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function validated(value) {
  const data = snapshot(value);
  if (bytes(JSON.stringify(data)) > MAX_BYTES) throw new TypeError('JSON input exceeds limit');
  return data;
}
export function stableDigest(jsonValue) {
  try { return createHash('sha256').update(canonical(validated(jsonValue)), 'utf8').digest('hex'); }
  catch { throw new TypeError('Invalid bounded JSON data'); }
}

const id = x => typeof x === 'string' && bytes(x) > 0 && bytes(x) <= 256 && !/[\u0000-\u001f\u007f-\u009f]/u.test(x);
const role = x => typeof x === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(x);
const sha = x => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
const oid = x => typeof x === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(x);
const ms = x => Number.isSafeInteger(x) && x >= 0;
const one = (...values) => x => values.includes(x);
const literal = value => x => x === value;
const nullableSha = x => x === null || sha(x);
const array = (check, cap = 10000) => x => Array.isArray(x) && x.length <= cap && x.every(check);
const ids = array(id);
const checks = array(id, 256);
function object(x, schema) {
  return plain(x) && Object.keys(x).length === Object.keys(schema).length && Object.entries(schema).every(([k, check]) => Object.hasOwn(x, k) && check(x[k]));
}
const origin = x => object(x, {journalId: id, ordinal: ms, rawDigest: sha});
const reviewer = x => object(x, {role, requiredChecks: checks, independentOf: ids}) && new Set(x.requiredChecks).size === x.requiredChecks.length;
const source = x => object(x, {head: oid, tree: oid, clean: x => typeof x === 'boolean', dirtyDigest: nullableSha, exclusionsDigest: sha}) && x.head.length === x.tree.length && (x.clean ? x.dirtyDigest === null : sha(x.dirtyDigest));
const evidenceClass = one('SOURCE_REVIEW', 'LOCAL_FIXTURE');
const expectedSchema = x => object(x, {version: literal('ship-context/v1'), repositoryId: id, projectId: id, source, taskId: id, runId: id, gateId: literal('gate:ship'), policyDigest: sha, requirementsDigest: sha, evidenceClass, requiredReviewers: array(reviewer, 128)});
const invocation = x => object(x, {version: literal('ship-assignment/v1'), reviewerInvocationId: id, role, expectedContextDigest: sha, taskId: id, runId: id, reviewerActorId: id, independentOf: ids, requiredChecks: checks, issuedAtMs: ms, expiresAtMs: ms, revoked: x => typeof x === 'boolean', origin: literal('CONTROLLER')}) && x.expiresAtMs > x.issuedAtMs;
const checkEvidence = x => object(x, {checkId: id, state: one('PASS', 'FAIL', 'NOT_CHECKED'), evidenceDigest: sha});
const outcome = one('PASS', 'FAIL', 'BLOCKED', 'REJECTED', 'UNKNOWN');
const record = x => object(x, {version: literal('ship-evidence/v2'), recordId: id, reviewerInvocationId: id, expectedContextDigest: sha, role, outcome, checkEvidence: array(checkEvidence, 256), reviewedEvidenceDigest: sha, authority: one('CONTROLLED_REVIEW', 'NONE', 'ADVISORY'), releaseEligibility: one('SOURCE_GATE_ONLY', 'NOT_CHECKED'), evidenceClass, findingIds: ids, startedAtMs: ms, finishedAtMs: ms, rawRecordDigest: sha, origin}) && bytes(JSON.stringify(x)) <= 262144;
const obligation = x => object(x, {findingId: id, originRecordDigest: sha, originContextDigest: nullableSha, role, severity: one('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'), category: id, origin});
function resolution(x) {
  const schema = {version: literal('ship-resolution/v1'), resolutionId: id, kind: one('TECHNICAL', 'OWNER_SUPERSESSION'), findingId: id, originRecordDigest: sha, originContextDigest: nullableSha, targetContextDigest: sha, reviewerInvocationId: id, reviewRecordId: id, fixCommit: oid, changeEvidenceDigest: sha, verificationEvidenceDigest: sha, implementerActorId: id};
  if (x?.kind === 'OWNER_SUPERSESSION') Object.assign(schema, {successorIdentity: id, coverageDisposition: id, ownerDecisionId: id});
  return object(x, schema);
}
const task = x => object(x, {id, state: one('open', 'in_progress', 'closed', 'blocked', 'failed', 'unverified', 'not_run', 'not-run')});
const ownerDecision = x => object(x, {decisionId: id, targetContextDigest: sha, findingId: id, successorIdentity: id, coverageDisposition: id, authenticated: x => typeof x === 'boolean'});
const readSchema = x => object(x, {version: literal('ship-read-status/v1'), nowMs: ms, context: one('COMPLETE', 'UNKNOWN'), assignments: one('COMPLETE', 'UNKNOWN'), journals: one('COMPLETE', 'UNKNOWN'), tasks: one('COMPLETE', 'UNKNOWN'), policy: one('COMPLETE', 'UNKNOWN'), origins: one('COMPLETE', 'UNKNOWN'), trustedOwnerDecisions: array(ownerDecision)});
const sortBy = key => (a, b) => cpOrder(a[key], b[key]) || cpOrder(canonical(a), canonical(b));
function preferObligation(a, b) {
  const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
  const delta = severities.indexOf(a.severity) - severities.indexOf(b.severity);
  return delta < 0 || (delta === 0 && cpOrder(canonical(a), canonical(b)) < 0) ? a : b;
}
function emptyResult() {
  return {version: 'ship-result/v1', state: 'UNKNOWN', contextDigest: null, mandatoryReviews: [], openObligations: [], resolvedObligations: [], supersededObligations: [], blockingTasks: [], diagnostics: [], authority: 'NONE', releaseEligibility: 'NOT_CHECKED', evidenceClass: 'LOCAL_FIXTURE'};
}

function negativeObligations(r) {
  if (!plain(r) || !negative(r.outcome) || !sha(r.rawRecordDigest) || !role(r.role) || !origin(r.origin) || !nullableSha(r.expectedContextDigest) || !ids(r.findingIds)) return [];
  return (r.findingIds.length ? r.findingIds : [`record:${r.rawRecordDigest}`]).map(findingId => ({findingId, originRecordDigest: r.rawRecordDigest, originContextDigest: r.expectedContextDigest, role: r.role, severity: 'UNKNOWN', category: 'review', origin: r.origin}));
}

// A hostile sibling must not erase previously supplied, independently valid findings.
// Each recovery read is descriptor-only and bounded; no accessor is invoked.
function recoverObligations(input) {
  const recovered = [];
  try {
    if (!plain(input)) return recovered;
    const top = Object.getOwnPropertyDescriptors(input);
    for (const key of ['obligations', 'records']) {
      const value = top[key]?.value;
      if (!Array.isArray(value)) continue;
      const descriptors = Object.getOwnPropertyDescriptors(value), length = descriptors.length?.value;
      if (!ms(length) || length > 10000) continue;
      for (let i = 0; i < length; i++) {
        try {
          const item = descriptors[i]?.value;
          if (key === 'obligations') {
            const data = validated(item);
            if (obligation(data)) recovered.push(data);
          } else {
            if (!plain(item)) continue;
            const fields = Object.getOwnPropertyDescriptors(item), minimal = {};
            for (const field of ['outcome', 'rawRecordDigest', 'role', 'origin', 'expectedContextDigest', 'findingIds']) {
              if (!fields[field] || !('value' in fields[field])) throw new TypeError('Unreadable negative');
              minimal[field] = fields[field].value;
            }
            recovered.push(...negativeObligations(validated(minimal)));
          }
        } catch { /* The outer UNKNOWN records the unreadable evidence. */ }
      }
    }
  } catch { /* Hostile proxy: preserve everything already recovered. */ }
  const unique = new Map();
  for (const o of recovered) {
    const key = canonical([o.findingId, o.originRecordDigest, o.originContextDigest, o.role, o.origin]);
    unique.set(key, unique.has(key) ? preferObligation(o, unique.get(key)) : o);
  }
  return [...unique.values()].sort(sortBy('findingId'));
}

export function evaluateBoundShipEvidence(input) {
  const result = emptyResult();
  let unknown = false, blocked = false;
  const diagnostic = (code, subject) => result.diagnostics.push({code, subject});
  try {
    const x = validated(input);
    if (!plain(x)) throw new TypeError('Input schema');
    const fields = ['expected', 'invocations', 'records', 'obligations', 'resolutions', 'tasks', 'readStatus'];
    if (Object.keys(x).length !== fields.length || fields.some(k => !Object.hasOwn(x, k))) { unknown = true; diagnostic('INVALID_SCHEMA', 'input'); }
    const lists = {};
    for (const [key, check] of Object.entries({invocations: invocation, records: record, obligations: obligation, resolutions: resolution, tasks: task})) {
      lists[key] = [];
      if (!Array.isArray(x[key]) || x[key].length > 10000) { unknown = true; diagnostic('INVALID_BOUNDS', key); continue; }
      for (const item of x[key]) {
        if (check(item)) lists[key].push(item);
        else { unknown = true; diagnostic('INVALID_SCHEMA', key); }
      }
    }
    const expectedValid = expectedSchema(x.expected), readValid = readSchema(x.readStatus);
    if (!expectedValid || !readValid) { unknown = true; diagnostic('INVALID_SCHEMA', !expectedValid ? 'expected' : 'readStatus'); }
    const e = expectedValid ? x.expected : null, read = readValid ? x.readStatus : null;
    let contextValid = false;
    if (e) {
      result.contextDigest = stableDigest(e);
      contextValid = e.source.clean && e.requirementsDigest === stableDigest(e.requiredReviewers) && ['qa-engineer', 'security-officer'].every(r => e.requiredReviewers.some(q => q.role === r)) && new Set(e.requiredReviewers.map(r => r.role)).size === e.requiredReviewers.length;
      if (!contextValid) { unknown = true; diagnostic('INVALID_CONTEXT', 'expected'); }
    }
    if (read && ['context', 'assignments', 'journals', 'tasks', 'policy', 'origins'].some(k => read[k] !== 'COMPLETE')) { unknown = true; diagnostic('INCOMPLETE_READ', 'readStatus'); }
    const deduplicate = (items, key) => {
      const map = new Map(), conflicts = new Set();
      for (const item of items) {
        const old = map.get(item[key]);
        if (old && canonical(old) !== canonical(item)) { blocked = true; conflicts.add(item[key]); diagnostic('IDENTITY_CONFLICT', item[key]); }
        else map.set(item[key], item);
      }
      for (const key of conflicts) map.delete(key);
      return map;
    };
    const invs = deduplicate(lists.invocations, 'reviewerInvocationId');
    const records = deduplicate(lists.records, 'recordId');
    const resolutions = deduplicate(lists.resolutions, 'resolutionId');
    const validPass = new Map();
    if (contextValid && read) for (const r of records.values()) {
      const required = e.requiredReviewers.find(q => q.role === r.role), inv = invs.get(r.reviewerInvocationId);
      if (!required || !inv || r.outcome !== 'PASS' || r.findingIds.length || inv.revoked || inv.role !== required.role || inv.expectedContextDigest !== result.contextDigest || r.expectedContextDigest !== result.contextDigest || inv.taskId !== e.taskId || inv.runId !== e.runId || inv.issuedAtMs > read.nowMs || read.nowMs >= inv.expiresAtMs || r.startedAtMs < inv.issuedAtMs || r.startedAtMs > r.finishedAtMs || r.finishedAtMs >= inv.expiresAtMs || r.finishedAtMs > read.nowMs || r.authority !== 'CONTROLLED_REVIEW' || r.releaseEligibility !== 'SOURCE_GATE_ONLY' || r.evidenceClass !== e.evidenceClass) continue;
      if (required.independentOf.some(a => a === inv.reviewerActorId || !inv.independentOf.includes(a)) || inv.independentOf.includes(inv.reviewerActorId)) continue;
      if (canonical([...new Set(inv.requiredChecks)].sort(cpOrder)) !== canonical([...required.requiredChecks].sort(cpOrder))) continue;
      if (new Set(r.checkEvidence.map(c => c.checkId)).size !== r.checkEvidence.length || !required.requiredChecks.every(c => r.checkEvidence.some(v => v.checkId === c && v.state === 'PASS'))) continue;
      validPass.set(r.recordId, r);
    }
    if (e) result.mandatoryReviews = e.requiredReviewers.map(q => {
      const recordIds = [...validPass.values()].filter(r => r.role === q.role).map(r => r.recordId).sort(cpOrder);
      if (!recordIds.length) { blocked = true; diagnostic('MISSING_REVIEW', q.role); }
      return {role: q.role, satisfied: recordIds.length > 0, recordIds};
    }).sort(sortBy('role'));
    const obligations = new Map();
    const addObligation = o => {
      // Severity metadata cannot erase the identity of the original obligation.
      const key = canonical([o.findingId, o.originRecordDigest, o.originContextDigest, o.role, o.origin]);
      obligations.set(key, obligations.has(key) ? preferObligation(o, obligations.get(key)) : o);
    };
    for (const o of lists.obligations) addObligation(o);
    // Harvest negatives before assignment/context filtering, even when other metadata is malformed.
    if (Array.isArray(x.records) && x.records.length <= 10000) for (const r of x.records) {
      if (!plain(r) || !negative(r.outcome)) continue;
      if (!sha(r.rawRecordDigest) || !role(r.role) || !origin(r.origin) || !nullableSha(r.expectedContextDigest) || !ids(r.findingIds)) { unknown = true; diagnostic('UNREADABLE_NEGATIVE', 'records'); continue; }
      for (const findingId of r.findingIds.length ? r.findingIds : [`record:${r.rawRecordDigest}`]) addObligation({findingId, originRecordDigest: r.rawRecordDigest, originContextDigest: r.expectedContextDigest, role: r.role, severity: 'UNKNOWN', category: 'review', origin: r.origin});
    }
    const targets = new Map();
    const targetKey = o => canonical([o.findingId, o.originRecordDigest, o.originContextDigest]);
    for (const o of obligations.values()) {
      const key = targetKey(o), origins = targets.get(key) || new Set();
      origins.add(canonical([o.role, o.origin]));
      targets.set(key, origins);
    }
    for (const o of obligations.values()) {
      // Resolution schema cannot distinguish these occurrences. Require a new,
      // unambiguous identity rather than clearing multiple origins accidentally.
      if (targets.get(targetKey(o)).size > 1) {
        blocked = true;
        diagnostic('AMBIGUOUS_FINDING_ORIGIN', o.findingId);
        result.openObligations.push(o);
        continue;
      }
      const matches = [...resolutions.values()].filter(r => r.findingId === o.findingId && r.originRecordDigest === o.originRecordDigest && r.originContextDigest === o.originContextDigest && r.targetContextDigest === result.contextDigest);
      const unique = new Map(matches.map(r => [canonical(r), r]));
      if (unique.size > 1) { blocked = true; diagnostic('RESOLUTION_CONFLICT', o.findingId); result.openObligations.push(o); continue; }
      const r = matches[0], review = r && validPass.get(r.reviewRecordId), inv = r && invs.get(r.reviewerInvocationId);
      let disposition = 'openObligations';
      if (r && review && inv && review.reviewerInvocationId === inv.reviewerInvocationId && review.role === o.role && inv.role === o.role && inv.reviewerActorId !== r.implementerActorId && inv.independentOf.includes(r.implementerActorId) && r.fixCommit === e?.source.head) {
        if (r.kind === 'TECHNICAL') disposition = 'resolvedObligations';
        else if (e.evidenceClass === 'LOCAL_FIXTURE' && read?.trustedOwnerDecisions.some(d => d.authenticated && d.decisionId === r.ownerDecisionId && d.targetContextDigest === r.targetContextDigest && d.findingId === r.findingId && d.successorIdentity === r.successorIdentity && d.coverageDisposition === r.coverageDisposition)) disposition = 'supersededObligations';
      }
      result[disposition].push(o);
    }
    result.blockingTasks = lists.tasks.filter(t => ['blocked', 'failed', 'unverified', 'not_run', 'not-run'].includes(t.state)).sort(sortBy('id'));
    if (result.openObligations.length || result.blockingTasks.length) blocked = true;
    for (const key of ['openObligations', 'resolvedObligations', 'supersededObligations']) result[key].sort(sortBy('findingId'));
    result.state = unknown ? 'UNKNOWN' : blocked ? 'BLOCKED' : 'PASS';
  } catch {
    result.state = 'UNKNOWN';
    result.openObligations = recoverObligations(input);
    result.resolvedObligations = [];
    result.supersededObligations = [];
    diagnostic('INVALID_INPUT', 'input');
  }
  result.diagnostics = [...new Map(result.diagnostics.map(d => [canonical(d), d])).values()].sort(sortBy('code'));
  return result;
}

const legacyRecord = x => object(x, {rawDigest: sha, outcome, role});
const legacyEntry = x => object(x, {ordinal: ms, rawDigest: sha, outcome, role, findingId: id});
const legacyJournal = x => object(x, {journalId: id, originId: id, entries: array(legacyEntry)}) && x.entries.every((r, ordinal) => r.ordinal === ordinal && r.findingId === `legacy:${stableDigest({originId: x.originId, journalId: x.journalId, ordinal, rawDigest: r.rawDigest})}`);
const journal = x => object(x, {journalId: id, originId: id, snapshotId: id, complete: literal(true), records: array(legacyRecord)});
export function normalizeLegacyOrigins(input) {
  const out = {state: 'UNKNOWN', registry: {version: 'ship-origin-registry/v1', journals: []}, obligations: [], diagnostics: []};
  try {
    const x = validated(input);
    if (!plain(x) || !Object.hasOwn(x, 'registry') || !Object.hasOwn(x, 'journals') || Object.keys(x).length !== 2) throw new TypeError('Input schema');
    if (x.registry !== null) {
      if (!object(x.registry, {version: literal('ship-origin-registry/v1'), journals: array(legacyJournal)}) || new Set(x.registry.journals.map(j => j.journalId)).size !== x.registry.journals.length) throw new TypeError('Registry schema');
      out.registry = x.registry;
    }
    let invalid = !array(journal)(x.journals);
    const incoming = invalid ? [] : x.journals;
    if (new Set(incoming.map(j => j.journalId)).size !== incoming.length) invalid = true;
    const prior = new Map(out.registry.journals.map(j => [j.journalId, j]));
    const additions = new Map(prior);
    for (const old of prior.values()) if (!incoming.some(j => j.journalId === old.journalId)) invalid = true;
    for (const j of incoming) {
      const old = prior.get(j.journalId);
      if (old && (old.originId !== j.originId || j.records.length < old.entries.length || old.entries.some((r, ordinal) => canonical({rawDigest: r.rawDigest, outcome: r.outcome, role: r.role}) !== canonical(j.records[ordinal])))) { invalid = true; continue; }
      additions.set(j.journalId, {journalId: j.journalId, originId: j.originId, entries: j.records.map((r, ordinal) => ({ordinal, ...r, findingId: `legacy:${stableDigest({originId: j.originId, journalId: j.journalId, ordinal, rawDigest: r.rawDigest})}`}))});
    }
    // An ambiguous capture never changes the last complete registry.
    if (!invalid) out.registry = {version: 'ship-origin-registry/v1', journals: [...additions.values()].sort(sortBy('journalId'))};
    out.state = invalid ? 'UNKNOWN' : 'PASS';
    if (invalid) out.diagnostics.push({code: 'LEGACY_PREFIX_UNKNOWN', subject: 'journals'});
  } catch {
    // Keep the last valid prefix even if a new snapshot contains hostile data.
    try {
      const descriptor = Object.getOwnPropertyDescriptor(input, 'registry');
      if (descriptor && 'value' in descriptor) {
        const prior = validated(descriptor.value);
        if (object(prior, {version: literal('ship-origin-registry/v1'), journals: array(legacyJournal)}) && new Set(prior.journals.map(j => j.journalId)).size === prior.journals.length) out.registry = prior;
      }
    } catch { /* Invalid registry is not treated as an empty authoritative prefix. */ }
    out.diagnostics.push({code: 'INVALID_INPUT', subject: 'legacy'});
  }
  for (const j of out.registry.journals) for (const r of j.entries) if (negative(r.outcome)) out.obligations.push({findingId: r.findingId, originRecordDigest: r.rawDigest, originContextDigest: null, role: r.role, severity: 'UNKNOWN', category: 'legacy', origin: {journalId: j.journalId, ordinal: r.ordinal, rawDigest: r.rawDigest}});
  out.obligations.sort(sortBy('findingId'));
  return out;
}
