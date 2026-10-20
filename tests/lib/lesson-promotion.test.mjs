// ADR-037: a lesson reaches every project only with measured evidence.
//
// "Seen in 3 projects" used to write a lesson into ~/.great_cto/decisions.md,
// which every session of every project reads. Recurrence of an LLM's own
// framing is not evidence; it now only makes the lesson a CANDIDATE. Promotion
// needs an A/B eval stamp, decided by the same rule as `/crystallize approve`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  parseLessons, aggregate, promotionDecision, stampLesson, candidatePrompt,
} from '../../scripts/lib/lesson-promotion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MERGE = path.join(ROOT, 'scripts', 'lessons-merge.mjs');
const TMP = [];
after(() => { for (const d of TMP) fs.rmSync(d, { recursive: true, force: true }); });

const lesson = (slug, project, extra = '') => [
  '---', 'date: 2026-10-19', `project: ${project}`, 'archetype: web-service', 'confidence: high', extra, '---', '',
  `## pattern: ${slug}`, '', '**Pattern:** retry the flaky step once, then fail loudly.', '',
].filter((l) => l !== null).join('\n').replace(/\n\n---\n\n/, '\n---\n\n');
const files = (slug, extra = '', n = 3) => Array.from({ length: n }, (_, i) => ({
  project: `p${i}`, path: `/x/p${i}/lessons.md`, text: lesson(slug, `p${i}`, extra),
}));
const decide = (fs_, opts) => promotionDecision(aggregate(fs_).get('retry-once'), opts);
const stampedFm = (dir) => `eval: EVAL-x.md\neval_delta: ${dir === 'regression' ? '-' : '+'}20.0% (±5.0%, ${dir})\neval_confidence: ${dir}`;

test('parseLessons reads frontmatter and slug', () => {
  const [e] = parseLessons(lesson('retry-once', 'p0', 'eval: EVAL-x.md'));
  assert.equal(e.slug, 'retry-once');
  assert.equal(e.fm.eval, 'EVAL-x.md');
});

test('fewer than 3 projects: not even a candidate', () => {
  assert.equal(decide(files('retry-once', 'eval: EVAL-x.md', 2)).state, 'below-threshold');
});

test('3 projects, no eval declared: stays local — it has nothing to be measured against', () => {
  const d = decide(files('retry-once'));
  assert.equal(d.state, 'local-only');
  assert.match(d.reason, /eval:/);
});

test('3 projects, eval declared, not measured: a candidate, not a promotion', () => {
  const d = decide(files('retry-once', 'eval: EVAL-x.md'));
  assert.equal(d.state, 'candidate');
  assert.match(d.reason, /--measure retry-once/);
});

test('a measured improvement promotes; noisy promotes as noisy', () => {
  assert.equal(decide(files('retry-once', stampedFm('improvement'))).state, 'promote');
  const n = decide(files('retry-once', stampedFm('noisy')));
  assert.equal(n.state, 'promote');
  assert.equal(n.evidence, 'noisy');
});

test('a measured regression never promotes, with or without a bypass reason', () => {
  assert.equal(decide(files('retry-once', stampedFm('regression'))).state, 'regression');
  assert.equal(decide(files('retry-once', stampedFm('regression')), { bypassReason: 'trust me' }).state, 'regression');
});

test('an explicit bypass promotes an unmeasured candidate and says so', () => {
  const d = decide(files('retry-once', 'eval: EVAL-x.md'), { bypassReason: 'urgent' });
  assert.equal(d.state, 'promote');
  assert.equal(d.bypassed, true);
});

test('stampLesson stamps one entry in a multi-entry file and leaves the others', () => {
  const text = lesson('other', 'p0') + '\n' + lesson('retry-once', 'p0', 'eval: EVAL-x.md');
  const target = parseLessons(text).find((e) => e.slug === 'retry-once');
  const out = stampLesson(text, target.raw, { meanDelta: 0.2, noiseBand: 0.05, direction: 'improvement' }, { ts: 't', commit: 'c' });
  const after = parseLessons(out);
  assert.equal(after.find((e) => e.slug === 'other').fm.eval_confidence, undefined);
  assert.equal(after.find((e) => e.slug === 'retry-once').fm.eval_confidence, 'improvement');
  assert.equal(decide(Array.from({ length: 3 }, (_, i) => ({ project: `p${i}`, path: '/x', text: out.replace(/project: p0/g, `project: p${i}`) }))).state, 'promote');
});

