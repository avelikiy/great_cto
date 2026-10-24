import { readFileSync, writeFileSync, lstatSync, realpathSync, existsSync, mkdirSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, sep, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { stableDigest, evaluateBoundShipEvidence, normalizeLegacyOrigins } from './ship-evidence-identity.mjs';
import { readShipPolicy, captureShipContext, recheckShipContext, assertCommittedShipArtifacts } from './ship-evidence-context.mjs';
import { codexRunStore } from './codex-host-state.mjs';
import { normalizeTask } from './gate-check.mjs';
import { parseVerdictLine } from './verdict-record.mjs';
import { canonicalAgent, verdictKind } from './ship-evidence.mjs';
import { invocationIdentity } from './invocation-identity.mjs';

const brands = new WeakMap();
const caps = new WeakMap();
const sha = x => createHash('sha256').update(x).digest('hex');
const fail = (code, extra = {}) => { throw Object.assign(new Error(code), {code, ...extra}); };
const uuid = x => typeof x === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x);
const hex = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const positive = x => Number.isSafeInteger(x) && x > 0;
const id = x => typeof x === 'string' && Buffer.byteLength(x) > 0 && Buffer.byteLength(x) <= 256 && !/[\x00-\x1f\x7f-\x9f]/u.test(x);
const exact = (x, keys) => x && Object.getPrototypeOf(x) === Object.prototype && Object.keys(x).sort().join('|') === [...keys].sort().join('|');
const clone = x => structuredClone(x);
const inside = (a, b) => { const r = relative(a, b); return r === '' || (!isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`)); };
const codepointOrder = (a, b) => {
  const aa = Array.from(a, c => c.codePointAt(0)), bb = Array.from(b, c => c.codePointAt(0));
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return aa.length - bb.length;
};
// JSON.stringify on a reconstructed object would reorder integer-looking keys.
// Serialize the ordered key/value pairs directly, matching stableDigest exactly.
const bytesOf = x => Array.isArray(x) ? `[${x.map(bytesOf).join(',')}]`
  : x !== null && typeof x === 'object' ? `{${Object.keys(x).sort(codepointOrder).map(k => `${JSON.stringify(k)}:${bytesOf(x[k])}`).join(',')}}`
    : JSON.stringify(x);
function privatePath(path, kind, limit = 16777216) {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) fail('SHIP_PATH_UNSAFE');
  const st = lstatSync(path);
  if (st.isSymbolicLink() || (kind === 'dir' ? !st.isDirectory() : !st.isFile()) || st.uid !== process.getuid() || (st.mode & 0o777) !== (kind === 'dir' ? 0o700 : 0o600) || (kind === 'file' && st.size > limit)) fail('SHIP_PATH_UNSAFE');
  return path;
}
function safeStores(root, store, runStore) {
  root = realpathSync(root); privatePath(store, 'dir'); privatePath(runStore, 'dir');
  if (inside(root, store) || inside(root, runStore) || inside(store, runStore) || inside(runStore, store)) fail('SHIP_PATH_UNSAFE');
  return root;
}
function readJSON(path) {
  privatePath(path, 'file');
  const value = JSON.parse(readFileSync(path, 'utf8')); stableDigest(value); return value;
}
function ensureDirectory(path) {
  if (!existsSync(path)) mkdirSync(path, {mode: 0o700});
  privatePath(path, 'dir'); return path;
}
function runDirectory(store, runId) {
  if (!uuid(runId)) fail('SHIP_UNBOUND');
  return join(store, 'runs', runId);
}
function evidenceDirectories(store, runId) {
  ensureDirectory(join(store, 'runs'));
  const dir = ensureDirectory(runDirectory(store, runId));
  ensureDirectory(join(dir, 'generations')); ensureDirectory(join(dir, 'blobs')); return dir;
}
function readBinding(state) {
  const b = state?.shipEvidence;
  if (!b) fail('SHIP_UNBOUND');
  if (!exact(b, ['version', 'revision', 'phase', 'policyPath', 'policyDigest', 'registrationDigest', 'storeDigest', 'contextDigest', 'assignmentStoreDigest', 'originRegistryDigest', 'generationDigest']) || b.version !== 'ship-bound-run/v1' || !positive(b.revision) || !['PROVISIONAL', 'NEEDS_REASSESSMENT', 'REVIEWING', 'READY', 'INVALIDATED'].includes(b.phase) || typeof b.policyPath !== 'string' || ![b.policyDigest, b.registrationDigest, b.storeDigest, b.assignmentStoreDigest, b.originRegistryDigest, b.generationDigest].every(hex) || !(b.contextDigest === null || hex(b.contextDigest))) fail('SHIP_INVALID_REVISION');
  return b;
}
function linked(state, descriptor, store, {pointer = true} = {}) {
  const b = readBinding(state);
  if (!uuid(state.id) || !uuid(state.taskId) || state.version !== 1 || realpathSync(state.root) !== descriptor.root || b.policyPath !== descriptor.policyPath || b.policyDigest !== descriptor.policyDigest || b.registrationDigest !== descriptor.registrationDigest || b.storeDigest !== sha(store)) fail('SHIP_UNBOUND');
  const dir = runDirectory(store, state.id); privatePath(join(store, 'runs'), 'dir'); privatePath(dir, 'dir'); privatePath(join(dir, 'generations'), 'dir');
  privatePath(join(dir, 'blobs'), 'dir');
  const path = join(dir, 'generations', `${b.revision}.json`), gen = readJSON(path);
  if (!exact(gen, ['version', 'runId', 'taskId', 'revision', 'phase', 'policyDigest', 'registrationDigest', 'expected', 'assignments', 'records', 'originRegistry', 'obligations', 'resolutions', 'readStatus', 'taskSnapshotDigest', 'journalSnapshotDigest', 'completionDigests', 'previousGenerationDigest']) || gen.version !== 'ship-generation/v1' || gen.runId !== state.id || gen.taskId !== state.taskId || gen.revision !== b.revision || gen.phase !== b.phase || gen.policyDigest !== b.policyDigest || gen.registrationDigest !== b.registrationDigest || stableDigest(gen) !== b.generationDigest || sha(readFileSync(path)) !== b.generationDigest || stableDigest(gen.assignments) !== b.assignmentStoreDigest || stableDigest(gen.originRegistry) !== b.originRegistryDigest || (gen.expected === null ? b.contextDigest !== null : stableDigest(gen.expected) !== b.contextDigest)) fail('SHIP_EVIDENCE_UNKNOWN');
  for (const name of ['assignments', 'records', 'obligations', 'resolutions', 'completionDigests']) if (!Array.isArray(gen[name]) || gen[name].length > 10000) fail('SHIP_EVIDENCE_UNKNOWN');
  if (gen.resolutions.some(r => r.kind === 'OWNER_SUPERSESSION')) fail('SHIP_EVIDENCE_UNKNOWN');
  for (const field of ['taskSnapshotDigest', 'journalSnapshotDigest']) {
    if (gen[field] === null) continue;
    if (!hex(gen[field]) || stableDigest(readJSON(join(dir, 'blobs', `${gen[field]}.json`))) !== gen[field]) fail('SHIP_EVIDENCE_UNKNOWN');
  }
  for (const digest of gen.completionDigests) {
    if (!hex(digest)) fail('SHIP_EVIDENCE_UNKNOWN');
    const blob = readJSON(join(dir, 'blobs', `${digest}.json`));
    if (stableDigest(blob) !== digest || blob.version !== 'ship-completion/v1' || !gen.records.some(r => r.recordId === blob.recordId && r.reviewerInvocationId === blob.reviewerInvocationId && r.rawRecordDigest === digest) || !gen.assignments.some(a => a.reviewerInvocationId === blob.reviewerInvocationId && (stableDigest(a) === blob.assignmentDigest || a.revoked && stableDigest({...a, revoked: false}) === blob.assignmentDigest))) fail('SHIP_EVIDENCE_UNKNOWN');
  }
  if (gen.records.some(r => !gen.completionDigests.includes(r.rawRecordDigest))) fail('SHIP_EVIDENCE_UNKNOWN');
  if (pointer) {
    const p = readJSON(join(dir, 'current.json'));
    if (!exact(p, ['version', 'generation', 'digest']) || p.version !== 'ship-store-pointer/v1' || p.generation !== b.revision || p.digest !== b.generationDigest) fail('SHIP_EVIDENCE_UNKNOWN');
  }
  return gen;
}
function now(clock) { const n = clock(); if (!Number.isSafeInteger(n) || n < 0) fail('SHIP_EVIDENCE_UNKNOWN'); return n; }
const unknownRead = subject => ({state: 'UNKNOWN', snapshotDigest: null, diagnostics: [{code: 'READ_UNKNOWN', subject}]});
function productionTasks({root}) {
  try {
    const raw = execFileSync('bd', ['--readonly', '--sandbox', 'list', '--all', '--limit', '0', '--include-gates', '--include-infra', '--include-templates', '--include-ephemeral', '--max-rows', '10000', '--json'], {cwd: root, encoding: 'utf8', timeout: 20000, maxBuffer: 16777216, stdio: ['ignore', 'pipe', 'ignore'], env: {...process.env, BD_DISABLE_METRICS: '1', BD_DISABLE_EVENT_FLUSH: '1', BD_DOLT_AUTO_PUSH: 'false'}});
    const parsed = JSON.parse(raw), tasks = Array.isArray(parsed) ? parsed : parsed.issues || parsed.tasks;
    if (!Array.isArray(tasks) || tasks.length > 10000) throw Error();
    return {state: 'COMPLETE', tasks, snapshotDigest: stableDigest(tasks), diagnostics: []};
  } catch { return {...unknownRead('tasks'), tasks: []}; }
}
function productionJournals({journalRoot, originId}) {
  const journals = []; let total = 0, complete = true;
  try {
    privatePath(journalRoot, 'dir');
    const files = readdirSync(journalRoot).sort();
    if (files.length > 10000) throw Error();
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      if (!id(file)) throw Error();
      const path = privatePath(join(journalRoot, file), 'file'), raw = readFileSync(path);
      if ((total += raw.length) > 16777216) throw Error();
      const records = [];
      for (const line of raw.toString('utf8').split('\n')) {
        if (!line.trim()) continue;
        if (records.length >= 10000 || Buffer.byteLength(line) > 262144) throw Error();
        const parsed = parseVerdictLine(line), rawDigest = sha(line);
        let outcome = 'UNKNOWN', role = canonicalAgent(file);
        if (parsed.ok && Number.isFinite(Date.parse(parsed.rec.ts))) {
          role = canonicalAgent(parsed.rec.agent || file);
          const kind = verdictKind(parsed.rec.verdict);
          outcome = kind === 'negative' ? 'FAIL' : kind === 'positive' ? 'PASS' : 'UNKNOWN';
          if (kind === 'neutral') complete = false;
        } else complete = false;
        if (!/^[a-z][a-z0-9-]{0,63}$/.test(role)) { role = 'unknown-reviewer'; complete = false; }
        records.push({rawDigest, outcome, role, rawRecord: parsed.ok ? parsed.rec : {rejectedDigest: rawDigest}});
      }
      journals.push({journalId: file, originId, snapshotId: sha(raw), complete: true, records});
    }
    return {state: complete ? 'COMPLETE' : 'UNKNOWN', journals, snapshotDigest: stableDigest(journals), diagnostics: complete ? [] : [{code: 'JOURNAL_REJECTED', subject: 'journals'}]};
  } catch { return {...unknownRead('journals'), journals}; }
}
function snapshots(root, descriptor, registry, clock, readTasks, readJournals) {
  let t, j, invalid = false;
  try { t = (readTasks || productionTasks)({root}); stableDigest(t); } catch { t = {...unknownRead('tasks'), tasks: []}; }
  try { j = (readJournals || productionJournals)({root, journalRoot: descriptor.policy.journalRoot, originId: descriptor.registration.journalOriginId}); stableDigest(j); } catch { j = {...unknownRead('journals'), journals: []}; }
  const tasks = [];
  if (!Array.isArray(t.tasks) || t.tasks.length > 10000) invalid = true;
  else for (const raw of t.tasks) {
    if (!raw || !id(raw.id) || typeof raw.status !== 'string' || !Array.isArray(raw.labels) || raw.labels.some(l => typeof l !== 'string')) { invalid = true; continue; }
    const {id: taskId, state} = normalizeTask(raw);
    if (!['open', 'in_progress', 'closed', 'blocked', 'failed', 'unverified', 'not_run', 'not-run'].includes(state)) { invalid = true; continue; }
    tasks.push({id: taskId, state});
  }
  let journals = [];
  try {
    if (!Array.isArray(j.journals) || j.journals.length > 10000) throw Error();
    journals = j.journals.map(v => {
      if (v.originId !== descriptor.registration.journalOriginId || !Array.isArray(v.records)) throw Error();
      return {journalId: v.journalId, originId: v.originId, snapshotId: v.snapshotId, complete: v.complete, records: v.records.map(r => ({rawDigest: r.rawDigest, outcome: r.outcome, role: r.role}))};
    });
  } catch { invalid = true; }
  const normalized = normalizeLegacyOrigins({registry, journals});
  const status = {version: 'ship-read-status/v1', nowMs: now(clock), context: 'COMPLETE', assignments: 'COMPLETE', journals: j.state === 'COMPLETE' && !invalid ? 'COMPLETE' : 'UNKNOWN', tasks: t.state === 'COMPLETE' && !invalid ? 'COMPLETE' : 'UNKNOWN', policy: 'COMPLETE', origins: normalized.state === 'UNKNOWN' ? 'UNKNOWN' : 'COMPLETE', trustedOwnerDecisions: []};
  const taskSnapshotDigest = Array.isArray(t.tasks) && stableDigest(t.tasks) === t.snapshotDigest ? t.snapshotDigest : null;
  const journalSnapshotDigest = Array.isArray(j.journals) && stableDigest(j.journals) === j.snapshotDigest ? j.snapshotDigest : null;
  if (!hex(taskSnapshotDigest)) status.tasks = 'UNKNOWN';
  if (!hex(journalSnapshotDigest)) status.journals = 'UNKNOWN';
  return {tasks, normalized, status, taskSnapshotDigest, journalSnapshotDigest, rawTasks: t, rawJournals: j};
}
function requirementsFor(descriptor, state) {
  const actors = [...new Set((state.attempts || []).filter(a => a.role === 'senior-dev' && id(a.invocationId)).map(a => a.invocationId))].sort();
  return descriptor.requirements.map(r => ({...r, independentOf: actors}));
}
function innerEvaluation(state, descriptor, gen, options, {allowAppend = false} = {}) {
  const snaps = snapshots(descriptor.root, descriptor, gen.originRegistry, options.clock, options.readTasks, options.readJournals);
  if (!gen.expected || !['REVIEWING', 'READY'].includes(gen.phase)) snaps.status.context = 'UNKNOWN';
  else {
    if (recheckShipContext({root: descriptor.root, registration: descriptor.registration, expected: gen.expected}).state !== 'MATCH') snaps.status.context = 'UNKNOWN';
    if (stableDigest(requirementsFor(descriptor, state)) !== gen.expected.requirementsDigest) snaps.status.policy = 'UNKNOWN';
  }
  if (!allowAppend && stableDigest(snaps.normalized.registry) !== stableDigest(gen.originRegistry)) snaps.status.origins = 'UNKNOWN';
  const result = evaluateBoundShipEvidence({expected: gen.expected, invocations: gen.assignments, records: gen.records, obligations: [...gen.obligations, ...snaps.normalized.obligations], resolutions: gen.resolutions, tasks: snaps.tasks, readStatus: snaps.status});
  return {result, snaps};
}
const unknownReport = () => ({version: 'ship-bound-gate/v1', state: 'UNKNOWN', contextDigest: null, revision: null, result: evaluateBoundShipEvidence(null), publicationEligibility: 'NOT_CHECKED'});
function knownHistoricalFindings({root, store, runId, expectedRevision}, {runStore, clock}) {
  const report = unknownReport();
  try {
    root = safeStores(root, store, runStore);
    if (!uuid(runId) || !positive(expectedRevision)) return report;
    const state = readJSON(join(runStore, `${runId}.json`)), binding = readBinding(state);
    if (state.id !== runId || state.version !== 1 || !uuid(state.taskId) || realpathSync(state.root) !== root || binding.revision !== expectedRevision || binding.storeDigest !== sha(store) || binding.policyPath !== join(store, 'policy.json')) return report;
    const dir = runDirectory(store, runId);
    for (const path of [join(store, 'runs'), dir, join(dir, 'generations')]) privatePath(path, 'dir');
    const path = join(dir, 'generations', `${binding.revision}.json`), generation = readJSON(path);
    if (sha(readFileSync(path)) !== binding.generationDigest || stableDigest(generation) !== binding.generationDigest || generation.version !== 'ship-generation/v1' || generation.runId !== runId || generation.taskId !== state.taskId || generation.revision !== binding.revision || generation.policyDigest !== binding.policyDigest || generation.registrationDigest !== binding.registrationDigest || stableDigest(generation.assignments) !== binding.assignmentStoreDigest || stableDigest(generation.originRegistry) !== binding.originRegistryDigest) return report;
    // A controller-linked immutable history is useful when current policy/pointer
    // cannot be assessed. It never supplies current source, tasks or resolutions.
    const result = evaluateBoundShipEvidence({expected: null, invocations: [], records: generation.records, obligations: generation.obligations, resolutions: [], tasks: [], readStatus: {version: 'ship-read-status/v1', nowMs: now(clock), context: 'UNKNOWN', assignments: 'UNKNOWN', journals: 'UNKNOWN', tasks: 'UNKNOWN', policy: 'UNKNOWN', origins: 'UNKNOWN', trustedOwnerDecisions: []}});
    return {...report, revision: binding.revision, result};
  } catch { return report; }
}
export function evaluateBoundGate({root, store, runId, expectedRevision}, {runStore, clock = Date.now, readTasks = null, readJournals = null} = {}) {
  try {
    root = safeStores(root, store, runStore);
    if (!uuid(runId) || !positive(expectedRevision)) fail('SHIP_INVALID_REVISION');
    const state = readJSON(join(runStore, `${runId}.json`)), b = readBinding(state);
    if (b.revision !== expectedRevision) fail('SHIP_STALE_REVISION');
    const descriptor = readShipPolicy({root, path: b.policyPath});
    if (descriptor.store !== store) fail('SHIP_UNBOUND');
    const gen = linked(state, descriptor, store), {result} = innerEvaluation(state, descriptor, gen, {clock, readTasks, readJournals});
    return {version: 'ship-bound-gate/v1', state: result.state, contextDigest: b.contextDigest, revision: b.revision, result, publicationEligibility: 'NOT_CHECKED'};
  } catch { return knownHistoricalFindings({root, store, runId, expectedRevision}, {runStore, clock}); }
}

export function assertShipControllerBoundary(boundary, state) {
  const owned = brands.get(boundary);
  if (!owned || owned.root !== state.root || owned.runId !== state.id || owned.taskId !== state.taskId) fail('SHIP_CAPABILITY_INVALID');
  return boundary;
}
function makeBoundary({root, store, lease, readPersistedState, writeGeneration}, options, seed = null) {
  const {runStore, clock = Date.now, readTasks = null, readJournals = null} = options;
  root = safeStores(root, store, runStore);
  if (!lease || typeof lease.assertOwned !== 'function') fail('SHIP_LEASE_LOST');
  const assertLease = () => { try { lease.assertOwned(); } catch { fail('SHIP_LEASE_LOST'); } };
  assertLease();
  const read = readPersistedState || (runId => readJSON(join(runStore, `${runId}.json`)));
  const write = writeGeneration || (({runId, generation, digest, bytes}) => {
    const dir = evidenceDirectories(store, runId), path = join(dir, 'generations', `${generation}.json`);
    if (existsSync(path)) {
      privatePath(path, 'file'); if (sha(readFileSync(path)) !== digest) fail('SHIP_GENERATION_CONFLICT');
      return {created: false, digest};
    }
    writeFileSync(path, bytes, {mode: 0o600, flag: 'wx'});
    return {created: true, digest: sha(readFileSync(privatePath(path, 'file')))};
  });
  let runId = seed?.state.id || null, taskId = seed?.state.taskId || null, revision = seed ? 0 : null, gen = seed?.generation || null, descriptor = seed?.descriptor || null, priorDigest = null, poisoned = false;
  const activeCapabilities = new Set(), callIds = new Set();
  const load = state => {
    if (poisoned) fail('SHIP_COMMITTED_OBSERVATION_UNKNOWN', {persistedRevision: revision});
    assertLease();
    if (!runId) {
      const b = readBinding(state);
      descriptor = readShipPolicy({root, path: b.policyPath});
      if (descriptor.store !== store) fail('SHIP_UNBOUND');
      const saved = read(state.id); if (saved?.then) fail('SHIP_EVIDENCE_UNKNOWN');
      gen = clone(linked(saved, descriptor, store)); revision = saved.shipEvidence.revision; priorDigest = saved.shipEvidence.generationDigest;
      runId = saved.id; taskId = saved.taskId;
      brands.set(boundary, {root, runId, taskId});
    }
    if (state.id !== runId || state.taskId !== taskId || realpathSync(state.root) !== root) fail('SHIP_CAPABILITY_INVALID');
    if (revision === 0) return null;
    const saved = read(runId); if (saved?.then) fail('SHIP_EVIDENCE_UNKNOWN');
    const b = readBinding(saved);
    if (b.revision !== revision || state.shipEvidence?.revision !== revision || b.generationDigest !== priorDigest || state.shipEvidence.generationDigest !== priorDigest) fail('SHIP_STALE_REVISION');
    const currentDescriptor = readShipPolicy({root, path: b.policyPath});
    linked(saved, currentDescriptor, store);
    if (currentDescriptor.policyDigest !== descriptor.policyDigest || currentDescriptor.registrationDigest !== descriptor.registrationDigest) fail('SHIP_EVIDENCE_UNKNOWN');
    return saved;
  };
  const assertSource = () => {
    if (gen.expected && recheckShipContext({root, registration: descriptor.registration, expected: gen.expected}).state !== 'MATCH') fail('SHIP_CONTEXT_DRIFT');
  };
  const persistBlob = value => {
    const digest = stableDigest(value), dir = evidenceDirectories(store, runId), path = join(dir, 'blobs', `${digest}.json`), bytes = bytesOf(value);
    if (sha(bytes) !== digest) fail('SHIP_EVIDENCE_UNKNOWN');
    if (existsSync(path)) { privatePath(path, 'file'); if (sha(readFileSync(path)) !== digest) fail('SHIP_GENERATION_CONFLICT'); }
    else writeFileSync(path, bytes, {flag: 'wx', mode: 0o600});
    return digest;
  };
  const retainCallFinding = (cap, digest, category) => {
    const ordinal = gen.obligations.length;
    gen.obligations.push({findingId: `controller:${randomUUID()}`, originRecordDigest: digest, originContextDigest: cap.assignment.expectedContextDigest, role: cap.assignment.role, severity: 'UNKNOWN', category, origin: {journalId: `controller:${runId}`, ordinal, rawDigest: digest}});
  };
  const boundary = {
    assertCurrent(state, {effect} = {}) {
      if (!['metadata', 'worker', 'checks', 'verifier', 'ship', 'devops', 'release'].includes(effect)) fail('SHIP_CAPABILITY_INVALID');
      load(state); assertSource();
      const requiredRole = descriptor.requirements.some(r => r.role === (state.active || state.queue?.[0]));
      if (effect !== 'metadata' && (requiredRole || ['ship', 'devops', 'release'].includes(effect)) && !['REVIEWING', 'READY'].includes(gen.phase)) fail('SHIP_REASSESS_REQUIRED');
      if (['ship', 'devops', 'release'].includes(effect)) {
        const report = evaluateBoundGate({root, store, runId, expectedRevision: revision}, {runStore, clock, readTasks, readJournals});
        if (report.state !== 'PASS') fail(report.state === 'BLOCKED' ? 'SHIP_EVIDENCE_BLOCKED' : 'SHIP_EVIDENCE_UNKNOWN');
      }
      return {revision, contextDigest: gen.expected ? stableDigest(gen.expected) : null};
    },
    assertReady(state, {role, attemptId, host}) {
      load(state);
      if (!['REVIEWING', 'READY'].includes(gen.phase)) {
        if (gen.phase === 'PROVISIONAL') { gen.phase = 'NEEDS_REASSESSMENT'; state.shipEvidence.phase = gen.phase; }
        fail('SHIP_REASSESS_REQUIRED');
      }
      boundary.assertCurrent(state, {effect: 'worker'});
      const required = gen.expected.requiredReviewers.find(r => r.role === role);
      if (!required || !id(attemptId) || !['codex', 'claude-code'].includes(host) || !state.graph[role] || (state.hostRoutes?.[role] || 'codex') !== host) fail('SHIP_CAPABILITY_INVALID');
      const issuedAtMs = now(clock), expiresAtMs = issuedAtMs + descriptor.policy.assignmentLifetimeMs;
      if (!Number.isSafeInteger(expiresAtMs)) fail('SHIP_EVIDENCE_UNKNOWN');
      const reviewerActorId = invocationIdentity({session_id: runId, agent_id: attemptId});
      if (!reviewerActorId) fail('SHIP_CAPABILITY_INVALID');
      const assignment = {version: 'ship-assignment/v1', reviewerInvocationId: randomUUID(), role, expectedContextDigest: stableDigest(gen.expected), taskId, runId, reviewerActorId, independentOf: [...required.independentOf], requiredChecks: [...required.requiredChecks], issuedAtMs, expiresAtMs, revoked: false, origin: 'CONTROLLER'};
      if (required.independentOf.includes(assignment.reviewerActorId)) fail('SHIP_CAPABILITY_INVALID');
      gen.assignments.push(assignment);
      const capability = Object.freeze({});
      caps.set(capability, {boundary, assignment, state, attemptId, host, calls: new Map(), startedAtMs: issuedAtMs, completed: false});
      activeCapabilities.add(capability); return capability;
    },
    async runCall(capability, {kind, callId, invoke}) {
      const cap = caps.get(capability);
      if (!cap || cap.boundary !== boundary || cap.completed || !activeCapabilities.has(capability) || cap.assignment.revoked || cap.assignment.expectedContextDigest !== (gen.expected && stableDigest(gen.expected))) fail('SHIP_CAPABILITY_INVALID');
      if (!['worker', 'verifier', 'checks'].includes(kind) || !id(callId) || typeof invoke !== 'function') fail('SHIP_CAPABILITY_INVALID');
      if (cap.calls.has(kind) || callIds.has(callId)) fail('SHIP_REPLAY');
      boundary.assertCurrent(cap.state, {effect: kind});
      callIds.add(callId); const call = {callId, result: null, digest: null, returned: false}; cap.calls.set(kind, call);
      try {
        const result = await invoke();
        boundary.assertCurrent(cap.state, {effect: kind});
        call.result = result; call.digest = stableDigest(result); call.returned = true;
        if (kind === 'worker') {
          let parsed; try { parsed = JSON.parse(result.finalText ?? result.text); } catch {}
          if (result.state !== 'ok' || result.code !== 0 || result.errors?.length || !parsed || verdictKind(parsed.verdict) !== 'positive') retainCallFinding(cap, call.digest, 'worker-return');
        }
        if (kind === 'checks' && (result?.state !== 'passed' || result?.code !== 0)) retainCallFinding(cap, call.digest, 'checks-return');
        return result;
      } catch (error) {
        call.failed = true;
        // This is an unresolved call finding, not a fabricated review completion.
        retainCallFinding(cap, stableDigest({kind, callId, code: String(error.code || 'CALL_UNKNOWN')}), 'transport-unknown');
        throw error;
      }
    },
    completeReview(state, {capability, proposal, verification, checks = null}) {
      const cap = caps.get(capability);
      if (!cap || cap.boundary !== boundary || cap.state !== state || cap.completed || !activeCapabilities.has(capability)) fail('SHIP_CAPABILITY_INVALID');
      boundary.assertCurrent(state, {effect: 'verifier'});
      const worker = cap.calls.get('worker'), verifier = cap.calls.get('verifier'), check = cap.calls.get('checks');
      if (!worker?.returned || stableDigest(worker.result) !== worker.digest || !verifier?.returned || verifier.result !== verification || stableDigest(verification) !== verifier.digest || (checks !== null && (!check?.returned || check.result !== checks || stableDigest(checks) !== check.digest))) fail('SHIP_CAPABILITY_INVALID');
      let parsed;
      try { parsed = JSON.parse(worker.result.finalText ?? worker.result.text); } catch { fail('SHIP_CAPABILITY_INVALID'); }
      if (stableDigest(parsed) !== stableDigest(proposal)) fail('SHIP_CAPABILITY_INVALID');
      if (!Array.isArray(proposal.files) || proposal.files.length) fail('UNSUPPORTED_REVIEW_OUTPUT');
      const rule = state.graph[`${cap.assignment.role}.${proposal.verdict}`] || state.graph[cap.assignment.role];
      assertCommittedShipArtifacts({root, allowed: state.allowed, rule, proposal});
      const workerClean = worker.result.state === 'ok' && worker.result.code === 0 && Array.isArray(worker.result.errors) && worker.result.errors.length === 0;
      const verifierClean = verification.state === 'verified' && Array.isArray(verification.findings) && verification.findings.length === 0 && Array.isArray(verification.checks) && verification.checks.length > 0;
      const checkEvidence = cap.assignment.requiredChecks.map(checkId => ({checkId, state: (checkId === 'independent-verifier' ? verifierClean : check?.returned && checks?.state === 'passed' && checks?.code === 0) ? 'PASS' : 'FAIL', evidenceDigest: checkId === 'independent-verifier' ? verifier.digest : check?.digest || stableDigest(null)}));
      const outcome = workerClean && verifierClean && rule?.on?.includes(proposal.verdict) && checkEvidence.every(c => c.state === 'PASS') ? 'PASS' : ['FAIL', 'REJECTED', 'BLOCKED'].includes(proposal.verdict) ? 'FAIL' : 'UNKNOWN';
      const recordId = randomUUID(), finishedAtMs = now(clock), contextDigest = stableDigest(gen.expected);
      if (finishedAtMs >= cap.assignment.expiresAtMs) fail('SHIP_EVIDENCE_UNKNOWN');
      const envelope = {version: 'ship-completion/v1', assignmentDigest: stableDigest(cap.assignment), reviewerInvocationId: cap.assignment.reviewerInvocationId, attemptId: cap.attemptId, role: cap.assignment.role, host: cap.host, expectedContextDigest: contextDigest, sourceBeforeDigest: contextDigest, sourceAfterDigest: contextDigest, workerCallId: worker.callId, workerTransportDigest: worker.digest, proposalDigest: stableDigest(proposal), verifierCallId: verifier.callId, verifierTransportDigest: verifier.digest, verificationDigest: stableDigest(verification), checkEvidence, startedAtMs: cap.startedAtMs, finishedAtMs, outcome, recordId};
      const completionDigest = persistBlob(envelope);
      gen.records.push({version: 'ship-evidence/v2', recordId, reviewerInvocationId: cap.assignment.reviewerInvocationId, expectedContextDigest: contextDigest, role: cap.assignment.role, outcome, checkEvidence, reviewedEvidenceDigest: stableDigest({proposalDigest: envelope.proposalDigest, verificationDigest: envelope.verificationDigest}), authority: 'CONTROLLED_REVIEW', releaseEligibility: 'SOURCE_GATE_ONLY', evidenceClass: 'SOURCE_REVIEW', findingIds: [], startedAtMs: cap.startedAtMs, finishedAtMs, rawRecordDigest: completionDigest, origin: {journalId: `controller:${runId}`, ordinal: gen.records.length, rawDigest: completionDigest}});
      gen.completionDigests.push(completionDigest); gen.completionDigests.sort(); cap.completed = true; activeCapabilities.delete(capability);
      return {recordId, completionDigest, outcome};
    },
    assertApproval(state, {token}) {
      const saved = load(state);
      if (!saved?.pending || token !== saved.pending.token || token !== state.pending?.token) fail('SHIP_STALE_REVISION');
      if (state.pending.gates.includes('gate:ship') && (state.pending.shipEvidenceRevision !== revision || state.pending.shipEvidenceContextDigest !== state.shipEvidence.contextDigest || saved.pending.shipEvidenceRevision !== revision || saved.pending.shipEvidenceContextDigest !== state.shipEvidence.contextDigest)) fail('SHIP_STALE_REVISION');
      return boundary.assertCurrent(state, {effect: state.pending.gates.includes('gate:ship') ? 'ship' : 'metadata'});
    },
    save(state) {
      const saved = load(state);
      if (revision >= Number.MAX_SAFE_INTEGER) fail('SHIP_INVALID_REVISION');
      privatePath(join(runStore, `${runId}.lock`), 'dir');
      assertSource();
      const protectedEffect = saved && (
        state.approvals.some(a => a.gate === 'gate:ship' && !saved.approvals.some(old => stableDigest(old) === stableDigest(a)))
        || state.released.some(role => !saved.released.includes(role) && (state.graph[role]?.gate === 'gate:ship' || state.graph[role]?.next?.includes('devops')))
        || stableDigest(state.release || null) !== stableDigest(saved.release || null)
        || state.results.devops && !saved.results.devops);
      const assertProtectedEffect = () => {
        if (!protectedEffect) return;
        const {result} = innerEvaluation(state, descriptor, gen, {clock, readTasks, readJournals});
        if (result.state !== 'PASS') fail(result.state === 'BLOCKED' ? 'SHIP_EVIDENCE_BLOCKED' : 'SHIP_EVIDENCE_UNKNOWN');
      };
      assertProtectedEffect();
      const next = clone(gen), stagedState = clone(state), nextRevision = revision + 1;
      if (gen.expected) {
        const evaluation = innerEvaluation(state, descriptor, gen, {clock, readTasks, readJournals}, {allowAppend: true});
        next.originRegistry = evaluation.snaps.normalized.registry;
        next.obligations = evaluation.result.openObligations.concat(evaluation.result.resolvedObligations, evaluation.result.supersededObligations);
        next.readStatus = evaluation.snaps.status; next.taskSnapshotDigest = evaluation.snaps.taskSnapshotDigest; next.journalSnapshotDigest = evaluation.snaps.journalSnapshotDigest;
        if (next.taskSnapshotDigest && persistBlob(evaluation.snaps.rawTasks.tasks) !== next.taskSnapshotDigest) fail('SHIP_EVIDENCE_UNKNOWN');
        if (next.journalSnapshotDigest && persistBlob(evaluation.snaps.rawJournals.journals) !== next.journalSnapshotDigest) fail('SHIP_EVIDENCE_UNKNOWN');
        persistBlob(evaluation.snaps.rawTasks); persistBlob(evaluation.snaps.rawJournals);
        if (evaluation.result.state === 'PASS') next.phase = 'READY';
        else if (next.phase === 'READY') next.phase = 'REVIEWING';
      }
      next.revision = nextRevision; next.previousGenerationDigest = revision === 0 ? null : priorDigest;
      const digest = stableDigest(next), bytes = bytesOf(next);
      if (sha(bytes) !== digest) fail('SHIP_EVIDENCE_UNKNOWN');
      const response = write({runId, generation: nextRevision, digest, bytes});
      if (response?.then || response?.digest !== digest) fail('SHIP_EVIDENCE_UNKNOWN');
      const generationPath = join(runDirectory(store, runId), 'generations', `${nextRevision}.json`);
      if (stableDigest(readJSON(generationPath)) !== digest || sha(readFileSync(generationPath)) !== digest) fail('SHIP_EVIDENCE_UNKNOWN');
      const binding = {version: 'ship-bound-run/v1', revision: nextRevision, phase: next.phase, policyPath: descriptor.policyPath, policyDigest: descriptor.policyDigest, registrationDigest: descriptor.registrationDigest, storeDigest: sha(store), contextDigest: next.expected ? stableDigest(next.expected) : null, assignmentStoreDigest: stableDigest(next.assignments), originRegistryDigest: stableDigest(next.originRegistry), generationDigest: digest};
      stagedState.shipEvidence = binding;
      if (stagedState.pending?.gates.includes('gate:ship') && !saved?.pending) {
        stagedState.pending.shipEvidenceRevision = nextRevision; stagedState.pending.shipEvidenceContextDigest = binding.contextDigest;
      }
      assertLease(); assertSource(); assertProtectedEffect();
      const currentDescriptor = readShipPolicy({root, path: descriptor.policyPath});
      if (currentDescriptor.policyDigest !== descriptor.policyDigest || currentDescriptor.registrationDigest !== descriptor.registrationDigest) fail('SHIP_EVIDENCE_UNKNOWN');
      if (revision !== 0) {
        const final = read(runId);
        if (readBinding(final).revision !== revision || final.shipEvidence.generationDigest !== priorDigest) fail('SHIP_STALE_REVISION');
      } else if (existsSync(join(runStore, `${runId}.json`))) fail('SHIP_STALE_REVISION');
      const file = join(runStore, `${runId}.json`), temp = `${file}.${randomUUID()}.tmp`;
      try { writeFileSync(temp, JSON.stringify(stagedState, null, 2), {flag: 'wx', mode: 0o600}); assertLease(); assertSource(); renameSync(temp, file); }
      catch (error) { try { if (existsSync(temp)) unlinkSync(temp); } catch {} throw error; }
      revision = nextRevision; priorDigest = digest; gen = next; state.shipEvidence = clone(binding);
      if (state.pending && stagedState.pending) state.pending = clone(stagedState.pending);
      try { writeFileSync(join(runDirectory(store, runId), 'current.json'), bytesOf({version: 'ship-store-pointer/v1', generation: revision, digest}), {mode: 0o600}); }
      catch { poisoned = true; fail('SHIP_COMMITTED_OBSERVATION_UNKNOWN', {persistedRevision: revision}); }
      return {revision, contextDigest: binding.contextDigest, generationDigest: digest, committed: true};
    },
    reassess(state, {expectedRevision}) {
      load(state);
      if (expectedRevision !== revision) fail('SHIP_STALE_REVISION');
      if (state.active || state.wave || ['done', 'cancelled'].includes(state.status) || state.release && ['publishing', 'published', 'verified'].includes(state.release.status)) fail('SHIP_REASSESS_REQUIRED');
      const freshDescriptor = readShipPolicy({root, path: descriptor.policyPath});
      const requirements = requirementsFor(freshDescriptor, state);
      for (const r of requirements) if (!state.graph[r.role] || (state.attempts || []).filter(a => a.role === r.role).length >= state.maxAttempts || r.requiredChecks.includes('configured-checks') && !state.checkPolicy) fail('SHIP_REQUIREMENTS_UNKNOWN');
      const captured = captureShipContext({root, registration: descriptor.registration, taskId, runId, gateId: 'gate:ship', policy: descriptor.policy, requirements});
      if (captured.state !== 'COMPLETE') fail('SHIP_CONTEXT_DRIFT');
      const staged = clone(state), roles = new Set(requirements.map(r => r.role));
      staged.invalidations ??= []; staged.invalidations.push({kind: 'ship-reassessment', results: Object.fromEntries(Object.entries(staged.results).filter(([r]) => roles.has(r))), approvals: staged.approvals.filter(a => roles.has(a.role)), at: new Date(now(clock)).toISOString()});
      for (const role of roles) delete staged.results[role];
      staged.approvals = staged.approvals.filter(a => !roles.has(a.role)); staged.released = staged.released.filter(r => !roles.has(r));
      const orderedRoles = Object.keys(state.graph).filter(r => roles.has(r));
      const first = orderedRoles[0], joined = state.graph[first]?.join || [];
      staged.queue = [...new Set([first, ...joined.filter(r => roles.has(r))])]; staged.pending = null; staged.active = null; staged.status = 'ready'; delete staged.reason;
      gen = {...gen, expected: captured.expected, phase: 'REVIEWING', assignments: gen.assignments.map(a => ({...a, revoked: true}))};
      // New generations retain negative history; prior positive assignments cannot satisfy.
      for (const cap of activeCapabilities) caps.get(cap).assignment.revoked = true;
      activeCapabilities.clear();
      const saved = boundary.save(staged); return {state: staged, revision: saved.revision, contextDigest: saved.contextDigest};
    },
    invalidate(state, {reason}) {
      load(state); if (!id(reason)) fail('SHIP_CAPABILITY_INVALID');
      gen.phase = 'INVALIDATED'; gen.expected = null; gen.assignments = gen.assignments.map(a => ({...a, revoked: true}));
      for (const cap of activeCapabilities) caps.get(cap).assignment.revoked = true;
      activeCapabilities.clear(); state.shipEvidence.phase = 'INVALIDATED'; state.shipEvidence.contextDigest = null;
    },
  };
  brands.set(boundary, {root, runId, taskId});
  // Existing bindings are linked lazily on their first state-bearing method.
  const originalLoadBrand = state => { load(state); brands.set(boundary, {root, runId, taskId}); };
  if (seed) brands.set(boundary, {root, runId, taskId});
  else {
    const assert = boundary.assertCurrent;
    boundary.assertCurrent = (state, request) => { originalLoadBrand(state); return assert(state, request); };
  }
  return boundary;
}
export function createShipControllerBoundary(input, options = {}) { return makeBoundary(input, options); }
export function initializeShipBinding({state, policyPath, lease}, options = {}) {
  if (state.shipEvidence || !uuid(state.id) || !uuid(state.taskId) || state.version !== 1) fail('SHIP_UNBOUND');
  const descriptor = readShipPolicy({root: state.root, path: policyPath}), clock = options.clock || Date.now;
  const generation = {version: 'ship-generation/v1', runId: state.id, taskId: state.taskId, revision: 1, phase: 'PROVISIONAL', policyDigest: descriptor.policyDigest, registrationDigest: descriptor.registrationDigest, expected: null, assignments: [], records: [], originRegistry: {version: 'ship-origin-registry/v1', journals: []}, obligations: [], resolutions: [], readStatus: {version: 'ship-read-status/v1', nowMs: now(clock), context: 'UNKNOWN', assignments: 'UNKNOWN', journals: 'UNKNOWN', tasks: 'UNKNOWN', policy: 'UNKNOWN', origins: 'UNKNOWN', trustedOwnerDecisions: []}, taskSnapshotDigest: null, journalSnapshotDigest: null, completionDigests: [], previousGenerationDigest: null};
  const staged = clone(state), boundary = makeBoundary({root: state.root, store: descriptor.store, lease}, options, {state: staged, descriptor, generation});
  boundary.save(staged); return {state: staged, boundary};
}
export function reassessShipBinding({state, expectedRevision, lease}, options = {}) {
  const b = readBinding(state), descriptor = readShipPolicy({root: state.root, path: b.policyPath});
  const boundary = createShipControllerBoundary({root: state.root, store: descriptor.store, lease}, options);
  const result = boundary.reassess(state, {expectedRevision});
  return {state: result.state, boundary};
}
function main() {
  const args = process.argv.slice(2), values = {}, allowed = new Set(['--dir', '--store', '--run', '--revision']); let diagnostic = false;
  try {
    for (let i = 0; i < args.length; i++) {
      const key = args[i]; if (key === '--json') continue;
      if (key === '--as') { diagnostic = true; i++; continue; }
      if (!allowed.has(key) || Object.hasOwn(values, key) || !args[i + 1] || args[i + 1].startsWith('--')) fail('SHIP_CAPABILITY_INVALID');
      values[key] = args[++i];
    }
    if (!/^\d+$/.test(values['--revision'] || '')) fail('SHIP_INVALID_REVISION');
    const report = evaluateBoundGate({root: values['--dir'], store: values['--store'], runId: values['--run'], expectedRevision: Number(values['--revision'])}, {runStore: codexRunStore()});
    console.log(JSON.stringify(report)); process.exitCode = report.state === 'PASS' && !diagnostic ? 0 : 2;
  } catch { console.log(JSON.stringify(unknownReport())); process.exitCode = 2; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
