// Three files in this repository carried frontmatter that a strict YAML parser
// refused, and nothing said so. `claude plugin validate` — the same check the
// plugin-directory review pipeline runs — reported it for the two skills in the
// only words that matter:
//
//   "At runtime this skill loads with empty metadata (all frontmatter fields
//    silently dropped)."
//
// Not a warning about style. The skill's own description, when_to_use, effort
// and paths were gone, and the file still looked like a skill. The third file,
// agents/quant-researcher.md, the plugin validator did not report at all; a
// strict parse found it, and it would have dropped 15 keys including `model`,
// `tools` and `timeout`. Claude Code's own frontmatter reader is lenient enough
// that this agent did load — which is exactly why it survived: the defect is
// invisible to the tool you use every day and fatal to the tool that reviews you.
//
// One cause in all three: an unquoted value containing a colon-and-space.
//
//   description: ... a CRUD app with a currency symbol: a balance is a claim ...
//                                                     ^^ YAML starts a nested map here
//
// A prose description is the natural place to write "RESEARCH ONLY: it never
// places an order", so this recurs on its own. The check below is the YAML rule
// itself, not a spelling of it: a plain scalar may not contain ": ", may not end
// in ":", and an unquoted " #" begins a comment that silently truncates the rest.
//
// Dependency-free on purpose — this repository ships no YAML parser, and a guard
// that needs an install is a guard that gets skipped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Prompt fragments (included by reference, never selected as agents) have no
// frontmatter by design, and live in shared/agent-fragments/ — outside agents/, because
// `claude plugin validate` treats every .md under agents/ as an agent. So nothing
// scanned here is allowed to lack frontmatter: a real agent that loses its
// frontmatter has nowhere to hide.

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

function subjects() {
  return [
    ...walk(path.join(REPO, 'skills')).filter((p) => path.basename(p) === 'SKILL.md'),
    ...walk(path.join(REPO, 'agents')),
  ].map((p) => path.relative(REPO, p));
}

// Returns { state, faults } where state is 'ok' | 'broken' | 'absent'.
// Three states: 'absent' is a fragment or a stripped agent, and only the caller
// knows which — it is never silently folded into 'ok'.
export function inspectFrontmatter(text) {
  if (!text.startsWith('---')) return { state: 'absent', faults: [] };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { state: 'broken', faults: ['no closing --- delimiter'] };

  const faults = [];
  for (const [n, line] of text.slice(3, end).split('\n').entries()) {
    // Only column-0 lines are top-level keys. Block-scalar bodies and nested
    // maps are indented, so this skips them without parsing them.
    const m = /^([A-Za-z][\w-]*):(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim();
    if (!value) continue;
    if (/^[|>'"[{&*!]/.test(value)) continue; // quoted, block, flow, or tagged — YAML's own escapes

    const at = `${key} (line ${n + 1})`;
    if (value.includes(': ')) faults.push(`${at}: unquoted ": " starts a nested mapping`);
    else if (value.endsWith(':')) faults.push(`${at}: unquoted trailing ":" starts a nested mapping`);
    if (/\s#/.test(value)) faults.push(`${at}: unquoted " #" starts a comment and truncates the value`);
  }
  return { state: faults.length ? 'broken' : 'ok', faults };
}

test('every skill and agent frontmatter survives a strict YAML parse', () => {
  const broken = [];
  for (const rel of subjects()) {
    const { state, faults } = inspectFrontmatter(readFileSync(path.join(REPO, rel), 'utf8'));
    if (state === 'broken') broken.push(`${rel}\n    ${faults.join('\n    ')}`);
  }
  assert.equal(
    broken.length, 0,
    `frontmatter that a strict parser drops (the file still loads, its metadata does not):\n  ${broken.join('\n  ')}`,
  );
});

test('no agent has lost its frontmatter — fragments live outside agents/', () => {
  const absent = subjects().filter(
    (rel) => inspectFrontmatter(readFileSync(path.join(REPO, rel), 'utf8')).state === 'absent',
  );
  assert.deepEqual(absent, [], 'a file under agents/ or skills/ without frontmatter: restore it, or if it is a prompt fragment move it to shared/agent-fragments/');
});

// The guard has to fail on the exact text that got through. These are the three
// real values, before they were quoted.
test('the check fails on the values that actually shipped', () => {
  const shipped = [
    'description: Domain-knowledge pack for money on a phone. A CRUD app with a currency symbol: a balance is a claim.',
    'description: The methods a result has to survive. Nothing explained how to satisfy them: a rule without a method fails.',
    'description: Quantitative research agent. RESEARCH ONLY: it never places an order.',
  ];
  for (const line of shipped) {
    const r = inspectFrontmatter(`---\n${line}\n---\nbody\n`);
    assert.equal(r.state, 'broken', `should have been caught: ${line.slice(0, 60)}…`);
  }
  // …and passes once quoted, which is the fix that was applied.
  for (const line of shipped) {
    const [k, ...rest] = line.split(': ');
    const quoted = `${k}: '${rest.join(': ')}'`;
    assert.equal(inspectFrontmatter(`---\n${quoted}\n---\nbody\n`).state, 'ok', quoted);
  }
});
