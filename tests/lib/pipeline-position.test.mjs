// Tests for scripts/lib/pipeline-position.mjs
//
// The dispatcher only answers "what's next" the instant a subagent finishes
// (PostToolUse). This lib answers the same question on demand — after a
// compaction, at session start, or hours into a stall — from the same state,
// via the same decideNext (ADR-010 / ARCH-pipeline-position.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { decideNext, parsePipelineToml, FRESH_MS } from '../../scripts/hooks/pipeline-dispatcher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = resolve(__dirname, '../../scripts/lib/pipeline-position.mjs');
const MODULE_SOURCE = readFileSync(MODULE_PATH, 'utf8');
const PIPELINE_TOML = readFileSync(resolve(__dirname, '../../shared/pipeline.toml'), 'utf8');
const TRANSITIONS = parsePipelineToml(PIPELINE_TOML);

const {
  pipelinePosition,
  readAllVerdicts,
  pipelineOrder,
} = await import(MODULE_PATH);

// ─── fixture helpers ──────────────────────────────────────────────────────

const NOW = Date.parse('2026-08-06T12:00:00Z');

/** Build a verdicts-map entry the way readAllVerdicts would. */
function mkV(agent, verdict, { ageMs = 60_000, canonical = true, hasCost = true } = {}) {
  const tsMs = NOW - ageMs;
  return {
    agent, verdict,
    ts: new Date(tsMs).toISOString(),
    ageMs,
    fresh: ageMs <= FRESH_MS,
    canonical, hasCost,
  };
}

// ─── pipelinePosition: idle ───────────────────────────────────────────────

test('idle: no verdicts at all → position idle, empty next/gates', () => {
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts: {}, activeGates: ['arch', 'ship'], now: NOW });
  assert.equal(r.position, 'idle');
  assert.deepEqual(r.next, []);
  assert.deepEqual(r.gates, []);
  assert.equal(r.cursor, null);
  assert.match(r.summary, /idle/);
  assert.ok(Array.isArray(r.stages) && r.stages.length > 0, 'idle still reports the full stage list, all pending');
  assert.ok(r.stages.every((s) => s.status === 'pending'));
});

// ─── pipelinePosition: success -> gate ────────────────────────────────────

test('success->gate: architect succeeded, gate:arch is active → awaiting-gate', () => {
  const verdicts = { architect: mkV('architect', 'APPROVED') };
  const r = pipelinePosition({ readGates: () => [], transitions: TRANSITIONS, verdicts, activeGates: ['arch', 'ship'], now: NOW });
  assert.equal(r.position, 'awaiting-gate');
  assert.deepEqual(r.next, ['pm']);
  assert.deepEqual(r.gates, ['arch']);
  assert.equal(r.cursor.agent, 'architect');
  assert.match(r.summary, /awaiting-gate/);
  assert.match(r.summary, /pm/);
});

// ─── pipelinePosition: success -> dispatch (no active gate) ──────────────

test('success->dispatch: code-reviewer succeeded, edge has no gate → ready-to-dispatch', () => {
  const verdicts = { 'code-reviewer': mkV('code-reviewer', 'APPROVED') };
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts, activeGates: ['arch', 'ship'], now: NOW });
  assert.equal(r.position, 'ready-to-dispatch');
  assert.deepEqual(r.next.sort(), ['qa-engineer', 'security-officer'].sort());
  assert.deepEqual(r.gates, []);
});

test('success->dispatch: a gate declared but not active at this level also reads as ready-to-dispatch', () => {
  const verdicts = { architect: mkV('architect', 'APPROVED') };
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts, activeGates: ['product', 'ship'], now: NOW }); // product-only: no gate:arch
  assert.equal(r.position, 'ready-to-dispatch');
  assert.deepEqual(r.next, ['pm']);
  assert.deepEqual(r.gates, [], 'a gate the CTO switched off must not be reported as pending');
});

// ─── pipelinePosition: blocked (S1) ───────────────────────────────────────

test('S1: a BLOCKED verdict renders position:blocked with next:[] — never ready to proceed', () => {
  const verdicts = { 'qa-engineer': mkV('qa-engineer', 'BLOCKED') };
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts, activeGates: ['arch', 'ship'], now: NOW });
  assert.equal(r.position, 'blocked');
  assert.deepEqual(r.next, []);
  assert.deepEqual(r.gates, []);
  assert.match(r.summary, /blocked/);
});