test('the candidate prompt is the agent prompt plus the lesson, nothing else', () => {
  const p = candidatePrompt('# Agent\nDo the job.\n', parseLessons(lesson('retry-once', 'p0'))[0]);
  assert.match(p, /^# Agent\nDo the job\./);
  assert.match(p, /retry the flaky step once/);
  assert.doesNotMatch(p, /^project:/m, 'frontmatter does not leak into the prompt');
});

// ── the CLI, against a real HOME ──────────────────────────────────────────────

function home(entriesFor) {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-lm-')); TMP.push(h);
  for (let i = 0; i < 3; i++) {
    const d = path.join(h, '.great_cto', 'projects', `p${i}`); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'lessons.md'), entriesFor(i));
  }
  return h;
}
const run = (h, args, env = {}) => spawnSync(process.execPath, [MERGE, ...args], { encoding: 'utf8', env: { ...process.env, HOME: h, ...env } });
const decisions = (h) => { try { return fs.readFileSync(path.join(h, '.great_cto', 'decisions.md'), 'utf8'); } catch { return ''; } };

test('CLI: an unmeasured candidate is listed and not written', () => {
  const h = home((i) => lesson('retry-once', `p${i}`, 'eval: EVAL-x.md'));
  const r = run(h, []);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /candidate.*retry-once/);
  assert.equal(decisions(h), '');
});

