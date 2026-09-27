// session-shape: how the operator's own sessions spend — length, idle time,
// cache rebuilds, which model the main thread runs on while subagents work.
// Fixture transcripts live in a temp dir that after() removes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sessionShape, analyse, formatReport } from '../../scripts/lib/session-shape.mjs';
import { priceUsage } from '../../scripts/lib/cost-meter.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = join(ROOT, 'scripts/lib/session-shape.mjs');

const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

const SECRET = 'SECRET-PROMPT-TEXT-do-not-print';
const PROJECT = '-Users-someone-dev-acme-widgets';

let clock = Date.parse('2026-09-10T10:00:00Z');
const at = (stepMs = 60_000) => new Date((clock += stepMs)).toISOString();

const usage = ({ inp = 10, out = 100, cr = 0, cc = 0 } = {}) => ({
  input_tokens: inp, output_tokens: out, cache_read_input_tokens: cr, cache_creation_input_tokens: cc,
});
const asst = (id, u, { model = 'claude-opus-5', ts = at(), side = false } = {}) => ({
  type: 'assistant', timestamp: ts, isSidechain: side,
  message: { id, model, usage: usage(u), content: [{ type: 'text', text: `${SECRET} answer` }] },
});
const user = (ts = at()) => ({ type: 'user', timestamp: ts, message: { content: `${SECRET} question` } });
const jsonl = (lines) => lines.map((l) => JSON.stringify(l)).join('\n');

