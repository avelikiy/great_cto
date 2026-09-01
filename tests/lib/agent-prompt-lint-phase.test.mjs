// The PHASE rules read a section that lives in two files.
//
// The eight pipeline agents stopped inlining the phase-task block and started
// pointing at `agents/_shared/phase-task.md` — the DRY move CONS-NOREPEAT asks
// for. The rules kept reading only the agent's own text, so all eight failed at
// once and the only way to satisfy them was to undo the refactor. Sixteen errors
// that were entirely about the linter.
//
// What is asserted here is not "zero errors" — that is the state a fail-open
// rewrite also produces, and it is the state this file exists to distinguish
// from a rule that still works. Each case MUTATES one thing and asserts the
// error appears, so a rule that stopped judging cannot pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const LINT = path.join(ROOT, 'scripts/agent-prompt-lint.mjs');

/** Lint a repo copy and return its findings, whatever the exit code. */
function lint(root) {
  let out;
  try {
    out = execFileSync(process.execPath, [path.join(root, 'scripts/agent-prompt-lint.mjs'), '--json'],
      { cwd: root, encoding: 'utf8' });
  } catch (e) {
    out = e.stdout ?? '';           // exit 1 on errors is the normal path
  }
  return JSON.parse(out);
}

const errorsOf = (d) => d.results.flatMap(
  (r) => r.findings.filter((f) => f.severity === 'error').map((f) => `${r.file}:${f.rule}`));

/**
 * A throwaway copy of the parts the linter reads. Mutating the real tree would
 * make a crashed test leave the repository broken.
 */
function sandbox() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gc-lint-'));
  cpSync(path.join(ROOT, 'agents'), path.join(dir, 'agents'), { recursive: true });
  cpSync(path.join(ROOT, 'scripts/agent-prompt-lint.mjs'), path.join(dir, 'scripts/agent-prompt-lint.mjs'),
    { recursive: true });
  return dir;
}

test('the shipped agents are clean — the shared block resolves', () => {
  const d = lint(sandbox());
  assert.equal(d.errors, 0, `expected no errors, got: ${errorsOf(d).join(', ')}`);
  assert.ok(d.total >= 60, 'the whole agent corpus was linted, not a subset');
});

test('a slug bound to another agent is caught', () => {
  const dir = sandbox();
  const f = path.join(dir, 'agents/architect.md');
  writeFileSync(f, readFileSync(f, 'utf8').replace('<agent-name> = architect', '<agent-name> = devops'));
  const d = lint(dir);
  assert.equal(d.errors, 1, 'exactly the mutated agent fails');
  assert.match(errorsOf(d)[0], /architect\.md:PHASE-003/);
  rmSync(dir, { recursive: true, force: true });
});

test('a shared block that cannot be read is an error, not a pass', () => {
  // The failure mode the resolver exists to prevent: if "no shared block" fell
  // through to judging the agent's own text, deleting the canonical file would
  // read as eight clean agents whose instructions had vanished.
  const dir = sandbox();
  rmSync(path.join(dir, 'agents/_shared/phase-task.md'));
  const d = lint(dir);
  assert.equal(d.errors, 16, 'all eight pipeline agents report both PHASE rules');
  assert.ok(errorsOf(d).every((e) => /PHASE-00[23]$/.test(e)));
  rmSync(dir, { recursive: true, force: true });
});

test('a shared block that lost the helper is caught', () => {
  const dir = sandbox();
  const f = path.join(dir, 'agents/_shared/phase-task.md');
  writeFileSync(f, readFileSync(f, 'utf8').replaceAll('phase-task.sh', 'REMOVED.sh'));
  const d = lint(dir);
  assert.equal(d.errors, 8, 'PHASE-002 fires once per pipeline agent');
  assert.ok(errorsOf(d).every((e) => e.endsWith('PHASE-002')));
  rmSync(dir, { recursive: true, force: true });
});
