// The agent panel under the prompt showed `name · description · token count`
// for every running subagent, and two things about great_cto were invisible in
// it:
//
//   - one agent answered to two names. In a single session's transcript
//     `senior-dev` was invoked 7 times and `great-cto:senior-dev` 6 more, and
//     `qa-engineer` the same way. A reader watching the panel saw two agents.
//   - 40 invocations in that transcript were `general-purpose` — README
//     translators, not pipeline stages. Nothing distinguished a great_cto stage
//     from any other subagent.
//
// `subagentStatusLine` is the host's own mechanism for replacing those rows,
// and a plugin may ship it. This pins what our row claims, because the rule it
// runs under is the product's: a thing that did not happen must never look like
// a thing that did. A missing model is omitted, not printed as `undefined`; a
// token count nobody measured is omitted, while a measured zero is shown; and an
// agent that is not a great_cto stage keeps the host's default row rather than
// being dressed up as one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  greatCtoAgents, normalizeType, rowContent, render, displayWidth,
} from '../../scripts/lib/subagent-row.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = join(ROOT, 'scripts/lib/subagent-row.mjs');
const AGENTS = greatCtoAgents(join(ROOT, 'agents'));
const NOW = Date.parse('2026-09-10T12:00:00Z');

const task = (over = {}) => ({
  id: 't1', name: 'task', type: 'senior-dev', status: 'running',
  description: 'implement pipeline-position lib', startTime: NOW - 252_000,
  model: 'claude-opus-5', tokenCount: 38_000, contextWindowSize: 1_000_000,
  ...over,
});
const row = (over, opts = {}) => rowContent(task(over), { agents: AGENTS, columns: 200, now: NOW, ...opts });

// ── who counts as a great_cto agent ─────────────────────────────────────────

test('the roster is read from agents/, and shared fragments are not agents', () => {
  assert.ok(AGENTS.has('senior-dev'), 'senior-dev is a shipped agent');
  assert.ok(AGENTS.has('qa-engineer'), 'qa-engineer is a shipped agent');
  assert.ok(![...AGENTS].some((a) => a.startsWith('_')), '_shared prompt fragments leaked into the roster');
});

test('one agent is one name, whichever way the host spelled it', () => {
  assert.equal(normalizeType('senior-dev'), 'senior-dev');
  assert.equal(normalizeType('great-cto:senior-dev'), 'senior-dev');
  assert.equal(normalizeType('great_cto:senior-dev'), 'senior-dev');
  const a = row({ type: 'senior-dev' });
  const b = row({ type: 'great-cto:senior-dev' });
  assert.equal(a, b, 'two spellings of the same agent rendered as two different rows');
});

test('an agent that is not a great_cto stage keeps the default row', () => {
  assert.equal(row({ type: 'general-purpose' }), null,
    'a general-purpose subagent was presented as a great_cto stage');
  assert.equal(row({ type: 'Explore' }), null);
  assert.equal(row({ type: undefined, name: 'Plan' }), null);
});

// ── what the row claims ─────────────────────────────────────────────────────

test('a great_cto row names the agent, its model, its elapsed time and its tokens', () => {
  const r = row({});
  assert.match(r, /senior-dev/);
  assert.match(r, /opus-5/);
  assert.match(r, /4m12s/);
  assert.match(r, /38k\/1M/);
  assert.match(r, /implement pipeline-position lib/);
});

test('what was not reported is left out, never printed as a value', () => {
  const r = row({ model: undefined, tokenCount: undefined, contextWindowSize: undefined, startTime: undefined });
  assert.match(r, /senior-dev/, 'the agent name survives missing metadata');
  assert.doesNotMatch(r, /undefined|NaN|null|0k/,
    `a missing field was rendered as if it had a value: ${r}`);
});

test('a measured zero is shown — zero tokens is not the same as no count', () => {
  assert.match(row({ tokenCount: 0 }), /\b0\/1M\b/);
});

