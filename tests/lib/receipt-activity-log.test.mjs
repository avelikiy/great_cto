// A receipt is "the tree a reviewer saw". The agent events log is not part of it.
//
// ADR-021 phase 1 made the hooks append to .great_cto/events.jsonl while agents
// work. `great-cto init` does not gitignore .great_cto/, and a receipt hashes every
// untracked, non-ignored file — so in a default project one appended event changed
// the receipt. Measured on 2026-09-14: dirty hash moved and `.great_cto/events.jsonl`
// appeared in the file list. A gate raised before an agent's next tool call then
// read as "reviewed files changed after approval", and the controlled Codex host
// would block every stage on "working tree changed during verification" the moment
// it recorded events too.
//
// The log is an activity record written by the tooling, not content anyone reviews.
// Excluded whether untracked or committed, rotation included. Everything else in
// the same tree still counts — the exclusion must not become a place to hide work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { treeReceipt } from '../../scripts/lib/receipt.mjs';
import { appendEvent } from '../../scripts/lib/agent-events.mjs';

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'gcto-receipt-log-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(root, 'app.js'), 'export const x = 1;\n');
  git('add', '.'); git('commit', '-q', '-m', 'init');
  mkdirSync(join(root, '.great_cto'));
  return { root, git, events: join(root, '.great_cto') };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

test('an untracked events log does not change the receipt, nor appear in it', (t) => {
  const { root, events } = repo(t);
  appendEvent(events, { kind: 'agent-start', agent: 'senior-dev' }, { env: {} });
  const before = treeReceipt(root);
  appendEvent(events, { kind: 'tool', tool: 'Edit', ok: true }, { env: {} });
  const after = treeReceipt(root);
  assert.ok(same(before, after), 'appending an event is not a change to the reviewed tree');
  assert.ok(!Object.keys(after.files).some((p) => p.includes('events')), 'and the log is not listed as a changed file');
  assert.equal(after.dirty, null, 'a tree whose only difference is the log is clean');
});

test('a committed events log is excluded too, and so is its rotated generation', (t) => {
  const { root, git, events } = repo(t);
  appendEvent(events, { kind: 'stop' }, { env: {} });
  git('add', '-f', '.great_cto/events.jsonl'); git('commit', '-q', '-m', 'someone committed the log');
  const before = treeReceipt(root);
  for (let i = 0; i < 20; i++) appendEvent(events, { kind: 'tool', tool: `T${i}`, paths: [`src/file-${i}.mjs`] }, { env: {}, maxBytes: 600 });
  const after = treeReceipt(root);
  assert.ok(same(before, after), 'a tracked log that grew and rotated is still not reviewed content');
});

test('real work beside the log still changes the receipt', (t) => {
  const { root, events } = repo(t);
  const before = treeReceipt(root);
  appendEvent(events, { kind: 'tool', tool: 'Edit', ok: true }, { env: {} });
  writeFileSync(join(root, 'app.js'), 'export const x = 2;\n');
  const edited = treeReceipt(root);
  assert.ok(!same(before, edited), 'an edited tracked file is a change');
  assert.ok('app.js' in edited.files);
  writeFileSync(join(root, '.great_cto', 'notes.md'), 'a reviewed artifact\n');
  const withArtifact = treeReceipt(root);
  assert.ok(!same(edited, withArtifact), 'other files under .great_cto/ still count — only the log is excluded');
  assert.ok('.great_cto/notes.md' in withArtifact.files);
});

// ADR-024: a gate approval token binds to the project tree outside .great_cto/.
// An approval writes the pipeline's own files there (the gate row, the decision log,
// the wake record, the token store); bound to the whole tree, the first approval
// would make every other open gate read "tree changed". So a caller can exclude
// directories — on top of the activity logs, never instead of them — and a caller
// that does not ask gets exactly the receipt it got before.

