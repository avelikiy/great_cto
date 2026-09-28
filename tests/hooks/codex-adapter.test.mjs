// codex-adapter — great_cto's guards on Codex tool calls.
//
// Codex sends shell calls as `Bash` (Claude's shape) and edits as `apply_patch`
// (one patch text). These tests hold the translation and then run the REAL guards
// through the adapter, the way .codex-plugin/hooks.json does — a parsed patch that
// no guard ever sees would pass every unit test and protect nothing.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePatch, payloadsForPatch } from '../../scripts/hooks/codex-adapter.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ADAPTER = join(REPO, 'scripts', 'hooks', 'codex-adapter.mjs');
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

const patch = (body) => `*** Begin Patch\n${body}\n*** End Patch`;
const run = (payload, guards, cwd) => spawnSync(process.execPath, [ADAPTER, ...guards], {
  input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8', cwd,
  env: { ...process.env, GREAT_CTO_DISABLE_FROZEN_GATES: '' },
});

test('parsePatch reads add, update (with context and two hunks), delete and move', () => {
  const files = parsePatch(patch([
    '*** Add File: src/new.ts', '+export const a = 1;', '+export const b = 2;',
    '*** Update File: src/old.ts', '@@', ' keep', '-before', '+after', '@@ fn()', '-x', '+y',
    '*** Delete File: src/gone.ts',
    '*** Update File: a.md', '*** Move to: b.md', '@@', '-t', '+u',
  ].join('\n')));
  assert.deepEqual(files.map((f) => [f.op, f.path]), [['add', 'src/new.ts'], ['update', 'src/old.ts'], ['delete', 'src/gone.ts'], ['update', 'a.md']]);
  assert.equal(files[0].content, 'export const a = 1;\nexport const b = 2;');
  assert.deepEqual(files[1].hunks, [{ old: 'keep\nbefore', new: 'keep\nafter' }, { old: 'x', new: 'y' }]);
  assert.equal(files[3].moveTo, 'b.md');
});

test('payloadsForPatch gives the guards the Claude shapes they read, paths resolved against the call cwd', () => {
  const p = payloadsForPatch({ cwd: '/w', tool_name: 'apply_patch', tool_input: { command: patch('*** Add File: x.txt\n+hi\n*** Update File: y.txt\n@@\n-a\n+b\n*** Delete File: z.txt') } });
  assert.deepEqual(p.map((x) => [x.tool_name, x.tool_input.file_path]), [['Write', '/w/x.txt'], ['MultiEdit', '/w/y.txt'], ['Edit', '/w/z.txt']]);
  assert.equal(p[0].tool_input.content, 'hi');
  assert.deepEqual(p[1].tool_input.edits, [{ old_string: 'a', new_string: 'b' }]);
  assert.equal(p[0].cwd, '/w', 'the rest of the payload is kept');
});

test('a patch that adds a credential is denied by secret-scan, with the deny passed through', () => {
  const key = 'AKIA' + 'ABCDEFGHIJKLMNOP';
  const r = run({ cwd: tmpdir(), tool_name: 'apply_patch', tool_input: { command: patch(`*** Add File: config.env\n+AWS_ACCESS_KEY_ID=${key}`) } }, ['secret-scan']);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stdout, /"permissionDecision"\s*:\s*"deny"/);
});

test('a patch that edits an existing frozen gate is denied; creating a new gate is not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-adapter-'));
  made.push(dir);
  mkdirSync(join(dir, 'docs', 'gates'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'gates', 'slice-1.md'), '- [ ] it works\n');
  const edit = run({ cwd: dir, tool_name: 'apply_patch', tool_input: { command: patch('*** Update File: docs/gates/slice-1.md\n@@\n-- [ ] it works\n+- [x] it works') } }, ['frozen-gates-guard'], dir);
  assert.equal(edit.status, 2, 'an existing gate is frozen');
  const create = run({ cwd: dir, tool_name: 'apply_patch', tool_input: { command: patch('*** Add File: docs/gates/slice-2.md\n+- [ ] new') } }, ['frozen-gates-guard'], dir);
  assert.equal(create.status, 0, 'a new gate may be written');
});

test('shell calls reach the Bash guards unchanged: --no-verify and rm -rf .git are denied', () => {
  const noVerify = run({ cwd: tmpdir(), tool_name: 'Bash', tool_input: { command: 'git commit --no-verify -m wip' } }, ['gate-bypass-guard']);
  assert.equal(noVerify.status, 2);
  const wipe = run({ cwd: tmpdir(), tool_name: 'Bash', tool_input: { command: 'rm -rf .git' } }, ['destructive-guard']);
  assert.equal(wipe.status, 2);
});

test('ordinary calls pass, and so does anything the adapter cannot read', () => {
  assert.equal(run({ cwd: tmpdir(), tool_name: 'Bash', tool_input: { command: 'ls -la' } }, ['gate-bypass-guard', 'destructive-guard']).status, 0);
  assert.equal(run({ cwd: tmpdir(), tool_name: 'apply_patch', tool_input: { command: patch('*** Add File: README.md\n+hello') } }, ['secret-scan', 'frozen-gates-guard', 'gate-weakening-guard']).status, 0);
  assert.equal(run('not json', ['secret-scan']).status, 0, 'a payload it cannot parse is let through, not a stopped session');
  assert.equal(run({ cwd: tmpdir(), tool_name: 'apply_patch', tool_input: { command: 'garbage' } }, ['secret-scan']).status, 0);
});

test('guard names are restricted to scripts/hooks file names', () => {
  const r = run({ cwd: tmpdir(), tool_name: 'Bash', tool_input: { command: 'ls' } }, ['../../../etc/passwd', 'destructive-guard']);
  assert.equal(r.status, 0, 'a path-shaped name is dropped, not executed');
});
