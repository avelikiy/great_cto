/** Trusted harness: construction/selection only; never calls runStage or approve. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync, realpathSync, lstatSync, readdirSync, openSync, writeSync, ftruncateSync, closeSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const domains = [
  { archetype: 'web-service', path: 'src/ui.ts', expected: [] },
  { archetype: 'fintech', path: 'src/payment.ts', expected: ['pci-reviewer', 'regulated-reviewer'] },
  { archetype: 'mobile-app', path: 'src/store_listing.ts', expected: ['mobile-store-reviewer'] },
  { archetype: 'ai-system', path: 'prompts/system.txt', expected: ['ai-security-reviewer', 'ai-prompt-architect', 'ai-eval-engineer'] },
];
const mandatory = ['code-reviewer', 'qa-engineer', 'security-officer'];
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];

export async function probeControllerAssets({ pluginRoot, fixtureRoot }) {
  pluginRoot = realpathSync(pluginRoot); fixtureRoot = realpathSync(fixtureRoot);
  assert.ok(lstatSync(fixtureRoot).isDirectory());
  if (readdirSync(fixtureRoot).length || (lstatSync(fixtureRoot).mode & 0o077)) throw Error('private empty fixture root required');
  // Hold an exclusively created inode, not a reopenable pathname. This is
  // diagnostic progress only, never evidence of admission or successful work.
  const progressFd = openSync(join(fixtureRoot, 'probe-progress.json'), 'wx', 0o600);
  const start = performance.now(); let sequence = 0;
  const checkpoint = (stage, label = null) => {
    const value = Buffer.from(JSON.stringify({ version: 1, scope: 'diagnostic-progress-only', sequence: ++sequence,
      stage, label, elapsedMs: Math.round(performance.now() - start), recordedAt: new Date().toISOString(),
      benchmarkEligible: false, descendantQuiescenceVerified: false }));
    writeSync(progressFd, value, 0, value.length, 0); ftruncateSync(progressFd, value.length);
  };
  checkpoint('import-start');
  try {
  const load = name => import(pathToFileURL(join(pluginRoot, name)).href);
  const { newRun, advance } = await load('scripts/lib/codex-pipeline.mjs');
  const { codexRoleProfile } = await load('scripts/lib/codex-role-profiles.mjs');
  const { specialistPlan } = await load('scripts/lib/specialist-plan.mjs');
  const { RULES } = await load('scripts/hooks/auto-attach-reviewers.mjs');
  checkpoint('import-complete');
  const graphSha256 = sha(readFileSync(join(pluginRoot, 'shared/pipeline.toml')));
  const cases = [], refusals = [];
  function fixture(label, domain = domains[0]) {
    checkpoint('fixture-start', label);
    const root = join(fixtureRoot, label); mkdirSync(root, { mode: 0o700 });
    const put = (name, content) => { const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
    put('.great_cto/PROJECT.md', `archetype: ${domain.archetype}\n`); put(domain.path, 'v1\n');
    const git = args => { checkpoint(`git-${args[0]}-start`, label); const result = execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
      '-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
    { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 65536 });
      checkpoint(`git-${args[0]}-complete`, label); return result; };
    const templates = join(fixtureRoot, 'empty-git-template'); mkdirSync(templates, { recursive: true });
    git(['init', '-q', '--template', templates]); git(['add', '.']); git(['commit', '-qm', 'fixture baseline']);
    const base = git(['rev-parse', 'HEAD']).trim(); put(domain.path, 'v2\n');
    const args = workflow => {
      // Operator policy bytes live outside the worker fixture. This directly
      // exercises construction, not the CLI's path admission or approvals.
      const policy = join(fixtureRoot, `${label}-${workflow}-policy.json`);
      writeFileSync(policy, JSON.stringify({ mode: 'adaptive', workflow, base }), { mode: 0o600 });
      return { root, pluginRoot, prompt: 'Assess packaged controller fixture', allowed: ['src', 'docs', 'prompts'],
        entry: workflow === 'full-cycle' ? 'product-owner' : 'senior-dev',
        hostRoutes: { 'senior-dev': 'claude-code', 'code-reviewer': 'codex', 'qa-engineer': 'claude-code', 'security-officer': 'codex' },
        specialistPolicy: JSON.parse(readFileSync(policy, 'utf8')) };
    };
    return { root, put, base, args, domain };
  }
  const pristine = state => {
    assert.equal(state.attempts.length, 0); assert.equal(state.approvals.length, 0); assert.equal(state.steps, 0);
    assert.deepEqual(state.results, {}); assert.equal(state.active, null); assert.equal(state.pending, null);
  };
  for (const domain of domains) for (const workflow of ['existing-change', 'phased-change', 'full-cycle']) {
    const label = `${domain.archetype}-${workflow}`, f = fixture(label, domain);
    checkpoint('construction-start', label);
    // Existing-change intentionally cannot move AI prompt contracts after code.
    if (domain.archetype === 'ai-system' && workflow === 'existing-change') {
      assert.throws(() => newRun(f.args(workflow)), /specialist phase unsupported/);
      refusals.push({ label, state: 'refused' }); continue;
    }
    const state = newRun(f.args(workflow)); pristine(state); assert.equal(state.graphHash, graphSha256);
    checkpoint('construction-complete', label);
    assert.equal(state.hostRoutes['senior-dev'], 'claude-code'); assert.equal(state.hostRoutes['code-reviewer'], 'codex');
    checkpoint('selection-start', label);
    const plan = specialistPlan({ root: f.root, base: f.base, rules: RULES });
    checkpoint('selection-complete', label);
    assert.equal(plan.state, 'planned'); assert.equal(plan.assessment.known, true);
    const roles = plan.reviewers.map(r => r.agent);
    for (const role of [...mandatory, ...domain.expected]) assert.ok(roles.includes(role), `missing required ${role} in ${label}`);
    for (const role of Object.keys(state.graph).filter(key => !key.includes('.'))) {
      // Preparation keys route through a registered underlying profile.
      assert.ok(codexRoleProfile(state.specialistStages?.[role]?.role || role).length > 50);
    }
    for (const role of mandatory) {
      assert.deepEqual(list(state.graph[role].next), ['devops']);
      for (const peer of mandatory.filter(p => p !== role)) assert.ok(list(state.graph[role].join).includes(peer));
      assert.ok(list(state.graph[role].gate).includes('gate:ship'));
    }
    for (const gate of ['gate:security', 'gate:compliance']) assert.ok(list(state.graph['security-officer'].gate).includes(gate));
    if (workflow === 'phased-change') {
      const prep = state.specialistPreparation;
      for (const role of domain.expected.filter(r => r !== 'ai-eval-engineer')) assert.ok(prep.roles.includes(`${role}-prebuild`));
      for (const role of prep.roles) {
        assert.deepEqual(list(state.graph[role].next), ['senior-dev']);
        assert.ok(list(state.graph[role].gate).includes('gate:plan'));
      }
      if (domain.archetype === 'fintech') for (const gate of ['gate:security', 'gate:compliance']) assert.ok(prep.hardGates.includes(gate));
    }
    if (workflow === 'full-cycle') {
      assert.deepEqual(state.queue, ['product-owner']);
      for (const role of domain.expected.filter(r => r !== 'ai-eval-engineer')) assert.equal(state.specialistStages[`${role}-prebuild`]?.role, role);
      for (const [role, next, gate] of [['product-owner', 'architect', 'gate:product'], ['architect', 'pm', 'gate:arch'], ['pm', 'senior-dev', 'gate:plan']]) {
        assert.ok(list(state.graph[role].next).includes(next)); assert.ok(list(state.graph[role].gate).includes(gate));
      }
    }
    cases.push({ label, workflow, archetype: domain.archetype, selected: roles, queue: state.queue, graphSha256, hostRoutes: state.hostRoutes });
  }
  const refuse = (label, action, pattern) => { assert.throws(action, pattern); refusals.push({ label, state: 'refused' }); };
  {
    const f = fixture('missing-project'); unlinkSync(join(f.root, '.great_cto/PROJECT.md'));
    refuse('missing-project', () => newRun(f.args('phased-change')), /ENOENT/);
  }
  {
    const f = fixture('unknown-archetype'); f.put('.great_cto/PROJECT.md', 'archetype: unknown-fixture\n');
    refuse('unknown-archetype', () => newRun(f.args('phased-change')), /known project archetype required/);
  }
  {
    const f = fixture('empty-existing-change'); f.put(f.domain.path, 'v1\n');
    refuse('empty-existing-change', () => newRun(f.args('existing-change')), /empty change has no risk evidence/);
    const planning = newRun(f.args('phased-change')); pristine(planning);
    assert.equal(planning.specialistPreparation.plan.planningOnly, true);
    assert.equal(planning.specialistPreparation.plan.assessment.known, false);
    assert.equal(planning.specialistPreparation.plan.assessment.tier, 'T2');
    cases.push({ label: 'clean-planning-remains-unknown-T2', workflow: 'phased-change', archetype: 'web-service' });
  }
  {
    const f = fixture('missing-pipeline'), missing = join(fixtureRoot, 'missing-plugin'); mkdirSync(missing);
    refuse('missing-pipeline', () => newRun({ ...f.args('phased-change'), pluginRoot: missing }), /ENOENT/);
  }
  for (const label of ['unsafe-exit', 'missing-compliance', 'project-drift']) {
    const f = fixture(label, domains[1]), state = newRun(f.args('phased-change'));
    if (label === 'unsafe-exit') state.graph['qa-engineer'].next = ['l3-support'];
    if (label === 'missing-compliance') state.graph['security-officer'].gate = ['gate:ship', 'gate:security'];
    if (label === 'project-drift') f.put('.great_cto/PROJECT.md', 'archetype: web-service\n');
    advance(state); assert.equal(state.status, 'blocked'); pristine(state);
    assert.match(state.reason, /review floor: unsafe exit|review floor: missing security\/compliance|project domain policy changed/);
    refusals.push({ label, state: 'blocked' });
  }
  checkpoint('complete');
  return { version: 1, scope: 'delivered-controller-construction-and-selection-only', graphSha256, cases, refusals,
    dispatchAttempts: 0, approvalsRecorded: 0, providerCalls: null, executionArtifactProvenanceVerified: false, benchmarkEligible: false };
  } finally { closeSync(progressFd); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await probeControllerAssets({ pluginRoot: process.argv[2], fixtureRoot: process.argv[3] })));
}
