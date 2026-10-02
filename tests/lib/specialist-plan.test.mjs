import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { specialistPlan, adaptiveSpecialistPlan } from '../../scripts/lib/specialist-plan.mjs';
import { RULES } from '../../scripts/hooks/auto-attach-reviewers.mjs';

function fixture(t, project = 'archetype: web-service\n') {
  const root = mkdtempSync(join(tmpdir(), 'specialist-plan-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, text) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  put('.great_cto/PROJECT.md', project); put('src/ui.ts', 'ui v1'); put('src/dependency.ts', 'dep v1');
  git('add', '.'); git('commit', '-qm', 'baseline');
  const base = git('rev-parse', 'HEAD');
  const plan = () => specialistPlan({ root, base, rules: RULES });
  return { root, put, git, base, plan };
}
const agents = plan => plan.reviewers.map(r => r.agent);

test('opt-in stays off; current low-risk diff selects only mandatory review, not catalog', t => {
  const f = fixture(t); f.put('src/ui.ts', 'ui v2');
  assert.equal(adaptiveSpecialistPlan(f.root, RULES, {}), null);
  const p = f.plan(); assert.equal(p.state, 'planned'); assert.equal(p.reusablePass, false);
  assert.deepEqual(agents(p), ['code-reviewer', 'qa-engineer', 'security-officer']);
});

test('domain and compliance floors survive low-risk UI changes and deduplicate roles', t => {
  const f = fixture(t, 'archetype: fintech\ncompliance: [pci-dss, gdpr]\n'); f.put('src/ui.ts', 'v2');
  const p = f.plan();
  for (const r of ['pci-reviewer', 'regulated-reviewer', 'gdpr-reviewer', 'security-officer']) assert.ok(agents(p).includes(r));
  assert.equal(agents(p).filter(r => r === 'pci-reviewer').length, 1);
});

test('sensitive source, prompt markdown and compliance documents select specialists', t => {
  const f = fixture(t); f.put('db/migrations/0001.sql', 'ALTER TABLE x'); f.put('prompts/system.md', 'rules'); f.put('docs/fedramp-boundary.md', 'boundary');
  const p = f.plan(); assert.equal(p.assessment.tier, 'T2');
  for (const r of ['db-migration-reviewer', 'ai-security-reviewer', 'ai-eval-engineer', 'gov-reviewer']) assert.ok(agents(p).includes(r), r);
});

test('artifact bytes and dependency-only edits invalidate the notice fingerprint', t => {
  const f = fixture(t); f.put('src/ui.ts', 'v2'); const a = f.plan();
  f.put('src/dependency.ts', 'dep v2'); const b = f.plan(); assert.notEqual(a.fingerprint, b.fingerprint);
  f.put('src/ui.ts', 'v3'); assert.notEqual(b.fingerprint, f.plan().fingerprint);
});

test('deleted and renamed sensitive paths remain in selection', t => {
  const f = fixture(t); f.put('src/payments.ts', 'pay'); f.git('add', '.'); f.git('commit', '-qm', 'payment');
  const base = f.git('rev-parse', 'HEAD'); renameSync(join(f.root, 'src/payments.ts'), join(f.root, 'src/plain.ts'));
  let p = specialistPlan({ root: f.root, base, rules: RULES }); assert.ok(agents(p).includes('pci-reviewer'));
  unlinkSync(join(f.root, 'src/plain.ts')); p = specialistPlan({ root: f.root, base, rules: RULES }); assert.ok(agents(p).includes('pci-reviewer'));
});

test('missing base/project, unknown archetype or unsafe dependencies refuse selective omission', t => {
  const f = fixture(t); f.put('src/ui.ts', 'v2');
  const unknown = specialistPlan({ root: f.root, base: 'main', rules: RULES }); assert.equal(unknown.state, 'unknown'); assert.equal(unknown.fingerprint, null);
  f.put('.great_cto/PROJECT.md', 'archetype: unknown\n'); assert.equal(f.plan().state, 'unknown');
  f.put('.great_cto/PROJECT.md', 'archetype: web-service\n'); symlinkSync('/etc', join(f.root, 'external'));
  assert.equal(f.plan().state, 'unknown'); unlinkSync(join(f.root, 'external')); unlinkSync(join(f.root, '.great_cto/PROJECT.md'));
  assert.equal(f.plan().state, 'unknown'); assert.ok(agents(f.plan()).includes('regulated-reviewer'));
});

test('activity logs do not invalidate notification identity or grant review reuse', t => {
  const f = fixture(t); f.put('src/ui.ts', 'v2'); const before = f.plan();
  f.put('.great_cto/cache/adaptive-reviewer-notice.json', '{}');
  assert.equal(f.plan().assessment.tier, before.assessment.tier);
  assert.equal(f.plan().fingerprint, before.fingerprint);
  f.put('.great_cto/verdicts/pci-reviewer.log', `${new Date().toISOString()} | pci-reviewer | APPROVED`);
  assert.equal(f.plan().fingerprint, before.fingerprint); assert.equal(f.plan().reusablePass, false);
});

test('native session plan ignores unrelated recent commits outside the pinned diff', t => {
  const f = fixture(t); f.put('src/payments.ts', 'historical payment'); f.git('add', '.'); f.git('commit', '-qm', 'history');
  const base = f.git('rev-parse', 'HEAD'); f.put('src/ui.ts', 'v2');
  const hook = fileURLToPath(new URL('../../scripts/hooks/auto-attach-reviewers.mjs', import.meta.url));
  const out = spawnSync(process.execPath, [hook], { cwd: f.root, encoding: 'utf8', env: { ...process.env, GREAT_CTO_ADAPTIVE_REVIEWERS: '1', GREAT_CTO_CHANGE_BASE: base } });
  assert.equal(out.status, 0); assert.match(out.stdout, /SPECIALIST-PLAN/); assert.doesNotMatch(out.stdout, /pci-reviewer/);
});

test('native nudge suppresses only same-scope notices; fresh PASS never suppresses changed scope', t => {
  const f = fixture(t); f.put('src/payments.ts', 'v1');
  f.put('.great_cto/verdicts/pci-reviewer.log', `${new Date().toISOString()} | pci-reviewer | APPROVED`);
  const hook = fileURLToPath(new URL('../../scripts/hooks/reviewer-nudge.mjs', import.meta.url));
  const run = () => spawnSync(process.execPath, [hook], { cwd: f.root, encoding: 'utf8', input: JSON.stringify({ tool_input: { file_path: 'src/payments.ts' } }),
    env: { ...process.env, GREAT_CTO_DIR: join(f.root, '.great_cto'), GREAT_CTO_DISABLE_REVIEWER_NUDGE: '', GREAT_CTO_ADAPTIVE_REVIEWERS: '1', GREAT_CTO_CHANGE_BASE: f.base } });
  const first = run(); assert.equal(first.status, 0); assert.match(first.stdout, /pci-reviewer/); assert.equal(run().stdout, '');
  f.put('src/dependency.ts', 'v2'); assert.match(run().stdout, /pci-reviewer/);
  f.put('.great_cto/PROJECT.md', 'archetype: missing'); assert.match(run().stdout, /unknown/); assert.match(run().stdout, /unknown/);
});