test('CLI: a measured improvement is written, carrying its stamp', () => {
  const h = home((i) => lesson('retry-once', `p${i}`, stampedFm('improvement')));
  assert.equal(run(h, []).status, 0);
  const d = decisions(h);
  assert.match(d, /## pattern: retry-once/);
  assert.match(d, /eval_confidence: improvement/);
  assert.doesNotMatch(d, /≥3 distinct/, 'the header describes the real rule');
});

test('CLI: --no-eval needs --slug, writes that one lesson, and leaves an audit line', () => {
  const h = home((i) => lesson('retry-once', `p${i}`, 'eval: EVAL-x.md'));
  assert.notEqual(run(h, ['--no-eval', 'urgent']).status, 0, 'a bypass for every candidate at once is refused');
  assert.equal(decisions(h), '');
  assert.equal(run(h, ['--no-eval', 'urgent', '--slug', 'retry-once']).status, 0);
  assert.match(decisions(h), /promotion: bypassed — urgent/);
  assert.match(fs.readFileSync(path.join(h, '.great_cto', 'metrics', 'crystallize.log'), 'utf8'), /EVAL_BYPASS lesson:retry-once reason="urgent"/);
});

test('CLI: --measure without --yes prints the plan and spends nothing', () => {
  const h = home((i) => lesson('retry-once', `p${i}`, 'eval: EVAL-continuous-learner-extraction.md\ncomponent: prompt'));
  const marker = path.join(h, 'runner-called');
  const stub = path.join(h, 'stub-runner.mjs');
  fs.writeFileSync(stub, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, '1');`);
  const r = run(h, ['--measure', 'retry-once'], { GREAT_CTO_EVAL_RUNNER: stub });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /cost:/);
  assert.match(r.stdout, /--yes/);
  assert.equal(fs.existsSync(marker), false, 'no eval ran');
});

test('CLI: --measure --yes runs both arms, stamps the lesson where it lives', () => {
  const h = home((i) => lesson('retry-once', `p${i}`, 'eval: EVAL-continuous-learner-extraction.md\ncomponent: prompt'));
  // A stub runner: the candidate arm (with --prompt-file) scores higher.
  const stub = path.join(h, 'stub-runner.mjs');
  fs.writeFileSync(stub, `
    import fs from 'node:fs';
    const a = process.argv; const out = a[a.indexOf('--out') + 1];
    const cand = a.includes('--prompt-file');
    if (cand) { const p = fs.readFileSync(a[a.indexOf('--prompt-file') + 1], 'utf8'); if (!/retry the flaky step once/.test(p)) process.exit(3); }
    fs.writeFileSync(out, JSON.stringify({ eval: 'EVAL-continuous-learner-extraction.md', agent: 'continuous-learner', rate: cand ? 0.9 : 0.5, stddev: 0.05 }) + '\\n');
  `);
  const r = run(h, ['--measure', 'retry-once', '--yes'], { GREAT_CTO_EVAL_RUNNER: stub });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /improvement/);
  const stamped = fs.readFileSync(path.join(h, '.great_cto', 'projects', 'p0', 'lessons.md'), 'utf8');
  assert.match(stamped, /eval_confidence: improvement/);
  // And the next merge promotes it.
  assert.equal(run(h, []).status, 0);
  assert.match(decisions(h), /## pattern: retry-once/);
});

// ── component and control arm (ADR-038) ─────────────────────────────────────
import { measurePlan, armPrompts } from '../../scripts/lib/lesson-promotion.mjs';
const one = (extra) => aggregate([{ project: 'p0', path: '/x', text: lesson('retry-once', 'p0', extra) }]).get('retry-once');

test('arms follow the component', () => {
  assert.deepEqual(measurePlan(one('eval: EVAL-x.md\ncomponent: prompt')).arms, ['baseline', 'lesson']);
  assert.deepEqual(measurePlan(one('eval: EVAL-x.md\ncomponent: constraint')).arms, ['baseline', 'lesson']);
  assert.deepEqual(measurePlan(one('eval: EVAL-x.md\ncomponent: skill\nchanges: skills/x/SKILL.md')).arms, ['baseline', 'hint', 'full']);
});

test('a tool lesson, a skill lesson naming no skill, and an unlabelled lesson are refused with the reason', () => {
  assert.match(measurePlan(one('eval: EVAL-x.md\ncomponent: tool')).refuse, /tool/);
  assert.match(measurePlan(one('eval: EVAL-x.md\ncomponent: skill')).refuse, /changes:/);
  assert.match(measurePlan(one('eval: EVAL-x.md')).refuse, /component:/);
});

test('the hint arm is the lesson alone; the full arm adds the skill text after it', () => {
  const e = parseLessons(lesson('retry-once', 'p0'))[0];
  const p = armPrompts('# Agent\n', e, 'SKILL-BODY-MARKER');
  assert.equal(p.baseline, null);
  assert.match(p.hint, /retry the flaky step once/);
  assert.doesNotMatch(p.hint, /SKILL-BODY-MARKER/);
  assert.match(p.full, /retry the flaky step once[\s\S]*SKILL-BODY-MARKER/);
});

test('CLI: a skill lesson whose hint alone hurts is promoted with the skill and says the hint hurts', () => {
  const h = home((i) => lesson('retry-once', `p${i}`, 'eval: EVAL-continuous-learner-extraction.md\ncomponent: skill\nchanges: skills/great_cto/SKILL.md'));
  const stub = path.join(h, 'stub-runner.mjs');
  fs.writeFileSync(stub, `
    import fs from 'node:fs';
    const a = process.argv; const out = a[a.indexOf('--out') + 1];
    let rate = 0.5;
    if (a.includes('--prompt-file')) {
      const p = fs.readFileSync(a[a.indexOf('--prompt-file') + 1], 'utf8');
      rate = /name: great_cto/.test(p) ? 0.9 : 0.2;   // the skill file's frontmatter marks the full arm
    }
    fs.writeFileSync(out, JSON.stringify({ eval: 'EVAL-continuous-learner-extraction.md', agent: 'continuous-learner', rate, stddev: 0.05 }) + '\\n');
  `);
  const r = run(h, ['--measure', 'retry-once', '--yes'], { GREAT_CTO_EVAL_RUNNER: stub });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /hint alone.*regression/i);
  const stamped = fs.readFileSync(path.join(h, '.great_cto', 'projects', 'p0', 'lessons.md'), 'utf8');
  assert.match(stamped, /^eval_confidence: improvement$/m);
  assert.match(stamped, /^eval_delta_hint: -30\.0%/m);
  assert.equal(run(h, []).status, 0);
  const d = decisions(h);
  assert.match(d, /^component: skill$/m);
  assert.match(d, /hint alone made it worse/i);
});

test('CLI: --measure refuses an unlabelled lesson before spending anything', () => {
  const h = home((i) => lesson('retry-once', `p${i}`, 'eval: EVAL-continuous-learner-extraction.md'));
  const r = run(h, ['--measure', 'retry-once', '--yes'], { GREAT_CTO_EVAL_RUNNER: '/nonexistent' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /component:/);
});
