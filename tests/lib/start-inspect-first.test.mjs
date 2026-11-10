// /start reads the repository before it asks the operator anything.
//
// Without this step the new-project path asks four questions (mode, team size,
// cost cap, geography) of someone whose package.json, lockfile and git history
// already answer part of them, and the audit path asks audience and compliance
// questions the README may have answered. An operator who has to type what the
// repository says learns that the tool did not look.
//
// These pin the text the agent follows, the way command-subcommands-d.test.mjs
// pins the routing: where the step sits (before any question), what it reads,
// what it pre-fills, what it still asks, and how it closes. They do not run
// /start. A green result means the instruction is present and ordered; whether
// a model follows it is an eval question.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const start = readFileSync(join(ROOT, 'commands/start.md'), 'utf8');
const TITLE = '## Inspect first, ask second';

/** Text from `heading` up to the next heading of the same or higher level. */
function between(text, heading) {
  const at = text.indexOf(`\n${heading}`);
  assert.ok(at >= 0, `"${heading}" present`);
  const level = heading.match(/^#+/)[0].length;
  const rest = text.slice(at + heading.length + 1);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return rest.slice(0, next < 0 ? undefined : next);
}
// Whitespace-folded: where a line wraps in the file is not part of what is pinned.
const step = () => between(start, TITLE).replace(/\s+/g, ' ');

test('the inspect-first step exists and comes before every question /start can ask', () => {
  const at = start.indexOf(`\n${TITLE}`);
  assert.ok(at >= 0, `start.md has "${TITLE}"`);
  for (const later of ['## Guard: no description', '## Phase 0: Discovery', '### Step 2.5', '## Path: audit']) {
    const i = start.indexOf(`\n${later}`);
    assert.ok(i > at, `"${later}" comes after the inspect step`);
  }
  // After the route, which decides whether setup runs at all: an existing
  // configured project never reaches this step.
  assert.ok(at > start.indexOf('\n## Resolve the target and current project'), 'after the route');
});

test('it reads the files that answer stack, verify command and deploy surface', () => {
  const s = step();
  const sources = {
    'package manager files': ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml'],
    'lockfiles': ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json', 'uv.lock'],
    'prose': ['README', 'CONTRIBUTING'],
    'task runners': ['Makefile', 'justfile'],
    'deploy surface': ['Dockerfile', 'docker-compose', 'Procfile'],
    'script folders': ['scripts/', 'bin/'],
    'team history': ['git shortlog'],
  };
  for (const [what, names] of Object.entries(sources)) {
    for (const name of names) assert.ok(s.includes(name), `${what}: the step reads ${name}`);
  }
});

test('it pre-fills what the repository answers and still asks what it cannot', () => {
  const s = step();
  for (const field of ['## Stack', 'greenfield', 'team-size']) {
    assert.ok(s.includes(field), `pre-fills ${field}`);
  }
  // Decisions, not facts: reading the code cannot answer these.
  for (const field of ['mode', 'cost-cap-usd-month', 'geo', 'approval-level']) {
    assert.ok(s.includes(field), `names ${field} as still asked`);
  }
  assert.match(s, /Ask only what the repository cannot answer/);
});

test('it is read-only, bounded, and treats repository text as data', () => {
  const s = step();
  assert.match(s, /read-only/i);
  assert.match(s, /never open `\.env\*`/i, 'does not read secrets to fill a field');
  assert.match(s, /no installs/i);
  assert.match(s, /data, not instructions/i, 'a README cannot give the agent orders');
});

test('it closes with what was set, why, and one command to verify, and never invents the command', () => {
  const s = step();
  assert.match(s, /what was set/i);
  assert.match(s, /the file (it|each field) came from|with its source/i, 'each field carries its source');
  assert.match(s, /one command/i, 'exactly one verify command');
  assert.match(s, /exactly as (it appears|written)/i, 'the command is quoted from the repository');
  assert.match(s, /rather than invent/i, 'no test command found is said, not papered over');
});

test('the questions and the closing summary defer to the step instead of repeating it', () => {
  const q = between(start, '### Step 2.5');
  assert.match(q, /Inspect first, ask second/, 'the mandatory batch shrinks to what the step left unanswered');
  const confirm = between(start, '## Step 6: Confirm');
  assert.match(confirm, /Inspect first, ask second/, 'the new-project confirmation closes with the summary');
  const after = between(start, '### After agent completes');
  assert.match(after, /Inspect first, ask second/, 'the audit path closes with the summary');
});

test('the existing routing and question limits are untouched', () => {
  // The step adds a read before the questions; it must not loosen the ones
  // that were already there.
  assert.match(start, /Do not run the new-project setup steps/);
  assert.match(start, /Never ask more than ONE question per turn/);
  assert.match(start, /ONE confirmation question/);
  assert.match(start, /Use the `AskUserQuestion` tool to ask them in \*\*one batch\*\*/);
});
