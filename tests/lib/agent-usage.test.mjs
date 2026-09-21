// agent-usage — how often each agent is really dispatched, read from Claude Code's
// own session logs. The board's "never observed" came from verdict lines, which an
// agent writes at the end of a run: a run that wrote none was invisible, and nothing
// said how often an agent is dispatched at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentUsage } from '../../scripts/lib/agent-usage.mjs';

function tree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-usage-'));
  return { root, logs: path.join(root, 'projects'), cache: path.join(root, 'usage-index.json') };
}
const dispatch = (subagent, ts, cwd = '/work/a') => JSON.stringify({
  type: 'assistant', timestamp: ts, cwd, isSidechain: false,
  message: { content: [{ type: 'tool_use', name: 'Agent', input: { subagent_type: subagent, prompt: 'x' } }] },
});
function write(dir, rel, lines) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, lines.join('\n') + '\n');
  return p;
}
const AGENTS = ['senior-dev', 'architect', 'cmmc-reviewer'];

test('no logs directory is unavailable, never a zero that reads as disuse', async () => {
  const t = tree();
  const u = await agentUsage({ logsDir: t.logs, cacheFile: t.cache, agents: AGENTS });
  assert.equal(u.state, 'unavailable');
  assert.equal(u.agents['senior-dev'], undefined, 'no per-agent number when nothing was read');
});

test('dispatches are counted per agent, with last run and distinct projects', async () => {
  const t = tree();
  write(t.logs, 'p1/s1.jsonl', [
    dispatch('senior-dev', '2026-09-01T10:00:00Z', '/work/a'),
    dispatch('great-cto:senior-dev', '2026-09-03T10:00:00Z', '/work/b'),
    dispatch('architect', '2026-09-02T10:00:00Z', '/work/a'),
    '{"type":"user","message":{"content":"mentions subagent_type in prose only"}}',
    'not json at all',
  ]);
  const u = await agentUsage({ logsDir: t.logs, cacheFile: t.cache, agents: AGENTS });
  assert.equal(u.state, 'counted');
  assert.deepEqual(u.agents['senior-dev'], { dispatches: 2, lastRun: '2026-09-03T10:00:00Z', projects: 2 });
  assert.equal(u.agents.architect.dispatches, 1);
  assert.deepEqual(u.agents['cmmc-reviewer'], { dispatches: 0, lastRun: null, projects: 0 }, 'read and not named is a real zero');
  assert.equal(u.window.from, '2026-09-01T10:00:00Z');
  assert.equal(u.window.to, '2026-09-03T10:00:00Z');
});

test('a dispatch from inside a subagent transcript counts too', async () => {
  const t = tree();
  write(t.logs, 'p1/s1/subagents/agent-1.jsonl', [dispatch('architect', '2026-09-05T00:00:00Z')]);
  const u = await agentUsage({ logsDir: t.logs, cacheFile: t.cache, agents: AGENTS });
  assert.equal(u.agents.architect.dispatches, 1);
});

test('names that are not great_cto agents are ignored', async () => {
  const t = tree();
  write(t.logs, 'p1/s1.jsonl', [dispatch('general-purpose', '2026-09-01T00:00:00Z'), dispatch('Explore', '2026-09-01T00:00:00Z')]);
  const u = await agentUsage({ logsDir: t.logs, cacheFile: t.cache, agents: AGENTS });
  assert.equal(Object.values(u.agents).reduce((a, x) => a + x.dispatches, 0), 0);
});

test('paths never leave the module — only counts', async () => {
  const t = tree();
  write(t.logs, 'p1/s1.jsonl', [dispatch('senior-dev', '2026-09-01T00:00:00Z', '/Users/someone/private-client')]);
  const u = await agentUsage({ logsDir: t.logs, cacheFile: t.cache, agents: AGENTS });
  assert.doesNotMatch(JSON.stringify(u), /someone|private-client/);
});

