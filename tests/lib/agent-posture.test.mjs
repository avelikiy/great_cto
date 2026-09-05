// A `tools:` line answers "which tools", and ADR-009 asks "how expensive is this
// to undo". Reviewing the first never answered the second, and the gap had a
// shape: `Bash(node:*)` reads as a restriction and is `node -e '<anything>'`.
// Twenty-eight of seventy agents advertised a scoped shell and held a full one —
// almost all of them the *-reviewer agents, whose whole job is to be the careful
// one. Forty-four of those grants were never used by the agent holding them.
//
// What is asserted here is the vocabulary and the ratchet that keeps it honest:
// a tool the table has never heard of is `unknown`, never harmless, and a grant
// that is a shell under another name must be written down with a reason.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from '../../scripts/lib/gate-reversibility.mjs';
import {
  POSTURES, postureOf, postureOfTool, splitTools, describePosture, knownPostures,
} from '../../scripts/lib/agent-posture.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const AGENTS = path.join(ROOT, 'agents');

function agentGrants() {
  const out = [];
  for (const f of readdirSync(AGENTS).filter((x) => x.endsWith('.md')).sort()) {
    const src = readFileSync(path.join(AGENTS, f), 'utf8');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
    if (!fm) continue;
    const line = /^tools:[ \t]*(.*)$/m.exec(fm[1]);
    if (!line) continue;
    out.push({ agent: f.replace(/\.md$/, ''), tools: line[1], body: src.slice(fm[0].length) });
  }
  return out;
}

// Grants that scope to a command name but not to a capability, and that the
// agent holding them actually uses. A ratchet: it may shrink.
//
// A narrower grant does not exist for any of these — Claude Code's permission
// syntax scopes to the executable, and the executable is an interpreter. So the
// entry is not an excuse, it is the record of a decision someone can revisit
// when a narrower form becomes available.
const FULL_SHELL_AND_USED = {
  'architect Bash(find:*)': 'walks the tree in architect-codebase-map.sh',
  'architect Bash(node:*)': 'runs the repo\'s own scripts/architect-*.mjs helpers',
  'architect Bash(awk:*)': 'parses those helpers\' output',
  'architect Bash(xargs:*)': 'feeds the file list from find into the map builder',
  'continuous-learner Bash(node:*)': 'runs scripts/lib/memory-search.mjs to rank past sessions',
  'design-advisor Bash(find:*)': 'locates existing design docs before proposing a system',
  'edtech-reviewer Bash(node:*)': 'runs the report preflight validator on its own threat model',
  'healthcare-reviewer Bash(node:*)': 'runs the report preflight validator on its own threat model',
  'knowledge-extractor Bash(find:*)': 'walks .great_cto/logs to cluster patterns',
  'legal-reviewer Bash(node:*)': 'runs the report preflight validator on its own threat model',
  'product-owner Bash(node:*)': 'runs the multi-LLM debate helper',
  'rcm-reviewer Bash(node:*)': 'runs the report preflight validator on its own threat model',
  'tax-reviewer Bash(node:*)': 'runs the report preflight validator on its own threat model',
};

test('every tool any agent is granted is classified', () => {
  // The property that keeps the table from rotting the way the agent count did.
  // A new MCP server on an agent's line fails here rather than silently reading
  // as no capability at all.
  const unknown = [];
  for (const { agent, tools } of agentGrants()) {
    const r = postureOf(tools);
    for (const t of r.unknownTools) unknown.push(`${agent}: ${t}`);
  }
  assert.deepEqual(unknown, [],
    'unclassified grant(s) — add them to scripts/lib/agent-posture.mjs with the postures they confer');
});

test('a tool the table has never heard of is unknown, not harmless', () => {
  const r = postureOfTool('mcp__something__new');
  assert.equal(r.unknown, true);
  assert.deepEqual(r.postures, []);
  assert.match(r.why, /not in the table/);
  // And it must not vanish into "no capability" at the line level.
  assert.deepEqual(postureOf('Read, mcp__something__new').unknownTools, ['mcp__something__new']);
  assert.match(describePosture(postureOf('Read, mcp__something__new')), /NOT CLASSIFIED/);
});

test('an unrecognised Bash scope is unknown, not narrow', () => {
  const r = postureOfTool('Bash(kubectl:*)');
  assert.equal(r.unknown, true);
  assert.equal(r.fullShell, false);
  assert.match(r.why, /treat as unjudged, not as narrow/);
});

