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
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

// ─── placeholders ──────────────────────────────────────────────────────────
//
// A model with nothing to put in a field does not leave it empty — it fills it
// with something field-shaped. `<none>` in an Evidence block is the absence of
// evidence wearing evidence's clothes, and a field filled with a placeholder is
// worse than one left blank: blank is visibly incomplete, `<none>` looks
// answered. The same list guards deploy secrets in deploy-preflight.mjs.

const withEvidence = (status, block, location = '`src/a.ts:12`') => `
### [High] Something is wrong

- **Location**: ${location}
- **Problem**: it is wrong
- **Evidence**: ${status}
${block}
`;

test('a placeholder in the evidence output is not an observation', () => {
  for (const junk of ['<none>', 'none', 'N/A', 'null', 'undefined', 'TODO', '...', '(output)', 'omitted']) {
    const f = parseFindings(withEvidence('failed', '```\n$ grep -n KEY .env\n' + junk + '\n```'))[0];
    const r = checkFinding(f);
    assert.equal(r.ok, false, junk);
    assert.match(r.problems.join(' '), /placeholder, not an observation/, junk);
  }
});

test('a placeholder command names nothing that was run', () => {
  const f = parseFindings(withEvidence('failed', '```\n<command>\nsome output\n```'))[0];
  assert.match(checkFinding(f).problems.join(' '), /name the command you ran/);
});

test('a placeholder location is rejected — say where you looked', () => {
  for (const junk of ['`<unknown>`', 'N/A', 'TBD', '`—`']) {
    const f = parseFindings(withEvidence('failed', '```\n$ grep KEY .env\nnothing\n```', junk))[0];
    assert.match(checkFinding(f).problems.join(' '), /is a placeholder/, junk);
  }
});

test('real output that merely looks terse is accepted', () => {
  // Refusing anything short would make the check unusable; only the known
  // stand-ins are refused.
  for (const real of ['0', 'exit 1', 'no matches found', 'false', '{}']) {
    const f = parseFindings(withEvidence('failed', '```\n$ grep -c KEY .env\n' + real + '\n```'))[0];
    assert.deepEqual(checkFinding(f).problems, [], real);
  }
});

test('a real location is accepted', () => {
  const f = parseFindings(withEvidence('failed', '```\n$ grep KEY .env\nnothing\n```', '`packages/board/lib/config.mjs:12`'))[0];
  assert.deepEqual(checkFinding(f).problems, []);
});

// ─── quoted passages ───────────────────────────────────────────────────────
//
// A finding that quotes a regulation, an ADR or the code reads as evidence: the
// reader assumes somebody copied the passage. The command requirement above
// never looked at it, so an invented quote attributed to a real file passed.
// Given a working directory, the check now looks the passage up in the file it
// cites (scripts/lib/quote-verify.mjs) and refuses the finding when it is not
// there — under Hypotheses too, because an invented quote is not a question.

const qdir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-fe-quotes-'));
after(() => fs.rmSync(qdir, { recursive: true, force: true }));
fs.mkdirSync(path.join(qdir, 'docs/adr'), { recursive: true });
fs.writeFileSync(path.join(qdir, 'docs/adr/ADR-004.md'),
  '# ADR-004\n\nSessions are signed with SESSION_SECRET.\nStartup fails when the secret is\nmissing.\n');

const quoting = (line) => finding().replace('- **Why it matters**', `${line}\n- **Why it matters**`);

test('a finding whose quote is in the cited file passes, including across a line break', () => {
  const f = parseFindings(quoting('- **Rationale**: `docs/adr/ADR-004.md:4` says "Startup fails when the secret is missing."'))[0];
  const r = checkFinding(f, { cwd: qdir });
  assert.deepEqual(r.problems, []);
  assert.equal(r.quotes.status, 'passed');
  assert.equal(r.quotes.results[0].status, 'normalized');
});

test('a finding whose quote is invented is rejected, with the nearest real line', () => {
  const f = parseFindings(quoting('- **Rationale**: `docs/adr/ADR-004.md:4` says "Startup must page the on-call engineer when the secret is missing."'))[0];
  const r = checkFinding(f, { cwd: qdir });
  assert.equal(r.ok, false);
  assert.equal(r.quotes.status, 'failed', 'the quote check ran and the quote is not there — a result, in the proof vocabulary');
  assert.match(r.problems.join(' '), /not in `docs\/adr\/ADR-004\.md`/);
  assert.match(r.problems.join(' '), /nearest: line \d/);
  assert.match(r.problems.join(' '), /paraphrase/, 'and it names the honest alternative');
});

test('a quote that cites a file which does not exist is rejected', () => {
  const f = parseFindings(quoting('- **Rationale**: `docs/adr/ADR-999.md` says "the secret rotates every thirty days".'))[0];
  const r = checkFinding(f, { cwd: qdir });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(' '), /ADR-999\.md.*does not exist/);
});

test('an invented quote is refused under Hypotheses too', () => {
  const text = '## Hypotheses\n' + finding({ status: 'not_run', block: '' })
    .replace('- **Why it matters**', '- **Rationale**: `docs/adr/ADR-004.md` says "rotation is handled by the vault".\n- **Why it matters**');
  const r = checkFinding(parseFindings(text)[0], { cwd: qdir });
  assert.equal(r.ok, false);
});

test('a passage marked as a paraphrase is not checked as a quote', () => {
  const f = parseFindings(quoting('- **Rationale**: `docs/adr/ADR-004.md` requires "the app to refuse to boot without a secret" (paraphrase).'))[0];
  const r = checkFinding(f, { cwd: qdir });
  assert.deepEqual(r.problems, []);
  assert.equal(r.quotes.status, 'not_run');
});

test('without a working directory the quote check does not run — and says so', () => {
  const f = parseFindings(quoting('- **Rationale**: `docs/adr/ADR-004.md` says "an invented sentence goes here".'))[0];
  const r = checkFinding(f);
  assert.equal(r.ok, true, 'the pure text check is unchanged for callers that pass no cwd');
  assert.equal(r.quotes.status, 'not_run');
});

test('the CLI checks quotes against the directory it runs in', () => {
  const report = path.join(qdir, 'REVIEW.md');
  fs.writeFileSync(report, quoting('- **Rationale**: `docs/adr/ADR-004.md:4` says "Startup must page the on-call engineer."'));
  const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/lib/finding-evidence.mjs');
  const r = spawnSync(process.execPath, [bin, 'REVIEW.md', '--strict'], { cwd: qdir, encoding: 'utf8' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /not in `docs\/adr\/ADR-004\.md`/);
  const off = spawnSync(process.execPath, [bin, 'REVIEW.md', '--strict', '--no-quotes'], { cwd: qdir, encoding: 'utf8' });
  assert.equal(off.status, 0, off.stdout + off.stderr);
});