/** { project: { sessionId: { main: [...], subs: { name: [...] } } } } → a projects root. */
function fixture(tree) {
  const root = mkdtempSync(join(tmpdir(), 'session-shape-')); made.push(root);
  for (const [proj, sessions] of Object.entries(tree)) {
    mkdirSync(join(root, proj), { recursive: true });
    for (const [sid, { main = [], subs = {} }] of Object.entries(sessions)) {
      writeFileSync(join(root, proj, `${sid}.jsonl`), jsonl(main));
      for (const [name, lines] of Object.entries(subs)) {
        const dir = join(root, proj, sid, 'subagents');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${name}.jsonl`), jsonl(lines));
      }
    }
  }
  return root;
}

const usd = (model, u) => priceUsage({ model, usage: usage(u) }).usd;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
const SINCE = '2026-09-01';

test('a message written as several lines is one turn, priced once', async () => {
  const ts = at();
  const u = { inp: 5, out: 200, cr: 1000, cc: 500 };
  const root = fixture({ [PROJECT]: { s1: { main: [
    user(), asst('msg_A', u, { ts }), asst('msg_A', u, { ts }), asst('msg_A', u, { ts }), user(), asst('msg_B', u),
  ] } } });
  const { sessions } = await sessionShape({ root, since: SINCE });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].main.turns, 2);
  close(sessions[0].main.usd, 2 * usd('claude-opus-5', u), 'two turns, not four');
  assert.equal(sessions[0].main.output, 400);
});

test('a big cache write after turn 5 is a rebuild; the same write early is not', async () => {
  const lines = [user()];
  for (let i = 0; i < 8; i++) {
    const cc = i === 2 ? 50_000 : i === 6 ? 30_000 : i === 7 ? 19_000 : 100;
    lines.push(asst(`msg_${i}`, { cc, cr: 40_000 }));
  }
  const root = fixture({ [PROJECT]: { s1: { main: lines } } });
  const { sessions } = await sessionShape({ root, since: SINCE });
  assert.equal(sessions[0].rebuilds.count, 1, 'only turn #7 (30k ≥ 20k, after the 5th) counts');
  assert.equal(sessions[0].rebuilds.tokens, 30_000);
  assert.equal(sessions[0].peakContext, 40_000 + 50_000 + 10);
});

test('subagent turns are the session’s cost, attributed to subagents, and not double-counted', async () => {
  const subU = { inp: 10, out: 5000, cr: 20_000, cc: 1000 };
  const mainU = { inp: 10, out: 300, cr: 50_000, cc: 1000 };
  const shared = asst('msg_sub1', subU, { model: 'claude-sonnet-5' });
  const root = fixture({ [PROJECT]: { s1: {
    // An older transcript also carries the sidechain turn in the main file.
    main: [user(), asst('msg_m1', mainU), { ...shared, isSidechain: true }, asst('msg_m2', mainU)],
    subs: { 'agent-a1': [user(), shared, asst('msg_sub2', subU, { model: 'claude-sonnet-5' })] },
  } } });
  const { sessions } = await sessionShape({ root, since: SINCE });
  const s = sessions[0];
  assert.equal(s.main.turns, 2);
  assert.equal(s.sub.turns, 2, 'msg_sub1 is counted once');
  assert.equal(s.sub.files, 1);
  close(s.sub.usd, 2 * usd('claude-sonnet-5', subU), 'subagent cost');
  close(s.usd, s.main.usd + s.sub.usd, 'session = main + subagents');
  assert.equal(s.mainModel, 'claude-opus-5');
  assert.deepEqual(Object.keys(s.sub.byModel), ['claude-sonnet-5']);

  // Main thread on the dearer model while subagents do the output: a signal.
  const report = analyse(sessions);
  const sig = report.signals.find((x) => x.key === 'dispatcher');
  assert.equal(sig.sessions, 1);
  assert.ok(sig.estUsd > 0, 'a cheaper main thread is priced as a saving');
});

test('scripted temp-dir projects are not the operator’s sessions', async () => {
  const root = fixture({
    [PROJECT]: { s1: { main: [user(), asst('msg_1', {})] } },
    '-private-tmp-bench-run': { s2: { main: [user(), asst('msg_2', {})] } },
    '-var-folders-xy-T-probe': { s3: { main: [user(), asst('msg_3', {})] } },
  });
  const { sessions } = await sessionShape({ root, since: SINCE });
  assert.deepEqual(sessions.map((s) => s.id), ['s1']);
});

test('the window keeps only turns inside it', async () => {
  const root = fixture({ [PROJECT]: {
    old: { main: [user('2026-08-01T10:00:00Z'), asst('msg_old', {}, { ts: '2026-08-01T10:01:00Z' })] },
    now: { main: [user(), asst('msg_now', {})] },
  } });
  const { sessions } = await sessionShape({ root, since: SINCE, until: '2026-10-01' });
  assert.deepEqual(sessions.map((s) => s.id), ['now']);
});

test('the report never prints message text, and names projects only when asked', async () => {
  const lines = [user()];
  for (let i = 0; i < 12; i++) lines.push(asst(`msg_${i}`, { cr: 30_000, cc: i > 6 ? 25_000 : 100 }), user());
  const root = fixture({
    [PROJECT]: { s1: { main: lines } },
    '-Users-someone-dev-other-thing': { s2: { main: [user(), asst('msg_x', {})] } },
  });
  const run = (...args) => spawnSync(process.execPath, [CLI, '--root', root, '--since', SINCE, ...args], { encoding: 'utf8' });

  for (const args of [[], ['--json'], ['--top', '5']]) {
    const r = run(...args);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!r.stdout.includes(SECRET), `message text leaked with ${args.join(' ') || 'defaults'}`);
    assert.ok(!r.stdout.includes('acme-widgets'), `project name leaked with ${args.join(' ') || 'defaults'}`);
    assert.ok(!r.stdout.includes('someone'), 'home path leaked');
  }
  const text = run().stdout;
  assert.match(text, /\bp1\b/);
  assert.match(text, /\bp2\b/);
  assert.match(text, /Change first/);
  assert.match(text, /threshold/i);

  const shown = run('--show-projects').stdout;
  assert.match(shown, /acme-widgets/);
  assert.ok(!shown.includes(SECRET));
});

test('change-first lists at most three signals, biggest estimated saving first, each with a habit', async () => {
  const lines = [user()];
  for (let i = 0; i < 320; i++) lines.push(asst(`msg_${i}`, { cr: 10_000 + i * 1000, cc: i % 20 === 19 ? 40_000 : 500 }), user());
  const root = fixture({ [PROJECT]: { s1: { main: lines } } });
  const report = analyse((await sessionShape({ root, since: SINCE })).sessions);
  assert.ok(report.changeFirst.length <= 3 && report.changeFirst.length > 0);
  for (let i = 1; i < report.changeFirst.length; i++) {
    assert.ok(report.changeFirst[i - 1].estUsd >= report.changeFirst[i].estUsd);
  }
  for (const c of report.changeFirst) assert.ok(c.habit && c.habit.length > 20, c.key);
  const marathon = report.signals.find((x) => x.key === 'marathon');
  assert.equal(marathon.sessions, 1);
  assert.equal(marathon.light, 'red');
  assert.match(formatReport(report), /marathon/i);
});
