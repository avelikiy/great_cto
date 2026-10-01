// gate-bypass-guard: the pre-push gate keeps private project names out of a
// public repo and red CI out of a release — and one flag switched it off. The
// hook itself advertised `--no-verify` as the way past it; nothing refused it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBypass } from '../../scripts/hooks/gate-bypass-guard.mjs';
import { create, write } from '../../scripts/lib/exceptions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(ROOT, 'scripts', 'hooks', 'gate-bypass-guard.mjs');
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

test('skipping the git hooks is refused, however it is spelled', () => {
  for (const c of [
    'git push --no-verify origin main',
    'git commit --no-verify -m "wip"',
    'git commit -n -m wip',
    'git commit -anm wip',
    'git merge --no-verify feature',
    'cd repo && git push --no-verify',
    'git -c core.hooksPath=/dev/null push',
    'git -c core.hooksPath= commit -m x',
    'git config core.hooksPath /tmp/none',
    'git config --local core.hooksPath ""',
    'git config --unset core.hooksPath',
    'HUSKY=0 git commit -m x',
    'SKIP=lint,test git commit -m x',
    "bash -c 'git push --no-verify'",
    'eval "git push --no-verify"',
  ]) assert.ok(findBypass(c), c);
});

test('ordinary git and mere mentions pass', () => {
  for (const c of [
    'git push origin main',
    'git push -n origin main',                 // -n on push is --dry-run
    'git commit -m "explain why --no-verify is banned"',
    'git config --get core.hooksPath',
    'git config core.hooksPath',               // a read, no value
    'git log --oneline -3',
    "echo 'git push --no-verify'",
    'npm test -- --no-verify',                 // not git
    'git commit -am "fix"',
  ]) assert.equal(findBypass(c), null, c);
});

function run(command, env = {}) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8', env: { ...process.env, ...env },
  });
}

test('the hook denies with a reason and the sanctioned route', () => {
  const root = mkdtempSync(join(tmpdir(), 'gbg-')); made.push(root);
  const r = run('git push --no-verify', { GREAT_CTO_EXCEPTIONS_ROOT: root });
  assert.equal(r.status, 2);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /\/exception/);
  assert.equal(run('git push origin main', { GREAT_CTO_EXCEPTIONS_ROOT: root }).status, 0);
});

test('a valid signed exception for the hooks gate lets it through; a prefix in the command does not', () => {
  const root = mkdtempSync(join(tmpdir(), 'gbg-')); made.push(root);
  assert.equal(run('GREAT_CTO_DISABLE_GATE_BYPASS_GUARD=1 git push --no-verify', { GREAT_CTO_EXCEPTIONS_ROOT: root }).status, 2,
    'the agent cannot switch the guard off from inside its own command');
  write(create({ gate: 'git-hooks', scope: 'release', reason: 'pre-push broken by a known upstream bug', createdBy: 'operator' }), { root });
  assert.equal(run('git push --no-verify', { GREAT_CTO_EXCEPTIONS_ROOT: root }).status, 0);
});
