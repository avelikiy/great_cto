// Things this repository declares that nothing reads.
//
// `guard-parity` asks whether a guard EXECUTES. This asks whether a declaration
// is CONSUMED, and it covered more of one day's findings than the first
// question did: an agent told to write INCIDENT into a map that had no branch
// for it, eight agents with no edge, a gate that lived in a prompt's prose.
//
// The check found four more the same day it was written, including senior-dev's
// SPEC-OBJECTION — the escape hatch that lets an implementer refuse a bad plan,
// which escaped into silence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  declaredVerdicts, consumedVerdicts, unconsumedVerdicts, unroutedAgents,
  unreachableGates, auditDeclarations, NO_EDGE_BY_DESIGN,
} from '../../scripts/lib/declared-consumed.mjs';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BLOCKED = new Set(['BLOCKED', 'FAIL', 'FAILED', 'REJECTED']);
const sandbox = () => mkdtempSync(join(tmpdir(), 'gcto-decl-'));
const clean = (d) => rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
const agentFile = (dir, name, body) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, `${name}.md`), body); };

// ── Reading what an agent says it will write ────────────────────────────────

test('both verdict forms are read: <A|B> and a bare token', () => {
  const dir = sandbox();
  try {
    agentFile(dir, 'a-agent', 'bash scripts/log-verdict.sh a-agent <OK|INCIDENT> auto');
    agentFile(dir, 'b-agent', 'bash scripts/log-verdict.sh b-agent TASK_DONE auto');
    const d = declaredVerdicts(dir);
    assert.deepEqual([...d.get('a-agent')].sort(), ['INCIDENT', 'OK']);
    assert.deepEqual([...d.get('b-agent')], ['TASK_DONE']);
  } finally { clean(dir); }
});

test('a prompt quoting ANOTHER agent\'s verdict declares nothing about itself', () => {
  // Otherwise every agent that documents an example would inherit its tokens,
  // and the check would report findings that are only quotations.
  const dir = sandbox();
  try {
    agentFile(dir, 'a-agent', 'e.g. scripts/log-verdict.sh other-agent <WEIRD|BLOCKED>\nscripts/log-verdict.sh a-agent DONE');
    assert.deepEqual([...declaredVerdicts(dir).get('a-agent')], ['DONE']);
  } finally { clean(dir); }
});

test('the <VERDICT> placeholder is a shape, not a token', () => {
  const dir = sandbox();
  try {
    agentFile(dir, 'a-agent', 'scripts/log-verdict.sh a-agent <VERDICT> auto');
    assert.equal(declaredVerdicts(dir).has('a-agent'), false);
  } finally { clean(dir); }
});

test('an unreadable agents directory is null, never an empty map', () => {
  assert.equal(declaredVerdicts('/nonexistent/agents'), null);
});

// ── What counts as consumed ─────────────────────────────────────────────────

test('a token in `on`, or in a verdict branch, is consumed', () => {
  const t = { 'a-agent': { on: ['DONE'], next: [] }, 'a-agent.INCIDENT': { on: ['INCIDENT'], next: ['x'] } };
  const c = consumedVerdicts('a-agent', t);
  assert.ok(c.has('DONE') && c.has('INCIDENT'));
});

test('a token that HALTS the chain is consumed — being stopped is a reaction', () => {
  const declared = new Map([['a-agent', new Set(['DONE', 'BLOCKED'])]]);
  const f = unconsumedVerdicts({ declared, transitions: { 'a-agent': { on: ['DONE'] } }, blockedTokens: BLOCKED });
  assert.deepEqual(f, [], 'BLOCKED is handled globally, not per agent');
});

test('a token nothing acts on is reported, and the message says what would fix it', () => {
  const declared = new Map([['a-agent', new Set(['DONE', 'INCIDENT'])]]);
  const f = unconsumedVerdicts({ declared, transitions: { 'a-agent': { on: ['DONE'] } }, blockedTokens: BLOCKED });
  assert.equal(f.length, 1);
  assert.match(f[0].subject, /INCIDENT/);
  assert.match(f[0].why, /transitions\.a-agent\.INCIDENT/, 'names the branch that would consume it');
  assert.match(f[0].why, /silence/, 'and what happens today');
});

test('a *-reviewer with no entry falls back to a real rule, so it is not a finding', () => {
  const declared = new Map([['some-reviewer', new Set(['APPROVED'])]]);
  assert.deepEqual(unconsumedVerdicts({ declared, transitions: {}, blockedTokens: BLOCKED }), []);
});

test('an agent with no rule at all is reported as unrouted, not as N unconsumed tokens', () => {
  // One finding per cause. Listing every token of an unrouted agent would bury
  // the actual problem under its symptoms.
  const declared = new Map([['a-agent', new Set(['DONE', 'READY'])]]);
  assert.deepEqual(unconsumedVerdicts({ declared, transitions: {}, blockedTokens: BLOCKED }), []);
});

// ── Agents without edges ────────────────────────────────────────────────────

test('an agent with no edge is reported unless it has a stated reason', () => {
  const dir = sandbox();
  try {
    agentFile(dir, 'lonely', 'x');
    agentFile(dir, 'excused', 'x');
    const f = unroutedAgents({ agentsDir: dir, transitions: {}, byDesign: [{ agent: 'excused', why: 'stated' }] });
    assert.deepEqual(f.map((x) => x.subject), ['lonely']);
    assert.match(f[0].why, /NO_EDGE_BY_DESIGN/, 'and says how to excuse it deliberately');
  } finally { clean(dir); }
});

test('every by-design exemption carries a reason, not just a name', () => {
  // "It is fine" has to be attributable, or the list becomes things people got
  // used to seeing.
  for (const r of NO_EDGE_BY_DESIGN) {
    assert.ok(r.agent && typeof r.why === 'string' && r.why.length > 20, `${r.agent} needs a real reason`);
  }
});

// ── Gates nothing can activate ──────────────────────────────────────────────

test('a gate declared on an edge that no level activates is reported', () => {
  const f = unreachableGates({
    transitions: { a: { gate: ['gate:ghost'] }, b: { gate: 'gate:ship' } },
    levelGates: new Set(['ship']),
  });
  assert.deepEqual(f.map((x) => x.subject), ['gate:ghost']);
  assert.match(f[0].why, /looks guarded and never pauses/);
});

// ── The repository itself ───────────────────────────────────────────────────

test('this repository has no declaration without a consumer', async () => {
  // The check that keeps the class closed. When this fails, read the finding —
  // it names the declaration and what would have to exist to consume it.
  const r = await auditDeclarations();
  assert.equal(r.state, 'clean', r.findings.map((f) => `${f.kind} ${f.subject}`).join('; '));
});
