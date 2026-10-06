// What Claude Code and Codex consumed, read from their own logs. Every case here
// is a way the count goes wrong silently: a number that is double, a number that
// is zero because nobody priced the model, a session that splits in two because
// its subagents wrote elsewhere.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  scanUsage, summarizeUsage, readCodexTitles, projectName, dayOf, agentName, mcpLabel, usageIndexSnapshot,
} from '../../scripts/lib/session-usage.mjs';

const made = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

// Midday UTC, so the local calendar day is the same in every timezone a CI box has.
const NOW = Date.parse('2026-10-06T12:00:00Z');
const T = (h = 12, day = 6) => `2026-10-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`;
const PRICES = { 'claude-opus-5': { input: 5, output: 25 } };

function roots() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'su-'));
  made.push(d);
  const claudeDir = path.join(d, 'claude');
  const codexDirs = [path.join(d, 'codex', 'sessions'), path.join(d, 'codex', 'archived')];
  for (const x of [claudeDir, ...codexDirs]) fs.mkdirSync(x, { recursive: true });
  return { d, claudeDir, codexDirs, cacheFile: path.join(d, 'index.json') };
}
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

/** One Claude Code response, written the way Claude Code writes it: one line per content block. */
function claudeResponse({ id, model = 'claude-opus-5', ts = T(), usage, blocks, cwd = '/w/acme', sidechain = false, entrypoint = 'claude-desktop' }) {
  const u = usage || { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 };
  return blocks.map((b) => ({ type: 'assistant', timestamp: ts, cwd, entrypoint, isSidechain: sidechain, message: { id, model, usage: u, content: [b] } }));
}

async function scanned(r, days = 30, extra = {}) {
  const s = await scanUsage({ claudeDir: r.claudeDir, codexDirs: r.codexDirs, cacheFile: r.cacheFile, now: NOW });
  return { scan: s, sum: summarizeUsage(s.index, { days, now: NOW, prices: PRICES, ...extra }) };
}

test('a response written as three lines is counted once; its tool calls are counted per line', async () => {
  const r = roots();
  const dir = path.join(r.claudeDir, '-w-acme');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 's1.jsonl'), jsonl([
    { type: 'custom-title', customTitle: 'Fix login' },
    ...claudeResponse({ id: 'm1', blocks: [
      { type: 'thinking', thinking: '…' },
      { type: 'tool_use', name: 'Skill', input: { skill: 'superpowers:brainstorming' } },
      { type: 'tool_use', name: 'Agent', input: { subagent_type: 'great-cto:senior-dev' } },
    ] }),
    ...claudeResponse({ id: 'm2', blocks: [
      { type: 'tool_use', name: 'mcp__claude-in-chrome__navigate', input: {} },
      { type: 'tool_use', name: 'Agent', input: { subagent_type: 'senior-dev' } },
    ] }),
  ]));
  const { sum } = await scanned(r);
  const c = sum.hosts.claude;
  assert.equal(c.responses, 2, 'five lines, two responses');
  assert.equal(c.input, 20);
  assert.equal(c.output, 200);
  assert.equal(c.cacheRead, 2000);
  // 2 × (10×5 + 100×25 + 1000×0.5) / 1e6
  assert.equal(Number(c.usd.toFixed(6)), 0.0061);
  const l = sum.lists.claude;
  assert.deepEqual(l.agents, [{ name: 'senior-dev', n: 2 }], 'the plugin prefix names the same agent');
  assert.deepEqual(l.skills, [{ name: 'superpowers:brainstorming', n: 1 }]);
  assert.deepEqual(l.mcp, [{ name: 'claude-in-chrome', n: 1 }]);
  assert.equal(sum.top.claude[0].title, 'Fix login');
  assert.equal(sum.top.claude[0].project, 'acme');
});

test('a subagent transcript is spend of the conversation that dispatched it', async () => {
  const r = roots();
  const dir = path.join(r.claudeDir, '-w-acme');
  fs.mkdirSync(path.join(dir, 'parent', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'parent.jsonl'), jsonl(claudeResponse({ id: 'p1', blocks: [{ type: 'text', text: 'hi' }] })));
  fs.writeFileSync(path.join(dir, 'parent', 'subagents', 'agent-x.jsonl'), jsonl(claudeResponse({ id: 'a1', sidechain: true, blocks: [{ type: 'text', text: 'done' }] })));
  fs.writeFileSync(path.join(dir, 'parent', 'subagents', 'agent-x.meta.json'), JSON.stringify({ agentType: 'Explore' }));
  const { sum } = await scanned(r);
  assert.equal(sum.hosts.claude.sessions, 1, 'one conversation, not two');
  assert.equal(sum.top.claude[0].subagentTokens, 1110);
  assert.equal(sum.top.claude[0].tokens, 2220);
  assert.equal(sum.hosts.claude.byFn.chat, 1110);
  assert.equal(sum.hosts.claude.byFn.subagent, 1110);
});

