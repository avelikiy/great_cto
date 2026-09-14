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