test('an interpreter scoped by name is reported as the full shell it is', () => {
  for (const t of ['Bash(node:*)', 'Bash(python3:*)', 'Bash(xargs:*)', 'Bash(find:*)', 'Bash(awk:*)']) {
    const r = postureOfTool(t);
    assert.equal(r.fullShell, true, `${t} is a full shell`);
    assert.ok(r.postures.includes('code.destructive'), `${t} confers code.destructive`);
    assert.ok(r.why.length > 10, `${t} says why`);
  }
  // `Bash` itself is a full shell too, but it is honest about it — so it is not
  // reported as scoped-in-name-only. The distinction is the whole point.
  assert.deepEqual(postureOf('Bash').scopedInNameOnly, []);
  assert.deepEqual(postureOf('Bash(node:*)').scopedInNameOnly, ['Bash(node:*)']);
});

test('a grant that is a shell under another name is written down with a reason', () => {
  const offenders = [];
  for (const { agent, tools } of agentGrants()) {
    for (const tok of postureOf(tools).scopedInNameOnly) {
      const key = `${agent} ${tok}`;
      if (!(key in FULL_SHELL_AND_USED)) offenders.push(key);
    }
  }
  assert.deepEqual(offenders, [],
    'these read as a scoped shell and are a full one. Either drop the grant (Glob/Grep cover most of what '
    + 'find and awk were used for), or add it to FULL_SHELL_AND_USED here with the reason it is needed.');
});

test('every exemption names an agent that still holds that grant', () => {
  // An exemption that outlives its grant is a hole nobody can see: the line
  // stays, and a future agent at that name inherits a pass it never earned.
  const held = new Set();
  for (const { agent, tools } of agentGrants()) {
    for (const tok of postureOf(tools).scopedInNameOnly) held.add(`${agent} ${tok}`);
  }
  for (const key of Object.keys(FULL_SHELL_AND_USED)) {
    assert.ok(held.has(key), `stale exemption — the grant is gone, drop the entry: ${key}`);
  }
});

test('every exemption claims a use the agent body actually makes', () => {
  // The reason a grant is kept is "the agent uses it". That claim is checkable,
  // so it is checked — an exemption whose command never appears in the body is
  // an unused full shell wearing a justification.
  const bodies = new Map(agentGrants().map((g) => [g.agent, g.body]));
  for (const key of Object.keys(FULL_SHELL_AND_USED)) {
    const [agent, tok] = [key.slice(0, key.indexOf(' ')), key.slice(key.indexOf(' ') + 1)];
    const cmd = /Bash\(([^:)]+)/.exec(tok)[1];
    const body = bodies.get(agent);
    assert.ok(body, `exemption names an agent that does not exist: ${agent}`);
    const uses = (body.match(new RegExp(`(?<![\\w/.-])${cmd}(?![\\w-])`, 'g')) || []).length;
    assert.ok(uses > 0, `${key} is exempted as "used" but ${cmd} appears nowhere in the body — drop the grant`);
  }
});

test('every posture cites a cost category that exists', () => {
  // Shared with gate-reversibility.mjs on purpose: one vocabulary for the
  // cost-of-undo axis, not two that drift.
  for (const [name, p] of Object.entries(POSTURES)) {
    if (p.category === null) continue;
    assert.ok(CATEGORIES[p.category], `${name} cites unknown category '${p.category}'`);
  }
  assert.ok(knownPostures().includes('credential.read'));
});

test('reading a file and reaching the network is reported as both', () => {
  const r = postureOf('Bash(cat:*), WebFetch');
  assert.ok(r.postures.includes('credential.read'), 'cat can read secrets.env');
  assert.ok(r.postures.includes('communication.external.send'), 'a URL is a channel');
  assert.ok(r.expensive.includes('credential.read'));
});

test('a grant of nothing is not a grant of everything', () => {
  for (const empty of [undefined, null, '', '   ']) {
    const r = postureOf(empty);
    assert.deepEqual(r.postures, []);
    assert.deepEqual(r.expensive, []);
    assert.equal(describePosture(r), 'no tools granted');
  }
  assert.deepEqual(splitTools('Read, Bash(git:*), Write'), ['Read', 'Bash(git:*)', 'Write']);
});

test('the reviewer surface attaches it — a classifier nothing consults is not a classifier', () => {
  const cmd = readFileSync(path.join(ROOT, 'commands/agent-review.md'), 'utf8');
  assert.match(cmd, /agent-posture\.mjs/, '/agent-review prints the grant it is reviewing');
});
