// FM-005: every agent says whether its work may land without a decision.
//
// "Zero errors on the shipped agents" is also what a rule that stopped judging
// produces, so each case below mutates one agent in a throwaway copy and asserts
// the specific error appears. The shipped tree is checked last, to prove the
// real declarations are all accepted — not the other way round.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

function lint(root) {
  let out;
  try {
    out = execFileSync(process.execPath, [path.join(root, 'scripts/agent-prompt-lint.mjs'), '--json'],
      { cwd: root, encoding: 'utf8' });
  } catch (e) {
    out = e.stdout ?? '';
  }
  return JSON.parse(out);
}

/** FM-005 findings as `slug: message`. */
const authorityErrors = (d) => d.results.flatMap((r) => r.findings
  .filter((f) => f.rule === 'FM-005' && f.severity === 'error')
  .map((f) => `${path.basename(r.file, '.md')}: ${f.message}`));

function sandbox() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-lint-authority-'));
  cpSync(path.join(ROOT, 'agents'), path.join(dir, 'agents'), { recursive: true });
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  cpSync(path.join(ROOT, 'scripts/agent-prompt-lint.mjs'), path.join(dir, 'scripts/agent-prompt-lint.mjs'));
  return dir;
}

function mutate(dir, slug, fn) {
  const f = path.join(dir, 'agents', `${slug}.md`);
  writeFileSync(f, fn(readFileSync(f, 'utf8')));
}

const setAuthority = (value) => (text) => text.replace(/^authority:.*$/m, `authority: ${value}`);

test('the shipped agents all declare a valid authority', () => {
  const d = lint(ROOT);
  assert.deepEqual(authorityErrors(d), []);
  // `file` is the agent's basename in the linter's JSON (`qa-engineer.md`), not a path.
  const declared = d.results.filter((r) => /^[^_/][^/]*\.md$/.test(r.file)).length;
  assert.ok(declared >= 70, `linted ${declared} agents`);
});

test('a missing authority is an error', () => {
  const dir = sandbox();
  try {
    mutate(dir, 'qa-engineer', (t) => t.replace(/^authority:.*\n/m, ''));
    assert.deepEqual(authorityErrors(lint(dir)), ['qa-engineer: frontmatter missing `authority` (autonomous | proposes | escalates)']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a value outside the three is an error', () => {
  const dir = sandbox();
  try {
    mutate(dir, 'qa-engineer', setAuthority('sometimes'));
    const errs = authorityErrors(lint(dir));
    assert.equal(errs.length, 1);
    assert.match(errs[0], /must be one of autonomous \| proposes \| escalates, got: sometimes/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('gating an agent that cannot write is an error — it lands nothing to gate', () => {
  const dir = sandbox();
  try {
    mutate(dir, 'decision-scorer', setAuthority('proposes'));
    const errs = authorityErrors(lint(dir));
    assert.equal(errs.length, 1);
    assert.match(errs[0], /^decision-scorer: .*no Write\/Edit tools/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a pinned agent cannot be relaxed in its own frontmatter', () => {
  const dir = sandbox();
  try {
    mutate(dir, 'devops', setAuthority('autonomous'));
    mutate(dir, 'senior-dev', setAuthority('autonomous'));
    const errs = authorityErrors(lint(dir));
    assert.equal(errs.length, 2, errs.join('\n'));
    assert.ok(errs.some((e) => /^devops: .*policy requires 'escalates'/.test(e)));
    assert.ok(errs.some((e) => /^senior-dev: .*policy requires 'proposes'/.test(e)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unpinned agent may tighten its own authority', () => {
  const dir = sandbox();
  try {
    mutate(dir, 'qa-engineer', setAuthority('proposes'));
    assert.deepEqual(authorityErrors(lint(dir)), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