test('start time is read from epoch milliseconds, epoch seconds, or ISO', () => {
  assert.match(row({ startTime: NOW - 65_000 }), /1m05s/);
  assert.match(row({ startTime: Math.floor((NOW - 65_000) / 1000) }), /1m05s/);
  assert.match(row({ startTime: new Date(NOW - 65_000).toISOString() }), /1m05s/);
});

test('an unreadable start time is omitted rather than turned into a duration', () => {
  const r = row({ startTime: 'yesterday' });
  assert.doesNotMatch(r, /NaN|undefined/);
  assert.doesNotMatch(r, /\d+h\d+m/, 'an unparseable timestamp produced an invented duration');
});

test('a finished or failed stage says so; a running one does not repeat the obvious', () => {
  assert.match(row({ status: 'completed' }), /completed/);
  assert.match(row({ status: 'failed' }), /failed/);
  assert.doesNotMatch(row({ status: 'running' }), /running/);
});

test('the row fits the width the host gives it', () => {
  const r = row({ description: 'x'.repeat(500) }, { columns: 60 });
  assert.ok(displayWidth(r) <= 60, `row is ${displayWidth(r)} columns wide against a limit of 60`);
  assert.match(r, /…$/);
});

test('wide characters count as two columns when fitting the row', () => {
  const r = row({ description: '翻译'.repeat(100) }, { columns: 40 });
  assert.ok(displayWidth(r) <= 40, `row is ${displayWidth(r)} columns wide against a limit of 40`);
});

// ── the whole panel ─────────────────────────────────────────────────────────

test('render emits one override per great_cto task and leaves the rest alone', () => {
  const lines = render({
    columns: 120,
    tasks: [task(), task({ id: 't2', type: 'general-purpose' }), task({ id: 't3', type: 'great-cto:qa-engineer' })],
  }, { agents: AGENTS, now: NOW });
  const parsed = lines.map((l) => JSON.parse(l));
  assert.deepEqual(parsed.map((p) => p.id), ['t1', 't3']);
  for (const p of parsed) assert.equal(typeof p.content, 'string');
});

test('input it cannot read produces no overrides, not an exception', () => {
  assert.deepEqual(render(null, { agents: AGENTS, now: NOW }), []);
  assert.deepEqual(render({ tasks: 'nope' }, { agents: AGENTS, now: NOW }), []);
  assert.deepEqual(render({ tasks: [null, 42, { id: 'x' }] }, { agents: AGENTS, now: NOW }), []);
});

// ── the command the host actually runs ──────────────────────────────────────

test('the CLI prints nothing and exits cleanly on input it cannot parse', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('the CLI answers the documented input shape with JSON lines', () => {
  const input = {
    session_id: 's', cwd: '/tmp', hook_event_name: 'SubagentStatusLine', columns: 100,
    tasks: [task({ startTime: Date.now() - 5_000 }), task({ id: 't2', type: 'general-purpose' })],
  };
  const r = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = r.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.deepEqual(out.map((o) => o.id), ['t1']);
  assert.match(out[0].content, /senior-dev/);
});

// ── the plugin setting that wires it in ─────────────────────────────────────

test('the plugin ships subagentStatusLine from settings.json, and nothing it may not set', () => {
  const path = join(ROOT, 'settings.json');
  assert.ok(existsSync(path), 'no settings.json at the plugin root');
  const s = JSON.parse(readFileSync(path, 'utf8'));
  // The host honours exactly two keys from a plugin's settings.json. Anything
  // else would be declared, ignored, and look configured.
  const allowed = new Set(['agent', 'subagentStatusLine']);
  assert.deepEqual(Object.keys(s).filter((k) => !allowed.has(k)), [],
    'settings.json sets a key a plugin is not allowed to set');
  assert.equal(s.subagentStatusLine?.type, 'command');
  const c = s.subagentStatusLine.command;
  assert.match(c, /CLAUDE_PLUGIN_ROOT/, 'the command does not ask the host where the plugin is');
  assert.match(c, /cache\/\*\/great_cto/, 'the fallback names one marketplace instead of all of them');
  assert.doesNotMatch(c, /cache\/local\/great_cto/);
  assert.match(c, /scripts\/lib\/subagent-row\.mjs/);
});
