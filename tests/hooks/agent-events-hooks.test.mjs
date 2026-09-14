// ADR-021 phase 1: the hooks the plugin already runs record agent events.
//
// Each case runs the real hook script in a throwaway project with a payload shaped
// like the one Claude Code sends, then reads .great_cto/events.jsonl. The emitter's
// own rules (allowed fields, rotation, three read states) are pinned in
// tests/lib/agent-events.test.mjs; these pin that the events actually get written,
// before any early return a hook takes, and without changing what the hook did.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendEvent } from '../../scripts/lib/agent-events.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TMP_DIRS = [];
after(() => { for (const d of TMP_DIRS) rmSync(d, { recursive: true, force: true }); });

function project() {
  const d = mkdtempSync(join(tmpdir(), 'gcto-evhooks-'));
  TMP_DIRS.push(d);
  mkdirSync(join(d, '.great_cto'), { recursive: true });
  return d;
}
function runHook(d, script, payload, env = {}) {
  return spawnSync(process.execPath, [join(ROOT, script)], {
    cwd: d, input: JSON.stringify(payload), encoding: 'utf8', timeout: 20000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: d, GREAT_CTO_DIR: join(d, '.great_cto'), ...env },
  });
}
const events = (d) => {
  const f = join(d, '.great_cto', 'events.jsonl');
  return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};

test('PostToolUse: a successful tool call is a tool event with its path and none of its content', () => {
  const d = project();
  runHook(d, 'scripts/hooks/tool-failure.mjs', {
    hook_event_name: 'PostToolUse', session_id: 'sess-1', tool_name: 'Edit',
    tool_input: { file_path: 'src/cart.mjs', old_string: 'const KEY = "sk-live-secret"', new_string: 'x' },
    tool_response: { success: true },
  });
  const [e] = events(d);
  assert.ok(e, 'no event recorded');
  assert.equal(e.kind, 'tool');
  assert.equal(e.tool, 'Edit');
  assert.deepEqual(e.paths, ['src/cart.mjs']);
  assert.equal(e.ok, true);
  assert.ok(!JSON.stringify(events(d)).includes('sk-live-secret'));
  assert.ok(!existsSync(join(d, '.great_cto', 'tool-failures.log')), 'success still logs no failure');
});

test('PostToolUse: a failed call is ok:false, and the failure log is still written', () => {
  const d = project();
  runHook(d, 'scripts/hooks/tool-failure.mjs', {
    hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, is_error: true, error: 'Exit code 1',
  });
  const [e] = events(d);
  assert.equal(e.kind, 'tool');
  assert.equal(e.ok, false);
  assert.ok(existsSync(join(d, '.great_cto', 'tool-failures.log')), 'what the hook did before is unchanged');
  assert.ok(!JSON.stringify(e).includes('npm test'), 'a command is content, not a fact');
});

test('SubagentStart: agent-start names the agent', () => {
  const d = project();
  runHook(d, 'scripts/hooks/orchestrator-check.mjs', { hook_event_name: 'SubagentStart', agent_type: 'great-cto:qa-engineer', session_id: 's-2' });
  const e = events(d).find((x) => x.kind === 'agent-start');
  assert.ok(e, 'no agent-start recorded');
  assert.equal(e.agent, 'great-cto:qa-engineer');
});

test('SubagentStop: agent-stop is recorded even when the completion check is switched off', () => {
  const d = project();
  runHook(d, 'scripts/hooks/subagent-stop-completion.mjs',
    { hook_event_name: 'SubagentStop', agent_type: 'senior-dev', session_id: 's-3' },
    { GREAT_CTO_DISABLE_COMPLETION_CHECK: '1' });
  const e = events(d).find((x) => x.kind === 'agent-stop');
  assert.ok(e, 'no agent-stop recorded');
  assert.equal(e.agent, 'senior-dev');
});

test('Stop: a stop event is recorded before the guard returns for a project with no pipeline', () => {
  const d = project();
  runHook(d, 'scripts/hooks/pipeline-stall-guard.mjs', { hook_event_name: 'Stop', session_id: 's-4' });
  assert.ok(events(d).some((x) => x.kind === 'stop'), 'no stop recorded');
});

test('the dispatcher records its outcome as a pipeline event — a stage with no rule is visible', () => {
  const d = project();
  mkdirSync(join(d, '.great_cto', 'verdicts'), { recursive: true });
  runHook(d, 'scripts/hooks/pipeline-dispatcher.mjs', {
    hook_event_name: 'PostToolUse', tool_name: 'Agent',
    tool_input: { subagent_type: 'great-cto:not-a-stage' },
    tool_response: { status: 'completed', content: [{ type: 'text', text: 'done' }], usage: { output_tokens: 1 } },
  });
  const e = events(d).find((x) => x.kind === 'pipeline');
  assert.ok(e, 'no pipeline event recorded');
  assert.equal(e.outcome, 'no-rule');
  assert.equal(e.agent, 'not-a-stage');
});

test('PermissionDenied: the inline hook records a denied event through the CLI', () => {
  const plugin = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
  const cmds = plugin.hooks.PermissionDenied.flatMap((g) => g.hooks.map((h) => h.command)).join('\n');
  assert.match(cmds, /agent-events\.mjs"? --emit denied/);
});

test('GREAT_CTO_DISABLE_EVENTS=1 records nothing from a hook', () => {
  const d = project();
  runHook(d, 'scripts/hooks/tool-failure.mjs',
    { hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: 'a' }, tool_response: {} },
    { GREAT_CTO_DISABLE_EVENTS: '1' });
  assert.deepEqual(events(d), []);
});

test('recording one event costs under 20 ms at p95 — the budget ADR-021 set', () => {
  const d = project();
  const dir = join(d, '.great_cto');
  const times = [];
  for (let i = 0; i < 200; i++) {
    const t = process.hrtime.bigint();
    appendEvent(dir, { kind: 'tool', tool: 'Read', paths: [`src/f${i}.mjs`], ok: true }, { env: {} });
    times.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  assert.ok(p95 < 20, `p95 ${p95.toFixed(2)} ms`);
});