test('a server-side throttle is not a plan limit', async () => {
  const r = roots();
  const dir = path.join(r.claudeDir, '-w-acme');
  fs.mkdirSync(dir);
  const err = (text) => ({ type: 'assistant', timestamp: T(), isApiErrorMessage: true, error: 'rate_limit', apiErrorStatus: 429, message: { id: text, model: '<synthetic>', content: [{ type: 'text', text }] } });
  fs.writeFileSync(path.join(dir, 's.jsonl'), jsonl([
    err('API Error: Server is temporarily limiting requests (not your usage limit)'),
    err("You've hit your limit · resets 3pm"),
  ]));
  const { sum } = await scanned(r);
  assert.deepEqual(sum.hosts.claude.limitHits, { plan: 1, server: 1 });
});

test('Codex: cached input is split out, a response is counted once, tools inside exec are named', async () => {
  const r = roots();
  const dir = path.join(r.codexDirs[0], '2026', '10', '06');
  fs.mkdirSync(dir, { recursive: true });
  const usage = { input_tokens: 1000, cached_input_tokens: 800, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 20, total_tokens: 1050 };
  fs.writeFileSync(path.join(dir, 'rollout-a.jsonl'), jsonl([
    { timestamp: T(9), type: 'session_meta', payload: { id: 'th-1', cwd: '/w/.codex/worktrees/x1/billing', originator: 'Codex Desktop', thread_source: 'automation', source: 'vscode' } },
    { timestamp: T(9), type: 'turn_context', payload: { model: 'gpt-6.1-sol' } },
    { timestamp: T(10), type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', input: 'await tools.exec_command({cmd:"cat ~/.codex/skills/.system/openai-docs/SKILL.md"}); await tools.mcp__codex_app__open_in_codex({});' } },
    { timestamp: T(10), type: 'token_usage_record', payload: { response_id: 'r1', usage } },
    { timestamp: T(10), type: 'token_usage_record', payload: { response_id: 'r1', usage } },
    { timestamp: T(10), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: usage }, rate_limits: { primary: { used_percent: 42, window_minutes: 10080, resets_at: 1791580294 }, plan_type: 'prolite', credits: { has_credits: false, balance: '0' } } } },
    { timestamp: T(11), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: usage }, rate_limits: { primary: { used_percent: 43, window_minutes: 10080, resets_at: 1791580294 }, plan_type: null } } },
  ]));
  fs.mkdirSync(path.join(r.d, 'codexhome'));
  const titles = path.join(r.d, 'codexhome', 'session_index.jsonl');
  fs.writeFileSync(titles, jsonl([{ id: 'th-1', thread_name: 'old' }, { id: 'th-1', thread_name: 'Nightly billing check' }]));
  const { sum } = await scanned(r, 30, { codexTitles: readCodexTitles(titles) });
  const x = sum.hosts.codex;
  assert.equal(x.responses, 1, 'a duplicated record is one response');
  assert.equal(x.input, 200, 'fresh input = input − cached');
  assert.equal(x.cacheRead, 800);
  assert.equal(x.output, 50);
  assert.equal(x.reasoning, 20);
  assert.equal(x.usd, null, 'an unpriced model is unpriced, never $0');
  assert.deepEqual(sum.unpricedModels, ['gpt-6.1-sol']);
  assert.equal(x.byFn.automation, 1050);
  assert.deepEqual(sum.lists.codex.tools.map((t) => t.name).sort(), ['exec_command', 'mcp__codex_app__open_in_codex']);
  assert.deepEqual(sum.lists.codex.mcp, [{ name: 'codex_app', n: 1 }]);
  assert.deepEqual(sum.lists.codex.skills, [{ name: 'openai-docs', n: 1 }]);
  assert.equal(sum.limits.codex.primary.used, 43, 'the latest window reading wins');
  assert.equal(sum.limits.codex.plan, 'prolite', 'a reading without a plan keeps the last known one');
  assert.equal(sum.top.codex[0].title, 'Nightly billing check', 'thread names: last write wins');
  assert.equal(sum.top.codex[0].project, 'billing', 'a Codex worktree is folded into its repository');
});

test('Codex without usage records: the growth of the running total, not every repeated event', async () => {
  const r = roots();
  const tc = (h, total) => ({ timestamp: T(h), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: total, cached_input_tokens: 0, output_tokens: 0, total_tokens: total } } } });
  fs.writeFileSync(path.join(r.codexDirs[1], 'rollout-old.jsonl'), jsonl([
    { timestamp: T(8), type: 'session_meta', payload: { id: 'old', cwd: '/w/acme', originator: 'codex_exec', source: 'exec' } },
    tc(9, 100), tc(9, 100), tc(10, 250), tc(10, 250), tc(11, 250),
  ]));
  const { sum } = await scanned(r);
  assert.equal(sum.hosts.codex.input, 250);
  assert.equal(sum.hosts.codex.responses, 2);
  assert.equal(sum.hosts.codex.byFn.headless, 250);
});

