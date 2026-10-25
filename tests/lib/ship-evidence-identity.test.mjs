// Independent acceptance oracle for FREEZE-SHIP-EVIDENCE-IDENTITY-V1.
// Fixtures carry authority NONE and publication NOT_CHECKED. No real journals/models.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import childProcess from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import { stableDigest, evaluateBoundShipEvidence as evaluate, normalizeLegacyOrigins as normalize } from '../../scripts/lib/ship-evidence-identity.mjs';
import { fixture, sha, digest, copy, negative, obligation, resolution, freeze } from '../fixtures/ship-evidence-identity/synthetic.mjs';

const ids = rows => rows.map(r => r.findingId).sort();
const neverPass = (input, why) => assert.notEqual(evaluate(input).state, 'PASS', why);
function outer(result) {
  assert.equal(result.version, 'ship-result/v1');
  assert.equal(result.authority, 'NONE');
  assert.equal(result.releaseEligibility, 'NOT_CHECKED');
  assert.equal(result.evidenceClass, 'LOCAL_FIXTURE');
}
function pass(input) {
  const result = evaluate(input); outer(result); assert.equal(result.state, 'PASS');
  assert.equal(result.contextDigest, digest(input.expected));
  assert.equal(result.mandatoryReviews.length, input.expected.requiredReviewers.length);
  assert.ok(result.mandatoryReviews.every(r => r.satisfied && r.recordIds.length));
  assert.deepEqual(result.openObligations, []); return result;
}
function unknown(input) { const result = evaluate(input); outer(result); assert.equal(result.state, 'UNKNOWN'); return result; }

test('P01 exact complete native assignments satisfy all three reviewers; outer result is non-authoritative', () => {
  pass(fixture()); pass(fixture('SOURCE_REVIEW'));
});
test('stableDigest independently matches canonical SHA256; object order irrelevant, arrays ordered', () => {
  const value = {z: [3, {b: false, a: 'é'}], a: null};
  assert.equal(stableDigest(value), digest(value));
  assert.equal(stableDigest({b: 2, a: 1}), stableDigest({a: 1, b: 2}));
  assert.notEqual(stableDigest([1, 2]), stableDigest([2, 1]));
  assert.equal(stableDigest(freeze(value)), digest(value));
  assert.equal(stableDigest({'\u{10000}': 1, '\uE000': 2}), sha('{"\uE000":2,"\u{10000}":1}'), 'Unicode codepoint order, not UTF16 surrogate order');
});
test('stableDigest rejects lossy/nonplain/prototype/cyclic JSON with TypeError', () => {
  const cycle = {}; cycle.self = cycle;
  for (const value of [undefined, NaN, Infinity, -Infinity, () => 1, 1n, Symbol('x'), new Date(), new Map(), {x: undefined}, [undefined], [,], {x: () => 1}, Object.create({x: 1}), JSON.parse('{"__proto__":1}'), {constructor: 1}, {prototype: 1}, cycle]) {
    assert.throws(() => stableDigest(value), TypeError);
  }
});
test('N09 accessors and hostile proxies are rejected without executing getter; evaluator never leaks exception', () => {
  let calls = 0; const accessor = {}; Object.defineProperty(accessor, 'payload', {enumerable: true, get() { calls++; throw new Error('getter executed'); }});
  const proxy = new Proxy({}, {ownKeys() {throw new Error('hostile proxy');}, getPrototypeOf() {throw new Error('hostile proxy');}});
  for (const value of [accessor, proxy]) {
    assert.throws(() => stableDigest(value), TypeError);
    const input = fixture(); input.records.push(value); unknown(input);
  }
  assert.equal(calls, 0);
});
test('N09 root depth0 and string UTF8 caps are exact for canonical data', () => {
  const nested = n => {let v = 0; for (let i = 0; i < n; i++) v = [v]; return v;};
  assert.equal(stableDigest(nested(32)), digest(nested(32)));
  assert.throws(() => stableDigest(nested(33)), TypeError);
  const at = 'é'.repeat(131072); assert.equal(stableDigest(at), digest(at));
  assert.throws(() => stableDigest(at + 'x'), TypeError);
});

