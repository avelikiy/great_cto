// ADR-023 step 2: the Stop and SubagentStop hooks snapshot the turn that just ended.
//
// Each case runs the real hook script with a payload shaped like the one Claude Code
// sends. The snapshot rules themselves are pinned in tests/lib/turn-snapshot.test.mjs;
// these pin that a turn is recorded, that retention runs in the same call, and that
// the hook can never fail the turn it runs after — whatever it is handed.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listTurns, TURN_REF_PREFIX } from '../../scripts/lib/turn-snapshot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HOOK = join(ROOT, 'scripts/hooks/turn-snapshot.mjs');
const SESSION = '0b6f3f1e-6c1e-4d0a-9d6b-2f1f0e9a7c11';
const TMP_DIRS = [];
after(() => { for (const d of TMP_DIRS) rmSync(d, { recursive: true, force: true }); });

function tmp(prefix) { const d = mkdtempSync(join(tmpdir(), prefix)); TMP_DIRS.push(d); return d; }
function gitProject() {
  const d = tmp('gcto-turnhook-');
  const git = (...a) => execFileSync('git', a, { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(d, 'app.js'), 'export const x = 1;\n');
  git('add', '.'); git('commit', '-q', '-m', 'init');
  return { d, git };
}
function runHook(cwd, input, env = {}) {
  return spawnSync(process.execPath, [HOOK], {
    cwd, input, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd, ...env, GREAT_CTO_DISABLE_TURNS: env.GREAT_CTO_DISABLE_TURNS ?? '' },
  });
}

test('a Stop records the turn that just ended, under the session id', () => {
  const { d } = gitProject();
  writeFileSync(join(d, 'app.js'), 'export const x = 2;\n');
  const r = runHook(d, JSON.stringify({ hook_event_name: 'Stop', session_id: SESSION, cwd: d }));
  assert.equal(r.status, 0, r.stderr);
  const turns = listTurns(d, { session: SESSION });
  assert.equal(turns.length, 1);
  assert.equal(turns[0].turn, 0);
});

test('a SubagentStop records a turn too', () => {
  const { d } = gitProject();
  runHook(d, JSON.stringify({ hook_event_name: 'SubagentStop', session_id: SESSION, agent_type: 'senior-dev', cwd: d }));
  assert.equal(listTurns(d, { session: SESSION }).length, 1);
});

test('retention runs in the same call: a session keeps its newest 50 turns', () => {
  const { d, git } = gitProject();
  const head = git('rev-parse', 'HEAD').trim();
  for (let i = 0; i < 51; i++) git('update-ref', `${TURN_REF_PREFIX}${SESSION}/${i}`, head);
  const r = runHook(d, JSON.stringify({ hook_event_name: 'Stop', session_id: SESSION, cwd: d }));
  assert.equal(r.status, 0, r.stderr);
  const turns = listTurns(d, { session: SESSION });
  assert.equal(turns.length, 50, `52 turns existed after this one; ${turns.length} kept`);
  assert.equal(turns.at(-1).turn, 51, 'the turn just recorded is among those kept');
  assert.equal(turns[0].turn, 2, 'the oldest were the ones removed');
});

test('it never fails the turn: outside git, garbage input, no session, or switched off', () => {
  const nogit = tmp('gcto-turnhook-nogit-');
  for (const [label, cwd, input, env] of [
    ['not a git repository', nogit, JSON.stringify({ hook_event_name: 'Stop', session_id: SESSION, cwd: nogit }), {}],
    ['garbage on stdin', nogit, 'not json {', {}],
    ['empty stdin', nogit, '', {}],
  ]) {
    const r = runHook(cwd, input, env);
    assert.equal(r.status, 0, `${label}: exit ${r.status} ${r.stderr}`);
    assert.equal(r.stdout, '', `${label}: a Stop hook must not print into the turn`);
  }
  const { d } = gitProject();
  const noSession = runHook(d, JSON.stringify({ hook_event_name: 'Stop', cwd: d }));
  assert.equal(noSession.status, 0);
  assert.equal(execFileSync('git', ['for-each-ref', TURN_REF_PREFIX], { cwd: d, encoding: 'utf8' }), '', 'no session id, no snapshot');
  const off = runHook(d, JSON.stringify({ hook_event_name: 'Stop', session_id: SESSION, cwd: d }), { GREAT_CTO_DISABLE_TURNS: '1' });
  assert.equal(off.status, 0);
  assert.deepEqual(listTurns(d, { session: SESSION }), [], 'GREAT_CTO_DISABLE_TURNS=1 records nothing');
});
