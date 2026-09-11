// The SubagentStop hook, run as the host runs it: a JSON payload on stdin.
//
// Until 2026-09-11 it read `transcript_path`, which is the session. Every stop
// measured ~10k turns and was set aside as unattributed, so `cost-history.log`
// held no per-agent figure at all while the board looked like a board that had
// simply not measured yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOOK = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/hooks/subagent-stop-completion.mjs');

const turn = (model) => JSON.stringify({ type: 'assistant',
  message: { model, usage: { input_tokens: 1000, output_tokens: 200 } } });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'stop-cost-'));
  const gc = join(root, '.great_cto');
  const agents = join(root, 'agents');
  mkdirSync(gc); mkdirSync(agents);
  writeFileSync(join(agents, 'senior-dev.md'), '---\nname: senior-dev\nmodel: sonnet\nadvisor-model: claude-opus-5\n---\n');
  const session = join(root, 'session.jsonl');
  writeFileSync(session, Array.from({ length: 500 }, () => turn('claude-opus-5')).join('\n') + '\n');
  return { root, gc, agents, session };
}

function runHook({ root, gc, agents }, payload) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: root,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, GREAT_CTO_DIR: gc, GREAT_CTO_AGENTS_DIR: agents,
      GREAT_CTO_NO_MEASURED_COST: '', GREAT_CTO_DISABLE_COMPLETION_CHECK: '' },
  });
}

const history = (gc) => (existsSync(join(gc, 'cost-history.log')) ? readFileSync(join(gc, 'cost-history.log'), 'utf8') : '');

test('the agent transcript is measured and attributed to the agent, with the model check', () => {
  const f = fixture();
  const agentPath = join(f.root, 'agent.jsonl');
  writeFileSync(agentPath, [turn('claude-sonnet-5'), turn('claude-sonnet-5'), turn('claude-sonnet-5')].join('\n') + '\n');
  const r = runHook(f, { hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'great-cto:senior-dev',
    agent_transcript_path: agentPath, transcript_path: f.session });
  assert.equal(r.status, 0, r.stderr);
  const log = history(f.gc);
  assert.match(log, /^\S+ senior-dev \d+\.?\d* turns=3 .* model=match asked=sonnet served=claude-sonnet-5$/m);
  assert.doesNotMatch(log, /unattributed/, 'the session was measured instead of the agent');
});

test('a run served by another family is recorded as a substitution and said out loud', () => {
  const f = fixture();
  const agentPath = join(f.root, 'agent.jsonl');
  writeFileSync(agentPath, [turn('claude-haiku-4-5-20251001'), turn('claude-haiku-4-5-20251001')].join('\n') + '\n');
  const r = runHook(f, { hook_event_name: 'SubagentStop', agent_type: 'senior-dev',
    agent_transcript_path: agentPath, transcript_path: f.session });
  assert.equal(r.status, 0, 'a substitution is reported, never a blocked stop');
  assert.match(history(f.gc), / senior-dev .* model=substituted asked=sonnet served=claude-haiku-4-5-20251001$/m);
  assert.match(r.stderr, /\[great_cto:model\] senior-dev: asked sonnet, served claude-haiku-4-5-20251001/);
});

test('a subagent that is not a great_cto agent is measured, and its model is unverifiable', () => {
  const f = fixture();
  const agentPath = join(f.root, 'agent.jsonl');
  writeFileSync(agentPath, turn('claude-opus-5') + '\n');
  runHook(f, { hook_event_name: 'SubagentStop', agent_type: 'general-purpose',
    agent_transcript_path: agentPath, transcript_path: f.session });
  assert.match(history(f.gc), / general-purpose .* turns=1 .* model=unverifiable served=claude-opus-5$/m);
});

test('an older host that sends only the session transcript still gets the unattributed guard', () => {
  const f = fixture();
  runHook(f, { hook_event_name: 'SubagentStop', transcript_path: f.session });
  assert.match(history(f.gc), /\(unattributed\) \d+\.?\d* turns=500/);
});
