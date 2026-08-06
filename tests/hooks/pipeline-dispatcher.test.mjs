// Tests for scripts/hooks/pipeline-dispatcher.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gatesForApprovalLevel, APPROVAL_LEVELS } from '../../scripts/lib/approval-level.mjs';

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
    { ts: '2026-07-02T10:00:00Z', agent: 'architect', verdict: 'APPROVED', canonical: true, hasCost: true });
  assert.deepEqual(
    parseVerdictLine('2026-07-02T10:00:00Z qa-engineer PASS coverage=80%'),
    { ts: '2026-07-02T10:00:00Z', agent: 'qa-engineer', verdict: 'PASS', canonical: true, hasCost: false });
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
  // code-reviewer → qa+security is the ungated edge; senior-dev is behind
  // gate:code, which only some approval levels activate.
  const d = decideNext({ agent: 'code-reviewer', transitions: TRANSITIONS, verdict: v('code-reviewer', 'APPROVED') });
  assert.equal(d.kind, 'next');
  assert.match(d.text, /qa-engineer/);
  assert.match(d.text, /security-officer/);
});

test('an edge guarded by several gates waits for every ACTIVE one', () => {
  // security-officer → devops is guarded by security + compliance + ship. A
  // regulated archetype activates all three; approving one is not approving the
  // edge, and a directive naming only the first would read as if it were.
  const d = decideNext({
    agent: 'security-officer', transitions: TRANSITIONS,
    verdict: v('security-officer', 'APPROVED'),
    joinVerdicts: { 'qa-engineer': v('qa-engineer', 'PASS') },
    activeGates: ['security', 'compliance', 'ship'],
  });
  assert.equal(d.kind, 'gate');
  for (const g of ['gate:security', 'gate:compliance', 'gate:ship']) assert.match(d.text, new RegExp(g));
  assert.match(d.text, /EVERY one of them must be approved/);
});

test('a multi-gate edge honours only the gates the level activates', () => {
  const d = decideNext({
    agent: 'security-officer', transitions: TRANSITIONS,
    verdict: v('security-officer', 'APPROVED'),
    joinVerdicts: { 'qa-engineer': v('qa-engineer', 'PASS') },
    activeGates: ['arch', 'ship'],           // gates-only
  });
  assert.equal(d.kind, 'gate');
  assert.match(d.text, /gate:ship/);
  assert.ok(!/gate:compliance/.test(d.text), 'a gate the CTO switched off must not be presented as pending');
});

// ── every configured gate must exist on the map ─────────────────────────────
//
// approval-level offers seven gates; the map declared four. `strict` promised a
// code gate that never fired, `expert` and `step-by-step` promised three, and a
// regulated archetype's security + compliance floor — the one the level table
// calls a floor precisely so it cannot be bypassed by omission — was bypassed by
// omission here instead. Nothing failed; the pause simply never came.

test('every gate any approval level can demand is declared in pipeline.toml', () => {
  const toml = PIPELINE_TOML;
  const declared = new Set([...toml.matchAll(/gate:([a-z]+)/g)].map((m) => m[1]));
  for (const level of APPROVAL_LEVELS) {
    for (const g of gatesForApprovalLevel(level)) {
      assert.ok(declared.has(g),
        `approval-level '${level}' demands gate:${g}, which no transition declares — the level promises a pause the pipeline cannot deliver`);
    }
  }
});