const identityMutations = {
  repositoryId: x => {x.expected.repositoryId += ':other';}, projectId: x => {x.expected.projectId += ':other';},
  taskId: x => {x.expected.taskId += ':other';}, runId: x => {x.expected.runId += ':other';},
  gateId: x => {x.expected.gateId = 'gate:plan';}, head: x => {x.expected.source.head = '3'.repeat(40);},
  tree: x => {x.expected.source.tree = '4'.repeat(40);}, policy: x => {x.expected.policyDigest = sha('other-policy');},
  requirements: x => {x.expected.requiredReviewers[0].requiredChecks.push('check:new'); x.expected.requirementsDigest = digest(x.expected.requiredReviewers);},
  exclusion: x => {x.expected.source.exclusionsDigest = sha('arbitrary-exclusion');},
  class: x => {x.expected.evidenceClass = 'SOURCE_REVIEW';},
};
for (const [field, mutate] of Object.entries(identityMutations)) test(`N01 ${field} cannot transfer old evidence or old resolution`, () => {
  const input = fixture(); const old = negative(input); input.resolutions.push(resolution(input, old));
  mutate(input); const result = evaluate(input); assert.notEqual(result.state, 'PASS');
  assert.equal(result.resolvedObligations.length, 0);
  assert.ok(result.mandatoryReviews.every(r => !r.satisfied));
});
test('N02 dirty tracked/untracked identity, inconsistent clean digest and mixed OID widths fail closed', () => {
  for (const source of [{clean: false, dirtyDigest: sha('tracked')}, {clean: false, dirtyDigest: sha('untracked')}, {clean: true, dirtyDigest: sha('unexpected')}, {head: 'a'.repeat(64)}, {tree: 'A'.repeat(40)}]) {
    const input = fixture(); Object.assign(input.expected.source, source); unknown(input);
  }
});
test('N03 absent, revoked, expired, not-yet-issued, self-review and role alias assignments refuse', () => {
  const mutations = [x => {x.invocations = [];}, x => {x.invocations[0].revoked = true;},
    x => {x.readStatus.nowMs = 1000;}, x => {x.invocations[0].issuedAtMs = 500;},
    x => {x.invocations[0].reviewerActorId = 'actor:implementer';}, x => {x.invocations[0].origin = 'SELF';},
    x => {x.invocations[0].role = 'qa';}, x => {x.invocations[0].requiredChecks = ['check:unrelated'];},
    x => {x.invocations[0].taskId = 'task:other';}, x => {x.invocations[0].runId = 'run:other';},
    x => {x.invocations[0].independentOf = [];}, x => {x.records[0].reviewerInvocationId = 'self-declared';},
    x => {x.records[0].startedAtMs = 99;}, x => {x.records[0].finishedAtMs = 1001;},
    x => {x.records[0].startedAtMs = 301;}, x => {x.records[0].finishedAtMs = 401;}];
  for (const mutate of mutations) {const input = fixture(); mutate(input); neverPass(input);}
});
test('N03 every required check needs PASS evidence and a valid digest', () => {
  for (const change of [r => r.checkEvidence.pop(), r => {r.checkEvidence[0].state = 'FAIL';}, r => {r.checkEvidence[0].state = 'NOT_CHECKED';}, r => {r.checkEvidence[0].evidenceDigest = '';}, r => {r.reviewedEvidenceDigest = '';}]) {
    const input = fixture(); change(input.records[0]); neverPass(input);
  }
});
test('N04 all negatives survive generic PASS, unassigned, wrong context and authority NONE', () => {
  const input = fixture(); const a = negative(input, 'A'); const b = negative(input, 'B', {authority: 'NONE', expectedContextDigest: sha('old-context'), reviewerInvocationId: 'unassigned'});
  const result = evaluate(input); assert.equal(result.state, 'BLOCKED');
  assert.deepEqual(ids(result.openObligations), ['finding:A', 'finding:B']);
  assert.deepEqual(result.resolvedObligations, []);
  for (const outcome of ['BLOCKED', 'REJECTED', 'UNKNOWN']) {
    const next = fixture(); negative(next, outcome, {outcome}); assert.ok(evaluate(next).openObligations.length >= 1);
  }
  assert.ok(a && b);
});
test('negative without explicit findings receives raw-record fallback; malformed negative cannot disappear', () => {
  const input = fixture(); const bad = negative(input, 'A', {findingIds: []});
  assert.ok(ids(evaluate(input).openObligations).includes(`record:${bad.rawRecordDigest}`));
  input.obligations.push(obligation({...bad, findingIds: ['supplied:old']}));
  input.records.push('{not-json'); const result = unknown(input);
  assert.ok(ids(result.openObligations).includes('supplied:old'));
});
test('P02 explicit technical resolution closes only A, B stays OPEN and next context cannot reuse', () => {
  const input = fixture(); const a = negative(input, 'A', {expectedContextDigest: sha('previous-context')}); negative(input, 'B');
  input.resolutions.push(resolution(input, a)); const result = evaluate(input);
  assert.equal(result.state, 'BLOCKED'); assert.deepEqual(ids(result.resolvedObligations), ['finding:A']); assert.deepEqual(ids(result.openObligations), ['finding:B']);
  input.expected.source.head = 'c'.repeat(40); const future = evaluate(input);
  assert.equal(future.resolvedObligations.length, 0); assert.ok(ids(future.openObligations).includes('finding:A'));
});
test('P02 a valid explicit resolution plus current complete reviews can satisfy the candidate', () => {
  const input = fixture(); const a = negative(input); input.resolutions.push(resolution(input, a));
  const result = pass(input); assert.deepEqual(ids(result.resolvedObligations), ['finding:A']);
});
test('N05 wrong role, self-review, missing fix/check/target, wrong finding and conflicting resolution never clear', () => {
  const changes = [r => {r.reviewerInvocationId = 'invocation:security-officer'; r.reviewRecordId = 'review:security-officer';},
    r => {r.implementerActorId = 'actor:qa-engineer';}, r => {delete r.fixCommit;},
    r => {delete r.verificationEvidenceDigest;}, r => {delete r.changeEvidenceDigest;},
    r => {r.targetContextDigest = sha('other-target');}, r => {r.originRecordDigest = sha('unrelated');},
    r => {r.originContextDigest = sha('unrelated');}, r => {r.findingId = 'absent';},
    r => {r.reviewRecordId = 'negative:A';}, r => {r.reviewerInvocationId = 'missing';}];
  for (const change of changes) {
    const input = fixture(); const a = negative(input); const r = resolution(input, a); change(r); input.resolutions.push(r);
    const result = evaluate(input); assert.notEqual(result.state, 'PASS'); assert.equal(result.resolvedObligations.length, 0);
  }
  const input = fixture(); const a = negative(input); const r = resolution(input, a); input.resolutions = [r, {...r, verificationEvidenceDigest: sha('conflict')}];
  neverPass(input);
});
test('N06 legacy obligations remain open through generic v2 PASS and untrusted meta/exception claims', () => {
  const input = fixture(); const legacy = obligation(negative(input)); legacy.originContextDigest = null;
  input.records.pop(); input.obligations = [legacy]; assert.deepEqual(ids(evaluate(input).openObligations), ['finding:A']);
  for (const field of ['meta', 'exceptions', 'approvedBy', 'as']) {const next = copy(input); next[field] = {resolves: ['finding:A']}; unknown(next);}
});
test('P04 owner supersession is distinct, explicit and LOCAL_FIXTURE only', () => {
  const input = fixture(); const a = negative(input); const r = {...resolution(input, a), kind: 'OWNER_SUPERSESSION', successorIdentity: 'successor:review', coverageDisposition: 'covered-by-successor', ownerDecisionId: 'owner:synthetic'};
  input.resolutions.push(r); input.readStatus.trustedOwnerDecisions.push({decisionId: r.ownerDecisionId, targetContextDigest: r.targetContextDigest, findingId: r.findingId, successorIdentity: r.successorIdentity, coverageDisposition: r.coverageDisposition, authenticated: true});
  const result = pass(input); assert.deepEqual(ids(result.supersededObligations), ['finding:A']); assert.deepEqual(result.resolvedObligations, []);
  for (const change of [x => {x.readStatus.trustedOwnerDecisions = [];}, x => {x.readStatus.trustedOwnerDecisions[0].authenticated = false;}, x => {x.readStatus.trustedOwnerDecisions[0].findingId = 'other';}]) {const next = copy(input); change(next); neverPass(next);}
  const source = fixture('SOURCE_REVIEW'); const bad = negative(source); const live = {...r, ...resolution(source, bad), kind: 'OWNER_SUPERSESSION', successorIdentity: r.successorIdentity, coverageDisposition: r.coverageDisposition, ownerDecisionId: r.ownerDecisionId};
  source.resolutions = [live]; source.readStatus.trustedOwnerDecisions = [{...input.readStatus.trustedOwnerDecisions[0], targetContextDigest: live.targetContextDigest}]; neverPass(source);
});
test('N08/N12 advisory, NONE, Kimi and fixture evidence cannot become SOURCE_REVIEW or artifact proof', () => {
  for (const fields of [{authority: 'NONE'}, {authority: 'ADVISORY'}, {role: 'kimi'}, {evidenceClass: 'LOCAL_FIXTURE'}, {releaseEligibility: 'NOT_CHECKED'}, {evidenceClass: 'ARTIFACT_REVIEW'}, {releaseEligibility: 'PUBLISHABLE'}]) {
    const input = fixture('SOURCE_REVIEW'); Object.assign(input.records[0], fields); neverPass(input);
  }
  const input = fixture(); input.expected.requiredReviewers = input.expected.requiredReviewers.filter(r => r.role !== 'security-officer'); input.expected.requirementsDigest = digest(input.expected.requiredReviewers); unknown(input);
});
test('N09 each incomplete read fails UNKNOWN and takes precedence over known blockers', () => {
  for (const field of ['context', 'assignments', 'journals', 'tasks', 'policy', 'origins']) {
    const input = fixture(); negative(input); input.readStatus[field] = 'UNKNOWN'; unknown(input);
  }
});
test('N09 malformed schema, IDs, numbers, digests, versions, unexpected fields never throw or pass', () => {
  const changes = [x => {x.expected = null;}, x => {x.records = null;}, x => {x.expected.version = 'ship-context/v2';},
    x => {x.expected.repositoryId = '';}, x => {x.expected.projectId = 'control\n';}, x => {x.expected.taskId = 'é'.repeat(129);},
    x => {x.expected.policyDigest = 'A'.repeat(64);}, x => {x.expected.requirementsDigest = sha('wrong');},
    x => {x.readStatus.nowMs = NaN;}, x => {x.readStatus.nowMs = -1;}, x => {x.readStatus.nowMs = Number.MAX_SAFE_INTEGER + 1;},
    x => {x.invocations[0].expiresAtMs = 100;}, x => {x.records[0].origin.ordinal = 0.5;},
    x => {x.records[0].meta = {resolves: ['finding:A']};}, x => {x.expected.source.branch = 'main';},
    x => {x.records[0].version = 'ship-evidence/v99';}, x => {x.tasks = [{id: 'task:x', state: 'mystery'}];},
    x => {x.expected.requiredReviewers[0].role = 'QA-ENGINEER';}, x => {x.expected.source = new Date();},
    x => {x.expected.source = JSON.parse('{"__proto__":true}');}];
  for (const change of changes) {const input = fixture(); change(input); unknown(input);}
  for (const input of [null, undefined, [], {}, 'raw']) assert.doesNotThrow(() => {assert.equal(evaluate(input).state, 'UNKNOWN');});
});
test('N10 exact duplicate records and invocations deduplicate; changed bytes under same ID block', () => {
  const input = fixture(); input.records.push(copy(input.records[0])); input.invocations.push(copy(input.invocations[0])); pass(input);
  for (const mutate of [x => {x.records.at(-1).reviewedEvidenceDigest = sha('conflict');}, x => {x.invocations.at(-1).reviewerActorId = 'actor:different';}]) {
    const next = copy(input); mutate(next); assert.equal(evaluate(next).state, 'BLOCKED');
  }
});
test('N11 seven global blocked tasks and terminal failure floors survive unrelated candidate IDs', () => {
  const input = fixture(); negative(input, 'A'); negative(input, 'B');
  const blocked = Array.from({length: 7}, (_, i) => ({id: `foreign:blocked:${i}`, state: 'blocked'}));
  const terminal = ['failed', 'unverified', 'not_run', 'not-run'].map(state => ({id: `foreign:${state}`, state}));
  input.tasks = [...blocked, ...terminal, ...['closed', 'open', 'in_progress'].map(state => ({id: `ordinary:${state}`, state}))];
  const result = evaluate(input); assert.equal(result.state, 'BLOCKED'); assert.equal(result.blockingTasks.length, 11);
  assert.deepEqual(result.blockingTasks.map(t => t.id).sort(), [...blocked, ...terminal].map(t => t.id).sort()); assert.equal(result.openObligations.length, 2);
});