test('a forked Codex thread opens with its inherited total: that is the base, not a response', async () => {
  const r = roots();
  const z = { input_tokens: 0, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
  fs.writeFileSync(path.join(r.codexDirs[1], 'rollout-fork.jsonl'), jsonl([
    { timestamp: T(8), type: 'session_meta', payload: { id: 'fork', cwd: '/w/acme', originator: 'Codex Desktop', thread_source: 'user', source: 'vscode' } },
    { timestamp: T(9), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { ...z, total_tokens: 163098 } } } },
    { timestamp: T(10), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { ...z, input_tokens: 300, total_tokens: 163398 } } } },
  ]));
  const { sum } = await scanned(r);
  assert.equal(sum.hosts.codex.responses, 1);
  assert.equal(sum.hosts.codex.input, 300);
});

test('a line still being written is read once it is finished, and not twice', async () => {
  const r = roots();
  const dir = path.join(r.claudeDir, '-w-acme');
  fs.mkdirSync(dir);
  const f = path.join(dir, 's.jsonl');
  const [first] = claudeResponse({ id: 'm1', blocks: [{ type: 'text', text: 'a' }] }).map((x) => JSON.stringify(x));
  const [second] = claudeResponse({ id: 'm2', blocks: [{ type: 'text', text: 'b' }] }).map((x) => JSON.stringify(x));
  fs.writeFileSync(f, `${first}\n${second.slice(0, 40)}`);
  let { sum } = await scanned(r);
  assert.equal(sum.hosts.claude.responses, 1, 'the half line is left for later');
  fs.appendFileSync(f, `${second.slice(40)}\n`);
  ({ sum } = await scanned(r));
  assert.equal(sum.hosts.claude.responses, 2);
  ({ sum } = await scanned(r));
  assert.equal(sum.hosts.claude.responses, 2, 'an unchanged file is not read again');
});

test('a transcript Claude Code pruned keeps its counted days', async () => {
  const r = roots();
  const dir = path.join(r.claudeDir, '-w-acme');
  fs.mkdirSync(dir);
  const f = path.join(dir, 's.jsonl');
  fs.writeFileSync(f, jsonl(claudeResponse({ id: 'm1', blocks: [{ type: 'text', text: 'a' }] })));
  await scanned(r);
  fs.rmSync(f);
  const { sum } = await scanned(r);
  assert.equal(sum.hosts.claude.responses, 1);
});

test('the window is the operator\'s days; fast mode is priced at twice the rate', async () => {
  const r = roots();
  const dir = path.join(r.claudeDir, '-w-acme');
  fs.mkdirSync(dir);
  const u = { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  fs.writeFileSync(path.join(dir, 's.jsonl'), jsonl([
    ...claudeResponse({ id: 'old', ts: T(12, 1), usage: u, blocks: [{ type: 'text', text: 'a' }] }),
    ...claudeResponse({ id: 'new', ts: T(12, 6), usage: { ...u, speed: 'fast' }, blocks: [{ type: 'text', text: 'b' }] }),
  ]));
  const week = (await scanned(r, 7)).sum;
  const two = (await scanned(r, 2)).sum;
  assert.equal(week.hosts.claude.usd, 5 + 10, '1M input: $5 standard, $10 fast');
  assert.equal(two.hosts.claude.usd, 10, 'the day outside the window is not counted');
  assert.equal(two.daily.length, 2);
  assert.equal(two.daily[1].date, dayOf(NOW));
});

test('no logs on the machine is "not seen", never zero usage', async () => {
  const r = roots();
  const s = await scanUsage({ claudeDir: path.join(r.d, 'none'), codexDirs: [path.join(r.d, 'none2')], cacheFile: r.cacheFile });
  assert.deepEqual(s.seen, { claude: false, codex: false });
});

test('names: projects, agents, connectors', () => {
  assert.equal(projectName('/u/dev/acme/.claude/worktrees/wt-123-4'), 'acme');
  assert.equal(projectName('/u/.codex/worktrees/fix/billing'), 'billing');
  assert.equal(projectName('/u/me', '/u/me'), '~');
  assert.equal(agentName('great-cto:qa-engineer'), 'qa-engineer');
  assert.equal(agentName('feature-dev:code-reviewer'), 'feature-dev:code-reviewer', 'someone else\'s agent keeps its namespace');
  assert.equal(mcpLabel('38aad586-a2a3-4ab2-8b2c-1c38ed15507b'), 'claude.ai connector 38aad586');
  assert.equal(mcpLabel('claude-in-chrome'), 'claude-in-chrome');
});

test('the snapshot answers at once and runs one pass at a time', async () => {
  let passes = 0;
  let release;
  const gate = new Promise((res) => { release = res; });
  const snap = usageIndexSnapshot({ scan: async () => { passes++; await gate; return { index: { files: {} }, seen: { claude: true, codex: false } }; } });
  assert.equal(snap.get().state, 'computing');
  assert.equal(snap.get().state, 'computing');
  release();
  const done = await snap.settle();
  assert.equal(done.state, 'ready');
  assert.equal(passes, 1, 'two requests during the first pass did not start a second');
});
