// "Done" was being claimed on code that does not compile. A PostToolUse formatter
// runs per edit, but a typecheck per edit is too slow and too noisy mid-change —
// the file is legitimately broken between the first and the third edit. So the
// edits are accumulated, and the project's own tsc runs ONCE, at Stop, over the
// files this turn touched.
//
// These tests drive both hooks as child processes with the payload shapes Claude
// Code actually sends, against fixture projects whose `tsc` is a fake script —
// so the test never downloads or runs a real compiler, and the timings are ours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync, readdirSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ACCUM = join(ROOT, 'scripts', 'hooks', 'typecheck-accumulate.mjs');
const STOP = join(ROOT, 'scripts', 'hooks', 'stop-typecheck.mjs');

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'stop-tc-'));
  const state = join(base, 'state');
  const proj = join(base, 'proj');
  mkdirSync(state, { recursive: true });
  mkdirSync(join(proj, 'src'), { recursive: true });
  return { base, state, proj, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

function env(sb, extra = {}) {
  const e = { ...process.env, TMPDIR: sb.state, GREAT_CTO_TYPECHECK_AT_STOP: '1', ...extra };
  delete e.GREAT_CTO_DISABLE_STOP_TYPECHECK;
  delete e.CLAUDE_SESSION_ID;
  for (const [k, v] of Object.entries(extra)) if (v === undefined) delete e[k];
  return e;
}

function editPayload(sb, filePath, session = 'sess-1') {
  return {
    session_id: session,
    transcript_path: join(sb.base, 'transcript.jsonl'),
    cwd: sb.proj,
    permission_mode: 'default',
    hook_event_name: 'PostToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' },
    tool_response: { filePath, success: true },
  };
}

function stopPayload(sb, { session = 'sess-1', active = false } = {}) {
  return {
    session_id: session,
    transcript_path: join(sb.base, 'transcript.jsonl'),
    cwd: sb.proj,
    permission_mode: 'default',
    hook_event_name: 'Stop',
    stop_hook_active: active,
  };
}

function run(script, payload, e) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload), env: e, encoding: 'utf8', timeout: 20_000,
  });
  return { ...r, ms: Date.now() - t0 };
}