test('S1 holds for every blocking token, not just BLOCKED', () => {
  for (const token of ['FAIL', 'FAILED', 'REJECTED']) {
    const verdicts = { 'senior-dev': mkV('senior-dev', token) };
    const r = pipelinePosition({ transitions: TRANSITIONS, verdicts, activeGates: [], now: NOW });
    assert.equal(r.position, 'blocked', token);
    assert.deepEqual(r.next, [], token);
  }
});

// ─── pipelinePosition: join-wait ──────────────────────────────────────────

test('join-wait: qa-engineer succeeded but security-officer has not → join-wait naming the partner', () => {
  const verdicts = { 'qa-engineer': mkV('qa-engineer', 'PASS') };
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts, activeGates: ['qa', 'ship'], now: NOW });
  assert.equal(r.position, 'join-wait');
  assert.deepEqual(r.next, ['security-officer']);
});

test('join-wait resolves to a gate once the join partner also succeeds', () => {
  const verdicts = {
    'qa-engineer': mkV('qa-engineer', 'PASS', { ageMs: 120_000 }),
    'security-officer': mkV('security-officer', 'APPROVED', { ageMs: 60_000 }),
  };
  // cursor = newest event = security-officer (it also has qa-engineer as its own join partner)
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts, activeGates: ['security', 'compliance', 'ship'], now: NOW });
  assert.equal(r.cursor.agent, 'security-officer');
  assert.equal(r.position, 'awaiting-gate');
  assert.deepEqual(r.next, ['devops']);
});

// ─── pipelinePosition: complete ───────────────────────────────────────────

test('complete: l3-support succeeded → end of chain', () => {
  const verdicts = { 'l3-support': mkV('l3-support', 'OK') };
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts, activeGates: [], now: NOW });
  assert.equal(r.position, 'complete');
  assert.deepEqual(r.next, []);
  assert.deepEqual(r.gates, []);
});

// ─── pipelinePosition: stale-label (D2) ───────────────────────────────────

test('stale-label: a verdict older than FRESH_MS still becomes cursor, but is labeled stale, not hidden', () => {
  const verdicts = { architect: mkV('architect', 'APPROVED', { ageMs: FRESH_MS + 60_000 }) };
  const r = pipelinePosition({ readGates: () => [], transitions: TRANSITIONS, verdicts, activeGates: ['arch', 'ship'], now: NOW });
  assert.equal(r.cursor.agent, 'architect', 'a 3-day-old verdict with nothing after it is still the true position');
  assert.equal(r.cursor.fresh, false);
  assert.equal(r.position, 'awaiting-gate');
  const archStage = r.stages.find((s) => s.agent === 'architect');
  assert.equal(archStage.fresh, false, 'the dispatcher\'s 30-min filter must not be reused here — this lib shows stale, not hides it');
});

// ─── pipelinePosition: re-entry (ADR-005) ─────────────────────────────────

test('re-entry: newest-event wins over an older downstream success', () => {
  const verdicts = {
    'senior-dev': mkV('senior-dev', 'TASK_DONE', { ageMs: 3 * 24 * 3600_000 }),   // 3 days old, further along
    architect: mkV('architect', 'APPROVED', { ageMs: 5 * 60_000 }),               // 5 min old, re-run
  };
  const r = pipelinePosition({ readGates: () => [], transitions: TRANSITIONS, verdicts, activeGates: ['arch', 'ship'], now: NOW });
  assert.equal(r.cursor.agent, 'architect', 'the freshest EVENT is the cursor, not the furthest-along stage');
  assert.equal(r.position, 'awaiting-gate');
});

// ─── non-canonical verdict surfaced (fact learned the expensive way) ─────

test('a non-canonical (JSON) verdict is surfaced in the position, not silently accepted', () => {
  const verdicts = { architect: mkV('architect', 'APPROVED', { canonical: false, hasCost: false }) };
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts, activeGates: ['arch', 'ship'], now: NOW });
  assert.equal(r.cursor.canonical, false);
  assert.match(r.summary, /non-canonical/, 'the pull-view must say why the pipeline might look stalled to a human reading the board');
});

test('a canonical verdict adds no non-canonical note', () => {
  const verdicts = { architect: mkV('architect', 'APPROVED') };
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts, activeGates: ['arch', 'ship'], now: NOW });
  assert.ok(!/non-canonical/.test(r.summary));
});

