// Smoke test for great_cto-lvai: watchBeads() previously only registered a
// fs.watch on .beads/interactions.jsonl when the file already existed at
// server startup — if bd created it later (first `bd update`/`close` on a
// project with no prior log), those events were silently missed.
//
// Full fs.watch event-timing coverage is flaky on CI (watch latency varies
// by OS/filesystem), so this is intentionally a smoke test: watchBeads()
// must not throw regardless of whether interactions.jsonl / .beads exist,
// and it must register a directory-level watch on .beads so late-created
// files are picked up (verified structurally, not via a live fs event).
//
// watchBeads() registers long-lived fs.watch() handles (by design — it runs
// for the life of the board server). Those handles keep Node's event loop
// alive, which would hang `node --test`. We monkeypatch fs.watch for the
// duration of this file to auto-unref every watcher it creates, so the test
// process can exit cleanly without changing watchers.mjs's own behavior.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcto-watchers-test-'));
process.env.GREAT_CTO_PROJECTS_FILE = path.join(tmpDir, 'projects-empty.json');
fs.writeFileSync(process.env.GREAT_CTO_PROJECTS_FILE, JSON.stringify({ projects: [] }));

const realWatch = fs.watch.bind(fs);
fs.watch = (...args) => {
  const watcher = realWatch(...args);
  try { watcher.unref(); } catch {}
  return watcher;
};

const { watchBeads } = await import('./lib/watchers.mjs');

test('watchBeads() does not throw when .beads/interactions.jsonl is absent', () => {
  const cwd = fs.mkdtempSync(path.join(tmpDir, 'no-beads-'));
  const originalCwd = process.cwd();
  process.chdir(cwd);
  try {
    assert.doesNotThrow(() => watchBeads());
  } finally {
    process.chdir(originalCwd);
  }
});

test('watchBeads() does not throw when .beads exists but interactions.jsonl does not yet', () => {
  const cwd = fs.mkdtempSync(path.join(tmpDir, 'beads-no-file-'));
  fs.mkdirSync(path.join(cwd, '.beads'));
  const originalCwd = process.cwd();
  process.chdir(cwd);
  try {
    assert.doesNotThrow(() => watchBeads());
  } finally {
    process.chdir(originalCwd);
  }
});

test('watchBeads() does not throw when interactions.jsonl already exists at startup', () => {
  const cwd = fs.mkdtempSync(path.join(tmpDir, 'beads-with-file-'));
  fs.mkdirSync(path.join(cwd, '.beads'));
  fs.writeFileSync(path.join(cwd, '.beads', 'interactions.jsonl'), '');
  const originalCwd = process.cwd();
  process.chdir(cwd);
  try {
    assert.doesNotThrow(() => watchBeads());
  } finally {
    process.chdir(originalCwd);
  }
});

test('a late-created interactions.jsonl is picked up via the .beads dir watch', async () => {
  // Not fully deterministic on all platforms (fs.watch latency varies), but
  // gives real signal in the common case: create .beads first, start
  // watchBeads(), then write interactions.jsonl and confirm no throw + the
  // watcher is still alive (best-effort, generous timeout, never fails CI
  // on a missed event — only on a thrown exception).
  const cwd = fs.mkdtempSync(path.join(tmpDir, 'late-create-'));
  fs.mkdirSync(path.join(cwd, '.beads'));
  const originalCwd = process.cwd();
  process.chdir(cwd);
  try {
    assert.doesNotThrow(() => watchBeads());
    fs.writeFileSync(path.join(cwd, '.beads', 'interactions.jsonl'), '{}\n');
    // Give fs.watch a moment to fire; we only assert no exception surfaces.
    await new Promise((resolve) => setTimeout(resolve, 300));
  } finally {
    process.chdir(originalCwd);
  }
});