const journal = records => ({journalId: 'journal:legacy', originId: 'origin:pinned', snapshotId: 'snapshot:one', complete: true, records});
const rawNegative = {rawDigest: sha('same raw negative'), outcome: 'FAIL', role: 'qa-engineer'};
test('P03/N07 legacy IDs bind origin+ordinal+raw, ignore snapshots, preserve append and distinct repeated bytes', () => {
  const first = normalize({registry: null, journals: [journal([rawNegative, rawNegative])]});
  assert.notEqual(first.state, 'UNKNOWN'); assert.equal(first.obligations.length, 2);
  const wanted = [0, 1].map(ordinal => `legacy:${digest({originId: 'origin:pinned', journalId: 'journal:legacy', ordinal, rawDigest: rawNegative.rawDigest})}`).sort();
  assert.deepEqual(ids(first.obligations), wanted);
  const second = normalize({registry: first.registry, journals: [{...journal([rawNegative, rawNegative, {rawDigest: sha('positive'), outcome: 'PASS', role: 'qa-engineer'}]), snapshotId: 'snapshot:two'}]});
  assert.notEqual(second.state, 'UNKNOWN'); assert.deepEqual(ids(second.obligations), wanted);
  assert.deepEqual(normalize({registry: second.registry, journals: [{...journal([rawNegative, rawNegative, {rawDigest: sha('positive'), outcome: 'PASS', role: 'qa-engineer'}]), snapshotId: 'snapshot:three'}]}).registry, second.registry);
  const input = fixture(); input.obligations = first.obligations; const legacy = first.obligations[0];
  const target = {findingIds: [legacy.findingId], rawRecordDigest: legacy.originRecordDigest, expectedContextDigest: legacy.originContextDigest};
  input.resolutions = [resolution(input, target)]; const r = evaluate(input);
  assert.equal(r.resolvedObligations.length, 1); assert.equal(r.openObligations.length, 1);
  input.obligations = second.obligations; assert.deepEqual(ids(evaluate(input).resolvedObligations), ids(r.resolvedObligations));
});
test('N07 missing/truncated/replaced/rotated/incomplete legacy prefix retains old obligations UNKNOWN', () => {
  const first = normalize({registry: null, journals: [journal([rawNegative, rawNegative])]});
  for (const journals of [[], [journal([])], [journal([rawNegative])], [journal([{...rawNegative, rawDigest: sha('replacement')}, rawNegative])], [{...journal([rawNegative, rawNegative]), originId: 'origin:rotated'}], [{...journal([rawNegative, rawNegative]), complete: false}]]) {
    const result = normalize({registry: first.registry, journals}); assert.equal(result.state, 'UNKNOWN');
    assert.deepEqual(ids(result.obligations), ids(first.obligations));
  }
});
test('legacy malformed input fails closed without throwing', () => {
  for (const value of [null, {}, {registry: null, journals: null}, {registry: {}, journals: []}, {registry: null, journals: [{...journal([rawNegative]), originId: ''}]}]) assert.doesNotThrow(() => assert.equal(normalize(value).state, 'UNKNOWN'));
});

