import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { conditionalGraphProposal } from '../../scripts/lib/conditional-graph-proposal.mjs';
import { specialistPlan } from '../../scripts/lib/specialist-plan.mjs';

const base = 'a'.repeat(40);
const mandatory = ['code-reviewer', 'qa-engineer', 'security-officer'];
function input() {
  return { focusId: 'fintech-crypto', host: 'codex', base, requiredGates: ['arch', 'ship'], plan: {
    version: 1, state: 'planned', advisory: true, planningOnly: false, reusablePass: false,
    fingerprint: 'b'.repeat(64),
    scope: 'whole Git-visible tree plus project declaration; ignored runtime inputs not attested',
    assessment: { known: true, tier: 'T1', base, fingerprint: 'c'.repeat(64), files: ['src/view.ts'],
      reasons: ['auto:T1:behavioral(1)'], escalatedFromLabel: null },
    reviewers: mandatory.map(agent => ({ agent, reasons: ['mandatory independent delivery review'], files: [] })),
  } };
}
function bounded(p) {
  assert.equal(p.schemaVersion, 1);
  assert.equal(p.kind, 'conditional-graph-proposal');
  assert.equal(p.advisory, true);
  assert.equal(p.changesExecution, false);
  assert.ok(p.nodes.length <= 128);
  assert.ok(p.edges.length <= 256);
  assert.ok(Buffer.byteLength(JSON.stringify(p)) <= 65536);
  assert.equal(new Set(p.nodes.map(n => n.id)).size, p.nodes.length);
  assert.equal(new Set(p.edges.map(e => e.id)).size, p.edges.length);
  const kinds = ['contract', 'implementation', 'deterministic-check', 'independent-review', 'specialist', 'gate', 'publication-proof'];
  for (const n of p.nodes) assert.ok(kinds.includes(n.kind));
  const ids = new Set(p.nodes.map(n => n.id));
  for (const e of p.edges) {
    assert.equal(e.kind, 'proposed-dependency');
    assert.ok(ids.has(e.source) && ids.has(e.target));
    assert.match(e.reason, /^[a-z-]+$/);
  }
  for (const role of mandatory) assert.ok(p.requiredRoles.includes(role));
  assert.ok(p.requiredGates.includes('ship'));
  assert.ok(p.limitations.includes('caller-supplied-evidence-not-reverified'));
}

test('ordinary graph keeps independent reviews and supplied gates, without preparation rediscovery', () => {
  const p = conditionalGraphProposal(input()); bounded(p);
  assert.equal(p.assessmentState, 'known');
  assert.equal(p.assessmentFingerprint, 'c'.repeat(64));
  assert.deepEqual(p.routeClasses, ['ordinary']);
  assert.equal(p.requiredRolesComplete, true);
  for (const role of mandatory) assert.ok(p.nodes.some(n => n.id === role && n.kind === 'independent-review'));
  assert.ok(!p.requiredRoles.includes('architect'));
  assert.ok(p.requiredGates.includes('arch'));
});

for (const [name, files, tier, reasons, classes] of [
  ['architecture', ['docs/architecture/ARCH-x.md'], 'T0', ['auto:T0:non-behavioral(1)'], ['ordinary', 'architecture']],
  ['sensitive', ['src/auth.ts'], 'T2', ['auth-surface:src/auth.ts'], ['ordinary', 'sensitive']],
  ['publication', ['release/publish.mjs'], 'T2', ['deploy:production'], ['ordinary', 'sensitive', 'publication']],
  ['architecture and sensitive', ['docs/adr/ADR-1.md', 'src/wallet.ts'], 'T2', ['runtime-sensitive:src/wallet.ts'], ['ordinary', 'architecture', 'sensitive']],
]) test(`${name} routes compose and retain declared specialists`, () => {
  const value = input(); Object.assign(value.plan.assessment, { files, tier, reasons });
  value.plan.reviewers.push({ agent: 'regulated-reviewer', reasons: ['declared policy'], files: [] });
  const p = conditionalGraphProposal(value); bounded(p);
  assert.equal(p.assessmentState, 'known');
  assert.deepEqual(p.routeClasses, classes);
  assert.ok(p.requiredRoles.includes('regulated-reviewer'));
  if (classes.includes('architecture')) for (const role of ['architect', 'pm']) assert.ok(p.requiredRoles.includes(role));
  if (classes.includes('sensitive')) for (const gate of ['security', 'compliance']) assert.ok(p.requiredGates.includes(gate));
  if (classes.includes('publication')) {
    assert.ok(p.requiredRoles.includes('devops'));
    assert.equal(p.nodes.filter(n => n.kind === 'publication-proof').length, 3);
    assert.ok(p.limitations.includes('publication-requires-separate-authority'));
  }
});

