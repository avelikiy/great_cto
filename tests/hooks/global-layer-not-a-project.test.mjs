// ~/.great_cto is the global layer every session reads. A session in a project
// without its own PROJECT.md walked up to $HOME and used the global layer as
// its project: on 07.10 the completion check wrote one project's cut-off
// code-reviewer there, and the stall guard told another session to resume it.
// And the completion check asked agents that are not great_cto's — Explore,
// general-purpose, another plugin's code-reviewer — for verdicts they never write.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isGlobalLayer, isProjectState, isOurAgent } from '../../scripts/lib/great-cto-scope.mjs';
import { appendEvent } from '../../scripts/lib/agent-events.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMPLETION = path.resolve(HERE, '../../scripts/hooks/subagent-stop-completion.mjs');
const STALL = path.resolve(HERE, '../../scripts/hooks/pipeline-stall-guard.mjs');
const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'glob-')); made.push(d); return d; };

/** A fake home whose global layer looks exactly like a project's: PROJECT.md, verdicts, a last stop. */
function home() {
  const h = tmp();
  const g = path.join(h, '.great_cto');
  fs.mkdirSync(path.join(g, 'verdicts'), { recursive: true });
  fs.writeFileSync(path.join(g, 'PROJECT.md'), 'slug: global\n');
  fs.writeFileSync(path.join(g, 'verdicts', 'senior-dev.log'), `${JSON.stringify({ v: 1, ts: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), agent: 'senior-dev', verdict: 'TASK_DONE', cost_usd: 0 })}\n`);
  fs.writeFileSync(path.join(g, '.last-stop'), JSON.stringify({ shape: 'cut-off', turns: 42, agent: 'code-reviewer', ts: new Date().toISOString() }));
  return { h, g };
}

function transcript(dir) {
  const tp = path.join(dir, 'agent-z.jsonl');
  fs.writeFileSync(tp, `${JSON.stringify({ type: 'user', timestamp: new Date(Date.now() - 60_000).toISOString() })}\n${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { stop_reason: 'end_turn', content: [] } })}\n`);
  return tp;
}

test('the global layer is never a project, whatever it contains', () => {
  const { h, g } = home();
  assert.equal(isGlobalLayer(g, h), true);
  assert.equal(isProjectState(g, h), false, 'PROJECT.md and verdicts/ do not make it one');
  const p = tmp();
  fs.mkdirSync(path.join(p, '.great_cto', 'verdicts'), { recursive: true });
  assert.equal(isProjectState(path.join(p, '.great_cto'), h), true, 'a project holding verdicts is one, even before PROJECT.md');
  assert.equal(isProjectState(path.join(tmp(), '.great_cto'), h), false, 'no state directory, no project');
});

test('our agents: by roster, and never another plugin\'s namesake', () => {
  const names = new Set(['code-reviewer', 'senior-dev']);
  assert.equal(isOurAgent('code-reviewer', names), true);
  assert.equal(isOurAgent('great-cto:code-reviewer', names), true);
  assert.equal(isOurAgent('feature-dev:code-reviewer', names), false);
  assert.equal(isOurAgent('general-purpose', names), false);
  assert.equal(isOurAgent('Explore', names), false);
  assert.equal(isOurAgent('', names), false);
});

test('the completion check leaves the global layer untouched', () => {
  const { h, g } = home();
  const before = fs.readdirSync(g).sort();
  const r = spawnSync(process.execPath, [COMPLETION], {
    cwd: h, encoding: 'utf8',
    input: JSON.stringify({ agent_type: 'great-cto:code-reviewer', agent_transcript_path: transcript(tmp()), session_id: 's' }),
    env: { ...process.env, HOME: h, GREAT_CTO_DIR: g, GREAT_CTO_NO_MEASURED_COST: '1' },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readdirSync(g).sort(), before, 'no marker, no .last-stop, no events written into the global layer');
});

test('the stall guard does not hold a turn for the global layer\'s last stop', () => {
  const { h, g } = home();
  const r = spawnSync(process.execPath, [STALL], { cwd: h, encoding: 'utf8', input: '{}', env: { ...process.env, HOME: h, GREAT_CTO_DIR: g } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '', `no block: ${r.stdout}`);
});

test('an agent that is not great_cto\'s is not asked for a verdict', () => {
  const p = tmp();
  const gc = path.join(p, '.great_cto');
  fs.mkdirSync(path.join(gc, 'verdicts'), { recursive: true });
  fs.writeFileSync(path.join(gc, 'PROJECT.md'), 'slug: p\n');
  for (const agent of ['general-purpose', 'Explore', 'feature-dev:code-reviewer']) {
    const r = spawnSync(process.execPath, [COMPLETION], {
      cwd: p, encoding: 'utf8',
      input: JSON.stringify({ agent_type: agent, agent_transcript_path: transcript(p), session_id: 's' }),
      env: { ...process.env, GREAT_CTO_DIR: gc, GREAT_CTO_NO_MEASURED_COST: '1', GREAT_CTO_ENFORCE_COMPLETION: '' },
    });
    assert.equal(r.status, 0, `${agent} was asked: ${r.stderr}`);
  }
  assert.deepEqual(fs.readdirSync(gc).filter((f) => f.startsWith('.completion-asked-')), []);
});

test('the event log refuses the global layer', () => {
  const { h, g } = home();
  const before = fs.existsSync(path.join(g, 'events.jsonl'));
  const prev = process.env.HOME;
  process.env.HOME = h;
  try {
    const r = appendEvent(g, { kind: 'stop', session: 's' });
    assert.equal(r.ok, false);
  } finally { process.env.HOME = prev; }
  assert.equal(fs.existsSync(path.join(g, 'events.jsonl')), before);
});