test('N09 array cap exact boundary accepted, boundary+1 UNKNOWN, no silent truncation', () => {
  const builders = {
    tasks: x => ({id: `closed:${x}`, state: 'closed'}),
    records: (x, input) => copy(input.records[x % input.records.length]),
    invocations: (x, input) => copy(input.invocations[x % input.invocations.length]),
    obligations: x => ({...obligation({...fixture().records[0], findingIds: [`cap:${x}`]}), findingId: `cap:${x}`}),
    resolutions: x => ({...resolution(fixture(), {findingIds: [`absent:${x}`], rawRecordDigest: sha('old'), expectedContextDigest: sha('old-context')}, String(x))}),
  };
  for (const [key, make] of Object.entries(builders)) {
    const input = fixture(); input[key] = Array.from({length: 10000}, (_, i) => make(i, fixture()));
    assert.notEqual(evaluate(input).state, 'UNKNOWN', `${key} exact cap`);
    input[key].push(make(10000, fixture())); unknown(input);
  }
});
test('N09 reviewer128/check256 boundaries, baseline floors and ID256 UTF8 boundaries', () => {
  for (const n of [128, 129]) {
    const input = fixture(); while (input.expected.requiredReviewers.length < n) input.expected.requiredReviewers.push({role: `reviewer-${input.expected.requiredReviewers.length}`, requiredChecks: ['check:x'], independentOf: ['actor:implementer']});
    input.expected.requirementsDigest = digest(input.expected.requiredReviewers);
    if (n === 129) unknown(input); else assert.notEqual(evaluate(input).state, 'UNKNOWN');
  }
  for (const n of [256, 257]) {
    const input = fixture(); const checks = Array.from({length: n}, (_, i) => `check:${i}`);
    input.expected.requiredReviewers[0].requiredChecks = checks; input.expected.requirementsDigest = digest(input.expected.requiredReviewers);
    if (n === 257) unknown(input); else assert.notEqual(evaluate(input).state, 'UNKNOWN');
  }
  const input = fixture(); input.tasks = [{id: 'é'.repeat(128), state: 'closed'}]; pass(input);
  input.tasks[0].id += 'x'; unknown(input);
});
// Pad only legal IDs in a negative record. No unknown padding fields or privileged data.
function recordOfBytes(template, target) {
  const record = copy(template); record.findingIds = [];
  let remaining = target - Buffer.byteLength(JSON.stringify(record));
  while (remaining > 258) {
    const id = String(record.findingIds.length).padStart(6, '0') + 'x'.repeat(244);
    record.findingIds.push(id);
    remaining = target - Buffer.byteLength(JSON.stringify(record));
  }
  // A new string costs its UTF8 length + quotes + comma (except first entry).
  const overhead = record.findingIds.length ? 3 : 2;
  assert.ok(remaining > overhead && remaining <= 259);
  record.findingIds.push('y'.repeat(remaining - overhead));
  assert.equal(Buffer.byteLength(JSON.stringify(record)), target); return record;
}
test('N09 recordBytes262144 exact accepted and +1 UNKNOWN; retained obligations are not truncated', () => {
  const input = fixture(); const a = negative(input); input.records.pop();
  const at = recordOfBytes(a, 262144); input.records.push(at);
  const result = evaluate(input); assert.equal(result.state, 'BLOCKED'); assert.equal(result.openObligations.length, at.findingIds.length);
  input.records[input.records.length - 1] = recordOfBytes(a, 262145); unknown(input);
});
test('N09 inputBytes16777216 exact accepted, +1 UNKNOWN without silent truncation', () => {
  const input = fixture(); const template = negative(input); input.records.pop();
  const large = recordOfBytes(template, 262144);
  // Exact identical duplicates add size without manufacturing >10000 distinct obligations.
  while (Buffer.byteLength(JSON.stringify(input)) + 262145 + 262145 < 16777216) input.records.push(large);
  const remaining = 16777216 - Buffer.byteLength(JSON.stringify(input)) - 1;
  // Split residual into legal individual records rather than exceeding recordBytes.
  if (remaining > 262144) input.records.push(large);
  const tailSize = 16777216 - Buffer.byteLength(JSON.stringify(input)) - 1;
  const tail = recordOfBytes({...template, recordId: 'negative:tail', rawRecordDigest: sha('tail')}, tailSize);
  input.records.push(tail); assert.equal(Buffer.byteLength(JSON.stringify(input)), 16777216);
  assert.equal(evaluate(input).state, 'BLOCKED');
  tail.findingIds[tail.findingIds.length - 1] += 'x';
  assert.equal(Buffer.byteLength(JSON.stringify(input)), 16777217); unknown(input);
});
test('P05 deterministic normalized collections, frozen inputs, no mutation', () => {
  const input = fixture(); negative(input, 'B'); negative(input, 'A'); input.tasks = [{id: 'z', state: 'blocked'}, {id: 'a', state: 'open'}];
  const before = JSON.stringify(input); const result = evaluate(freeze(input));
  assert.equal(JSON.stringify(input), before); assert.equal(JSON.stringify(evaluate(input)), JSON.stringify(result));
  const shuffled = copy(input); shuffled.records.reverse(); shuffled.invocations.reverse(); shuffled.tasks.reverse();
  assert.deepEqual(evaluate(shuffled), result);
  assert.deepEqual(ids(result.openObligations), result.openObligations.map(x => x.findingId));
  assert.deepEqual(result.blockingTasks.map(x => x.id), ['z']);
  assert.deepEqual(result.mandatoryReviews.map(x => x.role), [...result.mandatoryReviews.map(x => x.role)].sort());
});
test('P05 execution uses no fs, subprocess, network, time or randomness', () => {
  const input = fixture(); const restores = [];
  function trap(object, key) {const old = object[key]; if (typeof old !== 'function') return; object[key] = () => {throw new Error(`forbidden IO: ${key}`);}; restores.push(() => {object[key] = old;});}
  try {
    for (const key of ['readFileSync', 'writeFileSync', 'readdirSync', 'statSync', 'openSync']) trap(fs, key);
    for (const key of ['readFile', 'writeFile', 'readdir', 'stat', 'open']) trap(fsp, key);
    for (const key of ['exec', 'execSync', 'spawn', 'spawnSync', 'fork']) trap(childProcess, key);
    for (const object of [http, https]) for (const key of ['get', 'request']) trap(object, key);
    trap(net, 'connect'); trap(net, 'createConnection'); trap(Date, 'now'); trap(Math, 'random'); trap(globalThis, 'fetch');
    syncBuiltinESMExports(); pass(input); assert.equal(stableDigest({a: 1}), digest({a: 1}));
    const result = normalize({registry: null, journals: [journal([rawNegative])]}); assert.notEqual(result.state, 'UNKNOWN');
  } finally { restores.reverse().forEach(restore => restore()); syncBuiltinESMExports(); }
});