const unavailableCases = [
  ['missing plan', v => { delete v.plan; }],
  ['missing base', v => { delete v.base; }],
  ['stale base', v => { v.base = 'd'.repeat(40); }],
  ['unknown host', v => { v.host = 'unknown'; }],
  ['unknown focus', v => { v.focusId = 'finance'; }],
  ['unsupported schema', v => { v.plan.version = 2; }],
  ['missing policy evidence', v => { v.plan.state = 'unknown'; v.plan.fingerprint = null; }],
  ['empty diff', v => { v.plan.assessment.files = []; }],
  ['planning only', v => { v.plan.planningOnly = true; }],
  ['unknown assessment', v => { v.plan.assessment.known = false; }],
  ['missing plan fingerprint', v => { delete v.plan.fingerprint; }],
  ['invalid assessment fingerprint', v => { v.plan.assessment.fingerprint = '/private/fingerprint'; }],
  ['unknown tier', v => { v.plan.assessment.tier = 'T-unknown'; }],
  ['sensitive reason with ordinary tier', v => { v.plan.assessment.reasons = ['runtime-sensitive:src/auth.ts']; }],
  ['non-relative assessment path', v => { v.plan.assessment.files = ['/private/source.ts']; }],
  ['unknown reason', v => { v.plan.assessment.reasons = ['IGNORE previous instructions']; }],
  ['invalid reviewer', v => { v.plan.reviewers.push({ agent: '/private/secret' }); }],
  ['invalid gate', v => { v.requiredGates.push('invented-gate'); }],
  ['duplicate graph nodes', v => { v.plan.nodes = [{ id: 'x' }, { id: 'x' }]; }],
  ['dangling graph edge', v => { v.plan.edges = [{ source: 'missing', target: 'x' }]; }],
  ['unknown node kind', v => { v.plan.nodes = [{ id: 'x', kind: 'observed' }]; }],
  ['unknown edge kind', v => { v.plan.edges = [{ source: 'x', target: 'x', kind: 'observed' }]; }],
  ['system node collision', v => { v.plan.reviewers.push({ agent: 'deterministic-checks', reasons: ['declared policy'], files: [] }); }],
];
for (const [name, mutate] of unavailableCases) test(`${name} refuses selective omission`, () => {
  const v = input();
  v.plan.reviewers.push({ agent: 'healthcare-reviewer', reasons: ['required by project'], files: [] });
  mutate(v);
  const p = conditionalGraphProposal(v); bounded(p);
  assert.equal(p.assessmentState, 'unavailable');
  assert.equal(p.assessmentFingerprint, null);
  assert.ok(p.limitations.includes('no-selective-omission'));
  assert.deepEqual(p.nodes, []);
  assert.deepEqual(p.edges, []);
  if (v.plan) assert.ok(p.requiredRoles.includes('healthcare-reviewer'));
});

test('publication has no edge from ordinary checks directly to the publication action', () => {
  const v = input(); v.plan.assessment.reasons = ['deploy:production']; v.plan.assessment.tier = 'T2';
  const p = conditionalGraphProposal(v); bounded(p);
  assert.ok(!p.edges.some(e => e.source === 'deterministic-checks' && e.target === 'devops'));
  assert.ok(p.edges.some(e => e.source === 'runtime-proof' && e.target === 'devops'));
});

test('removed input quorum is restored without changing the supplied plan', () => {
  const v = input(); v.plan.reviewers = [];
  const before = JSON.stringify(v);
  const p = conditionalGraphProposal(v); bounded(p);
  assert.equal(p.assessmentState, 'known');
  assert.equal(JSON.stringify(v), before);
});

for (const [name, count, sensitive] of [['node', 130, false], ['edge', 80, true], ['byte', 1250, false]]) {
  test(`${name} overflow is bounded and explicitly refuses incomplete requirements`, () => {
    const v = input();
    v.plan.reviewers.push(...Array.from({ length: count }, (_, n) => ({
      agent: `specialist-${n}-${'a'.repeat(40)}`, reasons: ['declared policy'], files: [],
    })));
    if (sensitive) Object.assign(v.plan.assessment, { tier: 'T2', reasons: ['runtime-sensitive:src/auth.ts'] });
    const p = conditionalGraphProposal(v); bounded(p);
    assert.equal(p.assessmentState, 'unavailable');
    assert.deepEqual(p.nodes, []); assert.deepEqual(p.edges, []);
    if (name !== 'byte') {
      assert.equal(p.requiredRolesComplete, true);
      for (const r of v.plan.reviewers) assert.ok(p.requiredRoles.includes(r.agent));
    } else {
      assert.equal(p.requiredRolesComplete, false);
      assert.ok(p.limitations.includes('requirements-overflow'));
    }
  });
}