test('an unchanged file is read from the cache, a changed one is re-read', async () => {
  const t = tree();
  const f = write(t.logs, 'p1/s1.jsonl', [dispatch('senior-dev', '2026-09-01T00:00:00Z')]);
  const first = await agentUsage({ logsDir: t.logs, cacheFile: t.cache, agents: AGENTS });
  assert.equal(first.read, 1);
  const second = await agentUsage({ logsDir: t.logs, cacheFile: t.cache, agents: AGENTS });
  assert.equal(second.read, 0, 'nothing changed, nothing re-read');
  assert.equal(second.agents['senior-dev'].dispatches, 1);
  fs.appendFileSync(f, dispatch('senior-dev', '2026-09-02T00:00:00Z') + '\n');
  const third = await agentUsage({ logsDir: t.logs, cacheFile: t.cache, agents: AGENTS });
  assert.equal(third.read, 1);
  assert.equal(third.agents['senior-dev'].dispatches, 2);
});

test('a deleted transcript drops out of the counts', async () => {
  const t = tree();
  const f = write(t.logs, 'p1/s1.jsonl', [dispatch('senior-dev', '2026-09-01T00:00:00Z')]);
  await agentUsage({ logsDir: t.logs, cacheFile: t.cache, agents: AGENTS });
  fs.rmSync(f);
  const u = await agentUsage({ logsDir: t.logs, cacheFile: t.cache, agents: AGENTS });
  assert.equal(u.agents['senior-dev'].dispatches, 0);
});

test('a corrupt cache is rebuilt, not trusted', async () => {
  const t = tree();
  write(t.logs, 'p1/s1.jsonl', [dispatch('senior-dev', '2026-09-01T00:00:00Z')]);
  fs.mkdirSync(path.dirname(t.cache), { recursive: true });
  fs.writeFileSync(t.cache, '{not json');
  const u = await agentUsage({ logsDir: t.logs, cacheFile: t.cache, agents: AGENTS });
  assert.equal(u.agents['senior-dev'].dispatches, 1);
});

// The first pass over real logs takes ~47 s (4 GB on the machine that found the
// numbers). A board request cannot wait for it: the snapshot answers at once with
// the last result, or `computing` before there is one, and refreshes in the background.
import { usageSnapshot } from '../../scripts/lib/agent-usage.mjs';

test('usageSnapshot: answers computing first, then the result, without waiting', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let calls = 0;
  const snap = usageSnapshot({ compute: async () => { calls++; await gate; return { state: 'counted', agents: { a: { dispatches: 3 } } }; }, ttlMs: 1000, now: () => 0 });
  assert.equal(snap.get().state, 'computing');
  assert.equal(snap.get().state, 'computing', 'a second request does not start a second pass');
  assert.equal(calls, 1);
  release(); await new Promise((r) => setImmediate(r));
  const r = snap.get();
  assert.equal(r.state, 'counted');
  assert.equal(r.agents.a.dispatches, 3);
});

test('usageSnapshot: a stale result is served while one refresh runs', async () => {
  let t = 0; let calls = 0;
  const snap = usageSnapshot({ compute: async () => ({ state: 'counted', n: ++calls }), ttlMs: 100, now: () => t });
  snap.get(); await new Promise((r) => setImmediate(r));
  assert.equal(snap.get().n, 1);
  t = 500;
  const stale = snap.get();
  assert.equal(stale.n, 1, 'the old result is still served');
  assert.equal(stale.refreshing, true);
  await new Promise((r) => setImmediate(r));
  assert.equal(snap.get().n, 2);
});

test('usageSnapshot: a failed pass is reported, not hidden behind an old result', async () => {
  const snap = usageSnapshot({ compute: async () => { throw new Error('disk gone'); }, ttlMs: 100, now: () => 0 });
  snap.get(); await new Promise((r) => setImmediate(r));
  const r = snap.get();
  assert.equal(r.state, 'unavailable');
  assert.match(r.why, /disk gone/);
});