test('exclude drops a directory from the receipt, and only when asked', (t) => {
  const { root, events } = repo(t);
  const before = { all: treeReceipt(root), outside: treeReceipt(root, { exclude: ['.great_cto'] }) };
  writeFileSync(join(root, '.great_cto', 'decisions.md'), '| APPROVED | g-1 |\n');
  writeFileSync(join(root, '.great_cto', 'gate-tokens.json'), '{}\n');
  const after = { all: treeReceipt(root), outside: treeReceipt(root, { exclude: ['.great_cto'] }) };
  assert.ok(same(before.outside, after.outside), 'files under an excluded directory do not move the receipt');
  assert.ok(!same(before.all, after.all), 'without exclude, the same files still count — the default is unchanged');
  assert.ok(!Object.keys(after.outside.files).some((p) => p.startsWith('.great_cto/')));
});

test('exclude never hides work outside what it names', (t) => {
  const { root } = repo(t);
  const before = treeReceipt(root, { exclude: ['.great_cto'] });
  writeFileSync(join(root, 'app.js'), 'export const x = 9;\n');
  const after = treeReceipt(root, { exclude: ['.great_cto'] });
  assert.ok(!same(before, after), 'a code change still changes the receipt');
  assert.ok('app.js' in after.files);
});

test('exclude adds to the activity-log exclusion rather than replacing it', (t) => {
  const { root, events } = repo(t);
  const before = treeReceipt(root, { exclude: ['docs'] });
  appendEvent(events, { kind: 'tool', tool: 'Edit', ok: true }, { env: {} });
  const after = treeReceipt(root, { exclude: ['docs'] });
  assert.ok(same(before, after), 'the events log stays excluded when a caller excludes something else');
});

// ── the beads interactions log (great_cto-4b9l) ────────────────────────────
//
// Same class as the events log, found through ADR-024. Current `bd init` writes a
// .beads/.gitignore that no longer lists interactions.jsonl, so in a fresh project
// the file is tracked — measured 2026-09-15: one `bd update` modified it and the
// receipt listed `.beads/interactions.jsonl` as a changed file. Every bd command an
// agent or the board runs would read as "reviewed files changed". Only that log is
// excluded: .beads/config.yaml and the hooks are configuration, and still count.

test('the beads interactions log does not move a receipt, tracked or not', (t) => {
  const { root, git } = repo(t);
  mkdirSync(join(root, '.beads'));
  const log = join(root, '.beads', 'interactions.jsonl');
  writeFileSync(log, '{"kind":"create","id":"x-1"}\n');
  const untrackedBefore = treeReceipt(root);
  writeFileSync(log, '{"kind":"create","id":"x-1"}\n{"kind":"update","id":"x-1"}\n');
  assert.ok(same(untrackedBefore, treeReceipt(root)), 'an untracked interactions log grew; nothing reviewed changed');

  git('add', '-f', '.beads/interactions.jsonl'); git('commit', '-q', '-m', 'bd init tracked the log');
  const trackedBefore = treeReceipt(root);
  writeFileSync(log, '{"kind":"create","id":"x-1"}\n{"kind":"update","id":"x-1"}\n{"kind":"close","id":"x-1"}\n');
  const trackedAfter = treeReceipt(root);
  assert.ok(same(trackedBefore, trackedAfter), 'a committed interactions log grew; nothing reviewed changed');
  assert.ok(!('.beads/interactions.jsonl' in trackedAfter.files), 'and it is not listed as a changed file');
});

test('beads configuration still counts — only the interactions log is excluded', (t) => {
  const { root, git } = repo(t);
  mkdirSync(join(root, '.beads'));
  writeFileSync(join(root, '.beads', 'config.yaml'), 'issue-prefix: x\n');
  git('add', '.beads/config.yaml'); git('commit', '-q', '-m', 'config');
  const before = treeReceipt(root);
  writeFileSync(join(root, '.beads', 'config.yaml'), 'issue-prefix: y\n');
  const after = treeReceipt(root);
  assert.ok(!same(before, after), 'a changed beads config is a change');
  assert.ok('.beads/config.yaml' in after.files);
});
