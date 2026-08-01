// The Structured Findings Format asks for problems that are "evidence-backed".
// That is an adjective: nothing read it and nothing rejected a finding without
// evidence. The failure it permitted is the expensive one — an agent writes "the
// secret is not set" because it looks true, and the sentence is indistinguishable
// from one produced by running grep and reading the output.
//
// A reviewer cannot tell them apart either, which is why a second model reading
// the report was the wrong fix: a fluent wrong finding is exactly what
// plausibility-checking approves. The check has to ask whether the agent touched
// the world, not whether the prose reads well.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFindings, evidenceStatus, evidenceBlock, checkFinding, checkReport,
} from '../../scripts/lib/finding-evidence.mjs';

const finding = ({ sev = 'High', title = 'Session secret is unset', status = 'failed',
                   block = '```\n$ grep -n SESSION_SECRET .env.production\n(no output — exit 1)\n```' } = {}) => `
### [${sev}] ${title}

- **Location**: \`packages/board/lib/config.mjs:12\`
- **Problem**: the board boots with no session secret
- **Evidence**: ${status}
${block}
- **Why it matters**: sessions are forgeable
- **Recommended fix**: fail startup when the variable is missing
`;

// ── parsing ────────────────────────────────────────────────────────────────

test('a findings report splits into its findings', () => {
  const f = parseFindings(finding() + finding({ title: 'Second thing' }));
  assert.equal(f.length, 2);
  assert.equal(f[0].severity, 'High');
  assert.equal(f[1].title, 'Second thing');
});

test('a heading inside a fenced block does not end a finding', () => {
  const f = parseFindings(finding({ block: '```bash\n# check the config\n$ cat config.json\n{}\n```' }));
  assert.equal(f.length, 1, 'a shell comment is not a markdown heading');
  assert.match(f[0].body, /cat config\.json/);
});

test('a report with no findings yields none rather than throwing', () => {
  assert.deepEqual(parseFindings('# Report\n\nAll clear.\n'), []);
  assert.deepEqual(parseFindings(''), []);
  assert.deepEqual(parseFindings(null), []);
});

// ── the evidence field ─────────────────────────────────────────────────────

test('the evidence status is read from the field', () => {
  assert.equal(evidenceStatus(finding({ status: 'passed' })), 'passed');
  assert.equal(evidenceStatus(finding({ status: 'not_run' })), 'not_run');
  assert.equal(evidenceStatus('- **Problem**: something'), null);
});

test('the command and its output are read as a pair', () => {
  const b = evidenceBlock(finding());
  assert.equal(b.command, 'grep -n SESSION_SECRET .env.production');
  assert.match(b.output, /no output/);
});

// ── what it rejects ────────────────────────────────────────────────────────

test('a finding with no evidence field is rejected', () => {
  const f = parseFindings('### [High] It is broken\n\n- **Problem**: trust me\n')[0];
  const r = checkFinding(f);
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /no `\*\*Evidence\*\*` field/);
  assert.match(r.problems[0], /not_run/, 'and it names the honest alternative');
});

test('a settled status with no command is rejected', () => {
  const f = parseFindings(finding({ block: '' }))[0];
  const r = checkFinding(f);
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /include the command and its raw output/);
});

test('a command with no output is rejected — running something is not observing it', () => {
  const f = parseFindings(finding({ block: '```\n$ grep -n SESSION_SECRET .env\n```' }))[0];
  const r = checkFinding(f);
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /no output/);
});

test('an invented status is rejected and the valid ones are named', () => {
  const f = parseFindings(finding({ status: 'verified' }))[0];
  const r = checkFinding(f);
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /not a proof status/);
  assert.match(r.problems[0], /passed, failed, not_run, inconclusive/);
});

// ── hypotheses ─────────────────────────────────────────────────────────────

test('an unproven claim listed as a finding is rejected', () => {
  const f = parseFindings(finding({ status: 'not_run', block: '' }))[0];
  const r = checkFinding(f);
  assert.equal(r.hypothesis, true);
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /hypothesis/);
});

test('the same claim under a Hypotheses heading is accepted', () => {
  const text = '## Hypotheses\n' + finding({ status: 'not_run', block: '' });
  const f = parseFindings(text)[0];
  assert.equal(f.underHypotheses, true);
  const r = checkFinding(f);
  assert.equal(r.ok, true, 'not knowing is honest — calling it a finding is not');
  assert.equal(r.hypothesis, true);
});

test('inconclusive is a hypothesis too, and distinct from never having run', () => {
  const text = '## Hypotheses\n' + finding({ status: 'inconclusive', block: '' });
  const r = checkFinding(parseFindings(text)[0]);
  assert.equal(r.ok, true);
  assert.equal(r.status, 'inconclusive');
});

test('a heading after the hypotheses section returns to findings', () => {
  const text = '## Hypotheses\n' + finding({ title: 'A guess', status: 'not_run', block: '' })
             + '\n## Findings\n' + finding({ title: 'A fact' });
  const f = parseFindings(text);
  assert.equal(f.find((x) => x.title === 'A guess').underHypotheses, true);
  assert.equal(f.find((x) => x.title === 'A fact').underHypotheses, false);
});

// ── what it accepts ────────────────────────────────────────────────────────

test('a finding that shows its work passes', () => {
  const r = checkFinding(parseFindings(finding())[0]);
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
  assert.equal(r.hypothesis, false);
});

test('passed is a result too — a check that ran and found nothing wrong', () => {
  const r = checkFinding(parseFindings(finding({ status: 'passed' }))[0]);
  assert.equal(r.ok, true);
});

// ── the report level ───────────────────────────────────────────────────────

test('a report reports its counts and every problem with a line number', () => {
  const text = finding() + finding({ title: 'Unproven', status: 'not_run', block: '' });
  const r = checkReport(text);
  assert.equal(r.findings, 2);
  assert.equal(r.hypotheses, 1);
  assert.equal(r.problems.length, 1);
  assert.equal(r.problems[0].title, 'Unproven');
  assert.ok(r.problems[0].line > 0, 'a problem you cannot locate is a problem you will not fix');
});

test('a clean report has no problems', () => {
  assert.deepEqual(checkReport(finding() + finding({ title: 'Another', status: 'passed' })).problems, []);
});