test('N05/N07 ambiguous resolution cannot clear two negative occurrences with distinct immutable origins', () => {
  const input = fixture();
  const first = negative(input, 'A');
  const second = negative(input, 'B', {
    findingIds: [...first.findingIds], rawRecordDigest: first.rawRecordDigest,
    expectedContextDigest: first.expectedContextDigest, role: first.role,
    origin: {...copy(first.origin), ordinal: first.origin.ordinal + 1},
  });
  input.resolutions.push(resolution(input, first));
  const result = evaluate(input);
  assert.ok(['UNKNOWN', 'BLOCKED'].includes(result.state));
  assert.deepEqual(result.resolvedObligations, [], 'one ambiguous target never clears either occurrence');
  assert.equal(result.openObligations.length, 2, 'all distinct negative origins stay OPEN');
  assert.deepEqual(result.openObligations.map(row => row.origin.ordinal).sort((a, b) => a - b), [first.origin.ordinal, second.origin.ordinal]);
});

test('N09 hostile proxy sibling preserves independently valid supplied obligations in UNKNOWN', () => {
  const input = fixture(); const old = negative(input, 'A');
  input.records.pop(); input.obligations.push(obligation(old));
  input.records.push(new Proxy({}, {
    ownKeys() {throw new Error('synthetic hostile sibling ownKeys');},
    getPrototypeOf() {throw new Error('synthetic hostile sibling prototype');},
    get() {throw new Error('synthetic hostile sibling getter');},
  }));
  const result = unknown(input);
  assert.equal(result.openObligations.length, 1);
  assert.equal(result.openObligations[0].findingId, old.findingIds[0]);
  assert.equal(result.openObligations[0].originRecordDigest, old.rawRecordDigest);
  assert.deepEqual(result.openObligations[0].origin, old.origin);
});