// ─── unrecognized verdict token (decideNext returns null) ────────────────

test('an unrecognized verdict token does not crash — reads as no-verdict rather than a 7th enum value', () => {
  const verdicts = { architect: mkV('architect', 'MAYBE') };
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts, activeGates: ['arch', 'ship'], now: NOW });
  assert.equal(r.position, 'no-verdict');
  assert.deepEqual(r.next, []);
});

// ─── S3: gates/next come from decideNext, not re-derived ─────────────────

test('S3: pipelinePosition agrees with decideNext on the same fixture', () => {
  const verdict = { agent: 'security-officer', verdict: 'APPROVED', canonical: true, hasCost: true };
  const joinVerdicts = { 'qa-engineer': { agent: 'qa-engineer', verdict: 'PASS' } };
  const activeGates = ['security', 'compliance', 'ship'];

  const decision = decideNext({ agent: 'security-officer', transitions: TRANSITIONS, verdict, joinVerdicts, activeGates });

  const verdicts = {
    'security-officer': mkV('security-officer', 'APPROVED', { ageMs: 60_000 }),
    'qa-engineer': mkV('qa-engineer', 'PASS', { ageMs: 120_000 }),
  };
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts, activeGates, now: NOW });

  assert.equal(decision.kind, 'gate');
  assert.equal(r.position, 'awaiting-gate');
  for (const g of r.gates) {
    assert.match(decision.text, new RegExp(`gate:${g}`), `pipelinePosition's gate "${g}" must also appear in decideNext's own directive text`);
  }
  for (const n of r.next) {
    assert.match(decision.text, new RegExp(n), `pipelinePosition's next "${n}" must also appear in decideNext's own directive text`);
  }
});

test('S3: an inactive gate agrees between decideNext (next kind) and pipelinePosition (ready-to-dispatch)', () => {
  const verdict = { agent: 'architect', verdict: 'APPROVED', canonical: true, hasCost: true };
  const activeGates = ['product', 'ship'];
  const decision = decideNext({ agent: 'architect', transitions: TRANSITIONS, verdict, joinVerdicts: {}, activeGates });
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts: { architect: mkV('architect', 'APPROVED') }, activeGates, now: NOW });
  assert.equal(decision.kind, 'next');
  assert.equal(r.position, 'ready-to-dispatch');
});

// ─── S4: --json shape is a documented, stable contract ───────────────────

test('S4: pipelinePosition() returns exactly the documented top-level keys', () => {
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts: {}, activeGates: [], now: NOW });
  // `notified` joined the contract with phase 5: the gates that stood down
  // rather than blocking. It is part of the shape rather than an extra, because
  // a caller that cannot see which decision was skipped cannot report it.
  // `standDown` joined it with GATE-R1..R3: which of three things happened to a
  // tiered gate — recorded, unrecordable, or never tiered. Two states could not
  // carry it, and a stand-down nobody can audit is the defect tiering exists to
  // avoid.
  assert.deepEqual(Object.keys(r).sort(), ['cursor', 'gates', 'next', 'notified', 'position', 'stages', 'standDown', 'summary']);  // `source` is a CLI concern — the function answers about state it was handed
});

test('S4: each stage entry has the documented shape', () => {
  const verdicts = { architect: mkV('architect', 'APPROVED') };
  const r = pipelinePosition({ transitions: TRANSITIONS, verdicts, activeGates: ['arch', 'ship'], now: NOW });
  for (const s of r.stages) {
    assert.deepEqual(Object.keys(s).sort(), ['ageMs', 'agent', 'fresh', 'status', 'ts', 'verdict']);
  }
});

// ─── pipelineOrder ──────────────────────────────────────────────────────

test('pipelineOrder walks the main chain from product-owner', () => {
  const order = pipelineOrder(TRANSITIONS, {});
  assert.equal(order[0], 'product-owner');
  assert.ok(order.includes('architect') && order.includes('pm') && order.includes('senior-dev'));
  assert.ok(order.indexOf('architect') < order.indexOf('pm'));
});

test('pipelineOrder omits an off-chain specialist with no verdict', () => {
  const order = pipelineOrder(TRANSITIONS, {});
  assert.ok(!order.includes('design-advisor'), 'no verdict recorded — must not appear unconditionally');
});