test('the regulated floor is declared, not merely required', () => {
  const toml = PIPELINE_TOML;
  const declared = new Set([...toml.matchAll(/gate:([a-z]+)/g)].map((m) => m[1]));
  for (const g of gatesForApprovalLevel('gates-only', { archetype: 'fintech' })) {
    assert.ok(declared.has(g), `a fintech project is told gate:${g} applies; no transition declares it`);
  }
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

// ─── HANDOFF fallback (archetype-review-base) ────────────────────────────

const { parseHandoffVerdict } = await import(HOOK);

test('parseHandoffVerdict reads signed-off as APPROVED', () => {
  const tm = `# TM-pay — pci-reviewer\n...\n<!-- HANDOFF -->\npci-reviewer-verdict: signed-off\ncritical-findings: 0\n`;
  assert.deepEqual(parseHandoffVerdict(tm, 'pci-reviewer'),
    { ts: '', agent: 'pci-reviewer', verdict: 'APPROVED' });
});

test('parseHandoffVerdict reads blocked as BLOCKED', () => {
  const tm = `<!-- HANDOFF -->\ngdpr-reviewer-verdict: blocked\n`;
  assert.deepEqual(parseHandoffVerdict(tm, 'gdpr-reviewer').verdict, 'BLOCKED');
});

test('parseHandoffVerdict takes the LAST block on a shared multi-reviewer TM', () => {
  const tm = `<!-- HANDOFF -->\npci-reviewer-verdict: blocked\n\n## api-platform findings\n<!-- HANDOFF -->\napi-platform-reviewer-verdict: signed-off\n`;
  assert.equal(parseHandoffVerdict(tm, 'api-platform-reviewer').verdict, 'APPROVED');
  assert.equal(parseHandoffVerdict(tm, 'pci-reviewer').verdict, 'BLOCKED');
});

test('parseHandoffVerdict returns null without a HANDOFF block', () => {
  assert.equal(parseHandoffVerdict('# TM — no handoff here', 'pci-reviewer'), null);
});

test('e2e: reviewer with HANDOFF but no verdict log still dispatches', () => {
  const now = new Date().toISOString();
  const dir = sandbox();
  try {
    mkdirSync(join(dir, 'docs', 'sec-threats'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'sec-threats', 'TM-pay.md'),
      `# TM-pay — pci-reviewer\n<!-- HANDOFF -->\npci-reviewer-verdict: signed-off\n`);
    const r = runHook(dir, 'great_cto-pci-reviewer');
    assert.equal(r.exit, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /PIPELINE-NEXT/);
    assert.match(out.hookSpecificOutput.additionalContext, /senior-dev/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── the map declares a gate; the approval level decides if it stops anyone ──
//
// pipeline.toml says pm sits behind gate:arch. Under `product-only` the
// architect deliberately never creates that gate — the CTO delegated the
// technical decision. If the dispatcher kept announcing it, the orchestrator
// would sit forever waiting on a Beads task nobody will ever write. Found while
// verifying the automatic pipeline end-to-end, not by reading the code.

const ARCH_RULE = { architect: { on: ['DONE'], gate: 'gate:arch', next: ['pm'] } };
const archDecision = (activeGates) => decideNext({
  agent: 'architect', transitions: ARCH_RULE,
  verdict: { verdict: 'DONE' }, joinVerdicts: {}, activeGates,
});

test('an inactive gate does not stall the pipeline — it hands off with the reason', () => {
  const d = archDecision(['product', 'ship']);          // product-only
  assert.equal(d.kind, 'next', 'must not wait on a gate nobody will create');
  assert.match(d.text, /spawn/);
  assert.match(d.text, /pm/);
  assert.match(d.text, /not wait/i, 'and says why, so the orchestrator does not re-derive it');
});

test('an active gate still stops the pipeline', () => {
  assert.equal(archDecision(['arch', 'ship']).kind, 'gate');   // gates-only
});

test('no policy supplied means honour every gate in the map', () => {
  assert.equal(archDecision(null).kind, 'gate', 'absence of policy must never read as "no gates"');
  assert.equal(decideNext({
    agent: 'architect', transitions: ARCH_RULE,
    verdict: { verdict: 'DONE' }, joinVerdicts: {},
  }).kind, 'gate', 'omitting the argument entirely behaves the same');
});

test('gate names match with or without the gate: prefix', () => {
  assert.equal(archDecision(['gate:arch']).kind, 'gate');
  assert.equal(archDecision(['arch']).kind, 'gate');
});

test('a regulated floor keeps the ship gate even under a light level', () => {
  const rule = { 'security-officer': { on: ['APPROVED', 'DONE'], gate: 'gate:ship', next: ['devops'] } };
  const d = decideNext({
    agent: 'security-officer', transitions: rule, verdict: { verdict: 'APPROVED' },
    joinVerdicts: {}, activeGates: gatesForApprovalLevel('product-only', { archetype: 'fintech' }),
  });
  assert.equal(d.kind, 'gate', 'ship is expensive to undo — no level opts out of it');
});

// ── verdict formats that occur, not the ones the fixture invented ───────────
//
// The mechanical walk of all nine stages reported no silent gaps. It wrote
// pipe-separated verdicts, because that is the canonical format and what the
// fixture assumed. The first LIVE run stalled at the first transition: architect
// finished correctly — ARCH doc, ADR, Beads tasks, gate — and wrote
// {"v":1,"agent":"architect","verdict":"APPROVED",...} instead. The dispatcher
// reported "no verdict recorded" and named no next stage, while the agent
// believed it had succeeded.

test('the canonical line parses and is marked canonical', () => {
  const v = parseVerdictLine('2026-08-06T10:00:00Z | architect | APPROVED | feature=x | cost=$0.42');
  assert.equal(v.agent, 'architect');
  assert.equal(v.verdict, 'APPROVED');
  assert.equal(v.canonical, true);
  assert.equal(v.hasCost, true);
});

test('the JSON line an agent actually wrote parses, and is marked non-canonical', () => {
  const v = parseVerdictLine('{"v":1,"ts":"2026-08-06T10:54:09Z","agent":"architect","verdict":"APPROVED","cost_usd":0}');
  assert.equal(v.agent, 'architect');
  assert.equal(v.verdict, 'APPROVED');
  assert.equal(v.canonical, false, 'tolerating it silently would hide the defect and leave /api/cost at zero');
  assert.equal(v.hasCost, true);
});

test('a non-canonical verdict still names the next stage, and says the format was wrong', () => {
  // Refusing to parse is defensible and leaves the pipeline dead.
  const d = decideNext({
    agent: 'architect', transitions: TRANSITIONS,
    verdict: parseVerdictLine('{"agent":"architect","verdict":"APPROVED"}'),
    activeGates: ['arch', 'ship'],
  });
  assert.equal(d.kind, 'gate');
  assert.match(d.text, /pm/, 'the pipeline must keep moving');
  assert.match(d.text, /non-canonical/);
  assert.match(d.text, /log-verdict\.sh/, 'the fix has to be actionable, not just named');
  assert.match(d.text, /zero spend/, 'a JSON verdict with no cost silently zeroes the dashboard');
});

test('garbage and blank lines are unparseable rather than half-parsed', () => {
  // A real verdict directory holds an empty senior-dev.log.
  for (const bad of ['', '   ', '\n', '{not json', '{"v":1}', 'two words']) {
    assert.equal(parseVerdictLine(bad), null, JSON.stringify(bad));
  }
});

test('every verdict line shape found in this repo is readable', () => {
  // Pinned against the shapes that exist rather than the shape assumed: the walk
  // could not have found the live stall because it wrote its own fixture.
  const shapes = [
    '2026-06-27T16:29:38Z | project-auditor | DONE | artefacts=1 | beads_open=8',
    '2026-07-29T10:12:13Z | architect | DONE | project=great_cto | cost=$0',
    '{"v":1,"ts":"2026-08-06T10:54:09Z","agent":"architect","verdict":"APPROVED","cost_usd":0}',
  ];
  for (const s of shapes) {
    const v = parseVerdictLine(s);
    assert.ok(v && v.verdict, `unreadable: ${s.slice(0, 60)}`);
  }
});
