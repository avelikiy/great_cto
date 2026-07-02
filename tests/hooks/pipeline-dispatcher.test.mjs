// Tests for scripts/hooks/pipeline-dispatcher.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '../../scripts/hooks/pipeline-dispatcher.mjs');
const PIPELINE_TOML = readFileSync(resolve(__dirname, '../../shared/pipeline.toml'), 'utf8');

const {
  parsePipelineToml,
  normalizeAgent,
  parseVerdictLine,
  decideNext,
} = await import(HOOK);

// ─── Unit: TOML subset parser ────────────────────────────────────────────

test('parsePipelineToml reads the shipped pipeline.toml', () => {
  const t = parsePipelineToml(PIPELINE_TOML);
  assert.deepEqual(t.architect.next, ['pm']);
  assert.equal(t.architect.gate, 'gate:arch');
  assert.deepEqual(t['qa-engineer'].join, ['security-officer']);
  assert.deepEqual(t['code-reviewer'].next, ['qa-engineer', 'security-officer']);
  assert.deepEqual(t['l3-support'].next, []);
});

test('parsePipelineToml ignores comments and unknown sections', () => {
  const t = parsePipelineToml(`
# comment
[other.section]
on = ["X"]
[transitions.foo]
on = ["DONE"]  # trailing comment
next = ["bar", "baz"]
`);
  assert.deepEqual(Object.keys(t), ['foo']);
  assert.deepEqual(t.foo.next, ['bar', 'baz']);
});

// ─── Unit: helpers ───────────────────────────────────────────────────────

test('normalizeAgent strips the great_cto- prefix', () => {
  assert.equal(normalizeAgent('great_cto-architect'), 'architect');
  assert.equal(normalizeAgent('pm'), 'pm');
});

test('parseVerdictLine handles pipe- and space-separated formats', () => {
  assert.deepEqual(
    parseVerdictLine('2026-07-02T10:00:00Z | architect | APPROVED | feature=x | cost=$0.50'),
    { ts: '2026-07-02T10:00:00Z', agent: 'architect', verdict: 'APPROVED' });
  assert.deepEqual(
    parseVerdictLine('2026-07-02T10:00:00Z qa-engineer PASS coverage=80%'),
    { ts: '2026-07-02T10:00:00Z', agent: 'qa-engineer', verdict: 'PASS' });
  assert.equal(parseVerdictLine(''), null);
});

// ─── Unit: transition decisions ──────────────────────────────────────────

const TRANSITIONS = parsePipelineToml(PIPELINE_TOML);
const v = (agent, verdict) => ({ ts: 't', agent, verdict });

test('success verdict with gate → gate directive naming next agent', () => {
  const d = decideNext({ agent: 'architect', transitions: TRANSITIONS, verdict: v('architect', 'APPROVED') });
  assert.equal(d.kind, 'gate');
  assert.match(d.text, /gate:arch/);
  assert.match(d.text, /spawn subagent_type: pm/);
  assert.match(d.text, /Do not auto-approve/);
});

test('success verdict without gate → immediate spawn directive', () => {
  const d = decideNext({ agent: 'senior-dev', transitions: TRANSITIONS, verdict: v('senior-dev', 'TASK_DONE') });
  assert.equal(d.kind, 'next');
  assert.match(d.text, /code-reviewer/);
});

test('BLOCKED verdict halts the chain', () => {
  const d = decideNext({ agent: 'qa-engineer', transitions: TRANSITIONS, verdict: v('qa-engineer', 'BLOCKED') });
  assert.equal(d.kind, 'blocked');
  assert.match(d.text, /Do NOT spawn/);
});

test('missing verdict → three-state completion reminder', () => {
  const d = decideNext({ agent: 'pm', transitions: TRANSITIONS, verdict: null });
  assert.equal(d.kind, 'no-verdict');
  assert.match(d.text, /log-verdict\.sh pm/);
});

test('join quorum pending → wait directive naming the partner', () => {
  const d = decideNext({
    agent: 'qa-engineer', transitions: TRANSITIONS,
    verdict: v('qa-engineer', 'PASS'), joinVerdicts: { 'security-officer': null },
  });
  assert.equal(d.kind, 'join-wait');
  assert.match(d.text, /security-officer/);
});

