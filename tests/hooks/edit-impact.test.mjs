// edit-impact — before an existing code file is edited, the model is told who depends
// on it. Built for the failure where an internal signature changed, the public wrapper
// a background job called did not, and green unit tests hid it for a night.
//
// Every test builds a throwaway git repository; nothing touches this one.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { impactFor, formatImpact, resolvesTo } from '../../scripts/hooks/edit-impact.mjs';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'hooks', 'edit-impact.mjs');
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

function repo() {
  const r = mkdtempSync(join(tmpdir(), 'edit-impact-'));
  made.push(r);
  const put = (p, t) => { mkdirSync(dirname(join(r, p)), { recursive: true }); writeFileSync(join(r, p), t); };
  const g = (...a) => execFileSync('git', a, { cwd: r, stdio: 'ignore' });
  g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  put('src/lib/runner.ts', 'export function run(a: string) { return a; }\n');
  put('src/job.ts', "import { run } from './lib/runner';\nrun('x');\n");
  put('src/api/handler.ts', "import { run } from '../lib/runner.js';\n");
  put('src/other/runner.ts', 'export const unrelated = 1;\n');
  put('src/uses-other.ts', "import { unrelated } from './other/runner';\n");
  put('tests/runner.test.ts', "import { run } from '../src/lib/runner';\n");
  put('docs/notes.md', '# notes\n');
  g('add', '-A'); g('commit', '-qm', 'init');
  for (let i = 0; i < 3; i++) {
    put('src/lib/runner.ts', `export function run(a: string, n = ${i}) { return a; }\n`);
    put('src/job.ts', `import { run } from './lib/runner';\nrun('x', ${i});\n`);
    g('add', '-A'); g('commit', '-qm', `change ${i}`);
  }
  return r;
}
const hook = (payload, env = {}) => spawnSync(process.execPath, [HOOK], {
  input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, GREAT_CTO_DISABLE_EDIT_IMPACT: '', ...env },
});

test('resolvesTo matches a relative specifier to the file, with or without an extension', () => {
  assert.equal(resolvesTo('src/job.ts', './lib/runner', 'src/lib/runner.ts'), true);
  assert.equal(resolvesTo('src/api/handler.ts', '../lib/runner.js', 'src/lib/runner.ts'), true);
  assert.equal(resolvesTo('src/uses-other.ts', './other/runner', 'src/lib/runner.ts'), false, 'same name, different file');
  assert.equal(resolvesTo('src/a.ts', '@/lib/runner', 'src/lib/runner.ts'), false, 'an alias is not resolved exactly');
  assert.equal(resolvesTo('src/a.ts', './lib', 'src/lib/index.ts'), true, 'a directory import reaches its index');
});

test('impactFor names the real importers, not a same-named file elsewhere, plus tests and co-edited files', () => {
  const r = repo();
  const imp = impactFor({ root: r, rel: 'src/lib/runner.ts' });
  assert.deepEqual(imp.importers.map((i) => i.file).sort(), ['src/api/handler.ts', 'src/job.ts']);
  assert.ok(imp.importers.every((i) => i.exact));
  assert.ok(!imp.importers.some((i) => i.file === 'src/uses-other.ts'), 'importing src/other/runner is not importing this file');
  assert.deepEqual(imp.tests.map((t) => [t.file, t.how]), [['tests/runner.test.ts', 'imports it']]);
  assert.deepEqual(imp.coEdited.map((c) => c.file), ['src/job.ts'], 'changed together in 3 of 4 commits');
});

test('the hook adds context before an edit, once per file per session, and never blocks', () => {
  const r = repo();
  const payload = { tool_name: 'Edit', session_id: `s${process.pid}${Date.now()}`, cwd: r, tool_input: { file_path: join(r, 'src/lib/runner.ts') } };
  const first = hook(payload);
  assert.equal(first.status, 0);
  const out = JSON.parse(first.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined, 'context only — it does not decide');
  assert.match(out.hookSpecificOutput.additionalContext, /imported by \(2\): src\/api\/handler\.ts, src\/job\.ts/);
  assert.match(out.hookSpecificOutput.additionalContext, /tests\/runner\.test\.ts \(imports it\)/);
  assert.match(out.hookSpecificOutput.additionalContext, /usually changed together with: src\/job\.ts/);
  const second = hook(payload);
  assert.equal(second.status, 0);
  assert.equal(second.stdout, '', 'the second edit of the same file in a session gets no repeat');
});

test('silent where it has nothing to say: a new file, a document, the opt-out, a broken payload', () => {
  const r = repo();
  const base = { tool_name: 'Write', session_id: `n${Date.now()}`, cwd: r };
  assert.equal(hook({ ...base, tool_input: { file_path: join(r, 'src/brand-new.ts') } }).stdout, '', 'a new file has no dependents');
  assert.equal(hook({ ...base, tool_input: { file_path: join(r, 'docs/notes.md') } }).stdout, '', 'not code');
  assert.equal(hook({ ...base, tool_name: 'Edit', session_id: 'opt', tool_input: { file_path: join(r, 'src/lib/runner.ts') } }, { GREAT_CTO_DISABLE_EDIT_IMPACT: '1' }).stdout, '');
  const bad = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout, '');
});

test('formatImpact says when nothing tests the file, instead of telling the model to run no tests', () => {
  const text = formatImpact('a.ts', { importers: [{ file: 'b.ts', exact: true }], tests: [], coEdited: [] });
  assert.match(text, /No test covers it/);
  assert.equal(formatImpact('a.ts', { importers: [], tests: [], coEdited: [] }), '');
});