/** A TS project whose node_modules/.bin/tsc is a shell script we control. */
function tsProject(sb, tscBody) {
  writeFileSync(join(sb.proj, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}\n');
  writeFileSync(join(sb.proj, 'src', 'edited.ts'), 'export const a: number = "x";\n');
  writeFileSync(join(sb.proj, 'src', 'other.ts'), 'export const b: number = "y";\n');
  if (tscBody !== null) {
    const bin = join(sb.proj, 'node_modules', '.bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'tsc'), `#!/bin/sh\n${tscBody}\n`);
    chmodSync(join(bin, 'tsc'), 0o755);
  }
}

const TSC_ERRORS = [
  'echo "src/edited.ts(1,14): error TS2322: Type \'string\' is not assignable to type \'number\'."',
  'echo "src/other.ts(1,14): error TS2322: Type \'string\' is not assignable to type \'number\'."',
  'exit 2',
].join('\n');

function listFile(sb, session = 'sess-1') {
  const dir = join(sb.state, 'great-cto-typecheck');
  return join(dir, `${session}.list`);
}

// ─── accumulate ────────────────────────────────────────────────────────────────

test('accumulate records edited TS/Python files once each, and ignores everything else', () => {
  const sb = sandbox();
  try {
    const e = env(sb);
    const ts = join(sb.proj, 'src', 'edited.ts');
    for (const f of [ts, ts, join(sb.proj, 'src', 'view.tsx'), join(sb.proj, 'mod.py'),
      join(sb.proj, 'README.md'), join(sb.proj, 'src', 'x.js')]) {
      const r = run(ACCUM, editPayload(sb, f), e);
      assert.equal(r.status, 0);
      assert.equal(r.stdout, '', 'PostToolUse accumulation must be silent');
    }
    // A relative path is resolved against the payload cwd.
    run(ACCUM, editPayload(sb, 'src/rel.mts'), e);
    const lines = readFileSync(listFile(sb), 'utf8').split('\n').filter(Boolean);
    assert.deepEqual(lines, [
      ts, join(sb.proj, 'src', 'view.tsx'), join(sb.proj, 'mod.py'), join(sb.proj, 'src', 'rel.mts'),
    ]);
  } finally { sb.cleanup(); }
});

test('accumulate is fail-open on garbage input', () => {
  const sb = sandbox();
  try {
    const r = spawnSync(process.execPath, [ACCUM], { input: 'not json', env: env(sb), encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  } finally { sb.cleanup(); }
});

// ─── opt-in ────────────────────────────────────────────────────────────────────

test('inactive by default: nothing is recorded and Stop does nothing', () => {
  const sb = sandbox();
  try {
    tsProject(sb, TSC_ERRORS);
    const e = env(sb, { GREAT_CTO_TYPECHECK_AT_STOP: undefined });
    run(ACCUM, editPayload(sb, join(sb.proj, 'src', 'edited.ts')), e);
    assert.equal(existsSync(listFile(sb)), false, 'no state is written when the feature is off');
    const r = run(STOP, stopPayload(sb), e);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  } finally { sb.cleanup(); }
});

test('PROJECT.md `typecheck_at_stop: true` turns it on; the disable flag always wins', () => {
  const sb = sandbox();
  try {
    tsProject(sb, TSC_ERRORS);
    mkdirSync(join(sb.proj, '.great_cto'), { recursive: true });
    writeFileSync(join(sb.proj, '.great_cto', 'PROJECT.md'), '# P\n\ntypecheck_at_stop: true\n');
    const on = env(sb, { GREAT_CTO_TYPECHECK_AT_STOP: undefined });
    run(ACCUM, editPayload(sb, join(sb.proj, 'src', 'edited.ts')), on);
    assert.equal(existsSync(listFile(sb)), true);

    const off = { ...on, GREAT_CTO_DISABLE_STOP_TYPECHECK: '1' };
    const r = run(STOP, stopPayload(sb), off);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '', 'opt-out beats opt-in');

    const r2 = run(STOP, stopPayload(sb), on);
    assert.match(JSON.parse(r2.stdout).reason, /edited\.ts/);
  } finally { sb.cleanup(); }
});

// ─── stop ──────────────────────────────────────────────────────────────────────

test('empty session list: Stop exits silently without running anything', () => {
  const sb = sandbox();
  try {
    tsProject(sb, 'echo ran > "$(dirname "$0")/ran"; exit 2');
    const r = run(STOP, stopPayload(sb), env(sb));
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(existsSync(join(sb.proj, 'node_modules', '.bin', 'ran')), false);
  } finally { sb.cleanup(); }
});

test('errors in an edited file block the stop; errors in files not edited are not reported', () => {
  const sb = sandbox();
  try {
    tsProject(sb, TSC_ERRORS);
    const e = env(sb);
    run(ACCUM, editPayload(sb, join(sb.proj, 'src', 'edited.ts')), e);
    const r = run(STOP, stopPayload(sb), e);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /src\/edited\.ts\(1,14\): error TS2322/);
    assert.doesNotMatch(out.reason, /other\.ts/, 'a file this turn did not touch is not this turn\'s problem');
    assert.equal(existsSync(listFile(sb)), true, 'the list survives a block so the fix is re-checked');
  } finally { sb.cleanup(); }
});

test('the project\'s tsc gets --noEmit -p <tsconfig>', () => {
  const sb = sandbox();
  try {
    tsProject(sb, 'echo "$@" > "$(dirname "$0")/args"; exit 0');
    const e = env(sb);
    run(ACCUM, editPayload(sb, join(sb.proj, 'src', 'edited.ts')), e);
    const r = run(STOP, stopPayload(sb), e);
    assert.equal(r.stdout, '');
    const args = readFileSync(join(sb.proj, 'node_modules', '.bin', 'args'), 'utf8');
    assert.match(args, /--noEmit/);
    assert.match(args, new RegExp(`-p ${join(sb.proj, 'tsconfig.json').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.equal(existsSync(listFile(sb)), false, 'a clean check clears the list');
  } finally { sb.cleanup(); }
});

test('only unrelated errors: the turn ends and the list is cleared', () => {
  const sb = sandbox();
  try {
    tsProject(sb, 'echo "src/other.ts(1,14): error TS2322: nope"; exit 2');
    const e = env(sb);
    run(ACCUM, editPayload(sb, join(sb.proj, 'src', 'edited.ts')), e);
    const r = run(STOP, stopPayload(sb), e);
    assert.equal(r.stdout, '');
    assert.equal(existsSync(listFile(sb)), false);
  } finally { sb.cleanup(); }
});

test('no tsc in the project: silent, and nothing is downloaded', () => {
  const sb = sandbox();
  try {
    tsProject(sb, null);
    const e = env(sb, { PATH: '/nonexistent' });
    run(ACCUM, editPayload(sb, join(sb.proj, 'src', 'edited.ts')), e);
    const r = run(STOP, stopPayload(sb), e);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  } finally { sb.cleanup(); }
});

test('deadline: a hung tsc is killed with its whole process group and the stop is not blocked', () => {
  const sb = sandbox();
  try {
    // The fake forks a grandchild — a plain child.kill() would orphan it, which
    // is exactly how a `timeout`-wrapped run wedges later gates.
    const pids = join(sb.base, 'pids');
    tsProject(sb, `sleep 30 &\necho $$ $! > "${pids}"\nwait`);
    const e = env(sb, { GREAT_CTO_TYPECHECK_BUDGET_S: '1' });
    run(ACCUM, editPayload(sb, join(sb.proj, 'src', 'edited.ts')), e);
    const r = run(STOP, stopPayload(sb), e);
    assert.equal(r.status, 0);
    assert.ok(r.ms < 5000, `hook must return near the 1s budget, took ${r.ms}ms`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.decision, undefined, 'a timeout is not a compile error — never block on it');
    assert.match(out.systemMessage, /typecheck timed out — not verified/);
    // Killed processes are reaped by init after the hook exits; allow a moment
    // for that, far short of the 30s a surviving `sleep` would live.
    const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    for (const pid of readFileSync(pids, 'utf8').trim().split(/\s+/).map(Number)) {
      const until = Date.now() + 1000;
      while (isAlive(pid) && Date.now() < until) spawnSync('sleep', ['0.05']);
      assert.equal(isAlive(pid), false, `pid ${pid} survived the deadline`);
    }
  } finally { sb.cleanup(); }
});

test('the same error set is blocked once, then only noticed', () => {
  const sb = sandbox();
  try {
    tsProject(sb, TSC_ERRORS);
    const e = env(sb);
    run(ACCUM, editPayload(sb, join(sb.proj, 'src', 'edited.ts')), e);
    const first = JSON.parse(run(STOP, stopPayload(sb), e).stdout);
    assert.equal(first.decision, 'block');

    // A later turn (not a continuation) with the identical errors: no second block.
    run(ACCUM, editPayload(sb, join(sb.proj, 'src', 'edited.ts')), e);
    const second = JSON.parse(run(STOP, stopPayload(sb), e).stdout);
    assert.equal(second.decision, undefined);
    assert.match(second.systemMessage, /still failing/);
    assert.equal(existsSync(listFile(sb)), false, 'a notice ends the chase: the list is cleared');
  } finally { sb.cleanup(); }
});

test('a Stop that is already a continuation (stop_hook_active) is never blocked', () => {
  const sb = sandbox();
  try {
    tsProject(sb, TSC_ERRORS);
    const e = env(sb);
    run(ACCUM, editPayload(sb, join(sb.proj, 'src', 'edited.ts')), e);
    const r = run(STOP, stopPayload(sb, { active: true }), e);
    const out = JSON.parse(r.stdout);
    assert.equal(out.decision, undefined);
    assert.match(out.systemMessage, /edited\.ts/);
  } finally { sb.cleanup(); }
});

test('sessions do not share lists', () => {
  const sb = sandbox();
  try {
    tsProject(sb, TSC_ERRORS);
    const e = env(sb);
    run(ACCUM, editPayload(sb, join(sb.proj, 'src', 'edited.ts'), 'sess-A'), e);
    const r = run(STOP, stopPayload(sb, { session: 'sess-B' }), e);
    assert.equal(r.stdout, '');
    assert.ok(readdirSync(join(sb.state, 'great-cto-typecheck')).includes('sess-A.list'));
  } finally { sb.cleanup(); }
});

test('Python: mypy on PATH is used for edited .py files under the nearest pyproject', () => {
  const sb = sandbox();
  try {
    writeFileSync(join(sb.proj, 'pyproject.toml'), '[project]\nname="x"\n');
    const mod = join(sb.proj, 'pkg', 'mod.py');
    mkdirSync(dirname(mod), { recursive: true });
    writeFileSync(mod, 'x: int = "s"\n');
    const bin = join(sb.base, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'mypy'),
      '#!/bin/sh\necho "pkg/mod.py:1: error: Incompatible types in assignment"\necho "pkg/other.py:1: error: x"\nexit 1\n');
    chmodSync(join(bin, 'mypy'), 0o755);
    const e = env(sb, { PATH: bin });
    run(ACCUM, editPayload(sb, mod), e);
    const out = JSON.parse(run(STOP, stopPayload(sb), e).stdout);
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /pkg\/mod\.py:1: error/);
    assert.doesNotMatch(out.reason, /other\.py/);
  } finally { sb.cleanup(); }
});

test('Python with no checker on PATH: silent', () => {
  const sb = sandbox();
  try {
    writeFileSync(join(sb.proj, 'pyproject.toml'), '[project]\nname="x"\n');
    writeFileSync(join(sb.proj, 'mod.py'), 'x: int = "s"\n');
    const e = env(sb, { PATH: '/nonexistent' });
    run(ACCUM, editPayload(sb, join(sb.proj, 'mod.py')), e);
    const r = run(STOP, stopPayload(sb), e);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  } finally { sb.cleanup(); }
});

test('output is capped at 15 error lines', () => {
  const sb = sandbox();
  try {
    const many = Array.from({ length: 40 }, (_, i) => `echo "src/edited.ts(${i + 1},1): error TS1: e${i}"`).join('\n');
    tsProject(sb, `${many}\nexit 2`);
    const e = env(sb);
    run(ACCUM, editPayload(sb, join(sb.proj, 'src', 'edited.ts')), e);
    const out = JSON.parse(run(STOP, stopPayload(sb), e).stdout);
    const errLines = out.reason.split('\n').filter((l) => /error TS1/.test(l));
    assert.equal(errLines.length, 15);
    assert.match(out.reason, /25 more/);
  } finally { sb.cleanup(); }
});