test('pipelineOrder appends an off-chain specialist once it has a verdict', () => {
  const order = pipelineOrder(TRANSITIONS, { 'design-advisor': mkV('design-advisor', 'DONE') });
  assert.ok(order.includes('design-advisor'));
});

// ─── readAllVerdicts: agent comes from the LINE, not the filename ────────
//
// A real .great_cto/verdicts/ holds 2026-06-27.log carrying a project-auditor
// verdict, and an empty senior-dev.log. Trusting the filename would treat a
// date as an agent name; project-auditor isn't a pipeline.toml stage, so it
// must be excluded as a stray log — but for the right reason (unknown agent),
// not because the filename looked wrong.

function sandboxVerdicts(files) {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-position-'));
  const vdir = join(dir, 'verdicts');
  mkdirSync(vdir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(vdir, name), body);
  }
  return { dir, vdir };
}

test('readAllVerdicts takes the agent from the verdict line, not the filename', () => {
  const { vdir, dir } = sandboxVerdicts({
    '2026-06-27.log': '2026-06-27T16:29:38Z | some-old-agent | DONE | artefacts=1 | beads_open=8\n',
  });
  try {
    const verdicts = readAllVerdicts(vdir, { transitions: TRANSITIONS, now: NOW });
    assert.ok(!verdicts['2026-06-27'], 'the filename stem must never become an agent key');
    // A name invented for the case. `project-auditor` stood here as the example
    // of a non-stage until it became one, which is what happens to every real
    // name borrowed to illustrate a category: the illustration decays into a
    // false assertion the day the category changes.
    assert.ok(!verdicts['some-old-agent'], 'not a pipeline.toml stage — stray log, ignored');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('readAllVerdicts skips an empty log file without crashing', () => {
  const { vdir, dir } = sandboxVerdicts({ 'senior-dev.log': '' });
  try {
    const verdicts = readAllVerdicts(vdir, { transitions: TRANSITIONS, now: NOW });
    assert.deepEqual(verdicts, {});
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('readAllVerdicts reads a real known-agent log and labels fresh/stale correctly', () => {
  const now = new Date().toISOString();
  const { vdir, dir } = sandboxVerdicts({
    'architect.log': `${now} | architect | APPROVED | feature=x | cost=$0.10\n`,
  });
  try {
    const verdicts = readAllVerdicts(vdir, { transitions: TRANSITIONS, now: Date.now() });
    assert.ok(verdicts.architect);
    assert.equal(verdicts.architect.verdict, 'APPROVED');
    assert.equal(verdicts.architect.fresh, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('readAllVerdicts accepts an unmapped *-reviewer log by suffix', () => {
  const now = new Date().toISOString();
  const { vdir, dir } = sandboxVerdicts({
    'pci-reviewer.log': `${now} | pci-reviewer | APPROVED | cost=$0\n`,
  });
  try {
    const verdicts = readAllVerdicts(vdir, { transitions: TRANSITIONS, now: Date.now() });
    assert.ok(verdicts['pci-reviewer']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ─── S2: no side effects ──────────────────────────────────────────────────

test('S2: the module source performs no writes, spawns, or network calls', () => {
  const forbidden = [
    'writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'rmdirSync',
    'execSync', 'execFileSync', 'spawnSync', 'spawn(', 'fork(',
    'fetch(', 'http.request', 'https.request', 'net.connect',
  ];
  for (const token of forbidden) {
    assert.ok(!MODULE_SOURCE.includes(token), `pipeline-position.mjs must not contain "${token}" — read-only per ARCH Safeguards S2`);
  }
});

// ─── CLI: --json smoke test + human render ────────────────────────────────

function cliSandbox({ verdictLines = {}, projectMd = 'archetype: devtools\napproval-level: gates-only\n' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-position-cli-'));
  mkdirSync(join(dir, 'shared'), { recursive: true });
  writeFileSync(join(dir, 'shared', 'pipeline.toml'), PIPELINE_TOML);
  mkdirSync(join(dir, '.great_cto', 'verdicts'), { recursive: true });
  writeFileSync(join(dir, '.great_cto', 'PROJECT.md'), `# test-project\n\n${projectMd}`);
  for (const [agent, line] of Object.entries(verdictLines)) {
    writeFileSync(join(dir, '.great_cto', 'verdicts', `${agent}.log`), line + '\n');
  }
  return dir;
}

function runCli(cwd, args = []) {
  const r = spawnSync('node', [MODULE_PATH, ...args], { encoding: 'utf8', cwd });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('CLI --json emits the documented shape', () => {
  const now = new Date().toISOString();
  const dir = cliSandbox({ verdictLines: { architect: `${now} | architect | APPROVED | feature=x | cost=$0.10` } });
  try {
    const r = runCli(dir, ['--json']);
    assert.equal(r.exit, 0);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(Object.keys(out).sort(), ['cursor', 'gates', 'next', 'notified', 'position', 'source', 'stages', 'standDown', 'summary']);
    assert.equal(out.position, 'awaiting-gate');
    assert.deepEqual(out.next, ['pm']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI default render is a non-empty human table', () => {
  const now = new Date().toISOString();
  const dir = cliSandbox({ verdictLines: { architect: `${now} | architect | APPROVED | feature=x | cost=$0.10` } });
  try {
    const r = runCli(dir, []);
    assert.equal(r.exit, 0);
    assert.ok(r.stdout.trim().length > 0);
    assert.match(r.stdout, /Position:/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI --exit-code returns 2 only when blocked', () => {
  const now = new Date().toISOString();
  const dirOk = cliSandbox({ verdictLines: { architect: `${now} | architect | APPROVED | cost=$0` } });
  const dirBlocked = cliSandbox({ verdictLines: { 'qa-engineer': `${now} | qa-engineer | BLOCKED | cost=$0` } });
  try {
    assert.equal(runCli(dirOk, ['--exit-code']).exit, 0);
    assert.equal(runCli(dirBlocked, ['--exit-code']).exit, 2);
    assert.equal(runCli(dirBlocked, []).exit, 0, 'without --exit-code, blocked is still a normal report, exit 0');
  } finally {
    rmSync(dirOk, { recursive: true, force: true });
    rmSync(dirBlocked, { recursive: true, force: true });
  }
});

test('CLI idle project (no verdicts yet) reports idle, exit 0', () => {
  const dir = cliSandbox();
  try {
    const r = runCli(dir, ['--json']);
    assert.equal(r.exit, 0);
    assert.equal(JSON.parse(r.stdout).position, 'idle');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── gate approval is read, not assumed ─────────────────────────────────────
//
// The view reported `awaiting-gate` after the CTO had closed the bead, because
// nothing in the machinery ever asked whether a gate was approved — it only
// told the orchestrator to go and look. That made approving a gate one human
// action and continuing the pipeline a second one carrying no decision.

test('an approved gate moves the position from awaiting-gate to ready-to-dispatch', () => {
  const base = {
    transitions: { architect: { on: ['APPROVED'], gate: 'gate:arch', next: ['pm'] } },
    verdicts: { architect: { agent: 'architect', verdict: 'APPROVED', ts: '2026-08-06T10:00:00Z', ageMs: 0, fresh: true } },
    activeGates: ['arch'],
  };
  const waiting = pipelinePosition({ ...base, readGates: () => [] });
  assert.equal(waiting.position, 'awaiting-gate');

  const approved = pipelinePosition({
    ...base,
    readGates: () => [{ id: 'g1', title: 'gate:arch — x', status: 'closed', updated_at: '2026-08-06T11:00:00Z' }],
  });
  assert.equal(approved.position, 'ready-to-dispatch');
  assert.deepEqual(approved.next, ['pm']);
});

test('a gate closed before this stage ran does not carry it', () => {
  // gate:arch closed for the previous feature must not wave this one through.
  const p = pipelinePosition({
    transitions: { architect: { on: ['APPROVED'], gate: 'gate:arch', next: ['pm'] } },
    verdicts: { architect: { agent: 'architect', verdict: 'APPROVED', ts: '2026-08-06T10:00:00Z', ageMs: 0, fresh: true } },
    activeGates: ['arch'],
    readGates: () => [{ id: 'old', title: 'gate:arch — last feature', status: 'closed', updated_at: '2026-08-01T09:00:00Z' }],
  });
  assert.equal(p.position, 'awaiting-gate');
});

test('an unreadable gate store waits rather than dispatching', () => {
  const p = pipelinePosition({
    transitions: { architect: { on: ['APPROVED'], gate: 'gate:arch', next: ['pm'] } },
    verdicts: { architect: { agent: 'architect', verdict: 'APPROVED', ts: '2026-08-06T10:00:00Z', ageMs: 0, fresh: true } },
    activeGates: ['arch'],
    readGates: () => { throw new Error('bd unavailable'); },
  });
  assert.equal(p.position, 'awaiting-gate', 'a gate that cannot be read is a gate that has not been approved');
});

test('the report names which project it read', () => {
  // Run from a home directory that happens to hold `shared/pipeline.toml` and
  // `.great_cto/verdicts/` — both of which the bootstrap can leave there — this
  // tool read eighteen other projects' verdict logs and confidently reported a
  // position from a five-week-old verdict. It was not wrong about what it read;
  // it never said what that was. An unattributed answer about "the pipeline" is
  // the defect this module exists to fix, one level up.
  const src = MODULE_SOURCE;
  assert.match(src, /const source = \{ map: resolve\(pipelinePath\), project: resolve\(projDir\) \}/,
    'the CLI must resolve what it read to absolute paths');
  assert.match(src, /reading: \$\{source\.project\}/, 'and print it');
  assert.ok(src.includes('{ ...result, source }'), 'and carry it in --json, where a script reads it');
});

// ── Phase 5: a gate that announces instead of waiting ───────────────────────
//
// The gate is not deleted and not hidden. The entry still reaches the board's
// inbox and can still be acted on; what stops is the pipeline waiting to be told
// to continue. A gate that silently vanished would be indistinguishable from a
// gate nobody configured.

test('a gate stands when its agent is not tiered', () => {
  const transitions = { architect: { on: ['APPROVED'], gate: 'gate:arch', next: ['pm'] } };
  const verdicts = { architect: { agent: 'architect', verdict: 'APPROVED', ts: new Date().toISOString(), canonical: true } };
  const p = pipelinePosition({ transitions, verdicts, readGates: () => [] });
  assert.equal(p.position, 'awaiting-gate');
  assert.deepEqual(p.notified, [], 'nothing stood down');
});

test('a tiered agent proceeds once the stand-down is RECORDED, and the gate is named', () => {
  const transitions = { architect: { on: ['APPROVED'], gate: 'gate:arch', next: ['pm'] } };
  const verdicts = { architect: { agent: 'architect', verdict: 'APPROVED', ts: new Date().toISOString(), canonical: true } };
  const written = [];
  const p = pipelinePosition({
    transitions, verdicts, readGates: () => [], notifyOnly: new Set(['architect']),
    recordStandDown: (rec) => { written.push(rec); return { recorded: true, why: 'written' }; },
    tierName: 'notify', tierWhy: 'architect conclusively passed its holdout',
  });
  assert.equal(p.position, 'ready-to-dispatch');
  assert.deepEqual(p.notified, ['gate:arch']);
  assert.equal(p.standDown.state, 'recorded');
  assert.match(p.summary, /notify-only/);
  assert.match(p.summary, /conclusively passed/, 'and the summary says why it did not ask');
  assert.equal(written.length, 1, 'and something actually witnessed it');
  assert.equal(written[0].gate, 'arch');
  assert.equal(written[0].agent, 'architect');
});

test('tiering another agent does not stand this gate down', () => {
  const transitions = { architect: { on: ['APPROVED'], gate: 'gate:arch', next: ['pm'] } };
  const verdicts = { architect: { agent: 'architect', verdict: 'APPROVED', ts: new Date().toISOString(), canonical: true } };
  const p = pipelinePosition({ transitions, verdicts, readGates: () => [], notifyOnly: new Set(['qa-engineer']) });
  assert.equal(p.position, 'awaiting-gate');
});

test('an absent notifyOnly behaves exactly as before', () => {
  const transitions = { architect: { on: ['APPROVED'], gate: 'gate:arch', next: ['pm'] } };
  const verdicts = { architect: { agent: 'architect', verdict: 'APPROVED', ts: new Date().toISOString(), canonical: true } };
  for (const n of [null, undefined]) {
    assert.equal(pipelinePosition({ transitions, verdicts, readGates: () => [], notifyOnly: n }).position, 'awaiting-gate');
  }
});

// ── GATE-R1..R3: a gate that stands down must leave a record ─────────────────
//
// Six days of `gate-tiering: evidence` had no such guarantee. The stand-down
// entry was meant to reach the board's inbox; if that write failed the stage
// proceeded anyway, leaving a gate that stood down and a gate that stood down
// and told nobody indistinguishable. That is the defect tiering was built to
// avoid, shipped inside it.

const TIERED = {
  transitions: { architect: { on: ['APPROVED'], gate: 'gate:arch', next: ['pm'] } },
  verdicts: { architect: { agent: 'architect', verdict: 'APPROVED', ts: new Date().toISOString(), canonical: true } },
};

test('GATE-R2: a stand-down that cannot be recorded does not happen — the gate waits', () => {
  const p = pipelinePosition({
    ...TIERED, readGates: () => [], notifyOnly: new Set(['architect']),
    recordStandDown: () => ({ recorded: false, why: 'disk full' }),
  });
  assert.equal(p.position, 'awaiting-gate', 'fail-closed: the human is still asked');
  assert.deepEqual(p.notified, [], 'and nothing claims to have been announced');
  assert.equal(p.standDown.state, 'unrecordable');
  assert.match(p.summary, /disk full/, 'the real reason, not a guess about it');
});

test('GATE-R2: a recorder that THROWS is a recorder that failed, not a crash', () => {
  // Every way of failing has to end with the human still being asked.
  const p = pipelinePosition({
    ...TIERED, readGates: () => [], notifyOnly: new Set(['architect']),
    recordStandDown: () => { throw new Error('beads unreachable'); },
  });
  assert.equal(p.position, 'awaiting-gate');
  assert.equal(p.standDown.state, 'unrecordable');
  assert.match(p.standDown.why, /beads unreachable/);
});

test('GATE-R2: no recorder at all is not permission to proceed', () => {
  // The default must not assume somebody else wrote it down. This is the exact
  // state the feature shipped in, and it is now a refusal.
  const p = pipelinePosition({ ...TIERED, readGates: () => [], notifyOnly: new Set(['architect']) });
  assert.equal(p.position, 'awaiting-gate');
  assert.equal(p.standDown.state, 'unrecordable');
  assert.match(p.standDown.why, /no stand-down recorder/);
});

test('GATE-R1: the record names the gate, the agent, the tier and the evidence', () => {
  const seen = [];
  pipelinePosition({
    ...TIERED, readGates: () => [], notifyOnly: new Set(['architect']),
    recordStandDown: (rec) => { seen.push(rec); return { recorded: true, why: 'ok' }; },
    tierName: 'notify-thin', tierWhy: '1 eval conclusively passed — coverage unmeasured',
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].gate, 'arch');
  assert.equal(seen[0].agent, 'architect');
  assert.equal(seen[0].tier, 'notify-thin', 'which tier stood it down, not merely that one did');
  assert.match(seen[0].evidence, /coverage unmeasured/);
  assert.ok(Number.isFinite(seen[0].at), 'and when');
});

test('GATE-R1: the record is written BEFORE the position says proceed', () => {
  // Ordering is the requirement. Recording after returning would leave a window
  // in which the pipeline has been told to go and nothing yet witnesses it.
  let recordedAt = null;
  const p = pipelinePosition({
    ...TIERED, readGates: () => [], notifyOnly: new Set(['architect']),
    recordStandDown: () => { recordedAt = 'during'; return { recorded: true, why: 'ok' }; },
  });
  assert.equal(recordedAt, 'during', 'the recorder ran inside the call, not after it');
  assert.equal(p.position, 'ready-to-dispatch');
});

test('GATE-R3: an untiered gate is not-applicable, which is neither of the other two', () => {
  const p = pipelinePosition({ ...TIERED, readGates: () => [], notifyOnly: new Set(['someone-else']) });
  assert.equal(p.position, 'awaiting-gate');
  assert.equal(p.standDown.state, 'not-applicable', 'never tiered is not the same as failed to record');
});

test('GATE-R3: the three states are distinguishable from the contract alone', () => {
  const states = new Set();
  states.add(pipelinePosition({ ...TIERED, readGates: () => [], notifyOnly: new Set(['someone-else']) }).standDown.state);
  states.add(pipelinePosition({ ...TIERED, readGates: () => [], notifyOnly: new Set(['architect']), recordStandDown: () => ({ recorded: false, why: 'x' }) }).standDown.state);
  states.add(pipelinePosition({ ...TIERED, readGates: () => [], notifyOnly: new Set(['architect']), recordStandDown: () => ({ recorded: true, why: 'x' }) }).standDown.state);
  assert.deepEqual([...states].sort(), ['not-applicable', 'recorded', 'unrecordable']);
});