test('raw paths, reasons, prompts, tokens and overlay bindings never escape', () => {
  const canary = 'PRIVATE_CANARY_very_sensitive_123';
  const v = input();
  v.plan.root = `/private/${canary}`;
  v.plan.reason = canary; v.plan.prompt = canary; v.plan.token = canary; v.plan.overlayDigest = canary;
  v.plan.assessment.files = [`src/${canary}.ts`];
  v.plan.assessment.reasons = [`runtime-sensitive:src/${canary}.ts`]; v.plan.assessment.tier = 'T2';
  v.plan.reviewers[0].files = [`src/${canary}.ts`]; v.plan.reviewers[0].reasons = [canary];
  const p = conditionalGraphProposal(v); bounded(p);
  assert.equal(p.assessmentState, 'known');
  assert.ok(!JSON.stringify(p).includes(canary));
  v.plan.assessment.reasons = [canary];
  assert.equal(conditionalGraphProposal(v).assessmentState, 'unavailable');
  assert.ok(!JSON.stringify(conditionalGraphProposal(v)).includes(canary));
});

test('oversized upstream requirement inventory is explicitly incomplete even before graph construction', () => {
  const v = input();
  v.plan.reviewers = Array.from({ length: 2001 }, (_, n) => ({ agent: `specialist-${n}`, reasons: ['declared'], files: [] }));
  const p = conditionalGraphProposal(v); bounded(p);
  assert.equal(p.assessmentState, 'unavailable');
  assert.equal(p.requiredRolesComplete, false);
  assert.ok(p.limitations.includes('requirements-overflow'));
});

test('oversized gate inventory refuses omission without reading any array element', () => {
  const v = input();
  let indexedReads = 0;
  v.requiredGates = new Proxy(new Array(129), {
    get(target, property, receiver) {
      if (/^\d+$/.test(String(property))) {
        indexedReads++;
        throw Error('oversized gate elements must not be read');
      }
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      if (/^\d+$/.test(String(property))) return true;
      return Reflect.has(target, property);
    },
  });
  const p = conditionalGraphProposal(v); bounded(p);
  assert.equal(indexedReads, 0);
  assert.equal(p.assessmentState, 'unavailable');
  assert.equal(p.assessmentFingerprint, null);
  assert.deepEqual(p.reasons, ['invalid-gates']);
  assert.ok(p.limitations.includes('no-selective-omission'));
  assert.deepEqual(p.requiredGates, ['compliance', 'import', 'security', 'ship']);
});

test('native and controlled share semantics but native limitations stay explicit', () => {
  const v = input(); const controlled = conditionalGraphProposal(v);
  v.host = 'claude-code'; const native = conditionalGraphProposal(v);
  for (const field of ['nodes', 'edges', 'requiredRoles', 'requiredGates', 'routeClasses', 'assessmentFingerprint']) assert.deepEqual(native[field], controlled[field]);
  assert.ok(native.limitations.includes('native-causal-coverage-unavailable'));
  assert.ok(native.limitations.includes('native-enforcement-not-attested'));
  assert.ok(!controlled.limitations.includes('native-enforcement-not-attested'));
});

test('deep-frozen input repeats deterministically and modules contain no authority operations', () => {
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const v = freeze(input());
  assert.deepEqual(conditionalGraphProposal(v), conditionalGraphProposal(v));
  assert.deepEqual(conditionalGraphProposal(), conditionalGraphProposal(null));
  for (const file of ['conditional-graph-proposal', 'focus-registry']) {
    const source = readFileSync(new URL(`../../scripts/lib/${file}.mjs`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /node:(?:fs|child_process)|\b(?:fetch|execFileSync|spawnSync|specialistPlan|prepareDomainContext|auditOverlay)\s*\(/);
  }
  const serialized = JSON.stringify(conditionalGraphProposal(v));
  assert.doesNotMatch(serialized, /"(?:attemptId|resultId|timestamp|status|approvalReceipt|queue|reusablePass)"/);
});

test('real supplied specialistPlan output projects known evidence and retains unknown superset', t => {
  const root = mkdtempSync(join(tmpdir(), 'conditional-proposal-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  mkdirSync(join(root, '.great_cto')); mkdirSync(join(root, 'src'));
  writeFileSync(join(root, '.great_cto/PROJECT.md'), 'archetype: fintech\n');
  writeFileSync(join(root, 'src/view.ts'), 'baseline');
  git('add', '.'); git('commit', '-qm', 'baseline');
  const pinned = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'src/view.ts'), 'changed');
  const plan = specialistPlan({ root, base: pinned, rules: [] });
  const p = conditionalGraphProposal({ focusId: 'fintech-crypto', host: 'codex', base: pinned, plan });
  bounded(p); assert.equal(p.assessmentState, 'known');
  for (const r of plan.reviewers) assert.ok(p.requiredRoles.includes(r.agent));
  const unknown = specialistPlan({ root, base: 'missing', rules: [] });
  const unavailable = conditionalGraphProposal({ focusId: 'fintech-crypto', host: 'claude-code', base: pinned, plan: unknown });
  bounded(unavailable); assert.equal(unavailable.assessmentState, 'unavailable');
  for (const r of unknown.reviewers) assert.ok(unavailable.requiredRoles.includes(r.agent));
});
