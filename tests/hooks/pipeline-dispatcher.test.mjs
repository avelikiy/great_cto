// Tests for scripts/hooks/pipeline-dispatcher.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gatesForApprovalLevel, APPROVAL_LEVELS } from '../../scripts/lib/approval-level.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = resolve(__dirname, '../../scripts/hooks/pipeline-dispatcher.mjs');
const PIPELINE_TOML = readFileSync(resolve(__dirname, '../../shared/pipeline.toml'), 'utf8');

const {
  parsePipelineToml,
  normalizeAgent,
  parseVerdictLine, resolveSkip, agentIdFrom, readLastStop, verdictBelongsToRun,
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

// `costUsd` joined the shape when per-agent budgets arrived. `hasCost` could
// only answer whether anything was recorded; a budget is enforced against the
// AMOUNT, and it must come from the verdict rather than from the board's
// time-based estimate. `null` when absent, never 0 — a stage that recorded no
// cost and a stage that recorded zero cost are different facts.
test('parseVerdictLine handles pipe- and space-separated formats', () => {
  assert.deepEqual(
    parseVerdictLine('2026-07-02T10:00:00Z | architect | APPROVED | feature=x | cost=$0.50'),
    { ts: '2026-07-02T10:00:00Z', agent: 'architect', verdict: 'APPROVED', canonical: false, hasCost: true, costUsd: 0.5, meta: { feature: 'x' } });
  // The space dialect comes in TWO shapes, and this test used to assert only one
  // of them — `<ts> <verdict> <details>`, on the premise that it "never carried
  // an agent (the filename did)".
  //
  // The premise is falsified by logs written today:
  //   2026-08-26T16:59:22Z great_cto:code-reviewer APPROVED web-wallet-foundation
  // Read the old way, that record's VERDICT became `GREAT_CTO:CODE-REVIEWER`. The
  // expected value below was itself an instance of the bug: `qa-engineer PASS`
  // was asserted to produce `verdict: 'QA-ENGINEER'`.
  //
  // The shapes are now told apart by the one fact the line already carries —
  // whether a token is a verdict this system knows. That preserves the old
  // reading wherever the old premise holds (`<ts> DONE …` still parses as before)
  // and corrects it where it does not. When NEITHER position is a known verdict,
  // the original reading stands rather than a second guess.
  assert.deepEqual(
    parseVerdictLine('2026-07-02T10:00:00Z qa-engineer PASS coverage=80%'),
    { ts: '2026-07-02T10:00:00Z', agent: 'qa-engineer', verdict: 'PASS', canonical: false, hasCost: false, costUsd: null, meta: { coverage: '80%' } });
  // The agentless shape is unchanged: `DONE` is a known verdict in position 1.
  assert.deepEqual(
    parseVerdictLine('2026-07-02T10:00:00Z DONE postgres replica: failover wired'),
    { ts: '2026-07-02T10:00:00Z', agent: null, verdict: 'DONE', canonical: false, hasCost: false, costUsd: null, meta: {} });
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

function sandbox({ verdictLines = {}, withPipeline = true, scored = null, scoredRunTs = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gcto-dispatch-'));
  mkdirSync(join(dir, '.great_cto', 'verdicts'), { recursive: true });
  if (withPipeline) {
    mkdirSync(join(dir, 'shared'), { recursive: true });
    writeFileSync(join(dir, 'shared', 'pipeline.toml'), PIPELINE_TOML);
  }
  for (const [agent, line] of Object.entries(verdictLines)) {
    writeFileSync(join(dir, '.great_cto', 'verdicts', `${agent}.log`), line + '\n');
  }
  // Verification is required before a stage dispatches, so a sandbox that means
  // to test DISPATCH has to have been verified — the same order a real run goes
  // through. `scored: null` leaves it unchecked, which is what the gate's own
  // e2e test wants.
  if (scored) {
    writeFileSync(join(dir, '.great_cto', 'scores.jsonl'),
      JSON.stringify({ v: 1, ts: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        agent: scored, name: 'independent-verify', state: 'verified', value: 1,
        scorer: 'mechanical',
        // Pointed at the run being scored. A score with no `run_ts` satisfies
        // only a verdict that itself carries no timestamp — which is the right
        // conservative rule, and means a fixture must say which run it scored.
        ...(scoredRunTs ? { run_ts: scoredRunTs } : {}) }) + '\n');
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
  const dir = sandbox({ verdictLines: { architect: `${now} | architect | APPROVED | feature=x | cost=$0.10` },
                        scored: 'architect', scoredRunTs: now });
  try {
    const r = runHook(dir, 'great_cto-architect');
    assert.equal(r.exit, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(out.hookSpecificOutput.additionalContext, /PIPELINE-NEXT/);
    assert.match(out.hookSpecificOutput.additionalContext, /pm/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: a success verdict with no score does NOT dispatch', () => {
  // The same scenario as the dispatch test above, minus the score. Asserted
  // through the real hook rather than through decideNext, because the gate that
  // matters is the one that runs in the process the host actually spawns.
  const now = new Date().toISOString();
  const dir = sandbox({ verdictLines: { architect: `${now} | architect | APPROVED | feature=x | cost=$0.10` } });
  try {
    const r = runHook(dir, 'great_cto-architect');
    assert.equal(r.exit, 0, 'an unverified stage is not an error — it is a stage that waits');
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /PIPELINE-VERIFY/);
    assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /PIPELINE-NEXT/);
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

test('e2e: a project with no pipeline.toml of its own uses the plugin\'s', () => {
  // This asserted the opposite — "no pipeline.toml → silent exit 0" — and was an
  // accurate description of a defect written as a guarantee. `PIPELINE_PATH`
  // resolved `shared/pipeline.toml` against the working directory, so only a
  // project that happened to contain a copy of the map could chain. Of seventeen
  // registered projects with `.great_cto/`, thirteen had none, and in those the
  // hook exited silently: no dispatch, no verdict, no task, and nothing saying
  // why. Measured by running the real hook in each: 4 dispatched, 13 said
  // nothing. After: 17 of 17.
  //
  // The map is a property of the plugin. A project-local copy still wins, so a
  // project can override the chain deliberately.
  const now = new Date().toISOString();
  const dir = sandbox({ withPipeline: false, verdictLines: { architect: `${now} | architect | APPROVED | cost=$0` } });
  try {
    const r = runHook(dir, 'architect');
    assert.equal(r.exit, 0);
    assert.notEqual(r.stdout.trim(), '', 'the chain must continue without a local copy of the map');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('e2e: a directory that is not a great_cto project stays silent', () => {
  // The other half of the same condition, and still correct: no `.great_cto`
  // means this is not ours to dispatch in.
  const dir = mkdtempSync(join(tmpdir(), 'not-a-project-'));
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
  const dir = sandbox({ scored: 'pci-reviewer' });
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

test('the current write format — versioned JSON — is the canonical one', () => {
  // These two assertions were inverted for one commit. scripts/log-verdict.sh
  // has written versioned JSON since dda79037; the piped form is history.
  const v = parseVerdictLine('{"v":1,"ts":"2026-08-06T10:54:09Z","agent":"architect","verdict":"APPROVED","cost_usd":0}');
  assert.equal(v.agent, 'architect');
  assert.equal(v.verdict, 'APPROVED');
  assert.equal(v.canonical, true);
  assert.equal(v.hasCost, true);
});

test('a legacy piped line still parses, marked legacy rather than broken', () => {
  const v = parseVerdictLine('2026-08-06T10:00:00Z | architect | APPROVED | feature=x | cost=$0.42');
  assert.equal(v.agent, 'architect');
  assert.equal(v.verdict, 'APPROVED');
  assert.equal(v.canonical, false, 'every log written before the schema is in this dialect');
  assert.equal(v.hasCost, true);
});

test('the hook does not keep its own copy of the schema', () => {
  // The stall had one cause: two parsers for one format, and the schema change
  // updated the other one. A second copy will drift again, and the drift shows
  // up as the pipeline being silently wrong rather than as a failing test.
  const src = fs.readFileSync(new URL('../../scripts/hooks/pipeline-dispatcher.mjs', import.meta.url), 'utf8');
  assert.match(src, /from '\.\.\/lib\/verdict-record\.mjs'/,
    'parseVerdictLine must delegate to the module that owns the schema');
});

test('a verdict with no cost is flagged — the dashboard would read zero', () => {
  const d = decideNext({
    agent: 'architect', transitions: TRANSITIONS,
    verdict: parseVerdictLine('{"v":1,"ts":"2026-08-06T10:00:00Z","agent":"architect","verdict":"APPROVED"}'),
    activeGates: ['arch', 'ship'],
  });
  assert.equal(d.kind, 'gate');
  assert.match(d.text, /pm/, 'the pipeline must keep moving');
  assert.match(d.text, /zero spend/);
  assert.match(d.text, /log-verdict\.sh/, 'naming the defect without the fix just stops the agent twice');
});

test('a correct verdict carries no format complaint', () => {
  const d = decideNext({
    agent: 'architect', transitions: TRANSITIONS,
    verdict: parseVerdictLine('{"v":1,"ts":"2026-08-06T10:00:00Z","agent":"architect","verdict":"APPROVED","cost_usd":0.4}'),
    activeGates: ['arch', 'ship'],
  });
  assert.ok(!/NOTE:/.test(d.text), 'an agent that used the helper must not be told it did something wrong');
});

test('garbage and blank lines are unparseable rather than half-parsed', () => {
  // A real verdict directory holds an empty senior-dev.log.
  // The space dialect never carried an agent name — the filename did — so a
  // two-word line parses to a record with an empty agent rather than to null.
  for (const bad of ['', '   ', '\n', '{not json', '{"v":1}']) {
    assert.equal(parseVerdictLine(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseVerdictLine('two words').agent, null, 'the legacy space form has no agent field');
});

test('every verdict line shape found in this repo is readable', () => {
  // Pinned against the shapes that exist rather than the shape assumed: the walk
  // could not have found the live stall because it wrote its own fixture.
  const shapes = [
    '2026-06-27T16:29:38Z | project-auditor | DONE | artefacts=1 | beads_open=8',
    '2026-07-29T10:12:13Z | architect | DONE | project=great_cto | cost=$0',
    '{"v":1,"ts":"2026-08-06T10:54:09Z","agent":"architect","verdict":"APPROVED","cost_usd":0}',
  ];  // two legacy dialects and the current one, all present in this repo today
  for (const s of shapes) {
    const v = parseVerdictLine(s);
    assert.ok(v && v.verdict, `unreadable: ${s.slice(0, 60)}`);
  }
});

// ── an approved gate is not a stopping point ───────────────────────────────

test('an approved gate dispatches instead of asking again', () => {
  const d = decideNext({
    agent: 'architect', transitions: TRANSITIONS,
    verdict: { verdict: 'APPROVED', ts: '2026-08-06T10:00:00Z' },
    activeGates: ['arch', 'ship'],
    gateStates: { 'gate:arch': { state: 'approved' } },
  });
  assert.equal(d.kind, 'next');
  assert.match(d.text, /APPROVED/);
  assert.match(d.text, /subagent_type: pm/, 'the point is that it moves');
});

test('without gate states nothing changes — every gate reads as unapproved', () => {
  // The safe direction: a caller that does not read approval gets the previous
  // behaviour, not an optimistic one.
  const d = decideNext({
    agent: 'architect', transitions: TRANSITIONS,
    verdict: { verdict: 'APPROVED', ts: '2026-08-06T10:00:00Z' },
    activeGates: ['arch', 'ship'],
  });
  assert.equal(d.kind, 'gate');
});

test('a pending, absent or stale gate all still wait', () => {
  for (const state of ['pending', 'absent', 'stale']) {
    const d = decideNext({
      agent: 'architect', transitions: TRANSITIONS,
      verdict: { verdict: 'APPROVED', ts: '2026-08-06T10:00:00Z' },
      activeGates: ['arch'],
      gateStates: { 'gate:arch': { state } },
    });
    assert.equal(d.kind, 'gate', `${state} must not dispatch`);
  }
});

test('on a multi-gate edge one approval is not enough', () => {
  const d = decideNext({
    agent: 'security-officer', transitions: TRANSITIONS,
    verdict: { verdict: 'APPROVED', ts: '2026-08-06T10:00:00Z' },
    joinVerdicts: { 'qa-engineer': { verdict: 'PASS' } },
    activeGates: ['security', 'compliance', 'ship'],
    gateStates: {
      'gate:security': { state: 'approved' },
      'gate:compliance': { state: 'approved' },
      'gate:ship': { state: 'pending' },
    },
  });
  assert.equal(d.kind, 'gate');
  assert.match(d.text, /gate:ship/);
  assert.ok(!/gate:security/.test(d.text), 'an approved gate should not still be asked for');
});

// ── a stage the map says to run, that this run does not need ──────────────
//
// pipeline.toml said `architect -> pm` unconditionally; CLAUDE.md said skip pm
// decomposition below three work streams. On 2026-08-07 the architect itself
// wrote "depth Small, one implementation task" — the decision was already in its
// output, and a human made it again.
//
// The trap: skipping a stage also skips that stage's gate, and `depth` comes
// from a verdict an agent writes. An input from the agent that removes a check
// is the shape that produced three CRITICALs in execution-claims a day earlier.

const withDepth = (depth) => ({ verdict: 'APPROVED', ts: '2026-08-07T10:00:00Z', meta: depth ? { depth } : {} });

test('a declared small depth skips the stage the architect already did', () => {
  const d = decideNext({
    agent: 'architect', transitions: TRANSITIONS, verdict: withDepth('small'),
    activeGates: ['arch', 'ship'], gateStates: { 'gate:arch': { state: 'approved' } },
  });
  assert.match(d.text, /subagent_type: senior-dev/);
  assert.match(d.text, /skipping pm/);
  assert.match(d.text, /no active gate sat on that edge/, 'the reason must be inspectable, not implicit');
});

test('a skip may never remove an ACTIVE gate', () => {
  // At `expert` someone asked to see the plan. A field an agent writes does not
  // overrule that; the approval level decides.
  const d = decideNext({
    agent: 'architect', transitions: TRANSITIONS, verdict: withDepth('small'),
    activeGates: ['product', 'arch', 'plan', 'code', 'qa', 'security', 'ship'],
    gateStates: { 'gate:arch': { state: 'approved' } },
  });
  assert.match(d.text, /subagent_type: pm/);
  assert.ok(!/skipping/.test(d.text));
});

test('no depth declared changes nothing', () => {
  const d = decideNext({
    agent: 'architect', transitions: TRANSITIONS, verdict: withDepth(null),
    activeGates: ['arch', 'ship'], gateStates: { 'gate:arch': { state: 'approved' } },
  });
  assert.match(d.text, /subagent_type: pm/);
});

test('a value that is not the declared one does not skip', () => {
  for (const depth of ['medium', 'large', 'SMALLISH', '']) {
    const d = decideNext({
      agent: 'architect', transitions: TRANSITIONS, verdict: withDepth(depth),
      activeGates: ['arch', 'ship'], gateStates: { 'gate:arch': { state: 'approved' } },
    });
    assert.match(d.text, /subagent_type: pm/, depth);
  }
});

test('the declared value matches case-insensitively, since agents write it by hand', () => {
  const d = decideNext({
    agent: 'architect', transitions: TRANSITIONS, verdict: withDepth('Small'),
    activeGates: ['arch', 'ship'], gateStates: { 'gate:arch': { state: 'approved' } },
  });
  assert.match(d.text, /senior-dev/);
});

test('resolveSkip refuses to fan out and refuses to run away', () => {
  // Only a single-next edge can be skipped — bypassing one branch of a fan-out
  // leaves the pipeline in a state nobody chose. And a chain of skips is bounded.
  const T = {
    a: { next: ['b', 'c'], skip_next_when: 'depth=small' },
    b: { next: ['d'] }, c: { next: ['d'] }, d: { next: ['e'] },
  };
  assert.deepEqual(resolveSkip({ rule: T.a, transitions: T, meta: { depth: 'small' }, activeGates: [] }).skipped, []);

  const loop = { x: { next: ['x'], skip_next_when: 'depth=small' } };
  const r = resolveSkip({ rule: loop.x, transitions: loop, meta: { depth: 'small' }, activeGates: [] });
  assert.ok(r.skipped.length <= 4, 'a self-referential map must terminate');
});

test('a stage with nowhere to go afterwards is not skipped', () => {
  // Skipping the last stage would leave the pipeline with no next at all.
  const T = { a: { next: ['end'], skip_next_when: 'depth=small' }, end: { next: [] } };
  assert.deepEqual(resolveSkip({ rule: T.a, transitions: T, meta: { depth: 'small' }, activeGates: [] }).nexts, ['end']);
});

// ── resuming a cut-off agent, which only the orchestrator can do ──────────
//
// Six of eight agents over two days recorded no verdict; four of those were cut
// off mid-loop. A hook cannot call SendMessage — but PostToolUse runs in the
// ORCHESTRATOR's context, and the orchestrator can. What it lacked was the one
// fact SubagentStop has and it does not: how the subagent stopped.

test('a cut-off agent gets a resume directive naming the agent id', () => {
  const T = { 'senior-dev': { on: ['TASK_DONE'], next: ['code-reviewer'] } };
  const d = decideNext({
    agent: 'senior-dev', transitions: T, verdict: null,
    lastStop: { shape: 'cut-off', turns: 105 }, agentId: 'add5b33cf1e170666',
  });
  assert.equal(d.kind, 'resume');
  assert.match(d.text, /CUT OFF after 105 turns/);
  assert.match(d.text, /SendMessage to: 'add5b33cf1e170666'/, 'a directive without the id is a description, not an action');
  assert.match(d.text, /worktrees/, 'its work may already exist somewhere the main tree cannot see');
  assert.match(d.text, /Do NOT re-run it from scratch/);
});

test('without an id the directive still says what to do', () => {
  const T = { 'senior-dev': { on: ['TASK_DONE'], next: ['code-reviewer'] } };
  const d = decideNext({ agent: 'senior-dev', transitions: T, verdict: null, lastStop: { shape: 'cut-off', turns: 9 } });
  assert.equal(d.kind, 'resume');
  assert.match(d.text, /using the agentId from its result/);
});

test('an agent that finished and forgot is asked to record, not resumed', () => {
  const T = { 'senior-dev': { on: ['TASK_DONE'], next: ['code-reviewer'] } };
  const d = decideNext({ agent: 'senior-dev', transitions: T, verdict: null, lastStop: { shape: 'reported', turns: 40 } });
  assert.equal(d.kind, 'no-verdict');
  assert.ok(!/RESUME/.test(d.text), 'resuming an agent that concluded wastes a turn on a request it already answered');
});

test('no stop record falls back to the generic message', () => {
  const T = { 'senior-dev': { on: ['TASK_DONE'], next: ['code-reviewer'] } };
  assert.equal(decideNext({ agent: 'senior-dev', transitions: T, verdict: null }).kind, 'no-verdict');
});

test('the agent id is pulled out of a real Agent result', () => {
  assert.equal(agentIdFrom({ tool_response: "Done.agentId: add5b33cf1e170666 (use SendMessage with to: 'add5b33cf1e170666')" }), 'add5b33cf1e170666');
  assert.equal(agentIdFrom({ tool_response: { agentId: 'a3210798032f3466e' } }), 'a3210798032f3466e');
  assert.equal(agentIdFrom({}), null);
  assert.equal(agentIdFrom(null), null);
});

test('a stale stop record is worse than none and is ignored', () => {
  // It would prescribe resuming an agent that already finished.
  const fresh = JSON.stringify({ shape: 'cut-off', turns: 5, ts: new Date().toISOString() });
  const old = JSON.stringify({ shape: 'cut-off', turns: 5, ts: '2020-01-01T00:00:00Z' });
  assert.equal(readLastStop('/x', { read: () => fresh })?.shape, 'cut-off');
  assert.equal(readLastStop('/x', { read: () => old }), null);
  assert.equal(readLastStop('/x', { read: () => { throw new Error('none'); } }), null);
  assert.equal(readLastStop('/x', { read: () => '{}' }), null);
});

test('the stop shape is read from the transcript, not only from SubagentStop', () => {
  // The hook that writes .last-stop did not run for the very agent it exists to
  // catch. PostToolUse does fire — the Agent tool returned, and its result
  // carries the agentId — so the shape is read from the transcript on disk and
  // .last-stop is the fallback, not the condition.
  const src = fs.readFileSync(new URL('../../scripts/hooks/pipeline-dispatcher.mjs', import.meta.url), 'utf8');
  assert.match(src, /const shape = stopShapeFor\(agentIdFrom\(payload\)\)/, 'the transcript is read');
  assert.match(src, /lastStop: shape \|\| readLastStop/, 'and .last-stop is only the fallback');
  assert.match(src, /findAgentTranscript/);
});

// ── a verdict from a previous run is not this run's success ───────────────
//
// The freshness window is thirty minutes and says nothing about WHICH run. On
// 2026-08-08 a senior-dev verdict written twenty minutes earlier, for the
// previous task, was read as a cut-off agent's TASK_DONE — and the directive
// said "succeeded, spawn code-reviewer" for a stage that had produced nothing
// but an unlanded worktree.

test('a verdict older than the run does not belong to it', () => {
  const started = Date.parse('2026-08-08T15:23:37Z');
  assert.equal(verdictBelongsToRun({ ts: '2026-08-08T15:20:17Z' }, started), false, 'the real case: three minutes early');
  assert.equal(verdictBelongsToRun({ ts: '2026-08-08T15:25:00Z' }, started), true);
});

test('a verdict written at the very start of the run still counts', () => {
  // A second of slack — the verdict is written during the run, not before it,
  // and clock granularity should not manufacture a mismatch.
  const started = Date.parse('2026-08-08T15:23:37Z');
  assert.equal(verdictBelongsToRun({ ts: '2026-08-08T15:23:36.500Z' }, started), true);
});

test('nothing to contradict the verdict leaves it alone', () => {
  // A false absence only stalls the pipeline; a false success advances it. But
  // inventing a mismatch out of missing data would stall every run.
  assert.equal(verdictBelongsToRun({ ts: '2026-08-08T15:20:00Z' }, null), true);
  assert.equal(verdictBelongsToRun(null, Date.now()), true);
  assert.equal(verdictBelongsToRun({ ts: 'not-a-date' }, Date.now()), true);
  assert.equal(verdictBelongsToRun({}, Date.now()), true);
});

// ── Edges that did not exist, and a verdict nothing listened for ─────────────
//
// Found by walking shared/pipeline.toml against agents/*.md: eight agents were
// reachable only through routing prose in SKILL.md and had no transition here,
// so decideNext named no next stage and the chain stopped after them. The two
// that mattered were auth-engineer and subscription-billing-engineer —
// authentication and money, finishing with nothing routing them onward.

const MAP = parsePipelineToml(PIPELINE_TOML);

test('every contract-stage specialist routes into implementation, not into review', () => {
  // A contract is a document. Pointing these at code-reviewer would review the
  // wrong artefact and skip the implementation the contract exists to direct.
  for (const a of ['auth-engineer', 'subscription-billing-engineer', 'integrations-engineer',
    'connector-builder', 'media-pipeline-engineer', 'geo-routing-engineer']) {
    assert.ok(MAP[a], `${a} has no transition`);
    assert.deepEqual(MAP[a].next, ['senior-dev'], `${a} should hand its contract to senior-dev`);
  }
});

test('auth and billing reach security-officer by following their edges', () => {
  // The whole point of the gap: work that finishes and looks reviewed. Walk it.
  const seen = new Set();
  let frontier = ['auth-engineer', 'subscription-billing-engineer'];
  while (frontier.length) {
    const nxt = [];
    for (const a of frontier) {
      if (seen.has(a)) continue;
      seen.add(a);
      for (const n of (MAP[a]?.next || [])) nxt.push(n);
    }
    frontier = nxt;
  }
  assert.ok(seen.has('code-reviewer'), 'must reach code review');
  assert.ok(seen.has('security-officer'), 'must reach security-officer — this is the gap that existed');
});

test('the mobile builder takes the code path and the e2e sweeper ends at deploy', () => {
  assert.deepEqual(MAP['mobile-app-builder'].next, ['code-reviewer']);
  assert.deepEqual(MAP['e2e-test-engineer'].next, ['devops']);
  assert.ok(MAP['e2e-test-engineer'].on.includes('PASSED'), 'its own prompt writes PASSED, not DONE alone');
});

test('data import is gated, because re-importing destroys work that followed it', () => {
  assert.ok((MAP['migration-import-engineer'].gate || []).includes('gate:import'));
});

test('INCIDENT routes to a fix; OK still ends the chain', () => {
  // l3-support was always instructed to write <OK|INCIDENT>. Nothing matched
  // INCIDENT, and decideNext returns null for an unrecognised token — so
  // production broke, the agent said so in the verdict log, and the dispatcher
  // was SILENT. Not a halt, not a route. Indistinguishable from a quiet night.
  const incident = decideNext({
    agent: 'l3-support', transitions: MAP,
    verdict: { verdict: 'INCIDENT' }, activeGates: [],
  });
  assert.ok(incident, 'an incident must produce a decision, not silence');
  assert.equal(incident.kind, 'next');
  assert.match(incident.text, /senior-dev/);

  const ok = decideNext({
    agent: 'l3-support', transitions: MAP,
    verdict: { verdict: 'OK' }, activeGates: [],
  });
  assert.equal(ok.kind, 'done', 'a quiet night is still the end of the chain');
});

test('a verdict-keyed branch cannot widen anything by accident', () => {
  // Only an exact match routes. A neighbouring token must not fall into the
  // branch — that would turn a typo into a dispatch.
  const other = decideNext({
    agent: 'l3-support', transitions: MAP,
    verdict: { verdict: 'INCIDENTS' }, activeGates: [],
  });
  assert.equal(other, null, 'no branch, no default match → still silent, as before');
});

// ── A cut-off run: what it left behind, stated rather than requested ─────────
//
// The advice used to say "its work may already exist: check for changes it left
// behind" — an instruction only followed when the reader chooses to. It is now
// answered, and answered fail-closed.

const cutOff = { shape: 'cut-off', turns: 12 };

test('a cut-off run that left work behind says so, instead of asking', () => {
  const d = decideNext({
    agent: 'senior-dev', transitions: MAP, verdict: null, lastStop: cutOff,
    effects: { state: 'some', why: 'x', fields: ['wroteArtefacts'] },
  });
  assert.equal(d.kind, 'resume');
  assert.match(d.text, /DID leave work behind \(wroteArtefacts\)/);
  assert.match(d.text, /duplicate/);
  assert.match(d.text, /Do NOT re-run it from scratch/);
});

test('effects that could not be established are stated as "treat it as though it did"', () => {
  const d = decideNext({
    agent: 'senior-dev', transitions: MAP, verdict: null, lastStop: cutOff,
    effects: { state: 'unknown', why: 'x', fields: ['wroteArtefacts', 'recordedVerdict'] },
  });
  assert.match(d.text, /could not be established/);
  assert.match(d.text, /as though it did/, 'fail-closed: missing information never softens the advice');
});

test('a run that left nothing behind still says resume, and says why there is little to keep', () => {
  const d = decideNext({
    agent: 'senior-dev', transitions: MAP, verdict: null, lastStop: cutOff,
    effects: { state: 'none', why: 'x', fields: [] },
  });
  assert.match(d.text, /left nothing behind/);
  assert.match(d.text, /no progress to keep/);
});

test('with no effects supplied at all, the old advice stands rather than a claim', () => {
  // The observation is best-effort in the hook. If it could not run, the message
  // must not assert anything about what happened — it falls back to asking.
  const d = decideNext({ agent: 'senior-dev', transitions: MAP, verdict: null, lastStop: cutOff });
  assert.match(d.text, /may already exist/);
  assert.doesNotMatch(d.text, /DID leave work behind/);
});

// ─── Per-agent budgets ───────────────────────────────────────────────────────
//
// The rule that keeps a limit honest: only MEASURED spend refuses. The board's
// `llm_usd` is time multiplied by a rate constant, and a pipeline halted on that
// would stop real work over arithmetic. Verdicts carry `cost_usd` — what an
// agent reported actually spending — and that is the only number allowed to say
// no.

import { applyAgentBudgets, readAllVerdicts } from '../../scripts/hooks/pipeline-dispatcher.mjs';

const withProject = (projectMd, fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'budget-'));
  try {
    mkdirSync(join(dir, '.great_cto'), { recursive: true });
    writeFileSync(join(dir, '.great_cto', 'PROJECT.md'), projectMd);
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

const BUDGETED = 'phase: x\nagent-budgets:\n  senior-dev: $10\n';

test('an agent over its budget is held, and the reason names the measurement', () => {
  withProject(BUDGETED, (cwd) => {
    const r = applyAgentBudgets(['senior-dev', 'qa-engineer'], {
      cwd, verdicts: [{ agent: 'senior-dev', costUsd: 7 }, { agent: 'senior-dev', costUsd: 5 }],
    });
    assert.deepEqual(r.allowed, ['qa-engineer'], 'only the over-budget stage is held');
    assert.equal(r.held.length, 1);
    assert.match(r.held[0].why, /12\.00 of its \$10/, 'spend is summed across that agent\'s verdicts');
    assert.match(r.held[0].why, /measured from verdicts/);
  });
});

test('an agent under its budget dispatches', () => {
  withProject(BUDGETED, (cwd) => {
    const r = applyAgentBudgets(['senior-dev'], { cwd, verdicts: [{ agent: 'senior-dev', costUsd: 3 }] });
    assert.deepEqual(r.allowed, ['senior-dev']);
    assert.deepEqual(r.held, []);
  });
});

test('no verdict cost data never refuses, however long the agent ran', () => {
  // This is the whole point. Without `cost_usd` there is no measurement, and an
  // unmeasured budget must not stop a pipeline.
  withProject(BUDGETED, (cwd) => {
    const r = applyAgentBudgets(['senior-dev'], { cwd, verdicts: [{ agent: 'senior-dev', costUsd: null }] });
    assert.deepEqual(r.allowed, ['senior-dev']);
    assert.deepEqual(r.held, []);
  });
});

test('an unreadable PROJECT.md is not an exceeded budget', () => {
  const r = applyAgentBudgets(['senior-dev'], { cwd: '/nowhere-at-all', verdicts: [{ agent: 'senior-dev', costUsd: 999 }] });
  assert.deepEqual(r.allowed, ['senior-dev'], 'a budget we could not read did not stop anything');
});

test('a project with no agent-budgets block behaves as before the feature', () => {
  withProject('phase: x\nmonthly-budget: $500\n', (cwd) => {
    const r = applyAgentBudgets(['senior-dev'], { cwd, verdicts: [{ agent: 'senior-dev', costUsd: 999 }] });
    assert.deepEqual(r.allowed, ['senior-dev']);
  });
});

test('every next stage over budget is a STOP, not a silent success', () => {
  // A pipeline that reports "succeeded, spawn nothing" reads exactly like one
  // that finished. Being held for money has to look different from being done.
  withProject(BUDGETED, (cwd) => {
    // pm's only next stage is senior-dev, and senior-dev is over its $10 cap.
    // `PLAN_READY` because that is what the map accepts from pm — a verdict it
    // does not recognise returns null, and the assertion would pass vacuously.
    const d = decideNext({
      agent: 'pm', transitions: TRANSITIONS, verdict: v('pm', 'PLAN_READY'),
      cwd, allVerdicts: [{ agent: 'senior-dev', costUsd: 99 }],
    });
    assert.ok(d, 'the map recognises this verdict');
    assert.equal(d.kind, 'blocked');
    assert.match(d.text, /PIPELINE-STOP/);
    assert.match(d.text, /over its declared budget/);
    assert.match(d.text, /Nothing was dispatched/);
    assert.match(d.text, /agent-budgets:/, 'and says where to change it');
  });
});

test('the real hook consumes the budget — the parameters are actually passed', () => {
  // This shipped wired-but-dead once. `decideNext` gained `cwd`/`allVerdicts`,
  // the unit tests passed them, and `main()` did not — so `applyAgentBudgets`
  // was never reached and every budget in every project read as allowed. The
  // unit tests could not see it, because they were the only caller supplying
  // the arguments.
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),
    '../../scripts/hooks/pipeline-dispatcher.mjs'), 'utf8');
  const call = src.match(/const decision = decideNext\(\{[\s\S]*?\}\);/)?.[0];
  assert.ok(call, 'located the production call');
  assert.match(call, /cwd:/, 'main() must pass the project directory');
  assert.match(call, /allVerdicts/, 'and the verdicts the budget is measured from');
});

test('readAllVerdicts sums a spend spread over several records', () => {
  // A cap is spend-to-date. `latestVerdict` answers "what did this agent just
  // say", which is a different question and the wrong one here.
  const dir = mkdtempSync(join(tmpdir(), 'verd-'));
  try {
    const ts = new Date().toISOString();
    writeFileSync(join(dir, 'senior-dev.log'),
      `{"v":1,"ts":"${ts}","agent":"senior-dev","verdict":"DONE","cost_usd":7}\n`
      + `{"v":1,"ts":"${ts}","agent":"senior-dev","verdict":"DONE","cost_usd":5}\n`
      + 'not a verdict at all\n');
    const all = readAllVerdicts(dir);
    const total = all.filter((v) => v.agent === 'senior-dev').reduce((s, v) => s + (v.costUsd || 0), 0);
    assert.equal(total, 12, 'both records counted, the unparseable line contributes nothing');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unreadable verdict directory is no spend, not a crash', () => {
  assert.deepEqual(readAllVerdicts('/nowhere-at-all'), []);
});

test('the pipeline map comes from the plugin, not from each project', () => {
  // `PIPELINE_PATH` was `shared/pipeline.toml` resolved against the CURRENT
  // WORKING DIRECTORY — the project being worked in. Only a project that
  // happened to contain a copy of the map could chain, and of seventeen
  // registered projects with `.great_cto/`, thirteen had none. In those the hook
  // hit its `if (!existsSync(PIPELINE_PATH)) return process.exit(0)` and exited
  // silently: no dispatch, no verdict, no task, nothing anywhere saying why.
  //
  // The pipeline was installed, wired, and incapable of running in 13 of 17
  // projects. Measured by running the real hook in each one: 4 dispatched, 13
  // said nothing. After: 17 of 17.
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),
    '../../scripts/hooks/pipeline-dispatcher.mjs'), 'utf8');
  assert.match(src, /PLUGIN_PIPELINE = join\(dirname\(fileURLToPath\(import\.meta\.url\)\)/,
    'resolved from this file, so it works wherever the hook is invoked');
  assert.match(src, /existsSync\(LOCAL_PIPELINE\) \? LOCAL_PIPELINE : PLUGIN_PIPELINE/,
    'a project may still override the chain deliberately');
});

test('the map the plugin ships is actually there', () => {
  // The fallback is only a fallback if the file it names exists — a path
  // computed correctly to somewhere empty is the same silent exit with extra
  // steps.
  const here = dirname(fileURLToPath(import.meta.url));
  const shipped = resolve(here, '../../shared/pipeline.toml');
  assert.ok(existsSync(shipped), `no pipeline map at ${shipped}`);
  const transitions = parsePipelineToml(readFileSync(shipped, 'utf8'));
  assert.ok(Object.keys(transitions).length > 5, 'and it parses into real transitions');
});