test('join quorum satisfied → gate directive to devops', () => {
  const d = decideNext({
    agent: 'qa-engineer', transitions: TRANSITIONS,
    verdict: v('qa-engineer', 'PASS'),
    joinVerdicts: { 'security-officer': v('security-officer', 'APPROVED') },
  });
  assert.equal(d.kind, 'gate');
  assert.match(d.text, /gate:ship/);
  assert.match(d.text, /devops/);
});

test('unknown verdict token → silent (null)', () => {
  const d = decideNext({ agent: 'architect', transitions: TRANSITIONS, verdict: v('architect', 'MAYBE') });
  assert.equal(d, null);
});

test('unmapped *-reviewer falls back to sign-off → senior-dev rule', () => {
  const d = decideNext({ agent: 'pci-reviewer', transitions: TRANSITIONS, verdict: v('pci-reviewer', 'APPROVED') });
  assert.equal(d.kind, 'next');
  assert.match(d.text, /senior-dev/);
});

test('end of chain (l3-support) → done report', () => {
  const d = decideNext({ agent: 'l3-support', transitions: TRANSITIONS, verdict: v('l3-support', 'OK') });
  assert.equal(d.kind, 'done');
});

test('unknown agent → null', () => {
  const d = decideNext({ agent: 'random-agent', transitions: TRANSITIONS, verdict: v('random-agent', 'DONE') });
  assert.equal(d, null);
});

// ─── E2E: spawn the hook in a sandbox project ────────────────────────────

function sandbox({ verdictLines = {}, withPipeline = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-dispatch-'));
  mkdirSync(join(dir, '.great_cto', 'verdicts'), { recursive: true });
  if (withPipeline) {
    mkdirSync(join(dir, 'shared'), { recursive: true });
    writeFileSync(join(dir, 'shared', 'pipeline.toml'), PIPELINE_TOML);
  }
  for (const [agent, line] of Object.entries(verdictLines)) {
    writeFileSync(join(dir, '.great_cto', 'verdicts', `${agent}.log`), line + '\n');
  }
  return dir;
}

function runHook(cwd, subagentType, env = {}) {
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: subagentType } }),
    encoding: 'utf8', cwd,
    env: { ...process.env, GREAT_CTO_DISABLE_DISPATCHER: '', ...env },
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('e2e: fresh success verdict emits additionalContext with PIPELINE-NEXT', () => {
  const now = new Date().toISOString();
  const dir = sandbox({ verdictLines: { architect: `${now} | architect | APPROVED | feature=x | cost=$0.10` } });
  try {
    const r = runHook(dir, 'great_cto-architect');
    assert.equal(r.exit, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(out.hookSpecificOutput.additionalContext, /PIPELINE-NEXT/);
    assert.match(out.hookSpecificOutput.additionalContext, /pm/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: no verdict written → completion reminder', () => {
  const dir = sandbox();
  try {
    const r = runHook(dir, 'architect');
    assert.equal(r.exit, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /no verdict/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: general-purpose agent → silent exit 0', () => {
  const dir = sandbox();
  try {
    const r = runHook(dir, 'general-purpose');
    assert.equal(r.exit, 0);
    assert.equal(r.stdout.trim(), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: no pipeline.toml → silent exit 0 (non-great_cto project)', () => {
  const dir = sandbox({ withPipeline: false });
  try {
    const r = runHook(dir, 'architect');
    assert.equal(r.exit, 0);
    assert.equal(r.stdout.trim(), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: disabled via env → silent exit 0', () => {
  const now = new Date().toISOString();
  const dir = sandbox({ verdictLines: { architect: `${now} | architect | APPROVED | cost=$0` } });
  try {
    const r = runHook(dir, 'architect', { GREAT_CTO_DISABLE_DISPATCHER: '1' });
    assert.equal(r.exit, 0);
    assert.equal(r.stdout.trim(), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: stale verdict (old mtime) → treated as missing', () => {
  const dir = sandbox({ verdictLines: { architect: `2026-01-01T00:00:00Z | architect | APPROVED | cost=$0` } });
  try {
    // Backdate the log file beyond the 30-min freshness window
    const fp = join(dir, '.great_cto', 'verdicts', 'architect.log');
    const old = new Date(Date.now() - 2 * 3600 * 1000);
    spawnSync('touch', ['-t', old.toISOString().replace(/[-:T]/g, '').slice(0, 12), fp]);
    const r = runHook(dir, 'architect');
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /no verdict/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
